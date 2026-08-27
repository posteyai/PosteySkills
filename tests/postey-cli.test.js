const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function resolveCliPath() {
  const candidates = [
    path.resolve(__dirname, '..', 'skills', 'scripts', 'postey.js'),
    path.resolve(__dirname, '..', 'skills', 'postey', 'scripts', 'postey.js'),
  ];
  for (const candidate of candidates) {
    if (fsSync.existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

const CLI_PATH = resolveCliPath();

async function mkdtemp(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function makeSandbox() {
  const root = await mkdtemp('agent-skills-test-');
  const cwd = path.join(root, 'cwd');
  const home = path.join(root, 'home');
  await fs.mkdir(cwd, { recursive: true });
  await fs.mkdir(home, { recursive: true });
  return {
    root,
    cwd,
    home,
    async cleanup() {
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}

function runCli(args, { cwd, env, timeoutMs = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_PATH, ...args], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`CLI timeout after ${timeoutMs}ms: ${args.join(' ')}`));
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr });
    });
  });
}

function parseJsonOrNull(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function createMockServer() {
  const requests = [];
  const expectations = [];

  async function readBody(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    return Buffer.concat(chunks);
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const bodyBuf = await readBody(req);
    const bodyText = bodyBuf.toString('utf8');
    const bodyJson = parseJsonOrNull(bodyText);

    const record = {
      method: req.method,
      path: url.pathname,
      search: url.search,
      headers: req.headers,
      bodyText,
      bodyJson,
    };
    requests.push(record);

    const exp = expectations.shift();
    if (!exp) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unexpected request', request: record }));
      return;
    }

    try {
      assert.equal(record.method, exp.method, 'HTTP method mismatch');
      assert.equal(record.path, exp.path, 'HTTP path mismatch');
      if (exp.assert) exp.assert(record);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Expectation failed', message: e.message, request: record }));
      return;
    }

    const status = exp.status ?? 200;
    const json = exp.json ?? {};
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(json));
  });

  return {
    requests,
    expect(method, path, { assert, status, json } = {}) {
      expectations.push({ method, path, assert, status, json });
    },
    async listen() {
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const addr = server.address();
      return { baseUrl: `http://127.0.0.1:${addr.port}` };
    },
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
    assertNoPendingExpectations() {
      assert.equal(expectations.length, 0, `Unconsumed expectations: ${expectations.length}`);
    },
  };
}

function authAssertFactory(expectedKey) {
  return (req) => {
    assert.equal(req.headers['x-api-key'], expectedKey);
  };
}

test('help command prints usage and exits 0', async () => {
  const sandbox = await makeSandbox();
  try {
    const result = await runCli(['help'], {
      cwd: sandbox.cwd,
      env: { HOME: sandbox.home, POSTEY_API_KEY: '' },
    });
    assert.equal(result.code, 0);
    assert.ok(result.stdout.includes('Postey CLI - Manage social media posts'));
    assert.ok(result.stdout.includes('USAGE:'));
  } finally {
    await sandbox.cleanup();
  }
});

test('config:show returns configured=false when no API key configured', async () => {
  const sandbox = await makeSandbox();
  try {
    const result = await runCli(['config:show'], {
      cwd: sandbox.cwd,
      env: { HOME: sandbox.home, POSTEY_API_KEY: '' },
    });
    assert.equal(result.code, 0);
    assert.deepEqual(parseJsonOrNull(result.stdout), {
      configured: false,
      hint: 'Run: postey.js auth:login  (OAuth)  or  postey.js setup  (API key)',
      api_key_url: 'https://app.postey.ai?settings=agents&section=advanced',
    });
  } finally {
    await sandbox.cleanup();
  }
});

test('config:show reads local config and reports default account source', async () => {
  const sandbox = await makeSandbox();
  try {
    const cfgDir = path.join(sandbox.cwd, '.postey');
    await fs.mkdir(cfgDir, { recursive: true });
    await fs.writeFile(
      path.join(cfgDir, 'config.json'),
      JSON.stringify({ apiKey: 'typ_local_key', defaultAccountId: '123' }, null, 2)
    );

    const result = await runCli(['config:show'], {
      cwd: sandbox.cwd,
      env: { HOME: sandbox.home, POSTEY_API_KEY: '' },
    });

    assert.equal(result.code, 0);
    const out = parseJsonOrNull(result.stdout);
    assert.equal(out.configured, true);
    assert.ok(out.config_files.local.path.endsWith(path.join('.postey', 'config.json')));
    assert.equal(out.auth_preview, 'typ_loca...');
    assert.equal(out.default_account.id, '123');
  } finally {
    await sandbox.cleanup();
  }
});

