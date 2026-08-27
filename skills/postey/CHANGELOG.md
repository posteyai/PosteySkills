# Changelog (Postey Skill)

All notable user-facing changes to the Postey skill and its CLI are documented here.

The format is based on Keep a Changelog.

## 3.1.0

**New: `references/post-structures.md`** — eighteen post structures in the craft layer, each with
the condition that selects it, its shape, a length rule, and the way it typically fails. Derived
from measured top-vs-bottom quintile analysis of high-performing operator accounts on X.

Adds two things the craft layer did not carry:

- **The density rule.** Two lengths perform — under ~140 characters, or over ~600 with new facts
  throughout. Between 200 and 500 is a dead zone, and a draft landing there needs compressing or
  more material, not trimming.
- **Portability off X.** Which structures survive on LinkedIn, Instagram and TikTok, which are
  X-and-Threads only, and the two that do not port at all. On Instagram and TikTok the structure
  governs the spoken hook, not the caption.

Every flow that already cites `hook-formulas.md` and `platform-archetypes.md` can now cite a named
structure and its failure mode instead of choosing a shape implicitly.

## 3.0.0

**Breaking — the content flows now ship as separate, optional packs.** The hub keeps routing,
accounts, platform truth, the CLI and the shared craft layer. Install a pack only if you want its
flow:

| Flow | Pack |
|---|---|
| Trends to posts · idea to posts | `postey-studio` |
| Video everywhere | `postey-video` |
| Brand voice | `postey-voice` |

`references/trends-to-posts.md`, `references/idea-to-posts.md`, `references/video-to-everywhere.md`
and `references/brand-voice.md` are no longer in this skill. The craft layer they cite —
`caption-playbook.md`, `hook-formulas.md`, `platform-archetypes.md`, `x-algorithm.md`,
`thread-and-video-formats.md` and `brand-profile-template.md` — stays here, because every pack reads
it. A pack cannot be installed usefully without this skill.

The Content Flows section is now a discovery table naming which pack carries each flow, so an agent
can tell the user a flow is not installed rather than improvising it.

`mcp-tools.tools:` is generated from a new `capabilities:` block rather than hand-maintained.
Regenerating it corrected drift in both directions: seven tools were granted for capabilities this
skill does not document, and three the skill does need — `file_manager`, `list_files`, `read_file` —
had been missing.

## [3.0.1]

### Added

- **`references/mcp-authentication.md`** — the auth guidance this line has never shipped. The 3.0.0
  consolidation cut the hub's references from eleven to seven, correctly: the four it dropped were
  content flows that moved to `postey-studio`, `postey-video` and `postey-voice`. Auth was not one of
  them — it was never a reference here at all. The MCP instruction block relocated the OAuth scope
  list, the MCP-key path and the two agent-token mint endpoints out to this path on 2026-08-24
  (mcp-northstar N1.4) and the file did not exist on either line, so `skills/postey/v3.0.0` is a
  published, installable tag whose pack contains no auth documentation and no path to any
  (mcp-northstar F-081).

  It sits in the hub because the hub is the one guaranteed dependency — every optional pack requires
  it, so auth is documented once and read by all of them. It is a separate file rather than a section
  of `mcp-workflows.md` because that file is scoped to sequencing and craft, and because the
  instruction block's ledger names this exact path: one destination that now resolves on both lines.

  Written for this line rather than copied from 2.5.1: it opens on setup.md's A/B/C tracks and states
  that **track B mints nothing**, it notes that installing a pack does not widen a grant, and it names
  the CLI's credential order because Step 5 sets `POSTEY_API_KEY` separately from Step 3's OAuth.

- **`references/mcp-workflows.md` gains `## Local Files and Large Uploads`.** A fourth ledger entry —
  which upload paths survive without this skill installed — has pointed at
  `mcp-workflows.md#local-files-and-large-uploads` since 2026-08-24. The file was loadable but the
  heading existed on no branch and no tag, so the anchor resolved silently to the top of the file. It
  now states, per path, which side of the local-disk line each upload sits on: `url`, `base64` and
  `file_manager` need nothing installed; `local_path`, chunked upload above 50 MB and local
  transcription are the CLI's.

