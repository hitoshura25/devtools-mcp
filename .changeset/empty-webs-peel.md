---
---

Fix changesets workflow orchestration by combining version and publish logic into single CI workflow. This resolves timing issues where release workflow ran prematurely, git detached HEAD errors during publishing, and simplifies the workflow architecture.

Key changes:
- Combined `changesets/action@v1` with both `version` and `publish` parameters in ci.yml
- Deleted separate release.yml workflow (no longer needed)
- Added auto-merge capability for Version Packages PRs
- Ensured workflow always runs on main branch (not detached HEAD)

This follows the standard Changesets pattern used by the community.