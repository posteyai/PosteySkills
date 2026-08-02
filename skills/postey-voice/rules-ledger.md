# Rules Ledger

What the skill has learned about how this user writes, and the evidence for each claim. Separate
from the profile: the profile says who the brand is, the ledger says what has been observed.

## Why rules carry evidence

A rule with no evidence count cannot be demoted, and a skill that cannot demote a rule will
eventually be confidently wrong. One grumpy rejection becoming a permanent law is the main way a
learning loop goes bad. Thresholds exist to stop that.

## Verdict ledger

One entry per draft the agent produced. Written at draft time, completed at outcome.

```
- post_id: 1234
  platform: LINKEDIN
  drafted: "<the exact text the agent proposed>"
  ts: 2026-08-02T11:04:00Z
  verdict: published_edited
  published: "<the exact text that actually went out>"
  delta: removed two em-dashes; cut the closing CTA
```

| Verdict | Meaning | Strength |
|---|---|---|
| `published_verbatim` | went out exactly as drafted | strong positive |
| `published_edited` | went out changed — **record the diff** | strongest signal available |
| `rejected` | discarded; record the reason in the user's words | strong negative |
| `abandoned` | drafted, never acted on | weak — do not promote rules from this alone |

`rejected` reasons come from two places: an internal comment on the post
(`postey://posts/{post_id}/comments/{platform}`), or what the user said in the session. The
second is usually more specific. Record it verbatim; paraphrasing loses the signal.

## Rules

```
- rule: "no em-dashes"
  scope: all
  evidence: 4          # 4 edits removed them
  first_seen: 2026-07-11
  confirmed: 2026-07-30
  status: active
  from: [1180, 1194, 1207, 1231]

- rule: "opens with a question"
  scope: LINKEDIN
  evidence: 2
  first_seen: 2026-07-28
  confirmed: 2026-07-28
  status: candidate
  from: [1219, 1226]
```

`from` carries the post IDs. A rule that cannot name its evidence is not a rule.

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
