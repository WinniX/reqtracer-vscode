# /reqtracer.map - Requirement-to-Code/Test Mapping

You are performing requirements-to-code mapping for a software project. Your task is to analyze source and test files, identify which requirements each file implements or tests, and record the mappings.

This command uses phased execution with batching, progressive checkpointing, and optional subagent delegation to handle projects of any size.

## Preconditions

- `.reqtracer/requirements.json` must exist (run `/reqtracer.identify` first)
- `.reqtracer/config.json` must exist

## Steps

### 0. Load Config, Requirements & Estimate Scope

- Read `.reqtracer/config.json` for `sourceDirs` and `testDirs`
- If `sourceDirs` or `testDirs` are not configured, discover them (look for `src/`, `lib/`, `packages/` for source; `test/`, `tests/`, `__tests__/`, `*.test.*`, `*.spec.*` for tests)
- Present discovered directories to the user for confirmation and update `config.json`
- Read `.reqtracer/requirements.json` to get the full list of requirements
- Use Glob to collect all source files from `sourceDirs` and test files from `testDirs`, sort alphabetically, count total
- Set processing strategy based on file count:
  - **Small** (1–15 files): Single pass, no batching
  - **Medium** (16–50 files): Batches of 10 files, main agent processes directly
  - **Large** (51+ files): Batches of 8 files, delegate each batch to a subagent via the `Task` tool
- Report to the user: total file count and chosen strategy

### 1. Load Existing State (Resumability)

- Check for `.reqtracer/map-progress.json`
  - If it exists: ask the user whether to resume the previous run or start fresh
  - If resuming: load progress file, skip already-completed files, load pending mappings and file hashes
  - If starting fresh: delete the progress file
- Read `.reqtracer/mappings.json` if it exists
  - Preserve all existing mappings for files **outside** the current scope (files not in the current file list)

### 2. Batched Mapping

Divide the remaining files (excluding completed ones if resuming) into batches per the strategy from Step 0.

**Per-file mapping logic** (applies identically across all strategies):

1. Read the file content
2. Identify all symbols in the file (functions, classes, methods, interfaces, exports, variables)
3. For each symbol, determine if it implements any requirement from the requirements list
4. For test files, identify test cases (describe/it blocks, test functions) and determine which requirements they verify
5. For each mapping found, record:
   - `requirementId`: The REQ-{category}-{seq} ID
   - `type`: "code" for source files, "test" for test files
   - `target`: For code: `{ filePath, symbolName, symbolType }`. For tests: `{ filePath, testName }`
   - `reasoning`: A brief explanation of WHY this symbol implements/tests this requirement
6. Compute SHA-256 hash of the file

#### Small strategy (1–15 files)

Process all files in a single pass:
- Read each file, apply per-file mapping logic
- No intermediate checkpointing needed
- After all files: write `mappings.json` and `file-hashes.json`

#### Medium strategy (16–50 files)

Process in batches of 10:
- For each batch: read all files, apply per-file mapping logic
- After each batch: write updated `mappings.json` and `file-hashes.json` to disk (incremental write so completed work survives timeouts)
- After each batch: write intermediate state to `.reqtracer/map-progress.json`
- Report: `"Batch {n}/{total}: {count} mappings found in {fileCount} files. Running total: {sum} mappings"`

#### Large strategy (51+ files)

Process in batches of 8, delegating to subagents:
- Build a condensed requirements list for subagent prompts containing only: `id`, `title`, `category` (omit fullText, sourceFile, line numbers to keep context lean)
- For each batch, launch a `Task` subagent (`subagent_type: "general-purpose"`) with:
  - The list of file paths to process
  - The condensed requirements list
  - The per-file mapping logic rules (copy from above)
  - Instruction to return a JSON object: `{ "mappings": [...], "fileHashes": { "path": "sha256hex", ... } }`
- Main agent collects results from each subagent and merges into `mappings.json` and `file-hashes.json`
- After each subagent completes: write updated `mappings.json`, `file-hashes.json`, and `map-progress.json` to disk
- If a subagent fails: log the failure, mark its files as incomplete for retry in a subsequent batch
- Report: `"Batch {n}/{total}: {count} mappings found in {fileCount} files. Running total: {sum} mappings"`

### 3. Completion

- Delete `.reqtracer/map-progress.json`
- Report summary:
  - Strategy used and number of batches processed
  - Total files processed
  - Total mappings created (code + test)
  - Requirements with code mappings vs total requirements
  - Requirements with test mappings vs total requirements
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

### map-progress.json

This file is used for progressive checkpointing and resumability. It is created during Step 2 and deleted after Step 3.

```json
{
  "version": "1.0",
  "totalFiles": 42,
  "fileList": ["src/auth.ts", "src/api.ts", "test/auth.test.ts"],
  "completedFiles": ["src/auth.ts"],
  "batchResults": [
    {
      "batchId": 1,
      "files": ["src/auth.ts"],
      "mappingsFound": 3
    }
  ],
  "pendingMappings": [
    {
      "requirementId": "REQ-auth-001",
      "type": "code",
      "target": { "filePath": "src/auth.ts", "symbolName": "handleLogin", "symbolType": "function" },
      "reasoning": "This function implements the login flow"
    }
  ],
  "pendingFileHashes": {
    "src/auth.ts": { "hash": "<sha256-hex>", "mappedAt": "<ISO 8601>" }
  },
  "lastUpdated": "<ISO 8601 timestamp>"
}
```
