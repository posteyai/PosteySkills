# Postey CLI — Command Reference

All commands run via `${CLAUDE_SKILL_DIR}/scripts/postey.js <command> [args]`.

## Auth and setup

| Command | Description |
|---------|-------------|
| `auth:link --begin` | Print a link code and PKCE challenge. Hand the code to the `link_cli` MCP tool, then claim it. Copies this connection's access to the CLI — no second sign-in. |
| `auth:link --claim <code>` | Complete the link and store the credential. The token is never printed. |
| `auth:login [--local]` | Interactive OAuth in a browser. `--local` writes to `./.postey/`; prefer global. |
| `auth:logout` | Clear the local credential — the OAuth session and any linked token. Server-side grants are revoked in Postey settings. |
| `setup --key <key> [--location global\|local]` | Store an API key. `--key` is required unattended: without it the command prompts on stdin. |
| `config:show` | Report which credential is active and where it came from. Values are previewed, never printed. |

## Media

| Command | Description |
|---------|-------------|
| `media:upload --platform <platform> --file <path>` | Upload media file (unlinked), returns CDN URL |

## Video Subcommands

| Command | Description |
|---------|-------------|
| `video post --video <path\|url> --text "..." --platforms <CSV> --account-id <id>` | Upload video (and auto cover) and return the fields for MCP `create_post`. INSTAGRAM/TIKTOK/YOUTUBE get video attached; others get text only. Supports `--dry-run`. |
| `video trim --file <path> --start <sec> (--end <sec>\|--duration <sec>)` | Trim video clip (stream copy, no re-encode). `--end` and `--duration` are mutually exclusive. |
| `video info --file <path>` | Inspect video: duration, codec, dimensions, aspect ratio, platform hints via ffprobe. |
| `video transcribe --input <url\|path> [--platform <CSV> --account-id <id>]` | Transcribe audio via yt-dlp + Whisper. `--input` may also be passed as a bare positional argument (e.g. `video transcribe /path/to/file.mp4`). Returns `transcript` + `suggested_captions` per platform. With `--platform` + `--account-id` it also uploads the media and returns `draft_inputs` for MCP `create_post` — it does not create the draft. Supports `--dry-run`. |

## Setup & Configuration

| Command | Description |
|---------|-------------|
| `setup` | Interactive: prompts for API key, storage location, default social set |
| `setup --key <key> --location <global\|local>` | Non-interactive (auto-selects default if one social set) |
| `setup --key <key> --default-social-set <id>` | Non-interactive with explicit default social set |
| `setup --key <key> --no-default` | Non-interactive, skip default selection |
| `config:show` | Show current config, API key source, default social set |

## Examples

```bash
# Check current config
${CLAUDE_SKILL_DIR}/scripts/postey.js config:show

# Non-interactive setup (scripts/CI)
${CLAUDE_SKILL_DIR}/scripts/postey.js setup --key typ_xxx --location global --default-social-set 123

# Inspect a video before uploading
${CLAUDE_SKILL_DIR}/scripts/postey.js video info --file ./reel.mp4

# Trim a clip to 30 seconds
${CLAUDE_SKILL_DIR}/scripts/postey.js video trim --file ./reel.mp4 --start 0 --duration 30

# Upload video → Instagram Reel + text to LinkedIn and X
${CLAUDE_SKILL_DIR}/scripts/postey.js video post --video ./reel.mp4 --text "Caption" --platforms INSTAGRAM,LINKEDIN,X --account-id 317

# Dry-run to validate without making API calls
${CLAUDE_SKILL_DIR}/scripts/postey.js video post --video ./reel.mp4 --text "Caption" --platforms INSTAGRAM --account-id 317 --dry-run

# Transcribe a YouTube video and get suggested captions
${CLAUDE_SKILL_DIR}/scripts/postey.js video transcribe --input https://youtu.be/abc123

# Transcribe + create draft on Instagram and X
${CLAUDE_SKILL_DIR}/scripts/postey.js video transcribe --input https://youtu.be/abc123 --platform INSTAGRAM,X --account-id 317
```
