# Flow: Trends

Part of the `postey` skill. Loaded when the user wants content about what is happening now.

## When to run

The user asks "what should I post about today," "find something trending," "post about the news in
my niche," or wants a recurring daily/weekly content mix.

## Steps

1. **Check accounts and niche.** Read `postey://accounts` (or call `get_accounts` if your client cannot read MCP resources). Read the brand profile for the niche; if no
   profile exists, ask for the niche in one question (or run the brand-voice flow first).
2. **Freshness check.** Call `get_posts` for the account's recent posts. Note covered angles so
   nothing repeats. Never redraft an angle the account already posted.
3. **Scan the niche.** With your web tools, gather candidates across the five pillars described in
   `thread-and-video-formats.md`: video clips worth resharing commentary on, breaking news,
   industry drops, innovation showcases, leader stories. Apply the pillar rules strictly. The
   label BREAKING is reserved for events from roughly the last hour; older same-day news is an
   industry drop. A pillar with no strong candidate is skipped, never forced.
4. **Pick and pitch.** Choose the 3 to 5 strongest candidates. Present them as one-line pitches
   with pillar labels and let the user cut or keep before drafting. If the user said "just do it,"
   skip the pitch step and draft the top three.
5. **Draft.** Per-platform captions per `platform-archetypes.md`, hooks per `hook-formulas.md`,
   full checks from `caption-playbook.md`. Cite the source of every claim in the caption where the
   platform culture allows it, and put external links in the first reply on X, never the main post.
6. **Create, verify, tag.** One `create_post` per topic across connected platforms, DRAFT status,
   verify each platform via `get_specific_post_content`, agent tag plus a pillar tag plus topic
   tags (reuse existing tags; never create duplicates).
7. **Hand over.** Share links, one line per draft naming the pillar, and any skipped pillars with
   the reason.

## Rules

- Run `validate_post_content` for each platform before presenting, per SKILL.md routing.
- Resource-capable clients prefer `postey://` resources over the equivalent read tools (see SKILL.md routing).
- Draft only; scheduling or publishing needs the user's explicit instruction.
- Every stat, name, and quote traces to a source found in step 3. Unverifiable claims are dropped.
- Respect the brand profile's banned topics without naming why a topic is banned.

## Degradations

- No web access: say so, and offer evergreen angles from the brand profile's pillars instead of
  trend content. Do not fake recency.
- No brand profile and the user will not give a niche: default to broadly useful industry-neutral
  angles and say the targeting is generic.
