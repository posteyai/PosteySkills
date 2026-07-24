---
name: postey
version: 1.4.0
platforms:
  - X
  - LINKEDIN
  - INSTAGRAM
  - TIKTOK
  - YOUTUBE
  - THREADS
  - BLUESKY
description: >
  Create, schedule, and manage social media posts via Postey across X, LinkedIn,
  Instagram, TikTok, YouTube, Threads, and Bluesky. Handles video/reel workflows:
  transcribe any video URL and cross-post, or use `video post` for single-command
  upload with auto cover thumbnail.
when_to_use: >
  Use when asked to: draft a tweet, post to LinkedIn, create a thread, schedule
  content, publish a post, check scheduled or published posts, upload a video to
  Instagram/TikTok/YouTube, cross-post to multiple platforms, manage social drafts,
  generate captions from a video URL, or any social media publishing task.
allowed-tools:
  - Bash(${CLAUDE_SKILL_DIR}/scripts/postey.js:*)
mcp-tools:
  resources:
    - postey://accounts
    - postey://teams
    - postey://posts/{post_id}/content/{platform}
    - postey://platform-limits
    - postey://platforms/{platform}/rules
    - postey://posts/{post_id}/analytics
    - postey://accounts/{account_id}
    - postey://teams/{team_id}/members
    - postey://skill-manifest
  tools:
    # Write operations (prefer CLI in Claude Code; MCP tools available for MCP-only clients)
    - mcp__claude_ai_Postey__create_post
    - mcp__claude_ai_Postey__update_post
    - mcp__claude_ai_Postey__delete_draft
    - mcp__claude_ai_Postey__publish_draft
    - mcp__claude_ai_Postey__schedule_post
    - mcp__claude_ai_Postey__add_tag
    - mcp__claude_ai_Postey__upload_media
    # Read operations (fallback tools when resources unavailable)
    - mcp__claude_ai_Postey__get_accounts
    - mcp__claude_ai_Postey__get_teams
    - mcp__claude_ai_Postey__get_team_info
    - mcp__claude_ai_Postey__get_posts
    - mcp__claude_ai_Postey__get_specific_post_content
    - mcp__claude_ai_Postey__get_post_by_share_link
    # AI-enhanced operations (no CLI equivalent — always use MCP)
    - mcp__claude_ai_Postey__validate_post_content
    - mcp__claude_ai_Postey__review_post_content_and_add_comments_for_virality
    - mcp__claude_ai_Postey__get_comment_for_specific_post
    - mcp__claude_ai_Postey__convert_post_content
    - mcp__claude_ai_Postey__transcribe_video
  prompts:
    - compose-post
    - review-for-virality
    - repurpose-content
    - improve-post
    - analyze-engagement
    - generate-captions-from-transcript
    - generate-captions-batch
# Machine-readable routing rules (mirrors routing-guide.md; used by CI and agents).
# Values: mcp-resource | mcp-tool | cli
routing:
  read-only-state:     mcp-resource  # accounts, teams, post-content → postey://... resources
  platform-limits:     mcp-resource  # postey://platform-limits / postey://platforms/{p}/rules
  analytics:           mcp-resource  # postey://posts/{id}/analytics
  validation:          mcp-tool      # validate_post_content (no CLI equivalent)
  virality-review:     mcp-tool      # review_post_content_and_add_comments_for_virality
  comment-read:        mcp-tool      # get_comment_for_specific_post
  convert-content:     mcp-tool      # convert_post_content
  write-post:          mcp-tool      # create/update/publish/schedule/delete → MCP tools
  local-file:          cli           # any local path → unconditional CLI (video post)
  video-transcription: cli           # postey.js video transcribe (yt-dlp + Whisper)
  ci-environment:      cli           # no MCP server available in CI/CD
  fallback:            cli           # unknown operations → CLI
---

# Postey Skill

