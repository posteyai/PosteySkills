---
name: postey-engagement
version: 1.1.0
description: >
  Read and reply to the comments your posts actually got, and run comment-to-DM
  automations, without sounding like a bot. Covers triage, tone, escalation and
  when not to reply at all.
when_to_use: >
  Use when the user asks what people said on a post, wants to reply to comments,
  asks to catch up on their inbox, wants a "comment X and I'll DM you" funnel set
  up, or asks why a reply should or should not be sent.

# Requires the `postey` skill: accounts, the write path, and the craft layer that
# defines each platform's register.
requires:
  - postey

capabilities:
  owns:
    - comment.platform.list
    - comment.platform.reply
    - automation.list
    - schedule.auto_dm
  reads:
    - notification.list
    - post.list
    - post.read
  prompts:

mcp-tools:
  resources:
    - postey://accounts
    - postey://notifications
    - postey://accounts/{account_id}/automations
    - postey://posts/{post_id}/content/{platform}
  tools:
    # GENERATED from capabilities: by scripts/gen-mcp-tools.js — do not hand-edit.
    - configure_auto_dm
    - get_platform_comments
    - get_posts
    - reply_comment
    # Fallbacks only: each is superseded by a postey:// resource this skill
    # declares. Use them when the client cannot read MCP resources.
    - get_post_content
  prompts:

routing:
  read-only-state: mcp-resource > mcp-tool
  comment-read:    mcp-tool
  comment-reply:   mcp-tool
  fallback:        mcp-tool
---

# Postey Engagement

Replying is the highest-frequency thing an account owner does and the easiest to do badly. A
generic reply is worse than no reply: it is public, it is attributed to them, and it reads as
automation.

## Read before replying

1. **Accounts first** — `postey://accounts`, or `get_accounts` if your client cannot read
   resources.
2. **The post, then the comment.** Read the post's own text
   (`postey://posts/{post_id}/content/{platform}`) before drafting a reply. A reply that
   misreads its own parent is the most common failure here.
3. **Notifications about people** are this skill's half of `postey://notifications` — new
   comments, mentions, replies. Notifications about *posts* (did it publish, did it fail) belong
   to `postey-ops`.

## Audience comments, not internal ones

`get_platform_comments` reads what real people wrote on the live post. Internal comments —
teammate and client notes inside Postey, read via `postey://posts/{post_id}/comments/{platform}` —
belong to `postey-teams` and are never published. Replying to one with `reply_comment` puts a
colleague's private note on a public timeline. Check which kind you are holding before you draft.

## Triage — decide before you draft

| The comment is | Do |
|---|---|
| a genuine question | answer it, specifically, and stop |
| praise | thank briefly, add one concrete detail, do not pitch |
| a correction that is right | say so plainly and thank them; never argue a losing point in public |
| a correction that is wrong | reply once with the evidence; do not reply twice |
| hostile, or bait | do not reply. Say so and move on |
| spam or a scam | do not reply. Suggest the user report it |
| anything about a person's health, money, legal position, or safety | **stop and hand to the user** |

The last row is not negotiable. An agent replying on someone's behalf about a personal matter can
do real harm, and the person on the other end has no idea they are talking to software.

**Never reply to a comment on a post the user did not publish through Postey** unless they ask —
they may not have seen it, and a reply is the first they learn of it.

## Tone

Match the platform's register — `platform-archetypes.md` in the hub carries it. LinkedIn is not X,
and a reply is more informal than the post it hangs off.

If a brand profile exists (`postey-voice`), its voice and banned lists apply to replies too. Most
voice drift shows up in replies first, because they are written fast.

Three rules that survive every platform:

- **Shorter than the comment.** A reply longer than what it answers reads as a lecture.
- **No links unless asked.** A link in a reply reads as a funnel.
- **Never open with the person's name** if you are unsure of it. Getting it wrong is worse than
  omitting it.

## Show the user before sending

`reply_comment` is a public write. Draft every reply, show them together, and send only
what the user approves. Batch approval is fine — silent sending is not.

## Auto-DM funnels

`configure_auto_dm` sets up "comment X and I'll send you Y". Read the account's existing
automations first (`postey://accounts/{account_id}/automations`) — a second automation on the same
trigger word competes with the first.

Design rules:

- **One trigger, one thing delivered.** A trigger that sends different payloads depending on
  context will misfire and cannot be debugged from the outside.
- **Say what happens in the post itself.** "Comment PLAYBOOK and I'll DM it to you" is honest;
  a silent DM to anyone who comments is not, and platforms treat it as unsolicited messaging.
- **Check the platform allows it** before promising it. DM automation rules differ per platform and
  change; read `postey://platforms/{platform}/rules` rather than assuming.

An automation the user forgot about is still sending DMs in their name. When listing automations,
name every active one, not just the one being changed.

**Arming one needs an explicit yes, in the turn you arm it.** `configure_auto_dm` is not a draft.
Once it is live it messages every person who hits the trigger, with no further review, for as long
as it stays on. Show the user the trigger word, the exact payload, the account and the post it
attaches to, and wait for them to approve that — the same gate `reply_comment` gets, for a wider
blast radius. A request to "set up a funnel" is not approval of the message it will send.
