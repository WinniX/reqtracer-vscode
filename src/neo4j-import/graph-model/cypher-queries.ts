/**
 * Cypher queries for ReqTracer graph model.
 *
 * Graph model:
 *   (:Requirement {id, title, sourceFile})
 *   (:CodeSymbol {filePath, symbolName, symbolType})
 *   (:TestSymbol {filePath, testName})
 *   (:CodeSymbol)-[:IMPLEMENTS]->(:Requirement)
 *   (:TestSymbol)-[:VERIFIED_BY]->(:Requirement)
 */

// Uniqueness constraints
export const CONSTRAINTS = [
  `CREATE CONSTRAINT requirement_id IF NOT EXISTS FOR (r:Requirement) REQUIRE r.id IS UNIQUE`,
  `CREATE CONSTRAINT code_symbol_key IF NOT EXISTS FOR (c:CodeSymbol) REQUIRE (c.filePath, c.symbolName) IS UNIQUE`,
  `CREATE CONSTRAINT test_symbol_key IF NOT EXISTS FOR (t:TestSymbol) REQUIRE (t.filePath, t.testName) IS UNIQUE`,
];

// Batch MERGE queries using UNWIND
export const MERGE_REQUIREMENTS = `
  UNWIND $items AS item
  MERGE (r:Requirement {id: item.id})
  SET r.title = item.title,
      r.sourceFile = item.sourceFile,
      r.fullText = item.fullText,
      r.category = item.category
`;

export const MERGE_CODE_SYMBOLS = `
  UNWIND $items AS item
  MERGE (c:CodeSymbol {filePath: item.filePath, symbolName: item.symbolName})
  SET c.symbolType = item.symbolType
`;

export const MERGE_TEST_SYMBOLS = `
  UNWIND $items AS item
  MERGE (t:TestSymbol {filePath: item.filePath, testName: item.testName})
`;

export const MERGE_IMPLEMENTS_EDGES = `
  UNWIND $items AS item
  MATCH (c:CodeSymbol {filePath: item.filePath, symbolName: item.symbolName})
  MATCH (r:Requirement {id: item.requirementId})
  MERGE (c)-[rel:IMPLEMENTS]->(r)
  SET rel.reasoning = item.reasoning
`;

export const MERGE_VERIFIED_BY_EDGES = `
  UNWIND $items AS item
  MATCH (t:TestSymbol {filePath: item.filePath, testName: item.testName})
  MATCH (r:Requirement {id: item.requirementId})
  MERGE (t)-[rel:VERIFIED_BY]->(r)
  SET rel.reasoning = item.reasoning
`;
