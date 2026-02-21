import * as vscode from "vscode";
import { hashFile } from "@reqtracer/core";
import { DataCache } from "../providers/data-cache.js";
import * as path from "path";

export interface StalenessState {
  staleFiles: Set<string>;
  readonly onStalenessChanged: vscode.Event<void>;
  dispose(): void;
}

/**
 * Watch workspace files for saves and track staleness state.
 */
export function createWorkspaceWatcher(context: vscode.ExtensionContext): StalenessState {
  const staleFiles = new Set<string>();
  const _onStalenessChanged = new vscode.EventEmitter<void>();

  const disposable = vscode.workspace.onDidSaveTextDocument(async (document) => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return;

    const relativePath = path.relative(workspaceFolder.uri.fsPath, document.uri.fsPath);
    const cache = DataCache.getInstance();
    const mappings = cache.getMappingsForFile(relativePath);

    // Only care about files that have mappings
    if (mappings.length === 0) return;

    // File was saved and has mappings — mark as potentially stale
    // The actual hash comparison happens in the decoration provider
    staleFiles.add(relativePath);
    _onStalenessChanged.fire();
  });

  context.subscriptions.push(disposable);

  return {
    staleFiles,
    onStalenessChanged: _onStalenessChanged.event,
    dispose: () => {
      _onStalenessChanged.dispose();
    },
  };
}
