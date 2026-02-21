import * as vscode from "vscode";
import { execFile } from "child_process";
import { promisify } from "util";
import * as net from "net";
import * as http from "http";
import { loadRequirements, loadMappings } from "@reqtracer/core";
import { createDriver, importToNeo4j } from "@reqtracer/neo4j-import";

const execFileAsync = promisify(execFile);

const NEO4J_IMAGE = "neo4j:5-community";
const NEO4J_CONTAINER_NAME = "reqtracer-neo4j";
const NEO4J_VOLUME_NAME = "reqtracer-neo4j-data";
const NEO4J_HTTP_PORT = 7474;
const NEO4J_BOLT_PORT = 7687;
const NEO4J_HTTP_URL = `http://localhost:${NEO4J_HTTP_PORT}`;
const NEO4J_BOLT_URI = `bolt://localhost:${NEO4J_BOLT_PORT}`;
const NEO4J_USERNAME = "neo4j";
const NEO4J_PASSWORD = "reqtracer-dev";
const HEALTH_POLL_INTERVAL_MS = 3_000;
const HEALTH_TIMEOUT_MS = 90_000;

/** Build a Neo4j Browser URL with pre-filled connection details and an initial query. */
function buildBrowserUrl(): string {
  const dbms = encodeURIComponent(`bolt://${NEO4J_USERNAME}@localhost:${NEO4J_BOLT_PORT}`);
  const db = encodeURIComponent("neo4j");
  const cmd = "edit";
  const arg = encodeURIComponent("MATCH (n) RETURN n");
  return `${NEO4J_HTTP_URL}/browser?dbms=${dbms}&db=${db}&cmd=${cmd}&arg=${arg}`;
}

