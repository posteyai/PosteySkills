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

# Optional: MCP tools this skill owns (non-standard — agent guidance only).
# mcp-tools:
#   resources:
#     - postey://some-resource
#   tools:
#     - mcp__claude_ai_SomeService__some_tool

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
