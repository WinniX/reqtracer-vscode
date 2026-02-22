// Models & Types
export type {
  SymbolType,
  AiTool,
  TraceLinkType,
  Requirement,
  CodeLocation,
  TestLocation,
  TraceLink,
  ProjectConfig,
  FileHash,
  RequirementsFile,
  MappingsFile,
  FileHashesFile,
  ProgressFile,
} from "./models/types.js";

// Validation
export {
  isValidRequirementId,
  isValidCategory,
  isValidSymbolType,
  validateRequirement,
  validateCodeLocation,
  validateTestLocation,
  validateTraceLink,
  validateProjectConfig,
  validateFileHash,
  validateRequirementsFile,
  validateMappingsFile,
  validateFileHashesFile,
} from "./models/validation.js";
export type { ValidationError, ValidationResult } from "./models/validation.js";

// Config
export {
  ensureReqtracerDir,
  getConfigPath,
  loadConfig,
  createConfig,
  updateConfig,
} from "./config/config-manager.js";

// Hashing
export {
  hashFile,
  hashProjectFile,
  hashFiles,
} from "./hashing/file-hasher.js";
export type { BatchHashResult } from "./hashing/file-hasher.js";

export {
  loadFileHashes,
  upsertFileHash,
  upsertFileHashes,
  getFileHash,
} from "./hashing/hash-store.js";

// Requirements
export {
  loadRequirements,
  saveRequirements,
  upsertRequirements,
  getRequirement,
  getRequirementIds,
} from "./requirements/requirements-store.js";

// Mappings
export {
  loadMappings,
  saveMappings,
  upsertMappingsByFile,
  deleteStaleMappings,
  getMappingsForRequirement,
  getMappingsForFile,
  getMappedFilePaths,
} from "./mappings/mappings-store.js";

// Staleness
export {
  checkStaleness,
  getAffectedRequirements,
} from "./mappings/staleness-checker.js";
export type { StaleFileInfo, StalenessResult } from "./mappings/staleness-checker.js";

// Coverage
export {
  deriveCoverageSummary,
  getCoverageSummary,
} from "./mappings/coverage.js";
export type { RequirementCoverage, CoverageSummary } from "./mappings/coverage.js";

// Progress
export {
  loadProgress,
  createProgress,
  updateProgress,
  deleteProgress,
  getNextFileIndex,
} from "./progress/progress-tracker.js";
