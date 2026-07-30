# Set up Postey

You are an AI coding agent. Follow these steps in order. After each step, run its
verification before you continue. If a verification fails, read that step's error
table and stop. Do not guess.

Re-running this document is safe. If a step reports that something already exists,
that is success. Read on and continue.

This document connects you. Once Step 4 passes, hand off to
[`skills/postey/bootstrap-prompt.md`](skills/postey/bootstrap-prompt.md), where the
content workflows start.

---

## Step 0 — Identify the environment

Determine the operating system from your session context. If it is unavailable, run
`uname -s` on macOS or Linux. Run `$env:OS` in Windows PowerShell.

Determine which agent you are. This document names Claude Code, Claude Desktop,
Cursor, Codex CLI, Windsurf, Gemini CLI, VS Code, Hermes Agent, Cline, Roo Code,
Amp, opencode, Zed, Goose and Kiro. If you are none of these, use the generic path
in Step 2.

Now determine your class. The class decides which steps apply.

| Class | You are this if | Track |
|---|---|---|
| Local | You can run a shell command and write a file | A |
| Web | You run in a browser and reach tools through a connector | B |
| Headless | You can run a shell command and cannot open a browser | C |

A continuous-integration job, a container, a cron task and an SDK caller are all
headless. An agent that runs unattended is headless even when a browser exists,
because nobody is there to click.

**Verify:** state the operating system, the agent and the track in one line.

---

## Tracks

Run only the steps your track lists. Skipping a step that does not apply is correct.
Reporting success without the steps that do apply is not.

| Track | Steps | Credential | Skill |
|---|---|---|---|
| A, local | 1 to 7 | OAuth | Yes |
| B, web | 1, 2B, 3, 4, 6, 7 | OAuth through the connector | No. See Step 5 |
| C, headless | 1 to 7 | Agent token | Yes, with `-y` |

Four rules bind every track.

1. Never block. If a command waits for a keystroke, you passed the wrong flags. Fix
   the flags. Do not wait.
2. Never assume. Every step ends in a verification. Run it.
3. Never proxy. Register the address `https://srvr.postey.ai/mcp` in your own client's
   remote-server configuration. Never wrap it in a local process, and never route it
   through another agent. Step 2 says what that rules out.
4. Never fake. If the Postey tools are absent from this session, stop and say so. A local file,
   another agent and the REST API are all evidence about something else.

Track C has one rule of its own. Stop once, at Step 3, to ask the user for an agent
token. No other step may pause. A headless run cannot complete OAuth, and no flag
works around that.

---

## Step 1 — Check prerequisites

Confirm that `https://srvr.postey.ai` is reachable.

A healthy server answers in ways that look like errors. Read them as success.

| Request | Healthy response |
|---|---|
| `POST /mcp` with no credential | `401` with a `WWW-Authenticate` header |
| `GET /mcp` | `405` with `text/plain` |
| `GET /.well-known/oauth-protected-resource/mcp` | `200` with JSON |

The `405` is correct. The MCP revision of 2026-07-28 removed the GET stream endpoint.
Do not treat it as a fault.

**Verify:** report anything missing. Ask the user whether to continue or to stop.

| Symptom | Cause | Fix |
|---|---|---|
| Network timeout to `srvr.postey.ai` | Offline, or egress blocked | Restore connectivity. A corporate proxy must allow `srvr.postey.ai` |
| TLS error | The proxy intercepts TLS | Add the proxy certificate authority to your trust store |

---

## Step 2 — Register the Postey MCP server

### Step 2B — Track B, web clients

A web client has no shell and no config file. Add Postey as a connector instead. You
cannot do this yourself. Give the user the steps and wait.

| Client | Steps |
|---|---|
| Claude on the web | Open <https://claude.ai/settings/connectors>, choose **Add custom connector**, paste `https://srvr.postey.ai/mcp`, then authorize |
| Claude Desktop | Open Settings, then **Connectors**, then **Add custom connector**, and use the same address. This needs a paid plan |
| ChatGPT | Open Settings, then **Apps**, then **Advanced**, and turn on **Developer Mode**. Choose **Create app**, paste the address, then authorize |

