import * as vscode from "vscode";
import { DataCache } from "./data-cache.js";

export class RequirementHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Hover | undefined {
    if (!document.fileName.endsWith(".md")) return undefined;

    const cache = DataCache.getInstance();
    const relativePath = vscode.workspace.asRelativePath(document.uri);
    const requirements = cache.getRequirementsForSourceFile(relativePath);

    if (requirements.length === 0) return undefined;

    for (const req of requirements) {
      // sourceLineStart is 1-based, VS Code positions are 0-based
      const startLine = Math.max(0, req.sourceLineStart - 1);

      if (position.line !== startLine) continue;

      const mappings = cache.getMappingsForRequirement(req.id);
      const codeCount = mappings.filter((m) => m.type === "code").length;
      const testCount = mappings.filter((m) => m.type === "test").length;

      const mappingSummary =
        codeCount === 0 && testCount === 0
          ? "no mappings"
          : `${codeCount} code, ${testCount} test`;

      const commandUri = `command:reqtracer.showRequirement?${encodeURIComponent(JSON.stringify(req.id))}`;
      const contents = new vscode.MarkdownString(
        `**${req.id}**: ${req.title}\n\n` +
          `Mappings: ${mappingSummary}\n\n` +
          `[Show mappings](${commandUri})`,
      );
      contents.isTrusted = true;

      const lineText = document.lineAt(startLine).text;
      const range = new vscode.Range(startLine, 0, startLine, lineText.length);

      return new vscode.Hover(contents, range);
    }

    return undefined;
  }
}