// writeFileSync's `mode` applies only when it CREATES the file. A config.json
// that already exists at 0644 keeps those bits, and this one holds an API key.
test('setup tightens an existing world-readable config to 0600', async () => {
  const sandbox = await makeSandbox();
  try {
    const dir = path.join(sandbox.cwd, '.postey');
    await fs.mkdir(dir, { recursive: true });
    const cfgPath = path.join(dir, 'config.json');
    await fs.writeFile(cfgPath, '{}\n', { mode: 0o644 });
    await fs.chmod(cfgPath, 0o644);
    assert.equal(fsSync.statSync(cfgPath).mode & 0o777, 0o644, 'fixture must start loose');

    const result = await runCli(
      ['setup', '--key', 'typ_perm_key', '--location', 'local'],
      { cwd: sandbox.cwd, env: { HOME: sandbox.home } }
    );
    assert.equal(result.code, 0);

    const mode = fsSync.statSync(cfgPath).mode & 0o777;
    assert.equal(mode, 0o600, `config holding an API key left at ${mode.toString(8)}`);
  } finally {
    await sandbox.cleanup();
  }
});

// setup prompts on stdin when --key is absent. `isNonInteractive` means "a key
// was supplied", so it cannot answer this — an unattended agent blocked forever.
test('setup without --key fails fast when stdin is not a TTY', async () => {
  const sandbox = await makeSandbox();
  try {
    const result = await runCli(['setup', '--location', 'global'], {
      cwd: sandbox.cwd,
      env: { HOME: sandbox.home },
      timeoutMs: 4000,
    });
    assert.equal(result.code, 1, 'a headless setup with no key must not succeed');
    const out = parseJsonOrNull(result.stdout);
    assert.ok(out?.error, 'the failure must be JSON on stdout, not a hang');
    assert.match(out.error, /--key is required/);
  } finally {
    await sandbox.cleanup();
  }
});

// auth:logout only cleared the OAuth session, so a CLI linked with auth:link
// reported a clean logout and stayed authenticated.
test('auth:logout clears a linked cliToken, not just an OAuth session', async () => {
  const sandbox = await makeSandbox();
  try {
    const cfgDir = path.join(sandbox.home, '.config', 'postey');
    await fs.mkdir(cfgDir, { recursive: true });
    const cfgPath = path.join(cfgDir, 'config.json');
    await fs.writeFile(cfgPath, JSON.stringify({ cliToken: 'pat_linked_token' }), { mode: 0o600 });

    const result = await runCli(['auth:logout'], { cwd: sandbox.cwd, env: { HOME: sandbox.home } });
    assert.equal(result.code, 0);
    const out = parseJsonOrNull(result.stdout);
    assert.ok(out.cleared.includes('linked'), `expected the linked token cleared, got ${JSON.stringify(out)}`);

    const after = JSON.parse(await fs.readFile(cfgPath, 'utf8'));
    assert.equal(after.cliToken, undefined, 'the linked credential survived logout');
  } finally {
    await sandbox.cleanup();
  }
});

// `pending[code]` on a plain object made __proto__ and constructor read as hits.
test('auth:link --claim rejects an inherited property name', async () => {
  const sandbox = await makeSandbox();
  try {
    for (const code of ['__proto__', 'constructor', 'toString']) {
      const result = await runCli(['auth:link', '--claim', code], {
        cwd: sandbox.cwd,
        env: { HOME: sandbox.home },
      });
      const out = parseJsonOrNull(result.stdout);
      assert.match(out?.error ?? '', /No pending link/, `${code} was treated as a pending link`);
    }
  } finally {
    await sandbox.cleanup();
  }
});

test('setup writes local config and .gitignore entry', async () => {
  const sandbox = await makeSandbox();
  try {
    const result = await runCli(
      ['setup', '--key', 'typ_setup_key', '--location', 'local'],
      { cwd: sandbox.cwd, env: { HOME: sandbox.home } }
    );

    assert.equal(result.code, 0);
    const out = parseJsonOrNull(result.stdout);
    assert.equal(out.success, true);
    assert.equal(out.scope, 'local');

    const cfg = JSON.parse(await fs.readFile(path.join(sandbox.cwd, '.postey', 'config.json'), 'utf8'));
    assert.equal(cfg.apiKey, 'typ_setup_key');
    assert.ok((await fs.readFile(path.join(sandbox.cwd, '.gitignore'), 'utf8')).includes('.postey/'));
  } finally {
    await sandbox.cleanup();
  }
});


