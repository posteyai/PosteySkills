# Tool Routing — Extended Reference

This document is the full routing reference for the Postey skill. The key rules are embedded in SKILL.md; this file provides additional context and edge cases.

## Two Execution Paths

| Path | Entry point | Best for |
|------|-------------|----------|
| **CLI** | `${CLAUDE_SKILL_DIR}/scripts/postey.js` | All write operations, local files, CI/CD, non-Claude Code environments |
| **MCP tools/resources** | `mcp__claude_ai_Postey__*` and `postey://` URIs | Read-only state fetches, content validation, virality review |

## Full Decision Tree

```
1. Does the task involve a LOCAL FILE PATH (~/video.mp4, ./cover.jpg, ./post.txt)?
   → CLI unconditionally. MCP cannot access the local filesystem. Stop here.

2. Does the task involve VIDEO TRANSCRIPTION (yt-dlp + Whisper)?
   → `node ${CLAUDE_SKILL_DIR}/scripts/postey.js video transcribe <url>`. No MCP equivalent. Stop here.

3. Is the environment CI/CD, a shell script, Cursor, Windsurf, or an SDK agent?
   → CLI. MCP server is unavailable in these contexts. Stop here.

4. Is the task READ-ONLY state retrieval (accounts, teams, post content)?
   → Read the MCP resource URI directly. Do not call a tool or the CLI.
     - Accounts  → postey://accounts
     - Teams     → postey://teams
     - Post content → postey://posts/{id}/content/{platform}

5. Is the task CONTENT VALIDATION or VIRALITY REVIEW before publishing?
   → MCP tools: validate_post_content, review_post_content_and_add_comments_for_virality
     No CLI equivalent — do not skip in Claude Code sessions.

6. All other write operations (create, update, publish, schedule, delete, tag, upload by URL):
   → CLI. Reasons: JSON stdout enables composability; works in all four distribution
     channels (Claude Code, Cursor, SDK agents, CI/CD); no subprocess overhead is
     negligible for these low-frequency calls.
```

## CLI-Only Operations

These operations have no MCP equivalent and **must** use the CLI:

- Local file uploads (`--file`, `--video` with local path)
- Chunked video upload (>50 MB) via `video:post`
- Video transcription + cross-post via `postey.js video transcribe`
- Bulk / scripted operations in CI pipelines
- Non-interactive setup: `setup --key ... --location global`

## MCP-Only Operations

These operations have no CLI equivalent and **must** use MCP tools:

- `validate_post_content` — validate before creating a draft
- `review_post_content_and_add_comments_for_virality` — virality coaching
- Reading resources: `postey://accounts`, `postey://teams`, `postey://posts/{id}/content/{platform}`

## Mixed-Path Workflow (Correct Pattern)

When a workflow needs both read-state and write actions, keep them sequential — reads via MCP resources, writes via CLI:

```
1. Read postey://accounts                        ← MCP resource
2. Validate content via validate_post_content    ← MCP tool
3. ${CLAUDE_SKILL_DIR}/scripts/postey.js drafts:create ...  ← CLI write
4. ${CLAUDE_SKILL_DIR}/scripts/postey.js drafts:publish ... ← CLI write
```

Never call `mcp__claude_ai_Postey__create_post` in the same workflow as `postey.js drafts:create` — pick one and stay with it for the entire create step.

## Environment-Specific Guidance

| Environment | Read state | Write operations |
|-------------|------------|-----------------|
| Claude Code (interactive) | MCP resources | CLI (or MCP tools for MCP-only ops) |
| Cursor / Windsurf | `social-sets:list` CLI | CLI |
| SDK agent | `social-sets:list` CLI | CLI |
| CI/CD pipeline | `social-sets:list` CLI | CLI |
| npx install | `social-sets:list` CLI | CLI |
