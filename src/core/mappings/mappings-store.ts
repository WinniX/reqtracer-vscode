import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { MappingsFile, TraceLink } from "../models/types.js";
import { ensureReqtracerDir, atomicWriteJson } from "../config/config-manager.js";
import { validateMappingsFile } from "../models/validation.js";

const MAPPINGS_FILE = "mappings.json";

function getMappingsPath(projectRoot: string): string {
  return join(projectRoot, ".reqtracer", MAPPINGS_FILE);
}

/**
 * Load mappings.json. Returns null if file doesn't exist.
 * Throws a descriptive error if the file exists but contains malformed or invalid JSON.
 */
export async function loadMappings(projectRoot: string): Promise<MappingsFile | null> {
  const mapPath = getMappingsPath(projectRoot);
  let raw: string;
  try {
    raw = await readFile(mapPath, "utf-8");
  } catch (err: unknown) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw new Error(`Cannot read mappings.json: ${err instanceof Error ? err.message : String(err)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `Malformed mappings.json at ${mapPath}: file exists but contains invalid JSON. Delete the file and re-run the map command to regenerate it.`,
    );
  }

  const validation = validateMappingsFile(parsed);
  if (!validation.valid) {
    throw new Error(
      `Invalid mappings.json at ${mapPath}: ${validation.errors.map((e) => `${e.field}: ${e.message}`).join("; ")}. Delete the file and re-run the map command to regenerate it.`,
    );
  }

  return parsed as MappingsFile;
}

/**
 * Save a full MappingsFile atomically.
 */
export async function saveMappings(projectRoot: string, data: MappingsFile): Promise<void> {
  await ensureReqtracerDir(projectRoot);
  const targetPath = getMappingsPath(projectRoot);
  await atomicWriteJson(targetPath, data);
}

/**
 * Upsert mappings for a specific source file.
 * Removes all existing mappings whose target.filePath matches the given sourceFile,
 * then adds the new mappings. This makes re-processing a file idempotent.
 */
export async function upsertMappingsByFile(
  projectRoot: string,
  sourceFile: string,
  newMappings: TraceLink[],
): Promise<MappingsFile> {
  const existing = await loadMappings(projectRoot);
  const data: MappingsFile = existing ?? {
    version: "1.0",
    generatedAt: new Date().toISOString(),
    mappings: [],
  };

  // Remove all existing mappings for this source file
  data.mappings = data.mappings.filter((m) => m.target.filePath !== sourceFile);

  // Add new mappings
  data.mappings.push(...newMappings);
  data.generatedAt = new Date().toISOString();

  await saveMappings(projectRoot, data);
  return data;
}

/**
 * Delete all mappings whose target.filePath matches any of the given stale files.
 */
export async function deleteStaleMappings(
  projectRoot: string,
  staleFiles: string[],
): Promise<MappingsFile> {
  const existing = await loadMappings(projectRoot);
  if (!existing) {
    return { version: "1.0", generatedAt: new Date().toISOString(), mappings: [] };
  }

  const staleSet = new Set(staleFiles);
  existing.mappings = existing.mappings.filter((m) => !staleSet.has(m.target.filePath));
  existing.generatedAt = new Date().toISOString();

  await saveMappings(projectRoot, existing);
  return existing;
}

/**
 * Get all mappings for a specific requirement ID.
 */
export async function getMappingsForRequirement(
  projectRoot: string,
  requirementId: string,
): Promise<TraceLink[]> {
  const data = await loadMappings(projectRoot);
  if (!data) return [];
  return data.mappings.filter((m) => m.requirementId === requirementId);
}

/**
 * Get all mappings that reference symbols in a specific file.
 */
export async function getMappingsForFile(
  projectRoot: string,
  filePath: string,
): Promise<TraceLink[]> {
  const data = await loadMappings(projectRoot);
  if (!data) return [];
  return data.mappings.filter((m) => m.target.filePath === filePath);
}

/**
 * Get all unique file paths referenced in mappings.
 */
export async function getMappedFilePaths(projectRoot: string): Promise<string[]> {
  const data = await loadMappings(projectRoot);
  if (!data) return [];
  const paths = new Set(data.mappings.map((m) => m.target.filePath));
  return [...paths];
}
