---
description: Re-analyze only stale files and update requirement mappings
agent: general
---

# /reqtracer.remap - Incremental Remapping

You are performing incremental remapping of requirements for a software project. Your task is to re-analyze only the files that have changed or been deleted since the last mapping and update their requirement mappings.

This command uses phased execution with batching, progressive checkpointing, and optional subagent delegation to handle projects of any size.

## Preconditions

- `.reqtracer/mappings.json` must exist
- `.reqtracer/file-hashes.json` must exist
- `.reqtracer/requirements.json` must exist

## Steps

### 0. Detect Stale Files & Estimate Scope

- Read `.reqtracer/config.json` for `sourceDirs` and `testDirs`
- Read `.reqtracer/file-hashes.json` and `.reqtracer/mappings.json`
- Read `.reqtracer/requirements.json` to get the full list of requirements
- Use Glob to collect all current source and test files from `sourceDirs` and `testDirs`
- For each file in `file-hashes.json`, compute current SHA-256 hash
- Identify **stale files**: files where current hash differs from stored hash
- Identify **missing files**: files in `file-hashes.json` that no longer exist on disk
- If no stale files and no missing files: report "All mappings are current. No files need remapping." and exit
- Set processing strategy based on **stale file count** (not total file count):
  - **Small** (1–15 stale files): Single pass, no batching
  - **Medium** (16–50 stale files): Batches of 10 files, main agent processes directly
  - **Large** (51+ stale files): Batches of 8 files, delegate each batch to a subagent via the `Task` tool
- Report to the user: stale file count, missing file count, and chosen strategy

### 1. Load Existing State (Resumability)

- Check for `.reqtracer/remap-progress.json`
  - If it exists: ask the user whether to resume the previous run or start fresh
  - If resuming: load progress file, skip already-completed stale files
  - If starting fresh: delete the progress file

### 2. Handle Missing Files

For each missing file:
1. Remove all mappings in `mappings.json` where `target.filePath` matches the missing file
2. Remove the file's entry from `file-hashes.json`
3. Collect the requirement IDs that were affected (had mappings to the missing file)

- Write updated `mappings.json` and `file-hashes.json` to disk
- Report: `"Removed mappings for {count} deleted file(s). Affected requirements: {reqIds}"`

### 3. Batched Remapping

Divide the stale files (excluding completed ones if resuming) into batches per the strategy from Step 0.

**Per-file remapping logic** (applies identically across all strategies):

1. Read the file content
2. Identify all symbols in the file (functions, classes, methods, interfaces, exports, variables)
3. For each symbol, determine if it implements any requirement from the requirements list
4. For test files, identify test cases (describe/it blocks, test functions) and determine which requirements they verify
5. For each mapping found, record:
   - `requirementId`: The REQ-{category}-{seq} ID
   - `type`: "code" for source files, "test" for test files
   - `target`: For code: `{ filePath, symbolName, symbolType }`. For tests: `{ filePath, testName }`
   - `reasoning`: A brief explanation of WHY this symbol implements/tests this requirement
6. Replace all previous mappings for this file in `mappings.json` with the new ones
7. Compute SHA-256 hash of the file and update `file-hashes.json`

#### Small strategy (1–15 stale files)

Process all stale files in a single pass:
- Read each file, apply per-file remapping logic
- No intermediate checkpointing needed
- After all files: write `mappings.json` and `file-hashes.json`

#### Medium strategy (16–50 stale files)

Process in batches of 10:
- For each batch: read all files, apply per-file remapping logic
- After each batch: write updated `mappings.json` and `file-hashes.json` to disk (incremental write so completed work survives timeouts)
- After each batch: write intermediate state to `.reqtracer/remap-progress.json`
- Report: `"Batch {n}/{total}: {count} mappings found in {fileCount} files. Running total: {sum} mappings"`

#### Large strategy (51+ stale files)

Process in batches of 8, delegating to subagents:
- Build a condensed requirements list for subagent prompts containing only: `id`, `title`, `category` (omit fullText, sourceFile, line numbers to keep context lean)
- For each batch, launch a `Task` subagent (`subagent_type: "general-purpose"`) with:
  - The list of file paths to process
  - The condensed requirements list
  - The per-file remapping logic rules (copy from above)
  - Instruction to return a JSON object: `{ "mappings": [...], "fileHashes": { "path": "sha256hex", ... } }`
- Main agent collects results from each subagent and merges into `mappings.json` and `file-hashes.json`
- After each subagent completes: write updated `mappings.json`, `file-hashes.json`, and `remap-progress.json` to disk
- If a subagent fails: log the failure, mark its files as incomplete for retry in a subsequent batch
- Report: `"Batch {n}/{total}: {count} mappings found in {fileCount} files. Running total: {sum} mappings"`

### 4. Completion

- Delete `.reqtracer/remap-progress.json`
- Report summary:
  - Strategy used and number of batches processed
  - Total stale files remapped
  - Missing files cleaned up (count and affected requirements)
  - Total mappings updated (code + test)
  - Requirements affected by changes
- Suggest next step if applicable

## Output Schemas

### mappings.json
```json
{
  "version": "1.0",
  "generatedAt": "<ISO 8601>",
  "mappings": [
    {
      "requirementId": "REQ-auth-001",
      "type": "code",
      "target": { "filePath": "src/auth.ts", "symbolName": "handleLogin", "symbolType": "function" },
      "reasoning": "This function implements the login flow"
    }
  ]
}
```

### file-hashes.json
```json
{
  "version": "1.0",
  "hashes": {
    "src/auth.ts": { "hash": "<sha256-hex>", "mappedAt": "<ISO 8601>" }
  }
}
```

### remap-progress.json

This file is used for progressive checkpointing and resumability. It is created during Step 3 and deleted after Step 4.

```json
{
  "version": "1.0",
  "totalStaleFiles": 25,
  "staleFileList": ["src/auth.ts", "src/api.ts"],
  "completedFiles": ["src/auth.ts"],
  "missingFilesCleaned": ["src/old-module.ts"],
  "batchResults": [
    {
      "batchId": 1,
      "files": ["src/auth.ts"],
      "mappingsFound": 3
    }
  ],
  "lastUpdated": "<ISO 8601 timestamp>"
}
```
