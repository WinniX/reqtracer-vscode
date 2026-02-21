import * as vscode from "vscode";
import { DataCache } from "./data-cache.js";
import type { StalenessState } from "../watchers/workspace-watcher.js";

export class StalenessDiagnosticsProvider {
  private diagnosticCollection: vscode.DiagnosticCollection;
  private disposables: vscode.Disposable[] = [];
  private stalenessState: StalenessState;

  constructor(stalenessState: StalenessState) {
    this.stalenessState = stalenessState;
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection("reqtracer-staleness");

    this.disposables.push(
      DataCache.getInstance().onDataChanged(() => this.updateDiagnostics()),
    );

    this.disposables.push(
      stalenessState.onStalenessChanged(() => this.updateDiagnostics()),
    );

    this.updateDiagnostics();
  }

  private updateDiagnostics(): void {
    this.diagnosticCollection.clear();

    if (this.stalenessState.staleFiles.size === 0) return;

    const cache = DataCache.getInstance();
    const diagnosticMap = new Map<string, vscode.Diagnostic[]>();

    for (const staleFile of this.stalenessState.staleFiles) {
      const mappings = cache.getMappingsForFile(staleFile);
      const reqIds = [...new Set(mappings.map((m) => m.requirementId))];

      if (reqIds.length > 0) {
        // Add diagnostic for the stale source file
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
          const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, staleFile).toString();
          const diagnostic = new vscode.Diagnostic(
            new vscode.Range(0, 0, 0, 0),
            `File has changed since last mapping. Affected requirements: ${reqIds.join(", ")}. Run /reqtracer.remap to update.`,
            vscode.DiagnosticSeverity.Warning,
          );
          diagnostic.source = "ReqTracer";

          if (!diagnosticMap.has(fileUri)) {
            diagnosticMap.set(fileUri, []);
          }
          diagnosticMap.get(fileUri)!.push(diagnostic);
        }
      }
    }

    for (const [uriStr, diagnostics] of diagnosticMap) {
      this.diagnosticCollection.set(vscode.Uri.parse(uriStr), diagnostics);
    }
  }

  dispose(): void {
    this.diagnosticCollection.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
