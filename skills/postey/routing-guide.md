# Tool Routing — Extended Reference

This document is the full routing reference for the Postey skill. The key rules are embedded in SKILL.md; this file provides additional context and edge cases.

## Two Surfaces, One Stack

They are layers, not alternatives. The MCP server carries the capability; the CLI adds only what the
server cannot reach — the user's own machine.

| Surface | Entry point | Owns |
|---------|-------------|------|
| **MCP tools/resources** | bare tool names (e.g. `create_post`) and `postey://` URIs | Every state read and **every write**; permissions; platform truth |
| **CLI** | `${CLAUDE_SKILL_DIR}/scripts/postey.js` | Local files, video processing, chunked upload, local auth config |

**The CLI has no write command.** Nothing in it creates, updates, publishes, schedules, deletes or
tags a post — those were removed, and `scripts/check-capability-overlap.js` fails the build if one
returns. The local-file commands upload and hand back the fields for an MCP write; they do not
perform the write. `command-reference.md` is the CLI's actual surface — routing that names a
command not in it is a bug.

> **Tool names are unprefixed here on purpose.** Most clients namespace MCP tools as
> `mcp__<server>__<tool>`, where `<server>` is whatever the *user* named the connection — during this
> skill's own audit the same server appeared under three different names, and none matched what the
> skill had hardcoded. Match on the bare tool name (`create_post`) and call whatever form your client
> exposes.

## Full Decision Tree

```
1. Does the task involve a LOCAL FILE PATH (~/video.mp4, ./cover.jpg)?
   → CLI unconditionally. MCP cannot access the local filesystem. The CLI uploads the file and
     returns the fields for the MCP write; the write itself is still step 5. Stop here.

2. Does the task involve VIDEO TRANSCRIPTION (yt-dlp + Whisper)?
   → `node ${CLAUDE_SKILL_DIR}/scripts/postey.js video transcribe <url>` wherever the CLI runs.
     Connector-only clients (no CLI) use the `transcribe_video` MCP tool instead. Stop here.

3. Is the task READ-ONLY state retrieval (accounts, teams, post content)?
   → Read the MCP resource URI directly when your client supports MCP resources; resource-blind
     clients (many hosted connectors) use the equivalent read tools instead.
     - Accounts  → postey://accounts
     - Teams     → postey://teams
     - Post content → postey://posts/{id}/content/{platform}

4. Is the task CONTENT VALIDATION or VIRALITY REVIEW before publishing?
   → MCP tools: validate_post_content, review_post_content_and_add_comments_for_virality
     No CLI equivalent — do not skip in any MCP-capable session.

5. Is it a WRITE (create, update, publish, schedule, delete, tag, upload by URL)?
   → MCP tools, in every environment: `create_post`, `update_post`, `publish_draft`,
     `schedule_post`, `delete_draft`, `add_tag`, `upload_media`.
     There is no second path — not the CLI, not the REST API. If no MCP server is reachable,
     the write cannot be performed at all: say so and stop, rather than reaching for a CLI
     command that does not exist.

6. Does the ENVIRONMENT (CI/CD, shell script, Cursor, Windsurf, SDK agent) change any of the above?
   → No. The environment decides whether the CLI is *available* and whether resources can be read
     — never who owns the operation. See the table below for what each environment can do.
```

## CLI-Only Operations

These operations **must** use the CLI where it is available:

- Local file uploads (`--file`, `--video` with local path) — no MCP equivalent
- Chunked video upload (>50 MB) via `video post` — no MCP equivalent
- Video transcription + cross-post via `postey.js video transcribe` (connector-only clients fall
  back to the `transcribe_video` MCP tool)
- Non-interactive setup: `setup --key ... --location global`

## MCP-Only Operations

These operations have no CLI equivalent and **must** use MCP tools:

- Every write — creating, updating, publishing, scheduling, deleting and tagging posts
- `validate_post_content` — validate before creating a draft
- `review_post_content_and_add_comments_for_virality` — virality coaching
- Reading resources: `postey://accounts`, `postey://teams`, `postey://posts/{id}/content/{platform}`

## Layered Workflow (Correct Pattern)

A workflow that touches local files uses both surfaces in sequence — the CLI for the part that needs
the machine, MCP for the state and the write:

```
1. Read postey://accounts                                          ← MCP resource
2. postey.js video post --video ./reel.mp4 --text "…" \
     --platforms INSTAGRAM --account-id <id>                       ← CLI: uploads, returns fields
3. Validate content via validate_post_content                      ← MCP tool
4. create_post (account_id=…, platforms=…, media_urls from step 2) ← MCP write
5. publish_draft (post_id=…, platforms=[…])                        ← MCP write
```

## Environment-Specific Guidance

The CLI has no account-listing command — account discovery always needs MCP (resource or
`get_accounts` tool). Where no MCP server is reachable, the `account_id` comes from the user
or from stored config; never guess one.

| Environment | Read state | Write operations | Local-file work |
|-------------|------------|------------------|-----------------|
| Claude Code (interactive) | MCP resources | MCP tools | CLI |
| Hosted connector (claude.ai, ChatGPT) | MCP resources, or `get_accounts` / `get_posts` if resource-blind | MCP tools | Not available (no shell) — the user must supply a URL |
| Cursor / Windsurf | MCP resources or read tools (both support MCP) | MCP tools | CLI |
| SDK agent / CI/CD / npx **with the MCP server configured** | `get_accounts` / `get_posts` read tools | MCP tools | CLI |
| Any environment with **no MCP server** | Not available — ask the user | **Not possible.** No write path exists without MCP; tell the user to connect the server at https://app.postey.ai?settings=agents&section=advanced | CLI runs, but its output is only the input to a write that still needs MCP |
