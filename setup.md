# Set up Postey

You are an AI coding agent. Follow these steps in order. After each step, run its
verification before you continue. If a verification fails, read that step's error
table and stop. Do not guess.

Re-running this document is safe. If a step reports that something already exists,
that is success. Read on and continue.

This document touches none of your content. No step here creates, publishes,
schedules or deletes a post — not even a draft it cleans up afterwards.

It does create one thing, and only one: Step 5 issues the skill its own
credential, which appears in Postey settings under Connected agents as
**Postey CLI** and can be revoked there. Nothing else in this document writes
anything.

Steps 1 to 6 run in one go. Step 7 is a reload, and it is the only point where this
document hands control back. Once Step 9 passes, hand off to
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
| A, local | 1 to 9 | OAuth, linked to the skill in Step 5 | Yes |
| B, web | 1, 2B, 3, 6, 7, 8, 9 | OAuth through the connector | No. See Step 4 |
| C, headless | 1 to 9 | MCP key, which serves both surfaces | Yes, with `-y` |

Steps 1 to 6 are one uninterrupted run. Nothing in them needs the Postey tools to be
loaded, so none of them has to wait for anything. Step 7 is where your client picks
the server up, and it is the only place this document hands control back.

Four rules bind every track.

1. Never block. If a command waits for a keystroke, you passed the wrong flags. Fix
   the flags. Do not wait.
2. Never assume. Every step ends in a verification. Run it.
3. Never proxy. Register the address `https://srvr.postey.ai/mcp` in your own client's
   remote-server configuration. Never wrap it in a local process, and never route it
   through another agent. Step 2 says what that rules out.
4. Never fake. If the Postey tools are absent from this session, stop and say so. A local file,
   another agent and the REST API are all evidence about something else.

Track C has one rule of its own. Stop once, at Step 3, to ask the user for an MCP
key. No other step may pause. A headless run cannot complete OAuth, and no flag works
around that.

---

## Step 1 — Check prerequisites

Confirm that `https://srvr.postey.ai` is reachable.

A healthy server answers in ways that look like errors. Read them as success.

| Request | Healthy response |
|---|---|
| `POST /mcp` with no credential | `401` with a `WWW-Authenticate` header |
| `GET /mcp` | `405` with JSON naming the transport and both credentials |
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
credential from Step 3. Go to Step 6 once the user reports that the connector is
connected.

Track B cannot install the skill. Step 4 says what to do instead.

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
That is a false pass, and Step 8 exists to catch it.

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
    "headers": { "X-API-Key": "<the key>" }
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

The `auth` value is decided by your track, and getting it wrong is the one mistake
this document has actually caused. A Hermes gateway that runs as a service is
track C.

Track C, headless — the common case for Hermes, which runs as a background
service and cannot reach a browser:

```
hermes config set mcp_servers.postey.url https://srvr.postey.ai/mcp
hermes config set mcp_servers.postey.auth none
hermes config set mcp_servers.postey.headers.X-API-Key <the key>
hermes config set mcp_servers.postey.skip_preflight true
```

Track A, a Hermes you drive yourself and that can open a browser:

```
hermes config set mcp_servers.postey.url https://srvr.postey.ai/mcp
hermes config set mcp_servers.postey.auth oauth
hermes config set mcp_servers.postey.skip_preflight true
```

Do not set `auth oauth` on a headless Hermes, and do not set it alongside a key.
There is no `client_credentials` grant, so the OAuth flow cannot finish without a
browser: Hermes registers an OAuth client, never receives a token, and parks the
server. The key sitting in `headers` is not tried, because `auth: oauth` decided
the method before the header was read. One host lost several days to exactly this
state — a valid key present the whole time, every call refused, and a cron that
reported success while publishing nothing.

The working track C end state, confirmed on a running host, is `auth: none` with
the key in `headers`.

`skip_preflight` is belt and braces. Hermes probes the endpoint and expects
`application/json` or `text/event-stream` before it will attempt the handshake.
Postey used to answer that probe with `text/plain` and Hermes rejected the server
outright; since 2026-08-26 it answers `application/json`, so the probe passes on
its own. Setting the key is still harmless, and it keeps the setup working against
an older deployment, so it stays in the list. No `hermes mcp add` option writes it,
which is why these calls are the only path. To undo one, use `hermes config unset`.
`hermes config delete` exits 2.

