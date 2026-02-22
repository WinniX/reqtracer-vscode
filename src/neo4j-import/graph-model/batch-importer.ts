import neo4j, { type Driver, type Session } from "neo4j-driver";
import {
  CONSTRAINTS,
  MERGE_REQUIREMENTS,
  MERGE_CODE_SYMBOLS,
  MERGE_TEST_SYMBOLS,
  MERGE_IMPLEMENTS_EDGES,
  MERGE_VERIFIED_BY_EDGES,
} from "./cypher-queries.js";
import type { RequirementsFile, MappingsFile } from "../../core/index.js";

const BATCH_SIZE = 500;

export interface ImportResult {
  requirementCount: number;
  codeSymbolCount: number;
  testSymbolCount: number;
  implementsEdgeCount: number;
  verifiedByEdgeCount: number;
}

export interface ImportOptions {
  uri: string;
  username: string;
  password: string;
}

/**
 * Create a Neo4j driver connection.
 */
export function createDriver(options: ImportOptions): Driver {
  return neo4j.driver(options.uri, neo4j.auth.basic(options.username, options.password));
}

/**
 * Import traceability data into Neo4j.
 */
export async function importToNeo4j(
  driver: Driver,
  requirements: RequirementsFile,
  mappings: MappingsFile,
  onProgress?: (message: string) => void,
): Promise<ImportResult> {
  const session = driver.session();
  const report = (msg: string) => onProgress?.(msg);

  try {
    // Step 1: Create constraints
    report("Creating uniqueness constraints...");
    for (const constraint of CONSTRAINTS) {
      await session.executeWrite((tx) => tx.run(constraint));
    }

    // Step 2: Import Requirement nodes
    report(`Importing ${requirements.requirements.length} requirements...`);
    const reqItems = requirements.requirements.map((r) => ({
      id: r.id,
      title: r.title,
      sourceFile: r.sourceFile,
      fullText: r.fullText,
      category: r.category,
    }));
    await batchExecute(session, MERGE_REQUIREMENTS, reqItems);

    // Step 3: Extract and import CodeSymbol nodes
    const codeMappings = mappings.mappings.filter((m) => m.type === "code");
    const codeSymbols = codeMappings.map((m) => {
      const target = m.target as { filePath: string; symbolName: string; symbolType: string };
      return {
        filePath: target.filePath,
        symbolName: target.symbolName,
        symbolType: target.symbolType,
      };
    });
    // Deduplicate by (filePath, symbolName)
    const uniqueCodeSymbols = deduplicateBy(codeSymbols, (s) => `${s.filePath}::${s.symbolName}`);
    report(`Importing ${uniqueCodeSymbols.length} code symbols...`);
    await batchExecute(session, MERGE_CODE_SYMBOLS, uniqueCodeSymbols);

    // Step 4: Extract and import TestSymbol nodes
    const testMappings = mappings.mappings.filter((m) => m.type === "test");
    const testSymbols = testMappings.map((m) => {
      const target = m.target as { filePath: string; testName: string };
      return {
        filePath: target.filePath,
        testName: target.testName,
      };
    });
    const uniqueTestSymbols = deduplicateBy(testSymbols, (s) => `${s.filePath}::${s.testName}`);
    report(`Importing ${uniqueTestSymbols.length} test symbols...`);
    await batchExecute(session, MERGE_TEST_SYMBOLS, uniqueTestSymbols);

    // Step 5: Create IMPLEMENTS edges
    const implementsEdges = codeMappings.map((m) => {
      const target = m.target as { filePath: string; symbolName: string };
      return {
        filePath: target.filePath,
        symbolName: target.symbolName,
        requirementId: m.requirementId,
        reasoning: m.reasoning,
      };
    });
    report(`Creating ${implementsEdges.length} IMPLEMENTS edges...`);
    await batchExecute(session, MERGE_IMPLEMENTS_EDGES, implementsEdges);

    // Step 6: Create VERIFIED_BY edges
    const verifiedByEdges = testMappings.map((m) => {
      const target = m.target as { filePath: string; testName: string };
      return {
        filePath: target.filePath,
        testName: target.testName,
        requirementId: m.requirementId,
        reasoning: m.reasoning,
      };
    });
    report(`Creating ${verifiedByEdges.length} VERIFIED_BY edges...`);
    await batchExecute(session, MERGE_VERIFIED_BY_EDGES, verifiedByEdges);

    return {
      requirementCount: requirements.requirements.length,
      codeSymbolCount: uniqueCodeSymbols.length,
      testSymbolCount: uniqueTestSymbols.length,
      implementsEdgeCount: implementsEdges.length,
      verifiedByEdgeCount: verifiedByEdges.length,
    };
  } finally {
    await session.close();
  }
}

/**
 * Execute a parameterized query in batches of BATCH_SIZE.
 */
async function batchExecute(
  session: Session,
  query: string,
  items: Record<string, unknown>[],
): Promise<void> {
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    await session.executeWrite((tx) => tx.run(query, { items: batch }));
  }
}

/**
 * Deduplicate an array by a key function.
 */
function deduplicateBy<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
