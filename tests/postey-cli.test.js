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
      hint: 'Run: postey.js setup',
      api_key_url: 'https://app.postey.ai?settings=api',
    });
  } finally {
    await sandbox.cleanup();
  }
});

test('config:show reads local config and reports default social set source', async () => {
  const sandbox = await makeSandbox();
  try {
    const cfgDir = path.join(sandbox.cwd, '.postey');
    await fs.mkdir(cfgDir, { recursive: true });
    await fs.writeFile(
      path.join(cfgDir, 'config.json'),
      JSON.stringify({ apiKey: 'typ_local_key', defaultSocialSetId: '123' }, null, 2)
    );

    const result = await runCli(['config:show'], {
      cwd: sandbox.cwd,
      env: { HOME: sandbox.home, POSTEY_API_KEY: '' },
    });

    assert.equal(result.code, 0);
    const out = parseJsonOrNull(result.stdout);
    assert.equal(out.configured, true);
    assert.ok(out.active_source.endsWith(path.join('.postey', 'config.json')));
    assert.equal(out.api_key_preview, 'typ_loca...');
    assert.equal(out.default_social_set.id, '123');
  } finally {
    await sandbox.cleanup();
  }
});

test('setup --no-default writes local config and .gitignore entry', async () => {
  const sandbox = await makeSandbox();
  try {
    const result = await runCli(
      ['setup', '--key', 'typ_setup_key', '--location', 'local', '--no-default'],
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

test('setup with --default-social-set validates social set via API', async () => {
  const sandbox = await makeSandbox();
  const server = createMockServer();
  const { baseUrl } = await server.listen();

  server.expect('GET', '/social-sets/123', {
    assert: authAssertFactory('typ_setup_key'),
    json: { id: '123' },
  });

  try {
    const result = await runCli(
      ['setup', '--key', 'typ_setup_key', '--location', 'local', '--default-social-set', '123'],
      { cwd: sandbox.cwd, env: { HOME: sandbox.home, POSTEY_API_BASE: baseUrl } }
    );

    assert.equal(result.code, 0);
    const cfg = JSON.parse(await fs.readFile(path.join(sandbox.cwd, '.postey', 'config.json'), 'utf8'));
    assert.equal(cfg.defaultSocialSetId, '123');
    server.assertNoPendingExpectations();
  } finally {
    await server.close();
    await sandbox.cleanup();
  }
});

test('social-sets:list hits /accounts', async () => {
  const sandbox = await makeSandbox();
  const server = createMockServer();
  const { baseUrl } = await server.listen();
  const apiKey = 'typ_test_key';

  server.expect('GET', '/accounts', {
    assert: authAssertFactory(apiKey),
    json: { results: [{ id: 9, name: 'Main' }] },
  });

  try {
    const result = await runCli(['social-sets:list'], {
      cwd: sandbox.cwd,
      env: { HOME: sandbox.home, POSTEY_API_BASE: baseUrl, POSTEY_API_KEY: apiKey },
    });
    assert.equal(result.code, 0);
    assert.deepEqual(parseJsonOrNull(result.stdout), { results: [{ id: 9, name: 'Main' }] });
    server.assertNoPendingExpectations();
  } finally {
    await server.close();
    await sandbox.cleanup();
  }
});

test('drafts:list builds expected /posts query', async () => {
  const sandbox = await makeSandbox();
  const server = createMockServer();
  const { baseUrl } = await server.listen();
  const apiKey = 'typ_test_key';

  server.expect('GET', '/posts', {
    assert: (req) => {
      authAssertFactory(apiKey)(req);
      const q = new URL('http://x' + req.path + req.search).searchParams;
      assert.equal(q.get('account'), '9');
      assert.equal(q.get('limit'), '3');
      assert.equal(q.get('status'), 'scheduled');
      assert.equal(q.get('tag'), 'launch');
      assert.equal(q.get('order_by'), '-created_at');
    },
    json: { results: [{ id: 101 }] },
  });

  try {
    const result = await runCli(
      ['drafts:list', '--social-set-id', '9', '--limit', '3', '--status', 'scheduled', '--tag', 'launch', '--sort', '-created_at'],
      { cwd: sandbox.cwd, env: { HOME: sandbox.home, POSTEY_API_BASE: baseUrl, POSTEY_API_KEY: apiKey } }
    );
    assert.equal(result.code, 0);
    assert.deepEqual(parseJsonOrNull(result.stdout), { results: [{ id: 101 }] });
    server.assertNoPendingExpectations();
  } finally {
    await server.close();
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

test('drafts:create posts to /posts/raw', async () => {
  const sandbox = await makeSandbox();
  const server = createMockServer();
  const { baseUrl } = await server.listen();
  const apiKey = 'typ_test_key';

  server.expect('POST', '/posts/raw', {
    assert: (req) => {
      authAssertFactory(apiKey)(req);
      assert.deepEqual(req.bodyJson, {
        account_id: 9,
        platforms: ['X'],
        contents: [{ text: 'Hello' }],
        publish_now: false,
        schedule_at: null,
        draft_title: 'Untitled Draft',
        tags: [1, 2],
      });
    },
    json: { id: 101 },
  });

  try {
    const result = await runCli(
      ['drafts:create', '--social-set-id', '9', '--platform', 'x', '--text', 'Hello', '--tags', '1,2'],
      { cwd: sandbox.cwd, env: { HOME: sandbox.home, POSTEY_API_BASE: baseUrl, POSTEY_API_KEY: apiKey } }
    );
    assert.equal(result.code, 0);
    assert.deepEqual(parseJsonOrNull(result.stdout), { id: 101 });
    server.assertNoPendingExpectations();
  } finally {
    await server.close();
    await sandbox.cleanup();
  }
});

test('create-draft alias forwards positional text and account id', async () => {
  const sandbox = await makeSandbox();
  const server = createMockServer();
  const { baseUrl } = await server.listen();
  const apiKey = 'typ_test_key';

  server.expect('POST', '/posts/raw', {
    assert: (req) => {
      authAssertFactory(apiKey)(req);
      assert.equal(req.bodyJson.account_id, 9);
      assert.equal(req.bodyJson.contents[0].text, 'Hello alias');
      assert.deepEqual(req.bodyJson.platforms, ['X']);
    },
    json: { id: 202 },
  });

  try {
    const result = await runCli(
      ['create-draft', 'Hello', 'alias', '--social-set-id', '9', '--platform', 'x'],
      { cwd: sandbox.cwd, env: { HOME: sandbox.home, POSTEY_API_BASE: baseUrl, POSTEY_API_KEY: apiKey } }
    );
    assert.equal(result.code, 0);
    assert.deepEqual(parseJsonOrNull(result.stdout), { id: 202 });
    server.assertNoPendingExpectations();
  } finally {
    await server.close();
    await sandbox.cleanup();
  }
});

test('drafts:create rejects unsupported flags for /posts/raw', async () => {
  const sandbox = await makeSandbox();
  try {
    const result = await runCli(
      ['drafts:create', '--social-set-id', '9', '--platform', 'x', '--text', 'Hello', '--share'],
      { cwd: sandbox.cwd, env: { HOME: sandbox.home, POSTEY_API_KEY: 'typ_test_key' } }
    );
    assert.equal(result.code, 1);
    const out = parseJsonOrNull(result.stdout);
    assert.equal(out.error, 'Unsupported options for /posts/raw create');
    assert.ok(Array.isArray(out.unsupported));
  } finally {
    await sandbox.cleanup();
  }
});

test('drafts:schedule uses inferred enabled platforms from /posts/<id>', async () => {
  const sandbox = await makeSandbox();
  const server = createMockServer();
  const { baseUrl } = await server.listen();
  const apiKey = 'typ_test_key';

  server.expect('GET', '/posts/101', {
    assert: authAssertFactory(apiKey),
    json: {
      id: 101,
      platforms: {
        X: { enabled: true },
        LINKEDIN: { enabled: true },
        THREADS: { enabled: false },
      },
    },
  });

  server.expect('PATCH', '/schedules', {
    assert: (req) => {
      authAssertFactory(apiKey)(req);
      assert.deepEqual(req.bodyJson, {
        post_id: 101,
        platforms: [
          { platform: 'X', config: {} },
          { platform: 'LINKEDIN', config: {} },
        ],
        scheduled_at: '2026-02-20T14:00:00Z',
        natural_posting: false,
      });
    },
    json: { success: true },
  });

  try {
    const result = await runCli(
      ['drafts:schedule', '101', '--time', '2026-02-20T14:00:00Z'],
      { cwd: sandbox.cwd, env: { HOME: sandbox.home, POSTEY_API_BASE: baseUrl, POSTEY_API_KEY: apiKey } }
    );
    assert.equal(result.code, 0);
    assert.deepEqual(parseJsonOrNull(result.stdout), { success: true });
    server.assertNoPendingExpectations();
  } finally {
    await server.close();
    await sandbox.cleanup();
  }
});

test('drafts:publish with --platform sends publish payload', async () => {
  const sandbox = await makeSandbox();
  const server = createMockServer();
  const { baseUrl } = await server.listen();
  const apiKey = 'typ_test_key';

  server.expect('POST', '/publish', {
    assert: (req) => {
      authAssertFactory(apiKey)(req);
      assert.deepEqual(req.bodyJson, {
        post_id: 101,
        platforms: [{ platform: 'X', config: {} }],
        natural_posting: false,
      });
    },
    json: { published: true },
  });

  try {
    const result = await runCli(
      ['drafts:publish', '101', '--platform', 'x'],
      { cwd: sandbox.cwd, env: { HOME: sandbox.home, POSTEY_API_BASE: baseUrl, POSTEY_API_KEY: apiKey } }
    );
    assert.equal(result.code, 0);
    assert.deepEqual(parseJsonOrNull(result.stdout), { published: true });
    server.assertNoPendingExpectations();
  } finally {
    await server.close();
    await sandbox.cleanup();
  }
});

test('drafts:delete sends DELETE /posts with id array body', async () => {
  const sandbox = await makeSandbox();
  const server = createMockServer();
  const { baseUrl } = await server.listen();
  const apiKey = 'typ_test_key';

  server.expect('DELETE', '/posts', {
    assert: (req) => {
      authAssertFactory(apiKey)(req);
      assert.deepEqual(req.bodyJson, ['101']);
    },
    json: {},
  });

  try {
    const result = await runCli(['drafts:delete', '101'], {
      cwd: sandbox.cwd,
      env: { HOME: sandbox.home, POSTEY_API_BASE: baseUrl, POSTEY_API_KEY: apiKey },
    });
    assert.equal(result.code, 0);
    assert.deepEqual(parseJsonOrNull(result.stdout), { success: true, message: 'Draft deleted' });
    server.assertNoPendingExpectations();
  } finally {
    await server.close();
    await sandbox.cleanup();
  }
});

test('tags:list and tags:create hit /tags endpoints', async () => {
  const sandbox = await makeSandbox();
  const server = createMockServer();
  const { baseUrl } = await server.listen();
  const apiKey = 'typ_test_key';

  server.expect('GET', '/tags', {
    assert: (req) => {
      authAssertFactory(apiKey)(req);
      assert.equal(req.search, '?account=9');
    },
    json: { results: [{ id: 1, tag: 'launch' }] },
  });

  server.expect('POST', '/tags', {
    assert: (req) => {
      authAssertFactory(apiKey)(req);
      assert.deepEqual(req.bodyJson, { account_id: 9, tag: 'Launch', color: 'BLUE' });
    },
    json: { id: 2, tag: 'Launch' },
  });

  try {
    const listRes = await runCli(['tags:list', '--social-set-id', '9'], {
      cwd: sandbox.cwd,
      env: { HOME: sandbox.home, POSTEY_API_BASE: baseUrl, POSTEY_API_KEY: apiKey },
    });
    assert.equal(listRes.code, 0);

    const createRes = await runCli(['tags:create', '--social-set-id', '9', '--tag', 'Launch', '--color', 'blue'], {
      cwd: sandbox.cwd,
      env: { HOME: sandbox.home, POSTEY_API_BASE: baseUrl, POSTEY_API_KEY: apiKey },
    });
    assert.equal(createRes.code, 0);

    server.assertNoPendingExpectations();
  } finally {
    await server.close();
    await sandbox.cleanup();
  }
});

test('config:set-default writes account platform preference via API', async () => {
  const sandbox = await makeSandbox();
  const server = createMockServer();
  const { baseUrl } = await server.listen();
  const apiKey = 'typ_test_key';

  server.expect('GET', '/accounts/preferences/9', {
    assert: authAssertFactory(apiKey),
    json: {},
  });

  server.expect('POST', '/accounts/preferences/9', {
    assert: (req) => {
      authAssertFactory(apiKey)(req);
      assert.equal(req.search, '?default_platform=X');
    },
    json: { ok: true },
  });

  try {
    const result = await runCli(['config:set-default', '--social-set-id', '9', '--platform', 'x'], {
      cwd: sandbox.cwd,
      env: { HOME: sandbox.home, POSTEY_API_BASE: baseUrl, POSTEY_API_KEY: apiKey },
    });

    assert.equal(result.code, 0);
    const out = parseJsonOrNull(result.stdout);
    assert.equal(out.success, true);
    assert.equal(out.account_id, 9);
    assert.equal(out.default_platform, 'X');
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
