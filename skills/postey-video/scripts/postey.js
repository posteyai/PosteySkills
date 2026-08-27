#!/usr/bin/env node

/**
 * Postey CLI - Manage social media posts via the Postey API
 *
 * Zero dependencies - uses only Node.js built-in modules
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const readline = require("readline");
const http = require("http");
const { createHash, randomBytes } = require("crypto");
const { spawn, spawnSync } = require("child_process");
const { validateMedia, MIME_TYPES } = require("./mediaValidator");
const { _VIDEO_CAPABLE_PLATFORMS, _VIDEO_CHAR_LIMITS, _which, _detectWhisper, _gcd, _vTruncate, _sanitizeFname, _findVideoFile, _vRun, _buildThumbnail } = require("./videoUtils");

// Allow overriding API base for tests / self-hosted mocks.
const API_BASE = process.env.POSTEY_API_BASE || "https://srvr.postey.ai/v1";
const GLOBAL_CONFIG_DIR = path.join(os.homedir(), ".config", "postey");
const GLOBAL_CONFIG_FILE = path.join(GLOBAL_CONFIG_DIR, "config.json");
const LOCAL_CONFIG_DIR = ".postey";
const LOCAL_CONFIG_FILE = path.join(LOCAL_CONFIG_DIR, "config.json");
const API_KEY_URL = "https://app.postey.ai?settings=agents&section=advanced";

// ── OAuth 2.1 / PKCE constants ────────────────────────────────────────────────
// auth:login uses Dynamic Client Registration (DCR) so no static client ID is
// needed. The authorize redirect lands on app.postey.ai/auth/mcp-consent —
// the same branded consent UI used by the MCP server.
//
// Endpoints discovered via https://srvr.postey.ai/.well-known/oauth-authorization-server
const OAUTH_REGISTER_URL =
  process.env.POSTEY_OAUTH_REGISTER_URL || "https://srvr.postey.ai/register";
const OAUTH_AUTHORIZE_URL =
  process.env.POSTEY_OAUTH_AUTHORIZE_URL || "https://srvr.postey.ai/authorize";
const OAUTH_TOKEN_URL =
  process.env.POSTEY_OAUTH_TOKEN_URL || "https://srvr.postey.ai/token";
// Set POSTEY_CLI_CLIENT_ID to skip DCR and use a pre-registered client (e.g. CI).
const OAUTH_CLIENT_ID_OVERRIDE = process.env.POSTEY_CLI_CLIENT_ID || null;
const OAUTH_SCOPES =
  "post:read post:edit post:delete " +
  "publishing:read publishing:edit " +
  "scheduling:read scheduling:edit scheduling:delete " +
  "analytics:read " +
  "comments:read comments:edit comments:delete";
const OAUTH_CALLBACK_PORT = parseInt(process.env.POSTEY_CLI_CALLBACK_PORT || "9150", 10);
const OAUTH_TIMEOUT_MS = 120_000; // 2 min for user to complete browser flow

// Derived from capability-snapshot.json, which scripts/refresh-capability-snapshot.js
// mirrors out of postey://skill-manifest. This was a literal that had to "match
// SKILL.md `platforms:`" by hand — three copies of one fact, which is how the skill
// came to advertise seven platforms against a server serving nine (S9.5).
// Read at require-time from disk, so the CLI still validates args with no network.
const SOCIAL_PLATFORMS = new Set(
  require("../capability-snapshot.json").platforms,
);

const POST_TYPE_MAP = { X: 0, LINKEDIN: 2, THREADS: 9, FACEBOOK: 4, INSTAGRAM: 5, YOUTUBE: 10, TIKTOK: 7, BLUESKY: 8 };


// ============================================================================
// ANSI Color Helpers (no dependencies)
// Only apply colors when outputting to a TTY (terminal)

const isColorSupported = process.stderr.isTTY;

const colors = {
  reset: isColorSupported ? "\x1b[0m" : "",
  bold: isColorSupported ? "\x1b[1m" : "",
  dim: isColorSupported ? "\x1b[2m" : "",
  green: isColorSupported ? "\x1b[32m" : "",
  yellow: isColorSupported ? "\x1b[33m" : "",
  blue: isColorSupported ? "\x1b[34m" : "",
  cyan: isColorSupported ? "\x1b[36m" : "",
  white: isColorSupported ? "\x1b[37m" : "",
  gray: isColorSupported ? "\x1b[90m" : "",
};

// Formatting helpers
const fmt = {
  title: (text) => `${colors.bold}${colors.cyan}${text}${colors.reset}`,
  success: (text) => `${colors.green}✓${colors.reset} ${text}`,
  warn: (text) => `${colors.yellow}⚠${colors.reset}  ${text}`,
  info: (text) => `${colors.blue}→${colors.reset} ${text}`,
  dim: (text) => `${colors.dim}${text}${colors.reset}`,
  bold: (text) => `${colors.bold}${text}${colors.reset}`,
  link: (text) => `${colors.cyan}${text}${colors.reset}`,
  num: (n) => `${colors.yellow}${n}${colors.reset}`,
  label: (text) => `${colors.dim}${text}${colors.reset}`,
};

// ============================================================================
// Utilities
// ============================================================================

function output(data) {
  console.log(JSON.stringify(data, null, 2));
}

function error(message, details = {}) {
  output({ error: message, ...details });
  process.exit(1);
}

function readConfigFile(configPath) {
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, "utf-8");
      return JSON.parse(content);
    }
  } catch {
    // Invalid JSON or read error - ignore
  }
  return null;
}

const LOCAL_CONFIG_PATH = () => path.join(process.cwd(), LOCAL_CONFIG_FILE);

function _resolvedCwd() {
  try {
    return fs.realpathSync(process.cwd());
  } catch {
    return path.resolve(process.cwd());
  }
}

// A local config is only honoured in the directory it was created for.
// `setup --location local` and `auth:login --local` stamp `scope_path`; a config
// that arrived by clone, copy or archive carries somebody else's path, and using
// it would silently authenticate as them and upload to their account.
function readLocalConfig() {
  const file = LOCAL_CONFIG_PATH();
  const cfg = readConfigFile(file);
  if (!cfg) return null;
  // realpath both sides: process.cwd() resolves symlinks and a stamped path may
  // not (/tmp vs /private/tmp on macOS), so a plain string compare rejects a
  // config that is genuinely this directory's.
  const real = (d) => {
    try {
      return fs.realpathSync(d);
    } catch {
      return path.resolve(d);
    }
  };
  const here = real(process.cwd());
  if (cfg.scope_path && real(cfg.scope_path) === here) return cfg;
  if (process.env.POSTEY_TRUST_LOCAL_CONFIG === "1") return cfg;
  console.error(
    fmt.warn(
      `Ignoring ${file}: it was not created for this directory. ` +
        `Re-run 'postey.js setup --key <key> --location local' here, or set ` +
        `POSTEY_TRUST_LOCAL_CONFIG=1 if you are certain it is yours.`
    )
  );
  return null;
}

function _getConfigValue(fieldName, envVar) {
  if (envVar && process.env[envVar]) return { source: "environment variable", value: process.env[envVar] };
  const local = readLocalConfig();
  if (local?.[fieldName]) return { source: LOCAL_CONFIG_PATH(), value: local[fieldName] };
  const global = readConfigFile(GLOBAL_CONFIG_FILE);
  if (global?.[fieldName]) return { source: GLOBAL_CONFIG_FILE, value: global[fieldName] };
  return null;
}

function getApiKey() {
  const r = _getConfigValue("apiKey", "POSTEY_API_KEY");
  return r ? { source: r.source, key: r.value } : null;
}

function getDefaultAccountId() {
  const r = _getConfigValue("defaultAccountId");
  return r ? { source: r.source, id: r.value } : null;
}

// ── OAuth helpers ─────────────────────────────────────────────────────────────

function generateCodeVerifier() {
  // RFC 7636 — 43-128 char base64url string
  return randomBytes(64).toString("base64url");
}

function generateCodeChallenge(verifier) {
  return createHash("sha256").update(verifier).digest("base64url");
}

function decodeJwtPayload(token) {
  const parts = (token || "").split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function getOAuthConfig() {
  // Only look in global config — tokens are user-level, not project-level.
  return readConfigFile(GLOBAL_CONFIG_FILE)?.oauth || null;
}

function saveOAuthConfig(tokens) {
  const existing = readConfigFile(GLOBAL_CONFIG_FILE) || {};
  writeConfig(GLOBAL_CONFIG_FILE, { ...existing, oauth: tokens });
}

function clearOAuthConfig() {
  const existing = readConfigFile(GLOBAL_CONFIG_FILE) || {};
  delete existing.oauth;
  writeConfig(GLOBAL_CONFIG_FILE, existing);
}

async function refreshAccessToken(refreshToken, clientId) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId || OAUTH_CLIENT_ID_OVERRIDE || "",
    refresh_token: refreshToken,
  });

  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.error || `Token refresh failed (${res.status})`);
  }
  return data;
}

// Registers a dynamic OAuth client via DCR and returns { client_id, client_secret? }.
// Skips registration and returns the override client ID when POSTEY_CLI_CLIENT_ID is set.
async function registerOAuthClient(redirectUri) {
  if (OAUTH_CLIENT_ID_OVERRIDE) return { client_id: OAUTH_CLIENT_ID_OVERRIDE };
  const res = await fetch(OAUTH_REGISTER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      client_name: "Postey CLI",
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.error || `DCR failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

// Returns the Authorization header value for the current session.
// Priority: env API key → env bearer token → OAuth token (auto-refresh) → config API key.
async function getAuthHeader() {
  // 1. Env override (API key) — skip OAuth entirely
  if (process.env.POSTEY_API_KEY) {
    return { header: "X-API-Key", value: process.env.POSTEY_API_KEY };
  }

  // 1b. Env override (bearer). The MCP server sets this when it shells out to
  // this CLI on behalf of a caller who authenticated with OAuth rather than an
  // mk_ key (backend S9.9 / SK-5): local_path uploads and transcribe_video used
  // to demand an API key, which locked out every OAuth client. Ranked above the
  // config session on purpose — an explicit caller identity must win over
  // whoever happens to be logged in on this machine.
  if (process.env.POSTEY_AUTH_TOKEN) {
    return { header: "Authorization", value: `Bearer ${process.env.POSTEY_AUTH_TOKEN}` };
  }

  // 2. OAuth tokens in global config
  const oauth = getOAuthConfig();
  if (oauth?.access_token) {
    const payload = decodeJwtPayload(oauth.access_token);
    const expiresAt = payload?.exp ?? oauth.expires_at ?? 0;
    const needsRefresh = Date.now() / 1000 > expiresAt - 60;

    if (needsRefresh && oauth.refresh_token) {
      try {
        const fresh = await refreshAccessToken(oauth.refresh_token, oauth.client_id);
        const newPayload = decodeJwtPayload(fresh.access_token);
        const updated = {
          ...oauth,
          access_token: fresh.access_token,
          ...(fresh.refresh_token ? { refresh_token: fresh.refresh_token } : {}),
          ...(fresh.id_token    ? { id_token: fresh.id_token }             : {}),
          expires_at: newPayload?.exp ?? Math.floor(Date.now() / 1000) + (fresh.expires_in || 3600),
        };
        saveOAuthConfig(updated);
        return { header: "Authorization", value: `Bearer ${updated.access_token}` };
      } catch (e) {
        // Refresh failed — fall through to API key or error
        process.stderr.write(`OAuth refresh failed: ${e.message}\n`);
      }
    } else if (!needsRefresh) {
      return { header: "Authorization", value: `Bearer ${oauth.access_token}` };
    }
  }

  // 3. The credential this CLI was linked with (auth:link). A pat_ agent token,
  // so it goes in Authorization, never X-API-Key — that header is for mk_ keys
  // and the server resolves the two by different paths.
  //
  // Ranked below the CLI's own OAuth session because a user who ran auth:login
  // on this machine chose that identity explicitly; the linked token is the
  // quieter default that setup arranges on their behalf.
  const linked = readConfigFile(GLOBAL_CONFIG_FILE)?.cliToken;
  if (linked) return { header: "Authorization", value: `Bearer ${linked}` };

  // 4. API key in config files
  const localConfig = readLocalConfig();
  if (localConfig?.apiKey) return { header: "X-API-Key", value: localConfig.apiKey };

  const globalConfig = readConfigFile(GLOBAL_CONFIG_FILE);
  if (globalConfig?.apiKey) return { header: "X-API-Key", value: globalConfig.apiKey };

  return null;
}

function openBrowser(url) {
  const cmd = process.platform === "darwin" ? "open"
            : process.platform === "win32"  ? "start"
            : "xdg-open";
  try {
    spawn(cmd, [url], { detached: true, stdio: "ignore" }).unref();
  } catch {
    // non-fatal — user sees the URL in stderr
  }
}

/**
 * Format accounts for display in interactive selection.
 * Returns array of { account, displayLine } objects maintaining selection index mapping.
 */
