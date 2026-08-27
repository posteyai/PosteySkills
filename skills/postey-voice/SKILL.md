---
name: postey-voice
version: 1.1.0
description: >
  Learn how the user actually writes — from the posts they published, and from
  what they approved, edited or rejected — and keep a brand profile that gets
  sharper with use.
when_to_use: >
  Use when the user says "learn my voice", "write like me", "that doesn't sound
  like me", gives a handle or website to learn from, or when a draft is edited
  before publishing and the correction should be remembered.

# Requires the `postey` skill. It ships brand-profile-template.md (the schema this
# pack fills in) and the craft layer every flow cites, plus the read paths below.
requires:
  - postey

# Local-machine work only: reading the user's own files and doing deterministic
# arithmetic over them. The CLI calls no Postey API and creates nothing.
allowed-tools:
  - Bash(${CLAUDE_SKILL_DIR}/scripts/voice.js:*)

# This skill OWNS no server capability. Voice is judgment, and
# docs/skills-mcp-contract.md assigns judgment to the skill; every write still
# goes through the hub. It only reads, and it stores what it learns client-side.
capabilities:
  owns:
  reads:
    - post.list
    - post.read
    - comment.internal.list
    - analytics.top_posts
    - post.analytics
  prompts:
    - improve-post

mcp-tools:
  resources:
    - postey://accounts
    - postey://posts/{post_id}/content/{platform}
    - postey://posts/{post_id}/comments/{platform}
    - postey://posts/{post_id}/analytics
    - postey://accounts/{account_id}/analytics/posts
  tools:
    # GENERATED from capabilities: by scripts/gen-mcp-tools.js — do not hand-edit.
    - get_posts
    # Fallbacks only: each is superseded by a postey:// resource this skill
    # declares. Use them when the client cannot read MCP resources.
    - get_internal_comments
    - get_specific_post_content
  prompts:
    - improve-post

routing:
  read-only-state: mcp-resource > mcp-tool
  analytics:       mcp-resource
  fallback:        mcp-tool
---

# Postey Voice

Two ways to learn a voice, and they compose:

| | Cold start | Warm loop |
|---|---|---|
| **What it reads** | Posts already published | What happens to each draft — edits, approvals, deletions |
| **When it runs** | Once, on first use | Every time a draft is acted on |
| **Needs history?** | Yes — nothing to read on a new account | No, it builds its own |
| **Produces** | The initial profile | Rules appended to the ledger |
| **Recoverable later?** | Yes, published posts persist | **No** — capture live or lose it |

## One profile per account — ask first

**Read `postey://accounts` and, if more than one is connected, ask which account this profile is
for. Never derive a voice without naming the account.**

A creator with one account, a brand with three, and an agency with twelve are the same code path
and different failure costs. For the agency, applying one profile to the wrong account puts a
client's voice in another client's post.

| Situation | What to do |
|---|---|
| One account connected | Use it, and say which one you used |
| Several connected, user named one | Use that one |
| Several connected, user named none | **Ask.** Do not infer from the most recent post or the first in the list |
| Deriving from local files, no account in play | Allowed, but the profile is unscoped — say so |

Every profile carries `profile_for`. A profile whose `profile_for` is `null` was derived without
an account and **must not be applied to a named account** — re-derive with the account set.
`corpus.accounts` is a separate field: the accounts the evidence was read *from*.

The CLI mirrors this. `--account <id>` records the scope and names the output
`voice-profile-<id>.json`, so two accounts cannot overwrite each other's profile. Omitting it
writes `profile_for: null` and warns.

## What this skill cannot know

**It knows nothing before it is installed.** Say so rather than implying otherwise.

The server has no `REJECTED` state — `PostStatusEnum` is `DRAFT | SCHEDULED | PUBLISHING |
PUBLISHED`. Rejection is expressed by deleting the draft, which destroys the evidence. So:

| Signal | Available retroactively? |
|---|---|
| Published posts, and which performed best | **yes** — this is the cold start |
| Reviewer notes (internal comments) | **yes** |
| What was edited between draft and publish | **no** — must be captured live |
| What was rejected, and why | **no** — must be captured live |

A rejection made in the Postey web UI is invisible to this skill, permanently. Only drafts this
agent created in-session can be tracked through to their verdict.

## Bulk ingest — content the user already has

