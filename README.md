# Postey Skills

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.4.0-green.svg)]()
[![Postey API](https://img.shields.io/badge/Postey-API-3B9AF8)](https://postey.ai/docs/api)

AI agent skills for drafting, scheduling, and managing social media posts across X, LinkedIn, Instagram, TikTok, YouTube, Threads, and Bluesky.

One install gives your agent four guided content flows: **Brand voice** (learn a brand's voice from a handle or website), **Video everywhere** (any video URL becomes a per-platform multi-draft), **Trends** (fresh niche content daily), and **Idea to posts** (one idea, every platform, scheduled). No plugin system? Any connected agent can self-install with the one-paste prompt in [`skills/postey/bootstrap-prompt.md`](skills/postey/bootstrap-prompt.md), which fetches [`skills/postey/pack.json`](skills/postey/pack.json).

## Installation

### Claude Code (recommended)

**Step 1 — Register the marketplace** (one-time per user):
```
/plugin marketplace add posteyai/skills
```

**Step 2 — Install the skill**:
```
/plugin install postey@postey-skills
```

**Or for teams** — add this to your project's `.claude/settings.json` and team members get prompted automatically when they trust the folder:
```json
{
  "extraKnownMarketplaces": {
    "postey-skills": {
      "source": { "source": "github", "repo": "posteyai/skills" }
    }
  }
}
```

<details>
<summary>Other installation methods</summary>

**Cursor / Windsurf / generic agents (npx):**

```bash
npx skills add posteyai/skills
```

**Manual:**

Clone this repository and copy `skills/postey/` to your project's `.claude/skills/` or equivalent skills directory.

**Alternative — Postey MCP Server** (Claude Code):

For native MCP tool access without a CLI, connect the Postey MCP server directly at https://app.postey.ai?settings=integrations — no skill file needed.

</details>

## Setup

### 1. Get your API key

Copy an existing key or create a new one at https://app.postey.ai/?settings=api

### 2. Run setup

```bash
./skills/postey/scripts/postey.js setup
```

Or set the environment variable (zero additional commands if already set):
```bash
export POSTEY_API_KEY=your_key_here
```

### 3. Start using it

Ask your AI agent things like:

- "Draft a tweet about [topic]"
- "Create a LinkedIn post announcing [news]"
- "Schedule my draft for tomorrow morning"
- "Show my scheduled posts"
- "Cross-post this to Instagram, TikTok, and YouTube"
- "Upload this video and create captions for Instagram"

## Supported Platforms

| Platform | Notes |
|----------|-------|
| X (Twitter) | 280 chars |
| LinkedIn | 3,000 chars |
| Instagram | Reels + feed posts |
| TikTok | |
| YouTube | Title required |
| Threads | 500 chars |
| Bluesky | 300 chars |

## Troubleshooting

### "POSTEY_API_KEY environment variable is not set"

Run the setup command:
```bash
./skills/postey/scripts/postey.js setup
```

Or set the environment variable and add it to your shell profile (`~/.bashrc`, `~/.zshrc`, etc.):
```bash
export POSTEY_API_KEY=your_key_here
```

### "Node.js is required"

The CLI requires Node.js 18+ (for built-in `fetch`). Install a recent Node.js version, then retry.

### API errors (401, 403)

- Verify your API key is correct
- Check that your key has the required permissions at https://app.postey.ai?settings=api

### Drafts not appearing

- Verify the account: read the `postey://accounts` MCP resource (or call the `get_accounts` tool)
  and confirm you targeted the right `account_id`
- List drafts with the `get_posts` MCP tool (`status=DRAFT`), or read one directly from the
  `postey://posts/{id}/content/{platform}` resource

## Links

- [Postey](https://postey.ai)
- [API Docs](https://postey.ai/docs/api)
- [Skills Leaderboard](https://skills.sh)
- [Skills ↔ MCP responsibility contract](docs/skills-mcp-contract.md) — what this skill owns, and
  what belongs to the MCP server

## License

MIT
