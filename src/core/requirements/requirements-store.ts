import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RequirementsFile, Requirement } from "../models/types.js";
import { ensureReqtracerDir, atomicWriteJson } from "../config/config-manager.js";
import { validateRequirementsFile } from "../models/validation.js";

const REQUIREMENTS_FILE = "requirements.json";

function getRequirementsPath(projectRoot: string): string {
  return join(projectRoot, ".reqtracer", REQUIREMENTS_FILE);
}

/**
 * Load requirements.json. Returns null if file doesn't exist.
 * Throws a descriptive error if the file exists but contains malformed or invalid JSON.
 */
export async function loadRequirements(projectRoot: string): Promise<RequirementsFile | null> {
  const reqPath = getRequirementsPath(projectRoot);
  let raw: string;
  try {
    raw = await readFile(reqPath, "utf-8");
  } catch (err: unknown) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw new Error(`Cannot read requirements.json: ${err instanceof Error ? err.message : String(err)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `Malformed requirements.json at ${reqPath}: file exists but contains invalid JSON. Delete the file and re-run the identify command to regenerate it.`,
    );
  }

  const validation = validateRequirementsFile(parsed);
  if (!validation.valid) {
    throw new Error(
      `Invalid requirements.json at ${reqPath}: ${validation.errors.map((e) => `${e.field}: ${e.message}`).join("; ")}. Delete the file and re-run the identify command to regenerate it.`,
    );
  }

  return parsed as RequirementsFile;
}

/**
 * Save a full RequirementsFile atomically.
 * Creates .reqtracer/ directory if needed.
 */
export async function saveRequirements(projectRoot: string, data: RequirementsFile): Promise<void> {
  await ensureReqtracerDir(projectRoot);
  const targetPath = getRequirementsPath(projectRoot);
  await atomicWriteJson(targetPath, data);
}

/**
 * Append or update requirements in the requirements file.
 * Preserves existing IDs - if a requirement with the same ID exists, it's updated.
 * New requirements are appended.
 */
export async function upsertRequirements(
  projectRoot: string,
  newRequirements: Requirement[],
): Promise<RequirementsFile> {
  const existing = await loadRequirements(projectRoot);
  const data: RequirementsFile = existing ?? {
    version: "1.0",
    generatedAt: new Date().toISOString(),
    requirements: [],
  };

  // Build a map of existing requirements by ID for quick lookup
  const byId = new Map<string, number>();
  for (let i = 0; i < data.requirements.length; i++) {
    byId.set(data.requirements[i]!.id, i);
  }

  // Upsert: update existing or append new
  for (const req of newRequirements) {
    const existingIdx = byId.get(req.id);
    if (existingIdx !== undefined) {
      data.requirements[existingIdx] = req;
    } else {
      data.requirements.push(req);
      byId.set(req.id, data.requirements.length - 1);
    }
  }

  data.generatedAt = new Date().toISOString();
  await saveRequirements(projectRoot, data);
  return data;
}

/**
 * Get a single requirement by ID.
 */
export async function getRequirement(projectRoot: string, id: string): Promise<Requirement | null> {
  const data = await loadRequirements(projectRoot);
  if (!data) return null;
  return data.requirements.find((r) => r.id === id) ?? null;
}

/**
 * Get all requirement IDs.
 */
export async function getRequirementIds(projectRoot: string): Promise<string[]> {
  const data = await loadRequirements(projectRoot);
  if (!data) return [];
  return data.requirements.map((r) => r.id);
}
