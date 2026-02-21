# /reqtracer.remap - Incremental Remapping

You are performing incremental remapping of requirements for a software project. Your task is to re-analyze only the files that have changed since the last mapping and update their requirement mappings.

## Preconditions

- `.reqtracer/mappings.json` must exist
- `.reqtracer/file-hashes.json` must exist
- `.reqtracer/requirements.json` must exist

## Steps

### 1. Detect Stale Files

- Read `.reqtracer/file-hashes.json` and `.reqtracer/mappings.json`
- For each file in `file-hashes.json`, compute current SHA-256 hash
- Identify files where current hash differs from stored hash
- Collect the requirement IDs linked to each stale file

### 2. Check for No Changes

If no files are stale, report: "All mappings are current. No files need remapping." and exit.

### 3. Re-analyze Stale Files

For each stale file (one at a time):
1. Report progress: `"Remapping file {n}/{total}: {filepath}"`
2. Read the file content
3. Load the requirements linked to this file
4. Re-analyze: identify which requirements the file's symbols implement/test
5. Update mappings for this file in `.reqtracer/mappings.json` (replace previous mappings for this file)
6. Update the file hash in `.reqtracer/file-hashes.json`

### 4. Report Summary

After completion, report:
- Total stale files remapped
- Total mappings updated
- Requirements affected