A connector authorizes through OAuth in the browser. Track B therefore needs no
credential from Step 3. Go to Step 4 once the user reports that the connector is
connected.

Track B cannot install the skill. Step 5 says what to do instead.

The rest of Step 2 covers tracks A and C.

### Native registration only

Register the address. Never wrap it in a local process.

Postey is a remote server. It speaks streamable HTTP and it authorizes with OAuth.
Every client named in this document can reach it directly, so a bridge is never the
answer here, whatever your own help text offers.

These are all wrong:

- `mcp-remote`, `mcp-proxy`, `supergateway`, `mcpo`, `mcp-hub`, or any other local
  wrapper around the address
- an entry that carries a command and arguments instead of a URL, which is what
  `hermes mcp add postey --command ...` writes. That form exists for a server that
  runs on the machine. Postey does not
- a third-party hosted gateway that re-exposes Postey under an address of its own

A bridge costs four things:

1. OAuth. The browser flow belongs to the client. A bridge that holds the session
   instead re-prompts every session, or fails outright.
2. The credential. It lands in the bridge's own store rather than the client
   keychain, so the user cannot revoke what the user cannot see.
3. Diagnosis. Every failure in Steps 3, 4 and 7 arrives one layer removed, and the
   tables in this document then name the wrong cause.
4. The protocol revision. A bridge pins the revision it shipped with. Postey follows
   the current one. The `405` in Step 1 is the first thing this breaks.

If a client truly cannot register a remote server, stop and tell the user. Do not
bridge it, and do not report success.

### Your own client, and no other

You are connecting yourself. Another agent is not a route to Postey.

The table below lists one command per agent. Run the row for the agent you are, and
only that row. Running another agent's command writes to another agent's file:
`claude mcp add` writes `~/.claude.json`, which Hermes never reads. The command
succeeds, `claude mcp list` shows `postey`, and your own session still has no tools.
That is a false pass, and Step 4 exists to catch it.

The same holds for calls. Never reach Postey by driving another agent — not
`claude -p`, not `codex exec`, not any headless invocation of a second client, and
not by asking the user to run it there. The tools must resolve in your own session,
under your own credential.

One case is not this. When the user asks you to set up a *different* agent, you are
editing that agent's config on purpose. Say which agent you configured, and say that
your own session is unconnected if it is.

### The one-line path

This command writes native configuration for 16 clients. Try it first.

```
npx -y add-mcp https://srvr.postey.ai/mcp -n postey -a <agent> -g -y
```

Replace `<agent>` with your identifier: `claude-code`, `claude-desktop`, `cursor`,
`codex`, `gemini-cli`, `vscode`, `windsurf`, `zed`, `cline`, `goose`, `opencode`,
`antigravity`, `grok-build`, `github-copilot-cli` or `mcporter`. Run
`npx -y add-mcp list-agents` to see the current list.

`add-mcp` writes a native entry. Open the file it wrote and confirm that. If the
entry names a command rather than a URL, delete it and write the row from the table
below by hand.

`add-mcp` does not support Hermes Agent. Use the native command below.

### Native commands

| Agent | Command |
|---|---|
| Claude Code | `claude mcp add --transport http postey https://srvr.postey.ai/mcp --scope user` |
| Codex CLI | `codex mcp add postey --url https://srvr.postey.ai/mcp` |
| Gemini CLI | `gemini mcp add --transport http postey https://srvr.postey.ai/mcp` |
| Hermes Agent | See the three `hermes config set` calls below. No `mcp add` option writes `skip_preflight` |
| VS Code | `code --add-mcp '{"name":"postey","type":"http","url":"https://srvr.postey.ai/mcp"}'` |
| Amp | `amp mcp add postey https://srvr.postey.ai/mcp` |

`claude mcp add` is not idempotent. A second run fails with `already exists`. Treat
that message as success. `codex mcp add` updates in place and is safe to repeat.

Every command above passes the address. Each of these agents also offers a form that
takes a command to execute, and Hermes offers it first when it finds no server
registered. Ignore it. Pass the address.

