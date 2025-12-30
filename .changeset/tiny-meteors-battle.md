---
---

Fix pre-commit hook to use check-only behavior instead of attempting interactive changeset creation. Git hooks cannot run interactive commands, so the hook now only validates that a changeset exists and fails with a helpful message if missing. Also added project-specific CLAUDE.md with changeset creation guidelines.

This is a development tooling change that does not affect published packages.