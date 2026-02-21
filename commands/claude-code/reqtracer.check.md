# /reqtracer.check - Staleness Detection

You are checking for stale requirement-to-code mappings in a software project. Your task is to compare current file content hashes against stored hashes to identify which files have changed since the last mapping.

## Preconditions

- `.reqtracer/mappings.json` must exist (run `/reqtracer.map` first)
- `.reqtracer/file-hashes.json` must exist

## Steps

### 1. Load Data

- Read `.reqtracer/file-hashes.json` for stored hashes
- Read `.reqtracer/mappings.json` for requirement-to-file mappings

### 2. Check Each File

For each file in `file-hashes.json`:
1. Compute the current SHA-256 hash of the file content
2. Compare against the stored hash
3. If different, mark the file as stale
4. If the file no longer exists, mark it as missing

### 3. Collect Affected Requirements

For each stale file, find all requirement IDs linked to it from `mappings.json`.

### 4. Report Results

Output a clear report:

```
Staleness check complete.
- {N} files checked
- {M} files changed since last mapping
- {K} requirements affected

Stale files:
  - src/api/auth.ts (modified)
    Affects: REQ-auth-001, REQ-auth-003

  - src/api/import.ts (modified)
    Affects: REQ-import-001

Run /reqtracer.remap to update stale mappings.
```

If no files are stale, report: "All mappings are current. No files have changed since last mapping."

This is a **read-only** operation. Do not modify any files.
