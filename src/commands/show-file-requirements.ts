import * as vscode from "vscode";
import { DataCache } from "../providers/data-cache.js";
import * as path from "path";

export function registerShowFileRequirementsCommand(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand(
    "reqtracer.showFileRequirements",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage("ReqTracer: No active editor.");
        return;
      }

      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) return;

      const relativePath = path.relative(workspaceFolder.uri.fsPath, editor.document.uri.fsPath);
      const cache = DataCache.getInstance();
      const reqIds = cache.getRequirementIdsForFile(relativePath);

      if (reqIds.length === 0) {
        vscode.window.showInformationMessage(
          `ReqTracer: No requirements mapped to ${relativePath}`,
        );
        return;
      }

      const items = reqIds.map((id) => {
        const req = cache.getRequirementById(id);
        return {
          label: id,
          description: req?.title ?? "",
          detail: req?.fullText?.substring(0, 200) ?? "",
          reqId: id,
        };
      });

      const selected = await vscode.window.showQuickPick(items, {
        title: `Requirements for ${relativePath}`,
        placeHolder: "Select a requirement to see its mappings",
        matchOnDescription: true,
      });

      if (selected) {
        await vscode.commands.executeCommand("reqtracer.showRequirement", selected.reqId);
      }
    },
  );

  context.subscriptions.push(disposable);
}