function formatAccountsForDisplay(accounts) {
  return accounts.map((account, index) => {
    const num = fmt.num(`${index + 1}.`.padStart(3));
    const name = fmt.bold(account.account_name || "Unnamed");
    const platforms = ["twitter", "linkedin", "instagram", "threads", "tiktok", "bluesky", "youtube"]
      .filter((p) => account[p] != null)
      .join(",");
    const platformLabel = platforms ? fmt.dim(` [${platforms}]`) : "";
    const displayLine = `  ${num} ${name}${platformLabel}`;
    return { account, displayLine, index: index + 1 };
  });
}


function requireAccountId(providedId) {
  if (providedId) {
    return providedId;
  }

  const defaultResult = getDefaultAccountId();
  if (defaultResult) {
    return defaultResult.id;
  }

  error("account_id is required", {
    hint: "Provide account_id (or --account-id) as a positional argument.",
  });
}

/**
 * Resolve draft target for commands that accept [account_id] <draft_id>.
 * When a default account is configured, a single argument is ambiguous,
 * so require --use-default to confirm intent.
 */
function requireApiKey() {
  const result = getApiKey();
  if (!result) {
    error(
      `API key not found. Run 'postey.js setup' to configure your API key. Get your key at ${API_KEY_URL}`,
      { action: "Run: postey.js setup" },
    );
  }
  return result.key;
}

async function requireAuth() {
  const auth = await getAuthHeader();
  if (!auth) {
    error(
      "Not authenticated. Run 'postey.js auth:login' (OAuth) or 'postey.js setup' (API key).",
      { actions: ["postey.js auth:login", "postey.js setup"] },
    );
  }
  return auth;
}

async function _parseApiResponseJson(response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) : {}; } catch { return { raw: text }; }
}

async function apiRequest(method, endpoint, body = null, opts = {}) {
  const { exitOnError = true } = opts;
  const auth = await requireAuth();

  const options = {
    method,
    headers: {
      [auth.header]: auth.value,
      "Content-Type": "application/json",
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, options);
  const data = await _parseApiResponseJson(response);

  if (!response.ok) {
    if (exitOnError) {
      error(`HTTP ${response.status}`, { response: data });
    }
    const err = new Error(`HTTP ${response.status}`);
    err.response = data;
    err.status = response.status;
    throw err;
  }

  return data;
}

async function apiUploadFile(endpoint, formData) {
  const auth = await requireAuth();
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers: { [auth.header]: auth.value },
    body: formData,
  });
  const data = await _parseApiResponseJson(response);
  if (!response.ok) {
    error(`HTTP ${response.status}`, { response: data });
  }
  return data;
}

// Threshold above which media:upload switches to the chunked path (50 MB).
const CHUNKED_UPLOAD_THRESHOLD = 50 * 1024 * 1024;

async function uploadFileChunked(filePath, platform, mimeType) {
  const auth = await requireAuth();
  const fileSize = fs.statSync(filePath).size;
  const filename = path.basename(filePath);
  const mediaPlatform = MEDIA_PLATFORM_NAME[platform] || platform.toLowerCase();

  process.stderr.write(`[upload] ${filename} (${(fileSize / 1024 / 1024).toFixed(1)} MB) → ${platform}\n`);

  // 1. Init session
  const initRes = await fetch(`${API_BASE}/media/chunked/init`, {
    method: "POST",
    headers: { [auth.header]: auth.value, "Content-Type": "application/json" },
    body: JSON.stringify({ filename, file_size: fileSize, platform: mediaPlatform }),
  });
  if (!initRes.ok) {
    const errData = await initRes.json().catch(() => ({}));
    error(`HTTP ${initRes.status}`, { response: errData });
  }
  const { upload_id, chunk_size, total_chunks } = await initRes.json();

  process.stderr.write(`[upload] ${total_chunks} chunks × ${(chunk_size / 1024).toFixed(0)} KB (id: ${upload_id})\n`);

  // 2. Upload chunks in parallel (4 concurrent, 3 retries with backoff)
  const CONCURRENCY = 4;
  const MAX_RETRIES = 3;
  let completed = 0;
  let lastMilestone = -1;
  const fd = fs.openSync(filePath, "r");

  async function uploadChunk(i) {
    const start = i * chunk_size;
    const end = Math.min(start + chunk_size, fileSize) - 1;
    const chunkLen = end - start + 1;
    const buf = Buffer.alloc(chunkLen);
    fs.readSync(fd, buf, 0, chunkLen, start);

    let lastErr;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = 1000 * 2 ** (attempt - 1); // 1s, 2s, 4s
        process.stderr.write(`[upload] chunk ${i + 1} retry ${attempt}/${MAX_RETRIES} in ${delay / 1000}s\n`);
        await new Promise((r) => setTimeout(r, delay));
      }
      try {
        const form = new FormData();
        form.append("file", new Blob([buf], { type: mimeType }), filename);
        const patchRes = await fetch(`${API_BASE}/media/chunked/${upload_id}`, {
          method: "PATCH",
          headers: {
            [auth.header]: auth.value,
            "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          },
          body: form,
        });
        if (!patchRes.ok) {
          const errData = await patchRes.json().catch(() => ({}));
          lastErr = { status: patchRes.status, response: errData };
          continue; // retry on HTTP error too
        }
        completed++;
        const pct = Math.floor((completed / total_chunks) * 100);
        const milestone = Math.floor(pct / 25) * 25;
        if (milestone > lastMilestone) {
          lastMilestone = milestone;
          process.stderr.write(`[upload] ${pct}% (${completed}/${total_chunks} chunks)\n`);
        }
        return; // success
      } catch (e) {
        lastErr = { message: e.message };
      }
    }
    error(`Chunk ${i + 1} failed after ${MAX_RETRIES} retries`, { detail: lastErr });
  }

  try {
    const indices = Array.from({ length: total_chunks }, (_, i) => i);
    for (let i = 0; i < indices.length; i += CONCURRENCY) {
      await Promise.all(indices.slice(i, i + CONCURRENCY).map(uploadChunk));
    }
  } finally {
    fs.closeSync(fd);
  }

  // 3. Complete
  const completeRes = await fetch(`${API_BASE}/media/chunked/${upload_id}/complete`, {
    method: "POST",
    headers: { [auth.header]: auth.value },
  });
  if (!completeRes.ok) {
    const errData = await completeRes.json().catch(() => ({}));
    error(`HTTP ${completeRes.status}`, { response: errData });
  }
  return await completeRes.json();
}

