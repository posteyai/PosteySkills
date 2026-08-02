---
name: postey-video
version: 1.0.0
description: >
  Turn one video into posts everywhere with Postey: transcribe it, write a caption
  per platform, upload with a cover frame, and leave drafts ready for approval.
  Handles local files and large uploads, which the MCP server cannot reach.
when_to_use: >
  Use when the user gives a video URL or a local video path, asks to post a video
  or reel to Instagram/TikTok/YouTube, wants one video cross-posted everywhere,
  wants a video transcribed into captions, or wants a cover frame chosen.

allowed-tools:
  - Bash(${CLAUDE_SKILL_DIR}/scripts/postey.js:*)

# Requires the `postey` skill: account selection, the write path and the craft
# layer (caption-playbook, hook-formulas, platform-archetypes,
# thread-and-video-formats) all live there.
requires:
  - postey

# Capability-keyed ownership — canonical keys from capability-snapshot.json.
# This skill OWNS media.transcribe: transcription needs local ffmpeg and the file
# itself, which is the contract's dividing question answered "skill".
capabilities:
  owns:
    - media.transcribe
  reads:
    - media.upload
    - file.list
    - file.read
    - file.upload
    - post.create
  prompts:
    - generate-captions-from-transcript
    - generate-captions-batch

mcp-tools:
  resources:
    - postey://accounts
    - postey://platform-limits
  tools:
    # GENERATED from capabilities: by scripts/gen-mcp-tools.js — do not hand-edit.
    - create_post
    - file_manager
    - list_files
    - read_file
    - transcribe_video
    - upload_media
  prompts:
    - generate-captions-from-transcript
    - generate-captions-batch

routing:
  read-only-state:     mcp-resource > mcp-tool
  local-file:          cli
  video-transcription: cli > mcp-tool
  write-post:          mcp-tool
  fallback:            mcp-tool
---

# Postey Video

One video becomes a caption per platform and a draft per account. Nothing publishes without the
user's explicit approval, and **scheduling counts as publishing**.

## Why this ships its own CLI

`scripts/postey.js` here is a **byte-identical copy** of the hub's, verified by
`scripts/check-script-parity.js`. A skill cannot rely on the path to another skill's directory —
no install layout guarantees one — so the copy travels with the pack. The consequence is that
this skill and the hub version-bump together whenever the CLI changes.

`capability-snapshot.json` sits beside it because `postey.js` requires it at runtime for the
platform list. A copy without it crashes on require.

## Routing

| Situation | Path |
|---|---|
| A local video or image path | **CLI**, unconditionally — MCP cannot see the user's disk |
| Transcription | **CLI** (`video transcribe`); `transcribe_video` when your client has no shell |
| Large or chunked upload | **CLI** — the MCP inline path is context-bound |
| Creating or updating the draft | **MCP** (`create_post` / `update_post`) — always, even after a CLI upload |

The CLI stops at the upload and hands back the fields for the MCP write. It never creates the
draft itself.

## Workflow

1. **Read the accounts** — `postey://accounts`, or `get_accounts` if your client cannot read
   resources. Never assume which platforms are connected.
2. **Transcribe** if there is no caption yet. Never paste a raw transcript as a caption.
3. **Write one caption per platform** from the transcript. Craft rules come from the hub:
   `caption-playbook.md`, `hook-formulas.md`, `platform-archetypes.md` and
   `thread-and-video-formats.md`. If a brand profile exists, its voice and banned lists apply.
4. **Upload** via the CLI, taking the cover frame with it.
5. **Create the draft** through MCP, then attach each additional platform with `update_post` on
   the same `post_id`.
6. **Validate** each platform with `validate_post_content`, fix, then present the share link.

## Reference

- Full transcription and cross-post workflow: [video-workflow.md](video-workflow.md)
- The video-everywhere content flow: [references/video-to-everywhere.md](references/video-to-everywhere.md)