**Why 3.0.1 and not an edit in place.** `rawBase` pins `refs/tags/skills/postey/v<version>`. The
bootstrap reads this manifest from the branch but every listed file from the tag, so a new
`references[]` entry shipped without a matching pushed tag is a live 404 on every new install —
strictly worse than the unreachable destination it fixes. Push `skills/postey/v3.0.1` at release.

## [Unreleased]

### Fixed

- **Routing no longer sends writes to a CLI that has no write commands.** `routing-guide.md` (steps
  3 and 6, and the environment table) and `SKILL.md` both told CI/CD, shell scripts, Cursor, Windsurf
  and SDK agents to create / update / publish / schedule via the CLI. Those commands were removed —
  the guidance pointed at a path that does not exist. Writes are MCP's in **every** environment; where
  no MCP server is reachable the honest answer is that the write cannot be performed, not that the CLI
  will do it. `video post` / `video transcribe` are now documented for what they actually do: upload,
  and hand back the fields for `create_post`.

### Added

- **`scripts/check-doc-commands.js`** — CI now fails when shipped guidance names a CLI command that is
  not in the COMMANDS table, or routes an MCP-owned operation to the CLI in `SKILL.md`'s `routing:`
  map. It reuses the COMMANDS parser from `check-capability-overlap.js` rather than growing a second
  copy. `tests/doc-commands.test.js` — 12 tests, ten of which inject a real violation and assert a
  non-zero exit; the check also fails on the pre-fix tree, which is what proves it would have caught
  this.

## [2.3.0]

### Added

- **`POSTEY_AUTH_TOKEN`** — a bearer credential the CLI accepts from the environment, ranked
  directly below `POSTEY_API_KEY` and above the machine's logged-in session. The MCP server sets it
  when it shells out to this CLI for a caller who authenticated with OAuth. `local_path` uploads and
  `transcribe_video` previously demanded an `mk_` API key, so every OAuth client was refused before
  the tool did any work (backend S9.9 / SK-5); the API key was never the requirement, a credential
  the API accepts was. `config:show` reports it as `bearer (env)`.

- **`references/mcp-workflows.md`** — the craft and workflow half of the MCP server's instruction
  block, relocated here. The server was sending 22,457 characters on **every** request, most of it
  sequencing and judgment: create/validate/tag/publish, partial draft updates, when
  `convert_post_content` is the wrong tool, choosing between `url` / `base64` / `local_path` /
  `file_manager` for media, the three video paths, tag reuse, and the fields to ask about rather
  than guess (Instagram `post_type`, YouTube and Pinterest titles). It now loads on demand.

  This is strict extension, not a transfer of responsibility — the server never should have
  carried judgment. What stayed on the server is what instructions are for: rate limits,
  permission levels, the response envelope, the post lifecycle and the resource-first rule. What
  is in neither place is platform truth; limits and media specs live in `postey://platform-limits`
  and `postey://platforms/{platform}/rules`, and are not copied into this repo.

  Landed with the matching server-side change (mcp-ax S9.7).

- **`scripts/check-capability-overlap.js`** — CI now fails when a CLI command reaches an effect MCP
  owns. Compares *capability* against `capability-snapshot.json`, not spelling: the two surfaces do
  not share a naming convention (`media:upload` vs `upload_media`), so a literal name intersection is
  empty today and would stay empty even if someone re-added a `posts:create` duplicating
  `create_post` — the exact violation (V-1) this repo already had to fix once.
- Group subcommands (`video transcribe`) are expanded and checked, not just the group name.
- Legitimate layering is declared in `SKILL_OWNED` with the contract row that grants it, and both
  halves are self-checking: an exemption for a deleted command, or one naming a capability the server
  dropped, fails the build rather than lingering as silent cover.
