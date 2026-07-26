# Changelog (Postey Skill)

All notable user-facing changes to the Postey skill and its CLI are documented here.

The format is based on Keep a Changelog.

## [1.4.0]

### Added

- **Content Flows**: four guided workflows built into the skill — Brand voice (learn a brand's
  voice from a handle/site and draft a batch), Video everywhere (any video URL to a per-platform
  multi-draft), Trends (fresh niche content across five pillars), Idea to posts (one idea expanded
  and scheduled across platforms). One skill install delivers all of them; flow references load
  on demand from `references/`.
- Shared content playbooks in `references/`: caption playbook with pre-upload checklist,
  per-platform caption archetypes, hook formulas, X algorithm notes (public sources),
  thread/reel/carousel/trend formats, and a brand-profile template.
- `pack.json` machine-readable manifest for fetch-based installs (agents fetch the skill without
  a plugin system). Fetched content is pinned to the immutable release tag, not `main`.
- `bootstrap-prompt.md`: the one-paste prompt that sets up any connected agent.
- MCP tools newly listed in the skill: `get_schedule`, `update_schedule`, `unschedule_post`,
  `remove_tag`, `get_manual_comments`, `reply_to_manual_comment`.

### Changed

- Routing now documents fallbacks for constrained clients: resource-blind clients (many hosted
  connectors) use the `get_accounts` / `get_posts` read tools instead of `postey://` resources,
  and connector-only clients (no CLI) use the `transcribe_video` MCP tool for transcription.
  The machine-readable `routing:` block encodes this as `primary > fallback`.
- Scheduling is explicitly gated like publishing everywhere: propose times, schedule only after
  the user approves content and times (a scheduled post publishes itself).
- MCP tool names now use the lowercase connector slug (`mcp__claude_ai_postey__*`).

### Fixed

- Corrected the media-upload tool name to `upload_media` (docs previously referenced
  `upload_media_for_post`, which never existed on the server).
- API key URL corrected to `https://app.postey.ai/?settings=api` (was the stale `postey.com`).
- Removed references to CLI commands deleted in 1.3.0 (`social-sets:list`, `drafts:list`,
  `drafts:create`) from the README, routing guide, and skill docs; deleted the stale legacy
  `skills/SKILLS.md`.

## [1.3.0]

### Removed

- `social-sets:list` CLI command — use `postey://accounts` MCP resource or `get_accounts` tool
- `drafts:list` CLI command — use `get_posts` MCP tool
- `drafts:create` CLI command — use `create_post` MCP tool
- `create-draft` alias — use `create_post` MCP tool
- `drafts:publish` CLI command — use `publish_draft` MCP tool
- `drafts:delete` CLI command — use `delete_draft` MCP tool
- `drafts:schedule` CLI command — use `schedule_post` MCP tool
- `drafts:content` CLI command — use `postey://posts/{id}/content/{platform}` resource or `get_specific_post_content` tool
- `tags:list` CLI command — no MCP equivalent; removed by request
- `tags:create` CLI command — no MCP equivalent; removed by request

## [1.2.0 and earlier]

Entries below predate the 1.3.0 release and shipped across 1.0.x-1.2.0; they were previously
misfiled under "Unreleased".

### Added

- `video:post` command: single-command video upload and multi-platform draft creation. Handles chunked upload for files >50 MB, extracts a cover frame with ffmpeg at a configurable timestamp, and sets `cover_url` for Instagram Reels automatically. Accepts local file paths or `https://` CDN URLs (ffmpeg reads CDN URLs directly). All non-Instagram platforms receive text-only content. Flags: `--video`, `--text`, `--platforms`, `--cover-time` (default: 3 s), `--title`, `--tags`, `--schedule`, `--publish-now`.
- `video2post.js` script (cross-platform, macOS + Windows): download any video URL with yt-dlp, extract audio with ffmpeg, transcribe with Whisper — outputs transcript and file paths as JSON. Supports `--output-dir` and `--model` flags.
- Video-to-cross-post workflow: generate tailored captions for Instagram, TikTok, and YouTube from a video transcript and publish as separate per-platform Postey drafts.
- THREADS and BLUESKY platform support (`--platform THREADS` / `--platform BLUESKY`).
- `media:upload <post_id> --platform <platform> --file <path>` command: upload a media file and attach it to an existing draft (`doc_id` computed automatically as `post_id * 256 + platform_type`).
- `video2post.js` now automatically uploads the downloaded video to Postey after creating each draft.

