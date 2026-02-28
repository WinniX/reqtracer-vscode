# /reqtracer.map - Requirement-to-Code/Test Mapping

You are performing requirements-to-code mapping for a software project. Your task is to analyze source and test files, identify which requirements each file implements or tests, and record the mappings.

This command uses phased execution with pre-classification, batching, progressive checkpointing, and optional subagent delegation to handle projects of any size while minimizing token usage.

## Preconditions

- `.reqtracer/requirements.json` must exist (run `/reqtracer.identify` first)
- `.reqtracer/config.json` must exist with `sourceDirs` and `testDirs` configured (run `/reqtracer.init` first)

## Steps

### 0. Load Config, Requirements & Estimate Scope

- Read `.reqtracer/config.json` for `sourceDirs` and `testDirs`
- If `sourceDirs` or `testDirs` are empty or missing, **abort** and tell the user to run `/reqtracer.init` first to configure directories
- Read `.reqtracer/requirements.json` — extract only a **working list** of `{ id, title, category }` for each requirement. Do NOT keep `fullText` or `description` in context. The `fullText` is needed only in Step 2a (keyword extraction for Large strategy); if needed there, re-read it on demand for that step only.
- Use Glob to collect all source files from `sourceDirs` and test files from `testDirs`, applying these **exclusion rules**:
  - Skip binary and non-source files: `*.png`, `*.jpg`, `*.jpeg`, `*.gif`, `*.svg`, `*.ico`, `*.woff`, `*.woff2`, `*.ttf`, `*.eot`, `*.mp3`, `*.mp4`, `*.wav`, `*.ogg`, `*.pdf`, `*.zip`, `*.gz`, `*.tar`, `*.wasm`, `*.node`, `*.pyc`, `*.pyo`, `*.class`, `*.o`, `*.so`, `*.dylib`, `*.dll`, `*.exe`, `*.map`, `*.min.js`, `*.min.css`, `*.d.ts`
  - Skip generated/vendored directories: `node_modules/`, `dist/`, `build/`, `.next/`, `coverage/`, `vendor/`, `__pycache__/`, `.venv/`, `target/`, `.git/`
- Sort files alphabetically and count total
- Set processing strategy based on file count:
  - **Small** (1-15 files): Single pass, no batching
  - **Medium** (16-50 files): Skeleton-based, batches of 10, main agent processes directly
  - **Large** (51+ files): Pre-classify, then delegate batches to subagents via the `Task` tool
- Report to the user: total file count and chosen strategy

### 1. Load Existing State (Resumability)

- Check for `.reqtracer/map-progress.json`
  - If it exists: ask the user whether to resume the previous run or start fresh
  - If resuming: load progress file, skip already-completed files
  - If starting fresh: delete the progress file and delete `.reqtracer/file-categories.json` if it exists
- Read `.reqtracer/mappings.json` if it exists
  - Remove mappings for any file that is in-scope OR no longer exists on disk. Write back. This preserves only out-of-scope, still-existing mappings.

### 2. Pre-Classification & Skeleton Extraction

**Small strategy:** Skip entirely — proceed to Step 3.

**Medium strategy:** Perform only Step 2d (skeleton extraction), then proceed to Step 3.

**Large strategy:** Perform all sub-steps (2a through 2f).

**On resume (Large only):** If `.reqtracer/file-categories.json` already exists, validate that its file list matches the current scope. If the file lists match, reuse the existing classifications and skip to Step 3. If they differ (files were added or removed since the interrupted run), delete the stale file and re-run pre-classification from scratch.

#### 2a. Build Category Keyword Index (Large only)

From `requirements.json`, build a keyword index. Re-read `requirements.json` for this step only to access `fullText`:
- For each requirement category, collect 4-8 distinctive keywords from the requirement titles and fullText in that category
- Keywords should be lowercase, deduplicated, and at least 4 characters long
- Avoid generic words that appear across many categories (e.g., "data", "user", "system", "error", "handle")
- Store as a map: `{ category: [keyword1, keyword2, ...] }`

Discard the `fullText` content from context after building the keyword index.

#### 2b. Classify Files by Category (Large only)

For each keyword, use the Grep tool to search across all source and test directories at once. This is O(keywords) Grep calls, NOT O(files x keywords):
1. For each keyword, call Grep with the keyword pattern and the project's source/test directories as the search path
2. Grep returns the list of files containing that keyword — record each file's hit count per category
3. After all keywords are grepped, assign each file a `primaryCategory` (category with most hits) and `relatedCategories` (others with hits)
4. Files with **zero** keyword hits across all categories are marked as `uncategorized`

#### 2c. Filter and Group (Large only)

