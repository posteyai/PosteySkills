---
name: postey-ops
version: 1.0.1
description: >
  Know whether the things you scheduled actually went out, find the ones that
  failed, and fix them. Publishing is asynchronous — created is not published,
  and scheduled is not published either.
when_to_use: >
  Use when the user asks whether a post went out, why something did not publish,
  what is scheduled, why the queue looks wrong, or reports that a platform never
  received a post. Also use before claiming any publish succeeded.

requires:
  - postey

capabilities:
  owns:
    - notification.list
    - post.publish_status
  reads:
    - post.list
    - post.read
    - schedule.read
  prompts:

mcp-tools:
  resources:
    - postey://accounts
    - postey://notifications
    - postey://posts/{post_id}/publish-status
    - postey://posts/{post_id}/content/{platform}
  tools:
    # GENERATED from capabilities: by scripts/gen-mcp-tools.js — do not hand-edit.
    - get_posts
    - get_schedule
    # Fallbacks only: each is superseded by a postey:// resource this skill
    # declares. Use them when the client cannot read MCP resources.
    - get_post_content
  prompts:

routing:
  read-only-state: mcp-resource > mcp-tool
  publish-status:  mcp-resource
  fallback:        mcp-tool
---

# Postey Ops

## The thing this skill exists for

**Publishing is asynchronous, and every status short of `PUBLISHED` means it has not gone out.**

```
DRAFT → SCHEDULED → PUBLISHING → PUBLISHED
```

A successful `schedule_post` call means the job was accepted. It says nothing about whether the
platform took the post. A post can sit in `PUBLISHING`, or reach `PUBLISHED` on one platform and
fail on another in the same post, because each platform publishes independently.

**Never tell the user something published because the call that scheduled it returned success.**
Read `postey://posts/{post_id}/publish-status` and say what it actually says.

## Checking a post

1. `postey://posts/{post_id}/publish-status` — per platform, not per post.
2. If a platform is missing from `published_platforms` while listed in `socials`, that platform did
   **not** go out. That is the single most useful signal in the system and the easiest to miss:
   the post looks published because one platform succeeded.
3. `postey://notifications` — this skill's half is notifications about **posts**: publish failures,
   token expiry, quota. Notifications about **people** (comments, mentions) belong to
   `postey-engagement`.

## Common causes, in the order worth checking

| Symptom | Check first |
|---|---|
| one platform missing, others fine | that account's connection — `postey://accounts` reports `needs_attention` per platform |
| everything stuck in `SCHEDULED` past its time | the scheduler worker, not Postey's API |
| `PUBLISHING` for a long time | a platform accepted the upload and has not confirmed; video is slower |
| published but no `live_link` | it went out; the link fetch lagged. Not a failure |
| nothing scheduled that the user expected | the schedule was never created, or was created on a different account |

`needs_attention` on an account is the most common root cause and the cheapest to check. A platform
in `RECONNECTION_REQUIRED` will fail every publish silently until someone reconnects it, and the
draft looks perfectly healthy.

## Reporting

Say per platform, with the status, not "it published". The user cares which ones landed:

```
post 10168
  LINKEDIN   PUBLISHED   2026-07-26 17:30   live_link present
  X          not in published_platforms — the account shows twitter RECONNECTION_REQUIRED
  THREADS    listed in socials, no publish record
```

If something failed, say what to do: reconnect the platform, or recreate and re-schedule. Do not
retry a publish on the user's behalf without asking — a duplicate post is worse than a late one,
and the failure may have partially succeeded.

## Cadence

`get_schedule` and `postey://accounts` give the queue. When asked to plan cadence, the constraint
is what the account can sustain, not what the platform allows. An empty queue next week is a more
useful thing to report than an optimal posting time.

Scheduling itself is the hub's (`schedule.create`), and **scheduling counts as publishing**: it
needs the user's explicit approval, because a scheduled post publishes itself.
