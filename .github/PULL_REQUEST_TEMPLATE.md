<!-- Title: type(scope): imperative summary, 72 characters maximum.
     This body becomes the commit message. Delete every guidance comment before you open the PR. -->

## Why
<!-- The problem, who hits it, and the evidence. Link the log line, tracker row, or issue. -->

## What changed
<!-- Behaviour-level bullets. Name every changed contract: route, schema, env var, unit, flag.
     Do not narrate the diff file by file. -->

## Decisions
<!-- Non-obvious choices. Alternatives rejected and why. Known shortcomings. `None` plus a reason. -->

## Verified
<!-- One line per command, with where it ran and the result. Where the base is red, show base
     and branch counts and the failure-name diff. -->
- `command` on `<sha>`: result

## Not verified
<!-- What did not run, why, and the risk if it is wrong. `None` plus a reason. -->

## Reviewer focus
<!-- One to three places to read first, each with the question to answer. -->

## Out of scope
<!-- Adjacent work left out on purpose, with the follow-up link. -->

## Risk and rollback
<!-- Risk level and reason. Rollback path: revert, flag, or migration down.
     Merge into main is a deploy. Name what to watch after merge. -->

## Related
<!-- Part of <program> · stage <id>. Companion: <owner/repo>#N. Blocked by <owner/repo>#N.
     Blocks <owner/repo>#M. Tracker: <program>/F-NNN. `Closes #N` only on a PR into main,
     `Refs: #N` elsewhere. -->

## Merge checklist
<!-- Tick an item only with its evidence written beside it. `N/A` needs a reason. -->
- [ ] Description re-read after the last push and guidance comments deleted. Evidence: final SHA
- [ ] Every Verified line ran on the final commit. Evidence: the SHA on each line
- [ ] CodeRabbit findings fixed or answered with a reason. Evidence: zero open threads, or `N/A` because the base is not main
- [ ] Blocked-by PRs merged in the stated order. Evidence: PR numbers, or `N/A`
- [ ] Migrations: `alembic heads` shows one head and the one-off ECS task is planned. Evidence: task name, or `No migration`
- [ ] New env or task-definition variables declared in PosteyInfra. Evidence: PosteyInfra#N, or `None`
- [ ] Labels: at most three bare words. Evidence: `gh pr view --json labels` output
- [ ] Base is main: post-merge watch owner named, `wt sync <repo>` run after merge, tracker row DONE only after the green gate. Evidence: name and gate output, or `N/A`
