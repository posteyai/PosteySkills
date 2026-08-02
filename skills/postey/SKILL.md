---
name: postey
version: 2.5.0
# No `platforms:` list. The platform set lives on the server and is mirrored into
# capability-snapshot.json by scripts/refresh-capability-snapshot.js. A copy here
# would be a fourth hand-maintained list agreeing with the other three and with
# nothing that ships (S9.5).
description: >
  Create, schedule, and manage social media posts via Postey across X, LinkedIn,
  Instagram, TikTok, YouTube, Threads, Bluesky, Facebook, and Pinterest. Handles video/reel workflows:
  transcribe any video URL and cross-post, or use `video post` for single-command
  upload with auto cover thumbnail.
when_to_use: >
  Use when asked to: draft a tweet, post to LinkedIn, create a thread, schedule
  content, publish a post, check scheduled or published posts, upload a video to
  Instagram/TikTok/YouTube, cross-post to multiple platforms, manage social drafts,
  generate captions from a video URL, or any social media publishing task.
allowed-tools:
  - Bash(${CLAUDE_SKILL_DIR}/scripts/postey.js:*)
mcp-tools:
  resources:
    - postey://accounts
    - postey://teams
    - postey://posts/{post_id}/content/{platform}
    - postey://platform-limits
    - postey://platforms/{platform}/rules
    - postey://posts/{post_id}/analytics
    - postey://accounts/{account_id}
    - postey://teams/{team_id}/members
    - postey://skill-manifest
  tools:
    # GENERATED from capabilities: by scripts/gen-mcp-tools.js — do not hand-edit.
    - add_tag
    - connect_account
    - convert_post_content
    - create_post
    - delete_draft
    - file_manager
    - get_posts
    - get_schedule
    - list_files
    - publish_draft
    - read_file
    - remove_tag
    - review_post_content_and_add_comments_for_virality
    - schedule_post
    - transcribe_video
    - unschedule_post
    - update_post
    - update_schedule
    - upload_media
    - validate_post_content
    # Fallbacks only: each is superseded by a postey:// resource this skill
    # declares. Use them when the client cannot read MCP resources.
    - get_accounts
    - get_specific_post_content
  prompts:
    - compose-post
    - review-for-virality
    - repurpose-content
    - improve-post
    - analyze-engagement
    - generate-captions-from-transcript
    - generate-captions-batch
# Capability-keyed ownership. Keys are `canonical` entries from
# capability-snapshot.json — the server's vocabulary, never raw tool names, so this
# cannot drift into a second hand-kept list (S9.5). `owns` is exclusive: exactly one
# skill may own a key. `reads` is shared. Contract: docs/skills-mcp-contract.md.
#
# Keys absent here are owned by NO skill yet and are tracked as unclaimed until the
# pillar that covers them ships: analytics.*, post.analytics, comment.*, team.*,
# automation.list, schedule.auto_dm, notification.list, post.publish_status,
# post.resolve. Claiming a capability the skill does not actually document would
# defeat the coverage check.
capabilities:
  owns:
    # Accounts, platform truth, setup — the hub's operations layer
    - account.connect
    - account.list
    - account.read
    - account.tags
    - platform.limits
    - platform.rules
    - server.manifest
    - setup.read
    # Authoring and the post lifecycle
    - post.create
    - post.read
    - post.list
    - post.update
    - post.delete
    - post.convert
    - post.review
    - post.validate
    - post.tag.add
    - post.tag.remove
    - publish.now
    - schedule.create
    - schedule.read
    - schedule.update
    - schedule.delete
    # Media and local files (the only capability the CLI may hold)
    - media.upload
    - media.transcribe
    - file.list
    - file.read
    - file.upload
  reads:
  prompts:
    - compose-post
    - review-for-virality

# Machine-readable routing rules (mirrors routing-guide.md; used by CI and agents).
# Values: a single path, or "primary > fallback" — use the fallback only when
# your client lacks the primary capability (cannot read MCP resources, or has
# no CLI/shell). Paths: mcp-resource | mcp-tool | cli
routing:
  read-only-state:     mcp-resource > mcp-tool  # postey://... resources; resource-blind clients use get_* read tools
  platform-limits:     mcp-resource  # postey://platform-limits / postey://platforms/{p}/rules
  analytics:           mcp-resource  # postey://posts/{id}/analytics
  validation:          mcp-tool      # validate_post_content (no CLI equivalent)
  virality-review:     mcp-tool      # review_post_content_and_add_comments_for_virality
  comment-read:        mcp-tool      # get_platform_comments / get_internal_comments
  convert-content:     mcp-tool      # convert_post_content
  write-post:          mcp-tool      # create/update/publish/schedule/delete → MCP tools, in EVERY environment
  local-file:          cli           # any local path → unconditional CLI (video post); the write that follows is still mcp-tool
  video-transcription: cli > mcp-tool  # postey.js video transcribe; connector-only clients use transcribe_video
  fallback:            mcp-tool      # unknown operations → MCP; the CLI only holds local-machine commands
