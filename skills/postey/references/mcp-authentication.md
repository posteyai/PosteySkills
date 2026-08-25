# MCP Authentication — Credentials, Scopes and Mint Paths

This file is the new home for the auth detail that used to live in the **MCP server's
instruction block** — the scope list, the mint endpoints and the browser-less path
(mcp-northstar N1.4). It loads on demand, so it costs nothing on a request that is not
about authentication.

**Why it had to leave, and why it had to land somewhere fetchable.** The instruction
block is delivered on `initialize`, and `initialize` needs a credential — `POST /mcp`
with none answers `401` with a `WWW-Authenticate` header. A client that cannot
authenticate therefore never reads the instruction block at all. The block is the wrong
surface for teaching a client how to get its *first* credential, whatever else it is
good for. This file and [`setup.md`](../../../setup.md) are fetched over plain HTTPS
with no Postey credential, so they are the right one.

**What stayed on the server** and is therefore *not* repeated here: the three credential
headers, permission levels, rate limits and the response envelope. Read those from the
server's instructions.

Postey accepts three credentials.

| Credential | Header | For |
|---|---|---|
| OAuth 2.1 access token | `Authorization: Bearer <jwt>` | any client that can open a browser |
| MCP key, `mk_*` | `X-API-Key: <key>` | headless clients — CI, containers, cron, SDK callers |
| Agent token, `pat_*` | `Authorization: Bearer <token>` | existing installs only. Superseded by the MCP key |

Every mint path below needs an **already-authenticated session**. None of them bootstraps
a client that holds no credential at all. For that client there is exactly one path, and
it is a human one: the user creates an MCP key in a signed-in browser and hands it over.
See [API key](#api-key).

---

## OAuth scopes

The interactive path. Discovery is at
`https://srvr.postey.ai/.well-known/oauth-authorization-server`; the flow is standard
Authorization Code with PKCE, and the token goes back as `Authorization: Bearer <jwt>`.

Trigger your own client's MCP login rather than driving the flow by hand — `claude mcp
login postey`, `codex mcp login postey`, `hermes mcp login postey`. [`setup.md`](../../../setup.md)
Step 3 carries the per-agent commands and the Hermes ordering trap.

Twelve scopes drive the consent screen:

```
post:read          post:edit          post:delete
publishing:read    publishing:edit
scheduling:read    scheduling:edit    scheduling:delete
analytics:read
comments:read      comments:edit      comments:delete
```

These scope strings decide **what the consent screen offers**, not what the grant stores.
A grant issued by the consent bridge always persists the full permission matrix —
resource × verb × account or team — so a grant is narrower than its scope list whenever
the user restricted it to particular accounts. Read the effective answer from a `403` or
`insufficient_scope` on a real call; do not infer it from the scopes you asked for.

---

## API key

An MCP key is the credential for a client that cannot open a browser. It starts with
`mk_`, it never expires, and it works on every plan including the free one. There is no
cap on how many exist: the MCP key type sits outside both the paid API-key entitlement
and the five-key limit that every other key type carries.

**You cannot create one for yourself.** Creating a key needs a signed-in browser. Stop
and give the user these steps.

1. Open <https://app.postey.ai?settings=agents&section=advanced>
2. Choose **New MCP key**
3. Name it, then pick what it may do. **Read only** is enough to connect and read;
   **Publishing** is what a posting agent needs
4. Choose **Create API Key**, then copy the key and send it back

Send that whole address. `?settings=api` opens Integrations instead, where the
general-purpose API keys live, and those are plan-gated.

Then export it and send it as a header:

```
export POSTEY_API_KEY=<the key>
```

```json
{ "headers": { "X-API-Key": "<the key>" } }
```

`POST /v1/keys` mints one over the API, but it authenticates the caller first, so it
helps a client that already has a credential and not one that is trying to get its first.

The plan still decides what a key can *do*. Publishing, scheduling, analytics and auto-DM
are gated one at a time, so a free-plan key connects and reads, then answers `402` on the
call that needs a paid feature. That is a limit on the action, not on the key.

Never write a key into a file a repository tracks. A container or a CI job injects it as
a secret. The store holds it in plain text; if it leaks, revoke it and create another.

---

## Agent tokens

An older headless install may hold an agent token instead, starting with `pat_`, sent as
`Authorization: Bearer <token>`. The app no longer offers these and an MCP key replaces
them, but the server still accepts every token already issued.

Two mint paths remain on the API, and **both authenticate the caller first**:

| Endpoint | Needs | Lifetime |
|---|---|---|
| `POST /v1/auth/mcp/agent-tokens` | an existing grant of the caller's, from the browser consent flow | 90 days |
| `POST /v1/auth/mcp/self-issued-agents` | nothing but the caller's own session — it creates the grant too | does not expire |

The second exists because a token needs a grant and grants only came from a consent
screen the browser-less agent cannot render, which left the credential unreachable on a
fresh account. It is re-runnable: the client id is derived from the agent name, so
connecting the same agent again updates its grant instead of adding a duplicate row to
the user's agent list.

Both tokens inherit their grant's scopes and die when that grant is revoked. Revoking the
grant kills every key under it.

A 90-day token fails as `401` when it lapses, which reads as a broken setup rather than
an expiry. Prefer an MCP key.

---

## Three rules that bind every credential

1. Never print a credential back to the user, and never write one anywhere except the
   config file [`setup.md`](../../../setup.md) names for your client.
2. Never read one out of a config file, a keychain or a process environment in order to
   call Postey yourself. The client sends it. You do not handle it.
3. Never call the REST API at `srvr.postey.ai/v1` to check whether auth works. It is a
   different surface, and a result from it says nothing about whether MCP works.
