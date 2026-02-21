import * as vscode from "vscode";
import { DataCache } from "./data-cache.js";

export class RequirementCodeLensProvider implements vscode.CodeLensProvider {
  private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  constructor() {
    const cache = DataCache.getInstance();
    cache.onDataChanged(() => this._onDidChangeCodeLenses.fire());
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!document.fileName.endsWith(".md")) return [];

    const cache = DataCache.getInstance();
    const relativePath = vscode.workspace.asRelativePath(document.uri);
    const allRequirements = cache.getRequirements();
    const requirements = cache.getRequirementsForSourceFile(relativePath);

    console.log(`ReqTracer CodeLens: file="${relativePath}", totalReqs=${allRequirements.length}, matchedReqs=${requirements.length}`);
    if (allRequirements.length > 0 && requirements.length === 0) {
      const sampleSourceFiles = [...new Set(allRequirements.slice(0, 5).map((r) => r.sourceFile))];
      console.log(`ReqTracer CodeLens: no match. Sample sourceFile values: ${sampleSourceFiles.join(", ")}`);
    }

    if (requirements.length === 0) return [];

    const codeLenses: vscode.CodeLens[] = [];

    for (const req of requirements) {
      // sourceLineStart is 1-based in requirements.json, VS Code ranges are 0-based
      const line = Math.max(0, req.sourceLineStart - 1);
      const range = new vscode.Range(line, 0, line, 0);

      const mappings = cache.getMappingsForRequirement(req.id);
      const codeCount = mappings.filter((m) => m.type === "code").length;
      const testCount = mappings.filter((m) => m.type === "test").length;

      let title: string;
      if (mappings.length === 0) {
        title = `${req.id}: no mappings`;
      } else {
        const parts: string[] = [];
        if (codeCount > 0) parts.push(`${codeCount} code`);
        if (testCount > 0) parts.push(`${testCount} test`);
        title = `${req.id}: ${parts.join(", ")}`;
      }

      codeLenses.push(
        new vscode.CodeLens(range, {
          title,
          command: "reqtracer.showRequirement",
          arguments: [req.id],
        }),
      );
    }

    return codeLenses;
  }
}
