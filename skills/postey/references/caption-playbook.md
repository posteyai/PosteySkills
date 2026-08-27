# Caption Playbook

Part of the `postey` skill. Loaded on demand; see SKILL.md "Content Flows".

The shared rulebook every content flow cites. Read the universal rules before drafting;
consult the sibling references for platform specifics:

- `platform-archetypes.md`: per-platform caption structure, hashtags, lengths, CTA mapping
- `hook-formulas.md`: hook construction and quality gates
- `x-algorithm.md`: X ranking mechanics (public sources)
- `thread-and-video-formats.md`: thread, reel, carousel, and trend-content formats

## Universal Workflow Rules

These apply to every content task, on every platform.

1. **Verify connected platforms first.** Read `postey://accounts` (or call `get_accounts` if your client cannot read MCP resources) at the start of every session. Never assume a static platform list; platforms get connected and disconnected at any time. "All platforms" means the platforms currently connected to the target account, not a default set.
2. **Draft, never publish. Scheduling counts as publishing.** Create everything as a DRAFT. Publishing happens only after the user explicitly approves. A scheduled post publishes itself, so `schedule_post` is held to the same gate: propose times, schedule only after the user approves both content and times, with times at least 10 minutes in the future in UTC ISO-8601. First drafts are never final; present and wait for feedback.
3. **One caption per platform.** Never copy-paste the same text everywhere. Each connected platform gets a hand-crafted caption matching that platform's archetype (platform-archetypes.md). The idea carries across platforms; the voice and mechanics adapt.
4. **The transcript or source material is the seed, not the script.** Captions are written fresh in the platform voice, never copied verbatim from a transcript, brief, or source post.
5. **User instructions override archetypes.** If the user supplies a hook phrase, it becomes the literal first line, quirks and all. If the user says "short caption" or "3 punchy lines," obey literally: no CTA, no numbered sections, no hashtag block.
6. **Stay on the stated topic.** When the user narrows scope ("just write about X"), do not weave in adjacent products, campaigns, or topics you happen to know about.
7. **Verify and validate before presenting.** After creating a draft, fetch it back per platform: read `postey://posts/{id}/content/{platform}`, or call `get_post_content` if your client cannot read resources. Then check: caption present, media attached and correct, right account, right format (single post vs thread). Also run the `validate_post_content` tool per platform. Fix failures before presenting; never present a draft with known issues.
8. **Tag agent-created posts.** Apply a consistent agent tag (default `Agent`) to every post the agent creates, plus 2 or 3 topic tags. This lets the account owner filter agent-generated content later. `add_tag` is get-or-create by exact name, so reuse the same spelling every session (recent posts from `get_posts` show the names in use) so near-duplicate tags never accumulate.
9. **Freshness check before trend content.** Search the connected account's own recent posts before drafting news or trend content. Never repeat an angle the account already covered.
10. **End with the share link.** The final message contains the draft's share link, a one-line summary of platforms covered, and any flags worth knowing (e.g., video length affects placement). Never fabricate a share link; if one can't be generated, say so and point to the dashboard.
11. **Fact-check every claim.** Every stat, name, and number must trace to a source. Unverified claims get removed, not hedged.

## Pre-Upload Checklist (run on every draft)

- [ ] Connected platforms verified this session, not assumed
- [ ] First 2-3 lines pass the cold-read test
- [ ] Hook line under 10 words
- [ ] Zero em-dashes; no stacked period-rhythm; no banned buzzwords
- [ ] No branded mission-statement close; no engagement-bait close on long-form
- [ ] Platform limits respected (Threads <500, Bluesky <300, TikTok ~200 incl. hashtags, YT title ≤100; authoritative limits: `postey://platform-limits`)
- [ ] Hashtags per platform policy (X: 0, LinkedIn: 3-4, IG: 5-10, TikTok: 5-7, Threads: 0-2, Bluesky: 0-1)
- [ ] User-supplied hook preserved as the literal first line
- [ ] Every claim verified against a source
- [ ] Brand-profile banned topics and phrases respected
- [ ] Right voice mode (organic vs sponsored) with correct disclosure
- [ ] Media attached and verified per platform; placeholders flagged
- [ ] Draft status is DRAFT; share link ready to present
