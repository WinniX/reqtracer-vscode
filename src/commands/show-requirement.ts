import * as vscode from "vscode";
import { DataCache } from "../providers/data-cache.js";
import { resolveSymbolLocation } from "../symbol-resolver/symbol-resolver.js";
import type { TraceLink } from "@reqtracer/core";

export function registerShowRequirementCommand(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand(
    "reqtracer.showRequirement",
    async (requirementId?: string) => {
      if (!requirementId) {
        // Prompt for requirement ID
        requirementId = await vscode.window.showInputBox({
          prompt: "Enter requirement ID (e.g., REQ-auth-001)",
          placeHolder: "REQ-xxx-000",
        });
        if (!requirementId) return;
      }

      const cache = DataCache.getInstance();
      const mappings = cache.getMappingsForRequirement(requirementId);
      const requirement = cache.getRequirementById(requirementId);

      if (mappings.length === 0) {
        vscode.window.showInformationMessage(`No mappings found for ${requirementId}`);
        return;
      }

      // Build QuickPick items
      const items: Array<vscode.QuickPickItem & { mapping: TraceLink }> = mappings.map((m) => {
        const icon = m.type === "code" ? "$(symbol-function)" : "$(beaker)";
        const target = m.target;
        const label = "symbolName" in target
          ? `${icon} ${target.symbolName}`
          : `${icon} ${(target as { testName: string }).testName}`;
        const description = target.filePath;
        const detail = m.reasoning;

        return { label, description, detail, mapping: m };
      });

      const title = requirement
        ? `${requirementId}: ${requirement.title}`
        : requirementId;

      const selected = await vscode.window.showQuickPick(items, {
        title,
        placeHolder: "Select a location to navigate to",
        matchOnDescription: true,
        matchOnDetail: true,
      });

      if (!selected) return;

      // Navigate to the selected location
      const target = selected.mapping.target;
      const symbolName = "symbolName" in target ? target.symbolName : (target as { testName: string }).testName;
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) return;

      const absolutePath = vscode.Uri.joinPath(workspaceFolder.uri, target.filePath).fsPath;
      const resolved = await resolveSymbolLocation(absolutePath, symbolName);

      if (resolved) {
        const doc = await vscode.workspace.openTextDocument(resolved.uri);
        await vscode.window.showTextDocument(doc, {
          selection: resolved.range,
        });
      } else {
        // Fallback: just open the file
        const doc = await vscode.workspace.openTextDocument(
          vscode.Uri.file(absolutePath),
        );
        await vscode.window.showTextDocument(doc);
      }
    },
  );

  context.subscriptions.push(disposable);
}
