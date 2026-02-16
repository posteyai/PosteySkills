# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This repository contains AI agent skills for Postey - markdown files that give AI agents specialized workflows for drafting, scheduling, and managing social media posts across X and LinkedIn.

## Repository Structure

- `skills/postey/SKILL.md` - The main skill definition file with frontmatter metadata and usage instructions
- `skills/postey/CHANGELOG.md` - User-facing changelog for the Postey skill/CLI
- `skills/postey/scripts/postey.js` - JavaScript CLI for the Postey API v2 (zero dependencies, Node.js 18+)
- `.claude-plugin/marketplace.json` - Claude Code plugin marketplace configuration

## The Skill System

Skills are markdown files with YAML frontmatter that define:

- `name` - Skill identifier
- `description` - What the skill does
- `allowed-tools` - Tools the skill can use (e.g., `Bash(./scripts/postey.js:*)`)

The SKILL.md file documents the workflow and commands that AI agents should follow when using the skill.

## CLI Script

The `postey.js` script is a self-contained JavaScript CLI that wraps the Postey API:

- **Requirements**: Node.js 18+ (for built-in fetch API)
- **Dependencies**: None (uses only Node.js built-in modules)
- **Authentication**: Priority order:
  1. `POSTEY_API_KEY` environment variable
  2. `./.postey/config.json` (project-local)
  3. `~/.config/postey/config.json` (user-global)
- **API Base**: `https://api.postey.com/v2`

Key commands: `setup`, `me:get`, `social-sets:list`, `social-sets:get`, `drafts:list`, `drafts:get`, `drafts:create`, `drafts:update`, `drafts:delete`, `drafts:schedule`, `drafts:publish`, `tags:list`, `tags:create`, `media:upload`, `media:status`, `config:show`

All commands output JSON.

## Testing the CLI

```bash
# Interactive setup (recommended)
./skills/postey/scripts/postey.js setup

# Or use environment variable
export POSTEY_API_KEY=your_key

# Test commands
./skills/postey/scripts/postey.js social-sets:list
./skills/postey/scripts/postey.js drafts:create <social_set_id> --text "Test post"
```

## Installation Methods

Skills can be installed via:

1. CLI: `npx skills add postey/agent-skills`
2. Claude Code plugin: `/plugin marketplace add postey/agent-skills`
3. Cursor: Add as remote GitHub rule
4. Manual: Copy `skills/postey/` to `.cursor/skills/` or `.claude/skills/`

## Updating the Skill

When making changes to the CLI (`postey.js`) or the skill definition (`SKILL.md`), always update the `last-updated` date in the SKILL.md frontmatter to the current date. This date is used for freshness checks to warn users if the skill may be outdated.

### Changelog Updates (Required)

When you change anything that affects how a user runs the CLI or uses the skill (new commands/flags, behavior changes, bug fixes, error messages, defaults), update the changelog in the relevant skill folder:

- `skills/postey/CHANGELOG.md`

Changelog entries must be **user-facing only**. Do not include internal implementation details like refactors, test/CI changes, formatting-only edits, or code organization.

## Commit & Pull Request Guidelines

- NEVER add "Co-authored with Claude" or that kind of AI-assistant plugin to commit messages or PR descriptions.
