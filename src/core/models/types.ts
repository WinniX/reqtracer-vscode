// Symbol types for code locations
export type SymbolType = "function" | "class" | "method" | "interface" | "export" | "variable";

// AI tool selection
export type AiTool = "opencode" | "claude-code";

// Mapping type discriminator
export type TraceLinkType = "code" | "test";

// An individual requirement from spec files
export interface Requirement {
  id: string;               // "REQ-auth-003" - pattern: /^REQ-[a-z][a-z0-9]*-\d{3}$/
  title: string;
  fullText: string;
  sourceFile: string;       // relative path ending in .md
  sourceLineStart: number;
  sourceLineEnd: number;
  category: string;         // lowercase slug: /^[a-z][a-z0-9]*$/
  seq: number;              // >= 1
}

// Reference to a specific symbol in source code
export interface CodeLocation {
  filePath: string;         // relative path
  symbolName: string;
  symbolType: SymbolType;
}

// Reference to a specific test symbol
export interface TestLocation {
  filePath: string;         // relative path
  testName: string;
}

// A mapping edge connecting a Requirement to code or test
export interface TraceLink {
  requirementId: string;    // REQ-{category}-{seq}
  target: CodeLocation | TestLocation;
  type: TraceLinkType;
  reasoning: string;
}

// Project-level configuration
export interface ProjectConfig {
  version: string;          // "1.0"
  specDirs: string[];
  sourceDirs: string[];
  testDirs: string[];
  aiTool: AiTool;
}

// Content hash for staleness detection
export interface FileHash {
  hash: string;             // SHA-256 hex digest (64 chars)
  mappedAt: string;         // ISO 8601 timestamp
}

// File-level wrapper for requirements.json
export interface RequirementsFile {
  version: string;
  generatedAt: string;
  requirements: Requirement[];
}

// File-level wrapper for mappings.json
export interface MappingsFile {
  version: string;
  generatedAt: string;
  mappings: TraceLink[];
}

// File-level wrapper for file-hashes.json
export interface FileHashesFile {
  version: string;
  hashes: Record<string, FileHash>;
}

// Transient progress cursor for interrupt/resume (used by VS Code extension)
export interface ProgressFile {
  command: string;          // "map" | "remap"
  fileList: string[];
  lastCompleted: number;    // index into fileList, -1 if none
  startedAt: string;        // ISO 8601
}

// ---------------------------------------------------------------------------
// AI command progress schemas (written/read by slash commands, not the extension)
// These define the richer progress files used for batched AI operations.
// ---------------------------------------------------------------------------

/** Batch result metadata recorded during mapping/remapping */
export interface BatchResultMeta {
  batchId: number;
  files: string[];
  mappingsFound: number;
}

/** Progress file for /reqtracer.map command */
export interface MapProgressFile {
  version: string;
  totalFiles: number;
  fileList: string[];
  completedFiles: string[];
  batchResults: BatchResultMeta[];
  lastUpdated: string;      // ISO 8601
}

/** Progress file for /reqtracer.remap command */
export interface RemapProgressFile {
  version: string;
  totalStaleFiles: number;
  staleFileList: string[];
  completedFiles: string[];
  missingFilesCleaned: string[];
  batchResults: BatchResultMeta[];
  lastUpdated: string;      // ISO 8601
}

/** Batch result metadata for identify command */
export interface IdentifyBatchResultMeta {
  batchId: number;
  files: string[];
  requirementsFound: number;
  categoriesUsed: string[];
}

/** Pending requirement extracted but not yet assigned an ID */
export interface PendingRequirement {
  fullText: string;
  title: string;
  suggestedCategory: string;
  sourceFile: string;
  sourceLineStart: number;
  sourceLineEnd: number;
}

/** Progress file for /reqtracer.identify command */
export interface IdentifyProgressFile {
  version: string;
  totalFiles: number;
  fileList: string[];
  completedFiles: string[];
  batchResults: IdentifyBatchResultMeta[];
  pendingRequirements: PendingRequirement[];
  lastUpdated: string;      // ISO 8601
}

/** Batch results file written by subagents during map/remap.
 *  Note: file hashing is performed by the main agent after merging,
 *  so this file contains only mappings — no fileHashes field. */
export interface BatchResultsFile {
  batchId: number;
  mappings: TraceLink[];
}

/** File classification for pre-classification phase (Large map strategy) */
export interface FileClassification {
  primaryCategory: string;
  relatedCategories: string[];
}

/** Pre-classification context file for Large map strategy */
export interface FileCategoriesFile {
  version: string;
  requirementsByCategory: Record<string, Array<{ id: string; title: string }>>;
  fileClassifications: Record<string, FileClassification>;
  skeletons: Record<string, string>;
  mappingRules: {
    maxMappingsPerFile: number;
    reasoningMaxWords: number;
    recordFields: {
      requirementId: string;
      type: string;
      codeTarget: string;
      testTarget: string;
      reasoning: string;
    };
  };
  batchPlan: Array<{ batchId: number; files: string[]; categories: string[] }>;
}
