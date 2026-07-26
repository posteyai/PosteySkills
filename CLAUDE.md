# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This repository packages AI-agent skills for Postey — markdown skill definitions plus a zero-dependency Node.js CLI that agents invoke to draft, schedule, and manage social media posts. Multiple skills are planned; `postey` is the first.

Note: `AGENTS.md` is a symlink to this file; edits propagate.

## Repository Layout

```
skills/  (repo: posteyai/skills)
├── .claude-plugin/
│   └── marketplace.json       — Marketplace catalog listing all plugins
├── .claude/
│   └── settings.json          — extraKnownMarketplaces for team auto-install
├── .github/workflows/
│   └── test.yml               — CI: node --test + check-versions + check-leaks (2 scopes) + check-platform-sync + check-mcp-tool-sync
├── scripts/
│   ├── check-versions.js      — CI: verify SKILL.md version == plugin.json == marketplace == pack.json == REGISTRY.md == README badge
│   ├── check-platform-sync.js — CI: verify SOCIAL_PLATFORMS in JS == SKILL.md == platform_knowledge.py
│   ├── check-mcp-tool-sync.js — CI: verify SKILL.md mcp-tools.tools: == MCP server registry
│   ├── check-leaks.js         — CI leak gate: hashed-denylist + secret-pattern scanner (`--hash` mode generates denylist entries)
│   └── leak-denylist.json     — Committed sha256 hashes (high-entropy terms only) + secret-shape patterns
├── tests/
│   ├── postey-cli.test.js     — node:test suite for postey CLI
│   ├── check-leaks.test.js    — leak-gate suite (synthetic secret-shaped fixtures; root tests/ is skip-listed in the scanner)
│   └── pack-manifest.test.js  — pack.json completeness + version + tag-pinned rawBase
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
        ├── pack.json          — Fetch-install manifest (rawBase pinned to the release tag)
        ├── bootstrap-prompt.md — One-paste agent setup prompt
        ├── references/        — Content flows + playbooks (10 files, loaded on demand)
        └── scripts/
            ├── postey.js      — Main CLI (zero runtime deps, Node 18+)
            ├── videoUtils.js  — Video transcription + cross-post helpers
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
- **Platform enum** is defined in one place (`SOCIAL_PLATFORMS`). When adding or removing a platform, also update: `SKILL.md` frontmatter `platforms:` list, `skills/postey/SKILL.md` Platform Names table, `.claude-plugin/marketplace.json` plugin description. The CI `check-platform-sync.js` script verifies JS ↔ SKILL.md ↔ `platform_knowledge.py` (MCP server) consistency.
- **MCP tool list** in `SKILL.md mcp-tools.tools:` must match the `@mcp.tool(name="...")` declarations in `postey-backend/app/core/mcp/tools/*.py`. The CI `check-mcp-tool-sync.js` script enforces this. See "MCP Integration" section below.

## Installation Flow

Users install via:
```
/plugin marketplace add posteyai/skills
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

# Check MCP tool sync (source-parse mode — no live server needed)
MCP_TOOLS_DIR=../postey-backend/app/core/mcp/tools node scripts/check-mcp-tool-sync.js

# Check MCP tool sync (runtime mode — requires live server + API key)
MCP_SERVER_URL=https://srvr.postey.ai POSTEY_API_KEY=mk_... node scripts/check-mcp-tool-sync.js

# Smoke test (requires a real API key)
./skills/postey/scripts/postey.js setup
./skills/postey/scripts/postey.js config:show
```

There is no build step, no lint config, and no formatter config in this repo.

## When Editing the Skill or CLI

1. **Update `version:`** in `skills/postey/SKILL.md` frontmatter, `skills/postey/.claude-plugin/plugin.json`, the plugin entry in `.claude-plugin/marketplace.json`, `skills/postey/pack.json` (version AND the tag in `rawBase`), the `skills/REGISTRY.md` row, and the README badge — all must match. Run `node scripts/check-versions.js` to verify. **At release, push the tag `skills/postey/vX.Y.Z`** — pack.json's `rawBase` points at it, so fetch-based installs 404 until the tag exists.
2. **Update `skills/postey/CHANGELOG.md`** for user-facing changes (new commands/flags, behavior changes, bug fixes). Skip internal refactors, test/CI changes, formatting-only edits.
3. **Keep SKILL.md and CLI in sync**: if you add/rename a command or flag, update `command-reference.md`. The command list in `command-reference.md` is the contract agents read.
4. **SKILL.md body must stay under 500 lines** — move heavy content to supporting files (`command-reference.md`, `video-workflow.md`, `routing-guide.md`).
5. **Preserve JSON-only stdout** in the CLI — any new output path must go to stderr or be part of the JSON payload.
6. **Do not remove `last-updated` from SKILL.md** — the field was removed; do not re-add it. Freshness tracking is via CHANGELOG and git history.
7. **When adding an MCP tool** to `postey-backend/app/core/mcp/tools/*.py`: also add the tool to `SKILL.md mcp-tools.tools:` with the `mcp__claude_ai_postey__` prefix. Run `check-mcp-tool-sync.js` to verify.
8. **When adding a platform** to `platform_knowledge.py`: also update `SOCIAL_PLATFORMS` in `postey.js` and `platforms:` in `SKILL.md`. Run `check-platform-sync.js` to verify all three agree.

## MCP Integration

The skill integrates with the Postey MCP server (`postey-backend/app/core/mcp/`) through three contracts:

### 1. Tool Registry Sync
`SKILL.md mcp-tools.tools:` must list every tool declared with `@mcp.tool(name="...")` in `tools/*.py`.
CI enforces this via `check-mcp-tool-sync.js`.

- **Source-parse mode** (default, offline): reads `@mcp.tool(name=...)` from Python files.
  ```bash
  MCP_TOOLS_DIR=../postey-backend/app/core/mcp/tools node scripts/check-mcp-tool-sync.js
  ```
- **Runtime mode** (live server): fetches `postey://skill-manifest` resource.
  ```bash
  MCP_SERVER_URL=https://srvr.postey.ai POSTEY_API_KEY=mk_... node scripts/check-mcp-tool-sync.js
  ```
  Set `MCP_STAGING_URL` as a GitHub Actions secret to enable runtime verification in CI.

### 2. Platform Knowledge Single Source
`platform_knowledge.py` in the MCP server is the authoritative source for platform specs.
`prompts.md` is a static snapshot for offline use — prefer the `postey://platform-limits`
MCP resource in Claude Code sessions. `check-platform-sync.js` verifies JS ↔ SKILL.md ↔ `platform_knowledge.py`.

### 3. Routing Contract
`SKILL.md` frontmatter `routing:` block is the machine-readable version of `routing-guide.md`.
Agents parse it to decide CLI vs MCP-resource vs MCP-tool without reading prose.
Keep both in sync when adding new operation types.

### Prompt Registry Sync
`SKILL.md mcp-tools.prompts:` must list every prompt declared with `@mcp.prompt(name="...")`
in `app/core/mcp/prompts.py`. `check-mcp-tool-sync.js` enforces this alongside tools.

- **Source-parse mode**: automatically reads `prompts.py` from the parent of `MCP_TOOLS_DIR`.
  ```bash
  MCP_TOOLS_DIR=../postey-backend/app/core/mcp/tools node scripts/check-mcp-tool-sync.js
  # → also reads ../postey-backend/app/core/mcp/prompts.py
  ```
- **Override**: set `MCP_PROMPTS_FILE=<path>` to point at a different file.
- **Runtime mode**: reads `manifest.prompts` from `postey://skill-manifest` (server v2.1.0+).

### New Skill MCP Integration Checklist
When creating a skill that has an MCP server counterpart:
1. Set `mcp-server-module:` in `SKILL.md` frontmatter (e.g. `app.core.mcp`)
2. List all MCP tools in `mcp-tools.tools:` with the appropriate `mcp__<service>__` prefix
3. List all MCP resources in `mcp-tools.resources:`
4. List all MCP prompts in `mcp-tools.prompts:` (prompt names, no prefix)
5. Add `routing:` block with machine-readable routing rules
6. Set `MCP_TOOLS_DIR` in CI workflow env to enable drift detection
7. Copy `_template/SKILL.md` for the scaffold (it includes the commented sections)

## Adding a New MCP Tool

When adding a tool to `postey-backend/app/core/mcp/tools/*.py`, do all of these:

1. **[Backend]** Add `@mcp.tool(\n    name="<name>", ...)` to the correct `tools/*.py` file.
   If it's a new module file, add the module name to `_EXPECTED_TOOL_MODULES` in `server.py`.

2. **[Backend]** If the tool needs agent guidance (hard rules, ordering, anti-patterns), add
   instructions to `_build_instructions()` in `server.py`.

3. **[skills repo]** Add `mcp__claude_ai_postey__<name>` to `SKILL.md mcp-tools.tools:` for
   any skill that should surface this tool. Comment-annotate its category (write / read / AI).

4. **[skills repo]** Add a `routing:` entry in `SKILL.md` if the tool has a specific CLI vs
   MCP routing preference (e.g. `my-operation: mcp-tool`).

5. **[CI]** Run `MCP_TOOLS_DIR=../postey-backend/app/core/mcp/tools node scripts/check-mcp-tool-sync.js`
   — it fails if SKILL.md is out of sync. Fix before merging.

## Adding a New MCP Prompt

When adding a prompt to `postey-backend/app/core/mcp/prompts.py`:

1. **[Backend]** Declare with `@mcp.prompt(\n    name="<name>", ...)`.

2. **[skills repo]** Add `<name>` (no prefix) to `SKILL.md mcp-tools.prompts:`.

3. **[CI]** Run `check-mcp-tool-sync.js` — it will now also verify prompts.

## Adding a New Skill

1. Copy `skills/_template/` to `skills/<new-name>/`.
2. Fill in `SKILL.md` frontmatter: name, version (start at `1.0.0`), platforms, description,
   `allowed-tools:`, `mcp-tools:` (tools, resources, prompts), and `routing:`.
3. Fill in `.claude-plugin/plugin.json` (name, version, author, etc.).
4. Add a `plugins` entry in `.claude-plugin/marketplace.json`.
5. Add a row to `skills/REGISTRY.md`.
6. Write the CLI entry point in `skills/<new-name>/scripts/`.
7. Run `npm test` — `check-versions.js` and `check-mcp-tool-sync.js` will catch mismatches.
8. Tag release as `skills/<new-name>/v1.0.0`.

## Commit & PR Guidelines

- Do not add "Co-authored with Claude" or similar AI-assistant attributions to commit messages or PR descriptions.
