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
- Use Glob to collect all current source and test files from `sourceDirs` and `testDirs`, applying these **exclusion rules**:
  - Skip binary and non-source files: `*.png`, `*.jpg`, `*.jpeg`, `*.gif`, `*.svg`, `*.ico`, `*.woff`, `*.woff2`, `*.ttf`, `*.eot`, `*.mp3`, `*.mp4`, `*.wav`, `*.ogg`, `*.pdf`, `*.zip`, `*.gz`, `*.tar`, `*.wasm`, `*.node`, `*.pyc`, `*.pyo`, `*.class`, `*.o`, `*.so`, `*.dylib`, `*.dll`, `*.exe`, `*.map`, `*.min.js`, `*.min.css`, `*.d.ts`
  - Skip generated/vendored directories: `node_modules/`, `dist/`, `build/`, `.next/`, `coverage/`, `vendor/`, `__pycache__/`, `.venv/`, `target/`, `.git/`
- For each file in `file-hashes.json`, compute current SHA-256 hash
- Identify **stale files**: files where current hash differs from stored hash
- Identify **missing files**: files in `file-hashes.json` that no longer exist on disk
- If no stale files and no missing files: report "All mappings are current. No files need remapping." and exit
- Set processing strategy based on **stale file count** (not total file count):
  - **Small** (1-15 stale files): Single pass, no batching
  - **Medium** (16-50 stale files): Batches of 10 files, main agent processes directly
  - **Large** (51+ stale files): Batches of 8 files, delegate each batch to a subagent via the `Task` tool
- Report to the user: stale file count, missing file count, and chosen strategy

### 1. Load Existing State (Resumability)

- Check for `.reqtracer/remap-progress.json`
  - If it exists: ask the user whether to resume the previous run or start fresh
  - If resuming: load progress file, skip already-completed stale files
  - If starting fresh: delete the progress file
- Read `.reqtracer/mappings.json` — remove mappings for any stale file (will be re-mapped) or missing file (no longer exists). Write back. This preserves mappings for unchanged files.

### 2. Handle Missing Files

Mappings for missing files were already removed in Step 1. Now clean up hashes and report:

For each missing file:
1. Remove the file's entry from `file-hashes.json`
2. Collect the requirement IDs that were affected (had mappings to the missing file, removed in Step 1)

- Write updated `file-hashes.json` to disk
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
   - `reasoning`: Max 15 words explaining WHY this symbol implements/tests this requirement
   - Limit: max 5 mappings per file — pick the strongest matches if more are found
6. Replace all previous mappings for this file in `mappings.json` with the new ones

#### Small strategy (1-15 stale files)

Process all stale files in a single pass:
- Read each file, apply per-file remapping logic
- No intermediate checkpointing needed
- After all files: compute SHA-256 hash of each processed file, then write `mappings.json` and `file-hashes.json`

#### Medium strategy (16-50 stale files)

Process in batches of 10:
- For each batch: read all files, apply per-file remapping logic
- After each batch: compute SHA-256 hash of each file in the batch
- After each batch: use Bash to merge new mappings into `mappings.json` on disk — do NOT re-read the full existing `mappings.json` into context. Use a script like: `node -e "const fs=require('fs'); const m=JSON.parse(fs.readFileSync('.reqtracer/mappings.json')); const b=JSON.parse(process.argv[1]); m.mappings.push(...b); fs.writeFileSync('.reqtracer/mappings.json', JSON.stringify(m,null,2))" '<new_mappings_json>'`
- After each batch: write updated `file-hashes.json` and `remap-progress.json` to disk
- Report: `"Batch {n}/{total}: {count} mappings found in {fileCount} files. Running total: {sum} mappings"`

#### Large strategy (51+ stale files)

Process in batches of 8, delegating to subagents **sequentially** (one batch at a time):