Fastest path to a first profile, and it needs no account access at all:

```bash
${CLAUDE_SKILL_DIR}/scripts/voice.js ingest ./their-writing --account 317
```

Pass `--account` whenever the profile is for a connected account — it names the output
`voice-profile-317.json` and records the scope. Omit it only when the corpus genuinely belongs to
no account yet; the result is then explicitly unscoped.

Accepts a directory, a single file, or a JSON export (`.md`, `.txt`, `.json`; a bare array,
`{posts:[…]}` or `{data:[…]}`). A JSON export becomes one document per row, keeping `post_id`,
`platform` and `published_at`; a text file becomes one document dated by its mtime.

Useful flags: `--account <id>` to scope the profile, `--scope LINKEDIN` to attribute everything to one platform, `--since <ISO>` to ignore
old work, `--out <file>` to write the ledger.

It emits countable features and rule observations — never an opinion. Judgements like "warm but
authoritative" are yours to make from reading the corpus; the CLI only measures what cannot be
argued with, so that every rule can name its evidence.

Then compile:

```bash
${CLAUDE_SKILL_DIR}/scripts/voice.js compile ./voice-ledger.json
```

Full flag list: [command-reference.md](command-reference.md).

## Cold start — the published corpus

1. `get_posts(status=PUBLISHED)` per account.
2. Read each one's text: `postey://posts/{post_id}/content/{platform}`.
3. Weight by `postey://accounts/{account_id}/analytics/posts` — profile what **worked**, not
   merely what shipped. **Check the numbers are real first.** On the account checked during
   development, every LinkedIn post reported zero impressions while the same content on X reported
   between 481 and 2,935. Weighting by a metric that is uniformly zero silently weights by nothing;
   say so and fall back to unweighted rather than implying the ranking meant something.
### Corpus hygiene — read this before trusting a pass

A Postey account accumulates **QA and pipeline-test posts**, and they are `PUBLISHED` like anything
else. A real account checked during development had 88 published LinkedIn posts, of which a large
share were artifacts: `AUDIT-PUBLISH-PROBE`, `publish-fix validation test`, `testf`,
`sdsd sdssdaaaa`, `qwetgvdbmFgh`. Ingest those and you will learn that the user writes gibberish.

Exclude a post from the corpus when any of these hold:

- the title or text reads as a probe — `test`, `probe`, `validation`, `[dev]`, `please ignore`
- the text is not language — no sentence structure, repeated character runs
- it is a duplicate of another post with a near-identical opening

Then say how many you dropped and why. A silent filter is as misleading as no filter.

4. Derive observable features only: sentence length distribution, how posts open and close,
   punctuation habits, emoji and hashtag rate, whether there is a CTA and what shape it takes.

Write findings into the profile with the post IDs they came from. A claim about the user's voice
with no citation is a guess, and it will be treated as evidence later.

## Warm loop — the verdict ledger

**The edit delta is the core of this skill.** It is free, it is specific, and it states exactly
what was wrong in the user's own correction. Analytics is the tiebreaker, not the primary signal.

Two gates. Both are mandatory; skip either and the loop silently never runs:

- **Before drafting anything** — read the profile and the active rules.
- **After every outcome** — append a verdict to the ledger.

Append verdicts to the same ledger file, then re-run `voice.js compile`. Thresholds are applied by
the script, not by eye — counting evidence across sessions by hand is exactly what drifts.

Format and thresholds: [rules-ledger.md](rules-ledger.md).
Profile shape: [voice-profile-schema.md](voice-profile-schema.md).

## Where the profile lives

Client-side — memory, project knowledge, or a file the user keeps. The MCP server has no write
path for skill state, and the hub's `brand-profile-template.md` already establishes this pattern.

**It is user content.** Never commit it, never log it, never send it anywhere.

## Hard limits

A learned rule never overrides a platform limit. Character counts, media rules and platform
mechanics come from `postey://platform-limits` and the hub, which owns platform truth. If a rule
and a limit disagree, the limit wins and the rule is noted as inapplicable there.

## The interview flow

When there is no corpus and no profile — a new account, or a user who wants to state their voice
rather than have it inferred — run the interview: [references/brand-voice.md](references/brand-voice.md).
Prefer evidence over self-report where both exist: what someone publishes is a better record of
how they write than what they say about how they write.