function buildFormData(filePath, mimeType, platform) {
  const fd = new FormData();
  fd.append("file", new Blob([fs.readFileSync(filePath)], { type: mimeType }), path.basename(filePath));
  fd.append("platform", platform);
  return fd;
}

// ============================================================================
// ============================================================================
// video subcommand group
// ============================================================================

// Invoke another postey.js command in-process and return parsed JSON from its stdout.
// Child stderr is forwarded to the parent so progress output (chunked upload %) is visible.
function _callSelf(...args) {
  const r = spawnSync(process.execPath, [__filename, ...args.map(String)], {
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "inherit"],
  });
  if (r.error) return { error: r.error.message };
  try { return JSON.parse(r.stdout); } catch { return { error: r.stdout || "Unknown error" }; }
}

// ── handlers ──────────────────────────────────────────────────────────────────

async function _handlePost(argv) {
  const platforms = argv.platforms.toUpperCase().split(",").map((p) => p.trim()).filter(Boolean);
  const invalid = platforms.filter((p) => !SOCIAL_PLATFORMS.has(p));
  if (invalid.length) {
    error(`Invalid platform(s): ${invalid.join(", ")}`, { valid_platforms: Array.from(SOCIAL_PLATFORMS) });
  }

  const hasInsta = platforms.includes("INSTAGRAM");
  const hasVideo = platforms.some((p) => _VIDEO_CAPABLE_PLATFORMS.has(p));
  const isUrl    = String(argv.video).startsWith("https://");

  if (argv.dryRun) {
    output({ dry_run: true, would_call: "create_post", would_call_via: "mcp", payload: { account_id: argv.accountId, platforms, text: argv.text, would_upload_video: hasVideo && !isUrl, would_extract_cover: hasInsta && !argv.coverUrl } });
    return;
  }

  // Upload video for video-capable platforms
  let videoUrl = null;
  if (hasVideo) {
    if (isUrl) {
      videoUrl = argv.video;
    } else {
      if (!fs.existsSync(argv.video)) { error(`File not found: ${argv.video}`); }
      const uploadPlatform = hasInsta ? "INSTAGRAM" : platforms.find((p) => _VIDEO_CAPABLE_PLATFORMS.has(p));
      process.stderr.write(`[video:post] uploading video for ${uploadPlatform}...\n`);
      const mediaResult = _callSelf("media:upload", "--platform", uploadPlatform, "--file", argv.video);
      if (mediaResult.error) { error("Video upload failed", { detail: mediaResult.error }); }
      videoUrl = mediaResult.url;
      process.stderr.write(`[video:post] video ready: ${videoUrl}\n`);
    }
  }

  // Cover thumbnail for Instagram
  let coverUrl = argv.coverUrl || null;
  if (hasInsta && !coverUrl) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "postey_vpost_"));
    const thumbOut = path.join(tmpDir, "cover.jpg");
    try {
      const ff = spawnSync("ffmpeg", ["-ss", String(argv.coverTime), "-i", argv.video, "-vframes", "1", "-q:v", "2", thumbOut, "-y"], { env: mediaEnv(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      if (ff.status === 0 && fs.existsSync(thumbOut)) {
        process.stderr.write("[video:post] uploading cover thumbnail...\n");
        const coverResult = _callSelf("media:upload", "--platform", "INSTAGRAM", "--file", thumbOut);
        if (!coverResult.error) {
          coverUrl = coverResult.url;
          process.stderr.write(`[video:post] cover ready: ${coverUrl}\n`);
        }
      } else {
        process.stderr.write("Warning: ffmpeg cover extraction failed — posting without cover_url\n");
        if (ff.stderr) process.stderr.write(ff.stderr.slice(0, 500) + "\n");
      }
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  }

  // The skill's job ends with the upload. Draft creation, scheduling and
  // publishing are MCP's — see docs/skills-mcp-contract.md. Returning the
  // uploaded URLs plus the caller's intent lets the agent call create_post
  // without this command shipping a second write path.
  if (argv.schedule || argv.publishNow) {
    error("Scheduling and publishing are MCP operations", {
      hint: "Upload here, then call the MCP tools schedule_post or publish_draft on the returned draft",
    });
  }

  output({
    media_urls: videoUrl ? [videoUrl] : [],
    cover_url: coverUrl || null,
    account_id: argv.accountId,
    platforms,
    text: argv.text,
    ...(argv.title        ? { title: argv.title }                 : {}),
    ...(argv.youtubeTitle ? { youtube_title: argv.youtubeTitle }  : {}),
    ...(argv.tags         ? { tags: argv.tags }                   : {}),
    next_step: {
      tool: "create_post",
      note: "Postey MCP owns draft creation. Pass these fields to create_post.",
    },
  });
}

function _handleTrim(argv) {
  if (!fs.existsSync(argv.file)) { error(`File not found: ${argv.file}`, { hint: "Check the file path" }); }
  const ext  = path.extname(argv.file);
  const outPath = argv.output || path.join(path.dirname(argv.file), `${path.basename(argv.file, ext)}_trimmed${ext}`);
  const startSec = argv.start ?? 0;

  const ffArgs = ["-ss", String(startSec), "-i", argv.file];
  if (argv.end != null) ffArgs.push("-to", String(argv.end));
  else                  ffArgs.push("-t",  String(argv.duration));
  ffArgs.push("-c", "copy", outPath, "-y");

  if (process.stderr.isTTY) process.stderr.write(`Trimming: ${argv.file} → ${outPath}\n`);
  const r = spawnSync("ffmpeg", ffArgs, { env: mediaEnv(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (r.status !== 0) { error("ffmpeg trim failed", { stderr: redactUrls(r.stderr)?.slice(0, 500), hint: "Is ffmpeg installed? brew install ffmpeg" }); }
  if (!fs.existsSync(outPath)) { error("Output file was not created"); }

  const endSec = argv.end != null ? argv.end : startSec + argv.duration;
  output({ input: path.resolve(argv.file), output: path.resolve(outPath), start_seconds: startSec, end_seconds: endSec, file_size_bytes: fs.statSync(outPath).size });
}

function _handleInfo(argv) {
  if (!fs.existsSync(argv.file)) { error(`File not found: ${argv.file}`, { hint: "Check the file path" }); }

  const probe = spawnSync("ffprobe", ["-v", "quiet", "-print_format", "json", "-show_streams", "-show_format", argv.file], { env: mediaEnv(), encoding: "utf8" });
  if (probe.status !== 0 || !probe.stdout) {
    error("ffprobe failed — is ffmpeg installed?", { hint: "brew install ffmpeg  or  sudo apt install ffmpeg", stderr: redactUrls(probe.stderr)?.slice(0, 300) });
  }
  let data;
  try { data = JSON.parse(probe.stdout); } catch { error("Could not parse ffprobe output"); }

  const vs  = (data.streams || []).find((s) => s.codec_type === "video");
  const as  = (data.streams || []).find((s) => s.codec_type === "audio");
  const fmt = data.format || {};
  const dur = Math.round(parseFloat(fmt.duration || vs?.duration || 0) * 10) / 10;
  const sizeBytes = parseInt(fmt.size || 0, 10);
  const w = vs?.width || null, h = vs?.height || null;
  let aspectRatio = null;
  if (w && h) { const g = _gcd(w, h); aspectRatio = `${w / g}:${h / g}`; }

  const hints = [];
  if (w && h) {
    const r = w / h;
    if (Math.abs(r - 9 / 16) < 0.05)   hints.push("9:16 portrait — ideal for Instagram Reels / TikTok");
    else if (Math.abs(r - 16 / 9) < 0.05) hints.push("16:9 landscape — ideal for YouTube / LinkedIn");
    else if (Math.abs(r - 1) < 0.05)   hints.push("1:1 square");
  }
  if (dur > 90)  hints.push(`Duration ${dur}s exceeds Instagram Reels 90s limit`);
  if (dur > 180) hints.push(`Duration ${dur}s exceeds TikTok 3-min standard limit`);
  if (sizeBytes > CHUNKED_UPLOAD_THRESHOLD) hints.push("Over 50 MB — chunked upload will be used");

  output({ file: path.resolve(argv.file), duration_seconds: dur, file_size_bytes: sizeBytes, file_size_mb: Math.round(sizeBytes / 1024 / 1024 * 10) / 10, width: w, height: h, aspect_ratio: aspectRatio, video_codec: vs?.codec_name || null, audio_codec: as?.codec_name || null, fps: vs?.r_frame_rate || null, container: fmt.format_name || null, platform_hints: hints });
}

// A remote video URL is fetched by yt-dlp on the user's machine and behind their
// network. Without a check, `video transcribe --input http://127.0.0.1:.../` and
// http://169.254.169.254/ are reachable, and --print "%(title)s" returns the
// fetched page's title into the output JSON — a read primitive, not a blind hit.
// Child processes echo the input URL into stderr, and for a presigned S3 / Drive
// / CDN link the query string IS the credential. This output is read by an agent
// and forwarded to a model provider, so strip it before it leaves.
function redactUrls(text) {
  if (!text) return text;
  return String(text).replace(/(https?:\/\/[^\s"']+?)\?[^\s"']*/g, "$1?<redacted>");
}

// yt-dlp, ffmpeg and whisper need none of Postey's credentials, and yt-dlp in
// particular loads config files and extractor plugins while fetching an
// attacker-chosen URL. Hand them an environment without the secrets.
function mediaEnv() {
  const {
    POSTEY_API_KEY, POSTEY_AUTH_TOKEN, // eslint-disable-line no-unused-vars
    ...rest
  } = process.env;
  return rest;
}

function assertPublicHttpUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    error("Not a valid URL", { input: raw });
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    error("Only http:// and https:// video URLs are supported", { protocol: u.protocol });
  }
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const blocked =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "::1" ||
    host === "0.0.0.0" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^f[cd][0-9a-f]{2}:/i.test(host) ||
    /^fe80:/i.test(host);
  if (blocked) {
    error("Refusing to fetch a private, loopback or link-local address", {
      host,
      hint: "video transcribe takes a public video URL or a local file path",
    });
  }
  return u;
}

async function _handleTranscribe(argv) {
  const input = argv.input;
  const isLocal = !input.startsWith("http://") && !input.startsWith("https://");
  if (!isLocal) assertPublicHttpUrl(input);

  const missing = [];
  if (!_which("ffmpeg"))           missing.push("ffmpeg");
  if (!isLocal && !_which("yt-dlp")) missing.push("yt-dlp");
  if (!_detectWhisper())           missing.push("whisper / mlx_whisper");
  if (missing.length) { error("Missing required tools", { missing, hint: "brew install ffmpeg yt-dlp && pip install mlx-whisper" }); }

  const autoTmp = !argv.outputDir;
  const tmpDir  = argv.outputDir || path.join(os.tmpdir(), `v2p_${require("crypto").randomBytes(4).toString("hex")}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  let videoFile, videoTitle;
  if (isLocal) {
    videoFile = input.startsWith("~/") ? path.join(os.homedir(), input.slice(2)) : path.resolve(input);
    if (!fs.existsSync(videoFile)) { error(`Local file not found: ${videoFile}`); }
    videoTitle = path.basename(videoFile, path.extname(videoFile));
    if (process.stderr.isTTY) process.stderr.write(`Using local file: ${videoFile}\n`);
  } else {
    if (process.stderr.isTTY) process.stderr.write(`Fetching metadata: ${input}\n`);
    const tr = spawnSync("yt-dlp", ["--print", "%(title)s", "--no-download", input], { env: mediaEnv(), encoding: "utf8" });
    videoTitle = (tr.status === 0 && tr.stdout) ? tr.stdout.trim().split("\n")[0] : "";
    if (process.stderr.isTTY) process.stderr.write(`Downloading: ${input}\n`);
    _vRun("yt-dlp", ["-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best", "--merge-output-format", "mp4", "-o", path.join(tmpDir, _sanitizeFname(videoTitle) + ".%(ext)s"), input]);
    videoFile = _findVideoFile(tmpDir);
  }

  // Optional thumbnail
  let thumbnailFile = null;
  if (argv.thumbnail) {
    if (process.stderr.isTTY) process.stderr.write("Building thumbnail...\n");
    thumbnailFile = _buildThumbnail(videoFile, { thumbText: argv.thumbText || videoTitle, thumbTime: argv.thumbTime, outDir: tmpDir });
    if (thumbnailFile && process.stderr.isTTY) process.stderr.write(`Thumbnail: ${thumbnailFile}\n`);
  }

  // Extract audio + transcribe
  const audioFile = path.join(tmpDir, "audio.wav");
  if (process.stderr.isTTY) process.stderr.write("Extracting audio...\n");
  _vRun("ffmpeg", ["-i", videoFile, "-ar", "16000", "-ac", "1", audioFile, "-y"]);

  const whisperBin  = _detectWhisper();
  const whisperTask = argv.translate ? "translate" : "transcribe";
  if (process.stderr.isTTY) process.stderr.write(`Transcribing with ${whisperBin} (model: ${argv.model})...\n`);
  if (whisperBin === "mlx_whisper") {
    _vRun("mlx_whisper", [audioFile, "--model", `mlx-community/whisper-${argv.model}-mlx`, "--output-format", "json", "--output-dir", tmpDir]);
  } else {
    _vRun("whisper", [audioFile, "--model", argv.model, "--task", whisperTask, "--output_format", "json", "--output_dir", tmpDir]);
  }

  const whisperJsonPath = path.join(tmpDir, "audio.json");
  if (!fs.existsSync(whisperJsonPath)) { error(`Whisper output not found at ${whisperJsonPath}`); }
  const wd = JSON.parse(fs.readFileSync(whisperJsonPath, "utf8"));
  const transcript = (wd.text || "").trim();
  const segments   = (wd.segments || []).map((s) => ({ start: s.start, end: s.end, text: s.text.trim() }));
  const durationSec = segments.length > 0 ? Math.round(segments[segments.length - 1].end) : 0;

  // Per-platform suggested captions
  const platforms = argv.platform ? argv.platform.toUpperCase().split(",").map((p) => p.trim()).filter(Boolean) : [];
  const suggestedCaptions = {};
  for (const p of platforms) suggestedCaptions[p] = _vTruncate(transcript, _VIDEO_CHAR_LIMITS[p] ?? 2200);

  // Upload the local media when platforms are named, but stop there: creating
  // the draft is MCP's create_post. See docs/skills-mcp-contract.md.
  let draftInputs = null;
  if (platforms.length > 0 && argv.accountId != null) {
    if (argv.dryRun) {
      draftInputs = { dry_run: true, would_upload: true, platforms, account_id: argv.accountId };
    } else {
      const hasInsta   = platforms.includes("INSTAGRAM");
      const uploadPlat = hasInsta ? "INSTAGRAM" : (platforms.find((p) => _VIDEO_CAPABLE_PLATFORMS.has(p)) || platforms[0]);
      if (process.stderr.isTTY) process.stderr.write("Uploading video...\n");
      const mediaRes = _callSelf("media:upload", "--platform", uploadPlat, "--file", videoFile);
      let coverCdnUrl = null;
      if (hasInsta && thumbnailFile) {
        if (process.stderr.isTTY) process.stderr.write("Uploading thumbnail...\n");
        const thumbRes = _callSelf("media:upload", "--platform", "INSTAGRAM", "--file", thumbnailFile);
        if (!thumbRes.error) coverCdnUrl = thumbRes.url;
      }
      const minLimit = Math.min(...platforms.map((p) => _VIDEO_CHAR_LIMITS[p] ?? 2200));
      draftInputs = {
        account_id: argv.accountId,
        platforms,
        text: _vTruncate(transcript, minLimit),
        media_urls: mediaRes?.url ? [mediaRes.url] : [],
        cover_url: coverCdnUrl,
        ...(platforms.includes("YOUTUBE") && videoTitle ? { youtube_title: videoTitle } : {}),
        next_step: { tool: "create_post", note: "Postey MCP owns draft creation." },
      };
    }
  }

  output({
    input,
    video_title: videoTitle || null,
    transcript,
    segments,
    duration_seconds: durationSec,
    ...(Object.keys(suggestedCaptions).length > 0 ? { suggested_captions: suggestedCaptions } : {}),
    ...(draftInputs ? { draft_inputs: draftInputs } : {}),
  });

  if (autoTmp && !argv.keepFiles) { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} }
}

// ── main video command dispatcher ─────────────────────────────────────────────

function _parseVideoFlags(flagArgs, booleanFlags) {
  const argv = {};
  let i = 0;
  while (i < flagArgs.length) {
    const arg = flagArgs[i];
    if (arg.startsWith("--")) {
      const raw = arg.slice(2);
      const key = raw.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      if (booleanFlags.has(key) || booleanFlags.has(raw)) {
        argv[key] = true;
        i++;
      } else if (i + 1 < flagArgs.length && !String(flagArgs[i + 1]).startsWith("--")) {
        argv[key] = flagArgs[i + 1];
        i += 2;
      } else {
        argv[key] = true;
        i++;
      }
    } else {
      argv._positional = argv._positional || [];
      argv._positional.push(arg);
      i++;
    }
  }
  return argv;
}

const VIDEO_SUBCOMMAND_HELP = {
  post: `\
Usage: postey.js video post --video <path|url> --text <caption> --platforms <CSV> --account-id <id>

Upload a video and create a multi-platform draft.
INSTAGRAM / TIKTOK / YOUTUBE get video attached; other platforms receive text only.

Required:
  --video <path|url>       Local file path or direct video URL
  --text <caption>         Post caption / body text
  --platforms <CSV>        Comma-separated platform list (e.g. INSTAGRAM,LINKEDIN,X)
  --account-id <id>        Numeric account ID

Optional:
  --cover-time <sec>       Cover frame offset in seconds (default: 3)
  --cover-url <url>        Skip auto cover extraction, use this CDN URL
  --youtube-title <str>    YouTube video title
  --title <str>            Internal draft title (default: "Untitled Draft")
  --tags <CSV>             Comma-separated numeric tag IDs
  --dry-run                Validate + show payload without calling API
`,
  trim: `\
Usage: postey.js video trim --file <path> --start <sec> (--end <sec> | --duration <sec>)

Trim a video clip using stream copy (no re-encode).

Required:
  --file <path>            Source video file
  --start <sec>            Start time in seconds (default: 0)
  --end <sec>              End time in seconds  (mutually exclusive with --duration)
  --duration <sec>         Clip length in seconds (mutually exclusive with --end)

Optional:
  --output <path>          Output path (default: <basename>_trimmed.<ext>)
`,
  info: `\
Usage: postey.js video info --file <path>

Inspect a video file: duration, codec, dimensions, and platform upload hints.

Required:
  --file <path>            Video file to inspect
`,
  transcribe: `\
Usage: postey.js video transcribe --input <url|path>
       postey.js video transcribe <url|path>

Transcribe video audio via yt-dlp + Whisper and optionally create a draft post.
The input may be passed as --input or as the first positional argument.

Required:
  --input <url|path>       YouTube/video URL or local file path
                           (also accepted as a bare positional argument)

Optional:
  --platform <CSV>         If set, also create a draft (requires --account-id)
  --account-id <id>        Account to post to when --platform is given
  --model <size>           Whisper model: tiny|base|small|medium|large (default: small)
  --translate              Translate audio to English instead of transcribing
  --thumbnail              Generate a thumbnail image
  --thumb-text <str>       Text overlay for the generated thumbnail
  --thumb-time <sec>       Frame offset for thumbnail extraction
  --output-dir <path>      Directory for output files
  --keep-files             Keep temporary audio/video files after transcription
  --dry-run                Show what would be posted without making API calls
`,
};

async function cmdVideoGroup(args) {
  const subcmd = args[0];
  const rest   = args.slice(1);

  if (subcmd === "--help" || subcmd === "-h") {
    process.stderr.write(`Usage: postey.js video <subcommand> [flags]\n\nSubcommands:\n  post        Upload video + create multi-platform draft\n  trim        Trim a video clip (stream copy, no re-encode)\n  info        Inspect video: duration, codec, dimensions, platform hints\n  transcribe  Transcribe video audio via yt-dlp + Whisper\n\nRun: postey.js video <subcommand> --help  for full flag reference.\n`);
    process.exit(0);
  }

  if (!subcmd) {
    output({ error: "Specify a subcommand: post | trim | info | transcribe", hint: "Run: postey.js video <command> --help" });
    process.exit(1);
  }

  if (rest.includes("--help") || rest.includes("-h")) {
    const helpText = VIDEO_SUBCOMMAND_HELP[subcmd];
    if (helpText) {
      process.stderr.write(helpText);
      process.exit(0);
    }
  }

  if (subcmd === "post") {
    const p = _parseVideoFlags(rest, new Set(["dryRun", "dry-run", "publishNow", "publish-now"]));
    const accountIdRaw = p.accountId ?? p["account-id"] ?? (p._positional && p._positional[0]);
    if (!p.video)         { output({ error: "--video is required" });    process.exit(1); }
    if (!p.text)          { output({ error: "--text is required" });     process.exit(1); }
    if (!p.platforms)     { output({ error: "--platforms is required" }); process.exit(1); }
    if (accountIdRaw == null) { output({ error: "--account-id is required" }); process.exit(1); }
    await _handlePost({
      video:        p.video,
      text:         p.text,
      platforms:    p.platforms,
      accountId:    Number(accountIdRaw),
      coverTime:    p.coverTime != null ? Number(p.coverTime) : 3,
      coverUrl:     p.coverUrl  || null,
      title:        p.title     || "Untitled Draft",
      youtubeTitle: p.youtubeTitle || null,
      tags:         p.tags      || null,
      schedule:     p.schedule  || null,
      publishNow:   !!p.publishNow,
      dryRun:       !!p.dryRun,
    });

  } else if (subcmd === "trim") {
    const p = _parseVideoFlags(rest, new Set());
    if (!p.file) { output({ error: "--file is required" }); process.exit(1); }
    if (p.end == null && p.duration == null) { output({ error: "Provide --end <sec> or --duration <sec>" }); process.exit(1); }
    _handleTrim({
      file:     p.file,
      start:    p.start    != null ? Number(p.start)    : 0,
      end:      p.end      != null ? Number(p.end)      : null,
      duration: p.duration != null ? Number(p.duration) : null,
      output:   p.output   || null,
    });

  } else if (subcmd === "info") {
    const p = _parseVideoFlags(rest, new Set());
    if (!p.file) { output({ error: "--file is required" }); process.exit(1); }
    _handleInfo({ file: p.file });

  } else if (subcmd === "transcribe") {
    const p = _parseVideoFlags(rest, new Set(["translate", "keepFiles", "keep-files", "thumbnail", "dryRun", "dry-run"]));
    const inputVal = p.input ?? (p._positional && p._positional[0]);
    if (!inputVal) { output({ error: "--input is required" }); process.exit(1); }
    const acct = p.accountId ?? p["account-id"];
    if (p.platform && acct == null) { output({ error: "--account-id is required when --platform is set" }); process.exit(1); }
    await _handleTranscribe({
      input:     inputVal,
      platform:  p.platform  || null,
      accountId: acct != null ? Number(acct) : null,
      model:     p.model     || "small",
      translate: !!(p.translate),
      keepFiles: !!(p.keepFiles),
      outputDir: p.outputDir || null,
      thumbnail: !!(p.thumbnail),
      thumbText: p.thumbText || null,
      thumbTime: p.thumbTime != null ? Number(p.thumbTime) : null,
      dryRun:    !!(p.dryRun),
    });

  } else {
    output({ error: `Unknown video subcommand: ${subcmd}`, hint: "Valid subcommands: post | trim | info | transcribe" });
    process.exit(1);
  }
}

function parseArgs(args, spec = {}) {
  const result = { _positional: [] };
  let i = 0;

  while (i < args.length) {
    const arg = args[i];
    if (typeof arg !== "string") {
      // This should never happen with process.argv, but can happen if we build argv arrays internally.
      error("Invalid argument type", { argument: arg });
    }

    if (arg.startsWith("--")) {
      const rawKey = arg.slice(2);
      const key = rawKey === "scratchpad" ? "notes" : rawKey;
      if (spec[key] === "boolean") {
        result[key] = true;
        i++;
      } else if (i + 1 < args.length && !String(args[i + 1]).startsWith("--")) {
        result[key] = args[i + 1];
        i += 2;
      } else {
        if (rawKey === "social-set-id" || rawKey === "social_set_id") {
          error("--social-set-id (or --social_set_id) requires a value");
        }
        error(`${arg} requires a value`);
      }
    } else if (arg === "-f") {
      // Shorthand for --file
      if (i + 1 < args.length) {
        result.file = args[i + 1];
        i += 2;
      } else {
        error("-f requires a value");
      }
    } else if (arg === "-a") {
      // Shorthand for --append
      result.append = true;
      i++;
    } else {
      result._positional.push(arg);
      i++;
    }
  }

  return result;
}

function coerceFlagValueToString(value, flagName, { allowEmpty = false } = {}) {
  if (value === true || value == null) {
    error(`${flagName} requires a value`);
  }
  if (typeof value !== "string" && typeof value !== "number") {
    error(`${flagName} must be a string`);
  }
  const str = String(value);
  if (!allowEmpty && str.trim() === "") {
    error(`${flagName} requires a non-empty value`);
  }
  return str;
}

function pushStringFlag(argv, parsed, key, flagName, opts) {
  if (!Object.prototype.hasOwnProperty.call(parsed, key)) return;
  const value = coerceFlagValueToString(parsed[key], flagName, opts);
  argv.push(flagName, value);
}

function parseCsvArg(value, flagName) {
  // parseArgs sets missing values to true (e.g. `--tags --other-flag`)
  if (value === true) {
    error(`${flagName} requires a value`);
  }
  if (value == null) return null;
  if (typeof value !== "string") {
    error(`${flagName} must be a string`);
  }
  if (value.trim() === "") return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function getSocialSetIdFromParsed(parsed) {
  // Support both kebab and snake case. (People often copy from API docs.)
  const value = parsed["social-set-id"] ?? parsed.social_set_id;
  if (value === true) {
    error("--social-set-id (or --social_set_id) requires a value");
  }
  if (value == null) return null;
  if (typeof value !== "string") {
    error("--social-set-id (or --social_set_id) must be a string");
  }
  if (value.trim() === "") {
    error("--social-set-id (or --social_set_id) requires a non-empty value");
  }
  return value;
}


function getAccountIdFromParsed(parsed) {
  const accountFlag = parsed["account-id"] ?? parsed.account_id;
  const socialSetFlag = getSocialSetIdFromParsed(parsed);

  let accountId = null;
  if (accountFlag != null) {
    if (accountFlag === true) {
      error("--account-id (or --account_id) requires a value");
    }
    if (typeof accountFlag !== "string") {
      error("--account-id (or --account_id) must be a string");
    }
    if (accountFlag.trim() === "") {
      error("--account-id (or --account_id) requires a non-empty value");
    }
    accountId = accountFlag;
  }

  if (accountId && socialSetFlag && accountId !== socialSetFlag) {
    error("Conflicting account IDs", {
      "account-id": accountId,
      "social-set-id": socialSetFlag,
    });
  }

  return accountId || socialSetFlag;
}

function resolveAccountIdFromParsed(parsed, positionalId) {
  const flagId = getAccountIdFromParsed(parsed);
  if (flagId && positionalId && flagId !== positionalId) {
    error("Conflicting account IDs", {
      positional: positionalId,
      flag: flagId,
    });
  }
  return requireAccountId(flagId || positionalId);
}

function requireIntId(value, name) {
  if (value == null) {
    error(`${name} is required`);
  }
  const str = String(value).trim();
  if (!/^\d+$/.test(str)) {
    error(`${name} must be an integer`, { value: str });
  }
  return Number(str);
}

function parseSocialPlatformEnum(value, argName = "platform") {
  if (value == null || value === true) {
    error(`${argName} is required`);
  }
  if (typeof value !== "string") {
    error(`${argName} must be a string`);
  }
  const normalized = value.trim().toUpperCase().replace(/-/g, "_");
  const mapped = normalized === "TWITTER" ? "X" : normalized;
  if (!SOCIAL_PLATFORMS.has(mapped)) {
    error(`Invalid ${argName}`, {
      provided: value,
      allowed: Array.from(SOCIAL_PLATFORMS),
    });
  }
  return mapped;
}

function parsePlatformCsvToEnums(value, argName = "--platform") {
  if (value == null) return null;
  if (value === true) {
    error(`${argName} requires a value`);
  }
  if (typeof value !== "string") {
    error(`${argName} must be a string`);
  }
  const platforms = value
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => parseSocialPlatformEnum(p, argName));
  if (platforms.length === 0) {
    error(`${argName} requires at least one platform`);
  }
  return Array.from(new Set(platforms));
}

function parseTagIds(value) {
  if (value == null) return [];
  if (value === true) {
    error("--tags requires a value");
  }
  if (typeof value !== "string") {
    error("--tags must be a comma-separated list of numeric tag IDs");
  }
  if (value.trim() === "") return [];
  const ids = value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => {
      if (!/^\d+$/.test(v)) {
        error("--tags must contain only numeric tag IDs", { invalid: v });
      }
      return Number(v);
    });
  return Array.from(new Set(ids));
}



// ============================================================================
// Commands
// ============================================================================

async function cmdAuthLogin(args) {
  const parsed = parseArgs(args, { global: "boolean", local: "boolean" });
  const useLocal = parsed.local === true;

  // 1. Start local callback server on the fixed port
  const server = http.createServer();
  const port = await new Promise((resolve, reject) => {
    server.listen(OAUTH_CALLBACK_PORT, "127.0.0.1", () => resolve(server.address().port));
    server.on("error", (e) => {
      if (e.code === "EADDRINUSE") {
        reject(new Error(
          `Port ${OAUTH_CALLBACK_PORT} is already in use. ` +
          `Stop the conflicting process or set POSTEY_CLI_CALLBACK_PORT to a free port.`
        ));
      } else {
        reject(e);
      }
    });
  });
  const redirectUri = `http://localhost:${port}/callback`;

  // 2. Register a dynamic client via DCR (skipped when POSTEY_CLI_CLIENT_ID is set)
  let clientId;
  try {
    console.error(fmt.info("Registering OAuth client…"));
    const reg = await registerOAuthClient(redirectUri);
    clientId = reg.client_id;
  } catch (e) {
    server.close();
    error(`OAuth client registration failed: ${e.message}`);
  }

  // 3. Generate PKCE + state
  const codeVerifier  = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = randomBytes(16).toString("hex");

  // 4. Build authorize URL (lands on app.postey.ai/auth/mcp-consent)
  const authorizeUrl = new URL(OAUTH_AUTHORIZE_URL);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id",     clientId);
  authorizeUrl.searchParams.set("redirect_uri",  redirectUri);
  // MCP server has no scope requirements (enforced per-tool); omit scope param.
  authorizeUrl.searchParams.set("state",         state);
  authorizeUrl.searchParams.set("code_challenge",        codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  // 5. Open browser (redirects to app.postey.ai/auth/mcp-consent)
  console.error("");
  console.error(fmt.title("Postey CLI — Login"));
  console.error("");
  console.error(fmt.info("Opening Postey consent page in your browser…"));
  console.error(fmt.dim("If it doesn't open, visit this URL manually:"));
  console.error(fmt.link(authorizeUrl.toString()));
  console.error("");
  openBrowser(authorizeUrl.toString());

  // 6. Wait for the callback (timeout after OAUTH_TIMEOUT_MS)
  let authCode;
  try {
    authCode = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        server.close();
        reject(new Error("Timed out waiting for browser authentication (2 min). Try again."));
      }, OAUTH_TIMEOUT_MS);

      server.on("request", (req, res) => {
        const u = new URL(req.url, "http://localhost");

        // Only the callback disarms the timeout. Clearing it on every request
        // meant a stray GET /favicon.ico left this promise pending forever.
        if (u.pathname !== "/callback") {
          res.writeHead(404); res.end("Not found"); return;
        }
        clearTimeout(timer);

        const oauthErr = u.searchParams.get("error");
        const code     = u.searchParams.get("code");
        const gotState = u.searchParams.get("state");

        const esc = (t) =>
          String(t).replace(/[&<>"']/g, (c) =>
            ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
          );
        const html = (title, body) =>
          `<!DOCTYPE html><html><head><title>Postey CLI</title><style>
            body{font-family:sans-serif;text-align:center;padding-top:80px;background:#fafafa}
            h2{color:#111}p{color:#555}
          </style></head><body><h2>${title}</h2><p>${body}</p></body></html>`;

        if (oauthErr) {
          const desc = u.searchParams.get("error_description") || oauthErr;
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(html("Authentication error", `${esc(desc)}<br>You can close this window.`));
          server.close();
          reject(new Error(`OAuth error: ${desc}`));
          return;
        }

        if (gotState !== state) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(html("Invalid state", "Possible CSRF — please try again."));
          server.close();
          reject(new Error("OAuth state mismatch — possible CSRF"));
          return;
        }

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(html("✓ Authenticated", "You can close this window and return to the terminal."));
        server.close();
        resolve(code);
      });
    });
  } catch (e) {
    server.close();
    error(e.message);
  }

  // 7. Exchange code for tokens
  console.error(fmt.info("Exchanging code for tokens…"));
  const tokenBody = new URLSearchParams({
    grant_type:    "authorization_code",
    client_id:     clientId,
    code:          authCode,
    redirect_uri:  redirectUri,
    code_verifier: codeVerifier,
  });

  let tokenData;
  try {
    const tokenRes = await fetch(OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody.toString(),
    });
    tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      error(tokenData.error_description || tokenData.error || `Token exchange failed (${tokenRes.status})`);
    }
  } catch (e) {
    error(`Token exchange request failed: ${e.message}`);
  }

  // 8. Decode expiry and store (persist client_id for token refresh)
  const payload   = decodeJwtPayload(tokenData.access_token);
  const expiresAt = payload?.exp ?? Math.floor(Date.now() / 1000) + (tokenData.expires_in || 3600);
  const sub       = payload?.sub || payload?.username || "unknown";

  const oauthEntry = {
    access_token:  tokenData.access_token,
    refresh_token: tokenData.refresh_token || null,
    id_token:      tokenData.id_token      || null,
    expires_at:    expiresAt,
    client_id:     clientId,
    scope:         tokenData.scope || OAUTH_SCOPES,
  };

  // Honor --local flag; otherwise always global for tokens
  if (useLocal) {
    const localPath = LOCAL_CONFIG_PATH();
    const existing  = readConfigFile(localPath) || {};
    // scope_path binds this config to the directory it was written for.
    writeConfig(localPath, { ...existing, scope_path: _resolvedCwd(), oauth: oauthEntry });
    // This file now holds a refresh token, which outlives the access token.
    // cmdSetup guarded its API key this way and the OAuth path never did.
    await _setupGitignore(true, true);
    console.error(fmt.success(`Tokens saved to ${fmt.dim(localPath)}`));
  } else {
    saveOAuthConfig(oauthEntry);
    console.error(fmt.success(`Tokens saved to ${fmt.dim(GLOBAL_CONFIG_FILE)}`));
  }

  console.error(fmt.success(`Logged in as ${fmt.bold(sub)}`));
  console.error("");

  output({ success: true, message: "Authenticated via OAuth", sub, expires_at: expiresAt });
}

async function cmdAuthLogout() {
  const oauth = getOAuthConfig();
  // auth:link stores a cliToken rather than an OAuth session. Clearing only the
  // session left the CLI fully authenticated while reporting a clean logout.
  const existing = readConfigFile(GLOBAL_CONFIG_FILE) || {};
  const hadLinked = Boolean(existing.cliToken);
  const cleared = [];

  if (oauth) {
    clearOAuthConfig();
    cleared.push("oauth");
  }
  if (hadLinked || existing.pendingLinks) {
    const { cliToken, pendingLinks, ...rest } = readConfigFile(GLOBAL_CONFIG_FILE) || {};
    writeConfig(GLOBAL_CONFIG_FILE, rest);
    if (hadLinked) cleared.push("linked");
  }

  if (cleared.length === 0) {
    output({ success: true, cleared, message: "No local credential found — nothing to clear." });
    return;
  }
  console.error(fmt.success(`Cleared from config: ${cleared.join(", ")}.`));
  output({ success: true, cleared, message: "Logged out" });
}


function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr, // Use stderr so JSON output stays clean on stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function writeConfig(configPath, config) {
  const configDir = path.dirname(configPath);
  // 0700: this directory holds a credential, and the default 0755 leaves it
  // traversable by every other account on the machine.
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
  }

  // Write a fresh file at 0600 and rename over the target. writeFileSync's
  // `mode` applies only on create, so writing in place left an existing 0644
  // file world-readable for the window between the write and any chmod — with
  // the key already in it. Rename is atomic, and O_EXCL means we never follow a
  // symlink a repo or a dotfile manager left in the way.
  const tmp = `${configPath}.${process.pid}.tmp`;
  const fd = fs.openSync(tmp, "wx", 0o600);
  try {
    fs.writeSync(fd, JSON.stringify(config, null, 2) + "\n");
  } finally {
    fs.closeSync(fd);
  }
  try {
    fs.renameSync(tmp, configPath);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch {}
    throw err;
  }
}