Confirm the result with `hermes config get mcp_servers.postey`. It prints `url`, `auth` and
`skip_preflight`.

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
| Hermes parks the server: `OAuthNonInteractiveError: non-interactive environment and no cached tokens found` | `auth` is `oauth` on a host with no browser | Set `auth` to `none`, put the key in `headers`, delete any file under `~/.hermes/mcp-tokens/postey.*`, then restart the gateway |
| `hermes mcp test postey` connects and lists tools, but `tool_search` finds none | The server registered after the session built its tool catalog. Parking and reconnecting does this | Restart the gateway from another terminal — `hermes gateway restart`. The running session cannot restart itself, and a reconnect alone does not rebuild the catalog |
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
| C, headless | MCP key |

### OAuth, preferred, track A

Trigger your agent's MCP login for `postey` and complete the browser prompt.

| Agent | Command |
|---|---|
| Claude Code | `claude mcp login postey`, or the `/mcp` command, then **Authenticate** |
| Codex CLI | `codex mcp login postey` |
| Hermes Agent | `hermes mcp login postey`. Track A only — a headless Hermes cannot complete this. Use the MCP key below |

On Hermes, register the server before you log in. `hermes mcp login postey` fails while the
server is absent from the config. Run the login in a new terminal, because the automatic config
reload times out after 30 seconds and can interrupt the flow. The command waits for the browser
and takes about 40 seconds. That wait is expected.

### MCP key, track C

An MCP key is the credential for a client that cannot open a browser. It starts with
`mk_`. It never expires, so there is nothing to rotate on a schedule. It works on
every plan, including the free one, and there is no limit on how many exist.

You cannot create it yourself, because creating one needs a signed-in browser. Stop
here and give the user these four steps. This is the one pause a headless run is
allowed.

1. Open <https://app.postey.ai?settings=agents&section=advanced>
2. Choose **New MCP key**
3. Name it, then pick what it may do. **Read only** is enough to finish this setup;
   **Publishing** is what a posting agent needs
4. Choose **Create API Key**, then copy the key and send it back

Send them that whole address. `?settings=api` opens Integrations instead, where the
general-purpose API keys live, and those are plan-gated.

When you have the key, export it and send it as a header:

```
export POSTEY_API_KEY=<the key>
```

```json
{ "headers": { "X-API-Key": "<the key>" } }
```

Never write the key into a file that a repository tracks. A container or a
continuous-integration job should inject it as a secret, the same way as any other.
The store holds it in plain text, so if it leaks, revoke it and create another.

The plan still decides what the key can *do*. Publishing, scheduling, analytics and
auto-DM are gated one by one, so a free-plan key connects and reads, then answers
`402` on the call that needs a paid feature. That is a limit on the action, not on
the key.

### Agent token, existing installs

An older headless install may hold an agent token instead, starting with `pat_`. The
app no longer creates these, and an MCP key replaces them, but the server still
accepts every token already issued. Keep sending it as a bearer token:

```json
{ "headers": { "Authorization": "Bearer <the token>" } }
```

A `pat_` token expires 90 days after it was minted, and there is no way to mint a
replacement. When it lapses it fails as `401`, which looks like a broken setup. Create
an MCP key instead, which does not expire.

Never print a credential back to the user. Never write it anywhere except the config
file this document names for your client.

Three more rules bind the credential.

1. Never read one out of a config file, a keychain or a process environment in order to call
   Postey yourself. The client sends it. You do not handle it.
2. Never call the REST API at `srvr.postey.ai/v1`. It is a different surface. A result from it
   says nothing about whether MCP works.
3. A credential that reads and cannot write is a real state. Step 9 names it, from the
   permissions the key carries rather than from a trial write.

**Verify:** continue to Step 4, and then to Step 8. Step 8 is the real check.

---

## Step 4 — Install the Postey skill

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

**Hermes Agent.** Its identifier is `hermes-agent`, not `hermes`.

```
npx -y skills add posteyai/skills -a hermes-agent -s postey -y
```

