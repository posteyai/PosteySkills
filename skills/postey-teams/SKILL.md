---
name: postey-teams
version: 1.0.0
description: >
  Run content past a reviewer before it goes out: who is on the team, what they
  said on a draft, how a share link gets a client's approval, and what "approved"
  does and does not mean in Postey.
when_to_use: >
  Use when several people touch the same content — an agency and a client, a
  marketer and a founder — or when the user asks who reviewed something, what the
  team said on a draft, wants a draft sent for approval, or opens a share link.

requires:
  - postey

capabilities:
  owns:
    - team.list
    - team.info
    - team.read
    - comment.internal.list
    - post.resolve
  reads:
    - post.list
    - post.read
  prompts:

mcp-tools:
  resources:
    - postey://accounts
    - postey://teams
    - postey://teams/{team_id}/members
    - postey://posts/{post_id}/comments/{platform}
    - postey://posts/{post_id}/content/{platform}
  tools:
    # GENERATED from capabilities: by scripts/gen-mcp-tools.js — do not hand-edit.
    - get_post_by_share_link
    - get_posts
    - get_team_info
    # Fallbacks only: each is superseded by a postey:// resource this skill
    # declares. Use them when the client cannot read MCP resources.
    - get_internal_comments
    - get_specific_post_content
    - get_teams
  prompts:

routing:
  read-only-state: mcp-resource > mcp-tool
  comment-read:    mcp-tool
  fallback:        mcp-tool
---

# Postey Teams

## Approval is a convention, not a state

**Postey has no `APPROVED` status.** `PostStatusEnum` is `DRAFT | SCHEDULED | PUBLISHING |
PUBLISHED`. Nothing in the system records that a human said yes.

That has three consequences, and getting them wrong is how content goes out unreviewed:

| What is true | What it means for you | The failure it prevents |
|---|---|---|
| A draft carries no approval flag | Approval lives in an internal comment, a message, or a conversation. Read it; never infer it. | Treating a status as consent |
| Silence is not approval | If asked whether something is cleared, say who said what and when — never "no objections were raised" | Reporting absence of dissent as sign-off |
| Nothing stops a `DRAFT` publishing | The status does not protect it. Only the rule that publishing needs explicit instruction does, and that rule lives in the agent, not the server. | Assuming the server will catch you |

When the user says "it's approved", that is the approval. Take it from them, and say whose approval
you are acting on.

## Internal comments are the review record

`postey://posts/{post_id}/comments/{platform}` holds team notes — visible inside Postey, never
published. They work on a post in any status, not just drafts.

Read them **before** drafting a revision. The most common failure in a review loop is rewriting a
post while ignoring the note that says what was wrong with it.

Internal comments are not audience comments. Confusing the two means treating a colleague's note
as public feedback — or worse, drafting a public reply to an internal note.

| | Internal comments | Audience comments |
|---|---|---|
| **Who wrote it** | A teammate or client, inside Postey | A real person on the live post |
| **Reach** | Never published | Public |
| **Read via** | `postey://posts/{post_id}/comments/{platform}` | `get_platform_comments` |
| **Owned by** | This skill | `postey-engagement` |
| **A reply goes** | Back into Postey | Out to the public |

## Share links

`resolve_share_link` resolves a Postey share URL or `share_id` to the underlying post. Use it
when someone pastes a link — the reviewer often has only that.

A share link is how a client who has no Postey account sees a draft. Two things follow: the
recipient may not be in the team list, and anyone holding the link can read the draft. Do not put
anything in a draft you would not send to whoever might be forwarded that link.

## Teams

`postey://teams` and `postey://teams/{team_id}/members` say who exists and who can act. Read them
before attributing a comment or asking "who should approve this?" — guessing a reviewer's name in
front of a client is a small error with an outsized cost.

An account can belong to several teams, and identities can be shared across accounts
(`shares_identity_with` in `postey://accounts`). Two account entries pointing at the same underlying
identity will publish to the same place. Check before assuming two accounts mean two audiences.

## The routine that works

1. Read the accounts and confirm which one this content is for.
2. Draft. Everything stays a `DRAFT`.
3. Hand over the share link and say explicitly who needs to approve.
4. When they respond, read the internal comments and the user's own words.
5. Revise against what was actually said, and show the diff.
6. Publish or schedule **only** on explicit instruction — and scheduling counts as publishing.

Step 6 does not become optional because step 3 happened. A reviewer approving a draft is not the
user telling you to publish it.
