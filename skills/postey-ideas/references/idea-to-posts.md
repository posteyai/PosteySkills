# Flow: Idea to Posts

Part of the `postey` skill. Loaded when the user brings one idea and wants it everywhere.

## When to run

The user gives a single rough idea, opinion, or announcement: "I have one idea: ...", "turn this
into posts," "make content out of this thought," "announce X across my platforms."

## Steps

1. **Check accounts.** Read `postey://accounts` (or call `get_accounts` if your client cannot read MCP resources). Note connected platforms and target account. Read the
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
5. **Create one draft.** `create_post` for the primary platform with its caption, then one `update_post` per remaining platform with that platform's caption, same `post_id` throughout (the "Different content per platform" sequence in SKILL.md). Never a separate draft per platform. Status stays DRAFT.
6. **Verify, tag, hand over.** Verify each platform (read
   `postey://posts/{id}/content/{platform}`, or call `get_post_content` if your client
   cannot read resources), apply the agent tag plus topic tags (reuse the exact tag names already
   in use; `add_tag` is get-or-create by name), then reply with the
   share link, the per-platform format list, and PROPOSED schedule times, spacing value posts
   before any promotional one.
7. **Schedule only after approval.** Once the user approves the times, call `schedule_post` with
   times at least 10 minutes in the future in UTC ISO-8601. A scheduled post publishes itself, so
   scheduling never happens before the user has approved both content and times. Never schedule
   two conversion-style posts back to back.

## Rules

- Resource-capable clients prefer `postey://` resources over the equivalent read tools (see SKILL.md routing).
- Draft only. Scheduling happens only after the user approves the proposed times; publishing only
  on explicit go.
- Run `validate_post_content` for each platform before presenting, per SKILL.md routing.
- A user-supplied hook or phrasing is the literal first line everywhere.
- One idea per draft. A second idea in the conversation becomes a second run of this flow.
- Stay on the stated idea; do not fold in adjacent products or campaigns you know about.

## Degradations

- Carousel wanted but no design tool: deliver the slide-by-slide outline in the caption body and
  say it needs design.
- One platform connected: one great post instead of a matrix, same checks.
