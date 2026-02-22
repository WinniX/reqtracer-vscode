import { readFile, writeFile, mkdir, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import type { ProjectConfig } from "../models/types.js";
import { validateProjectConfig } from "../models/validation.js";

const REQTRACER_DIR = ".reqtracer";
const CONFIG_FILE = "config.json";

/**
 * Ensure the .reqtracer/ directory exists.
 * Returns the absolute path to the directory.
 */
export async function ensureReqtracerDir(projectRoot: string): Promise<string> {
  const dir = join(projectRoot, REQTRACER_DIR);
  await mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Get the absolute path to config.json for a project.
 */
export function getConfigPath(projectRoot: string): string {
  return join(projectRoot, REQTRACER_DIR, CONFIG_FILE);
}

/**
 * Atomically write JSON content to a file.
 * Writes to a sibling temp file then renames to prevent corruption.
 */
export async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  const content = JSON.stringify(data, null, 2) + "\n";
  const suffix = randomBytes(6).toString("hex");
  const tempPath = `${filePath}.${suffix}.tmp`;
  try {
    await writeFile(tempPath, content, "utf-8");
    await rename(tempPath, filePath);
  } catch (err) {
    try { await unlink(tempPath); } catch { /* ignore cleanup failure */ }
    throw new Error(`Failed to write ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Load config.json. Returns null if the file doesn't exist.
 * Throws a descriptive error if the file exists but contains malformed JSON.
 */
export async function loadConfig(
  projectRoot: string,
): Promise<ProjectConfig | null> {
  const configPath = getConfigPath(projectRoot);
  let raw: string;
  try {
    raw = await readFile(configPath, "utf-8");
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return null;
    }
    throw err;
  }

  try {
    const parsed = JSON.parse(raw) as ProjectConfig;
    const validation = validateProjectConfig(parsed);
    if (!validation.valid) {
      throw new Error(
        `Invalid config at ${configPath}: ${validation.errors.map((e) => `${e.field}: ${e.message}`).join("; ")}`,
      );
    }
    return parsed;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Invalid config at")) {
      throw err;
    }
    throw new Error(
      `Malformed config at ${configPath}: file exists but contains invalid JSON`,
    );
  }
}

/**
 * Create a new config.json. Creates the .reqtracer/ directory if needed.
 * Uses an atomic write (temp file + rename) to prevent corruption.
 */
export async function createConfig(
  projectRoot: string,
  config: ProjectConfig,
): Promise<void> {
  const validation = validateProjectConfig(config);
  if (!validation.valid) {
    throw new Error(
      `Invalid config: ${validation.errors.map((e) => `${e.field}: ${e.message}`).join("; ")}`,
    );
  }
  await ensureReqtracerDir(projectRoot);
  const configPath = getConfigPath(projectRoot);
  await atomicWriteJson(configPath, config);
}

/**
 * Update an existing config.json with partial fields.
 * Loads the existing config, shallow-merges the updates, and writes back atomically.
 * Throws if the config doesn't exist yet.
 */
export async function updateConfig(
  projectRoot: string,
  updates: Partial<ProjectConfig>,
): Promise<ProjectConfig> {
  const existing = await loadConfig(projectRoot);
  if (existing === null) {
    throw new Error(
      `Cannot update config: no config.json found at ${getConfigPath(projectRoot)}. Use createConfig first.`,
    );
  }

  const merged: ProjectConfig = { ...existing, ...updates };
  const configPath = getConfigPath(projectRoot);
  await atomicWriteJson(configPath, merged);
  return merged;
}
