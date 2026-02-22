import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Compute SHA-256 hash of a single file's content.
 * @param filePath - Absolute path to the file
 * @returns 64-character lowercase hex digest
 */
export async function hashFile(filePath: string): Promise<string> {
  let content: Buffer;
  try {
    content = await readFile(filePath);
  } catch (err: unknown) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Cannot hash file: '${filePath}' does not exist. Was it deleted or renamed?`);
    }
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === "EACCES") {
      throw new Error(`Cannot hash file: permission denied for '${filePath}'.`);
    }
    throw new Error(`Cannot hash file '${filePath}': ${err instanceof Error ? err.message : String(err)}`);
  }
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Compute SHA-256 hash of a file given a project root and relative path.
 * @param projectRoot - Absolute path to project root
 * @param relativePath - Relative path from project root
 * @returns 64-character lowercase hex digest
 */
export async function hashProjectFile(projectRoot: string, relativePath: string): Promise<string> {
  try {
    return await hashFile(join(projectRoot, relativePath));
  } catch (err: unknown) {
    throw new Error(
      `Failed to hash '${relativePath}' (resolved to ${join(projectRoot, relativePath)}): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Result of a batch hash operation
 */
export interface BatchHashResult {
  /** Map of relative file path to SHA-256 hex digest */
  hashes: Map<string, string>;
  /** Files that failed to hash (e.g., deleted, permission denied) */
  errors: Array<{ filePath: string; error: string }>;
}

/**
 * Hash multiple files with concurrency control.
 * @param projectRoot - Absolute path to project root
 * @param relativePaths - Array of relative file paths
 * @param concurrency - Max concurrent hash operations (default: 10)
 * @returns Map of relative path to hex digest, plus errors
 */
export async function hashFiles(
  projectRoot: string,
  relativePaths: string[],
  concurrency: number = 10,
): Promise<BatchHashResult> {
  const hashes = new Map<string, string>();
  const errors: Array<{ filePath: string; error: string }> = [];

  // Process in batches of `concurrency` size
  // For each batch, use Promise.allSettled to handle individual failures
  // Collect results into hashes map and errors array

  for (let i = 0; i < relativePaths.length; i += concurrency) {
    const batch = relativePaths.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map(async (relativePath) => {
        const hash = await hashProjectFile(projectRoot, relativePath);
        return { relativePath, hash };
      }),
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j]!;
      if (result.status === "fulfilled") {
        hashes.set(result.value.relativePath, result.value.hash);
      } else {
        errors.push({
          filePath: batch[j]!,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    }
  }

  return { hashes, errors };
}