- **Filter:** `uncategorized` files are separated into a "low-priority" group. These will be processed last with the full requirements list (they may be infrastructure/utility code).
- **Safeguard:** If more than 40% of files are `uncategorized`, the keyword index is too narrow. Log a warning: `"Warning: {pct}% of files are uncategorized. Keyword index may be too narrow. Consider running with Medium strategy instead."` In this case, fall back to Medium-style processing (batches of 10, full requirements list, no subagents) for all files.
- **Group:** Group remaining files by `primaryCategory`. Each group will become one or more batches that receive only the requirements from their relevant categories.

#### 2d. Extract File Skeletons (Medium and Large)

For each file in the file list, extract a structural skeleton using a single Read call per file with `limit: 50` lines. From the first ~50 lines, extract: import/export statements, function/class/method signatures (no bodies), type/interface declarations, and test block names (`describe`/`it`/`test`). Adapt to the project's language.

If a file's key signatures are likely beyond line 50 (e.g., large files), make one additional Grep call for that file to capture deeper signatures. For most files, the first 50 lines suffice.

Store skeletons as a map: `{ filePath: skeletonText }`.

#### 2e. Write Pre-Classification Results (Large only)

Write `.reqtracer/file-categories.json` (see schema below). This file contains:
- The file-to-category assignments
- The file skeletons
- The category-scoped requirements (only `id` and `title`, grouped by category)
- The batch plan

This file is used by the main agent to write per-batch context files in Step 3. Subagents do NOT read this file directly.

#### 2f. Compute Batches (Large only, Character-Budget-Based)

Compute batches based on skeleton size:
- Set a target character budget per batch: **~24,000 characters** of skeleton content
- For each category group, pack files into batches that fit within the budget
- Small-skeleton files get grouped together (potentially 15+ per batch); large-skeleton files may be alone
- `uncategorized` files form their own batches at the end
- Record the batch plan: `[ { batchId, files, categories } ]`

Report to user: `"{fileCount} files classified into {categoryCount} categories. {uncategorizedCount} uncategorized files. {batchCount} batches planned."`

### 3. Batched Mapping

Divide the remaining files (excluding completed ones if resuming) into batches per the strategy from Step 0.

**Per-file mapping logic** (applies identically across all strategies):

1. Read the file skeleton (for Medium/Large) or file content (for Small only)
2. Identify exported/public symbols: functions, classes, methods, interfaces, type exports
3. For each symbol, determine if it implements any requirement from the **scoped** requirements list (the `{ id, title, category }` working list from Step 0)
4. For test files, identify test cases (describe/it blocks, test functions) and determine which requirements they verify
5. For each mapping found, record:
   - `requirementId`: The REQ-{category}-{seq} ID
   - `type`: "code" for source files, "test" for test files
   - `target`: For code: `{ filePath, symbolName, symbolType }`. For tests: `{ filePath, testName }`
   - `reasoning`: Max 15 words explaining WHY this symbol implements/tests this requirement
   - Limit: max 5 mappings per file — pick the strongest matches if more are found

#### Small strategy (1-15 files)

Process all files in a single pass:
- Read each file, apply per-file mapping logic with the working requirements list
- No intermediate checkpointing needed
- After all files: compute SHA-256 hash of each processed file, then write `mappings.json` and `file-hashes.json`

#### Medium strategy (16-50 files)

Process in batches of 10 using skeletons extracted in Step 2d:
- For each batch: read file skeletons (not full files), apply per-file mapping logic with the working requirements list
- After each batch: compute SHA-256 hash of each original file in the batch
- After each batch: use Bash to merge new mappings into `mappings.json` on disk — do NOT re-read the full existing `mappings.json` into context. Use a script like: `node -e "const fs=require('fs'); const m=JSON.parse(fs.readFileSync('.reqtracer/mappings.json')); const b=JSON.parse(process.argv[1]); m.mappings.push(...b); fs.writeFileSync('.reqtracer/mappings.json', JSON.stringify(m,null,2))" '<new_mappings_json>'`
- After each batch: write updated `file-hashes.json` and `map-progress.json` to disk
- Report: `"Batch {n}/{total}: {count} mappings found in {fileCount} files. Running total: {sum} mappings"`

#### Large strategy (51+ files)

Process batches computed in Step 2f, delegating to subagents **sequentially** (one batch at a time):

**Per-batch processing (sequential loop):**
- **Before** launching the subagent: delete `.reqtracer/batch-context-{batchId}.json` if it exists from a previous failed run
- **Write** a per-batch context file `.reqtracer/batch-context-{batchId}.json` containing ONLY:
  - The requirements for this batch's categories (from `file-categories.json` `requirementsByCategory`, filtered to this batch's `categories`)
  - The skeletons for this batch's files only (from `file-categories.json` `skeletons`, filtered to this batch's `files`)
  - This keeps subagent context minimal — it reads only its own batch data, not the entire project
