import type { TraceLink } from "../models/types.js";
import { loadFileHashes } from "../hashing/hash-store.js";
import { loadMappings } from "./mappings-store.js";
import { hashProjectFile } from "../hashing/file-hasher.js";

/**
 * Information about a stale file
 */
export interface StaleFileInfo {
  /** Relative file path */
  filePath: string;
  /** Stored hash from last mapping */
  storedHash: string;
  /** Current hash of file content */
  currentHash: string;
  /** Requirement IDs affected by this file's staleness */
  affectedRequirementIds: string[];
}

/**
 * Result of a staleness check
 */
export interface StalenessResult {
  /** Total files checked */
  totalFiles: number;
  /** Number of stale files */
  staleCount: number;
  /** Details of each stale file */
  staleFiles: StaleFileInfo[];
  /** All unique requirement IDs affected across all stale files */
  allAffectedRequirementIds: string[];
  /** Files that couldn't be checked (deleted, permission errors) */
  errors: Array<{ filePath: string; error: string }>;
}

/**
 * Check all mapped files for staleness by comparing current hashes to stored hashes.
 *
 * @param projectRoot - Absolute path to project root
 * @returns Staleness check result with details about stale files and affected requirements
 */
export async function checkStaleness(projectRoot: string): Promise<StalenessResult> {
  let hashesFile;
  let mappingsFile;
  try {
    hashesFile = await loadFileHashes(projectRoot);
  } catch (err: unknown) {
    throw new Error(
      `Cannot check staleness: failed to load file hashes. ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  try {
    mappingsFile = await loadMappings(projectRoot);
  } catch (err: unknown) {
    throw new Error(
      `Cannot check staleness: failed to load mappings. ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const staleFiles: StaleFileInfo[] = [];
  const errors: Array<{ filePath: string; error: string }> = [];
  const filePaths = Object.keys(hashesFile.hashes);

  // Build a map from filePath to requirement IDs from mappings
  const fileToRequirements = new Map<string, Set<string>>();
  if (mappingsFile) {
    for (const mapping of mappingsFile.mappings) {
      const fp = mapping.target.filePath;
      if (!fileToRequirements.has(fp)) {
        fileToRequirements.set(fp, new Set());
      }
      fileToRequirements.get(fp)!.add(mapping.requirementId);
    }
  }

  // Check each file
  for (const filePath of filePaths) {
    const storedEntry = hashesFile.hashes[filePath];
    if (!storedEntry) continue;

    try {
      const currentHash = await hashProjectFile(projectRoot, filePath);
      if (currentHash !== storedEntry.hash) {
        const affectedReqs = fileToRequirements.get(filePath);
        staleFiles.push({
          filePath,
          storedHash: storedEntry.hash,
          currentHash,
          affectedRequirementIds: affectedReqs ? [...affectedReqs] : [],
        });
      }
    } catch (err: unknown) {
      errors.push({
        filePath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Collect all affected requirement IDs
  const allAffectedSet = new Set<string>();
  for (const sf of staleFiles) {
    for (const reqId of sf.affectedRequirementIds) {
      allAffectedSet.add(reqId);
    }
  }

  return {
    totalFiles: filePaths.length,
    staleCount: staleFiles.length,
    staleFiles,
    allAffectedRequirementIds: [...allAffectedSet],
    errors,
  };
}

/**
 * Get requirement IDs that are linked to a specific set of stale files.
 */
export function getAffectedRequirements(
  mappings: TraceLink[],
  staleFilePaths: string[],
): string[] {
  const staleSet = new Set(staleFilePaths);
  const reqIds = new Set<string>();
  for (const mapping of mappings) {
    if (staleSet.has(mapping.target.filePath)) {
      reqIds.add(mapping.requirementId);
    }
  }
  return [...reqIds];
}