async function _promptApiKey(parsed, isNonInteractive) {
  let apiKey = parsed._positional[0] || parsed.key;
  // `isNonInteractive` means "a key was supplied", so it cannot answer this.
  // The prompt below reads stdin; with no TTY there is nobody to answer it, and
  // an unattended agent blocks forever instead of failing.
  if (!apiKey && !process.stdin.isTTY) {
    error("--key is required: stdin is not a terminal, so there is nobody to prompt", {
      actions: ["postey.js setup --key <the key> --location global"],
      api_key_url: API_KEY_URL,
    });
  }
  if (!apiKey) {
    console.error("");
    console.error(fmt.title("Postey CLI Setup"));
    console.error("");
    console.error(fmt.dim("Sign up free at postey.ai if you don't have an account."));
    console.error("");
    console.error(fmt.info(`Get your API key at: ${fmt.link(API_KEY_URL)}`));
    console.error("");
    apiKey = await prompt(`${colors.bold}Enter your Postey API key:${colors.reset} `);
  }
  if (!apiKey) error("API key is required");
  return apiKey;
}

async function _resolveLocation(isNonInteractive, parsed) {
  let location = parsed.location || parsed.scope;
  if (!location) {
    if (isNonInteractive) {
      location = "global";
    } else {
      console.error("");
      console.error(fmt.bold("Where should the API key be stored?"));
      console.error(`  ${fmt.num("1.")} Global ${fmt.dim("(~/.config/postey/)")} ${fmt.label("- Available to all projects")}`);
      console.error(`  ${fmt.num("2.")} Local ${fmt.dim("(./.postey/)")} ${fmt.label("- Only this project")}`);
      console.error("");
      const choice = await prompt(`${colors.bold}Choose location [1/2]${colors.reset} ${fmt.dim("(default: 1)")}: `);
      location = choice === "2" ? "local" : "global";
    }
  }
  return location;
}

