# Tool Routing — Extended Reference

This document is the full routing reference for the Postey skill. The key rules are embedded in SKILL.md; this file provides additional context and edge cases.

## Two Execution Paths

| Path | Entry point | Best for |
|------|-------------|----------|
| **CLI** | `${CLAUDE_SKILL_DIR}/scripts/postey.js` | Local files, CI/CD, SDK agents, non-MCP environments; all write operations outside Claude Code |
| **MCP tools/resources** | `mcp__claude_ai_Postey__*` and `postey://` URIs | Write operations in Claude Code sessions; read-only state; content validation; virality review |

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
   → MCP tools in Claude Code sessions: `create_post`, `update_post`, `publish_draft`,
     `schedule_post`, `delete_draft`, `add_tag`, `upload_media`.
   → CLI in CI/CD, SDK agents, Cursor, Windsurf: no MCP server available in these contexts.
```

## CLI-Only Operations

These operations have no MCP equivalent and **must** use the CLI:

- Local file uploads (`--file`, `--video` with local path)
- Chunked video upload (>50 MB) via `video post`
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
1. Read postey://accounts                                       ← MCP resource
2. Validate content via validate_post_content                   ← MCP tool
3. mcp create_post (account_id=..., platform=..., contents=[...])  ← MCP write
4. mcp publish_draft (post_id=..., platforms=[...])             ← MCP write
```

Never mix `mcp__claude_ai_Postey__create_post` with `postey.js posts:create` in the same workflow — pick one path for the write step and stay with it.

## Environment-Specific Guidance

| Environment | Read state | Write operations |
|-------------|------------|-----------------|
| Claude Code (interactive) | MCP resources | CLI (or MCP tools for MCP-only ops) |
| Cursor / Windsurf | `social-sets:list` CLI | CLI |
| SDK agent | `social-sets:list` CLI | CLI |
| CI/CD pipeline | `social-sets:list` CLI | CLI |
| npx install | `social-sets:list` CLI | CLI |
