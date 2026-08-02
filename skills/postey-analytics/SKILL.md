---
name: postey-analytics
version: 1.0.0
description: >
  Read what a post or an account actually did, say what the numbers support, and
  turn that into the next content decision. Includes the checks that stop a
  number being read as a result when it is not one.
when_to_use: >
  Use when the user asks how a post did, what worked last month, which content to
  make more of, why reach dropped, or wants performance turned into a
  recommendation rather than a dashboard.

requires:
  - postey

capabilities:
  owns:
    - analytics.overview
    - analytics.top_posts
    - post.analytics
  reads:
    - post.list
    - post.read
  prompts:
    - analyze-engagement

mcp-tools:
  resources:
    - postey://accounts
    - postey://accounts/{account_id}/analytics
    - postey://accounts/{account_id}/analytics/posts
    - postey://posts/{post_id}/analytics
    - postey://posts/{post_id}/content/{platform}
  tools:
    # GENERATED from capabilities: by scripts/gen-mcp-tools.js — do not hand-edit.
    - get_posts
    # Fallbacks only: each is superseded by a postey:// resource this skill
    # declares. Use them when the client cannot read MCP resources.
    - get_specific_post_content
  prompts:
    - analyze-engagement

routing:
  read-only-state: mcp-resource > mcp-tool
  analytics:       mcp-resource
  fallback:        mcp-tool
---

# Postey Analytics

Reading numbers is easy. Saying what they support, and refusing to say more, is the job.

## Check the data is real before interpreting it

**Do this first, every time.** Platform analytics arrive partial, delayed, or absent, and a
confident reading of a broken feed is worse than saying nothing.

| Symptom | What it means | What to say |
|---|---|---|
| every metric is `0` across all posts on a platform | the feed is not returning, or the platform never provided it | say the platform reports nothing; do not rank by it |
| impressions present, engagement all `0` | partial fetch | use impressions only, and name the limitation |
| one post has numbers, its siblings do not | the others have not been fetched yet | compare only the ones that have data |
| `fetch_count` is 0 | never collected | not "zero performance" — no data at all |

**Zero is not a result.** On a real account checked during development, every LinkedIn post
reported zero impressions while the same content on X reported between 481 and 2,935. Ranking that
account's LinkedIn posts would have produced a confident ordering of nothing.

## What the numbers can and cannot support

They **can** support: this post got more reach than that one; this format appears more often near
the top; this account's median engagement moved after a change.

They **cannot** support: why. Attribution needs a controlled comparison that social platforms do
not give you. Say "these three of your top five were lists" — not "lists perform better for you",
which is a causal claim from five data points.

Three traps worth naming out loud when they apply:

- **Survivorship.** Top posts are top by definition. Look at the bottom too, or every conclusion
  is "do more of what already worked".
- **Sample size.** Under ~10 posts with real data, report observations, not patterns.
- **Time confounds.** A post published during a spike in following did not earn that reach on
  content alone.

## Turning it into a decision

The output is a recommendation the user can act on this week, with its evidence attached:

```
Observation   4 of your 5 highest-reach posts on X opened with a question.
Evidence      posts 6016, 6028, 6017, 5994 (481–2,935 impressions)
Caveat        5 posts, one platform, one month
Recommendation  Try a question opener on the next three X posts and compare.
```

Never emit a recommendation without its caveat. The caveat is what makes it honest, and it is what
stops the next session treating a hunch as an established fact.

Hand recurring findings to `postey-voice` if it is installed: a consistent structural habit among
top posts is exactly the kind of observation its rules ledger can accumulate evidence for. Do not
write to its ledger from here — say what you found and let the user decide.

## Scope

Per-post numbers: `postey://posts/{post_id}/analytics`. Account roll-up:
`postey://accounts/{account_id}/analytics`. Ranked posts:
`postey://accounts/{account_id}/analytics/posts`.

Whether a post **published at all** is not this skill's question — that is `postey-ops` and
`post.publish_status`. A post that never went out has no performance to explain, and confusing the
two produces a very confident analysis of a post that does not exist.
