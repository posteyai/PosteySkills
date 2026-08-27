# Registration runbook

Execution order for getting Postey listed where agents look. Work top to bottom — step 0
gates everything else, and step 1 does more work than steps 2–7 combined.

Each step has a **verify** command. Don't mark a row done in `DISTRIBUTION.md` until its
verify passes.

Time: about 90 minutes total, most of it waiting on DNS propagation and review queues.

---

## Step 0 — publish the assets (gates everything)

Every submission below cites a public commit. Until this merges, they'd reference code that
doesn't exist publicly.

```bash
cd ~/code/postey/skills
git push -u origin agent-visibility-mcp-wiring
gh pr create --title "Wire MCP server into plugin; add registry manifests" --body "Adds .mcp.json so installing the plugin also connects the MCP server, server.json for the official MCP registry, and DISTRIBUTION.md/RUNBOOK.md for external listings."
```

> Confirm the account you are pushing from has write access to `posteyai/skills`. A machine
> signed in as a different org's account will fail here, or push under the wrong identity.

**Verify:** `curl -s -o /dev/null -w "%{http_code}\n" https://raw.githubusercontent.com/posteyai/skills/main/server.json` → `200`

---

## Step 1 — Official MCP Registry

Do this one first. Downstream directories sync from it, so this single submission propagates
further than anything else on the list.

As of 2026-08-27 the live registry returns **0 results for `postey` and 0 for `postiz`**.
Uncontested — and namespaces are first-come.

```bash
# 1. install
go install github.com/modelcontextprotocol/registry/cmd/mcp-publisher@latest
# or: brew install mcp-publisher

# 2. start DNS auth — this PRINTS a TXT record, it does not create one
mcp-publisher login dns --domain postey.ai
```

Take the TXT value it prints, add it at your DNS provider for `postey.ai`, wait for
propagation, then re-run the login command until it succeeds.

```bash
# 3. confirm the record is visible before retrying
dig +short TXT postey.ai

# 4. publish (run from repo root — reads ./server.json)
cd ~/code/postey/skills
mcp-publisher publish
```

`server.json` is already written and validates against the published `2025-12-11` schema.
Namespace: `ai.postey/postey` — reverse DNS of `postey.ai`, which is why this needs the DNS
challenge rather than GitHub auth.

**Verify:** `curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=postey" | grep -c ai.postey` → `1` or more

---

## Step 2 — ClawHub

```bash
npm i -g clawhub
clawhub login          # opens a browser for GitHub OAuth
clawhub skill publish ./skills/postey --slug postey --name "Postey" --version 1.3.0
```

**Publish from an org account, not personal** — a personal-account listing reads as a
third-party clone rather than the official Postey skill.

Publishes are held behind a prepublication worker (VirusTotal + code-pattern scanning)
before going live, so expect a delay. Search is embedding-based, so the `description` and
`when_to_use` fields in `SKILL.md` are what get you found — not tags.

`clawhub.ai` also advertises "import from your GitHub" and has `/skills/publish` and
`/plugins/publish` pages. If the browser path works, it skips the CLI entirely — check once
you're signed in.

**Verify:** `clawhub search postey` returns the listing, and `clawhub.ai/skills/postey` loads.

---

## Step 3 — Claude Code community marketplace

Submit at **`platform.claude.com/plugins/submit`** (individual authors) or
**`claude.ai/admin-settings/directory/submissions/plugins/new`** (Team/Enterprise orgs, needs
directory-management access).

Field values:

| Field | Value |
|---|---|
| Repository | `https://github.com/posteyai/skills` |
| Plugin name | `postey` |
| Marketplace manifest | `.claude-plugin/marketplace.json` (repo root) |

Pre-flight — already passing, re-run after any edit:

```bash
claude plugin validate ./skills/postey
```

Approved plugins are pinned to a commit SHA and CI bumps the pin as you push, so this is
submit-once. The public catalog syncs nightly, so there's a lag between approval and
installability.

**Verify:** `claude plugin marketplace add anthropics/claude-plugins-community` then search for `postey`.

---

## Step 4 — Context7

Go to **`context7.com/add-library`**, GitHub tab, paste `https://github.com/posteyai/skills`.

No approval, no star minimum, no ownership check. It indexes the markdown — `SKILL.md`,
`command-reference.md`, `routing-guide.md`, `video-workflow.md`, `prompts.md` — so agents
retrieve real Postey usage mid-task instead of guessing at an API.

Add their GitHub Action afterwards so it re-indexes on every push to `main`.

**Verify:** the library resolves at `context7.com/posteyai/skills`.

---

## Step 5 — awesome-mcp-servers (backs mcpservers.org)

Postiz is listed here. Postey is not.

```bash
gh repo fork punkpeye/awesome-mcp-servers --clone
```

Add one row under the social-media section:

```markdown
- [Postey](https://github.com/posteyai/skills) 🏠 ☁️ - Draft, schedule and publish social posts to 9 networks; manage team drafts and comments.
```

Match the surrounding rows' emoji legend exactly — mismatched legends are the usual reason
these PRs sit unmerged. Then open the PR.

**Verify:** PR merged, and the entry appears on `mcpservers.org`.

---

## Step 6 — Glama (passive)

Nothing to submit. Glama auto-indexes public GitHub; `posteyai/skills` being public after
step 0 is the whole requirement.

**Verify:** search `glama.ai/mcp` for Postey after ~a week.

---

## Step 7 — Tier 2, batch in one sitting

Only after steps 0–5 land. Each is a form; none is load-bearing individually, but together
they're most of the long-tail directory traffic.

`mcp.so` · `smithery.ai` · `LobeHub` · `MCPMarket` · `PulseMCP` · `Composio` · `Protodex`

Reuse the same copy everywhere:

- **Name:** Postey
- **Description:** Draft, schedule and publish social posts to 9 networks; manage team drafts and comments.
- **MCP URL:** `https://srvr.postey.ai/mcp` (streamable-http)
- **Auth:** OAuth (dynamic client registration); `X-API-Key: mk_...` for headless
- **Homepage:** `https://postey.ai` · **Repo:** `https://github.com/posteyai/skills`

Postiz is on `mcpservers.org` and Composio. Those two close the visible gap.

---

## After each step

Update the status column in [`DISTRIBUTION.md`](DISTRIBUTION.md) with the date it landed.
A tracker that claims coverage it doesn't have is worse than no tracker.

## Not on this list

**Vercel** hosts `postey.ai` — it's a deployment platform, not a discovery surface. The
hosting-side work that does affect agent visibility (`llms.txt`, `llms-full.txt`, AI-crawler
rules in `robots.txt`, sitemap) is already live and needs nothing.