async function _setupGitignore(isLocal, isNonInteractive) {
  if (!isLocal) return;
  const gitignorePath = path.join(process.cwd(), ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    const gitignore = fs.readFileSync(gitignorePath, "utf-8");
    if (!gitignore.includes(".postey/") && !gitignore.includes(".postey\n")) {
      if (isNonInteractive) {
        fs.appendFileSync(gitignorePath, "\n# Postey config (contains API key)\n.postey/\n");
        console.error(fmt.success("Added .postey/ to .gitignore"));
      } else {
        console.error("");
        const addToGitignore = await prompt(`${colors.bold}Add .postey/ to .gitignore?${colors.reset} ${fmt.dim("[Y/n]")}: `);
        if (addToGitignore.toLowerCase() !== "n") {
          fs.appendFileSync(gitignorePath, "\n# Postey config (contains API key)\n.postey/\n");
          console.error(fmt.success("Added .postey/ to .gitignore"));
        }
      }
    }
  } else {
    if (isNonInteractive) {
      fs.writeFileSync(gitignorePath, "# Postey config (contains API key)\n.postey/\n");
      console.error(fmt.success("Created .gitignore with .postey/ entry"));
    } else {
      console.error("");
      console.error(fmt.warn("No .gitignore found. Your API key could be accidentally committed."));
      const createGitignore = await prompt(`${colors.bold}Create .gitignore with .postey/ entry?${colors.reset} ${fmt.dim("[Y/n]")}: `);
      if (createGitignore.toLowerCase() !== "n") {
        fs.writeFileSync(gitignorePath, "# Postey config (contains API key)\n.postey/\n");
        console.error(fmt.success("Created .gitignore with .postey/ entry"));
      } else {
        console.error(fmt.warn("Remember to add .postey/ to .gitignore to protect your API key"));
      }
    }
  }
}


