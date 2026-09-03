<!-- Title: release(<repo>): one-line summary, 72 characters maximum. Merge as a merge commit,
     never squash. Delete every guidance comment before you open the PR. -->

## Summary
<!-- One line. What this release carries to production. -->

## Why now
<!-- The reason this ships today: a date, an incident, a dependency. -->

## What this carries
<!-- `gh pr list --base dev --state merged --search "merged:>YYYY-MM-DD"` lists the candidates. -->
| PR | Title | Type | Migration | Config |
|---|---|---|---|---|
| #N | | feat, fix or chore | yes or no | yes or no |

## Before merge
<!-- `None` plus a reason on an empty line. -->
- Migrations:
- Config and secrets:
- Cross-repo order:

## Verified
<!-- Both columns from a run on the release SHA. -->
| Gate | Base `main` | Head `dev` |
|---|---|---|
| Tests | | |
| Lint and build | | |
| Smoke on the dev lane | | |

## After merge
<!-- Deploy step, smoke check, who watches, for how long. -->

## Risk and rollback
<!-- Largest risk in this set. Revert path: redeploy SHA, or revert PR #N. -->

## Merge checklist
- [ ] `wt sync <repo> --check` reports dev >= main. Evidence: the output line
- [ ] Every table row links a merged PR with a completed merge checklist. Evidence: PR numbers
- [ ] Migration plan matches `alembic heads`, one head. Evidence: head id, or `No migration`
- [ ] Config and secrets exist in the target environment. Evidence: PosteyInfra#N, or `None`
- [ ] Both gate columns filled from the release SHA. Evidence: SHA
- [ ] Deployed SHA confirmed to move after deploy. Evidence: SHA and where recorded
- [ ] Post-merge watch owner named. Evidence: name and window