### Editing a config file

Merge into the file. Never overwrite it. Preserve every existing entry.

The key names differ by client. Using the wrong name fails, and two of these fail
silently. Use the row for your client.

| Agent | File | Top-level key | Entry |
|---|---|---|---|
| Claude Code | `~/.claude.json` or `.mcp.json` | `mcpServers` | `{"type": "http", "url": "https://srvr.postey.ai/mcp"}` |
| Cursor | `~/.cursor/mcp.json` | `mcpServers` | `{"url": "https://srvr.postey.ai/mcp"}` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | `mcpServers` | `{"serverUrl": "https://srvr.postey.ai/mcp"}` |
| VS Code | `.vscode/mcp.json` | `servers` | `{"type": "http", "url": "https://srvr.postey.ai/mcp"}` |
| Gemini CLI | `~/.gemini/settings.json` | `mcpServers` | `{"httpUrl": "https://srvr.postey.ai/mcp"}` |
| Cline, Roo Code | the client MCP settings file | `mcpServers` | `{"type": "streamableHttp", "url": "https://srvr.postey.ai/mcp"}` |
| Amp | `settings.json` | `amp.mcpServers` | `{"type": "streamableHttp", "url": "https://srvr.postey.ai/mcp"}` |
| opencode | `opencode.json` | `mcp` | `{"type": "remote", "url": "https://srvr.postey.ai/mcp", "enabled": true}` |
| Kiro, Junie, LM Studio | the client MCP settings file | `mcpServers` | `{"url": "https://srvr.postey.ai/mcp"}` |
| Goose | `~/.config/goose/config.yaml` | `extensions` | `type: streamable_http` with `uri`, in YAML |
| Zed | `settings.json` | `context_servers` | `{"url": "https://srvr.postey.ai/mcp"}` |

Zed takes a remote entry under `context_servers`: a `url`, and no command. With no
`Authorization` header set, it runs the standard MCP OAuth flow and asks the user to
sign in, which is what track A wants. Track C has no browser, so it sets the header:

```json
"context_servers": {
  "postey": {
    "url": "https://srvr.postey.ai/mcp",
    "headers": { "Authorization": "Bearer <the token>" }
  }
}
```

Four names carry a trap.

1. Claude Code reads an entry with a `url` and no `type` as a stdio server. It errors.
2. Windsurf reads `serverUrl`. An entry with `url` is ignored.
3. Gemini CLI reads `httpUrl`. An entry with `url` selects the SSE transport.
4. Cline, Roo Code and Amp fall back to SSE without `streamableHttp`. SSE calls
   `GET /mcp`, which answers `405`. The server is healthy. The transport is wrong.

Codex CLI uses TOML, not JSON. Write this into `~/.codex/config.toml`:

```toml
[mcp_servers.postey]
url = "https://srvr.postey.ai/mcp"
```

Hermes Agent keeps its servers in `~/.hermes/config.yaml` and refuses a direct write to that
file. A patch returns `Refusing to write to Hermes config file`. Set the three keys instead:

```
hermes config set mcp_servers.postey.url https://srvr.postey.ai/mcp
hermes config set mcp_servers.postey.auth oauth
hermes config set mcp_servers.postey.skip_preflight true
```

`skip_preflight` is required. Hermes probes the endpoint and expects
`application/json` or `text/event-stream`. Postey answers `text/plain` on that probe,
so Hermes rejects the server without this key. No `hermes mcp add` option writes it, which is
why these three calls are the only path. To undo one, use `hermes config unset`.
`hermes config delete` exits 2.

Confirm the result with `hermes config get mcp_servers.postey`. It prints `url`, `auth` and
`skip_preflight`.

### Load the server

Registering a server does not load it into a running session. Reload before Step 4.

| Agent | Action |
|---|---|
| Hermes Agent | None. It reloads when the config changes. The tools arrive in your next turn |
| Claude Code | Restart the session |
| Everything else | Restart the agent |

If your client loads MCP at a turn boundary, Step 2 ends your turn. Tell the user that
registration is done, and that you continue at Step 4 when they reply. Do not run Step 4 in the
same turn. The tools are not there yet, and no command brings them forward.