test('legacy commands not implemented return unknown command', async () => {
  const sandbox = await makeSandbox();
  try {
    for (const args of [
      ['drafts:update', '1', '2'],
      ['update-draft', '2'],
      ['media:status', '1'],
      ['social-sets:get', '1'],
      ['social-sets:list'],
      ['drafts:list'],
      ['drafts:create', '--text', 'x'],
      ['create-draft', 'x'],
      ['drafts:publish', '1'],
      ['drafts:delete', '1'],
      ['drafts:schedule', '1', '--time', '2026-01-01T00:00:00Z'],
      ['drafts:content', '1', '--platform', 'X'],
      ['tags:list'],
      ['tags:create', '--tag', 'x', '--color', 'BLUE'],
      ['tags:update', '22', '--tag', 'x', '--color', 'BLUE'],
      ['tags:delete', '22'],
      ['config:set-default', '123', 'X'],
      ['video:post', '317', '--video', 'x.mp4', '--text', 'x', '--platforms', 'X'],
    ]) {
      const result = await runCli(args, {
        cwd: sandbox.cwd,
        env: { HOME: sandbox.home, POSTEY_API_KEY: 'typ_test_key' },
      });
      assert.equal(result.code, 1);
      assert.ok(parseJsonOrNull(result.stdout)?.error?.startsWith('Unknown command:'));
    }
  } finally {
    await sandbox.cleanup();
  }
});

test('video subcommand: no subcommand exits 1 with JSON error', async () => {
  const sandbox = await makeSandbox();
  try {
    const result = await runCli(['video'], {
      cwd: sandbox.cwd,
      env: { HOME: sandbox.home, POSTEY_API_KEY: 'typ_test_key' },
    });
    assert.equal(result.code, 1);
    assert.ok(parseJsonOrNull(result.stdout)?.error);
  } finally {
    await sandbox.cleanup();
  }
});

test('video post --dry-run outputs dry_run:true without network calls', async () => {
  const sandbox = await makeSandbox();
  // Write a minimal valid MP4-like file (just needs to exist; ffmpeg not called in dry-run)
  const videoPath = path.join(sandbox.cwd, 'test.mp4');
  await fs.writeFile(videoPath, Buffer.alloc(16));
  try {
    const result = await runCli(
      ['video', 'post', '--video', videoPath, '--text', 'Caption', '--platforms', 'X', '--account-id', '317', '--dry-run'],
      { cwd: sandbox.cwd, env: { HOME: sandbox.home, POSTEY_API_KEY: 'typ_test_key' } }
    );
    assert.equal(result.code, 0);
    const out = parseJsonOrNull(result.stdout);
    assert.equal(out?.dry_run, true);
    // Draft creation is MCP's; the dry run names the tool it hands off to.
    assert.equal(out?.would_call, 'create_post');
    assert.equal(out?.would_call_via, 'mcp');
  } finally {
    await sandbox.cleanup();
  }
});

test('video trim --end and --duration are mutually exclusive', async () => {
  const sandbox = await makeSandbox();
  const videoPath = path.join(sandbox.cwd, 'clip.mp4');
  await fs.writeFile(videoPath, Buffer.alloc(16));
  try {
    const result = await runCli(
      ['video', 'trim', '--file', videoPath, '--start', '0', '--end', '10', '--duration', '10'],
      { cwd: sandbox.cwd, env: { HOME: sandbox.home, POSTEY_API_KEY: '' } }
    );
    assert.equal(result.code, 1);
    assert.ok(parseJsonOrNull(result.stdout)?.error);
  } finally {
    await sandbox.cleanup();
  }
});

test('video trim requires --end or --duration', async () => {
  const sandbox = await makeSandbox();
  const videoPath = path.join(sandbox.cwd, 'clip.mp4');
  await fs.writeFile(videoPath, Buffer.alloc(16));
  try {
    const result = await runCli(
      ['video', 'trim', '--file', videoPath, '--start', '0'],
      { cwd: sandbox.cwd, env: { HOME: sandbox.home, POSTEY_API_KEY: '' } }
    );
    assert.equal(result.code, 1);
    assert.ok(parseJsonOrNull(result.stdout)?.error);
  } finally {
    await sandbox.cleanup();
  }
});

