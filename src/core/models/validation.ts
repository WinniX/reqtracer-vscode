import type {
  Requirement,
  CodeLocation,
  TestLocation,
  TraceLink,
  ProjectConfig,
  FileHash,
  SymbolType,
} from "./types.js";

// Regex patterns
const REQUIREMENT_ID_PATTERN = /^REQ-[a-z][a-z0-9]*-\d{3}$/;
const CATEGORY_PATTERN = /^[a-z][a-z0-9]*$/;
const VALID_SYMBOL_TYPES: SymbolType[] = [
  "function",
  "class",
  "method",
  "interface",
  "export",
  "variable",
];

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

function ok(): ValidationResult {
  return { valid: true, errors: [] };
}

function fail(errors: ValidationError[]): ValidationResult {
  return { valid: false, errors };
}

// ---------------------------------------------------------------------------
// Primitive validators
// ---------------------------------------------------------------------------

/** Validate a requirement ID format: REQ-{category}-{seq} */
export function isValidRequirementId(id: string): boolean {
  return REQUIREMENT_ID_PATTERN.test(id);
}

/** Validate a category slug */
export function isValidCategory(category: string): boolean {
  return CATEGORY_PATTERN.test(category);
}

/** Validate a symbol type */
export function isValidSymbolType(type: string): type is SymbolType {
  return (VALID_SYMBOL_TYPES as string[]).includes(type);
}

// ---------------------------------------------------------------------------
// Object validators
// ---------------------------------------------------------------------------

/** Validate a full Requirement object */
export function validateRequirement(req: Requirement): ValidationResult {
  const errors: ValidationError[] = [];

  if (!isValidRequirementId(req.id)) {
    errors.push({
      field: "id",
      message:
        "Requirement id must match pattern REQ-{category}-{seq} (e.g. REQ-auth-003)",
    });
  }

  if (typeof req.title !== "string" || req.title.length === 0) {
    errors.push({ field: "title", message: "title must be a non-empty string" });
  }

  if (typeof req.fullText !== "string" || req.fullText.length === 0) {
    errors.push({
      field: "fullText",
      message: "fullText must be a non-empty string",
    });
  }

  if (typeof req.sourceFile !== "string" || !req.sourceFile.endsWith(".md")) {
    errors.push({
      field: "sourceFile",
      message: "sourceFile must be a path ending with .md",
    });
  }

  if (typeof req.sourceLineStart !== "number" || req.sourceLineStart < 1) {
    errors.push({
      field: "sourceLineStart",
      message: "sourceLineStart must be >= 1",
    });
  }

  if (
    typeof req.sourceLineEnd !== "number" ||
    req.sourceLineEnd < req.sourceLineStart
  ) {
    errors.push({
      field: "sourceLineEnd",
      message: "sourceLineEnd must be >= sourceLineStart",
    });
  }

  if (!isValidCategory(req.category)) {
    errors.push({
      field: "category",
      message:
        "category must be a lowercase alphanumeric slug starting with a letter",
    });
  }

  if (typeof req.seq !== "number" || req.seq < 1) {
    errors.push({ field: "seq", message: "seq must be >= 1" });
  }

  return errors.length === 0 ? ok() : fail(errors);
}

/** Validate a CodeLocation */
export function validateCodeLocation(loc: CodeLocation): ValidationResult {
  const errors: ValidationError[] = [];

  if (typeof loc.filePath !== "string" || loc.filePath.length === 0) {
    errors.push({
      field: "filePath",
      message: "filePath must be a non-empty string",
    });
  }

  if (typeof loc.symbolName !== "string" || loc.symbolName.length === 0) {
    errors.push({
      field: "symbolName",
      message: "symbolName must be a non-empty string",
    });
  }

  if (!isValidSymbolType(loc.symbolType)) {
    errors.push({
      field: "symbolType",
      message: `symbolType must be one of: ${VALID_SYMBOL_TYPES.join(", ")}`,
    });
  }

  return errors.length === 0 ? ok() : fail(errors);
}

/** Validate a TestLocation */
export function validateTestLocation(loc: TestLocation): ValidationResult {
  const errors: ValidationError[] = [];

  if (typeof loc.filePath !== "string" || loc.filePath.length === 0) {
    errors.push({
      field: "filePath",
      message: "filePath must be a non-empty string",
    });
  }

  if (typeof loc.testName !== "string" || loc.testName.length === 0) {
    errors.push({
      field: "testName",
      message: "testName must be a non-empty string",
    });
  }

  return errors.length === 0 ? ok() : fail(errors);
}

