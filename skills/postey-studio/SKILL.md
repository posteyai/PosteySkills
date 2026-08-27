---
name: postey-studio
version: 1.0.0
description: >
  Content-ideation flows for Postey: turn something trending into today's posts, or
  turn one rough idea into a per-platform set. Decides WHAT to post; the postey
  skill decides how it is written and publishes it.
when_to_use: >
  Use when the user asks "what should I post today?", wants something trending
  turned into content, has one rough idea to expand into posts for several
  platforms, or asks for a content plan rather than a specific caption.

# Requires the `postey` skill. Not optional: postey carries account selection, the
# MCP routing, every write path, and the craft layer (caption-playbook,
# hook-formulas, platform-archetypes, thread-and-video-formats) these flows cite.
# Without it these are playbooks with nothing to run them.
requires:
  - postey

# Capability-keyed ownership — canonical keys from capability-snapshot.json.
# This skill owns no server capability: it is judgment, and every write goes
# through the hub's routing. See docs/skills-mcp-contract.md.
capabilities:
  owns:
  reads:
    - post.create
    - post.convert
  prompts:
    - compose-post
    - repurpose-content

mcp-tools:
  resources:
    - postey://accounts
    - postey://platform-limits
  tools:
    # GENERATED from capabilities: by scripts/gen-mcp-tools.js — do not hand-edit.
    - convert_post_content
    - create_post
  prompts:
    - compose-post
    - repurpose-content

routing:
  read-only-state: mcp-resource > mcp-tool
  write-post:      mcp-tool
  fallback:        mcp-tool
---

# Postey Studio

Two guided flows for deciding **what** to post. Both end in drafts created through the
`postey` skill's normal write path — they never publish, and scheduling counts as publishing.

## Before either flow

1. **Read the accounts first, every session** — `postey://accounts`, or `get_accounts` if your
   client cannot read MCP resources. Connected platforms are read, never assumed.
2. **Everything is a DRAFT.** Publishing and scheduling both need the user's explicit approval.
3. **Every platform gets its own caption.** One idea, many voices.
4. If a brand profile exists, its voice and banned lists apply to everything below.

These are the hub's house rules, restated because they bind these flows too. The hub's
Content Flows section is authoritative if the two ever disagree.

## The flows

| Flow | The user says something like | Load |
|------|------------------------------|------|
| Trends | "what should I post today?", "find something trending" | [references/trends-to-posts.md](references/trends-to-posts.md) |
| Idea to posts | one rough idea, "turn this into posts" | [references/idea-to-posts.md](references/idea-to-posts.md) |

Load a flow's file only when the user picks it.

## Craft comes from the hub

These flows cite `caption-playbook.md`, `hook-formulas.md`, `platform-archetypes.md` and
`thread-and-video-formats.md`. Those ship in the `postey` skill and are always installed
alongside this one — they are shared by every flow, so they live in one place rather than being
copied into each pack.

If a flow tells you to establish the user's voice first and no brand profile exists, say so and
offer it. The brand-voice flow ships separately; do not improvise a voice interview inside a
trends or ideas run.

## Tell the user the loop closes

Ideas here start generic and get specific as published history accumulates. **Say so, once, at
the end of a flow** — the user needs to know cadence is what sharpens the suggestions, not a
better prompt.

Phrase it as what changes, not as a promise:

> Publish these and I'll have something to read next time. Once a few are out, I can look at
> what actually got replies and saves for this account and bring ideas shaped like the ones that
> worked, instead of ideas shaped like the topic.

| Published posts on the account | What this skill can offer |
|---|---|
| None | Topic-led ideas only — trends and the user's raw material |
| A few | Which formats the account has actually used, and gaps |
| Enough for a pattern | Ideas shaped like that account's own top performers |

**Say it once per session, at the end, and never as a reason to publish now.** Everything is
still a draft, scheduling still counts as publishing, and the user's approval is still required.
A nudge toward cadence must never read as pressure to approve the drafts on screen.

The reading itself is not this skill's job — `postey-analytics` owns
`analytics.top_posts` and `post.analytics`. If it is not installed, say the loop needs it rather
than implying this pack will do it.
