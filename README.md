# Postey Skills

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-2.5.0-green.svg)]()
[![Postey API](https://img.shields.io/badge/Postey-API-3B9AF8)](https://postey.ai/docs/api)

AI agent skills for drafting, scheduling, and managing social media posts on every platform Postey connects.

One install gives your agent four guided content flows: **Brand voice** (learn a brand's voice from a handle or website), **Video everywhere** (any video URL becomes a per-platform multi-draft), **Trends** (fresh niche content daily), and **Idea to posts** (one idea, every platform, scheduled). No plugin system? Any connected agent can self-install with the one-paste prompt in [`skills/postey/bootstrap-prompt.md`](skills/postey/bootstrap-prompt.md), which fetches [`skills/postey/pack.json`](skills/postey/pack.json).

## The skill and the MCP server are layers, not alternatives

The [Postey MCP server](https://app.postey.ai?settings=integrations) carries the capability. This skill is a **strict extension** of it: it adds only what the server cannot reach, and it never ships a second path to something the server already does. You are not choosing between them — connect the server, then install the skill on top of it.

Which surface owns a capability is decided in advance, by one question (from the [contract](docs/skills-mcp-contract.md)):

> *Does this require access to something only your machine has, or is it judgment rather than contract?*

- **Yes → the skill.** Local files, video processing, chunked upload, local auth config, and the craft calls — brand voice, platform tone, when to thread.
- **No → the MCP server.** Every state read, every mutation, permissions, and platform capability truth.
- **Arguable → the MCP server**, because it is the one that can enforce permissions.

Nothing here is negotiated at runtime, so your agent never has to work out which path to take. The full ownership table is in [`docs/skills-mcp-contract.md`](docs/skills-mcp-contract.md); the per-task routing the agent follows is in [`skills/postey/routing-guide.md`](skills/postey/routing-guide.md).

## Installation

**The one instruction that covers every agent** is [`setup.md`](setup.md). Paste this
into any agent and it will register the server, authenticate, install the skill and
verify the connection:

```
Set up Postey by following instructions: https://raw.githubusercontent.com/posteyai/skills/main/setup.md
```

That is the same prompt the app hands you under **AI & Agents**. The steps below are
the pieces it runs, for anyone doing it by hand.

### Claude Code (recommended)

This path installs the skill and the MCP server together.

**Step 1 — Register the marketplace** (one-time per user):
```
claude plugin marketplace add posteyai/skills
```

**Step 2 — Install the skill**:
```
claude plugin install postey@postey-skills
```

Use the shell commands above rather than the `/plugin` slash commands. The slash form
opens an interactive panel, so an agent cannot run it unattended.

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
npx -y skills add posteyai/skills -a <agent> -y
```

Name the agent and pass `-y`. Without both, the CLI prompts for scope, agent and
skill, so an unattended run hangs. `npx -y skills add posteyai/skills --list` prints
the ids. Hermes Agent is `hermes-agent`, not `hermes`.

**Manual:**

Clone this repository and copy `skills/postey/` into the directory your agent reads.
That is `.claude/skills/` for Claude Code and `.agents/skills/` for roughly eighteen
others, including Cursor, Codex, Gemini CLI, Copilot and opencode. Claude Code does
not read `.agents/skills/`.

</details>

### Connect the MCP server

Whichever install method you use, connect the Postey MCP server at https://app.postey.ai?settings=integrations. It is the layer underneath — reads, writes and permissions all go through it, so the skill's flows are incomplete without it.

## Setup

### 1. Get a credential

Most agents complete OAuth themselves, and then there is nothing to copy. Trigger
your agent's MCP login for `postey`.

For an agent that cannot open a browser, such as a CI job or a container, create an
agent token at https://app.postey.ai/?settings=api. A token belongs to a connected
agent, expires after 90 days, and dies when you revoke that agent. Pass it as
`POSTEY_AUTH_TOKEN`.

An API key still works and is set with `POSTEY_API_KEY`. It does not expire, so keep
it in a secret manager.

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

## Supported platforms

Platform capability truth — which platforms exist, their character limits and their rules — belongs to the MCP server, and this repo reads it rather than restating it. A hand-kept copy here would go stale the day the server adds a platform, which is exactly what happened before.

- Current platform set, tools and resources: [`skills/postey/capability-snapshot.json`](skills/postey/capability-snapshot.json), generated from the server's `postey://skill-manifest` and checked against a live server in CI
- Per-platform limits at runtime: the `postey://platform-limits` and `postey://platforms/{platform}/rules` resources

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
