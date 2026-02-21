import * as vscode from "vscode";
import { DataCache } from "./data-cache.js";
import type { StalenessState } from "../watchers/workspace-watcher.js";

const staleDecorationType = vscode.window.createTextEditorDecorationType({
  gutterIconPath: new vscode.ThemeIcon("warning").id,
  after: {
    contentText: " (stale mapping)",
    color: new vscode.ThemeColor("editorWarning.foreground"),
    fontStyle: "italic",
  },
  backgroundColor: new vscode.ThemeColor("editorWarning.background"),
  isWholeLine: false,
});

const staleFileDecorationType = vscode.window.createTextEditorDecorationType({
  gutterIconPath: new vscode.ThemeIcon("warning").id,
  overviewRulerColor: new vscode.ThemeColor("editorWarning.foreground"),
  overviewRulerLane: vscode.OverviewRulerLane.Right,
});

export class StalenessDecorationProvider {
  private disposables: vscode.Disposable[] = [];
  private stalenessState: StalenessState;

  constructor(stalenessState: StalenessState) {
    this.stalenessState = stalenessState;

    // Update decorations when editor changes
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => this.updateDecorations()),
    );

    // Update when data changes
    this.disposables.push(
      DataCache.getInstance().onDataChanged(() => this.updateDecorations()),
    );

    // Update when staleness changes
    this.disposables.push(
      stalenessState.onStalenessChanged(() => this.updateDecorations()),
    );

    // Initial update
    this.updateDecorations();
  }

  private updateDecorations(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const document = editor.document;

    if (document.fileName.endsWith(".md")) {
      this.updateMarkdownDecorations(editor);
    } else {
      this.updateSourceFileDecorations(editor);
    }
  }

  private updateMarkdownDecorations(editor: vscode.TextEditor): void {
    const decorations: vscode.DecorationOptions[] = [];
    const document = editor.document;
    const cache = DataCache.getInstance();
    const relativePath = vscode.workspace.asRelativePath(document.uri);
    const requirements = cache.getRequirementsForSourceFile(relativePath);

    for (const req of requirements) {
      const mappings = cache.getMappingsForRequirement(req.id);

      // Check if any mapped file is stale
      const hasStaleMapping = mappings.some((m) =>
        this.stalenessState.staleFiles.has(m.target.filePath),
      );

      if (hasStaleMapping) {
        // sourceLineStart is 1-based, VS Code ranges are 0-based
        const line = Math.max(0, req.sourceLineStart - 1);
        const lineText = document.lineAt(line).text;
        const range = new vscode.Range(line, 0, line, lineText.length);
        decorations.push({ range });
      }
    }

    editor.setDecorations(staleDecorationType, decorations);
  }

  private updateSourceFileDecorations(editor: vscode.TextEditor): void {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return;

    const relativePath = vscode.workspace.asRelativePath(editor.document.uri);

    if (this.stalenessState.staleFiles.has(relativePath)) {
      // Mark first line to indicate file has stale mappings
      const range = new vscode.Range(0, 0, 0, 0);
      editor.setDecorations(staleFileDecorationType, [{ range }]);
    } else {
      editor.setDecorations(staleFileDecorationType, []);
    }
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    staleDecorationType.dispose();
    staleFileDecorationType.dispose();
  }
}
