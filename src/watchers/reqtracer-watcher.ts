import * as vscode from "vscode";
import { DataCache } from "../providers/data-cache.js";

/**
 * Watch .reqtracer/ directory for changes to JSON data files.
 * Triggers data cache refresh when files change.
 */
export function createReqtracerWatcher(context: vscode.ExtensionContext): void {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) return;

  const pattern = new vscode.RelativePattern(workspaceFolder, ".reqtracer/*.json");
  const watcher = vscode.workspace.createFileSystemWatcher(pattern);

  const refresh = () => {
    DataCache.getInstance().refresh();
  };

  watcher.onDidChange(refresh);
  watcher.onDidCreate(refresh);
  watcher.onDidDelete(refresh);

  context.subscriptions.push(watcher);
}