- `tests/capability-overlap.test.js` — 7 tests, five of which introduce a real violation into a
  scratch copy and assert a **non-zero exit**. A check that only ever passes is decoration, and this
  repo has shipped two of those already.

## [2.2.0]

### Added

- **`capability-snapshot.json`** — the platform/tool/capability set, generated from
  `postey://skill-manifest` by `scripts/refresh-capability-snapshot.js`. The skill, the CLI and CI
  all derive from this one file. It carries the server's `capability` / `canonical` /
  `superseded_by` data, so a client can prefer the canonical provider instead of parsing
  `[FALLBACK ONLY — READ … INSTEAD]` out of a tool description.
- **"Capability Comes From the Server, Not From This File"** in `SKILL.md` — teaches reading the
  live manifest, and the canonical/superseded rule that settles routing on its own.
- `tests/capability-discovery.test.js` — fails if a literal platform or tool list reappears
  anywhere, if the description stops advertising a platform the server serves, or if the skill is
  granted a tool that no longer exists.

### Changed

- **`platforms:` removed from `SKILL.md` frontmatter**, and the "Platform Names" and account-shape
  tables no longer enumerate platforms. 2.1.0 closed the 7-vs-9 gap by adding two entries to the
  frontmatter list; the body tables were never touched and still said seven, and every check stayed
  green because they only compared frontmatter against the CLI. Four hand-maintained copies of one
  fact could only ever prove they agreed with each other. There is now one generated copy.
- `postey.js` builds `SOCIAL_PLATFORMS` from the snapshot instead of a literal, and only runs
  `main()` when invoked as a CLI, so the resulting set is testable.

### Removed

- `scripts/check-platform-sync.js` — it compared two hand-maintained lists and **exited 0 with a
  warning** when either was absent. Replaced in CI by a live snapshot-drift check that hard-fails
  when configured.

## [2.1.0]

### Added

- **Facebook and Pinterest** — the skill declared 7 platforms while the MCP server supported 9, so
  all guidance told users these two did not exist. Both now appear in `platforms:`, in the CLI's
  `SOCIAL_PLATFORMS`, and in `references/platform-archetypes.md` (including Pinterest's
  title/description model, which is not a caption model).
- `connect_account`, `get_platform_comments`, `get_internal_comments` to `mcp-tools.tools:`.
- `tests/skill-parity.test.js` — fails on platform or namespace divergence. `check-platform-sync.js`
  already compared against the backend, but **skips** when that checkout is absent, which is the
  normal case in CI and is how the 7-vs-9 drift survived. These tests need no sibling checkout.

### Changed

- **MCP tool names are no longer namespace-prefixed.** Guidance listed
  `mcp__claude_ai_postey__<tool>`, but the prefix is derived from whatever the *user* named the
  connection — during the audit the same server appeared under three different names, none matching.
  Tool names are now bare; match on those and call whichever form your client exposes.

### Fixed

- Removed three tools from `mcp-tools.tools:` that **do not exist** on the server
  (`reply_to_manual_comment`, `get_manual_comments`, `get_comment_for_specific_post`);
  `reply_to_platform_comment` and the two comment reads above are their real counterparts.

## [2.0.0]

### Removed — BREAKING

The skill is a strict extension of the Postey MCP server: it may only provide what MCP cannot.
See [docs/skills-mcp-contract.md](../../docs/skills-mcp-contract.md). These CLI commands duplicated
MCP and have been removed.

- `drafts:get` — use the `postey://posts/{id}/content/{platform}` resource, or the
  `get_specific_post_content` tool if your client cannot read MCP resources.
- `posts:create` — use the `create_post` MCP tool.
- `video post --schedule` / `--publish-now` — use the `schedule_post` and `publish_draft` MCP tools.

### Changed — BREAKING

- `video post` no longer creates the draft. It uploads the video (and extracts/uploads the cover),
  then returns `media_urls`, `cover_url`, `account_id`, `platforms` and `text` for you to pass to
  `create_post`. The video handling stays here because it needs local ffmpeg and the file itself;
  draft creation does not.
