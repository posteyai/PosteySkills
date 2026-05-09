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
      api_key_url: 'https://app.postey.ai?settings=api',
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


test('drafts:get fetches /posts/<id>', async () => {
  const sandbox = await makeSandbox();
  const server = createMockServer();
  const { baseUrl } = await server.listen();
  const apiKey = 'typ_test_key';

  server.expect('GET', '/posts/101', {
    assert: authAssertFactory(apiKey),
    json: { id: 101, title: 'Draft' },
  });

  try {
    const result = await runCli(['drafts:get', '101'], {
      cwd: sandbox.cwd,
      env: { HOME: sandbox.home, POSTEY_API_BASE: baseUrl, POSTEY_API_KEY: apiKey },
    });
    assert.equal(result.code, 0);
    assert.deepEqual(parseJsonOrNull(result.stdout), { id: 101, title: 'Draft' });
    server.assertNoPendingExpectations();
  } finally {
    await server.close();
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

test('posts:create posts to /posts/raw and returns post_id', async () => {
  const sandbox = await makeSandbox();
  const server = createMockServer();
  const { baseUrl } = await server.listen();
  const apiKey = 'typ_test_key';

  server.expect('POST', '/posts/raw', {
    assert(req) {
      assert.equal(req.headers['x-api-key'], apiKey);
      assert.equal(req.bodyJson.account_id, 317);
      assert.deepEqual(req.bodyJson.platforms, ['INSTAGRAM']);
      assert.equal(req.bodyJson.contents[0].text, 'Hello world');
    },
    json: { id: 99, status: 'draft' },
  });

  try {
    const result = await runCli(
      ['posts:create', '--account-id', '317', '--platforms', 'INSTAGRAM', '--text', 'Hello world'],
      { cwd: sandbox.cwd, env: { HOME: sandbox.home, POSTEY_API_BASE: baseUrl, POSTEY_API_KEY: apiKey } }
    );
    assert.equal(result.code, 0);
    const out = parseJsonOrNull(result.stdout);
    assert.equal(out.id, 99);
    server.assertNoPendingExpectations();
  } finally {
    await server.close();
    await sandbox.cleanup();
  }
});

test('posts:create exits 1 with JSON error when --platforms is missing', async () => {
  const sandbox = await makeSandbox();
  try {
    const result = await runCli(
      ['posts:create', '--account-id', '317', '--text', 'Hello'],
      { cwd: sandbox.cwd, env: { HOME: sandbox.home, POSTEY_API_KEY: 'typ_test_key' } }
    );
    assert.equal(result.code, 1);
    assert.ok(parseJsonOrNull(result.stdout)?.error);
  } finally {
    await sandbox.cleanup();
  }
});

test('posts:create exits 1 with JSON error for invalid platform', async () => {
  const sandbox = await makeSandbox();
  try {
    const result = await runCli(
      ['posts:create', '--account-id', '317', '--platforms', 'BADPLATFORM', '--text', 'Hi'],
      { cwd: sandbox.cwd, env: { HOME: sandbox.home, POSTEY_API_KEY: 'typ_test_key' } }
    );
    assert.equal(result.code, 1);
    const out = parseJsonOrNull(result.stdout);
    assert.ok(out?.error);
    assert.ok(Array.isArray(out?.allowed));
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
    assert.ok(out?.would_call === 'posts:create' || out?.payload !== undefined);
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
