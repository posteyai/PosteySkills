# Postey CLI — Command Reference

All commands run via `${CLAUDE_SKILL_DIR}/scripts/postey.js <command> [args]`.

## User & Social Sets

| Command | Description |
|---------|-------------|
| `social-sets:list` | List all social sets you can access |

## Drafts

Most commands accept an optional `[account_id]`. `drafts:get`, `drafts:delete`, `drafts:schedule`, and `drafts:publish` accept only `<draft_id>`.

| Command | Description |
|---------|-------------|
| `drafts:list [account_id]` | List drafts (`--status scheduled\|published\|draft`, `--sort` to order) |
| `drafts:get <draft_id>` | Get a specific draft with full content |
| `drafts:create [account_id] --text "..."` | Create a new draft |
| `drafts:create [account_id] --platform X,LINKEDIN,TIKTOK,INSTAGRAM,THREADS,BLUESKY,YOUTUBE --text "..."` | Create for specific platform(s) |
| `drafts:create [account_id] --file <path>` | Create draft from file content |
| `drafts:create ... --schedule "2026-02-20T14:00:00Z"` | Create and schedule |
| `drafts:create ... --publish-now` | Create and publish immediately |
| `drafts:create ... --tags 1,2,3` | Attach numeric tag IDs |
| `drafts:create ... --media-urls <url1,url2>` | Attach media by URL |
| `drafts:create ... --platform YOUTUBE --youtube-title "Title" --youtube-description "Desc"` | YouTube post (title required) |
| `drafts:create ... --youtube-privacy-status public` | Set YouTube privacy (`public`, `private`, `unlisted`) |
| `drafts:delete <draft_id>` | Delete a draft |
| `drafts:content <post_id> --platform X` | Get parsed content for a specific platform |

## Scheduling & Publishing

**Safety**: `drafts:schedule` and `drafts:publish` accept only `<draft_id>`. Add `--platform` to target specific platforms.

| Command | Description |
|---------|-------------|
| `drafts:schedule <draft_id> --time "2026-02-20T14:00:00Z"` | Schedule via `/schedules` |
| `drafts:schedule <draft_id> --time "..." --platform X,LINKEDIN` | Schedule selected platforms only |
| `drafts:publish <draft_id>` | Publish immediately |
| `drafts:publish <draft_id> --platform X,LINKEDIN` | Publish selected platforms only |

## Media

| Command | Description |
|---------|-------------|
| `media:upload --platform <platform> --file <path>` | Upload media file (unlinked), returns CDN URL — use result with `--media-urls` on `drafts:create` |
| `video:post [account_id] --video <path\|url> --text "..." --platforms <CSV>` | Upload video + extract cover thumbnail + create multi-platform draft |

## Tags

| Command | Description |
|---------|-------------|
| `tags:list [account_id]` | List all tags (uses default account if ID omitted) |
| `tags:create [account_id] --tag "Tag Name" --color BLUE` | Create a new tag |
| `tags:update <tag_id> [account_id] --tag "Name" --color SKY_BLUE` | Update a tag |
| `tags:delete <tag_id> [account_id]` | Delete a tag |

## Setup & Configuration

| Command | Description |
|---------|-------------|
| `setup` | Interactive: prompts for API key, storage location, default social set |
| `setup --key <key> --location <global\|local>` | Non-interactive (auto-selects default if one social set) |
| `setup --key <key> --default-social-set <id>` | Non-interactive with explicit default social set |
| `setup --key <key> --no-default` | Non-interactive, skip default selection |
| `config:show` | Show current config, API key source, default social set |
| `config:set-default [account_id] <platform>` | Set account default platform (`X`, `LINKEDIN`, etc.) |

## Examples

```bash
# Check current config
${CLAUDE_SKILL_DIR}/scripts/postey.js config:show

# List all accounts
${CLAUDE_SKILL_DIR}/scripts/postey.js social-sets:list

# Create a draft (default platform)
${CLAUDE_SKILL_DIR}/scripts/postey.js drafts:create 123 --text "Hello, world!"

# Create cross-platform post
${CLAUDE_SKILL_DIR}/scripts/postey.js drafts:create 123 --platform X,LINKEDIN --text "Big announcement!"

# Create and schedule
${CLAUDE_SKILL_DIR}/scripts/postey.js drafts:create 123 --text "Scheduled post" --schedule "2026-02-20T14:00:00Z"

# Create with tags
${CLAUDE_SKILL_DIR}/scripts/postey.js drafts:create 123 --text "Marketing post" --tags 1,2

# List scheduled posts sorted by date
${CLAUDE_SKILL_DIR}/scripts/postey.js drafts:list --status scheduled --sort scheduled_date

# Get parsed content for a platform
${CLAUDE_SKILL_DIR}/scripts/postey.js drafts:content 456 --platform X

# Set default platform
${CLAUDE_SKILL_DIR}/scripts/postey.js config:set-default 123 linkedin

# Non-interactive setup (scripts/CI)
${CLAUDE_SKILL_DIR}/scripts/postey.js setup --key typ_xxx --location global --default-social-set 123
```