---

# Postey Skill

Create, schedule, and publish social media content across multiple platforms using [Postey](https://postey.ai).

## Capability Comes From the Server, Not From This File

`postey://skill-manifest` describes the live surface — every tool, resource, prompt and platform
the server actually serves. **When what you need is not obvious, read it rather than guessing from
this document.** Each tool entry carries three fields that settle routing on their own:

| Field | Meaning |
|-------|---------|
| `capability` | What the tool is *for*, as `noun.verb` (`post.create`, `account.list`) |
| `canonical` | `true` = the intended way to reach that capability |
| `superseded_by` | On a non-canonical tool, the URI or tool you should call instead |

**The rule: reach a capability through its canonical provider.** If `superseded_by` is set, follow
it — that field is why you do not need to parse `[FALLBACK ONLY — READ … INSTEAD]` out of a
description. Where a resource and a tool serve one capability, the resource is canonical.

The one exception is a client that cannot read MCP resources. Then the superseded tool is correct
precisely because the canonical provider is unreachable — that is what the fallbacks are for.

`capability-snapshot.json` in this directory is the same data, captured offline for the CLI and CI.
Read the live resource when you can; the snapshot is a mirror, and a mirror can be one deploy stale.

## Tool Routing — Read Before Any Tool Call

Two surfaces exist — MCP tools/resources and the CLI (`postey.js`) — and they are layers, not
alternatives. MCP owns every read and **every write**. The CLI owns only what needs the user's
machine, and it has no write command: its local-file commands upload and hand back the fields for
an MCP write. A workflow uses whichever surface owns each step.

An installed skill is not a working setup. This file loads from disk whether or not the server is
reachable. If the Postey tools are absent from your session, stop and say so. There is no command
here that reaches Postey state, so looking for one wastes the user's time.

### Decision Tree

1. **Local file path involved** (`~/video.mp4`, `./cover.jpg`)?
   → **CLI only** — MCP cannot access the local filesystem.

2. **Video transcription** (yt-dlp + Whisper)?
   → **`node ${CLAUDE_SKILL_DIR}/scripts/postey.js video transcribe <url>`** — preferred wherever
   the CLI runs. Connector-only clients (no CLI) use the `transcribe_video` MCP tool instead.

3. **Read-only state** (accounts, teams, post content)?
   → **MCP resource** — fast, cached, no subprocess:
   - Accounts → `postey://accounts`
   - Teams → `postey://teams`
   - Post content → `postey://posts/{id}/content/{platform}`
   - Prefer a resource URI over the equivalent read tool (e.g. `postey://accounts` over
     `get_accounts`) whenever your client can read MCP resources; resource-blind clients (many
     hosted connectors) use the tools. Reads with no resource equivalent (post listings →
     `get_posts`) always use the tool.

4. **Content validation or virality review** before publishing?
   → **MCP tools** — `validate_post_content`, `review_post_content_and_add_comments_for_virality` — no CLI equivalent; do not skip these in any MCP-capable session.

5. **All other writes** (create, update, publish, schedule, delete, tag, upload by URL)?
   → **MCP tools, in every environment** — `create_post`, `update_post`, `publish_draft`, `schedule_post`, `delete_draft`.
   → There is no second path. Where no MCP server is reachable the write cannot be done at all —
   say so and stop; do not reach for a CLI command that does not exist.

### Routing Table

| Trigger | Tool | Reason |
|---------|------|--------|
| `--file <local-path>` or `--video <local-path>` | CLI only (`video post`) | MCP has no filesystem access |
| Video transcription workflow | CLI preferred; `transcribe_video` MCP tool for connector-only clients | Local pipeline needs yt-dlp, ffmpeg, Whisper |
| Read accounts / teams / post content | MCP resource | Cached, no subprocess overhead |
| Validate content before posting | MCP tool | No CLI equivalent |
| Virality review | MCP tool | No CLI equivalent |
| Create / update / publish / schedule / delete | MCP tool | `create_post`, `update_post`, `publish_draft`, `schedule_post`, `delete_draft` |
| Get single draft content | MCP | `postey://posts/{id}/content/{platform}`, or `get_specific_post_content` |
| Cursor, SDK agent, CI/CD environment | Same as above — unchanged | The environment decides whether the CLI is *available*, never who owns the operation |

### Anti-Patterns

- **Never** call `get_accounts` when your client can read MCP resources — read `postey://accounts` instead. Resource-blind clients (many hosted connectors) may use the tool.
- **Never** call `upload_media` for a local file — it accepts URLs only.
- **Never** skip `validate_post_content` / `review_post_content_and_add_comments_for_virality` in any MCP-capable session.
- **Never** use CLI `drafts:create` / `drafts:publish` / `drafts:schedule` — these commands are removed; use MCP tools. The same holds in CI/CD, Cursor, Windsurf and SDK agents: without an MCP server there is no write path, not a CLI one.
- **Never** call REST endpoints directly (e.g. `GET /accounts`) — always use MCP resources or tools.
- **Never** guess or invent an `account_id` — always read the accounts (`postey://accounts`, or `get_accounts` for resource-blind clients) and confirm with the user.
- **Never** run `postey.js accounts:list` — that command does not exist; read `postey://accounts` (or call `get_accounts`).

---

## Setup

1. **API Key** — Get your key at https://app.postey.ai/?settings=api, then:
   ```bash
   ${CLAUDE_SKILL_DIR}/scripts/postey.js setup
   ```
   Or set env var: `export POSTEY_API_KEY=your_key`

2. **Requirements** — Node.js 18+. No other dependencies for the core CLI.

**Config priority** (highest to lowest):
1. `POSTEY_API_KEY` environment variable
2. `POSTEY_AUTH_TOKEN` environment variable — a bearer token the MCP server sets when it runs this
   CLI for an OAuth-authenticated caller. Not something you set by hand.
3. OAuth session from `postey.js auth:login`
4. `./.postey/config.json` (project-local)
5. `~/.config/postey/config.json` (user-global)

### When "API key not found" appears

Tell the user to run the setup command interactively — you cannot run it on their behalf. **Stop and wait** for them to confirm setup before proceeding. Do not attempt to find credentials in keychains, `.env` files, or config directories.

## Account Selection

Before any write operation, Claude **must** know which account to target. Follow this sequence every time:

1. **Read `postey://accounts`** — call the `get_accounts` tool only if your client cannot read
   MCP resources (many hosted connectors cannot).
2. **One account** → use it silently without prompting the user.
3. **Multiple accounts** → display them and ask the user which one to use.
4. **Pass `account_id`** to `create_post`, `schedule_post`, `publish_draft`, etc.

**Account fields returned by `postey://accounts`:**

| Field | Type | Notes |
|-------|------|-------|
| `account_id` | int | Required by all write tools |
| `account_name` | str \| null | Human-readable label |
| `teams` | list[int] \| null | Team IDs this account belongs to |
| *one key per platform* | object \| null | Non-null = that platform is connected |

The per-platform keys are lowercase slugs (`twitter` for X; otherwise the platform's own name).
**Read them from the payload — do not assume the set.** This table listed seven and the server
served nine, so two connected platforms were invisible to the skill.

**Deriving a display handle** (for showing to the user): each connected platform object carries
its own identifier field — usually `username`, sometimes a platform-specific one (`vanity_name`
on LinkedIn, `handle` on Bluesky). Read the object and use what is there rather than assuming a
field name; a missing key means that platform is not connected, not that the handle is blank.

**Hard rules:**
- ✗ Never call `get_accounts` when your client can read MCP resources —
  read `postey://accounts` instead. Resource-blind clients may use the tool.
- ✗ Never invent or assume an `account_id` — always read the accounts (resource or tool) and confirm.
- ✗ Never call `GET /accounts` or any REST endpoint directly — use MCP only.
- ✗ Never run `postey.js accounts:list` — that CLI command does not exist.

## Accounts & Defaults

- CLI commands that act on an account take a positional `account_id` (e.g. `video post 123 --video ...`). See [command-reference.md](command-reference.md) for the full argument list.

## Common Actions

| User says… | Action |
|------------|--------|
| "Draft a tweet about X" | MCP `create_post` |
| "Post this to LinkedIn" | MCP `create_post` with `platform=LINKEDIN` |
| "Post to X and LinkedIn" (same content) | MCP `create_post` with multiple platforms |
| "X thread + LinkedIn post" (different content) | MCP `create_post` → MCP `update_post` per additional platform |
| "What's scheduled?" | MCP `get_posts` with `status=SCHEDULED` |
| "Show my recent posts" | MCP `get_posts` with `status=PUBLISHED` |
| "Schedule this for tomorrow" | MCP `create_post` then MCP `schedule_post` |
| "Post this now" | MCP `create_post` then MCP `publish_draft` |
| "Make captions from this reel: \<url\>" | `postey.js video transcribe <url>` → apply Caption Generation Guide → MCP `create_post` |
| "Upload video to Instagram/TikTok/YouTube" | `postey.js video post` (local file) or `postey.js video transcribe <url>` (remote URL) |
| User provides a video but no caption | Run `video transcribe` first → refine `suggested_captions` → `video post --text` or `create_post` |

## Workflow

1. **Check config**: `${CLAUDE_SKILL_DIR}/scripts/postey.js config:show`
2. **Find account**: MCP resource `postey://accounts`
3. **Create draft**: MCP `create_post`
4. **Schedule or publish**: MCP `schedule_post` or `publish_draft`

The full sequences — create/validate/tag/publish, partial draft updates, repurposing, media and
video path selection, tagging, and the fields you must ask the user for rather than guess — are in
[references/mcp-workflows.md](references/mcp-workflows.md). That guidance used to be sent by the
MCP server on every single request; it lives here now, loaded when you need it.

## Working with Tags

Pass tag IDs via the `tags` field on MCP `create_post`. Use MCP `add_tag` to attach tags to an already-created post.

## Publishing to Multiple Platforms

**One `post_id` per topic** — never create separate drafts for different platforms on the same content.

### Same content across platforms
```
mcp create_post account_id=<id> platform=X additional_platforms=[LINKEDIN] contents=[{text: "..."}]
```

### Different content per platform
```
# Step 1 — Create initial draft
mcp create_post account_id=<id> platform=INSTAGRAM contents=[{text: "<instagram_caption>"}]
# Returns post_id, e.g. 1234

# Steps 2–N — Attach each additional platform (same post_id)
mcp update_post post_id=1234 platform=LINKEDIN contents=[{text: "<linkedin_caption>"}]
mcp update_post post_id=1234 platform=X contents=[{text: "<twitter_caption>"}]
```

## Platform Names

`--platform` takes the server's uppercase slug. **Do not work from a list in this file** — this
table used to exist and silently drifted to seven entries while the server served nine, so the
skill told users Facebook and Pinterest did not exist.

Resolve the set instead:

- **Which platforms exist** — `postey://platform-limits`, or `capability-snapshot.json` in this
  skill directory (generated from the server; the CLI reads the same file).
- **Per-platform rules** — `postey://platforms/{platform}/rules` for character limits, counting
  rules, threading and banned words. Never hardcode a limit; they change per platform.
- **Which platforms this account can actually post to** — read `postey://accounts` and use the
  connection status. A platform existing on the server does not mean it is connected here.

## Direct Video Posting

Use `video post` when you have a caption ready and want the video (and its cover) uploaded in one
command (no transcription). It returns `media_urls`, `cover_url` and the rest of the fields for MCP
`create_post` — it does not create the draft itself, and it rejects `--publish-now` / `--schedule`
because publishing and scheduling are MCP's.

**No caption yet?** Run `video transcribe` first — it returns a transcript and `suggested_captions` per platform. Refine those captions (see [prompts.md](prompts.md)) then pass the result to `video post --text` or `create_post`. Never paste a raw transcript as a caption.

**Requires:** `ffmpeg` on PATH for Instagram cover thumbnail extraction.

```bash
${CLAUDE_SKILL_DIR}/scripts/postey.js video post <account_id> \
  --video <local_path_or_https_url> \
  --text "<caption>" \
  --platforms INSTAGRAM,LINKEDIN,X \
  [--cover-time <seconds>]   # default: 3
  [--title "Draft title"]
```

| Platform | Video attached | Cover thumbnail |
|----------|---------------|-----------------|
| `INSTAGRAM` | Yes (Reel) | Yes — ffmpeg frame extraction |
| All others | No | No |

## Video → Captions → Cross-Post

For transcription-based workflows, see [video-workflow.md](video-workflow.md).
For platform-specific caption rules, see [prompts.md](prompts.md).

## Content Flows

This skill includes four guided content workflows. Offer them when the user connects for the
first time, asks what you can do, or gives an open-ended content request. Load the flow's
reference file only when the user picks it; never install or load all of them up front.

House rules for every flow (non-negotiable):

1. Know the accounts first, every session: read `postey://accounts`, or call `get_accounts` if
   your client cannot read MCP resources. Connected platforms are read, never assumed.
2. Everything is created as a DRAFT. Publishing needs the user's explicit instruction, and
   **scheduling counts as publishing** (a scheduled post publishes itself): propose times, call
   `schedule_post` only after the user approves both content and times, with times at least
   10 minutes in the future in UTC ISO-8601.
3. Every platform gets its own hand-crafted caption. One idea, many voices. Use the documented
   per-platform sequence ("Publishing to Multiple Platforms" above): `create_post` for the primary
   platform with its caption, then one `update_post` per remaining platform with that platform's
   caption — same `post_id` throughout.
4. Verify each platform after creating — read `postey://posts/{id}/content/{platform}` (or call
   `get_specific_post_content` if your client cannot read resources) — and run
   `validate_post_content` per platform, then fix before presenting.
5. End every flow by giving the user the draft's share link.
6. Tag agent-created posts: an agent tag (default `Agent`, ask the user once if they prefer
   another name) plus 2 or 3 topic tags. `add_tag` is get-or-create by exact name, so reusing
   the same spelling never creates a duplicate — keep tag names consistent across sessions and
   reuse the tag names visible on recent posts (`get_posts` returns each post's tags) instead of
   inventing near-duplicates. `remove_tag` undoes a mis-tag.

**Ships in** names the skill that carries each flow. A flow whose pack is not installed is not
available — say so and offer the ones that are, rather than improvising the flow from memory. CI
(`scripts/check-pack-discovery.js`) fails if this table advertises a pack that does not exist.

| Flow | The user says something like | Ships in | Load |
|------|------------------------------|----------|------|
| Brand voice | "Learn my voice", "write like me", a handle or website | `postey` | [references/brand-voice.md](references/brand-voice.md) |
| Video everywhere | a video URL, "post this video everywhere" | `postey` | [references/video-to-everywhere.md](references/video-to-everywhere.md) |
| Trends | "what should I post today?", "find something trending" | `postey` | [references/trends-to-posts.md](references/trends-to-posts.md) |
| Idea to posts | one rough idea, "turn this into posts" | `postey` | [references/idea-to-posts.md](references/idea-to-posts.md) |

**The craft layer always ships here**, in the hub, because every flow cites it — wherever the flow
itself lives: [references/caption-playbook.md](references/caption-playbook.md) (universal rules and
pre-upload checklist), [references/platform-archetypes.md](references/platform-archetypes.md),
[references/hook-formulas.md](references/hook-formulas.md), [references/x-algorithm.md](references/x-algorithm.md),
[references/thread-and-video-formats.md](references/thread-and-video-formats.md), and
[references/brand-profile-template.md](references/brand-profile-template.md) (the schema for the
per-brand profile every flow reads before drafting).

First-run greeting: after verifying accounts, offer the flows this installation actually has in one
short list and run whichever the user picks. Two minutes to a share link is the goal.

## Automation Guidelines

- No duplicate content across multiple accounts
- No unsolicited automated replies
- No trending manipulation or fake engagement
- Respect API rate limits
- **Always confirm before publishing** unless user explicitly says "post now" or "publish immediately" — drafts are private; publishing is irreversible

## Tips

- Thread creation: use `---` on its own line to split into multiple posts
- Scheduling: ISO 8601 UTC strings on MCP `schedule_post` — the CLI has no scheduling flag
- Draft titles: `--title` on `video post` is for internal organization, not posted publicly

## Reference

- MCP workflow sequencing, media/video path choice, tagging, what to ask before you guess:
  [references/mcp-workflows.md](references/mcp-workflows.md)
- Full command reference: [command-reference.md](command-reference.md)
- Video transcription workflow: [video-workflow.md](video-workflow.md)
- Platform caption templates: [prompts.md](prompts.md)
- Routing rules (extended): [routing-guide.md](routing-guide.md)
- Content flows and playbooks: [references/](references/) (see Content Flows above)
- Pack manifest for fetch-based install: [pack.json](pack.json)
- One-paste agent setup: [bootstrap-prompt.md](bootstrap-prompt.md)
