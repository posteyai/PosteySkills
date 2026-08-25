# MCP Workflows — Sequencing, Etiquette and Judgment

This file is the new home for guidance that used to live in the **MCP server's instruction
block** — the text every MCP client receives on every request. It was 22,457 characters, and
most of it was craft: what order to call things in, when to ask the user, which media path to
take, how to phrase a caption. None of that is contract, so none of it needed to be paid for on
every request. It moved here, where it loads only when you are actually doing the work
(mcp-ax S9.7).

**What stayed on the server** and is therefore *not* repeated here: rate limits, permission
levels, the response envelope and its error codes, the post lifecycle, and the resource-first
rule. Read those from the server's instructions.

**What never belonged in either place:** character limits, media caps, cardinality. Those live
in `postey://platform-limits` and `postey://platforms/{platform}/rules`. Never hardcode one —
a limit copied is a limit that drifts, which is how this skill once told users that Facebook and
Pinterest did not exist.

---

## Create and Publish

The default sequence for a new post. Steps 2 and 5 are the ones agents skip; both exist because
the failure they prevent is invisible until after publication.

1. **Resolve the account** — read `postey://accounts`. See
   [Account Selection](../SKILL.md#account-selection) for the etiquette; it is not optional even
   when there is only one account.
2. **Get writing guidance** — the `compose-post` prompt, or the caption references
   ([caption-playbook.md](caption-playbook.md), [hook-formulas.md](hook-formulas.md)).
3. **Create the draft** — `create_post`. Returns `post_id`.
   - Multi-platform goes in **one** call via `additional_platforms`, each platform carrying its
     own hand-written content. See
     [Publishing to Multiple Platforms](../SKILL.md#publishing-to-multiple-platforms).
4. **Tag it** — see [Tagging](#tagging) below. Needs ADMIN on the account; skip it if you only
   have WRITE or PUBLISH.
5. **Validate** — `validate_post_content`, once per target platform.
   - Pass `account_id`. It is what selects the account's real limit rather than the default one;
     on X the two tiers differ by two orders of magnitude, so validating without it can pass
     content the platform will reject.
6. **Publish or schedule** — `publish_draft` or `schedule_post`, only after the user says yes in
   the current turn. Scheduling counts as publishing.

## Updating a Draft

1. `get_posts(account_id, social=<PLATFORM>, status=DRAFT)` to find it.
2. Read `postey://posts/{post_id}/content/{platform}` to see what is there now.
3. `update_post(post_id, ...)`.

**Partial updates are safe.** Send only the fields you are changing. Omitted media, `post_type`
and platform config fields are preserved from the existing post — you do not need to re-send the
whole post. Pass `media_urls=[]` to actually remove media, which is different from omitting it.

**Two exceptions.** YouTube and Pinterest each require their title field on *every* call
(`contents[0].youtube_title`, `contents[0].pinterest_title`), and allow exactly one content item.
The server refuses the call and names the field if you forget, so this is a convenience note, not
a rule you have to remember.

## Repurposing Across Platforms

`convert_post_content` auto-adapts existing content. **Use it only when the user explicitly asks
for that** — "convert this to LinkedIn", "adapt it for Bluesky". It rewrites, and rewriting loses
intentional formatting.

It is *not* the way to do multi-platform creation. For that, write each platform's caption
yourself in the `create_post` / `update_post` flow above.

When you do convert:

1. Read `postey://posts/{post_id}/content/{source_platform}`.
2. `convert_post_content(post_id, source_platform, target_platforms=[...])` — this attaches the
   targets to the **same** `post_id`. Do not call `create_post` for them.
3. `validate_post_content` per target.
4. `update_post` per target to refine what was generated.

## Attaching Media

Four ways in, and the right one depends on where the bytes are and what your client is:

| You have | Use | Notes |
|---|---|---|
| A public URL | `upload_media(source_type='url')` | Works everywhere, including the hosted server |
| A small inline file | `upload_media(source_type='base64')` | Small files only; the cap is on the tool's description |
| A file on the user's machine, any client | `file_manager()` then `list_files()` | Opens a drag-and-drop widget; bytes go straight to the CDN and never enter your context |
| A local path, CLI available | `upload_media(source_type='local_path')` | Needs this skill installed **and** API-key auth. Not available on the hosted server or to OAuth clients |

Sequence, whichever you pick: upload first, take `cdn_url` from the response, then pass it in
`contents[].media_urls` on `create_post` / `update_post`. A media URL is not valid until its
upload succeeds, and there is never a reason to construct one by hand.

**Prefer `file_manager` over `local_path`** for a file on the user's machine. It works for OAuth
clients and on the hosted server, which `local_path` does not.

**Do not use `read_file` to fetch media bytes.** It returns metadata and the `cdn_url` by design.
Media does not belong in a context window.

## Local Files and Large Uploads

The table above assumes this skill is installed. It often is not, and the difference is not
cosmetic: **the MCP server cannot see the user's disk.** Every path that reads a local file is the
CLI's, and the CLI ships with this skill. Work out which side of that line you are on before you
promise the user an upload.

| Path | Needs this skill | What it is for |
|---|---|---|
| `upload_media(source_type='url')` | no | A public URL, fetched server-side. Works everywhere, including the hosted server |
| `upload_media(source_type='base64')` | no | Inline bytes, small files only — the cap is on the tool's own description |
| `file_manager()` then `list_files()` | no | A file on the user's machine, any client. Drag-and-drop; the bytes go straight to the CDN and never enter your context |
| `upload_media(source_type='local_path')` | **yes** | A local path read directly. Also needs API-key auth, so it is unavailable to OAuth clients and on the hosted server |
| `media:upload` above 50 MB | **yes** | The CLI switches to the chunked path on its own — init, parallel chunks with retry, complete. There is no MCP equivalent |
| `video transcribe` on a local file | **yes** | Runs ffmpeg on the user's machine |

**Without the skill, `file_manager` is the answer for a local file** — not an apology. It reaches
every client, it works on the hosted server, and it is the only credential-agnostic path that takes
a file too large to inline. `upload_media` with `url` or `base64` covers the rest.

Only the last three rows are a reason to install anything:

```
npx skills add posteyai/skills
```

Never ask the user to paste a large file's contents, and never reach for `read_file` to get media
bytes when a path is missing. It returns metadata and the `cdn_url` by design.

## Video: Choosing a Path

Three paths. Pick on what you have, not on what is fastest.

| You have | Path | How |
|---|---|---|
| Video **and** a finished caption | **A** | `postey.js video post` — upload, cover-frame extraction, chunked upload for large files, then draft. See [video-workflow.md](../video-workflow.md#workflow-a--upload-video--create-draft) |
| A video **URL**, no caption | **B** | `postey.js video transcribe` where the CLI runs; connector-only clients use the `transcribe_video` MCP tool. Then generate captions per platform, then `create_post` |
| A **local** video, no caption | **C** | The `local-video-multiplatform` flow — Whisper transcription, thumbnail extraction, per-platform captions, draft |

**Default when the user gives you a video and no caption: B or C, never "ask them to write one".**
Transcribe first. Then write captions from the transcript — and never paste a raw transcript in as
a caption; it reads like a transcript.

Paths A and C need this skill installed locally (`npx skills add posteyai/skills`) plus its
prerequisites. Path B's MCP tool works without it.

Full command reference: [video-workflow.md](../video-workflow.md).

## Tagging

Add **2–3 tags** after creating a post, and reuse before you invent:

1. Read the account's existing tags — `postey://accounts/{account_id}/tags`.
2. Reuse the exact existing **name** when one matches. Names are case-sensitive: `Marketing` and
   `marketing` are two different tags, so match the casing the user uses.
3. Only pass a new tag spec for a genuinely new name.

Tags are passed as specs (`{tag, color, account_id}`) — there is no `tag_id` on the request. The
server enforces uniqueness per account and reuses via get-or-create, so passing a duplicate spec
returns the existing tag rather than creating a row. That means duplicates are *not* dangerous —
but near-duplicates are, because `Marketing` and `marketing` are both "unique" and the account
ends up with both. Consistency is yours to keep, not the server's.

`add_tag` needs ADMIN on the account. `remove_tag` undoes a mis-tag.

## Platform-Specific Asks

Some fields cannot be guessed, and guessing them produces a post the user did not want rather
than an error they can see. Ask, every time:

- **Instagram** — ask for `post_type` before creating or updating. Never assume `FEED`. The
  choice between feed, reel and story changes the aspect ratio, the duration budget and whether
  text is allowed at all.
- **TikTok** — confirm the post type before creating, even though there is only one supported
  value today.
- **YouTube** — ask for the video title. It is required, it cannot be empty, and it is not the
  caption. Omit the description unless the user wants one.
- **Pinterest** — ask for the Pin title, and for the destination link if the Pin should link out.

The exact allowed values and limits for each of these are in
`postey://platforms/{platform}/rules`. Read them; do not carry them in your head or in this file.