This is measured, not assumed. On Hermes, `hermes config set` returns success, and a tool search
in that same turn still finds nothing. The server appears in the next turn.

**Verify:** run your agent's MCP list command. In Claude Code that is
`claude mcp list`. Confirm that `postey` appears. A new server that reports
`Needs authentication` is the expected state. Step 3 resolves it.

Run your own agent's list command, not another agent's. Then read the entry back out
of the config file your agent reads, and confirm that it carries the address. An entry
that names a local command is wrong even when the server lists correctly.

| Symptom | Cause | Fix |
|---|---|---|
| `already exists`, non-zero exit | An earlier run registered the server | Not an error. Continue to Step 3 |
| Command not recognized | The agent is out of date | Update the agent, or edit the config file |
| `postey` is absent after adding | It went to a different scope or file | Re-run with the scope flag above |
| Other servers disappeared | The config was overwritten, not merged | Restore from backup, then merge |
| `"url" but no "type"` error | `type` is missing | Add `"type": "http"` |
| Hermes reports an invalid endpoint | The preflight probe failed | Set `mcp_servers.postey.skip_preflight` to `true` |
| The registered entry runs a command | A local wrapper was registered, not the server | Delete the entry. Write the row above, which carries the address |
| The OAuth prompt returns every session | A wrapper holds the session, not the client | Register the address natively, then redo Step 3 |
| Another agent lists `postey` and you still have no tools | You ran another agent's command and wrote to its config | Run the row for the agent you are |

---

## Step 3 — Authenticate

Postey accepts three credentials. Pick by track.

| Track | Credential |
|---|---|
| A, local | OAuth |
| B, web | None. The connector already authorized in Step 2B |
| C, headless | Agent token |

### OAuth, preferred, track A

Trigger your agent's MCP login for `postey` and complete the browser prompt.

| Agent | Command |
|---|---|
| Claude Code | `claude mcp login postey`, or the `/mcp` command, then **Authenticate** |
| Codex CLI | `codex mcp login postey` |
| Hermes Agent | `hermes mcp login postey` |

On Hermes, run the login in a new terminal. The automatic config reload times out
after 30 seconds and can interrupt the flow.

### Agent token, track C

An agent token is the credential for a client that cannot open a browser. The token
starts with `pat_`. The store holds only a digest of it. It expires after 90 days.
Revoking the connected app also kills the token.

A token is minted against a connected app, so the user must authorize once through a
browser before any token exists. Check <https://app.postey.ai?settings=api> for a
connected app first. Newer builds show this area as **AI & Agents**.

Stop here and ask the user to create the token. This is the one pause a headless run
is allowed. Minting needs a signed-in browser session, so you cannot do it yourself.

Send it as a bearer token:

```json
{ "headers": { "Authorization": "Bearer <the token>" } }
```

Read the token from the environment. Never write it into a file that a repository
tracks.

```
export POSTEY_AUTH_TOKEN=<the token>
```

A container or a continuous-integration job should inject the token as a secret. Pass
it to the agent the same way you pass any other secret. Rotate it before the 90 days
expire, because an expired token fails as `401` and looks like a broken setup.

### API key, legacy

An API key starts with `mk_`. Prefer an agent token. A key never expires, and the
database holds it in plain text.

Create one at <https://app.postey.ai?settings=api>. Newer builds show this area as
**AI & Agents**, under **Direct connection**. Send the key as a header:

```json
{ "headers": { "X-API-Key": "<the key>" } }
```

An API key on the free plan fails on every MCP call, including the handshake. The
server answers `402`. OAuth and agent tokens do not carry that limit.

Never print a credential back to the user. Never write it anywhere except the config
file.

**Verify:** continue to Step 4. That is the real check.

---

## Step 4 — Verify the connection

Read your own tool list first. It separates two failures that look the same.

| Your tool list | Meaning | Action |
|---|---|---|
| Postey tools are listed and callable | The transport works. Your call was wrong | Fix the call. Read the tool schema again |
| Listed by a search, and a direct call says the tool does not exist | Your client dispatches MCP through a meta-tool | Call it the way your client requires. On Hermes that is `tool_call` |
| Postey tools are absent | The server is registered and not yet loaded | Stop. Say so. Continue here next turn |