/** Validate a TraceLink */
export function validateTraceLink(link: TraceLink): ValidationResult {
  const errors: ValidationError[] = [];

  if (!isValidRequirementId(link.requirementId)) {
    errors.push({
      field: "requirementId",
      message:
        "requirementId must match pattern REQ-{category}-{seq} (e.g. REQ-auth-003)",
    });
  }

  if (link.type !== "code" && link.type !== "test") {
    errors.push({
      field: "type",
      message: 'type must be "code" or "test"',
    });
  }

  if (typeof link.reasoning !== "string" || link.reasoning.length === 0) {
    errors.push({
      field: "reasoning",
      message: "reasoning must be a non-empty string",
    });
  }

  // Validate the target based on type
  if (link.type === "code") {
    const targetResult = validateCodeLocation(link.target as CodeLocation);
    for (const err of targetResult.errors) {
      errors.push({ field: `target.${err.field}`, message: err.message });
    }
  } else if (link.type === "test") {
    const targetResult = validateTestLocation(link.target as TestLocation);
    for (const err of targetResult.errors) {
      errors.push({ field: `target.${err.field}`, message: err.message });
    }
  }

  return errors.length === 0 ? ok() : fail(errors);
}

/** Validate a ProjectConfig */
export function validateProjectConfig(config: ProjectConfig): ValidationResult {
  const errors: ValidationError[] = [];

  if (config.version !== "1.0") {
    errors.push({
      field: "version",
      message: 'version must be "1.0"',
    });
  }

  if (!Array.isArray(config.specDirs)) {
    errors.push({
      field: "specDirs",
      message: "specDirs must be an array",
    });
  }

  if (!Array.isArray(config.sourceDirs)) {
    errors.push({
      field: "sourceDirs",
      message: "sourceDirs must be an array",
    });
  }

  if (!Array.isArray(config.testDirs)) {
    errors.push({
      field: "testDirs",
      message: "testDirs must be an array",
    });
  }

  if (config.aiTool !== "opencode" && config.aiTool !== "claude-code") {
    errors.push({
      field: "aiTool",
      message: 'aiTool must be "opencode" or "claude-code"',
    });
  }

  return errors.length === 0 ? ok() : fail(errors);
}

/** Validate a FileHash */
export function validateFileHash(hash: FileHash): ValidationResult {
  const errors: ValidationError[] = [];

  if (typeof hash.hash !== "string" || !/^[0-9a-f]{64}$/.test(hash.hash)) {
    errors.push({
      field: "hash",
      message: "hash must be a 64-character lowercase hex string (SHA-256)",
    });
  }

  if (typeof hash.mappedAt !== "string" || hash.mappedAt.length === 0) {
    errors.push({
      field: "mappedAt",
      message: "mappedAt must be a non-empty string",
    });
  }

  return errors.length === 0 ? ok() : fail(errors);
}

// ---------------------------------------------------------------------------
// File-level structure validators (accept unknown input)
// ---------------------------------------------------------------------------

/** Validate a requirements.json structure */
export function validateRequirementsFile(data: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return fail([{ field: "root", message: "data must be a non-null object" }]);
  }

  const obj = data as Record<string, unknown>;

  if (obj.version !== "1.0") {
    errors.push({ field: "version", message: 'version must be "1.0"' });
  }

  if (typeof obj.generatedAt !== "string" || obj.generatedAt.length === 0) {
    errors.push({
      field: "generatedAt",
      message: "generatedAt must be a non-empty string",
    });
  }

  if (!Array.isArray(obj.requirements)) {
    errors.push({
      field: "requirements",
      message: "requirements must be an array",
    });
  }

  return errors.length === 0 ? ok() : fail(errors);
}

/** Validate a mappings.json structure */
export function validateMappingsFile(data: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return fail([{ field: "root", message: "data must be a non-null object" }]);
  }

  const obj = data as Record<string, unknown>;

  if (obj.version !== "1.0") {
    errors.push({ field: "version", message: 'version must be "1.0"' });
  }

  if (typeof obj.generatedAt !== "string" || obj.generatedAt.length === 0) {
    errors.push({
      field: "generatedAt",
      message: "generatedAt must be a non-empty string",
    });
  }

  if (!Array.isArray(obj.mappings)) {
    errors.push({
      field: "mappings",
      message: "mappings must be an array",
    });
  }

  return errors.length === 0 ? ok() : fail(errors);
}

/** Validate a file-hashes.json structure */
export function validateFileHashesFile(data: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return fail([{ field: "root", message: "data must be a non-null object" }]);
  }

  const obj = data as Record<string, unknown>;

  if (obj.version !== "1.0") {
    errors.push({ field: "version", message: 'version must be "1.0"' });
  }

  if (
    typeof obj.hashes !== "object" ||
    obj.hashes === null ||
    Array.isArray(obj.hashes)
  ) {
    errors.push({
      field: "hashes",
      message: "hashes must be a non-null object",
    });
  }

  return errors.length === 0 ? ok() : fail(errors);
}
