# Command Reference — `voice.js`

Local-machine work only. The CLI calls no Postey API and creates nothing: it reads the user's own
files and does deterministic arithmetic over them. Every write still goes through MCP, via the hub.

All output is JSON on stdout. Human chrome goes to stderr and only when attached to a terminal, so
the output is safe to pipe.

## `ingest <path...>`

Bulk-ingest local content into countable features and rule observations.

```bash
${CLAUDE_SKILL_DIR}/scripts/voice.js ingest ./their-writing --out ./voice-ledger.json
${CLAUDE_SKILL_DIR}/scripts/voice.js ingest ./export.json --scope LINKEDIN
${CLAUDE_SKILL_DIR}/scripts/voice.js ingest ./posts ./newsletter --since 2026-01-01T00:00:00Z
```

| Accepts | Becomes |
|---|---|
| a directory | every readable file inside it, recursively; dotfiles skipped |
| `.md`, `.txt`, `.markdown` | one document, dated by file mtime |
| `.json` — a bare array, `{posts:[…]}` or `{data:[…]}` | one document per row |

From a JSON row it reads `post_id`/`id`, `text`/`content`/`caption`, `platform`, and
`published_at`/`created_at`/`ts`. Rows with no text are dropped.

| Flag | Effect |
|---|---|
| `--scope <PLATFORM>` | attribute every document to one platform, overriding what the export says |
| `--since <ISO>` | ignore documents older than this |
| `--out <file>` | also write the result to a file |

Files over 2 MB are skipped, as is malformed JSON — both are reported on stderr rather than being
fatal, so one bad file cannot fail an otherwise good corpus. A path with nothing readable in it **is**
an error: an empty success would look like "this person has no habits".

**Output**

```json
{
  "corpus":  { "documents": 5, "scopes": ["LINKEDIN", "all"], "window": ["…", "…"] },
  "features":     [ { "feature": "emoji rate", "value": "0 per post", "from": [1180, 1194] } ],
  "observations": [ { "rule": "no emoji", "scope": "all", "post_id": 1180, "supports": true, "ts": "…" } ]
}
```

Features are corpus-level summaries for the profile. Observations are per-document evidence the
compiler promotes into rules. Both carry the document IDs behind them.

## `compile <ledger.json>`

Apply the rules-ledger thresholds and emit the compiled profile.

```bash
${CLAUDE_SKILL_DIR}/scripts/voice.js compile ./voice-ledger.json
${CLAUDE_SKILL_DIR}/scripts/voice.js compile ./voice-ledger.json --now 2026-08-02T00:00:00Z
```

Reads `observations` and `verdict_observations` from the ledger and merges them, so ingested corpus
evidence and live draft verdicts promote the same rules.

| Flag | Effect |
|---|---|
| `--now <ISO>` | compile as of this instant instead of now — makes results reproducible |

**Output**

```json
{
  "compiled_at": "2026-08-02T00:00:00Z",
  "corpus":   { … },
  "features": [ … ],
  "rules":    [ { "rule": "no emoji", "scope": "all", "status": "active", "evidence": 3,
                  "total_observations": 3, "contradictions": 0, "from": [1180, 1194, 1207] } ],
  "active":   ["no emoji"]
}
```

`active` is the short list that constrains drafting. `candidate` rules are raised with the user as
questions, never applied silently. `stale` rules are neither applied nor mentioned.

## What the detectors measure

Each produces one observation per document, and only where the document is long enough for absence
to mean anything — a four-word fragment does not evidence "no emoji".

| Rule | Supported when |
|---|---|
| `no em-dashes` · `no exclamation marks` · `no emoji` · `no hashtags` | none present, in a document of 20+ words |
| `opens with a question` | the first sentence ends in `?` |
| `never opens with a greeting` | the first sentence is not "hi/hey/hello/good morning…" |
| `ends with a call to action` | a CTA phrase appears anywhere |
| `short sentences (under 15 words)` | median sentence under 15 words, in a document of 2+ sentences |

A document that contradicts a habit produces `supports: false`, which resets that rule's run. That
is how a corpus with mixed practice yields a `candidate` rather than a false `active`.
