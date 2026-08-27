# Contributing

This repo packages AI-agent skills for Postey: markdown skill definitions plus a
zero-dependency Node CLI that agents invoke.

`CLAUDE.md` is the working reference — repository layout, CLI architecture, the MCP
contracts. Read it before a first change. This file covers the process around it.

## Setup

Node 18 or newer. There is no build step, no linter config and no formatter config.

```bash
npm test          # node --test, plus the CI checks
```

`package.json` is private and has no runtime dependencies. `npm install` is not required.

## Before you open a PR

Run the checks. They are the same ones CI runs, and they catch the mistakes that are
easy to make here.

```bash
npm test
node scripts/check-versions.js
node scripts/check-leaks.js .
```

| Check | Catches |
|---|---|
| `check-versions` | A version updated in one of the six places and not the other five |
| `check-leaks` | Secret-shaped strings, and internal names that should not be in a public repo |
| `check-doc-commands` | A documented command that does not exist in the CLI |
| `check-cross-skill-links` | A skill referencing a file it does not ship |
| `check-mcp-tool-sync` | `SKILL.md mcp-tools.tools:` drifting from the server registry |

## Changing a skill

**Version lives in six places and they must agree**: `SKILL.md` frontmatter,
`.claude-plugin/plugin.json`, the entry in `.claude-plugin/marketplace.json`,
`pack.json` (both `version` and the tag inside `rawBase`), the `skills/REGISTRY.md`
row, and the README badge. `check-versions.js` fails the build otherwise.

At release, push the tag `skills/<name>/vX.Y.Z`. `pack.json`'s `rawBase` points at it,
so fetch-based installs 404 until the tag exists.

**`SKILL.md` stays under 500 lines.** Move detail into `references/`, which costs no
context until an agent reads it. Anything you add to a skill directory must also be
listed in that skill's `pack.json`, or the pack-manifest test fails.

**Update the skill's `CHANGELOG.md`** for user-facing changes — new commands or flags,
behaviour changes, bug fixes. Skip internal refactors and CI-only edits.

## Adding a skill

Follow the checklist in `CLAUDE.md` under "Adding a New Skill". In short: copy
`skills/_template/`, fill in the frontmatter and `plugin.json`, add a `plugins` entry
to the marketplace, add a `REGISTRY.md` row, then run `npm test`.

Name the skill for the job someone asks for, not for the API surface it touches, and
keep the `postey-` prefix — registry slugs and loose installs share one flat namespace.

## The CLI

Single file per skill, CommonJS, zero runtime dependencies, Node 18+.

**All JSON goes to stdout; human-readable output goes to stderr** and is gated on
`process.stderr.isTTY`. The test suite parses stdout as JSON, so a stray `console.log`
breaks it.

## Commits

Conventional-commit subjects. Say what changed and why it was wrong before — a message
that only restates the diff tells a later reader nothing they could not already see.

**Do not add AI-assistant attributions or co-author trailers.**

## Security

Never commit an API key, token, or account-specific identifier. `check-leaks.js` is a
backstop, not a substitute for not writing one down. If you find a leaked credential,
see `SECURITY.md`.
