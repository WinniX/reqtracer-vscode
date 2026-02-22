import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FileHashesFile, FileHash } from "../models/types.js";
import { ensureReqtracerDir, atomicWriteJson } from "../config/config-manager.js";
import { validateFileHashesFile } from "../models/validation.js";

const FILE_HASHES_FILE = "file-hashes.json";

function getHashesPath(projectRoot: string): string {
  return join(projectRoot, ".reqtracer", FILE_HASHES_FILE);
}

/**
 * Load file-hashes.json. Returns default empty structure if file doesn't exist.
 * Throws a descriptive error if the file exists but contains malformed or invalid JSON.
 */
export async function loadFileHashes(projectRoot: string): Promise<FileHashesFile> {
  const hashesPath = getHashesPath(projectRoot);
  let raw: string;
  try {
    raw = await readFile(hashesPath, "utf-8");
  } catch (err: unknown) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: "1.0", hashes: {} };
    }
    throw new Error(`Cannot read file-hashes.json: ${err instanceof Error ? err.message : String(err)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `Malformed file-hashes.json at ${hashesPath}: file exists but contains invalid JSON. Delete the file and re-run the mapping command to regenerate it.`,
    );
  }

  const validation = validateFileHashesFile(parsed);
  if (!validation.valid) {
    throw new Error(
      `Invalid file-hashes.json at ${hashesPath}: ${validation.errors.map((e) => `${e.field}: ${e.message}`).join("; ")}. Delete the file and re-run the mapping command to regenerate it.`,
    );
  }

  return parsed as FileHashesFile;
}

/**
 * Upsert a hash entry for a file path.
 * Loads existing, updates the entry, writes back atomically.
 */
export async function upsertFileHash(
  projectRoot: string,
  filePath: string,
  hash: string,
): Promise<void> {
  const data = await loadFileHashes(projectRoot);
  data.hashes[filePath] = {
    hash,
    mappedAt: new Date().toISOString(),
  };
  await writeFileHashesAtomic(projectRoot, data);
}

/**
 * Upsert multiple hash entries at once (batch operation).
 */
export async function upsertFileHashes(
  projectRoot: string,
  entries: Array<{ filePath: string; hash: string }>,
): Promise<void> {
  const data = await loadFileHashes(projectRoot);
  const now = new Date().toISOString();
  for (const entry of entries) {
    data.hashes[entry.filePath] = {
      hash: entry.hash,
      mappedAt: now,
    };
  }
  await writeFileHashesAtomic(projectRoot, data);
}

/**
 * Get the stored hash for a file path. Returns null if not found.
 */
export async function getFileHash(projectRoot: string, filePath: string): Promise<FileHash | null> {
  const data = await loadFileHashes(projectRoot);
  return data.hashes[filePath] ?? null;
}

/**
 * Write file-hashes.json atomically (temp file + rename).
 */
async function writeFileHashesAtomic(projectRoot: string, data: FileHashesFile): Promise<void> {
  await ensureReqtracerDir(projectRoot);
  const targetPath = getHashesPath(projectRoot);
  await atomicWriteJson(targetPath, data);
}