Do not use `hermes skills install` with a file address. It cannot fetch one. Two runs failed, the
second with `--force --yes`, and the agent then copied `SKILL.md` by hand. That leaves a skill with
no `scripts/` directory, which `hermes skills list` still reports as installed. Every local-file
and video command then fails at the moment of use.

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

**Verify:** run your agent's skill-list command. Confirm that `postey` appears. Then confirm that
`scripts/postey.js` exists inside the installed skill directory. A listing proves the directory
exists. It does not prove the skill works, and a hand-copied `SKILL.md` alone lists as installed.

The division is fixed. It is not negotiated per task. The server owns all state and
every change to it. The skill owns local files, video processing and craft. Never use
a skill command to reach an effect the server already provides. See
[`docs/skills-mcp-contract.md`](docs/skills-mcp-contract.md).

| Symptom | Cause | Fix |
|---|---|---|
| The command waits and never returns | The agent name or `-y` is missing | Re-run with `-a <agent> -y` |
| `npx: command not found` | Node is missing | Install Node 20 or later, then retry |
| `Invalid agents: hermes` | The identifier is wrong | Use `hermes-agent` |
| The skill installs but the tools are missing | Step 2 is incomplete | Redo Step 2, then Step 8 |
| A skill command reports `Unknown command` | The server owns that effect | Use the server tool the error names, or read `CHANGELOG.md` |

---

## Step 5 — Link the skill to this connection

The skill runs its own command-line tool, and Step 3 authenticated your *client*,
not that tool. Link it now, or every local-file command fails: uploading a video or
an image from disk, trimming, transcription.

One connection, one credential. The link copies the access this connection already
has — never more — so there is no second sign-in.

This is the one step in this document that creates anything. It issues a
credential, which shows up in Postey settings under Connected agents as
**Postey CLI**. Revoking it there stops the skill and leaves your client's own
connection working.

### Track C — nothing to do

You set `POSTEY_API_KEY` in Step 3. The same key authenticates the server and the
tool. Go to Step 6.

### Track B — nothing to do

A web client has no local disk and no tool to link. Go to Step 6.

### Track A — link it

Three commands, none of which blocks and none of which opens a browser.

```
node <skill>/scripts/postey.js auth:link --begin
```

It prints a `link_` code and a challenge, and writes a secret to disk that it does
not print. Pass **both printed values** to the `link_cli` tool:

```
link_cli(link_code=<the code>, code_challenge=<the challenge>)
```

That call returns no credential, and none will appear in this conversation. It
answers `status: pending`. Then:

```
node <skill>/scripts/postey.js auth:link --claim <the code>
```

The tool collects the credential itself, over its own connection, and stores it.
The code expires after two minutes and works once, so if you are interrupted
between the three commands, start again at `--begin`.

Never paste a credential into this conversation, and do not ask the user for one on
this track. There is nothing for them to fetch.

**Verify:** run `node <skill>/scripts/postey.js config:show` and confirm it reports
`auth_method` as `linked (auth:link)`. It prints no credential.

| Symptom | Cause | Fix |
|---|---|---|
| `No pending link for that code` | `--begin` ran somewhere else, or the config was cleared | Run `--begin` again on the machine that will run `--claim` |
| The claim reports the code is spent or expired | More than two minutes passed, or the code was already claimed | Run `--begin` again |
| `link_cli` says this connection uses an API key | You are on track C | Nothing to link. Set `POSTEY_API_KEY` to that key |
| `link_cli` says there is no grant to copy | The server is registered but not authenticated | Redo Step 3, then link |
| `config:show` still reports `api_key` | `POSTEY_API_KEY` is set and outranks the link | Unset it, or leave it — either credential works |

## Step 6 — Record usage rules

Write a short Postey section into your agent's instructions file.

Write the file in the project directory you work in. Never write it into the home directory. A
file at `~/AGENTS.md` or `~/HERMES.md` applies to every project the user opens.

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

## Step 7 — Load the server

Registering a server does not load it into a running session. Reload before Step 8.

| Agent | Action |
|---|---|
| Hermes Agent | None. It reloads when the config changes. The tools arrive in your next turn |
| Claude Code | Restart the session |
| Everything else | Restart the agent |