async function cmdSetup(args) {
  const parsed = parseArgs(args, {});
  const isNonInteractive = !!(parsed._positional[0] || parsed.key);

  const apiKey = await _promptApiKey(parsed, isNonInteractive);
  const location = await _resolveLocation(isNonInteractive, parsed);
  const isLocal = location === "local" || location === "2";
  const configPath = isLocal ? path.join(process.cwd(), LOCAL_CONFIG_FILE) : GLOBAL_CONFIG_FILE;

  const existingConfig = readConfigFile(configPath) || {};
  writeConfig(configPath, {
    ...existingConfig,
    // Binds a local config to this directory. A copy of it elsewhere is ignored.
    ...(isLocal ? { scope_path: _resolvedCwd() } : {}),
    apiKey,
  });

  await _setupGitignore(isLocal, isNonInteractive);

  console.error("");
  console.error(fmt.success(`API key saved to ${fmt.dim(configPath)}`));
  console.error("");
  console.error(fmt.info("In Claude Code: read postey://accounts to see your connected accounts."));

  output({
    success: true,
    message: "Setup complete",
    config_path: configPath,
    scope: isLocal ? "local" : "global",
  });
}

async function cmdConfigShow() {
  const result  = getApiKey();
  const oauth   = getOAuthConfig();
  // A CLI linked with auth:link holds neither an API key nor its own OAuth
  // session, and is nonetheless fully authenticated.
  const linkedToken = readConfigFile(GLOBAL_CONFIG_FILE)?.cliToken || null;

  if (!result && !oauth && !linkedToken && !process.env.POSTEY_AUTH_TOKEN) {
    output({
      configured: false,
      hint: "Run: postey.js auth:login  (OAuth)  or  postey.js setup  (API key)",
      api_key_url: API_KEY_URL,
    });
    return;
  }

  // Also show what config files exist
  const localConfigPath = path.join(process.cwd(), LOCAL_CONFIG_FILE);
  const localConfig = readConfigFile(localConfigPath);
  const globalConfig = readConfigFile(GLOBAL_CONFIG_FILE);

  // Get default account info
  const defaultSocialSet = getDefaultAccountId();

  // Determine active auth method
  let authMethod, authPreview;
  if (process.env.POSTEY_API_KEY) {
    authMethod  = "api_key (env)";
    authPreview = process.env.POSTEY_API_KEY.slice(0, 8) + "...";
  } else if (process.env.POSTEY_AUTH_TOKEN) {
    authMethod  = "bearer (env)";
    authPreview = decodeJwtPayload(process.env.POSTEY_AUTH_TOKEN)?.sub || "unknown";
  } else if (oauth?.access_token) {
    const payload   = decodeJwtPayload(oauth.access_token);
    const expiresAt = payload?.exp ?? oauth.expires_at ?? 0;
    const expired   = Date.now() / 1000 > expiresAt;
    authMethod  = expired ? "oauth (expired — run auth:login)" : "oauth";
    authPreview = payload?.sub || payload?.username || "unknown";
  } else if (globalConfig?.cliToken) {
    // Mirrors getAuthHeader's order. Without this arm a linked CLI reports
    // itself unconfigured, which reads as a broken install to the one flow
    // that was supposed to make setup finish cleanly.
    authMethod  = "linked (auth:link)";
    authPreview = globalConfig.cliToken.slice(0, 8) + "...";
  } else if (result) {
    authMethod  = `api_key (${result.source})`;
    authPreview = result.key.slice(0, 8) + "...";
  }

  output({
    configured: true,
    auth_method:  authMethod,
    auth_preview: authPreview,
    oauth: oauth
      ? {
          sub:        decodeJwtPayload(oauth.access_token)?.sub || null,
          expires_at: oauth.expires_at,
          has_refresh_token: !!oauth.refresh_token,
        }
      : null,
    default_account: defaultSocialSet
      ? { id: defaultSocialSet.id, source: defaultSocialSet.source }
      : null,
    config_files: {
      local: localConfig
        ? {
            path: localConfigPath,
            has_key: !!localConfig.apiKey,
            has_oauth: !!localConfig.oauth,
            has_default_account: !!localConfig.defaultAccountId,
          }
        : null,
      global: globalConfig
        ? {
            path: GLOBAL_CONFIG_FILE,
            has_key: !!globalConfig.apiKey,
            has_oauth: !!globalConfig.oauth,
            has_default_account: !!globalConfig.defaultAccountId,
          }
        : null,
    },
  });
}