- `video transcribe --platform ... --account-id ...` likewise returns `draft_inputs` instead of a
  created `post`.

This continues the migration recorded under 1.2.0, which removed `drafts:list`, `drafts:create`,
`drafts:publish`, `drafts:delete`, `drafts:schedule` and `drafts:content` for the same reason.

## [1.4.0]

### Added

- **Content Flows**: four guided workflows built into the skill — Brand voice (learn a brand's
  voice from a handle/site and draft a batch), Video everywhere (any video URL to a per-platform
  multi-draft), Trends (fresh niche content across five pillars), Idea to posts (one idea expanded
  and scheduled across platforms). One skill install delivers all of them; flow references load
  on demand from `references/`.
- Shared content playbooks in `references/`: caption playbook with pre-upload checklist,
  per-platform caption archetypes, hook formulas, X algorithm notes (public sources),
  thread/reel/carousel/trend formats, and a brand-profile template.
- `pack.json` machine-readable manifest for fetch-based installs (agents fetch the skill without
  a plugin system). Fetched content is pinned to the immutable release tag, not `main`.
- `bootstrap-prompt.md`: the one-paste prompt that sets up any connected agent.
- MCP tools newly listed in the skill: `get_schedule`, `update_schedule`, `unschedule_post`,
  `remove_tag`, `get_manual_comments`, `reply_to_manual_comment`.

### Changed

- Routing now documents fallbacks for constrained clients: resource-blind clients (many hosted
  connectors) use the `get_accounts` / `get_posts` read tools instead of `postey://` resources,
  and connector-only clients (no CLI) use the `transcribe_video` MCP tool for transcription.
  The machine-readable `routing:` block encodes this as `primary > fallback`.
- Scheduling is explicitly gated like publishing everywhere: propose times, schedule only after
  the user approves content and times (a scheduled post publishes itself).
- MCP tool names now use the lowercase connector slug (`mcp__claude_ai_postey__*`).

### Fixed

- Corrected the media-upload tool name to `upload_media` (docs previously referenced
  `upload_media_for_post`, which never existed on the server).
- API key URL corrected to `https://app.postey.ai/?settings=api` (was the stale `postey.com`).
- Removed references to CLI commands deleted in 1.3.0 (`social-sets:list`, `drafts:list`,
  `drafts:create`) from the README, routing guide, and skill docs; deleted the stale legacy
  `skills/SKILLS.md`.

## [1.3.0]

### Removed

- `social-sets:list` CLI command — use `postey://accounts` MCP resource or `get_accounts` tool
- `drafts:list` CLI command — use `get_posts` MCP tool
- `drafts:create` CLI command — use `create_post` MCP tool
- `create-draft` alias — use `create_post` MCP tool
- `drafts:publish` CLI command — use `publish_draft` MCP tool
- `drafts:delete` CLI command — use `delete_draft` MCP tool
- `drafts:schedule` CLI command — use `schedule_post` MCP tool
- `drafts:content` CLI command — use `postey://posts/{id}/content/{platform}` resource or `get_specific_post_content` tool
- `tags:list` CLI command — no MCP equivalent; removed by request
- `tags:create` CLI command — no MCP equivalent; removed by request

## [1.2.0 and earlier]

Entries below predate the 1.3.0 release and shipped across 1.0.x-1.2.0; they were previously
misfiled under "Unreleased".

### Added

