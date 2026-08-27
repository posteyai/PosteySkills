---
# Required: display name (defaults to directory name if omitted)
name: skill-name

# Recommended: used by Claude to decide when to load the skill automatically.
# Put the key use case first — truncated at ~1,536 chars combined with when_to_use.
description: >
  One-sentence pitch: what this skill does and for whom.

# Optional: additional trigger phrases / examples. Appended to description.
# when_to_use: >
#   Use when user asks to: do X, do Y, check Z.

# Optional: disable Claude from auto-invoking — only you can trigger with /skill-name.
# Use for skills with side effects (publish, deploy, send).
# disable-model-invocation: true

# Optional: hide from / menu (Claude can still auto-invoke based on description).
# user-invocable: false

# Optional: tools Claude can use without permission prompts when this skill is active.
# allowed-tools:
#   - Bash(${CLAUDE_SKILL_DIR}/scripts/cli.js:*)

# Optional: MCP tools and resources this skill owns (non-standard — agent guidance only).
# List ALL tools from the MCP server module for this skill; CI (check-mcp-tool-sync.js)
# verifies this list matches the server registry when MCP_TOOLS_DIR is set.
# mcp-tools:
#   resources:
#     - postey://some-resource          # read-only state (prefer over equivalent tools)
#     - postey://skill-manifest          # always include for drift detection
#   tools:
#     # Write operations (prefer CLI in Claude Code; MCP tools for MCP-only clients)
#     - mcp__claude_ai_SomeService__create_item
#     - mcp__claude_ai_SomeService__update_item
#     # Read fallbacks (use resources instead when available)
#     - mcp__claude_ai_SomeService__get_items
#     # AI-enhanced (no CLI equivalent — always use MCP tool)
#     - mcp__claude_ai_SomeService__validate_item

# REQUIRED: capability-keyed ownership. Keys are `canonical` entries from
# capability-snapshot.json — the server's own vocabulary. Never list raw tool
# names here; SKILL.md's mcp-tools.tools: is derived from these keys.
#   owns    — exclusive. Exactly one skill in the repo may own a key, and owning
#             it means this skill carries the guidance for using it.
#   reads   — shared. Any number of skills may read the same capability.
#   prompts — MCP prompt names the skill routes to.
# CI fails if a key is unknown, owned twice, or owned by nobody.
# Full contract: docs/skills-mcp-contract.md.
# capabilities:
#   owns:
#     - post.create
#   reads:
#     - analytics.top_posts
#   prompts:
#     - compose-post

# Machine-readable routing rules — mirrors any prose routing-guide.md.
# Values: mcp-resource | mcp-tool | cli
# mcp-server-module: ""   # e.g. "app.core.mcp" — path used by check-mcp-tool-sync.js
# routing:
#   read-only-state:   mcp-resource
#   validation:        mcp-tool
#   write:             cli
#   local-file:        cli
#   ci-environment:    cli
#   fallback:          cli

# Optional: run in an isolated subagent (good for long-running or read-heavy tasks).
# context: fork
# agent: Explore
---

# Skill Name

Brief intro sentence.

## Tool Routing

<!-- If this skill has both CLI and MCP paths, add a routing section here.
     Copy the pattern from skills/postey/SKILL.md. -->

## Setup

<!-- Prerequisites, auth, config -->

## Workflow

<!-- Step-by-step happy path -->

## Reference

- [command-reference.md](command-reference.md) — Full command list