Create, schedule, and publish social media content across multiple platforms using [Postey](https://postey.ai).

## Tool Routing — Read Before Any Tool Call

Two execution paths exist: the CLI (`postey.js`) and MCP tools/resources. Pick one path per workflow and stay on it.

### Decision Tree

1. **Local file path involved** (`~/video.mp4`, `./cover.jpg`)?
   → **CLI only** — MCP cannot access the local filesystem.

2. **Video transcription** (yt-dlp + Whisper)?
   → **`node ${CLAUDE_SKILL_DIR}/scripts/postey.js video transcribe <url>`** — no MCP equivalent.

3. **Read-only state** (accounts, teams, post content)?
   → **MCP resource** — fast, cached, no subprocess:
   - Accounts → `postey://accounts`
   - Teams → `postey://teams`
   - Post content → `postey://posts/{id}/content/{platform}`
   - **Never** call `mcp__claude_ai_Postey__get_accounts` or `get_posts` when a resource URI exists.

4. **Content validation or virality review** before publishing?
   → **MCP tools** — `validate_post_content`, `review_post_content_and_add_comments_for_virality` — no CLI equivalent; do not skip these in Claude Code sessions.

5. **All other writes** (create, update, publish, schedule, delete, tag, upload by URL)?
   → **MCP tools** in Claude Code sessions — `create_post`, `update_post`, `publish_draft`, `schedule_post`, `delete_draft`.
   → **CLI** in CI/CD, SDK agents, Cursor, Windsurf — no MCP server available.

### Routing Table

| Trigger | Tool | Reason |
|---------|------|--------|
| `--file <local-path>` or `--video <local-path>` | CLI only (`video post`) | MCP has no filesystem access |
| Video transcription workflow | CLI only | Requires local yt-dlp, ffmpeg, Whisper |
| Read accounts / teams / post content | MCP resource | Cached, no subprocess overhead |
| Validate content before posting | MCP tool | No CLI equivalent |
| Virality review | MCP tool | No CLI equivalent |
| Create / update / publish / schedule / delete | MCP tool | `create_post`, `update_post`, `publish_draft`, `schedule_post`, `delete_draft` |
| Get single draft metadata | CLI (`drafts:get`) | No MCP single-post resource |
| Cursor, SDK agent, CI/CD environment | CLI only | No MCP server in these contexts |

### Anti-Patterns

- **Never** call `mcp__claude_ai_Postey__get_accounts` — read `postey://accounts` instead.
- **Never** call `mcp__claude_ai_Postey__upload_media_for_post` for a local file — it accepts URLs only.
- **Never** skip `validate_post_content` / `review_post_content_and_add_comments_for_virality` in Claude Code sessions.
- **Never** use CLI `drafts:create` / `drafts:publish` / `drafts:schedule` — these commands are removed; use MCP tools.
- **Never** call REST endpoints directly (e.g. `GET /accounts`) — always use MCP resources or tools.
- **Never** guess or invent an `account_id` — always read `postey://accounts` and confirm with the user.
- **Never** run `postey.js accounts:list` — that command does not exist; use the `postey://accounts` MCP resource.

---

## Setup

1. **API Key** — Get your key at https://postey.com/?settings=api, then:
   ```bash
   ${CLAUDE_SKILL_DIR}/scripts/postey.js setup
   ```
   Or set env var: `export POSTEY_API_KEY=your_key`

2. **Requirements** — Node.js 18+. No other dependencies for the core CLI.

**Config priority** (highest to lowest):
1. `POSTEY_API_KEY` environment variable
2. `./.postey/config.json` (project-local)
3. `~/.config/postey/config.json` (user-global)

### When "API key not found" appears

Tell the user to run the setup command interactively — you cannot run it on their behalf. **Stop and wait** for them to confirm setup before proceeding. Do not attempt to find credentials in keychains, `.env` files, or config directories.

## Account Selection

Before any write operation, Claude **must** know which account to target. Follow this sequence every time:

1. **Read `postey://accounts`** — never call the `get_accounts` tool.
2. **One account** → use it silently without prompting the user.
3. **Multiple accounts** → display them and ask the user which one to use.
4. **Pass `account_id`** to `create_post`, `schedule_post`, `publish_draft`, etc.

**Account fields returned by `postey://accounts`:**

| Field | Type | Notes |
|-------|------|-------|
| `account_id` | int | Required by all write tools |
| `account_name` | str \| null | Human-readable label |
| `twitter` | object \| null | Non-null = X is connected |
| `linkedin` | object \| null | Non-null = LinkedIn is connected |
| `instagram` | object \| null | Non-null = Instagram is connected |
| `threads` | object \| null | Non-null = Threads is connected |
| `tiktok` | object \| null | Non-null = TikTok is connected |
| `bluesky` | object \| null | Non-null = Bluesky is connected |
| `youtube` | object \| null | Non-null = YouTube is connected |
| `teams` | list[int] \| null | Team IDs this account belongs to |

**Deriving a display handle** (for showing to the user):
- X: `account.twitter.username`
- Instagram / Threads: `account.instagram.username` / `account.threads.username`
- TikTok: `account.tiktok.username`
- LinkedIn: `account.linkedin.vanity_name`
- Bluesky: `account.bluesky.handle`

**Hard rules:**
- ✗ Never call `mcp__claude_ai_Postey__get_accounts` — read `postey://accounts` resource instead.
- ✗ Never invent or assume an `account_id` — always read the resource and confirm.
- ✗ Never call `GET /accounts` or any REST endpoint directly — use MCP only.
- ✗ Never run `postey.js accounts:list` — that CLI command does not exist.

## Accounts & Defaults

- Most commands take a positional `account_id` (e.g. `drafts:list 123`, `drafts:create 123 ...`)

## Common Actions

| User says… | Action |
|------------|--------|
| "Draft a tweet about X" | MCP `create_post` |
| "Post this to LinkedIn" | MCP `create_post` with `platform=LINKEDIN` |
| "Post to X and LinkedIn" (same content) | MCP `create_post` with multiple platforms |
| "X thread + LinkedIn post" (different content) | MCP `create_post` → MCP `update_post` per additional platform |
| "What's scheduled?" | MCP `get_posts` with `status=SCHEDULED` |
| "Show my recent posts" | MCP `get_posts` with `status=PUBLISHED` |
| "Schedule this for tomorrow" | MCP `create_post` then MCP `schedule_post` |
| "Post this now" | MCP `create_post` then MCP `publish_draft` |
| "Make captions from this reel: \<url\>" | `postey.js video transcribe <url>` → apply Caption Generation Guide → MCP `create_post` |
| "Upload video to Instagram/TikTok/YouTube" | `postey.js video post` (local file) or `postey.js video transcribe <url>` (remote URL) |
| User provides a video but no caption | Run `video transcribe` first → refine `suggested_captions` → `video post --text` or `create_post` |

## Workflow

1. **Check config**: `${CLAUDE_SKILL_DIR}/scripts/postey.js config:show`
2. **Find account**: MCP resource `postey://accounts`
3. **Create draft**: MCP `create_post`
4. **Schedule or publish**: MCP `schedule_post` or `publish_draft`

## Working with Tags

Pass tag IDs via the `tags` field on MCP `create_post`. Use MCP `add_tag` to attach tags to an already-created post.

## Publishing to Multiple Platforms

**One `post_id` per topic** — never create separate drafts for different platforms on the same content.

### Same content across platforms
```
mcp create_post account_id=<id> platform=X additional_platforms=[LINKEDIN] contents=[{text: "..."}]
```

### Different content per platform
```
# Step 1 — Create initial draft
mcp create_post account_id=<id> platform=INSTAGRAM contents=[{text: "<instagram_caption>"}]
# Returns post_id, e.g. 1234

# Steps 2–N — Attach each additional platform (same post_id)
mcp update_post post_id=1234 platform=LINKEDIN contents=[{text: "<linkedin_caption>"}]
mcp update_post post_id=1234 platform=X contents=[{text: "<twitter_caption>"}]
```

## Platform Names

Use these exact values for `--platform`:

| Platform | Notes |
|----------|-------|
| `X` | 280-char limit |
| `LINKEDIN` | 3,000-char limit |
| `INSTAGRAM` | Reels and feed posts |
| `TIKTOK` | |
| `YOUTUBE` | Requires `--youtube-title` |
| `THREADS` | 500-char limit |
| `BLUESKY` | 300-char limit |

Run `social-sets:list` first — a platform only works if that account is connected in Postey.

## Direct Video Posting

Use `video post` when you have a caption ready and want to upload video + create a multi-platform draft in one command (no transcription).

**No caption yet?** Run `video transcribe` first — it returns a transcript and `suggested_captions` per platform. Refine those captions (see [prompts.md](prompts.md)) then pass the result to `video post --text` or `create_post`. Never paste a raw transcript as a caption.

**Requires:** `ffmpeg` on PATH for Instagram cover thumbnail extraction.

```bash
${CLAUDE_SKILL_DIR}/scripts/postey.js video post <account_id> \
  --video <local_path_or_https_url> \
  --text "<caption>" \
  --platforms INSTAGRAM,LINKEDIN,X \
  [--cover-time <seconds>]   # default: 3
  [--title "Draft title"]
  [--publish-now]
  [--schedule <iso_datetime>]
```

| Platform | Video attached | Cover thumbnail |
|----------|---------------|-----------------|
| `INSTAGRAM` | Yes (Reel) | Yes — ffmpeg frame extraction |
| All others | No | No |

## Video → Captions → Cross-Post

For transcription-based workflows, see [video-workflow.md](video-workflow.md).
For platform-specific caption rules, see [prompts.md](prompts.md).

## Content Flows

This skill includes four guided content workflows. Offer them when the user connects for the
first time, asks what you can do, or gives an open-ended content request. Load the flow's
reference file only when the user picks it; never install or load all of them up front.

House rules for every flow (non-negotiable):

1. Call `get_accounts` first, every session. Connected platforms are read, never assumed.
2. Everything is created as a DRAFT. Publishing needs the user's explicit instruction.
3. Every platform gets its own hand-crafted caption. One idea, many voices.
4. Verify each platform after creating (`get_specific_post_content`), then fix before presenting.
5. End every flow by giving the user the draft's share link.
6. Tag agent-created posts: an agent tag (default `Agent`, ask the user once if they prefer
   another name) plus 2 or 3 topic tags. Reuse existing tags; never create duplicates.

| Flow | The user says something like | Load |
|------|------------------------------|------|
| Brand voice | "Learn my voice", "write like me", a handle or website | [references/brand-voice.md](references/brand-voice.md) |
| Video everywhere | a video URL, "post this video everywhere" | [references/video-to-everywhere.md](references/video-to-everywhere.md) |
| Trends | "what should I post today?", "find something trending" | [references/trends-to-posts.md](references/trends-to-posts.md) |
| Idea to posts | one rough idea, "turn this into posts" | [references/idea-to-posts.md](references/idea-to-posts.md) |

Shared knowledge the flows cite: [references/caption-playbook.md](references/caption-playbook.md)
(universal rules and pre-upload checklist), [references/platform-archetypes.md](references/platform-archetypes.md),
[references/hook-formulas.md](references/hook-formulas.md), [references/x-algorithm.md](references/x-algorithm.md),
[references/thread-and-video-formats.md](references/thread-and-video-formats.md), and
[references/brand-profile-template.md](references/brand-profile-template.md).

First-run greeting: after verifying accounts, offer the four flows in one short list and run
whichever the user picks. Two minutes to a share link is the goal.

## Automation Guidelines

- No duplicate content across multiple accounts
- No unsolicited automated replies
- No trending manipulation or fake engagement
- Respect API rate limits
- **Always confirm before publishing** unless user explicitly says "post now" or "publish immediately" — drafts are private; publishing is irreversible

## Tips

- Thread creation: use `---` on its own line to split into multiple posts
- Scheduling: ISO 8601 strings for `--schedule` / `--time`
- Draft titles: `--title` is for internal organization, not posted publicly
- Read from file: `--file ./post.txt` instead of `--text`
- Sort drafts: `--sort created_at`, `-created_at`, `scheduled_date`, etc.

## Reference

- Full command reference: [command-reference.md](command-reference.md)
- Video transcription workflow: [video-workflow.md](video-workflow.md)
- Platform caption templates: [prompts.md](prompts.md)
- Routing rules (extended): [routing-guide.md](routing-guide.md)
- Content flows and playbooks: [references/](references/) (see Content Flows above)
- Pack manifest for fetch-based install: [pack.json](pack.json)
- One-paste agent setup: [bootstrap-prompt.md](bootstrap-prompt.md)
