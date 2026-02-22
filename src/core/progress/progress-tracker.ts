import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { ProgressFile } from "../models/types.js";
import { ensureReqtracerDir, atomicWriteJson } from "../config/config-manager.js";

const PROGRESS_FILE = "progress.json";

function getProgressPath(projectRoot: string): string {
  return join(projectRoot, ".reqtracer", PROGRESS_FILE);
}

/**
 * Load progress.json. Returns null if file doesn't exist (no in-progress operation).
 * Throws a descriptive error if the file exists but contains malformed JSON.
 */
export async function loadProgress(projectRoot: string): Promise<ProgressFile | null> {
  const progressPath = getProgressPath(projectRoot);
  let raw: string;
  try {
    raw = await readFile(progressPath, "utf-8");
  } catch (err: unknown) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw new Error(`Cannot read progress.json: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    return JSON.parse(raw) as ProgressFile;
  } catch {
    throw new Error(
      `Malformed progress.json at ${progressPath}: file exists but contains invalid JSON. Delete the file to reset progress tracking.`,
    );
  }
}

/**
 * Create a new progress file for a command.
 */
export async function createProgress(
  projectRoot: string,
  command: string,
  fileList: string[],
): Promise<ProgressFile> {
  await ensureReqtracerDir(projectRoot);
  const progress: ProgressFile = {
    command,
    fileList,
    lastCompleted: -1,
    startedAt: new Date().toISOString(),
  };
  await writeProgressAtomic(projectRoot, progress);
  return progress;
}

/**
 * Update the progress cursor after completing a file.
 */
export async function updateProgress(
  projectRoot: string,
  lastCompleted: number,
): Promise<void> {
  const progress = await loadProgress(projectRoot);
  if (!progress) {
    throw new Error("No progress file found. Cannot update cursor.");
  }
  progress.lastCompleted = lastCompleted;
  await writeProgressAtomic(projectRoot, progress);
}

/**
 * Delete progress.json (called on command completion).
 */
export async function deleteProgress(projectRoot: string): Promise<void> {
  try {
    await unlink(getProgressPath(projectRoot));
  } catch (err: unknown) {
    // Ignore if file doesn't exist
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw err;
  }
}

/**
 * Get the next file index to process (lastCompleted + 1).
 * Returns null if all files have been completed.
 */
export function getNextFileIndex(progress: ProgressFile): number | null {
  const next = progress.lastCompleted + 1;
  if (next >= progress.fileList.length) {
    return null;
  }
  return next;
}

/**
 * Write progress.json atomically.
 */
async function writeProgressAtomic(projectRoot: string, data: ProgressFile): Promise<void> {
  const targetPath = getProgressPath(projectRoot);
  await atomicWriteJson(targetPath, data);
}