**Per-batch processing (sequential loop):**
- **Before** launching the subagent: delete `.reqtracer/batch-context-{batchId}.json` if it exists from a previous failed run
- **Write** a per-batch context file `.reqtracer/batch-context-{batchId}.json` containing ONLY:
  - A condensed requirements list: `id`, `title`, `category` for each requirement (omit fullText, sourceFile, line numbers)
  - The list of file paths for this batch
  - The per-file remapping logic rules
  - This keeps subagent context minimal — it reads only its own batch data
- Launch **one** `Task` subagent (`subagent_type: "general"`) with the prompt:
  ```
  Read `.reqtracer/batch-context-{batchId}.json`.
  Batch: {batchId}
  Files: {fileList}
  For each file, read its content. Match symbols against requirements from `requirements`.
  Record: requirementId, type (code|test), target, reasoning (max 15 words).
  Max 5 mappings per file. Replace all previous mappings for each file.
  Write results to `.reqtracer/batch-results-{batchId}.json`.
  ```
- **Wait** for the subagent to complete before launching the next batch
- Read `.reqtracer/batch-results-{batchId}.json` from disk
- **Validate** that the `batchId` in the results file matches the expected batch number. If it does not match, log a warning and skip this batch (mark files for retry).
- Merge results into `mappings.json` on disk using Bash — do NOT re-read the full cumulative `mappings.json` into context. Use a merge script: `node -e "const fs=require('fs'); const m=JSON.parse(fs.readFileSync('.reqtracer/mappings.json')); const b=JSON.parse(fs.readFileSync('.reqtracer/batch-results-{batchId}.json')); m.mappings.push(...b.mappings); m.generatedAt=new Date().toISOString(); fs.writeFileSync('.reqtracer/mappings.json', JSON.stringify(m,null,2))"`
- **Compute SHA-256 hash** of each file in the batch (the main agent does this, not the subagent)
- Write updated `file-hashes.json` and `remap-progress.json` to disk
- Delete the processed `.reqtracer/batch-context-{batchId}.json` and `.reqtracer/batch-results-{batchId}.json`
- If a subagent fails: log the failure, mark its files as incomplete for retry after all other batches
- Report: `"Batch {n}/{total}: {count} mappings found in {fileCount} files. Running total: {sum} mappings"`

**Cleanup:** Delete any remaining `batch-context-*.json` and `batch-results-*.json` files.

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
      "reasoning": "Implements login flow with credential validation"
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

### batch-context-{batchId}.json (Large strategy only)

Per-batch context file written by the main agent before launching each subagent. Contains ONLY the data relevant to that specific batch. Deleted after the batch is processed.

```json
{
  "batchId": 1,
  "requirements": [
    { "id": "REQ-auth-001", "title": "User login", "category": "auth" }
  ],
  "files": ["src/auth.ts", "test/auth.test.ts"],
  "remappingRules": {
    "symbolTypes": ["function", "class", "method", "interface", "export", "variable"],
    "testPatterns": ["describe/it blocks", "test functions"],
    "maxMappingsPerFile": 5,
    "reasoningMaxWords": 15,
    "recordFields": {
      "requirementId": "REQ-{category}-{seq} ID",
      "type": "code | test",
      "target": "For code: { filePath, symbolName, symbolType }. For tests: { filePath, testName }",
      "reasoning": "Max 15 words explaining WHY this symbol implements/tests the requirement"
    },
    "replaceExisting": "Replace all previous mappings for each file with new ones"
  }
}
```

### batch-results-{batchId}.json (Large strategy only)

Temporary file written by each subagent with its batch results. Each batch writes to its own numbered file. Read and merged by the main agent, then deleted.

```json
{
  "batchId": 1,
  "mappings": [
    {
      "requirementId": "REQ-auth-001",
      "type": "code",
      "target": { "filePath": "src/auth.ts", "symbolName": "handleLogin", "symbolType": "function" },
      "reasoning": "Implements login flow with credential validation"
    }
  ]
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
