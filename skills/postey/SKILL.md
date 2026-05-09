---
name: postey
version: 1.2.0
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
  transcribe any video URL and cross-post, or use `video:post` for single-command
  upload with auto cover thumbnail.
when_to_use: >
  Use when asked to: draft a tweet, post to LinkedIn, create a thread, schedule
  content, publish a post, check scheduled or published posts, upload a video to
  Instagram/TikTok/YouTube, cross-post to multiple platforms, manage social drafts,
  generate captions from a video URL, or any social media publishing task.
allowed-tools:
  - Bash(${CLAUDE_SKILL_DIR}/scripts/postey.js:*)
  - Bash(node ${CLAUDE_SKILL_DIR}/scripts/video2post.js:*)
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
  write-post:          cli           # create/update/publish/schedule/delete → postey.js
  local-file:          cli           # any local path → unconditional CLI
  video-transcription: cli           # video2post.js (yt-dlp + Whisper)
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
   → **`node ${CLAUDE_SKILL_DIR}/scripts/video2post.js`** — no MCP equivalent.

3. **Read-only state** (accounts, teams, post content)?
   → **MCP resource** — fast, cached, no subprocess:
   - Accounts → `postey://accounts`
   - Teams → `postey://teams`
   - Post content → `postey://posts/{id}/content/{platform}`
   - **Never** call `mcp__claude_ai_Postey__get_accounts` or `get_posts` when a resource URI exists.

4. **Content validation or virality review** before publishing?
   → **MCP tools** — `validate_post_content`, `review_post_content_and_add_comments_for_virality` — no CLI equivalent; do not skip these in Claude Code sessions.

5. **All other writes** (create, update, publish, schedule, delete, tag, upload by URL)?
   → **CLI** — JSON stdout, composable, works in all distribution channels (Claude Code, Cursor, SDK agents, CI/CD).

### Routing Table

| Trigger | Tool | Reason |
|---------|------|--------|
| `--file <local-path>` or `--video <local-path>` | CLI only | MCP has no filesystem access |
| Video transcription workflow | CLI only | Requires local yt-dlp, ffmpeg, Whisper |
| Read accounts / teams / post content | MCP resource | Cached, no subprocess overhead |
| Validate content before posting | MCP tool | No CLI equivalent |
| Virality review | MCP tool | No CLI equivalent |
| Create / update / publish / schedule / delete | CLI | JSON stdout, works everywhere |
| Cursor, SDK agent, CI/CD environment | CLI only | No MCP server in these contexts |

### Anti-Patterns

- **Never** call `mcp__claude_ai_Postey__get_accounts` — read `postey://accounts` instead.
- **Never** call `mcp__claude_ai_Postey__upload_media_for_post` for a local file — it accepts URLs only.
- **Never** skip `validate_post_content` / `review_post_content_and_add_comments_for_virality` in Claude Code sessions.
- **Never** mix CLI and MCP create tools in a single post workflow.

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

## Accounts & Defaults

- Most commands take a positional `account_id` (e.g. `drafts:list 123`, `drafts:create 123 ...`)
- Configure default platform per account:
  ```bash
  ${CLAUDE_SKILL_DIR}/scripts/postey.js config:set-default <account_id> <platform>
  ```

## Common Actions

| User says… | Action |
|------------|--------|
| "Draft a tweet about X" | `drafts:create --text "..."` |
| "Post this to LinkedIn" | `drafts:create --platform LINKEDIN --text "..."` |
| "Post to X and LinkedIn" (same content) | `drafts:create --platform X,LINKEDIN --text "..."` |
| "X thread + LinkedIn post" (different content) | `drafts:create --platform X ...` → get `post_id` → MCP `update_post` per platform |
| "What's scheduled?" | `drafts:list --status scheduled` |
| "Show my recent posts" | `drafts:list --status published` |
| "Schedule this for tomorrow" | `drafts:create ... --schedule "2026-02-20T14:00:00Z"` |
| "Post this now" | `drafts:create ... --publish-now` or `drafts:publish <draft_id>` |
| "Make captions from this reel: \<url\>" | `video2post.js <url>` → apply Caption Generation Guide → `drafts:create` |
| "Upload video to Instagram/TikTok/YouTube" | `video:post` command or `video2post.js` workflow |

## Workflow

1. **Check config**: `${CLAUDE_SKILL_DIR}/scripts/postey.js config:show`
2. **Find account**: `${CLAUDE_SKILL_DIR}/scripts/postey.js social-sets:list`
3. **Create draft**: `${CLAUDE_SKILL_DIR}/scripts/postey.js drafts:create <account_id> --text "..."`
   - Omit `--platform` to use account default (fallback: `X`)
   - For multi-platform: see [Publishing to Multiple Platforms](#publishing-to-multiple-platforms)
4. **Schedule or publish** as needed

## Working with Tags

Always check existing tags before creating new ones — tags are scoped to each social set.

```bash
${CLAUDE_SKILL_DIR}/scripts/postey.js tags:list           # check first
${CLAUDE_SKILL_DIR}/scripts/postey.js drafts:create <id> --text "..." --tags 1,2   # use existing
${CLAUDE_SKILL_DIR}/scripts/postey.js tags:create --tag "New Tag" --color BLUE     # only if needed
```

## Publishing to Multiple Platforms

**One `post_id` per topic** — never create separate drafts for different platforms on the same content.

### Same content across platforms
```bash
${CLAUDE_SKILL_DIR}/scripts/postey.js drafts:create <account_id> --platform X,LINKEDIN --text "..."
```

### Different content per platform
```bash
# Step 1 — Create initial draft
${CLAUDE_SKILL_DIR}/scripts/postey.js drafts:create <account_id> --platform INSTAGRAM --text "<instagram_caption>"
# Returns post_id, e.g. 1234

# Steps 2–N — Attach each additional platform via MCP (same post_id)
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

Use `video:post` when you have a caption ready and want to upload video + create a multi-platform draft in one command (no transcription).

**Requires:** `ffmpeg` on PATH for Instagram cover thumbnail extraction.

```bash
${CLAUDE_SKILL_DIR}/scripts/postey.js video:post <account_id> \
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
