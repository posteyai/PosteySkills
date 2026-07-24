# Flow: Idea to Posts

Part of the `postey` skill. Loaded when the user brings one idea and wants it everywhere.

## When to run

The user gives a single rough idea, opinion, or announcement: "I have one idea: ...", "turn this
into posts," "make content out of this thought," "announce X across my platforms."

## Steps

1. **Check accounts.** Call `get_accounts`. Note connected platforms and target account. Read the
   brand profile if one exists.
2. **Sharpen the idea.** Restate the idea as one claim with stakes: who it matters to and why now.
   If the idea is too vague to claim anything, ask exactly one clarifying question.
3. **Choose formats per platform.** Using `platform-archetypes.md` and the format guides in
   `thread-and-video-formats.md`: a long-form post or thread for X (thread only if the idea
   genuinely has 6 or more distinct beats), an operator how-to for LinkedIn, a carousel outline or
   single caption for Instagram, compressed versions for Threads and Bluesky, a short native hook
   for TikTok if connected. The idea carries across platforms; the shape adapts.
4. **Write.** Hooks per `hook-formulas.md` (write 10, keep the best). Full checks from
   `caption-playbook.md`. Media: propose what visual would carry each platform and mark missing
   media clearly in the draft body as [ATTACH: description] so the user can supply it.
5. **Create one draft.** A single `create_post` across connected platforms via
   `additional_platforms`, DRAFT status.
6. **Schedule if asked.** When the user wants the batch spread out, use `schedule_post` with times
   at least 10 minutes in the future in UTC ISO-8601, spacing value posts before any promotional
   one. Never schedule two conversion-style posts back to back.
7. **Verify, tag, hand over.** Verify each platform via `get_specific_post_content`, apply agent
   tag plus topic tags, then reply with the share link, the per-platform format list, and proposed
   schedule times for approval.

## Rules

- Draft only. Scheduling happens only when the user asked for it; publishing only on explicit go.
- A user-supplied hook or phrasing is the literal first line everywhere.
- One idea per draft. A second idea in the conversation becomes a second run of this flow.
- Stay on the stated idea; do not fold in adjacent products or campaigns you know about.

## Degradations

- Carousel wanted but no design tool: deliver the slide-by-slide outline in the caption body and
  say it needs design.
- One platform connected: one great post instead of a matrix, same checks.