If your client loads MCP at a turn boundary, this step ends your turn, and it is the
only place in this document that does. Everything before it — registering, authenticating,
installing the skill, linking it, writing the rules file — needed no Postey tool and has
already run. Everything after it is two reads.

This is measured, not assumed. On Hermes, `hermes config set` returns success, and a tool search
in that same turn still finds nothing. The server appears in the next turn.

Before you end the turn, make the next session able to finish without being asked. Step 6
wrote a Postey section into the agent instructions file; append this line to it:

```
Postey setup is incomplete: the server is registered but unverified.
Finish Step 8 and Step 9 of the setup document, then delete this line.
https://raw.githubusercontent.com/posteyai/skills/main/setup.md
```

Your client reads that file when it starts, so the next session picks the work up on its
own. Deleting the line is part of Step 9 — a permanent instruction to verify an install
that is already verified would send every future session to this document.

Then tell the user exactly one thing: restart, and setup finishes itself.

**Verify:** in the next session, before anything else, read your own tool list and
confirm the Postey tools are in it. If they are absent the reload did not take: say so
and stop. Step 8 is a read against the server, and it cannot run without them.

---

## Step 8 — Verify the connection

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

Tool names vary by client and by version. Some clients add a prefix built from the name you gave
the connection. A server added as `postey` appears on Hermes v0.19.0 as
`mcp__postey__get_accounts`, and on another client as `get_accounts`. Read your own tool list and
use the name you find there.

**Verify:** print `ready`, the account name, and the connected platforms. Print any
blocker. If this returns nothing or errors, setup is not complete. Do not report
success.

Read it in your own session. A result you obtained by driving another agent proves
that agent is connected, and says nothing about you.

| Symptom | Cause | Fix |
|---|---|---|
| `401` or `unauthorized` | Step 3 is incomplete, or the credential is wrong | Redo Step 3 |
| `402` | The plan does not carry the feature that call needs | Not a credential fault. An MCP key connects on every plan. See Step 3 |
| `405` | The client fell back to SSE | Set the streamable HTTP transport. See Step 2 |
| `ready` is `false` | The account can publish nowhere | Read `blockers` and run the call each one names |
| Empty account list | The account has no connected platform | Not an error. Tell the user to connect one at `app.postey.ai` |
| Resource not found | The server registered but never loaded | Reload the agent, then redo Step 7 |
| Tool and resource are both missing | Step 2 did not take effect | Redo Step 2 |

---

## Step 9 — Confirm what the credential may do

Verify with reads only. Setup must leave no trace, so create nothing, publish
nothing, schedule nothing and delete nothing — not even a draft you clean up
afterwards.

Step 8 read `postey://setup` and `postey://accounts`. Read two more, which those two
did not cover:

1. `postey://accounts/{account_id}` — an id from Step 8. This is account-scoped, so it
   fails where the list read succeeded if the key was scoped to specific accounts
2. `postey://notifications` — a plain read on a different resource

A read that returns `403` or `insufficient_scope` names the permission the credential
lacks. That is the answer, and it costs nothing to find out.

Whether the credential can *write* is settled by the permissions chosen when the key
was created, not by a trial write. An MCP key made with the **Read only** preset reads
and cannot post. One made with **Publishing** can. If the user needs to change that,
they edit the key where they created it, in Step 3.

Then remove the resume line Step 7 appended to the agent instructions file. It says
setup is incomplete; it is not, and leaving it sends every future session back here.

**Verify:** report exactly these five, as a block. Anything missing means setup is not
complete, and you do not report success.

```
ready ............ true | false
account .......... <name>
platforms ........ <the connected ones, or none>
blockers ......... <each code, or none>
credential ....... Read only | Publishing
```

| Symptom | Cause | Fix |
|---|---|---|
| `403` or `insufficient_scope` on a read | The key has no permission for that resource | Edit the key in **AI & Agents**, then **Advanced**, and grant it |
| `402` on a read | The plan does not carry that feature, such as analytics | Upgrade the plan. The key is fine |
| `ready` is `false` | The account can publish nowhere | Read `blockers` and tell the user what each one names |

Setup is complete. For content workflows, continue with
[`skills/postey/bootstrap-prompt.md`](skills/postey/bootstrap-prompt.md).
