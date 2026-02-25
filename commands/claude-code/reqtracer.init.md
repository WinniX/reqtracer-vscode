# /reqtracer.init - Project Configuration

You are configuring a software project for requirements traceability. Your task is to discover the project's specification, source, and test directories, confirm them with the user, and write the configuration.

This command uses phased execution with scope-aware strategies to handle projects of any size, from single-package repos to large monorepos.

## Preconditions

- `.reqtracer/config.json` must exist with at least `version` and `aiTool` set (created by the VS Code "ReqTracer: Initialize" command)

## Steps

### 0. Load Config & Estimate Scope

- Read `.reqtracer/config.json`
- Note which directory arrays are already populated and which are empty
- Estimate project scope: use Glob to count top-level directories and depth-2 directories
- Detect project archetype:
  - **Monorepo**: check for presence of `packages/`, `apps/`, or config files `pnpm-workspace.yaml`, `nx.json`, `turbo.json`, `lerna.json`
  - **Standard**: single `src/`/`lib/` at root, no workspace indicators
- If more than 50 directories at depth 2, warn the user and limit subsequent scans to depth 2
- Report to the user: detected archetype (Monorepo or Standard) and estimated scope (number of top-level dirs, number of depth-2 dirs)

### 1. Discover Specification Directories

If `specDirs` is empty:

- Search for directories with canonical names: `specs/`, `spec/`, `docs/`, `requirements/`, `design/`, `rfcs/`
- If monorepo archetype: also search within each package/app root (e.g., `packages/*/specs/`, `apps/*/docs/`)
- For each candidate directory:
  - Count `.md` files using Glob
  - Sample up to 3 `.md` files and check for requirement language ("must", "shall", "requirement", "should", "the system")
  - Score candidates: directories with more `.md` files and stronger requirement language rank higher
- Present ranked candidates to the user with file counts for confirmation
- For large monorepos (more than 5 packages): group candidates by package in a summary table
- If no spec directories are found, ask the user to provide them

If `specDirs` is already populated, show the current value and ask the user if they want to keep or change it.

### 2. Discover Source Directories

If `sourceDirs` is empty:

- Search for directories with canonical names: `src/`, `lib/`, `packages/`, `app/`, `core/`
- Exclude well-known non-source directories: `node_modules/`, `dist/`, `build/`, `.git/`, `.next/`, `coverage/`, `vendor/`, `__pycache__/`, `.venv/`, `target/`
- If monorepo archetype: iterate per-package (e.g., `packages/*/src/`, `apps/*/src/`)
- Count source files in each candidate using Glob. If any candidate has more than 500 files, warn the user about potential mapping effort
- Present candidates to the user grouped by package (monorepo) or as a flat list (standard)
- If no source directories are found, ask the user to provide them

If `sourceDirs` is already populated, show the current value and ask the user if they want to keep or change it.

### 3. Discover Test Directories

If `testDirs` is empty:

- Search for directories named `test/`, `tests/`, `__tests__/`, `spec/` (avoid double-counting with specDirs)
- Search for colocated test files matching `*.test.*`, `*.spec.*` patterns in source directories
- If monorepo archetype: search per-package
- Present candidates to the user for confirmation
- If no test directories are found, inform the user and set `testDirs` to `[]`

If `testDirs` is already populated, show the current value and ask the user if they want to keep or change it.

### 4. Write Config & Report

- Update `.reqtracer/config.json` with the confirmed directories
- Preserve the existing `version` and `aiTool` values
- Write the file atomically
- Report a scope summary including:
  - Project archetype
  - Final directory configuration
  - File counts per directory type (spec files, source files, test files)
  - Estimated mapping effort: **Small** (<50 source files), **Medium** (50-500), **Large** (>500)
- Suggest next step: run `/reqtracer.identify` to scan specs and assign requirement IDs
