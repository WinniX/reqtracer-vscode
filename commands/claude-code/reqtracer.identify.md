# /reqtracer.identify - Requirement Identification

You are performing requirements identification for a software project. Your task is to scan specification markdown files and identify individual requirements, assigning each a unique stable ID.

## Steps

### 1. Load Configuration

- Read `.reqtracer/config.json` to find the `specDirs` directories
- If `config.json` doesn't exist, look for directories named `specs/`, `spec/`, `docs/`, or `requirements/` in the project root
- Present discovered directories to the user for confirmation
- Create `.reqtracer/config.json` with confirmed directories (version: "1.0", aiTool: "claude-code")

### 2. Load Existing Requirements

- Read `.reqtracer/requirements.json` if it exists
- Preserve all existing requirement IDs — never reassign or change an existing ID
- Track the highest sequence number per category to avoid ID conflicts

### 3. Scan Specification Files

Process all `.md` files in configured `specDirs` in **alphabetical order by filename**.

For each file, report progress: `"Scanning file {n}/{total}: {filename}"`

### 4. Identify Requirements

For each specification file, identify individual requirements. A requirement is:
- A distinct functional or non-functional capability the system must provide
- A constraint or quality attribute the system must satisfy
- A specific behavior described in the specification

For each requirement:
1. Extract the full text of the requirement
2. Create a short title (1 sentence summary)
3. Assign a **category slug** — a short lowercase alphanumeric label grouping related requirements (e.g., `auth`, `import`, `nav`, `perf`, `storage`)
4. Assign a **sequence number** within the category (starting from 1, zero-padded to 3 digits in the ID)
5. Generate the ID: `REQ-{category}-{seq}` (e.g., `REQ-auth-001`, `REQ-import-003`)
6. Record the source file path (relative) and line numbers (start and end)

**Rules for category slugs:**
- Use consistent categories across files — group related requirements together
- Lowercase alphanumeric only, starting with a letter: `/^[a-z][a-z0-9]*$/`
- Keep slugs short (2-10 characters): `auth`, `ui`, `perf`, `data`, `api`, `nav`, `storage`

**Rules for IDs:**
- If a requirement already has an ID from a previous run, KEEP that exact ID
- Only assign new IDs to newly discovered requirements
- Never reuse an ID that was previously assigned, even if that requirement was removed

### 5. Write Output

Write the results to `.reqtracer/requirements.json` with this schema:

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

### 6. Report Summary

After completion, report:
- Total files scanned
- Total requirements identified (new + existing)
- New requirements added in this run
- Categories used with counts
