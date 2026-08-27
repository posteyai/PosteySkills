'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// F-031 — routing-guide.md sent every non-MCP environment to the CLI for
// create / update / publish / schedule, months after S9.1 deleted those commands.
// Nothing caught it because no check ever compared the guidance to the COMMANDS
// table. This is that check, and these tests exist to prove it CAN fail: five
// checks in this repo have shipped in a state where they reported success without
// ever really running (F-046), so each case below injects a real violation into a
// scratch copy and asserts a non-zero exit.

const ROOT = path.join(__dirname, '..');
const CHECK_REL = path.join('scripts', 'check-doc-commands.js');
const OVERLAP_REL = path.join('scripts', 'check-capability-overlap.js');
const CLI_REL = path.join('skills', 'postey', 'scripts', 'postey.js');
const SNAP_REL = path.join('skills', 'postey', 'capability-snapshot.json');
const GUIDE_REL = path.join('skills', 'postey', 'routing-guide.md');
const LIB_REL = path.join('scripts', 'lib', 'skills.js');

function scratchRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doccmd-'));
  fs.mkdirSync(path.join(dir, 'scripts', 'lib'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'skills', 'postey', 'scripts'), { recursive: true });
  for (const rel of [CHECK_REL, OVERLAP_REL, CLI_REL, SNAP_REL, LIB_REL]) {
    fs.copyFileSync(path.join(ROOT, rel), path.join(dir, rel));
  }
  // Only the docs matter to this check; copy the ones that name commands.
  for (const name of ['routing-guide.md', 'SKILL.md', 'command-reference.md']) {
    fs.copyFileSync(
      path.join(ROOT, 'skills', 'postey', name),
      path.join(dir, 'skills', 'postey', name)
    );
  }
  return dir;
}

function run(dir) {
  try {
    const stdout = execFileSync(process.execPath, [path.join(dir, CHECK_REL)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out: stdout };
  } catch (err) {
    return { code: err.status, out: `${err.stdout || ''}${err.stderr || ''}` };
  }
}

function appendToGuide(dir, line) {
  const p = path.join(dir, GUIDE_REL);
  fs.appendFileSync(p, `\n${line}\n`);
}

test('the real repo passes', () => {
  const { code, out } = run(scratchRepo());
  assert.strictEqual(code, 0, out);
});

test('the defect itself — routing a write to a CLI command that does not exist — FAILS', () => {
  const dir = scratchRepo();
  appendToGuide(dir, '   → CLI in CI/CD: `postey.js drafts:create --text "..."`');

  const { code, out } = run(dir);
  assert.strictEqual(code, 1, 'F-031 must not be able to return silently');
  assert.match(out, /drafts:create/);
});

test('a bare colon-form command that does not exist FAILS', () => {
  const dir = scratchRepo();
  appendToGuide(dir, 'Create the draft with `posts:create` instead.');

  const { code, out } = run(dir);
  assert.strictEqual(code, 1);
  assert.match(out, /posts:create/);
});

test('an invented subcommand of a real group FAILS', () => {
  const dir = scratchRepo();
  appendToGuide(dir, 'Run `postey.js video publish --account-id 1` to ship it.');

  const { code, out } = run(dir);
  assert.strictEqual(code, 1, 'group expansion must reach subcommands');
  assert.match(out, /video publish/);
});

test('a doc naming a removed command to warn against it PASSES', () => {
  const dir = scratchRepo();
  appendToGuide(dir, 'Never run `drafts:publish` — it does not exist.');

  assert.strictEqual(run(dir).code, 0);
});

test('a REMOVED_ON_PURPOSE entry that comes back as a real command FAILS', () => {
  const dir = scratchRepo();
  const p = path.join(dir, CLI_REL);
  fs.writeFileSync(
    p,
    fs
      .readFileSync(p, 'utf8')
      .replace('const COMMANDS = {', 'const COMMANDS = {\n  "drafts:create": cmdSetup,')
  );

  const { code, out } = run(dir);
  assert.strictEqual(code, 1, 'a declaration must not survive the command returning');
  assert.match(out, /stale/);
});

test('a REMOVED_ON_PURPOSE entry no doc mentions FAILS', () => {
  const dir = scratchRepo();
  const p = path.join(dir, CHECK_REL);
  fs.writeFileSync(
    p,
    fs
      .readFileSync(p, 'utf8')
      .replace(
        'const REMOVED_ON_PURPOSE = {',
        "const REMOVED_ON_PURPOSE = {\n  'ghosts:list': 'never mentioned anywhere',"
      )
  );

  const { code, out } = run(dir);
  assert.strictEqual(code, 1, 'dead cover must be removed, not accumulated');
  assert.match(out, /ghosts:list/);
});

// --- the routing map half -------------------------------------------------
// F-031's own wording named no command ("→ CLI in CI/CD"), so the command scan
// above would not have caught it. SKILL.md's `routing:` map is where the same
// claim is machine-readable, and the pre-fix map really did carry it as
// `ci-environment: cli` / `fallback: cli`.

function patchRouting(dir, from, to) {
  const p = path.join(dir, 'skills', 'postey', 'SKILL.md');
  const src = fs.readFileSync(p, 'utf8');
  assert.ok(src.includes(from), `fixture no longer contains "${from}"`);
  fs.writeFileSync(p, src.replace(from, to));
}

test('the defect as it actually shipped — an environment routed to the CLI — FAILS', () => {
  const dir = scratchRepo();
  patchRouting(
    dir,
    '  fallback:            mcp-tool',
    '  ci-environment:      cli\n  fallback:            mcp-tool'
  );

  const { code, out } = run(dir);
  assert.strictEqual(code, 1);
  assert.match(out, /ci-environment/);
});

test('routing a write to the CLI FAILS', () => {
  const dir = scratchRepo();
  patchRouting(dir, '  write-post:          mcp-tool', '  write-post:          cli');

  const { code, out } = run(dir);
  assert.strictEqual(code, 1, 'writes are MCP-owned in every environment');
  assert.match(out, /write-post/);
});

test('an unknown routing path FAILS', () => {
  const dir = scratchRepo();
  patchRouting(dir, '  validation:          mcp-tool', '  validation:          rest-api');

  const { code, out } = run(dir);
  assert.strictEqual(code, 1);
  assert.match(out, /rest-api/);
});

test('a CLI_ROUTABLE entry the routing map dropped FAILS', () => {
  const dir = scratchRepo();
  patchRouting(dir, '  local-file:          cli', '  local-filesystem:    cli');

  const { code, out } = run(dir);
  assert.strictEqual(code, 1, 'a dropped key must not leave dead cover behind');
  assert.match(out, /local-file/);
});

test('finding zero command references FAILS rather than passing vacuously', () => {
  const dir = scratchRepo();
  for (const name of ['routing-guide.md', 'SKILL.md', 'command-reference.md']) {
    fs.writeFileSync(path.join(dir, 'skills', 'postey', name), '# nothing here\n');
  }

  const { code, out } = run(dir);
  assert.strictEqual(code, 1, 'an empty scan must not read as "all docs are correct"');
  assert.match(out, /zero command references|REMOVED_ON_PURPOSE/);
});