Never infer either state from a failed call. A rejected call is not proof that the server is
absent, and a reachable server is not proof that your call is right.

When the tools are absent, these are all wrong, and a real run tried every one:

- a nested session of your own agent, headless, such as `hermes chat` piped from `echo`
- another agent driven headlessly, such as `claude -p` or `codex exec`
- opening a new interactive session. If you are already interactive, you gain nothing
- reading a local file, such as the skill capability snapshot, and calling it proof
- the REST API. See Step 3

Stopping is the only correct action. A false `complete` costs the user more than a stop does.

Now read the MCP resource `postey://setup`. It answers the readiness question directly.
It returns `ready`, an account count, and a `blockers` array. Each blocker carries a
code, the account and platform it concerns, and the call that fixes it.

Then read `postey://accounts` for the account name and its platforms.

If your client cannot read MCP resources, call the `get_accounts` tool. Prefer the
resource wherever both work.

Hermes Agent renames every tool. Call `mcp_postey_get_accounts` there.

**Verify:** print `ready`, the account name, and the connected platforms. Print any
blocker. If this returns nothing or errors, setup is not complete. Do not report
success.

Read it in your own session. A result you obtained by driving another agent proves
that agent is connected, and says nothing about you.

| Symptom | Cause | Fix |
|---|---|---|
| `401` or `unauthorized` | Step 3 is incomplete, or the credential is wrong | Redo Step 3 |
| `402` | A free-plan API key | Use OAuth or an agent token. See Step 3 |
| `405` | The client fell back to SSE | Set the streamable HTTP transport. See Step 2 |
| `ready` is `false` | The account can publish nowhere | Read `blockers` and run the call each one names |
| Empty account list | The account has no connected platform | Not an error. Tell the user to connect one at `app.postey.ai` |
| Resource not found | The server registered but never loaded | Reload the agent, then redo Step 4 |
| Tool and resource are both missing | Step 2 did not take effect | Redo Step 2 |

---

## Step 5 — Install the Postey skill

Steps 0 to 4 gave you everything the server does: reading accounts, posts and
schedules, and creating, updating, publishing and scheduling them.

The skill adds only what a server cannot reach, which is your machine:

- uploading a video or an image from local disk
- video trimming, inspection and transcription, through local ffmpeg
- the guided content playbooks, which cover brand voice, video, trends and ideas

Skip this step if you only work with media that already sits on the web.

### Track B — web clients

A web client cannot install the skill, because the skill exists to reach a local disk
and a web client has none. Nothing here applies. Go to Step 6.

The server already carries the craft guidance a connector needs. For the guided
playbooks, paste the block in
[`skills/postey/bootstrap-prompt.md`](skills/postey/bootstrap-prompt.md) into the
conversation once.

Claude on the web also accepts a skill as an uploaded archive under Settings, then
**Customize**, then **Skills**. That is a manual upload by the user. You cannot do it.

### Choose one path

**Claude Code.** This path installs the skill and the server together. Use the shell
form. The slash command opens a panel and cannot run unattended.

```
claude plugin marketplace add posteyai/skills
claude plugin install postey@postey-skills
```

**Hermes Agent.**

```
hermes skills install https://raw.githubusercontent.com/posteyai/skills/main/skills/postey/SKILL.md
```

**Every other agent.** All three flags matter. `-a` and `-y` stop the command waiting
for a keystroke that an autonomous agent cannot send. `-s postey` stops it also
installing this repository's skill template as a second skill called `skill-name`.

```
npx -y skills add posteyai/skills -a <agent> -s postey -y
```

Run `npx -y skills add posteyai/skills --list` to see the identifiers. The Hermes
identifier is `hermes-agent`, not `hermes`.

**No installer.** Copy `skills/postey/` into `.agents/skills/`, which about 18 agents
read. Claude Code does not. Use `~/.claude/skills/` there.

### Give the skill its credential

