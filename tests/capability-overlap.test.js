'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// S9.6 — enforcement. The contract is prose until something fails a build.
//
// These tests are mostly about proving the gate CAN fail. A check that only ever
// passes is decoration, and this repo has already shipped two of those:
// check-platform-sync.js exited 0 with a warning when its input was missing, and
// the 7-vs-9 platform drift survived CI because every check compared two
// hand-maintained copies to each other (F-026 / L-016). So each case below
// introduces a real violation into a scratch copy and asserts a non-zero exit.

const ROOT = path.join(__dirname, '..');
const CHECK = path.join(ROOT, 'scripts', 'check-capability-overlap.js');
const CLI_REL = path.join('skills', 'postey', 'scripts', 'postey.js');
const SNAP_REL = path.join('skills', 'postey', 'capability-snapshot.json');

function scratchRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlap-'));
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'skills', 'postey', 'scripts'), { recursive: true });
  fs.copyFileSync(CHECK, path.join(dir, 'scripts', 'check-capability-overlap.js'));
  fs.copyFileSync(path.join(ROOT, CLI_REL), path.join(dir, CLI_REL));
  fs.copyFileSync(path.join(ROOT, SNAP_REL), path.join(dir, SNAP_REL));
  return dir;
}

function run(dir) {
  try {
    const stdout = execFileSync(
      process.execPath,
      [path.join(dir, 'scripts', 'check-capability-overlap.js')],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
    return { code: 0, out: stdout };
  } catch (err) {
    return { code: err.status, out: `${err.stdout || ''}${err.stderr || ''}` };
  }
}

function patchCli(dir, fn) {
  const p = path.join(dir, CLI_REL);
  fs.writeFileSync(p, fn(fs.readFileSync(p, 'utf8')));
}

test('the real repo passes', () => {
  assert.strictEqual(run(scratchRepo()).code, 0);
});

test('a CLI command duplicating an MCP capability FAILS the build', () => {
  const dir = scratchRepo();
  // The exact violation this repo already had to fix once (V-1): a CLI command
  // that creates posts, which is create_post's job.
  patchCli(dir, (src) =>
    src.replace('const COMMANDS = {', 'const COMMANDS = {\n  "post:create": cmdSetup,')
  );

  const { code, out } = run(dir);
  assert.strictEqual(code, 1, 'a duplicate command must fail CI');
  assert.match(out, /post:create/);
  assert.match(out, /create_post/);
});

test('a command named exactly like an MCP tool FAILS the build', () => {
  const dir = scratchRepo();
  patchCli(dir, (src) =>
    src.replace('const COMMANDS = {', 'const COMMANDS = {\n  upload_media: cmdSetup,')
  );

  const { code, out } = run(dir);
  assert.strictEqual(code, 1);
  assert.match(out, /also an MCP tool/);
});

test('a stale exemption FAILS the build', () => {
  const dir = scratchRepo();
  // Remove the command an exemption covers. The exemption must not survive it —
  // otherwise it silently pre-authorises whatever later takes that name.
  patchCli(dir, (src) => src.replace(/^\s*"media:upload":\s*cmdMediaUpload,\s*$/m, ''));

  const { code, out } = run(dir);
  assert.strictEqual(code, 1);
  assert.match(out, /stale exemption/);
});

test('an exemption naming a capability the server dropped FAILS the build', () => {
  const dir = scratchRepo();
  const p = path.join(dir, SNAP_REL);
  const snap = JSON.parse(fs.readFileSync(p, 'utf8'));
  delete snap.canonical['media.upload'];
  fs.writeFileSync(p, JSON.stringify(snap, null, 2));

  const { code, out } = run(dir);
  assert.strictEqual(code, 1);
  assert.match(out, /stale/);
});

test('parsing zero commands FAILS rather than passing vacuously', () => {
  const dir = scratchRepo();
  patchCli(dir, (src) => src.replace(/const COMMANDS = \{[\s\S]*?\n\};/, 'const COMMANDS = {\n};'));

  const { code, out } = run(dir);
  assert.strictEqual(code, 1, 'an empty command list must not read as "no overlap"');
  assert.match(out, /vacuously|could not locate/);
});

test('group subcommands are checked, not just the group name', () => {
  const dir = scratchRepo();
  // `video` alone is not a capability; `video transcribe` is, and it is the one
  // that overlaps transcribe_video. If the expansion silently stopped working,
  // its exemption would go stale and this fails — which is the signal we want.
  const { out } = run(dir);
  assert.match(out, /video transcribe/);
});