// The skill is a strict extension of MCP: it must not ship a second path to an
// effect MCP already owns (docs/skills-mcp-contract.md). These commands were
// removed for exactly that reason; this asserts they cannot quietly return.
for (const command of ['drafts:get', 'posts:create']) {
  test(`${command} is rejected — MCP owns that effect`, async () => {
    const sandbox = await makeSandbox();
    try {
      const result = await runCli([command, '101'], {
        cwd: sandbox.cwd,
        env: { HOME: sandbox.home, POSTEY_API_KEY: 'typ_test_key' },
      });
      assert.equal(result.code, 1);
      assert.match(parseJsonOrNull(result.stdout)?.error ?? '', /Unknown command/);
    } finally {
      await sandbox.cleanup();
    }
  });
}

test('video post refuses to schedule or publish', async () => {
  const sandbox = await makeSandbox();
  const videoPath = path.join(sandbox.cwd, 'clip.mp4');
  await fs.writeFile(videoPath, Buffer.alloc(16));
  try {
    const result = await runCli(
      ['video', 'post', '--video', videoPath, '--text', 'Caption', '--platforms', 'X',
       '--account-id', '317', '--publish-now'],
      { cwd: sandbox.cwd, env: { HOME: sandbox.home, POSTEY_API_KEY: 'typ_test_key' } }
    );
    assert.equal(result.code, 1);
    assert.match(parseJsonOrNull(result.stdout)?.error ?? '', /MCP operations/);
  } finally {
    await sandbox.cleanup();
  }
});


// ── auth:link ────────────────────────────────────────────────────────────────
//
// The flow exists so that one consent covers the MCP server and this CLI. Its
// security rests on the credential never travelling through the agent, so the
// tests below assert what is ABSENT from `--begin`'s output as carefully as
// what is present.

const { writeFileSync, mkdirSync, readFileSync } = require('node:fs');

function writeGlobalConfig(home, obj) {
  const dir = path.join(home, '.config', 'postey');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'config.json'), JSON.stringify(obj), { mode: 0o600 });
}

function readGlobalConfig(home) {
  return JSON.parse(readFileSync(path.join(home, '.config', 'postey', 'config.json'), 'utf8'));
}

test('auth:link --begin prints a code and a challenge, and no secret', async () => {
  const sandbox = await makeSandbox();
  try {
    const result = await runCli(['auth:link', '--begin'], {
      cwd: sandbox.cwd,
      env: { HOME: sandbox.home, POSTEY_API_KEY: '' },
    });
    assert.equal(result.code, 0);
    const out = JSON.parse(result.stdout);

    assert.match(out.link_code, /^link_[A-Za-z0-9_-]{43}$/);
    assert.match(out.code_challenge, /^[A-Za-z0-9_-]{43}$/);

    // The verifier is the secret. It must be on disk and nowhere in stdout —
    // stdout is what the agent reads, and what its transcript keeps forever.
    const stored = readGlobalConfig(sandbox.home).pendingLinks[out.link_code].verifier;
    assert.ok(stored && stored.length >= 43);
    assert.ok(!result.stdout.includes(stored), 'the verifier leaked into stdout');
    assert.ok(!/token/i.test(result.stdout), 'begin must not mention a token');
  } finally {
    await sandbox.cleanup();
  }
});

test('auth:link --begin makes no network call', async () => {
  // An unattended agent runs this mid-turn. If it reached the network it could
  // block, and rule 1 of setup.md is that a setup step never blocks.
  const sandbox = await makeSandbox();
  const mock = createMockServer();
  const { baseUrl } = await mock.listen();
  try {
    await runCli(['auth:link', '--begin'], {
      cwd: sandbox.cwd,
      env: { HOME: sandbox.home, POSTEY_API_KEY: '', POSTEY_API_BASE: baseUrl },
    });
    assert.equal(mock.requests.length, 0);
  } finally {
    await mock.close();
    await sandbox.cleanup();
  }
});

