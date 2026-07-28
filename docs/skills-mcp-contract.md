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
| `drafts:get` | `get_specific_post_content` / the content resource |
| `posts:create` | `create_post` |

`video post` and `video transcribe` still handle the video itself — that needs the user's disk and
local ffmpeg — but they stop at the upload and return the fields for `create_post` rather than
creating the draft themselves.

## Enforcement

A contract that is only prose is the failure mode this exists to prevent. Two mechanical checks are
intended:

1. **Non-intersection check.** The skill's documented command list must not intersect the MCP tool
   list taken from server discovery. Any overlap fails the build.
2. **Capability-source check.** The skill declares no hand-maintained platform or tool list; it reads
   them from discovery.

Both depend on the server publishing its real surface through discovery. Until that lands, this
document is the authority and the boundary is maintained by review.
