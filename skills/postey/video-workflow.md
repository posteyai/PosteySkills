# Video → Transcription → Cross-Post Workflow

Use `video2post.js` when you need to transcribe a video URL and generate platform-optimized captions before posting. This is separate from `video:post` (which uploads a local file without transcription).

## Prerequisites

Install once per machine:

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

## Quick Workflow — Transcribe + Draft in One Command

```bash
# Create a YouTube draft from any video URL
node ${CLAUDE_SKILL_DIR}/scripts/video2post.js <url> --platform YOUTUBE --account-id <account_id>

# Cross-post to multiple platforms at once
node ${CLAUDE_SKILL_DIR}/scripts/video2post.js <url> --platform INSTAGRAM,TIKTOK,YOUTUBE --account-id <account_id>

# Transcribe only (no draft created)
node ${CLAUDE_SKILL_DIR}/scripts/video2post.js <url>
```

When `--platform` is given, `video2post.js` automatically calls `postey.js` to create one draft per platform using the raw transcript. For better quality captions, use the manual workflow below to generate platform-optimized content first.

## Flags

```
node ${CLAUDE_SKILL_DIR}/scripts/video2post.js <video-url> [options]

  --platform <platforms>   Target platform(s), comma-separated
                           (X, LINKEDIN, TIKTOK, INSTAGRAM, THREADS, BLUESKY, YOUTUBE)
  --account-id <id>        Postey account_id — required when --platform is set
  --output-dir, -o <path>  Save downloaded files to this directory
  --model <size>           Whisper model: tiny|base|small|medium|large (default: small)
```

## Output JSON

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

## Manual Workflow — Generate Captions First, Then Post

**Step 1** — Transcribe only:
```bash
node ${CLAUDE_SKILL_DIR}/scripts/video2post.js <url>
```

**Step 2** — Generate platform captions from the `transcript` field using the rules in [prompts.md](prompts.md). Apply the rules yourself — never paste the raw transcript as a caption.

**Step 3** — Create one draft for the first platform, attach the rest to the same `post_id`:
```bash
${CLAUDE_SKILL_DIR}/scripts/postey.js drafts:create <account_id> --platform INSTAGRAM --text "<instagram_caption>"
# Note the returned post_id
```
Then for each additional platform, use `update_post` MCP tool on the same `post_id`:
```
mcp update_post post_id=<post_id> platform=LINKEDIN contents=[{text: "<linkedin_caption>"}]
mcp update_post post_id=<post_id> platform=YOUTUBE contents=[{youtube_title: "<title>", youtube_description: "<desc>"}]
```

**Step 4** — Review and publish / schedule:
```bash
${CLAUDE_SKILL_DIR}/scripts/postey.js drafts:get <draft_id>
${CLAUDE_SKILL_DIR}/scripts/postey.js drafts:publish <draft_id>
# or schedule:
${CLAUDE_SKILL_DIR}/scripts/postey.js drafts:schedule <draft_id> --time "2026-05-07T10:00:00Z"
```