- `video:post` command: single-command video upload and multi-platform draft creation. Handles chunked upload for files >50 MB, extracts a cover frame with ffmpeg at a configurable timestamp, and sets `cover_url` for Instagram Reels automatically. Accepts local file paths or `https://` CDN URLs (ffmpeg reads CDN URLs directly). All non-Instagram platforms receive text-only content. Flags: `--video`, `--text`, `--platforms`, `--cover-time` (default: 3 s), `--title`, `--tags`, `--schedule`, `--publish-now`.
- `video2post.js` script (cross-platform, macOS + Windows): download any video URL with yt-dlp, extract audio with ffmpeg, transcribe with Whisper — outputs transcript and file paths as JSON. Supports `--output-dir` and `--model` flags.
- Video-to-cross-post workflow: generate tailored captions for Instagram, TikTok, and YouTube from a video transcript and publish as separate per-platform Postey drafts.
- THREADS and BLUESKY platform support (`--platform THREADS` / `--platform BLUESKY`).
- `media:upload <post_id> --platform <platform> --file <path>` command: upload a media file and attach it to an existing draft (`doc_id` computed automatically as `post_id * 256 + platform_type`).
- `video2post.js` now automatically uploads the downloaded video to Postey after creating each draft.

### Removed

- Removed `drafts:update` and `media:upload` from documentation — these commands are not implemented in the CLI.

### Changed

- `drafts:create` now uses the new `/posts/raw` request model (`contents` list instead of `post_raw_content`).
- Added YouTube support to `drafts:create`: `--youtube-title` (required for YOUTUBE platform), `--youtube-description`, `--youtube-privacy-status`, `--youtube-category-id`, `--youtube-made-for-kids`, `--youtube-tags`, `--youtube-notify-subscribers`, `--youtube-license`, `--youtube-embeddable`.
- Added `--media-urls` flag to `drafts:create` for attaching media by URL.
- `--platform` now accepts `TIKTOK`, `INSTAGRAM`, and `YOUTUBE` in addition to `X` and `LINKEDIN`.
- Platform support for `INSTAGRAM`, `TIKTOK`, and `YOUTUBE` (availability depends on connected accounts).

### Changed

- Renamed the skill and CLI to `postey` across command examples, file paths, and plugin metadata.
- Updated configuration naming in docs and CLI output to use `POSTEY_*` environment variables and `.postey/` config directories.
- Updated docs and CLI help text to list only supported platforms: `X` and `LINKEDIN`.
- `drafts:get` now accepts only `<draft_id>` and no longer accepts `social_set_id`/`--social-set-id` or `--use-default`.
- `drafts:delete` now accepts only `<draft_id>` and no longer accepts `social_set_id`/`--social-set-id` or `--use-default`.
- `drafts:schedule` now uses the schedules API payload (`post_id`, `platforms`, `scheduled_at`, `natural_posting`) and accepts `<draft_id>` with optional `--platform` / `--natural-posting`.
- `drafts:publish` now uses `POST /publish` with (`post_id`, `platforms`, `natural_posting`) and accepts `<draft_id>` with optional `--platform` / `--natural-posting`.
- `config:set-default` now configures account default platform via `/accounts/preferences/{account_id}` (creates or updates preference) using `[account_id] <platform>`.
- `drafts:create` now uses `POST /posts/raw` with `account_id`, `platforms`, `post_raw_content`, `publish_now`, `schedule_at`, `draft_title`, and numeric `tags`.
- Added `drafts:content <post_id> --platform <platform>` to fetch parsed content from `GET /posts/parsed/content`.
- Updated tag commands to align with the `/tags` API shape:
  - `tags:list [account_id]` now calls `GET /tags?account=<id>`
  - `tags:create [account_id] --tag ... --color ...` now calls `POST /tags` with `account_id`, `tag`, and `color`
  - Added `tags:update <tag_id> [account_id] --tag ... --color ...`
  - Added `tags:delete <tag_id> [account_id]`
- Updated help and skill documentation to remove stale command references and align examples with the current CLI command set.

## [2026-02-10]

### Added

- `create-draft` and `update-draft` alias commands to create/update drafts with simpler arguments.
- `--tags` support for `drafts:update` (tag-only updates keep existing draft content unchanged).
- `--social-set-id` / `--social_set_id` flag support as an alternative to positional `social_set_id` for commands that take a social set.

### Fixed

- `update-draft` no longer overwrites draft content when you run it with only flags (for example, adding tags).
- Clear CLI errors when a value-taking flag is provided without a value (instead of crashing).
- Thread splitting on `---` now works with both LF and CRLF line endings.
