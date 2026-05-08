# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This repository packages AI-agent skills for Postey — markdown skill definitions plus a zero-dependency Node.js CLI that agents invoke to draft, schedule, and manage social media posts (currently X and LinkedIn).

Note: `AGENTS.md` is a symlink to this file; edits propagate.

## Repository Layout

- `skills/postey/SKILL.md` — authoritative spec for the skill: frontmatter (`name`, `description`, `allowed-tools`, `last-updated`), agent workflow, and the full command reference. **Treat this as the source of truth for CLI surface area** — the list here in CLAUDE.md intentionally does not duplicate it.
- `skills/postey/scripts/postey.js` — the CLI agents shell out to (via `allowed-tools: Bash(./scripts/postey.js:*)`).
- `skills/postey/CHANGELOG.md` — user-facing changelog for the skill and CLI.
- `tests/postey-cli.test.js` — node:test suite that spawns the CLI against a sandboxed HOME/cwd and a mock HTTP server.
- `.claude-plugin/marketplace.json` — Claude Code plugin marketplace entry.
- `.github/workflows/test.yml` — CI: runs `node --test` on Node 18.x / 20.x / 22.x.

## CLI Architecture (`skills/postey/scripts/postey.js`)

- **Single file, zero runtime deps**, CommonJS, Node.js 18+ (uses built-in `fetch`). `package.json` is private — `npm install` is not required.
- **API base**: `https://srvr.postey.ai/v1`, overridable via `POSTEY_API_BASE` (the test suite uses this to point at a local mock server).
- **All commands output JSON to stdout**; human-readable chrome (colors, prompts) goes to stderr and is gated on `process.stderr.isTTY`. Don't add stdout logging — tests parse stdout as JSON.
- **Auth resolution priority** (highest to lowest):
  1. `POSTEY_API_KEY` env var
  2. `./.postey/config.json` (project-local)
  3. `~/.config/postey/config.json` (user-global)
- **Platform enum** is defined in one place (`SOCIAL_PLATFORMS`) — currently `X` and `LINKEDIN`. Note that `.claude-plugin/marketplace.json` advertises a broader set (Threads, Bluesky, Mastodon); keep these in sync when adding/removing a platform, and also update `SKILL.md`'s "Platform Names" section.

## Common Commands

```bash
# Run the full test suite
npm test                                    # or: node --test

# Run a single test file
node --test tests/postey-cli.test.js

# Filter to a single test by name (node:test)
node --test --test-name-pattern="<substring>" tests/postey-cli.test.js

# Interactive manual smoke test (requires a real API key)
./skills/postey/scripts/postey.js setup
./skills/postey/scripts/postey.js social-sets:list
```

There is no build step, no lint config, and no formatter config in this repo.

## When Editing the Skill or CLI

1. **Update `last-updated`** in `skills/postey/SKILL.md` frontmatter to today's date. The skill uses this for a 30-day freshness warning to users.
2. **Update `skills/postey/CHANGELOG.md`** if the change is user-facing (new commands/flags, behavior changes, bug fixes, error messages, defaults). Skip internal refactors, test/CI changes, and formatting-only edits.
3. **Keep SKILL.md and the CLI in sync**: if you add/rename a command or flag, update the command reference and examples in SKILL.md. The CLI's command list is the contract agents read.
4. **Preserve JSON-only stdout** in the CLI — any new output path must either go to stderr or be part of the JSON payload.

## Commit & PR Guidelines

- Do not add "Co-authored with Claude" or similar AI-assistant attributions to commit messages or PR descriptions.
