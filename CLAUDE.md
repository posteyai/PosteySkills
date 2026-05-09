# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This repository packages AI-agent skills for Postey — markdown skill definitions plus a zero-dependency Node.js CLI that agents invoke to draft, schedule, and manage social media posts. Multiple skills are planned; `postey` is the first.

Note: `AGENTS.md` is a symlink to this file; edits propagate.

## Repository Layout

```
PosteySkills/
├── .claude-plugin/
│   └── marketplace.json       — Marketplace catalog listing all plugins
├── .claude/
│   └── settings.json          — extraKnownMarketplaces for team auto-install
├── .github/workflows/
│   └── test.yml               — CI: node --test + check-versions + check-platform-sync
├── scripts/
│   ├── check-versions.js      — CI: verify SKILL.md version == plugin.json == marketplace
│   └── check-platform-sync.js — CI: verify SOCIAL_PLATFORMS in JS == platforms in SKILL.md
├── tests/
│   └── postey-cli.test.js     — node:test suite for postey CLI
└── skills/
    ├── REGISTRY.md            — Index of all skills in this repo
    ├── _template/             — Starter template for new skills (copy and fill in)
    └── postey/                — The postey skill
        ├── .claude-plugin/
        │   └── plugin.json    — Plugin manifest (required for /plugin install)
        ├── SKILL.md           — Authoritative skill spec (< 500 lines)
        ├── CHANGELOG.md       — User-facing changelog
        ├── command-reference.md — Full command table (loaded on demand)
        ├── routing-guide.md   — Extended CLI vs MCP routing reference
        ├── video-workflow.md  — Video transcription + cross-post workflow
        ├── prompts.md         — Platform caption generation templates
        └── scripts/
            ├── postey.js      — Main CLI (zero runtime deps, Node 18+)
            ├── video2post.js  — Video transcription + cross-post
            └── mediaValidator.js — MIME validation
```

## Multi-Skill Conventions

- **Each skill is self-contained** in its `skills/<name>/` directory — no runtime cross-dependencies between skills.
- **Each skill must have** `skills/<name>/.claude-plugin/plugin.json` for the plugin install flow to work.
- **Shared dev tooling** lives in `scripts/` at the repo root (CI checks only, never runtime code).
- **Git tags** use the format `skills/{name}/vX.Y.Z` (e.g. `skills/postey/v1.2.0`).
- **Version must be consistent** across: `SKILL.md` frontmatter `version:`, `plugin.json`, and the marketplace entry. The CI `check-versions.js` script enforces this.
- **To add a new skill**: copy `skills/_template/` to `skills/<new-name>/`, fill in the SKILL.md and plugin.json, add a `plugins` entry in `.claude-plugin/marketplace.json`, and add a row to `skills/REGISTRY.md`.

## CLI Architecture (`skills/postey/scripts/postey.js`)

- **Single file, zero runtime deps**, CommonJS, Node.js 18+ (uses built-in `fetch`). `package.json` is private — `npm install` is not required.
- **API base**: `https://srvr.postey.ai/v1`, overridable via `POSTEY_API_BASE` (the test suite uses this to point at a local mock server).
- **All commands output JSON to stdout**; human-readable chrome (colors, prompts) goes to stderr and is gated on `process.stderr.isTTY`. Don't add stdout logging — tests parse stdout as JSON.
- **Auth resolution priority** (highest to lowest):
  1. `POSTEY_API_KEY` env var
  2. `./.postey/config.json` (project-local)
  3. `~/.config/postey/config.json` (user-global)
- **Platform enum** is defined in one place (`SOCIAL_PLATFORMS`). When adding or removing a platform, also update: `SKILL.md` frontmatter `platforms:` list, `skills/postey/SKILL.md` Platform Names table, `.claude-plugin/marketplace.json` plugin description. The CI `check-platform-sync.js` script verifies JS ↔ SKILL.md consistency.

## Installation Flow

Users install via:
```
/plugin marketplace add posteyai/PosteySkills
/plugin install postey@postey-skills
```

Or teams using the committed `.claude/settings.json` get auto-prompted on project trust.

## Common Commands

```bash
# Run the full test suite (includes CI checks)
npm test                                        # or: node --test

# Run a single test file
node --test tests/postey-cli.test.js

# Filter to a single test by name
node --test --test-name-pattern="<substring>" tests/postey-cli.test.js

# Run CI checks manually
node scripts/check-versions.js
node scripts/check-platform-sync.js

# Smoke test (requires a real API key)
./skills/postey/scripts/postey.js setup
./skills/postey/scripts/postey.js social-sets:list
```

There is no build step, no lint config, and no formatter config in this repo.

## When Editing the Skill or CLI

1. **Update `version:`** in `skills/postey/SKILL.md` frontmatter, `skills/postey/.claude-plugin/plugin.json`, and the plugin entry in `.claude-plugin/marketplace.json` — all three must match. Run `node scripts/check-versions.js` to verify.
2. **Update `skills/postey/CHANGELOG.md`** for user-facing changes (new commands/flags, behavior changes, bug fixes). Skip internal refactors, test/CI changes, formatting-only edits.
3. **Keep SKILL.md and CLI in sync**: if you add/rename a command or flag, update `command-reference.md`. The command list in `command-reference.md` is the contract agents read.
4. **SKILL.md body must stay under 500 lines** — move heavy content to supporting files (`command-reference.md`, `video-workflow.md`, `routing-guide.md`).
5. **Preserve JSON-only stdout** in the CLI — any new output path must go to stderr or be part of the JSON payload.
6. **Do not remove `last-updated` from SKILL.md** — the field was removed; do not re-add it. Freshness tracking is via CHANGELOG and git history.

## Commit & PR Guidelines

- Do not add "Co-authored with Claude" or similar AI-assistant attributions to commit messages or PR descriptions.