function showHelp() {
  console.error(`Postey CLI - Manage social media posts via the Postey API

USAGE:
  postey.js <command> [arguments]

NOTE:
  Commands that take an account_id as a positional argument also accept:
    --social-set-id <id>   (or --social_set_id <id>)

SETUP:
  setup                                      Save API key to config
    --key <api_key>                          Provide key non-interactively (enables non-interactive mode)
    --location <global|local>                Choose config location (default: global in non-interactive mode)
                                             global: ~/.config/postey/config.json
                                             local: ./.postey/config.json (project-specific)

  config:show                                Show current config and API key source

COMMANDS:
  media:upload --platform <platform> --file <path>
                                             Upload a media file (unlinked). Returns CDN URL

VIDEO SUBCOMMANDS:
  video post --video <path|url> --text <caption> --platforms <CSV> --account-id <id>
                                             Upload video, return inputs for MCP create_post
                                             INSTAGRAM/TIKTOK/YOUTUBE get video attached
    --cover-time <sec>                       Cover frame extraction offset in seconds (default: 3)
    --cover-url <url>                        Skip auto cover extraction, use this URL
    --youtube-title <str>                    YouTube video title
    --title <str>                            Internal draft title
    --tags <CSV>                             Comma-separated numeric tag IDs
    --dry-run                                Validate + show payload without calling API

  video trim --file <path> --start <sec> (--end <sec> | --duration <sec>)
                                             Trim a video clip (stream copy, no re-encode)
    --output <path>                          Output path (default: <basename>_trimmed.<ext>)

  video info --file <path>
                                             Inspect video: duration, codec, dimensions, platform hints

  video transcribe --input <url|path>   (or: video transcribe <url|path>)
                                             Transcribe video audio via yt-dlp + Whisper
    --platform <CSV>                         If set, also create draft (requires --account-id)
    --account-id <id>                        Account to post to when --platform is given
    --model <size>                           Whisper model: tiny|base|small|medium|large (default: small)
    --translate                              Translate audio to English
    --dry-run                                Show what would be posted without API calls

  Run  postey.js video <subcommand> --help  for full flag reference.

EXAMPLES:
  # First time setup (interactive)
  ./postey.js setup

  # Non-interactive setup (for scripts/CI)
  ./postey.js setup --key typ_xxx --location global

  # Check current configuration
  ./postey.js config:show

  # Upload local video → Instagram Reel (with auto cover) + text to LinkedIn and X
  ./postey.js video post --video ./reel.mp4 --text "Caption here" --platforms INSTAGRAM,LINKEDIN,X --account-id 317

  # Inspect video before uploading
  ./postey.js video info --file ./reel.mp4

  # Trim first 30 seconds
  ./postey.js video trim --file ./reel.mp4 --start 0 --duration 30

  # Transcribe a YouTube URL and get suggested captions
  ./postey.js video transcribe --input https://youtu.be/abc123

  # Dry-run: validate video post payload without calling API
  ./postey.js video post --video ./reel.mp4 --text "Caption" --platforms INSTAGRAM --account-id 317 --dry-run

CONFIG PRIORITY:
  1. POSTEY_API_KEY environment variable (highest)
  2. POSTEY_AUTH_TOKEN environment variable (bearer; set by the MCP server
     when it runs this CLI for an OAuth-authenticated caller)
  3. OAuth session from auth:login
  4. ./.postey/config.json (project-local)
  5. ~/.config/postey/config.json (user-global, lowest)

GET YOUR API KEY:
  ${API_KEY_URL}
`);
}

