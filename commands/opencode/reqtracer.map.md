---
description: Map requirements to code and test symbols in source files
agent: general
---

# /reqtracer.map - Requirement-to-Code/Test Mapping

You are performing requirements-to-code mapping for a software project. Your task is to analyze source and test files, identify which requirements each file implements or tests, and record the mappings.

## Preconditions

- `.reqtracer/requirements.json` must exist (run `/reqtracer.identify` first)
- `.reqtracer/config.json` must exist

## Steps

### 1. Load Configuration and Requirements

- Read `.reqtracer/config.json` for `sourceDirs` and `testDirs`
- If `sourceDirs` or `testDirs` are not configured, discover them (look for `src/`, `lib/`, `packages/` for source; `test/`, `tests/`, `__tests__/`, `*.test.*`, `*.spec.*` for tests)
- Present discovered directories to the user for confirmation and update `config.json`
- Read `.reqtracer/requirements.json` to get the full list of requirements

### 2. Check for Resume

- Check if `.reqtracer/progress.json` exists
- If it does, ask the user: "A previous mapping session was interrupted at file {n}/{total}. Resume? (yes/no)"
- If resume: start from `lastCompleted + 1`
- If no resume: start fresh, overwrite progress

### 3. Build File List

- Collect all source files from `sourceDirs` and test files from `testDirs`
- Sort alphabetically
- Create `.reqtracer/progress.json` with the file list and `lastCompleted: -1`

### 4. Process Each File

For each file in the list (one at a time, in order):

1. Report progress: `"Processing file {n}/{total}: {filepath}"`
2. Read the file content
3. Identify all symbols in the file (functions, classes, methods, interfaces, exports, variables)
4. For each symbol, determine if it implements any requirement from the requirements list
5. For test files, identify test cases (describe/it blocks, test functions) and determine which requirements they verify

For each mapping found, record:
- `requirementId`: The REQ-{category}-{seq} ID
- `type`: "code" for source files, "test" for test files
- `target`: For code: `{ filePath, symbolName, symbolType }`. For tests: `{ filePath, testName }`
- `reasoning`: A brief explanation of WHY this symbol implements/tests this requirement

6. After processing each file:
   - Update `.reqtracer/mappings.json` — replace all previous mappings for this file path, then add the new ones
   - Compute SHA-256 hash of the file and update `.reqtracer/file-hashes.json`
   - Update `.reqtracer/progress.json` cursor

### 5. Completion

- Delete `.reqtracer/progress.json`
- Report summary:
  - Total files processed
  - Total mappings created (code + test)
  - Requirements with code mappings vs total requirements
  - Requirements with test mappings vs total requirements

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
