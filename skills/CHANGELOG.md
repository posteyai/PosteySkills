# Changelog (Postey Skill)

All notable user-facing changes to the Postey skill and its CLI are documented here.

The format is based on Keep a Changelog.

## [Unreleased]

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
