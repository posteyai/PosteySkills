# Rules Ledger

What the skill has learned about how this user writes, and the evidence for each claim. Separate
from the profile: the profile says who the brand is, the ledger says what has been observed.

## Why rules carry evidence

A rule with no evidence count cannot be demoted, and a skill that cannot demote a rule will
eventually be confidently wrong. One grumpy rejection becoming a permanent law is the main way a
learning loop goes bad. Thresholds exist to stop that.

## The ledger is JSON

`scripts/voice.js` reads it, so it is JSON rather than the prose format this document first sketched.
An agent writes JSON reliably; a script parses it without a dependency. One file holds the corpus,
the features, and both kinds of observation:

```json
{
  "corpus":   { "documents": 48, "scopes": ["LINKEDIN"], "window": ["2026-02-01", "2026-08-01"] },
  "features": [ { "feature": "emoji rate", "value": "0 per post", "from": [1180, 1194] } ],
  "observations":         [ { "rule": "no emoji", "scope": "all", "post_id": 1180, "supports": true, "ts": "2026-07-11T00:00:00Z" } ],
  "verdict_observations": [ { "rule": "no em-dashes", "scope": "all", "post_id": 1231, "supports": true, "ts": "2026-07-30T00:00:00Z" } ]
}
```

`observations` come from `voice.js ingest`. `verdict_observations` are what you append by hand as
drafts get their outcomes. `compile` merges the two, so corpus evidence and live corrections promote
the same rules.

## Verdict ledger

One entry per draft the agent produced. Written at draft time, completed at outcome. Keep the raw
verdicts alongside the observations you derive from them — the diff is the thing worth re-reading.

```json
{
  "post_id": 1234,
  "platform": "LINKEDIN",
  "drafted": "<the exact text the agent proposed>",
  "ts": "2026-08-02T11:04:00Z",
  "verdict": "published_edited",
  "published": "<the exact text that actually went out>",
  "delta": "removed two em-dashes; cut the closing CTA"
}
```

A `published_edited` verdict whose delta removed em-dashes becomes
`{"rule": "no em-dashes", "supports": true, "post_id": 1234, "ts": "…"}` in
`verdict_observations`. Deciding what a delta means is judgement and stays with you; counting the
evidence afterwards is arithmetic and belongs to the script.

| Verdict | Meaning | Strength |
|---|---|---|
| `published_verbatim` | went out exactly as drafted | strong positive |
| `published_edited` | went out changed — **record the diff** | strongest signal available |
| `rejected` | discarded; record the reason in the user's words | strong negative |
| `abandoned` | drafted, never acted on | weak — do not promote rules from this alone |

`rejected` reasons come from two places: an internal comment on the post
(`postey://posts/{post_id}/comments/{platform}`), or what the user said in the session. The
second is usually more specific. Record it verbatim; paraphrasing loses the signal.

## Rules — the compiler's output

You do not hand-write these. `voice.js compile` emits them:

```json
{ "rule": "no em-dashes", "scope": "all", "status": "active", "evidence": 4,
  "total_observations": 4, "contradictions": 0,
  "first_seen": "2026-07-11T00:00:00Z", "confirmed": "2026-07-30T00:00:00Z",
  "from": [1180, 1194, 1207, 1231] }
```

`from` carries the post IDs behind the current run. A rule that cannot name its evidence is not a
rule. `evidence` counts the run since the last contradiction; `total_observations` keeps the whole
history, so a demoted rule does not lose its past.

## Thresholds

| Transition | Trigger |
|---|---|
| new → `candidate` | first observation |
| `candidate` → `active` | **3 consistent observations**, no contradiction |
| `active` → `candidate` | **one clear contradiction** — the user did the opposite deliberately |
| any → `stale` | **90 days** with no confirming observation |
| `stale` → `active` | one fresh confirmation |

Demotion is deliberately faster than promotion. Being slow to learn is a small cost; being slow to
unlearn is what makes an assistant annoying.

Only `active` rules constrain drafting. `candidate` rules may be mentioned to the user as
questions ("you've cut the closing CTA twice — should I stop adding them?"), never applied
silently. `stale` rules are neither applied nor mentioned, only retained as history.

## Scope

`all`, or a platform name. A habit observed only on LinkedIn must not be applied to X: the
per-platform archetypes in the hub's `platform-archetypes.md` already say these voices differ, and
a cross-applied rule will fight them.

## What never becomes a rule

- **Anything that contradicts a platform limit.** Limits come from `postey://platform-limits`.
  The limit wins; note the rule as inapplicable on that platform rather than deleting it.
- **One-off corrections tied to a specific post.** "Change 40% to 38%" is a fact about that post,
  not a fact about the voice.
- **Anything inferred from `abandoned` alone.** A draft nobody acted on says nothing.