export function registerVisualizeCommand(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand("reqtracer.visualize", async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage("ReqTracer: No workspace folder open.");
      return;
    }

    const projectRoot = workspaceFolder.uri.fsPath;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "ReqTracer: Visualize",
        cancellable: true,
      },
      async (progress, token) => {
        try {
          // Step 1: Check Docker availability
          progress.report({ message: "Checking Docker availability..." });
          if (!(await isDockerAvailable())) {
            vscode.window.showErrorMessage(
              "ReqTracer: Docker is not installed or not running. " +
                "Install Docker Desktop from https://www.docker.com/products/docker-desktop/ and ensure it is running.",
            );
            return;
          }

          if (token.isCancellationRequested) return;

          // Step 2: Start Neo4j container via docker run
          progress.report({ message: "Starting Neo4j container..." });
          await startNeo4jContainer();

          if (token.isCancellationRequested) return;

          // Step 3: Wait for Neo4j to be healthy (both HTTP and Bolt)
          progress.report({ message: "Waiting for Neo4j to be ready..." });
          const healthy = await waitForNeo4jHealth(token);
          if (!healthy) {
            if (!token.isCancellationRequested) {
              vscode.window.showErrorMessage(
                "ReqTracer: Neo4j did not become ready within the timeout period. " +
                  `Check Docker logs with: docker logs ${NEO4J_CONTAINER_NAME}`,
              );
            }
            return;
          }

          if (token.isCancellationRequested) return;

          // Step 4: Import traceability data
          progress.report({ message: "Importing traceability data into Neo4j..." });
          try {
            await runNeo4jImport(projectRoot, (msg) => {
              progress.report({ message: msg });
            });
          } catch (importErr) {
            if (isAuthError(importErr)) {
              // The Neo4j volume has stale credentials — offer to reset
              const choice = await vscode.window.showWarningMessage(
                "ReqTracer: Neo4j authentication failed. " +
                  "The database volume likely has stale credentials. " +
                  "Reset the Neo4j volume and retry?",
                "Reset & Retry",
                "Cancel",
              );
              if (choice !== "Reset & Retry" || token.isCancellationRequested) return;

              progress.report({ message: "Resetting Neo4j volume..." });
              await resetNeo4jContainer();

              if (token.isCancellationRequested) return;

              progress.report({ message: "Waiting for Neo4j to be ready..." });
              const healthyAfterReset = await waitForNeo4jHealth(token);
              if (!healthyAfterReset) {
                if (!token.isCancellationRequested) {
                  vscode.window.showErrorMessage(
                    "ReqTracer: Neo4j did not become ready after reset. " +
                      `Check Docker logs with: docker logs ${NEO4J_CONTAINER_NAME}`,
                  );
                }
                return;
              }

              if (token.isCancellationRequested) return;

              progress.report({ message: "Importing traceability data into Neo4j..." });
              await runNeo4jImport(projectRoot, (msg) => {
                progress.report({ message: msg });
              });
            } else {
              throw importErr;
            }
          }

          // Step 5: Open Neo4j Browser with pre-filled connection details
          progress.report({ message: "Opening Neo4j Browser..." });
          const browserUrl = buildBrowserUrl();
          await vscode.env.openExternal(vscode.Uri.parse(browserUrl));

          vscode.window.showInformationMessage(
            "ReqTracer: Neo4j Browser opened. " +
              "Enter password \"reqtracer-dev\" and click Connect to explore the graph.",
          );
        } catch (err) {
          if (!token.isCancellationRequested) {
            vscode.window.showErrorMessage(
              `ReqTracer: Visualization failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      },
    );
  });

  context.subscriptions.push(disposable);
}

/**
 * Check if Docker CLI is available and the daemon is running.
 */
async function isDockerAvailable(): Promise<boolean> {
  try {
    await execFileAsync("docker", ["info"], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the current state of the reqtracer-neo4j container.
 * Returns "running", "exited", "paused", etc., or null if the container does not exist.
 */
async function getContainerState(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "docker",
      ["inspect", "--format", "{{.State.Status}}", NEO4J_CONTAINER_NAME],
      { timeout: 10_000 },
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Start the Neo4j container using `docker run`.
 * If the container already exists and is running, this is a no-op.
 * If it exists but is stopped, it is restarted.
 * If it does not exist, a new container is created with the correct configuration.
 */
async function startNeo4jContainer(): Promise<void> {
  const state = await getContainerState();

  if (state === "running") {
    // Already running — nothing to do
    return;
  }

  if (state !== null) {
    // Container exists but is not running (exited, paused, etc.) — start it
    await execFileAsync("docker", ["start", NEO4J_CONTAINER_NAME], {
      timeout: 30_000,
    });
    return;
  }

  // Container does not exist — create and start it via docker run
  await execFileAsync(
    "docker",
    [
      "run",
      "-d",
      "--name", NEO4J_CONTAINER_NAME,
      "-p", `${NEO4J_HTTP_PORT}:${NEO4J_HTTP_PORT}`,
      "-p", `${NEO4J_BOLT_PORT}:${NEO4J_BOLT_PORT}`,
      "-e", `NEO4J_AUTH=${NEO4J_USERNAME}/${NEO4J_PASSWORD}`,
      "-e", "NEO4J_PLUGINS=[\"apoc\"]",
      "-e", "NEO4J_server_memory_heap_initial__size=256m",
      "-e", "NEO4J_server_memory_heap_max__size=512m",
      "-v", `${NEO4J_VOLUME_NAME}:/data`,
      "--restart", "unless-stopped",
      NEO4J_IMAGE,
    ],
    { timeout: 60_000 },
  );
}

/**
 * Remove the Neo4j container and its data volume, then start a fresh container.
 * This resets authentication and all stored data.
 */
async function resetNeo4jContainer(): Promise<void> {
  // Force-remove the container (also removes anonymous volumes)
  try {
    await execFileAsync("docker", ["rm", "-fv", NEO4J_CONTAINER_NAME], {
      timeout: 30_000,
    });
  } catch {
    // Container may not exist — ignore
  }

  // Remove the named data volume
  try {
    await execFileAsync("docker", ["volume", "rm", NEO4J_VOLUME_NAME], {
      timeout: 30_000,
    });
  } catch {
    // Volume may not exist — ignore
  }

  // Start a fresh container
  await startNeo4jContainer();
}

/**
 * Poll Neo4j HTTP and Bolt endpoints until both respond, or until timeout/cancellation.
 */
async function waitForNeo4jHealth(
  token: vscode.CancellationToken,
): Promise<boolean> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (token.isCancellationRequested) return false;

    const [httpOk, boltOk] = await Promise.all([pingNeo4jHttp(), pingPort(NEO4J_BOLT_PORT)]);
    if (httpOk && boltOk) {
      return true;
    }

    await sleep(HEALTH_POLL_INTERVAL_MS);
  }

  return false;
}

/**
 * Single HTTP GET to Neo4j to check if the browser endpoint is up.
 */
function pingNeo4jHttp(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(NEO4J_HTTP_URL, { timeout: 3_000 }, (res: http.IncomingMessage) => {
      res.resume();
      resolve(res.statusCode !== undefined && res.statusCode < 500);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Check if a TCP port is accepting connections.
 */
function pingPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(3_000);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, "localhost");
  });
}

/**
 * Load traceability data and import it into Neo4j using the library API.
 */
async function runNeo4jImport(
  projectRoot: string,
  onProgress: (message: string) => void,
): Promise<void> {
  const requirements = await loadRequirements(projectRoot);
  if (!requirements) {
    throw new Error("No requirements.json found. Run /reqtracer.identify first.");
  }

  const mappings = await loadMappings(projectRoot);
  if (!mappings) {
    throw new Error("No mappings.json found. Run /reqtracer.map first.");
  }

  onProgress(
    `Importing ${requirements.requirements.length} requirements and ${mappings.mappings.length} mappings...`,
  );

  const driver = createDriver({
    uri: NEO4J_BOLT_URI,
    username: NEO4J_USERNAME,
    password: NEO4J_PASSWORD,
  });

  try {
    const result = await importToNeo4j(driver, requirements, mappings, onProgress);
    onProgress(
      `Import complete: ${result.requirementCount} requirements, ` +
        `${result.codeSymbolCount} code symbols, ${result.testSymbolCount} test symbols`,
    );
  } finally {
    await driver.close();
  }
}

/**
 * Detect Neo4j authentication errors from the driver.
 */
function isAuthError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes("unauthorized") || msg.includes("authentication failure");
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
