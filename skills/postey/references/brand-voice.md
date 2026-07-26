# Flow: Brand Voice

Part of the `postey` skill. Loaded when the user wants content in their own voice.

## When to run

The user shares a website, an Instagram/X/LinkedIn handle, or says things like "learn my voice,"
"write like me," "draft content for my brand," or asks for a batch of content without giving a
topic. Also run this first when another flow needs a voice and no brand profile exists yet.

## Steps

1. **Check accounts.** Read `postey://accounts` (or call `get_accounts` if your client cannot read MCP resources). Note the connected platforms and the target account.
   If nothing is connected, tell the user to connect a platform in Postey first and stop.
2. **Research the brand.** Using your web tools, read the given website or the public profile and
   recent posts of the given handle. Look for: what they write about, how they talk, who follows
   them, what performs. If you have no web access, ask the user five short questions instead
   (niche, audience, three adjectives for their voice, favorite post they wrote, topics to avoid).
3. **Fill the profile.** Complete every field in `brand-profile-template.md`. Store the finished
   profile in your own persistence (memory, project knowledge, or saved file) so future sessions
   skip straight to drafting.
4. **Confirm the voice.** Show the user three sample hooks in the proposed voice, per
   `hook-formulas.md`. Adjust the profile from their reaction before drafting anything long.
5. **Draft the batch.** Write 5 to 7 drafts across the profile's content pillars. Every caption is
   platform-specific: follow `platform-archetypes.md` and run the checks in `caption-playbook.md`.
6. **Create in Postey.** Per topic: `create_post` for the primary platform with its caption, then one `update_post` per remaining platform with that platform's caption, same `post_id` throughout (the "Different content per platform" sequence in SKILL.md). Never a separate draft per platform. Status stays DRAFT.
   Upload any media first with `upload_media`.
7. **Verify and tag.** Fetch each platform's content back (read
   `postey://posts/{id}/content/{platform}`, or call `get_specific_post_content` if your client
   cannot read resources) and fix anything missing. Apply the agent tag plus 2 or 3 topic tags,
   reusing the exact tag names already in use (`add_tag` is get-or-create by name).
8. **Hand over.** Reply with the share link for each draft, one line on what each covers, and an
   offer to adjust voice or schedule the batch.

## Rules

- Run `validate_post_content` for each platform before presenting, per SKILL.md routing.
- Resource-capable clients prefer `postey://` resources over the equivalent read tools (see SKILL.md routing).
- Draft only. Never publish or schedule without the user's explicit instruction.
- The profile's banned topics and banned phrases override everything else.
- If the user supplies a hook or phrasing, use it verbatim as the first line.
- Stay inside the researched niche. Do not invent offers, prices, or claims not found in research.

## Degradations

- No web access: build the profile from the five questions in step 2.
- One platform connected: draft for that platform only, still verified and tagged.
- User declines the sample-hooks check: proceed, but say the voice is unconfirmed.
