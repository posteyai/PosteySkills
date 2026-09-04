<div align="center">

# Postey Skills — MCP Server & AI Agent Skills for Social Media

**Draft, schedule and publish social posts to nine platforms from any AI agent.**

[**Website**](https://postey.ai) · [**MCP Server**](https://postey.ai/mcp) · [**Docs**](https://postey.ai/docs) · [**Claude setup**](https://postey.ai/docs/claude) · [**Sign in**](https://app.postey.ai)

[![Postey](https://img.shields.io/badge/Postey-postey.ai-3B9AF8)](https://postey.ai)
[![MCP Registry](https://img.shields.io/badge/MCP%20Registry-ai.postey%2Fpostey-6E56CF)](https://registry.modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-3.2.0-green.svg)]()

</div>

---

[Postey](https://postey.ai) is a social media publishing platform that AI agents can drive directly. This repository holds two things: the public documentation for the **hosted Postey MCP server**, and the **agent skills** that install on top of it.

Supported platforms: **X (Twitter), LinkedIn, Instagram, TikTok, YouTube, Threads, Bluesky, Facebook and Pinterest.**

Works with Claude, Claude Code, Cursor, Windsurf, Codex, Gemini CLI, GitHub Copilot, opencode and roughly eighteen other agents.

## Quick start

Connect the hosted MCP server. Nothing to install, and connecting is free.

```
https://srvr.postey.ai/mcp
```

```bash
claude mcp add --transport http postey https://srvr.postey.ai/mcp
```

Then ask your agent for what you want:

- "Draft a tweet about [topic]"
- "Create a LinkedIn post announcing [news]"
- "Schedule my draft for tomorrow morning"
- "Show my scheduled posts"
- "Cross-post this to Instagram, TikTok and YouTube"
- "Upload this video and write captions for each platform"

## The Postey MCP server

If you arrived here from an MCP registry, the server is what you want.

| | |
|---|---|
| **Endpoint** | `https://srvr.postey.ai/mcp` |
| **Transport** | Streamable HTTP, hosted |
| **Registry** | [`ai.postey/postey`](https://registry.modelcontextprotocol.io) in the official MCP Registry |
| **Tools** | 33, plus MCP resources and prompts |
| **Auth** | OAuth 2.1 + PKCE, or an `X-API-Key` header |
| **Cost** | Free to connect |
| **Setup guides** | **[postey.ai/mcp](https://postey.ai/mcp)** |

Two ways to authenticate:

- **OAuth 2.1 + PKCE**, with dynamic client registration. Interactive, so it needs a browser.
- **`X-API-Key: mk_...`** for headless and CI agents, created under **AI & Agents → Advanced** in [the Postey app](https://app.postey.ai?settings=agents&section=advanced). There is no `client_credentials` grant, so this is the only browserless path.

The server publishes a machine-readable summary at [`/connect`](https://srvr.postey.ai/connect) and a full tool list at [`/.well-known/mcp/server-card.json`](https://srvr.postey.ai/.well-known/mcp/server-card.json). Neither needs a credential.

## The skill and the server are layers, not alternatives

The [Postey MCP server](https://postey.ai/mcp) carries the capability. This skill is a **strict extension** of it: it adds only what the server cannot reach, and it never ships a second path to something the server already does. You are not choosing between them. Connect the server, then install the skill on top.

Which surface owns a capability is decided in advance, by one question from the [contract](docs/skills-mcp-contract.md):

> *Does this require access to something only your machine has, or is it judgment rather than contract?*

- **Yes → the skill.** Local files, video processing, chunked upload, local auth config, and the craft calls: brand voice, platform tone, when to thread.
- **No → the MCP server.** Every state read, every mutation, permissions, and platform capability truth.
- **Arguable → the MCP server**, because it is the one that can enforce permissions.

Nothing is negotiated at runtime, so your agent never has to work out which path to take. The full ownership table is in [`docs/skills-mcp-contract.md`](docs/skills-mcp-contract.md). The per-task routing the agent follows is in [`skills/postey/routing-guide.md`](skills/postey/routing-guide.md).

## What the skill adds

One install gives your agent the hub: routing, accounts, platform truth and the craft layer that decides how a post is written.

Content flows ship as optional packs you add only if you want them:

| Pack | What it does |
|---|---|
| **postey-voice** | Learns a brand's voice from existing writing |
| **postey-video** | Turns any video into a per-platform multi-draft |
| **postey-ideas** | Turns a trend or a single idea into drafts |
| **postey-engagement** | Comments, replies and inbox flows |
| **postey-analytics** | Performance reads across connected accounts |
| **postey-ops** | Bulk and maintenance work |
| **postey-teams** | Review, approval and team routing |

A solo creator can stop at the hub. No plugin system? Any connected agent can self-install with the one-paste prompt in [`skills/postey/bootstrap-prompt.md`](skills/postey/bootstrap-prompt.md), which fetches [`skills/postey/pack.json`](skills/postey/pack.json).

## Installation

**The one instruction that covers every agent** is [`setup.md`](setup.md). Paste this into any agent and it registers the server, authenticates, installs the skill and verifies the connection:

```
Set up Postey by following instructions: https://raw.githubusercontent.com/posteyai/skills/main/setup.md
```

That is the same prompt [the app](https://app.postey.ai?settings=agents&section=advanced) hands you under **AI & Agents**. The steps below are the pieces it runs, for anyone doing it by hand.

### Claude Code (recommended)

This path installs the skill and the MCP server together.

**1. Register the marketplace** (one time per user):

```bash
claude plugin marketplace add posteyai/skills
```

**2. Install the skill:**

```bash
claude plugin install postey@postey-skills
```

Use the shell commands above rather than the `/plugin` slash commands. The slash form opens an interactive panel, so an agent cannot run it unattended.

**For teams**, add this to your project's `.claude/settings.json`. Team members are prompted automatically when they trust the folder:

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
<summary><b>Other installation methods</b></summary>

**Cursor, Windsurf and generic agents (npx):**

```bash
npx -y skills add posteyai/skills -a <agent> -s postey -y
```

All three flags matter. `-a` and `-y` stop the CLI prompting for scope, agent and skill, which hangs an unattended run. `-s postey` stops it also installing this repo's skill template as a second skill called `skill-name`. Run `npx -y skills add posteyai/skills --list` to print the ids. Hermes Agent is `hermes-agent`, not `hermes`.

**Manual:**

Clone this repository and copy `skills/postey/` into the directory your agent reads. That is `.claude/skills/` for Claude Code and `.agents/skills/` for roughly eighteen others, including Cursor, Codex, Gemini CLI, Copilot and opencode. Claude Code does not read `.agents/skills/`.

</details>

### Connect the MCP server

Whichever install method you use, connect the Postey MCP server at [app.postey.ai](https://app.postey.ai?settings=agents&section=advanced). It is the layer underneath. Reads, writes and permissions all go through it, so the skill's flows are incomplete without it.

## Credentials

Most agents complete OAuth themselves, and then there is nothing to copy. Trigger your agent's MCP login for `postey`.

An agent that cannot open a browser, such as a CI job or a container, cannot finish OAuth at all, because there is no `client_credentials` grant. It needs an **MCP key**, created under **AI & Agents → Advanced** at [app.postey.ai](https://app.postey.ai?settings=agents&section=advanced). The key starts with `mk_`, never expires, and works on every plan including the free one. Set it as `POSTEY_API_KEY` and keep it in a secret manager. Creating one needs a signed-in browser, so a headless run has to stop and ask the user for it.

An older install may still hold an agent token starting with `pat_`, passed as `POSTEY_AUTH_TOKEN`. The app no longer creates these, and each one expires 90 days after it was minted with no way to mint a replacement. The server still accepts every token already issued, but use an MCP key for anything new.

Then run setup:

```bash
./skills/postey/scripts/postey.js setup
```

Or set the environment variable directly:

```bash
export POSTEY_API_KEY=your_key_here
```

## Supported platforms

Platform capability truth, meaning which platforms exist, their character limits and their rules, belongs to the MCP server. This repository reads it rather than restating it. A hand-kept copy here would go stale the day the server adds a platform, which is exactly what happened before.

- Current platform set, tools and resources: [`skills/postey/capability-snapshot.json`](skills/postey/capability-snapshot.json), generated from the server's `postey://skill-manifest` and checked against a live server in CI
- Per-platform limits at runtime: the `postey://platform-limits` and `postey://platforms/{platform}/rules` resources

## Troubleshooting

<details>
<summary><b>"POSTEY_API_KEY environment variable is not set"</b></summary>

Run the setup command:

```bash
./skills/postey/scripts/postey.js setup
```

Or set the variable and add it to your shell profile (`~/.bashrc`, `~/.zshrc`):

```bash
export POSTEY_API_KEY=your_key_here
```

</details>

<details>
<summary><b>"Node.js is required"</b></summary>

The CLI needs Node.js 18 or newer, for the built-in `fetch`. Install a recent Node.js version, then retry.

</details>

<details>
<summary><b>API errors (401, 403)</b></summary>

- Check that the API key is correct.
- Check that the key has the required permissions at [app.postey.ai](https://app.postey.ai?settings=agents&section=advanced).

</details>

<details>
<summary><b>Drafts not appearing</b></summary>

- Verify the account: read the `postey://accounts` MCP resource, or call the `get_accounts` tool, and confirm you targeted the right `account_id`.
- List drafts with the `get_posts` MCP tool (`status=DRAFT`), or read one directly from the `postey://posts/{id}/content/{platform}` resource.

</details>

## Links

- **[postey.ai](https://postey.ai)** — the product
- **[postey.ai/mcp](https://postey.ai/mcp)** — MCP server setup, full tool list and per-client guides
- **[postey.ai/docs](https://postey.ai/docs)** — documentation
- **[postey.ai/docs/claude](https://postey.ai/docs/claude)** — connect Postey to Claude and Claude Code
- **[app.postey.ai](https://app.postey.ai)** — sign in
- [Skills ↔ MCP responsibility contract](docs/skills-mcp-contract.md) — what this skill owns, and what belongs to the MCP server
- [Skills Leaderboard](https://skills.sh)

## License

MIT — see [LICENSE](LICENSE).

---

<div align="center">
Built by <a href="https://postey.ai"><b>Postey</b></a> — social media publishing for AI agents.
</div>
