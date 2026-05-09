# Video Workflow

All video operations run through `postey.js`. Use `video post` for upload workflows, `video transcribe` for transcription-first workflows, and `video info` / `video trim` for pre-flight inspection and editing.

## Prerequisites

Install once per machine:

```bash
# macOS
brew install yt-dlp ffmpeg

# Linux
pip install yt-dlp
sudo apt install ffmpeg
```

For transcription (`video transcribe`), also install Whisper:
```bash
pip install openai-whisper
# or for Apple Silicon:
pip install mlx-whisper
```

---

## Workflow A — Upload Video + Create Draft

Use when you have the caption ready and just need to upload and post.

```bash
# Inspect the video first (optional but recommended)
${CLAUDE_SKILL_DIR}/scripts/postey.js video info --file ./reel.mp4

# Trim if needed
${CLAUDE_SKILL_DIR}/scripts/postey.js video trim --file ./reel.mp4 --start 0 --duration 60 --output ./reel_60s.mp4

# Upload video → Instagram Reel (auto cover thumbnail) + text to LinkedIn and X
${CLAUDE_SKILL_DIR}/scripts/postey.js video post \
  --video ./reel.mp4 \
  --text "Caption here" \
  --platforms INSTAGRAM,LINKEDIN,X \
  --account-id 317

# Dry-run to validate payload without making any API calls
${CLAUDE_SKILL_DIR}/scripts/postey.js video post \
  --video ./reel.mp4 --text "Caption" --platforms INSTAGRAM --account-id 317 --dry-run
```

`video post` flags:

```
--video <path|url>       Local file path or https:// URL (required)
--text <caption>         Caption for all platforms (required)
--platforms <CSV>        Comma-separated platform list (required)
--account-id <id>        Postey account ID (required)
--cover-time <sec>       Cover frame extraction offset in seconds (default: 3)
--cover-url <url>        Skip auto cover extraction, use this CDN URL instead
--youtube-title <str>    YouTube video title
--title <str>            Internal draft title
--tags <CSV>             Comma-separated numeric tag IDs
--schedule <iso>         Schedule at ISO-8601 UTC datetime
--publish-now            Publish immediately after creation
--dry-run                Validate + print payload without calling API
```

---

## Workflow B — Transcribe → Generate Captions → Post

Use when you want Whisper-generated captions refined before posting.

**Step 1** — Transcribe only:
```bash
${CLAUDE_SKILL_DIR}/scripts/postey.js video transcribe --input https://youtu.be/abc123
```

Output includes `transcript` and `suggested_captions` per platform (truncated to each platform's character limit).

**Step 2** — Generate polished captions from the `transcript` field using the rules in [prompts.md](prompts.md). Apply the rules yourself — never paste the raw transcript as a caption.

**Step 3** — Create draft with the polished captions:
```bash
${CLAUDE_SKILL_DIR}/scripts/postey.js posts:create \
  --account-id 317 \
  --platforms INSTAGRAM \
  --text "<instagram_caption>"
# Returns post_id

# Attach additional platforms via MCP update_post:
# mcp update_post post_id=<post_id> platform=LINKEDIN contents=[{text: "<linkedin_caption>"}]
```

**Step 4** — Publish or schedule via MCP:
```
mcp publish_draft post_id=<post_id>
# or
mcp schedule_post post_id=<post_id> scheduled_at="2026-05-07T10:00:00Z"
```

**One-step transcribe + draft** (uses raw transcript, skips caption refinement):
```bash
${CLAUDE_SKILL_DIR}/scripts/postey.js video transcribe \
  --input https://youtu.be/abc123 \
  --platform INSTAGRAM,X \
  --account-id 317
```

`video transcribe` flags:

```
--input <url|path>       Video URL or local file path (required)
--platform <CSV>         If set, also creates a draft (requires --account-id)
--account-id <id>        Account to post to when --platform is given
--model <size>           Whisper model: tiny|base|small|medium|large (default: small)
--translate              Translate audio to English
--keep-files             Keep downloaded temp files after transcription
--output-dir <path>      Directory for temp files (default: system temp)
--dry-run                Show what would be posted without API calls
```

---

## Utility Commands

**Inspect a video** (requires ffprobe):
```bash
${CLAUDE_SKILL_DIR}/scripts/postey.js video info --file ./clip.mp4
```
Returns duration, codec, dimensions, aspect ratio, and platform fit hints.

**Trim a clip** (requires ffmpeg, stream copy — no re-encode):
```bash
${CLAUDE_SKILL_DIR}/scripts/postey.js video trim \
  --file ./clip.mp4 --start 5 --end 35 --output ./trimmed.mp4
# or use --duration instead of --end:
${CLAUDE_SKILL_DIR}/scripts/postey.js video trim \
  --file ./clip.mp4 --start 0 --duration 60
```
