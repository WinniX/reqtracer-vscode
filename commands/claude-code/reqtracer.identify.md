# /reqtracer.identify - Requirement Identification

You are performing requirements identification for a software project. Your task is to scan specification markdown files and identify individual requirements, assigning each a unique stable ID.

This command uses phased execution with batching, progressive checkpointing, and optional subagent delegation to handle projects of any size.

## Steps

### 0. Load Config & Estimate Scope

- Read `.reqtracer/config.json` to find the `specDirs` directories
- If `config.json` doesn't exist or `specDirs` is empty, abort and tell the user to run `/reqtracer.init` first
- Use Glob to find all `.md` files across all `specDirs`, sort alphabetically, count total
- Set processing strategy based on file count:
  - **Small** (1-10 files): Single pass, no batching
  - **Medium** (11-30 files): Batches of 10 files, main agent processes directly
  - **Large** (31+ files): Batches of 8 files, delegate each batch to a subagent via the `Task` tool
- Report to the user: total file count and chosen strategy

### 1. Load Existing State (Resumability)

- Check for `.reqtracer/identify-progress.json`
  - If it exists: ask the user whether to resume the previous run or start fresh
  - If resuming: load progress file, skip already-completed files, load pending requirements
  - If starting fresh: delete the progress file
- Read `.reqtracer/requirements.json` if it exists
  - Preserve all existing requirement IDs — never reassign or change an existing ID
  - Track the highest sequence number per category to avoid ID conflicts
  - Build a lookup of existing requirements keyed by (sourceFile, sourceLineStart) for matching

### 2. Batched Requirement Extraction

Divide the remaining files (excluding completed ones if resuming) into batches per the strategy from Phase 0.

**For each requirement found**, extract:
- The full text of the requirement
- A short title (1 sentence summary)
- A preliminary category slug
- The source file path (relative) and line numbers (start and end)

A requirement is:
- A distinct functional or non-functional capability the system must provide
- A constraint or quality attribute the system must satisfy
- A specific behavior described in the specification

#### Small strategy (1-10 files)

Process all files in a single pass:
- Read each file, identify requirements, assign preliminary category slugs
- No intermediate checkpointing needed

#### Medium strategy (11-30 files)

Process in batches of 10:
- Read all files in the batch, identify requirements, assign preliminary category slugs
- After each batch: write intermediate results to `.reqtracer/identify-progress.json`
- Report: `"Batch {n}/{total}: {count} requirements found. Running total: {sum}"`

#### Large strategy (31+ files)

Process in batches of 8, delegating to subagents:
- For each batch, launch a `Task` subagent (subagent_type: "general-purpose") with:
  - The list of file paths to process
  - The list of existing category slugs to prefer reusing
  - The rules for identifying requirements and assigning category slugs (copy the rules below)
  - Instruction to return a JSON array of extracted requirements (fullText, title, suggestedCategory, sourceFile, sourceLineStart, sourceLineEnd)
- Main agent collects results from each subagent and merges into the progress file
- After each subagent completes: write updated state to `.reqtracer/identify-progress.json`
- If a subagent fails: log the failure, mark its files as incomplete for retry in a subsequent batch
- Report: `"Batch {n}/{total}: {count} requirements found. Running total: {sum}"`

**Rules for preliminary category slugs** (include these in subagent prompts for the Large strategy):
- Reuse existing categories from `requirements.json` when applicable
- New slugs: lowercase alphanumeric only, starting with a letter: `/^[a-z][a-z0-9]*$/`
- Keep slugs short (2-10 characters): `auth`, `ui`, `perf`, `data`, `api`, `nav`, `storage`
- Categories are preliminary at this stage — they will be normalized in Phase 3

### 3. Category Consolidation

After all batches complete:

- Collect all unique category slugs: existing ones from `requirements.json` plus new ones from extraction
- Build a frequency table: category slug -> count of requirements + list of source files
- Identify merge candidates:
  - Synonyms (e.g., "authn" and "login" could merge into "auth")
  - Overlapping prefixes (e.g., "userauth" and "user" might consolidate)
  - Categories with very few requirements (1-2) that could fold into a broader category
- Present a consolidation proposal to the user for approval. Format:
  ```
  MERGE: "authn" (3) + "login" (2) -> "auth" (12 existing)
  KEEP: "api" (8) — no conflicts
  NEW: "export" (4) — new category
  ```
- Wait for user approval before applying
- Apply accepted merges to **new requirements only**. Existing IDs from `requirements.json` are NEVER changed.

### 4. ID Assignment

- For requirements matching existing entries (same source file + overlapping line range + similar text): preserve the exact existing ID
- For new requirements: assign `REQ-{category}-{seq}` using the consolidated categories
  - Sequence numbers continue from the highest existing seq in that category
  - Zero-pad to 3 digits in the ID (e.g., `REQ-auth-001`, `REQ-import-014`)
- Never reuse an ID that was previously assigned, even if that requirement was removed

### 5. Write Output & Report

- Write the final results to `.reqtracer/requirements.json` with this schema:

```json
{
  "version": "1.0",
  "generatedAt": "<ISO 8601 timestamp>",
  "requirements": [
    {
      "id": "REQ-auth-001",
      "title": "User login with email and password",
      "fullText": "The system must allow users to...",
      "sourceFile": "specs/001-feature/spec.md",
      "sourceLineStart": 42,
      "sourceLineEnd": 48,
      "category": "auth",
      "seq": 1
    }
  ]
}
```

- Delete `.reqtracer/identify-progress.json` (cleanup)
- Report to the user:
  - Total files scanned
  - Total requirements (existing preserved + newly added)
  - New requirements added in this run
  - Categories with counts
  - Batches processed
  - Category merges applied (if any)
- Suggest next step if applicable

### Schema: identify-progress.json

This file is used for progressive checkpointing and resumability. It is created during Phase 2 and deleted after Phase 5.

```json
{
  "version": "1.0",
  "totalFiles": 42,
  "fileList": ["specs/auth.md", "specs/api.md"],
  "completedFiles": ["specs/auth.md"],
  "batchResults": [
    {
      "batchId": 1,
      "files": ["specs/auth.md"],
      "requirementsFound": 7,
      "categoriesUsed": ["auth", "api"]
    }
  ],
  "pendingRequirements": [
    {
      "fullText": "The system must allow users to...",
      "title": "User login with email and password",
      "suggestedCategory": "auth",
      "sourceFile": "specs/auth.md",
      "sourceLineStart": 10,
      "sourceLineEnd": 15
    }
  ],
  "lastUpdated": "<ISO 8601 timestamp>"
}
```
