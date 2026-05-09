# Postey CLI — Command Reference

All commands run via `${CLAUDE_SKILL_DIR}/scripts/postey.js <command> [args]`.

## Drafts

| Command | Description |
|---------|-------------|
| `drafts:get <draft_id>` | Get a specific draft with full content |

## Media

| Command | Description |
|---------|-------------|
| `media:upload --platform <platform> --file <path>` | Upload media file (unlinked), returns CDN URL |
| `video:post [account_id] --video <path\|url> --text "..." --platforms <CSV>` | Upload video + extract cover thumbnail + create multi-platform draft |

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

# Get a specific draft
${CLAUDE_SKILL_DIR}/scripts/postey.js drafts:get 456

# Non-interactive setup (scripts/CI)
${CLAUDE_SKILL_DIR}/scripts/postey.js setup --key typ_xxx --location global --default-social-set 123

# Upload video → Instagram Reel + text to LinkedIn and X
${CLAUDE_SKILL_DIR}/scripts/postey.js video:post 317 --video ./reel.mp4 --text "Caption" --platforms INSTAGRAM,LINKEDIN,X
```
