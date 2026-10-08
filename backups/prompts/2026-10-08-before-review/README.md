# Prompt backup before review

Saved October 8, 2026, before any prompt edits.

- `sources/` preserves the original prompt source files, runtime notes, and scenario-data dependencies byte for byte.
- `gameplay/` contains complete synthetic ALS and BLS system prompts, including the API wrapper.
- `debrief/` contains independent ALS and BLS evaluator system prompts and example context inputs.
- `manifest.json` records the original Git commit and SHA-256 hashes of source files.

Gameplay and debrief are separate instruction scopes. Debrief coaching does not authorize gameplay coaching.

To restore a source file, copy its matching file from `sources/` back to the same repository-relative path. The backup directory should be retained unchanged.