test('auth:link --claim sends the verifier, stores the token, prints neither', async () => {
  const sandbox = await makeSandbox();
  const mock = createMockServer();
  const { baseUrl } = await mock.listen();
  try {
    const begun = JSON.parse(
      (await runCli(['auth:link', '--begin'], {
        cwd: sandbox.cwd,
        env: { HOME: sandbox.home, POSTEY_API_KEY: '' },
      })).stdout
    );
    const verifier = readGlobalConfig(sandbox.home).pendingLinks[begun.link_code].verifier;

    mock.expect('POST', '/auth/mcp/cli-link/claim', {
      assert: (req) => {
        assert.equal(req.bodyJson.link_code, begun.link_code);
        assert.equal(req.bodyJson.code_verifier, verifier);
      },
      json: { token: 'pat_secret_value', token_prefix: 'pat_secr', client_id: 'self:postey-cli' },
    });

    const result = await runCli(['auth:link', '--claim', begun.link_code], {
      cwd: sandbox.cwd,
      env: { HOME: sandbox.home, POSTEY_API_KEY: '', POSTEY_API_BASE: baseUrl },
    });

    assert.equal(result.code, 0);
    assert.ok(!result.stdout.includes('pat_secret_value'), 'the token leaked into stdout');
    assert.equal(readGlobalConfig(sandbox.home).cliToken, 'pat_secret_value');
    mock.assertNoPendingExpectations();
  } finally {
    await mock.close();
    await sandbox.cleanup();
  }
});

test('a claim can only be made once', async () => {
  const sandbox = await makeSandbox();
  const mock = createMockServer();
  const { baseUrl } = await mock.listen();
  try {
    const begun = JSON.parse(
      (await runCli(['auth:link', '--begin'], {
        cwd: sandbox.cwd, env: { HOME: sandbox.home, POSTEY_API_KEY: '' },
      })).stdout
    );
    mock.expect('POST', '/auth/mcp/cli-link/claim', {
      json: { token: 'pat_one', token_prefix: 'pat_one' },
    });
    const env = { HOME: sandbox.home, POSTEY_API_KEY: '', POSTEY_API_BASE: baseUrl };
    await runCli(['auth:link', '--claim', begun.link_code], { cwd: sandbox.cwd, env });

    // The verifier is consumed locally, so a replay never reaches the server.
    const second = await runCli(['auth:link', '--claim', begun.link_code], { cwd: sandbox.cwd, env });
    assert.notEqual(second.code, 0);
    assert.equal(mock.requests.length, 1, 'the replay hit the network');
  } finally {
    await mock.close();
    await sandbox.cleanup();
  }
});

test('a linked CLI authenticates as a bearer, never as X-API-Key', async () => {
  // A pat_ presented in X-API-Key is resolved by a different server path and
  // would 401, so the header this picks is load-bearing, not cosmetic.
  const sandbox = await makeSandbox();
  const mock = createMockServer();
  const { baseUrl } = await mock.listen();
  try {
    writeGlobalConfig(sandbox.home, { cliToken: 'pat_linked_token' });
    const clip = path.join(sandbox.cwd, 'clip.mp4');
    writeFileSync(clip, Buffer.from('00000018667479706d703432', 'hex'));

    // Under the 50 MB chunked threshold, so this is the single-shot path.
    mock.expect('POST', '/media/unlinked', {
      status: 500,
      json: { detail: 'stop here — the header is what this test is for' },
    });

    await runCli(['media:upload', '--file', clip, '--platform', 'X'], {
      cwd: sandbox.cwd,
      env: { HOME: sandbox.home, POSTEY_API_KEY: '', POSTEY_API_BASE: baseUrl },
    });

    // Asserted on the RECORDED request, not inside the mock's `assert` hook.
    // A throw in that hook is caught by the server, answered as a 500, and the
    // expectation is consumed either way — so a header assertion written there
    // passes whatever the CLI sent. This was verified by sending the token in
    // X-API-Key on purpose: the hook version stayed green.
    assert.equal(mock.requests.length, 1, 'the CLI never made the request');
    const sent = mock.requests[0].headers;
    assert.equal(sent.authorization, 'Bearer pat_linked_token');
    assert.equal(sent['x-api-key'], undefined);
  } finally {
    await mock.close();
    await sandbox.cleanup();
  }
});

test('config:show reports a linked CLI as configured', async () => {
  const sandbox = await makeSandbox();
  try {
    writeGlobalConfig(sandbox.home, { cliToken: 'pat_linked_token' });
    const result = await runCli(['config:show'], {
      cwd: sandbox.cwd,
      env: { HOME: sandbox.home, POSTEY_API_KEY: '' },
    });
    const out = JSON.parse(result.stdout);
    assert.equal(out.configured, true);
    assert.equal(out.auth_method, 'linked (auth:link)');
    assert.ok(!result.stdout.includes('pat_linked_token'), 'the token leaked into config:show');
  } finally {
    await sandbox.cleanup();
  }
});
