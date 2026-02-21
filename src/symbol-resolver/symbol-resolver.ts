import * as vscode from "vscode";

export interface ResolvedLocation {
  uri: vscode.Uri;
  range: vscode.Range;
}

/**
 * Resolve a symbol name to a location in a file.
 * Uses a tiered strategy:
 * 1. Workspace symbol provider (language server)
 * 2. Document symbol provider (for known file)
 * 3. Regex fallback
 */
export async function resolveSymbolLocation(
  filePath: string,
  symbolName: string,
): Promise<ResolvedLocation | null> {
  const uri = vscode.Uri.file(filePath);

  // Tier 1: Try workspace symbol provider
  try {
    const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
      "vscode.executeWorkspaceSymbolProvider",
      symbolName,
    );
    if (symbols && symbols.length > 0) {
      const match = symbols.find(
        (s) => s.name === symbolName && s.location.uri.fsPath === filePath,
      );
      if (match) {
        return { uri: match.location.uri, range: match.location.range };
      }
    }
  } catch {
    // Tier 1 failed, try next
  }

  // Tier 2: Try document symbol provider
  try {
    const docSymbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      "vscode.executeDocumentSymbolProvider",
      uri,
    );
    if (docSymbols) {
      const found = findSymbolInTree(docSymbols, symbolName);
      if (found) {
        return { uri, range: found.range };
      }
    }
  } catch {
    // Tier 2 failed, try next
  }

  // Tier 3: Regex fallback
  try {
    const doc = await vscode.workspace.openTextDocument(uri);
    const text = doc.getText();
    // Search for common symbol declaration patterns
    const patterns = [
      new RegExp(`(?:function|const|let|var|class|interface|type|export)\\s+${escapeRegex(symbolName)}\\b`),
      new RegExp(`\\b${escapeRegex(symbolName)}\\s*[=(]`),
      new RegExp(`\\b${escapeRegex(symbolName)}\\b`),
    ];
    for (const pattern of patterns) {
      const match = pattern.exec(text);
      if (match) {
        const pos = doc.positionAt(match.index);
        const range = new vscode.Range(pos, pos);
        return { uri, range };
      }
    }
  } catch {
    // All tiers failed
  }

  return null;
}

function findSymbolInTree(
  symbols: vscode.DocumentSymbol[],
  name: string,
): vscode.DocumentSymbol | null {
  for (const sym of symbols) {
    if (sym.name === name) return sym;
    const found = findSymbolInTree(sym.children, name);
    if (found) return found;
  }
  return null;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
