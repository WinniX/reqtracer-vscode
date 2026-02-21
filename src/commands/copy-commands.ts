import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import type { AiTool } from "@reqtracer/core";

const COMMAND_FILES = [
  "reqtracer.init.md",
  "reqtracer.identify.md",
  "reqtracer.map.md",
  "reqtracer.check.md",
  "reqtracer.remap.md",
];

export function registerCopyCommandsCommand(context: vscode.ExtensionContext): void {
  // This is an internal command, not exposed in command palette
  // Called by the initialize command
}

/**
 * Copy slash command skill files to the user's project.
 */
export async function copyCommandFiles(
  context: vscode.ExtensionContext,
  projectRoot: string,
  aiTool: AiTool,
): Promise<void> {
  // Determine source and destination directories
  const sourceSubdir = aiTool === "opencode" ? "opencode" : "claude-code";
  const destDir = aiTool === "opencode"
    ? path.join(projectRoot, ".opencode", "commands")
    : path.join(projectRoot, ".claude", "commands");

  // Look for bundled command templates
  // When bundled with esbuild, templates are in dist/commands/
  const extensionPath = context.extensionPath;
  const templatesDir = path.join(extensionPath, "dist", "commands", sourceSubdir);

  // Fallback: look relative to extension source
  const fallbackDir = path.join(extensionPath, "commands", sourceSubdir);

  const sourceDir = fs.existsSync(templatesDir) ? templatesDir : fallbackDir;

  if (!fs.existsSync(sourceDir)) {
    vscode.window.showWarningMessage(
      `ReqTracer: Command templates not found at ${templatesDir}. Slash commands not copied.`,
    );
    return;
  }

  // Create destination directory
  fs.mkdirSync(destDir, { recursive: true });

  // Copy each command file
  let copiedCount = 0;
  for (const file of COMMAND_FILES) {
    const srcFile = path.join(sourceDir, file);
    const destFile = path.join(destDir, file);

    if (fs.existsSync(srcFile)) {
      fs.copyFileSync(srcFile, destFile);
      copiedCount++;
    }
  }

  if (copiedCount > 0) {
    const toolLabel = aiTool === "opencode" ? "OpenCode" : "Claude Code";
    vscode.window.showInformationMessage(
      `ReqTracer: Copied ${copiedCount} slash commands for ${toolLabel} to ${path.relative(projectRoot, destDir)}/`,
    );
  }
}