const MEDIA_PLATFORM_NAME = { X: "twitter", LINKEDIN: "linkedin", TIKTOK: "tiktok", INSTAGRAM: "instagram", FACEBOOK: "facebook", YOUTUBE: "youtube", BLUESKY: "bluesky", THREADS: "threads" };

async function cmdMediaUpload(args) {
  const parsed = parseArgs(args);
  const platform = parseSocialPlatformEnum(parsed.platform, "--platform");
  const filePath = parsed.file || parsed.f;
  if (!filePath) error("--file is required");
  if (!fs.existsSync(filePath)) error(`File not found: ${filePath}`);

  validateMedia(filePath, platform, error);

  const fileName = path.basename(filePath);
  const mimeType = MIME_TYPES[path.extname(fileName).toLowerCase()] || "application/octet-stream";
  const fileSize = fs.statSync(filePath).size;

  let data;
  if (fileSize > CHUNKED_UPLOAD_THRESHOLD) {
    data = await uploadFileChunked(filePath, platform, mimeType);
  } else {
    const mediaPlatform = MEDIA_PLATFORM_NAME[platform] || platform.toLowerCase();
    const fileBuffer = fs.readFileSync(filePath);
    const formData = new FormData();
    formData.append("file", new Blob([fileBuffer], { type: mimeType }), fileName);
    formData.append("platform", mediaPlatform);
    data = await apiUploadFile("/media/unlinked", formData);
  }

  output(data);
}

// ============================================================================
// auth:link — pair this CLI to the connection the agent already has
// ============================================================================
//
// The MCP server and this CLI are two surfaces. An agent that signed in to the
// server over OAuth holds a credential this CLI cannot see, which is why the
// setup document used to tell those users to export an API key they were never
// issued. This pairs the two without a second sign-in.
//
// The secret is generated HERE and never leaves this machine. `--begin` prints
// a public code and the SHA-256 challenge of a verifier it keeps; the agent
// passes only those two public values to the `link_cli` tool; `--claim`
// presents the verifier and receives the credential directly. So what lands in
// the agent's transcript — and in the model-provider request, and in whatever
// ships that client's logs — is a code that is worthless without a verifier it
// never saw.
//
// Deliberately non-blocking. `--begin` makes no network call and opens no
// browser, so an unattended agent can run it and keep going.

const LINK_CODE_PREFIX = "link_";

function b64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function s256Challenge(verifier) {
  return b64url(createHash("sha256").update(verifier, "ascii").digest());
}

// One at a time. A stale verifier is useless once its code expires, and keeping
// a pile of them is just more secret material at rest.
function savePendingLink(code, verifier) {
  const existing = readConfigFile(GLOBAL_CONFIG_FILE) || {};
  const entry = { verifier, created_at: new Date().toISOString() };
  writeConfig(GLOBAL_CONFIG_FILE, { ...existing, pendingLinks: { [code]: entry } });
}

function peekPendingLink(code) {
  const pending = readConfigFile(GLOBAL_CONFIG_FILE)?.pendingLinks || {};
  // hasOwnProperty, not `pending[code]`: inherited keys such as `__proto__` and
  // `constructor` are truthy on a plain object and read as a hit.
  return Object.prototype.hasOwnProperty.call(pending, code) ? pending[code] : null;
}

// Only after the claim succeeds. Dropping it first meant a transient failure
// destroyed the verifier while the server-side code was still claimable.
function dropPendingLink(code) {
  const existing = readConfigFile(GLOBAL_CONFIG_FILE) || {};
  if (!existing.pendingLinks) return;
  const pending = { ...existing.pendingLinks };
  delete pending[code];
  writeConfig(GLOBAL_CONFIG_FILE, { ...existing, pendingLinks: pending });
}

function saveCliToken(token) {
  const existing = readConfigFile(GLOBAL_CONFIG_FILE) || {};
  writeConfig(GLOBAL_CONFIG_FILE, { ...existing, cliToken: token });
}

async function cmdAuthLink(args) {
  const parsed = parseArgs(args, { begin: "boolean", claim: "string" });

  if (parsed.begin) {
    const verifier = b64url(randomBytes(32));
    const code = LINK_CODE_PREFIX + b64url(randomBytes(32));
    savePendingLink(code, verifier);
    output({
      link_code: code,
      code_challenge: s256Challenge(verifier),
      expires_in: 120,
      next: [
        "Call the Postey MCP tool link_cli with the link_code and code_challenge above.",
        `Then run: postey.js auth:link --claim ${code}`,
      ],
      note: "No credential exists yet. Nothing secret is printed here.",
    });
    return;
  }

  const code = parsed.claim || parsed._positional[0];
  if (!code) {
    error("Pass --begin to start a link, or --claim <code> to finish one", {
      actions: ["postey.js auth:link --begin"],
    });
  }

  const pending = peekPendingLink(code);
  if (!pending) {
    error("No pending link for that code on this machine. Start again.", {
      actions: ["postey.js auth:link --begin"],
    });
  }

  const res = await fetch(`${API_BASE}/auth/mcp/cli-link/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ link_code: code, code_verifier: pending.verifier }),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    error(data.detail || `Link failed (HTTP ${res.status})`, {
      actions: ["postey.js auth:link --begin"],
    });
  }
  if (!data.token) {
    error("The server returned no credential. Start the link again.", {
      actions: ["postey.js auth:link --begin"],
    });
  }

  saveCliToken(data.token);
  dropPendingLink(code);
  // The token is never printed. Its prefix is enough to identify the row in
  // Connected agents, and enough for a human to confirm something happened.
  output({
    linked: true,
    token_prefix: data.token_prefix || null,
    client_id: data.client_id || null,
    stored_in: GLOBAL_CONFIG_FILE,
    note: "The CLI now uses the same access as your agent. Revoke it in Postey settings under Connected agents.",
  });
}

// ============================================================================
// Main Router
// ============================================================================

const COMMANDS = {
  "auth:login":    cmdAuthLogin,
  "auth:link":     cmdAuthLink,
  "auth:logout":   cmdAuthLogout,
  setup:           cmdSetup,
  // No drafts:get / posts:create — reading and creating posts are MCP's
  // (get_post_content, create_post). See docs/skills-mcp-contract.md.
  "media:upload":  cmdMediaUpload,
  video:           cmdVideoGroup,
  "config:show":   cmdConfigShow,
  help:            showHelp,
  "--help":        showHelp,
  "-h":            showHelp,
};

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "help";
  const commandArgs = args.slice(1);

  const handler = COMMANDS[command];

  if (!handler) {
    error(`Unknown command: ${command}`, { hint: "Use --help for usage." });
  }

  try {
    await handler(commandArgs);
  } catch (err) {
    if (err.code === "ENOENT") {
      error(`File not found: ${err.path}`);
    }
    error(err.message, { stack: err.stack });
  }
}

// Only run the CLI when invoked as one. Requiring this file (tests/capability-discovery
// .test.js) must not execute a command.
if (require.main === module) {
  main();
}

module.exports = { SOCIAL_PLATFORMS };