### Removed

- Removed `drafts:update` and `media:upload` from documentation — these commands are not implemented in the CLI.

### Changed

- `drafts:create` now uses the new `/posts/raw` request model (`contents` list instead of `post_raw_content`).
- Added YouTube support to `drafts:create`: `--youtube-title` (required for YOUTUBE platform), `--youtube-description`, `--youtube-privacy-status`, `--youtube-category-id`, `--youtube-made-for-kids`, `--youtube-tags`, `--youtube-notify-subscribers`, `--youtube-license`, `--youtube-embeddable`.
- Added `--media-urls` flag to `drafts:create` for attaching media by URL.
- `--platform` now accepts `TIKTOK`, `INSTAGRAM`, and `YOUTUBE` in addition to `X` and `LINKEDIN`.
- Platform support for `INSTAGRAM`, `TIKTOK`, and `YOUTUBE` (availability depends on connected accounts).

### Changed

- Renamed the skill and CLI to `postey` across command examples, file paths, and plugin metadata.
- Updated configuration naming in docs and CLI output to use `POSTEY_*` environment variables and `.postey/` config directories.
- Updated docs and CLI help text to list only supported platforms: `X` and `LINKEDIN`.
- `drafts:get` now accepts only `<draft_id>` and no longer accepts `social_set_id`/`--social-set-id` or `--use-default`.
- `drafts:delete` now accepts only `<draft_id>` and no longer accepts `social_set_id`/`--social-set-id` or `--use-default`.
- `drafts:schedule` now uses the schedules API payload (`post_id`, `platforms`, `scheduled_at`, `natural_posting`) and accepts `<draft_id>` with optional `--platform` / `--natural-posting`.
- `drafts:publish` now uses `POST /publish` with (`post_id`, `platforms`, `natural_posting`) and accepts `<draft_id>` with optional `--platform` / `--natural-posting`.
- `config:set-default` now configures account default platform via `/accounts/preferences/{account_id}` (creates or updates preference) using `[account_id] <platform>`.
- `drafts:create` now uses `POST /posts/raw` with `account_id`, `platforms`, `post_raw_content`, `publish_now`, `schedule_at`, `draft_title`, and numeric `tags`.
- Added `drafts:content <post_id> --platform <platform>` to fetch parsed content from `GET /posts/parsed/content`.
- Updated tag commands to align with the `/tags` API shape:
  - `tags:list [account_id]` now calls `GET /tags?account=<id>`
  - `tags:create [account_id] --tag ... --color ...` now calls `POST /tags` with `account_id`, `tag`, and `color`
  - Added `tags:update <tag_id> [account_id] --tag ... --color ...`
  - Added `tags:delete <tag_id> [account_id]`
- Updated help and skill documentation to remove stale command references and align examples with the current CLI command set.

## [2026-02-10]

### Added

- `create-draft` and `update-draft` alias commands to create/update drafts with simpler arguments.
- `--tags` support for `drafts:update` (tag-only updates keep existing draft content unchanged).
- `--social-set-id` / `--social_set_id` flag support as an alternative to positional `social_set_id` for commands that take a social set.

### Fixed

- `update-draft` no longer overwrites draft content when you run it with only flags (for example, adding tags).
- Clear CLI errors when a value-taking flag is provided without a value (instead of crashing).
- Thread splitting on `---` now works with both LF and CRLF line endings.
