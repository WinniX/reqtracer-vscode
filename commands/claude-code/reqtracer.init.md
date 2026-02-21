# /reqtracer.init - Project Configuration

You are configuring a software project for requirements traceability. Your task is to discover the project's specification, source, and test directories, confirm them with the user, and write the configuration.

## Preconditions

- `.reqtracer/config.json` must exist with at least `version` and `aiTool` set (created by the VS Code "ReqTracer: Initialize" command)

## Steps

### 1. Load Existing Configuration

- Read `.reqtracer/config.json`
- Note which directory arrays are already populated and which are empty

### 2. Discover Specification Directories

If `specDirs` is empty:

- Look for directories named `specs/`, `spec/`, `docs/`, `requirements/`, `design/` in the project root
- Look for directories containing `.md` files that appear to be specifications (requirement language, feature descriptions)
- Present discovered directories to the user for confirmation
- If no spec directories are found, ask the user to provide them

If `specDirs` is already populated, show the current value and ask the user if they want to keep or change it.

### 3. Discover Source Directories

If `sourceDirs` is empty:

- Look for directories named `src/`, `lib/`, `packages/`, `app/`, `core/` in the project root
- Examine the project structure for source code directories (TypeScript, JavaScript, Python, etc.)
- Exclude `node_modules/`, `dist/`, `build/`, `.git/`, and other common non-source directories
- Present discovered directories to the user for confirmation
- If no source directories are found, ask the user to provide them

If `sourceDirs` is already populated, show the current value and ask the user if they want to keep or change it.

### 4. Discover Test Directories

If `testDirs` is empty:

- Look for directories named `test/`, `tests/`, `__tests__/`, `spec/` in the project root
- Look for files matching `*.test.*`, `*.spec.*` patterns in source directories
- Present discovered directories to the user for confirmation
- If no test directories are found, inform the user and set `testDirs` to `[]`

If `testDirs` is already populated, show the current value and ask the user if they want to keep or change it.

### 5. Update Configuration

- Update `.reqtracer/config.json` with the confirmed directories
- Preserve the existing `version` and `aiTool` values
- Write the file atomically

### 6. Report Summary

After completion, report:
- The final configuration written to `.reqtracer/config.json`
- Suggest next step: run `/reqtracer.identify` to scan specs and assign requirement IDs
