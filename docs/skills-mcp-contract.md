# Skills ↔ MCP responsibility contract

> **Normative.** Owner directive, 2026-07-28: *the skill is a **strict extension** of the Postey MCP
> server, and responsibilities are **predefined**, not discovered at runtime.* This document is the
> predefinition, and it is the shared reference for both the Postey MCP server and this skill repo.

## The rule

**The skill may only provide what MCP cannot. It may never duplicate what MCP already does.**

Two corollaries, both load-bearing:

1. **No overlapping capability.** If MCP has a tool for it, the skill calls that tool. It does not
   ship a second path to the same effect.
2. **No runtime negotiation.** Which surface owns a capability is decided here, in advance. An agent
   must never have to work it out, and prose telling it to "pick one path" is evidence the contract
   was violated.

## The dividing question

> *Does this require access to something only the user's machine has, or is it judgment rather than
> contract?*

**Yes → skill. No → MCP.** Nothing else. If a capability is arguable it goes to MCP, because MCP is
the one that can enforce permissions.

## Ownership

| Concern | Owner | Rationale |
|---|---|---|
| All state reads (accounts, posts, schedule, comments, analytics, notifications) | **MCP** | One source of truth; permission-gated; resource-first |
| All mutations (create, update, delete, publish, schedule, tag, reply) | **MCP** | Irreversible actions need auth, idempotency and guards — server concerns |
| Authorization & permissions | **MCP** | A skill can never be trusted for authz |
| Platform capability truth (which platforms, limits, rules) | **MCP** | The skill *reads* it, never restates it |
| Media upload from a URL or inline | **MCP** | The server can fetch; no local access needed |
| — | — | — |
| Local filesystem access | **Skill** | The server cannot see the user's disk. Irreducible |
| Video processing (`video trim`, `video info`, transcription) | **Skill** | Needs local ffmpeg and the file itself |
| Chunked / large-file upload | **Skill** | Streams from disk; MCP's inline path is context-bound |
| Local auth config (`setup --key`, `config:show`) | **Skill** | Writes to the user's machine |
| Craft & judgment (brand voice, platform tone, when to thread, hook writing) | **Skill** | Prose guidance, loaded on demand |
| Workflow sequencing (the guided flows) | **Skill** | Versions and ships without a backend deploy |

### Reads are resource-first

State lives in `postey://` resources. The equivalent read tools (`get_accounts`, `get_teams`, …)
exist **only** for clients that cannot read MCP resources. Guidance must present the resource as the
path and the tool as the fallback — never the other way round.

## Applied history

The CLI has been converging on this rule for some time:

| Removed from the CLI | Replaced by |
|---|---|
| `drafts:list` | `get_posts` |
| `drafts:create` | `create_post` |
| `drafts:publish` | `publish_draft` |
| `drafts:delete` | `delete_draft` |
| `drafts:schedule` | `schedule_post` |
| `drafts:content` | `postey://posts/{id}/content/{platform}` |
| `drafts:get` | `get_post_content` / the content resource |
| `posts:create` | `create_post` |

`video post` and `video transcribe` still handle the video itself — that needs the user's disk and
local ffmpeg — but they stop at the upload and return the fields for `create_post` rather than
creating the draft themselves.

## Ownership is capability-keyed

> **Amended 2026-08-02** (owner-approved). The rule above answers *skill or MCP*. Once the repo holds
> more than one skill it must also answer **which** skill — otherwise two skills ship rival guidance
> for the same capability, or a capability the server exposes is documented by nobody. Both had
> already happened: `postey://notifications` and `postey://posts/{id}/publish-status` shipped with
> zero coverage in any skill, and six of seven MCP prompts were declared and never routed to.

Every skill declares, in `SKILL.md` frontmatter, what it is responsible for — in **canonical
capability keys**, never raw tool names:

```yaml
capabilities:
  owns:    [post.create, post.update, …]   # exclusive
  reads:   [analytics.top_posts, …]        # shared
  prompts: [compose-post, …]
```

The vocabulary is `capability-snapshot.json`'s `canonical` map, which is generated from
`postey://skill-manifest`. Declaring in the server's own keys is the same principle as S9.5: a
hand-maintained list agreeing with the other lists and with nothing that ships is the defect.

- **`owns`** — exactly one skill per key. Owning a capability means carrying the guidance for using
  it. A skill must not claim a capability it does not actually document; claiming it to silence the
  coverage check defeats the check.
- **`reads`** — unrestricted. Several skills legitimately read the same state. Only *ownership* is
  exclusive.
- `mcp-tools.tools:` is **derived** from `capabilities:`, not hand-written.

## Enforcement

A contract that is only prose is the failure mode this exists to prevent. Six mechanical checks:

| # | Check | Enforces |
|---|-------|----------|
| **C1** | **Cover** — every `canonical` key is claimed by some skill | a new server capability fails the build until a skill owns it |
| **C2** | **Exclusive** — no key appears in two skills' `owns` | no rival guidance for one capability |
| **C3** | **Resource-first** — no skill names a `superseded_by` tool as its path | "Reads are resource-first", above |
| **C4** | **Prompts owned** — every declared prompt is claimed | prompts cannot ship unrouted |
| **C5** | **Derived tool lists** — `mcp-tools.tools:` regenerates identically from `capabilities:` | no hand-maintained tool list |
| **C6** | **Non-intersection** — documented CLI commands ∩ server tools = ∅ | "No overlapping capability", above |

C6 is the original intended check 1. The original check 2 (capability-source) is now structural
rather than a check: the skill has no hand-maintained tool list left to audit, because C5 generates
it.

While the pillar skills are still being built, C1 and C4 carry a time-boxed allowlist of unclaimed
keys and prompts. Each entry names the stage that clears it, and the allowlist reaching **empty** is
the completion test for the split — not a step that can be quietly skipped.
