# Voice Profile Schema

**Extends, does not replace, the hub's `brand-profile-template.md`.** That file is the schema every
flow reads before drafting, and it stays in `postey` for exactly that reason. This document adds the
fields that only make sense once a voice has been *observed* rather than stated.

Keep one profile per brand or creator. Store it client-side — memory, project knowledge, or a file
the user keeps. It is user content: never committed, never logged, never sent anywhere.

## The stated half — from `brand-profile-template.md`

Its six sections are filled by the interview flow ([references/brand-voice.md](references/brand-voice.md))
or by the user directly. Do not restate them here; read them from the hub.

## The observed half — added by this pack

```
observed:
  corpus:
    accounts:      [317]
    posts_read:    48
    window:        2026-02-01 .. 2026-08-01
    last_pass:     2026-08-02
    weighted_by:   analytics.top_posts     # or: none, if analytics were unavailable

  features:
    - feature: "sentence length"
      value:   "median 14 words; rarely above 25"
      from:    [1180, 1194, 1207]
    - feature: "openers"
      value:   "states a claim; almost never a greeting"
      from:    [1180, 1211, 1231]
    - feature: "emoji rate"
      value:   "0 on LINKEDIN, ~1 per post on INSTAGRAM"
      from:    [1194, 1226]
```

Every feature carries `from`. A feature with no post IDs behind it is a guess, and it must not be
recorded here — it will be treated as evidence later, by a session that cannot tell the difference.

## Conflict between the stated and the observed

State the conflict to the user; do not silently pick.

> Your profile says "no emoji", but 9 of your last 12 Instagram posts used one. Should I follow the
> posts, or keep the rule?

The observed half is a better record of how someone writes than the stated half — people describe
their own voice inaccurately. But it is *their* brand, and a deliberate change of direction looks
exactly like a contradiction from the outside. Only the user can tell those apart.

## Freshness

A corpus pass older than 90 days is stale: say so before relying on it, and offer to re-run. Voices
drift, and a profile that silently ages becomes a confident description of who the user used to be.
