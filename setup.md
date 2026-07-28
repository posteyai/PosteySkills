# Set up Postey

You are an AI coding agent. Follow these steps in order. After each step, run its
verification before continuing. If a verification fails, consult that step's error
table and stop rather than guessing.

Re-running this document is safe. Every step is idempotent.

This document gets you **connected**. Once Step 4 passes, hand off to
[`skills/postey/bootstrap-prompt.md`](skills/postey/bootstrap-prompt.md), which is
where content workflows begin.

---

## Step 0 — Identify the environment

Determine the operating system from your session context. If it is unavailable, run
`uname -s` (macOS/Linux) or `$env:OS` (Windows PowerShell).

Determine which agent you are: Claude Code, Cursor, Codex CLI, Windsurf, Gemini CLI,
VS Code, or something else.

**Verify:** state both back to the user in one line before continuing.

---

## Step 1 — Check prerequisites

Confirm `https://srvr.postey.ai` is reachable.

**Verify:** report anything missing, then ask the user whether to continue or abort.

| Symptom | Cause | Fix |
|---|---|---|
| Network timeout to `srvr.postey.ai` | Offline, or egress blocked | Restore connectivity. Corporate proxies must allow `srvr.postey.ai` |
| TLS error | Proxy performing interception | Add the proxy's CA to your trust store |

---

## Step 2 — Register the Postey MCP server

Use your agent's **native registration command**. Only hand-edit a JSON config file
if your agent has no such command.

| Agent | Command |
|---|---|
| Claude Code | `claude mcp add --transport http postey https://srvr.postey.ai/mcp --scope user` |
| Codex CLI | `codex mcp add postey --url https://srvr.postey.ai/mcp` |
| Gemini CLI | `gemini mcp add --transport http postey https://srvr.postey.ai/mcp` |
| VS Code | Command Palette → **MCP: Add Server** → HTTP → `https://srvr.postey.ai/mcp` |
| Cursor | Merge into `~/.cursor/mcp.json` (below) |
| Windsurf | Merge into `~/.codeium/windsurf/mcp_config.json` (below) |

When merging JSON, **merge — never overwrite**. Preserve every existing entry:

```json
{
  "mcpServers": {
    "postey": {
      "type": "http",
      "url": "https://srvr.postey.ai/mcp"
    }
  }
}
```

`type` is required. An entry with a `url` but no `type` is read as a stdio server and
skipped.

**Verify:** re-run your agent's MCP list command and confirm `postey` appears.

| Symptom | Cause | Fix |
|---|---|---|
| Command not recognised | Older agent version | Update the agent, or merge the JSON instead |
| `postey` absent after adding | Written to a different scope or file | Re-run with the scope flag shown above |
| Other servers disappeared | Config overwritten rather than merged | Restore from your agent's backup, then merge |
| `"url" but no "type"` error | `type` omitted from the JSON | Add `"type": "http"` |

---

## Step 3 — Authenticate

If your agent supports MCP OAuth, trigger its MCP login for `postey` and complete the
browser prompt.

Otherwise, ask the user to create an API key at
<https://app.postey.ai/settings> → **AI & Agents** → **Direct connection**, then add it
as a header on the entry from Step 2:

```json
{ "headers": { "X-API-Key": "<the key>" } }
```

Never print the key back to the user, and never write it anywhere except the config file.

**Verify:** continue to Step 4 — that is the real check.

---

## Step 4 — Verify the connection

Read the MCP resource `postey://accounts`.

If your client cannot read MCP resources, call the `get_accounts` tool instead. Prefer
the resource where both are available.

**Verify:** print the account name and its connected platforms. If this returns nothing
or errors, setup is **not** complete — do not report success.

| Symptom | Cause | Fix |
|---|---|---|
| `401` / `unauthorized` | Step 3 incomplete, or the key is wrong | Redo Step 3 |
| Empty account list | The account has no connected platforms | Not an error — tell the user to connect one at `app.postey.ai` |
| Resource not found | Server registered but not loaded | Restart the agent, then redo Step 4 |
| Tool and resource both missing | Step 2 did not take effect | Redo Step 2 |

---

## Step 5 — Install the Postey skill (optional)

Steps 0–4 already gave you everything the Postey server can do: reading accounts,
posts and schedules, and creating, updating, publishing and scheduling them.

The skill adds only what a server cannot reach — your machine:

- uploading a video or image **from local disk**
- video trimming, inspection and transcription, using local ffmpeg
- the guided content playbooks (brand voice, video, trends, idea-to-posts)

If you only work with media already on the web, skip this step.

```
npx skills add posteyai/skills
```

If `npx` is unavailable: `npm exec skills add posteyai/skills`.

**Verify:** run your agent's skill-list command and confirm `postey` appears.

The division is fixed, not negotiated per task: the server owns all state and every
change to it; the skill owns local files, video processing, and craft. Never use a
skill command to reach an effect the server already provides — see
[`docs/skills-mcp-contract.md`](docs/skills-mcp-contract.md).

| Symptom | Cause | Fix |
|---|---|---|
| `npx: command not found` | Node not installed | Install Node 20+, then retry |
| Skill installs but tools are missing | Step 2 incomplete | Redo Step 2, then Step 4 |
| A skill command reports "Unknown command" | It was removed because the server owns that effect | Use the server tool named in the error, or `CHANGELOG.md` |

---

## Step 6 — Record usage rules

Write a short Postey section into your agent's instructions file:

| Agent | File |
|---|---|
| Claude Code | `CLAUDE.md` |
| Codex CLI | `AGENTS.md` |
| Cursor | `.cursor/rules/postey.mdc` |
| VS Code | `.github/copilot-instructions.md` |

Keep it to the rules that are not already visible in the tool schemas:

- Platforms come from the account list. Never assume them.
- Everything stays a draft until the user says publish.
- Scheduling counts as publishing, so it also waits for approval.
- Every platform gets its own caption.

**Verify:** confirm the file exists and contains the section.

Setup is complete. For content workflows, continue with
[`skills/postey/bootstrap-prompt.md`](skills/postey/bootstrap-prompt.md).
