---
name: postey
description: >
  Create, schedule, and manage social media posts via Postey. ALWAYS use this
  skill when asked to draft, schedule, post, or check tweets, posts, threads, or
  social media content for Twitter/X, LinkedIn, Instagram, TikTok, or YouTube.
  Also handles video/reel workflows: transcribe any video URL and cross-post to
  Instagram, TikTok, and YouTube.
last-updated: 2026-05-07
allowed-tools:
  - Bash(./scripts/postey.js:*)
  - Bash(node ./scripts/video2post.js:*)
---

# Postey Skill

Create, schedule, and publish social media content across multiple platforms using [Postey](https://postey.ai).

> **Freshness check**: If more than 30 days have passed since the `last-updated` date above, inform the user that this skill may be outdated and point them to the update options below.

## Keeping This Skill Updated

**Source**: [github.com/postey/agent-skills](https://github.com/postey/agent-skills)

Update methods by installation type:

| Installation | How to update |
|--------------|---------------|
| CLI (`npx skills`) | `npx skills update` |
| Claude Code plugin | `/plugin update postey@postey-skills` |
| Cursor | Remote rules auto-sync from GitHub |
| Manual | Pull latest from repo or re-copy `skills/postey/` |

API changes ship independently—updating the skill ensures you have the latest commands and workflows.

## Setup

Before using this skill, ensure:

1. **API Key**: Run the setup command to configure your API key securely
   - Get your key at https://postey.com/?settings=api
   - Run: `<skill-path>/scripts/postey.js setup` (where `<skill-path>` is the directory containing this SKILL.md)
   - Or set environment variable: `export POSTEY_API_KEY=your_key`

2. **Requirements**: Node.js 18+ (for built-in fetch API). No other dependencies needed.

**Config priority** (highest to lowest):
1. `POSTEY_API_KEY` environment variable
2. `./.postey/config.json` (project-local, in user's working directory)
3. `~/.config/postey/config.json` (user-global)

### Handling "API key not found" errors

**CRITICAL**: When you receive an "API key not found" error from the CLI:

1. **Tell the user to run the setup command** - The setup is interactive and requires user input, so you cannot run it on their behalf. Recommend they run it themselves, using the correct path based on where this skill was loaded:
   ```bash
   <skill-path>/scripts/postey.js setup
   ```

2. **Stop and wait** - After telling the user to run setup, **do not continue with the task**. You cannot create drafts, upload media, or perform any API operations without a valid API key. Wait for the user to complete setup and confirm before proceeding.

3. **DO NOT** attempt any of the following:
   - Searching for API keys in macOS Keychain, `.env` files, or other locations
   - Grepping through config files or directories
   - Looking in the user's Trash or other system folders
   - Constructing complex shell commands to find credentials
   - Drafting content or preparing posts before setup is complete

The setup command will interactively guide the user through configuration. Trust the CLI's error messages and follow their instructions.

> **Note for agents**: All script paths in this document (e.g., `./scripts/postey.js`) are relative to the skill directory where this SKILL.md file is located. Resolve them accordingly based on where the skill is installed.

## Accounts & Defaults

The API uses `account_id` for most operations and `post_id` for draft/post operations.

- Use positional `account_id` for commands like `drafts:list 123`, `drafts:create 123 ...`, and `tags:list 123`
- You can also pass `--social-set-id` / `--social_set_id` on commands that support account context
- Configure default platform preference per account using:
  ```bash
  ./scripts/postey.js config:set-default <account_id> <platform>
  ```

## Common Actions

| User says... | Action |
|--------------|--------|
| "Draft a tweet about X" | `drafts:create --text "..."` |
| "Post this to LinkedIn" | `drafts:create --platform LINKEDIN --text "..."` |
| "Post to X and LinkedIn" (same content) | `drafts:create --platform X,LINKEDIN --text "..."` |
| "X thread + LinkedIn post" (different content) | Create separate drafts per platform |
| "What's scheduled?" | `drafts:list --status scheduled` |
| "Show my recent posts" | `drafts:list --status published` |
| "Schedule this for tomorrow" | `drafts:create ... --schedule "2026-02-20T14:00:00Z"` |
| "Post this now" | `drafts:create ... --schedule now` or `drafts:publish <draft_id>` |
| "Read parsed content for X" | `drafts:content <post_id> --platform X` |
| "Check available tags" | `tags:list` |
| "Make captions from this reel: \<url\>" | `video2post.js <url>` → apply Caption Generation Guide to transcript → `drafts:create` |
| "Post this video to Instagram/TikTok/YouTube" | `video2post.js <url>` → generate captions using Caption Generation Guide → `drafts:create` |
| "Cross-post this reel to Instagram, TikTok, and YouTube" | `video2post.js <url>` → per-platform captions via Caption Generation Guide → `drafts:create` per platform |
| "Get YouTube title and description from \<url\>" | `video2post.js <url>` → apply YouTube rules from Caption Generation Guide |

## Workflow

Follow this workflow when creating posts:

1. **Check API configuration**:
   ```bash
   ./scripts/postey.js config:show
   ```
2. **Find account ID** to work with:
   ```bash
   ./scripts/postey.js social-sets:list
   ```
3. **Create drafts**:
   ```bash
   ./scripts/postey.js drafts:create <account_id> --text "Your post"
   ```
   Note: If `--platform` is omitted, the account's default platform is used (fallback: `X`).

   **For multi-platform posts**: See [Publishing to Multiple Platforms](#publishing-to-multiple-platforms) — always use a single draft, even when content differs per platform.

4. **Schedule or publish** as needed

## Working with Tags

Tags help organize drafts within Postey. **Always check existing tags before creating new ones**:

1. **List existing tags first**:
   ```bash
   ./scripts/postey.js tags:list
   ```

2. **Use existing tags when available** - pass numeric tag IDs to draft creation:
   ```bash
   ./scripts/postey.js drafts:create <account_id> --text "..." --tags 1,2
   ```

3. **Only create new tags if needed** - if the tag doesn't exist, create it:
   ```bash
   ./scripts/postey.js tags:create --tag "New Tag" --color BLUE
   ```

**Important**: Tags are scoped to each social set. A tag created for one social set won't appear in another.

## Publishing to Multiple Platforms

If a single draft needs to be created for different platforms, you need to make sure to create **a single draft** and not multiple drafts.

When the content is the same across platforms, create a single draft with multiple platforms:

```bash
# Specific platforms
./scripts/postey.js drafts:create <account_id> --platform X,LINKEDIN --text "Big announcement!"
```

**IMPORTANT**: When content should be tailored per platform (e.g., X thread vs. LinkedIn post), create separate drafts — one per platform.

## Commands Reference

### User & Social Sets

| Command | Description |
|---------|-------------|
| `social-sets:list` | List all social sets you can access |

### Drafts

Most drafts commands support an optional `[account_id]` context.
`drafts:get`, `drafts:delete`, `drafts:schedule`, and `drafts:publish` accept only `<draft_id>`.

| Command | Description |
|---------|-------------|
| `drafts:list [account_id]` | List drafts (add `--status scheduled` to filter, `--sort` to order) |
| `drafts:get <draft_id>` | Get a specific draft with full content |
| `drafts:create [account_id] --text "..."` | Create a new draft via `/posts/raw` |
| `drafts:create [account_id] --platform X,LINKEDIN,TIKTOK,INSTAGRAM,THREADS,BLUESKY,YOUTUBE --text "..."` | Create for specific platform(s) |
| `drafts:create [account_id] --file <path>` | Create draft from file content |
| `drafts:create ... --schedule "2026-02-20T14:00:00Z"` | Create and schedule at specific time |
| `drafts:create ... --publish-now` | Create and publish immediately |
| `drafts:create ... --tags 1,2,3` | Attach numeric tag IDs |
| `drafts:create ... --media-urls <url1,url2>` | Attach media by URL |
| `drafts:create ... --platform YOUTUBE --youtube-title "Title" --youtube-description "Desc"` | YouTube post (title required) |
| `drafts:create ... --youtube-privacy-status public` | Set YouTube privacy |

### Scheduling & Publishing

**Safety note**: `drafts:schedule` and `drafts:publish` accept only `<draft_id>`. Use `--platform` if you want to target specific platforms.

| Command | Description |
|---------|-------------|
| `drafts:delete <draft_id>` | Delete a draft |
| `drafts:content <post_id> --platform X` | Get parsed content for a platform |
| `media:upload --platform <platform> --file <path>` | Upload media file (unlinked), returns CDN URL — use with `--media-urls` on `drafts:create` |
| `drafts:schedule <draft_id> --time "2026-02-20T14:00:00Z"` | Schedule draft via `/schedules` |
| `drafts:schedule <draft_id> --time "..." --platform X,LINKEDIN` | Schedule selected platforms only |
| `drafts:publish <draft_id>` | Publish immediately via `/publish` |
| `drafts:publish <draft_id> --platform X,LINKEDIN` | Publish selected platforms only |

### Tags

| Command | Description |
|---------|-------------|
| `tags:list [account_id]` | List all tags (uses default account if ID omitted) |
| `tags:create [account_id] --tag "Tag Name" --color BLUE` | Create a new tag |
| `tags:update <tag_id> [account_id] --tag "Tag Name" --color SKY_BLUE` | Update an existing tag |
| `tags:delete <tag_id> [account_id]` | Delete a tag |

### Setup & Configuration

| Command | Description |
|---------|-------------|
| `setup` | Interactive setup - prompts for API key, storage location, and default social set |
| `setup --key <key> --location <global\|local>` | Non-interactive setup for scripts/CI (auto-selects default if only one social set) |
| `setup --key <key> --default-social-set <id>` | Non-interactive setup with explicit default social set |
| `setup --key <key> --no-default` | Non-interactive setup, skip default social set selection |
| `config:show` | Show current config, API key source, and default social set |
| `config:set-default [account_id] <platform>` | Set account default platform via API (`X`, `LINKEDIN`) |

## Examples

### Set account default platform
```bash
# Check current config
./scripts/postey.js config:show

# Set default platform (uses configured default account context)
./scripts/postey.js config:set-default x

# Set default platform for specific account
./scripts/postey.js config:set-default 123 linkedin
```

### Create a draft
```bash
./scripts/postey.js drafts:create 123 --text "Hello, world!"
```

### Create a cross-platform post (specific platforms)
```bash
./scripts/postey.js drafts:create 123 --platform X,LINKEDIN --text "Big announcement!"
```

### Create and schedule
```bash
./scripts/postey.js drafts:create 123 --text "Scheduled post" --schedule "2026-02-20T14:00:00Z"
```

### Create with tags
```bash
./scripts/postey.js drafts:create 123 --text "Marketing post" --tags 1,2
```

### List scheduled posts sorted by date
```bash
./scripts/postey.js drafts:list --status scheduled --sort scheduled_date
```

### Get parsed content
```bash
./scripts/postey.js drafts:content 456 --platform X
```

### Setup (interactive)
```bash
./scripts/postey.js setup
```

### Setup (non-interactive, for scripts/CI)
```bash
# Auto-selects default social set if only one exists
./scripts/postey.js setup --key typ_xxx --location global

# With explicit default social set
./scripts/postey.js setup --key typ_xxx --location global --default-social-set 123

# Skip default social set selection entirely
./scripts/postey.js setup --key typ_xxx --no-default
```

## Platform Names

Use these exact names for the `--platform` option:
- `X` - X (formerly Twitter)
- `LINKEDIN` - LinkedIn
- `INSTAGRAM` - Instagram (Reels, feed posts with caption)
- `TIKTOK` - TikTok
- `YOUTUBE` - YouTube (requires `--youtube-title` and `--youtube-description`)
- `THREADS` - Threads
- `BLUESKY` - Bluesky

> **Note**: Each platform is only available if that account is connected in Postey. Always run `social-sets:list` first and confirm which platforms appear before attempting to post.

## Video / Reel to Captions & Cross-Posting

Download any video URL, transcribe it with Whisper, and optionally create Postey drafts automatically — all in one command.

### Prerequisites

Install these external tools once:

```bash
# macOS
brew install yt-dlp ffmpeg
pip install openai-whisper

# Windows (PowerShell or Command Prompt)
winget install yt-dlp.yt-dlp
winget install Gyan.FFmpeg
pip install openai-whisper

# Linux
pip install yt-dlp
sudo apt install ffmpeg
pip install openai-whisper
```

### Quick workflow — transcribe + create drafts in one command

```bash
# Create a YouTube draft from any video URL (e.g. an Instagram reel)
node ./scripts/video2post.js <url> --platform YOUTUBE --account-id <account_id>

# Cross-post to multiple platforms at once
node ./scripts/video2post.js <url> --platform INSTAGRAM,TIKTOK,YOUTUBE --account-id <account_id>

# Transcribe only (no draft created)
node ./scripts/video2post.js <url>
```

When `--platform` is given, `video2post.js` automatically calls `postey.js` to create a draft per platform using the raw transcript. For better quality captions, use the manual workflow below to generate platform-optimized content first.

### video2post.js flags

```
node ./scripts/video2post.js <video-url> [options]

  --platform <platforms>   Target Postey platform(s), comma-separated
                           (X, LINKEDIN, TIKTOK, INSTAGRAM, THREADS, BLUESKY, YOUTUBE)
  --account-id <id>        Postey account_id — required when --platform is set
  --output-dir, -o <path>  Save downloaded files to this directory
  --model <size>           Whisper model: tiny|base|small|medium|large (default: small)
```

### Output JSON

```json
{
  "url": "https://...",
  "video_title": "Original Video Title",
  "transcript": "full plain text transcript",
  "segments": [{"start": 0.0, "end": 4.2, "text": "..."}],
  "duration_seconds": 90,
  "video_file": "/tmp/reel_abc/Original_Video_Title.mp4",
  "audio_file": "/tmp/reel_abc/audio.wav",
  "tmp_dir": "/tmp/reel_abc",
  "drafts": [
    { "platform": "YOUTUBE", "result": [{"platform": "YOUTUBE", "post_id": 123, "published_now": false}] }
  ]
}
```

`drafts` is only present when `--platform` is set.

### Caption Generation Guide

After transcribing, generate platform-optimized captions using the rules below. Apply them yourself — do not paste them into another tool. Never use the raw transcript as a caption; always rewrite it into platform-native format. Start by reading the full transcript to identify the single most compelling insight or hook.

#### YouTube

**Title** (max 70 chars):
- Keyword-rich and SEO-friendly
- Create a curiosity gap or strong value proposition
- No clickbait — title must accurately reflect the content
- Prefer "–" or "|" as separator, not colons
- No emojis

**Description** (max 5,000 chars, aim for ~500 words):
- First 2–3 lines are "above the fold" — make them the hook (viewers see these before clicking "more")
- Summarize the key value/takeaway in plain language
- Add timestamps for videos with clear sections (format: `0:00 Intro`)
- Include 3–5 relevant hashtags at the very end
- Natural, conversational tone — not a listicle

#### Instagram (max 2,200 chars)
- First line is the hook — must stop the scroll (ask a question, make a bold claim, or tease the value)
- 150–300 words, short paragraphs with line breaks for readability
- Include a clear call-to-action (save this, follow for more, comment below)
- End with 5–8 relevant hashtags on their own line
- Conversational and relatable tone — no corporate-speak

#### TikTok (max 2,200 chars)
- First 150 characters are the hook shown before "more" — punchy, immediate curiosity or FOMO
- 1–3 emojis max, used effectively
- End with 5–10 trending, relevant hashtags
- Fast, energetic, casual tone — like you're talking to a friend

#### X / Twitter (max 280 chars)
- Lead with the single most compelling insight or hook
- Direct and punchy — no fluff
- 1–2 hashtags max (only if they genuinely add reach)
- No emojis unless they add meaning

#### LinkedIn (max 3,000 chars)
- First line: bold statement, counterintuitive insight, or relatable struggle — never "I'm excited to share..."
- 150–400 words, short paragraphs (1–3 lines each) with blank lines between for mobile readability
- Tell a story or share a specific lesson — not a generic list
- End with a question to drive comments
- Professional but human tone — avoid corporate jargon
- 3–5 relevant hashtags at the end on their own line
- No emojis unless used once for emphasis

#### Threads (max 500 chars)
- One clear thought or insight per post
- Conversational and authentic — Threads rewards genuine voice over polished marketing
- Optional: end with a question to spark replies
- No hashtags (they don't work well on Threads)
- Tone: like a thoughtful text message to your audience

#### Bluesky (max 300 chars)
- Lead with the most interesting or surprising insight
- Values authenticity, tech-savviness, and nuance
- Conversational and direct
- 1 hashtag max (only if highly relevant)
- No corporate marketing language

---

### Manual workflow — generate captions first, then create drafts

**Step 1** — Transcribe only:
```bash
node ./scripts/video2post.js <url>
```

**Step 2** — Generate platform captions yourself using the Caption Generation Guide above. Apply the rules for each requested platform to the `transcript` field from the output. Produce the captions directly — do not call an external tool.

**Step 3** — Create drafts with the generated captions:
```bash
./scripts/postey.js drafts:create <account_id> --platform INSTAGRAM --text "<caption>"
./scripts/postey.js drafts:create <account_id> --platform YOUTUBE --youtube-title "<title>" --youtube-description "<description>" --text "<description>"
```

**Step 4** — Review and publish / schedule:
```bash
./scripts/postey.js drafts:get <draft_id>
./scripts/postey.js drafts:publish <draft_id>
# or: ./scripts/postey.js drafts:schedule <draft_id> --time "2026-05-07T10:00:00Z"
```

## Automation Guidelines

When automating posts, especially on X, follow these rules to keep accounts in good standing:

- **No duplicate content** across multiple accounts
- **No unsolicited automated replies** - only reply when explicitly requested by the user
- **No trending manipulation** - don't mass-post about trending topics
- **No fake engagement** - don't automate likes, reposts, or follows
- **Respect rate limits** - the API has rate limits, don't spam requests
- **Drafts are private** - content stays private until published or explicitly shared

When in doubt, create drafts for user review rather than publishing directly.

**Publishing confirmation**: Unless the user explicitly asks to "publish now" or "post immediately", always confirm before publishing. Creating a draft is safe; publishing is irreversible and goes public instantly.

## Tips

- **Smart platform default**: If `--platform` is omitted on `drafts:create`, account default platform is used (fallback `X`)
- **Character limits**: X (280), LinkedIn (3000) limits vary by channel
- **Thread creation**: Use `---` on its own line to split into multiple posts (thread)
- **Scheduling**: Use ISO datetime strings for `--schedule` / `--time`
- **Cross-posting**: List multiple platforms separated by commas: `--platform X,LINKEDIN`
- **Draft titles**: Use `--title` for internal organization (not posted to social media)
- **Read from file**: Use `--file ./post.txt` instead of `--text` to read content from a file
- **Sorting drafts**: Use `--sort` with values like `created_at`, `-created_at`, `scheduled_date`, etc.