- Launch **one** `Task` subagent (`subagent_type: "general"`) with the prompt:
  ```
  Read `.reqtracer/batch-context-{batchId}.json`.
  Batch: {batchId}
  Files: {fileList}
  Categories: {categoryIds}
  For each file, read its skeleton from `skeletons`. Match symbols against
  requirements from listed categories in `requirements`.
  Record: requirementId, type (code|test), target, reasoning (max 15 words).
  Max 5 mappings per file.
  Write results to `.reqtracer/batch-results-{batchId}.json`.
  ```
- **Wait** for the subagent to complete before launching the next batch
- Read `.reqtracer/batch-results-{batchId}.json` from disk
- **Validate** that the `batchId` in the results file matches the expected batch number. If it does not match, log a warning and skip this batch (mark files for retry).
- Merge results into `mappings.json` on disk using Bash — do NOT re-read the full cumulative `mappings.json` into context. Use a merge script: `node -e "const fs=require('fs'); const m=JSON.parse(fs.readFileSync('.reqtracer/mappings.json')); const b=JSON.parse(fs.readFileSync('.reqtracer/batch-results-{batchId}.json')); m.mappings.push(...b.mappings); m.generatedAt=new Date().toISOString(); fs.writeFileSync('.reqtracer/mappings.json', JSON.stringify(m,null,2))"`
- **Compute SHA-256 hash** of each original file in the batch (the main agent does this, not the subagent)
- Write updated `file-hashes.json` and `map-progress.json` to disk
- Delete the processed `.reqtracer/batch-context-{batchId}.json` and `.reqtracer/batch-results-{batchId}.json`
- If a subagent fails: log the failure, mark its files as incomplete for retry after all other batches
- Report: `"Batch {n}/{total}: {count} mappings found in {fileCount} files. Running total: {sum} mappings"`

**Cleanup:** Delete `.reqtracer/file-categories.json` after all batches complete. Delete any remaining `batch-context-*.json` and `batch-results-*.json` files.

### 4. Completion

- Delete `.reqtracer/map-progress.json`
- Report summary:
  - Strategy used and number of batches processed
  - Total files processed (classified + uncategorized)
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

### file-categories.json (Large strategy only)

Pre-classification output written by the main agent in Step 2. Used by the main agent to produce per-batch context files. Subagents do NOT read this file directly. Deleted after all batches complete.

```json
{
  "version": "1.0",
  "requirementsByCategory": {
    "auth": [
      { "id": "REQ-auth-001", "title": "User login" },
      { "id": "REQ-auth-002", "title": "Password reset" }
    ],
    "api": [
      { "id": "REQ-api-001", "title": "REST endpoint versioning" }
    ]
  },
  "fileClassifications": {
    "src/auth.ts": { "primaryCategory": "auth", "relatedCategories": ["api"] },
    "src/utils.ts": { "primaryCategory": "uncategorized", "relatedCategories": [] }
  },
  "skeletons": {
    "src/auth.ts": "import { User } from './models'\nexport async function handleLogin(email: string, password: string): Promise<Session>\nexport function validateToken(token: string): boolean\nexport class AuthService {",
    "test/auth.test.ts": "import { handleLogin } from '../src/auth'\ndescribe('handleLogin')\n  it('should authenticate valid credentials')\n  it('should reject invalid password')"
  },
  "batchPlan": [
    { "batchId": 1, "files": ["src/auth.ts", "src/session.ts", "test/auth.test.ts"], "categories": ["auth"] },
    { "batchId": 2, "files": ["src/api.ts", "src/routes.ts"], "categories": ["api"] },
    { "batchId": 3, "files": ["src/utils.ts", "src/config.ts"], "categories": ["all"] }
  ]
}
```

### batch-context-{batchId}.json (Large strategy only)

Per-batch context file written by the main agent before launching each subagent. Contains ONLY the data relevant to that specific batch. Deleted after the batch is processed.

```json
{
  "batchId": 1,
  "requirements": [
    { "id": "REQ-auth-001", "title": "User login" },
    { "id": "REQ-auth-002", "title": "Password reset" }
  ],
  "skeletons": {
    "src/auth.ts": "import { User } from './models'\nexport async function handleLogin(...): Promise<Session>\nexport function validateToken(token: string): boolean",
    "test/auth.test.ts": "import { handleLogin } from '../src/auth'\ndescribe('handleLogin')\n  it('should authenticate valid credentials')"
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

### map-progress.json

This file is used for progressive checkpointing and resumability. It is created during Step 3 and deleted after Step 4.

```json
{
  "version": "1.0",
  "totalFiles": 42,
  "completedFiles": ["src/auth.ts"],
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
