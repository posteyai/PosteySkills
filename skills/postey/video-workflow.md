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

## Choosing a Workflow

- **Caption not yet written?** → Use **Workflow B** (transcribe first). The transcript gives you raw material; `suggested_captions` give you a starting point. Refine before posting.
- **Caption already written?** → Use **Workflow A** (upload + post directly).

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
--dry-run                Validate + print payload without calling API
```

---

## Transcription lives in `postey-video`

Turning a video into per-platform captions is `media.transcribe`, which the `postey-video` pack
owns — this skill only reads it. Install the pack and follow its `video-workflow.md`:

```
claude plugin install postey-video@postey-skills
```

Everything above — upload, cover extraction, chunked upload, trimming, inspection — is this
skill's own and needs no pack.

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
