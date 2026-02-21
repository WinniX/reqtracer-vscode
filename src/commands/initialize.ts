import * as vscode from "vscode";
import { createConfig, loadConfig } from "@reqtracer/core";
import type { ProjectConfig, AiTool } from "@reqtracer/core";
import { copyCommandFiles } from "./copy-commands.js";

export function registerInitializeCommand(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand("reqtracer.initialize", async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage("ReqTracer: No workspace folder open.");
      return;
    }

    const projectRoot = workspaceFolder.uri.fsPath;

    // Check if already initialized
    let existingConfig: Awaited<ReturnType<typeof loadConfig>> = null;
    try {
      existingConfig = await loadConfig(projectRoot);
    } catch {
      // Config file exists but is invalid — offer to reinitialize
    }
    if (existingConfig) {
      const overwrite = await vscode.window.showWarningMessage(
        "ReqTracer is already initialized in this project. Reinitialize?",
        "Yes",
        "No",
      );
      if (overwrite !== "Yes") {
        return;
      }
    }

    // Step 1: Select AI tool
    const aiToolPick = await vscode.window.showQuickPick(
      [
        { label: "OpenCode", description: "Use OpenCode slash commands", value: "opencode" as AiTool },
        { label: "Claude Code", description: "Use Claude Code slash commands", value: "claude-code" as AiTool },
      ],
      { placeHolder: "Select your AI coding tool" },
    );

    if (!aiToolPick) {
      return; // User cancelled
    }

    const aiTool = aiToolPick.value;

    // Step 2: Create minimal config (directories will be configured by /reqtracer.init)
    const config: ProjectConfig = {
      version: "1.0",
      specDirs: [],
      sourceDirs: [],
      testDirs: [],
      aiTool,
    };

    try {
      await createConfig(projectRoot, config);

      // Step 3: Copy slash command files (including /reqtracer.init)
      await copyCommandFiles(context, projectRoot, aiTool);

      const toolLabel = aiTool === "opencode" ? "OpenCode" : "Claude Code";
      vscode.window.showInformationMessage(
        `ReqTracer initialized! Run /reqtracer.init in ${toolLabel} to configure project directories.`,
      );
    } catch (err) {
      vscode.window.showErrorMessage(
        `ReqTracer: Failed to initialize: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });

  context.subscriptions.push(disposable);
}
