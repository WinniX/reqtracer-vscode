# ReqTracer

A VS Code extension for **requirements traceability** — navigate seamlessly between specification documents, source code implementations, and test coverage, and detect when code changes make mappings stale.

## Features

- **AI-powered mapping** — uses Claude Code or OpenCode to identify requirements in your specs and map them to implementing code symbols and tests
- **Code navigation** — jump from a requirement to its implementations, or from a file to its requirements
- **Staleness detection** — automatically flags mappings when source files change after they were mapped
- **CodeLens & hover** — inline indicators in spec files showing mapping counts and details
- **Graph visualization** — interactive Neo4j Browser view of your full traceability matrix

## Requirements

- VS Code 1.85.0 or later
- [Claude Code](https://claude.ai/code) or [OpenCode](https://opencode.ai) CLI installed and on your PATH
- Docker (required for the visualization feature)

## Getting Started

### 1. Initialize

Open the Command Palette (`Cmd+Shift+P`) and run **ReqTracer: Initialize**.

This will:
- Ask which AI tool to use (Claude Code or OpenCode)
- Create a `.reqtracer/config.json` in your workspace
- Install the AI slash commands into `.claude/commands/` or `.opencode/commands/`

### 2. Configure directories

Edit `.reqtracer/config.json` to point at your spec, source, and test directories, or run the `/reqtracer.init` slash command in your AI tool — it will discover them interactively:

```json
{
  "version": "1.0",
  "specDirs": ["docs/specs"],
  "sourceDirs": ["src"],
  "testDirs": ["tests"],
  "aiTool": "claude-code"
}
```

### 3. Identify requirements

In your AI tool, run:

```
/reqtracer.identify
```

This scans your spec markdown files and generates `.reqtracer/requirements.json`, assigning each requirement a stable ID of the form `REQ-{category}-{seq}` (e.g., `REQ-auth-001`).

### 4. Map requirements to code

```
/reqtracer.map
```

This analyzes your source and test files, links each requirement to implementing symbols and tests, and writes the results to `.reqtracer/mappings.json`. The mapping can be interrupted and resumed — progress is tracked in `.reqtracer/progress.json`.

### 5. Navigate

- **ReqTracer: Show Requirement** — pick a requirement ID and jump to its implementations or tests
- **ReqTracer: Show Requirements for File** — from an open file, see which requirements it satisfies

### 6. Keep mappings fresh

After making code changes, run:

```
/reqtracer.check    # read-only staleness report
/reqtracer.remap    # incrementally re-map changed files only
```

The workspace watcher will also highlight stale mappings in real time as you save files.

### 7. Visualize

Run **ReqTracer: Visualize** to launch a Neo4j graph in your browser. The extension manages a Docker container automatically — no manual Neo4j setup needed.

## Commands

| Command | Description |
|---|---|
| `ReqTracer: Initialize` | Set up ReqTracer in a new workspace |
| `ReqTracer: Show Requirement` | Navigate to implementations of a requirement |
| `ReqTracer: Show Requirements for File` | Show requirements mapped to the active file |
| `ReqTracer: Visualize` | Open the Neo4j graph visualization |

## AI Slash Commands

| Command | Description |
|---|---|
| `/reqtracer.init` | Discover and configure spec/source/test directories |
| `/reqtracer.identify` | Scan specs and generate `requirements.json` |
| `/reqtracer.map` | Map requirements to code symbols and tests |
| `/reqtracer.check` | Report stale mappings (read-only) |
| `/reqtracer.remap` | Incrementally re-map changed files |

## Extension Settings

| Setting | Default | Description |
|---|---|---|
| `reqtracer.aiTool` | `"opencode"` | Which AI tool to use (`"opencode"` or `"claude-code"`) |

## Data Files

All ReqTracer data lives in `.reqtracer/` at your workspace root:

| File | Description |
|---|---|
| `config.json` | Project configuration |
| `requirements.json` | Identified requirements with IDs and source locations |
| `mappings.json` | Requirement-to-code/test trace links |
| `file-hashes.json` | SHA-256 hashes for staleness detection |
| `progress.json` | Mapping session cursor (temporary, safe to delete) |

Add `.reqtracer/progress.json` to `.gitignore`; commit the rest.

## Traceability Graph Model

The Neo4j visualization uses a property graph:

- **Nodes**: `Requirement`, `CodeSymbol`, `TestSymbol`
- **Edges**: `IMPLEMENTS` (code → requirement), `VERIFIED_BY` (test → requirement)

## License

MIT