The skill runs its own command-line tool, and Step 3 did not authenticate it. Set the
credential now, or every local-file command fails.

The tool reads credentials in this order: `POSTEY_API_KEY`, then `POSTEY_AUTH_TOKEN`,
then a stored OAuth session, then a config file.

Track C already exported `POSTEY_AUTH_TOKEN` in Step 3. The tool picks it up. Nothing
more is needed.

Track A can export a key:

```
export POSTEY_API_KEY=<the key>
```

To store it instead, run the setup command. Pass `--key` so it does not prompt.

```
node skills/postey/scripts/postey.js setup --key <the key> --location global
```

Do not run the setup command without `--key` on track C. It prompts on standard
input, and a headless run has nobody to answer.

**Verify:** run your agent's skill-list command. Confirm that `postey` appears.

The division is fixed. It is not negotiated per task. The server owns all state and
every change to it. The skill owns local files, video processing and craft. Never use
a skill command to reach an effect the server already provides. See
[`docs/skills-mcp-contract.md`](docs/skills-mcp-contract.md).

| Symptom | Cause | Fix |
|---|---|---|
| The command waits and never returns | The agent name or `-y` is missing | Re-run with `-a <agent> -y` |
| `npx: command not found` | Node is missing | Install Node 20 or later, then retry |
| `Invalid agents: hermes` | The identifier is wrong | Use `hermes-agent` |
| The skill installs but the tools are missing | Step 2 is incomplete | Redo Step 2, then Step 4 |
| `API key not found` | The skill has no credential | Set `POSTEY_API_KEY`. See above |
| A skill command reports `Unknown command` | The server owns that effect | Use the server tool the error names, or read `CHANGELOG.md` |

---

## Step 6 — Record usage rules

Write a short Postey section into your agent's instructions file.

Prefer `AGENTS.md`. About 25 tools read it, including Codex, Cursor, Copilot, Gemini
CLI, Windsurf, Zed, Amp and Claude Code.

| Agent | File |
|---|---|
| Most agents | `AGENTS.md` |
| Claude Code | `CLAUDE.md`, or a pointer to `AGENTS.md` |
| Cursor | `.cursor/rules/postey.mdc`, or `AGENTS.md` |
| VS Code | `.github/copilot-instructions.md`, or `AGENTS.md` |
| Gemini CLI | `GEMINI.md` |
| Windsurf | `.windsurf/rules/postey.md` |
| Hermes Agent | `HERMES.md`. Hermes reads the first match of `HERMES.md`, `AGENTS.md`, then `CLAUDE.md` |
| Codex CLI | `AGENTS.md` |
| opencode | `AGENTS.md` |
| Kiro | `.kiro/steering/postey.md` |
| Cline | `.clinerules`. Cline does not read `AGENTS.md` |
| Roo Code | `.roorules` |
| Goose | `.goosehints` |
| Claude Desktop | None. A hosted client reads no file from your disk. Skip this step |

Keep it to the rules that the tool schemas do not already show:

- Platforms come from the account list. Never assume them.
- Everything stays a draft until the user says publish.
- Scheduling counts as publishing, so it also waits for approval.
- Every platform gets its own caption.
- Postey is a remote MCP server. Register it by address, in this agent's own config.
  Never through a local wrapper, and never through another agent.

**Verify:** confirm that the file exists and holds the section.

---

## Step 7 — Prove the write path

Step 4 proved that you can read. Prove that you can write.

1. Create a draft post for one connected platform.
2. Read it back and confirm the text matches.
3. Delete the draft.

Publish nothing. Schedule nothing. This check must leave no trace.

**Verify:** report that all three actions succeeded. If the create call fails while
Step 4 passed, your credential can read and cannot write. Read the error table in
Step 3.

| Symptom | Cause | Fix |
|---|---|---|
| `402` on create, `200` on read | A free-plan API key | Use OAuth or an agent token |
| `403` or `insufficient_scope` | The grant lacks the permission | Re-authorize and approve the write permission |

Setup is complete. For content workflows, continue with
[`skills/postey/bootstrap-prompt.md`](skills/postey/bootstrap-prompt.md).
