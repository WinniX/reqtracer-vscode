import * as vscode from "vscode";

// Phase 6: Initialize
import { registerInitializeCommand } from "./commands/initialize.js";

// Phase 7: Navigation
import { DataCache } from "./providers/data-cache.js";
import { RequirementCodeLensProvider } from "./providers/requirement-codelens.js";
import { RequirementHoverProvider } from "./providers/requirement-links.js";
import { registerShowRequirementCommand } from "./commands/show-requirement.js";
import { registerShowFileRequirementsCommand } from "./commands/show-file-requirements.js";

// Phase 8: Staleness
import { createReqtracerWatcher } from "./watchers/reqtracer-watcher.js";
import { createWorkspaceWatcher } from "./watchers/workspace-watcher.js";
import { StalenessDecorationProvider } from "./providers/staleness-decorations.js";
import { StalenessDiagnosticsProvider } from "./providers/staleness-diagnostics.js";

// Phase 9: Visualization
import { registerVisualizeCommand } from "./commands/visualize.js";

export function activate(context: vscode.ExtensionContext): void {
  console.log("ReqTracer extension activated");

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  // Phase 6: Initialize command (T027, T029, T030)
  registerInitializeCommand(context);

  // Phase 7: Navigation (T032-T038)
  if (workspaceFolder) {
    // Initialize data cache
    const dataCache = DataCache.getInstance();
    dataCache.initialize(workspaceFolder.uri.fsPath);
    context.subscriptions.push({ dispose: () => dataCache.dispose() });

    // CodeLens provider for requirement IDs in .md files
    const codeLensProvider = new RequirementCodeLensProvider();
    context.subscriptions.push(
      vscode.languages.registerCodeLensProvider(
        { language: "markdown", scheme: "file" },
        codeLensProvider,
      ),
    );

    // HoverProvider for requirement details on hover in .md files
    const hoverProvider = new RequirementHoverProvider();
    context.subscriptions.push(
      vscode.languages.registerHoverProvider(
        { language: "markdown", scheme: "file" },
        hoverProvider,
      ),
    );

    // Navigation commands
    registerShowRequirementCommand(context);
    registerShowFileRequirementsCommand(context);

    // Phase 8: Staleness visualization (T039-T043)
    createReqtracerWatcher(context);
    const stalenessState = createWorkspaceWatcher(context);

    const stalenessDecorations = new StalenessDecorationProvider(stalenessState);
    context.subscriptions.push({ dispose: () => stalenessDecorations.dispose() });

    const stalenessDiagnostics = new StalenessDiagnosticsProvider(stalenessState);
    context.subscriptions.push({ dispose: () => stalenessDiagnostics.dispose() });

    // Phase 9: Visualization (Neo4j graph)
    registerVisualizeCommand(context);
  }
}

export function deactivate(): void {
  console.log("ReqTracer extension deactivated");
}
