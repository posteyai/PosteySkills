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

// Allow overriding API base for tests / self-hosted mocks.
const API_BASE = process.env.POSTEY_API_BASE || "https://srvr.postey.ai/v1";
const GLOBAL_CONFIG_DIR = path.join(os.homedir(), ".config", "postey");
const GLOBAL_CONFIG_FILE = path.join(GLOBAL_CONFIG_DIR, "config.json");
const LOCAL_CONFIG_DIR = ".postey";
const LOCAL_CONFIG_FILE = path.join(LOCAL_CONFIG_DIR, "config.json");
const API_KEY_URL = "https://app.postey.ai?settings=api";

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

// Content-type mapping for tag colors and platform enums

const TAG_COLORS = new Set([
  "RED",
  "ORANGE",
  "YELLOW",
  "GREEN",
  "TURQUOISE",
  "BLUE",
  "SKY_BLUE",
  "LAVENDER",
  "PINK_PURPLE",
  "PINK",
]);
const SOCIAL_PLATFORMS = new Set(["X", "LINKEDIN","TIKTOK","INSTAGRAM","YOUTUBE","THREADS","BLUESKY"]);

const POST_TYPE_MAP = { X: 0, LINKEDIN: 2, THREADS: 9, FACEBOOK: 4, INSTAGRAM: 5, YOUTUBE: 10, TIKTOK: 7, BLUESKY: 8 };

function postToDocId(postId, platform) {
  const typeId = POST_TYPE_MAP[platform];
  if (typeId === undefined) error(`Unknown platform for doc_id: ${platform}`);
  return postId * 256 + typeId;
}

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

function getApiKey() {
  // Priority 1: Environment variable
  if (process.env.POSTEY_API_KEY) {
    return { source: "environment variable", key: process.env.POSTEY_API_KEY };
  }

  // Priority 2: Project-local config (./.postey/config.json)
  const localConfigPath = path.join(process.cwd(), LOCAL_CONFIG_FILE);
  const localConfig = readConfigFile(localConfigPath);
  if (localConfig?.apiKey) {
    return { source: localConfigPath, key: localConfig.apiKey };
  }

  // Priority 3: User-global config (~/.config/postey/config.json)
  const globalConfig = readConfigFile(GLOBAL_CONFIG_FILE);
  if (globalConfig?.apiKey) {
    return { source: GLOBAL_CONFIG_FILE, key: globalConfig.apiKey };
  }

  return null;
}

function getDefaultSocialSetId() {
  // Priority 1: Project-local config (./.postey/config.json)
  const localConfigPath = path.join(process.cwd(), LOCAL_CONFIG_FILE);
  const localConfig = readConfigFile(localConfigPath);
  if (localConfig?.defaultSocialSetId) {
    return { source: localConfigPath, id: localConfig.defaultSocialSetId };
  }

  // Priority 2: User-global config (~/.config/postey/config.json)
  const globalConfig = readConfigFile(GLOBAL_CONFIG_FILE);
  if (globalConfig?.defaultSocialSetId) {
    return { source: GLOBAL_CONFIG_FILE, id: globalConfig.defaultSocialSetId };
  }

  return null;
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
// Priority: env API key → OAuth token (auto-refresh) → config API key.
async function getAuthHeader() {
  // 1. Env override (API key) — skip OAuth entirely
  if (process.env.POSTEY_API_KEY) {
    return { header: "X-API-Key", value: process.env.POSTEY_API_KEY };
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

  // 3. API key in config files
  const localConfigPath = path.join(process.cwd(), LOCAL_CONFIG_FILE);
  const localConfig = readConfigFile(localConfigPath);
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
 * Sort and format social sets for display.
 * Personal accounts (team: null) come first, then team accounts grouped by team name.
 * Returns array of { set, displayLine } objects maintaining selection index mapping.
 */
function formatSocialSetsForDisplay(socialSets) {
  // Separate personal and team accounts
  const personal = socialSets.filter((s) => !s.team);
  const team = socialSets.filter((s) => s.team);

  // Sort team accounts by team name
  team.sort((a, b) => (a.team.name || "").localeCompare(b.team.name || ""));

  // Combine: personal first, then team
  const sorted = [...personal, ...team];

  // Format each for display with colors
  return sorted.map((set, index) => {
    const num = fmt.num(`${index + 1}.`.padStart(3));
    const name = fmt.bold(set.name || "Unnamed");
    const username = set.username ? fmt.dim(` @${set.username}`) : "";
    const teamLabel = set.team ? fmt.label(` [${set.team.name}]`) : "";
    const displayLine = `  ${num} ${name}${username}${teamLabel}`;
    return { set, displayLine, index: index + 1 };
  });
}

function requireSocialSetId(providedId) {
  if (providedId) {
    return providedId;
  }

  const defaultResult = getDefaultSocialSetId();
  if (defaultResult) {
    return defaultResult.id;
  }

  error("social_set_id is required", {
    hint: "Run: postey.js config:set-default to set a default, or provide it as an argument",
  });
}

function requireAccountId(providedId) {
  if (providedId) {
    return providedId;
  }

  const defaultResult = getDefaultSocialSetId();
  if (defaultResult) {
    return defaultResult.id;
  }

  error("account_id is required", {
    hint: "Provide account_id (or --account-id), or set a default with: postey.js config:set-default",
  });
}

/**
 * Resolve draft target for commands that accept [social_set_id] <draft_id>.
 * When a default social set is configured, a single argument is ambiguous,
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

  let data;
  const text = await response.text();
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

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
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
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

  if (process.stderr.isTTY) {
    process.stderr.write(`Chunked upload: ${filename} (${(fileSize / 1024 / 1024).toFixed(1)} MB)\n`);
  }

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

  if (process.stderr.isTTY) {
    process.stderr.write(`Upload ID: ${upload_id} | ${total_chunks} chunks × ${(chunk_size / 1024).toFixed(0)} KB\n`);
  }

  // 2. Upload chunks in parallel (max 4 concurrent)
  const CONCURRENCY = 8;
  let completed = 0;

  async function uploadChunk(i) {
    const start = i * chunk_size;
    const end = Math.min(start + chunk_size, fileSize) - 1;
    const chunkLen = end - start + 1;
    const buf = Buffer.alloc(chunkLen);
    const fd = fs.openSync(filePath, "r");
    try {
      fs.readSync(fd, buf, 0, chunkLen, start);
    } finally {
      fs.closeSync(fd);
    }

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
      error(`HTTP ${patchRes.status} on chunk ${i + 1}`, { response: errData });
    }

    completed++;
    if (process.stderr.isTTY) {
      const pct = ((completed / total_chunks) * 100).toFixed(0);
      process.stderr.write(`\r  ${pct}% (${completed}/${total_chunks} chunks)`);
    }
  }

  // Run with bounded concurrency
  const indices = Array.from({ length: total_chunks }, (_, i) => i);
  for (let i = 0; i < indices.length; i += CONCURRENCY) {
    await Promise.all(indices.slice(i, i + CONCURRENCY).map(uploadChunk));
  }

  if (process.stderr.isTTY) process.stderr.write("\n");

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

async function cmdVideoPost(args) {
  const parsed = parseArgs(args, { "publish-now": "boolean" });

  const videoSrc = parsed.video;
  const text = parsed.text;
  const platformsCsv = parsed.platforms;
  const accountId = requireIntId(
    resolveAccountIdFromParsed(parsed, parsed._positional[0]),
    "account_id",
  );

  if (!videoSrc) error("--video is required (local path or https:// URL)");
  if (!text) error("--text is required");
  if (!platformsCsv) error("--platforms is required (comma-separated, e.g. INSTAGRAM,LINKEDIN,X)");

  const platforms = platformsCsv.toUpperCase().split(",").map((p) => p.trim()).filter(Boolean);
  const hasInsta = platforms.includes("INSTAGRAM");
  const isUrl = videoSrc.startsWith("https://");
  const coverTimeSec = parseFloat(parsed["cover-time"] || "3");
  const publishNow = !!parsed["publish-now"];
  const scheduleAt = !publishNow && parsed.schedule
    ? coerceFlagValueToString(parsed.schedule, "--schedule")
    : null;
  const title = parsed.title
    ? coerceFlagValueToString(parsed.title, "--title")
    : "Untitled Draft";

  // 1. Upload video (Instagram only — other platforms are text-only)
  let videoUrl = null;
  if (hasInsta) {
    if (isUrl) {
      videoUrl = videoSrc; // already hosted on CDN
    } else {
      if (!fs.existsSync(videoSrc)) error(`File not found: ${videoSrc}`);
      const ext = path.extname(videoSrc).toLowerCase();
      const mimeType = MIME_TYPES[ext] || "video/mp4";
      const fileSize = fs.statSync(videoSrc).size;
      let result;
      if (fileSize > CHUNKED_UPLOAD_THRESHOLD) {
        result = await uploadFileChunked(videoSrc, "INSTAGRAM", mimeType);
      } else {
        result = await apiUploadFile("/media/unlinked", buildFormData(videoSrc, mimeType, "instagram"));
      }
      videoUrl = result.url;
    }
    if (process.stderr.isTTY) process.stderr.write(`Video URL: ${videoUrl}\n`);
  }

  // 2. Extract cover thumbnail with ffmpeg and upload (Instagram only)
  let coverUrl = null;
  if (hasInsta) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "postey_vpost_"));
    const thumbOut = path.join(tmpDir, "cover.jpg");
    try {
      const ffResult = spawnSync(
        "ffmpeg",
        ["-ss", String(coverTimeSec), "-i", videoSrc, "-vframes", "1", "-q:v", "2", thumbOut, "-y"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
      if (ffResult.status === 0 && fs.existsSync(thumbOut)) {
        const coverResult = await apiUploadFile(
          "/media/unlinked",
          buildFormData(thumbOut, "image/jpeg", "instagram"),
        );
        coverUrl = coverResult.url;
        if (process.stderr.isTTY) process.stderr.write(`Cover URL: ${coverUrl}\n`);
      } else {
        process.stderr.write("Warning: ffmpeg cover extraction failed — posting without cover_url\n");
        if (ffResult.stderr) process.stderr.write(ffResult.stderr.slice(0, 500) + "\n");
      }
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  }

  // 3. Build content + POST to /posts/raw
  const content = { text };
  if (videoUrl) content.media_urls = [videoUrl];
  if (coverUrl) content.cover_url = coverUrl;

  const body = {
    account_id: accountId,
    platforms,
    contents: [content],
    publish_now: publishNow,
    schedule_at: scheduleAt,
    draft_title: title,
    tags: parseTagIds(parsed.tags),
    post_type: hasInsta ? "REEL" : null,
  };

  const data = await apiRequest("POST", "/posts/raw", body);
  output(data);
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

function resolveSocialSetIdFromParsed(parsed, positionalId) {
  const flagId = getSocialSetIdFromParsed(parsed);
  if (flagId && positionalId && flagId !== positionalId) {
    error("Conflicting social_set_id values", {
      positional: positionalId,
      flag: flagId,
    });
  }
  return requireSocialSetId(flagId || positionalId);
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

function parseTagColor(value) {
  if (value == null || value === true) {
    error("--color is required");
  }
  if (typeof value !== "string") {
    error("--color must be a string");
  }
  const normalized = value.trim().toUpperCase().replace(/-/g, "_");
  if (!TAG_COLORS.has(normalized)) {
    error("Invalid tag color", {
      provided: value,
      allowed: Array.from(TAG_COLORS),
    });
  }
  return normalized;
}

function parseDefaultPlatform(value) {
  if (value == null || value === true) {
    error("default_platform is required", {
      hint: "Pass platform as positional arg or --platform (X, LINKEDIN)",
    });
  }
  if (typeof value !== "string") {
    error("default_platform must be a string");
  }
  const normalized = value.trim().toUpperCase().replace(/-/g, "_");
  const mapped = normalized === "TWITTER" ? "X" : normalized;
  if (!SOCIAL_PLATFORMS.has(mapped)) {
    error("Invalid default platform", {
      provided: value,
      allowed: Array.from(SOCIAL_PLATFORMS),
    });
  }
  return mapped;
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

function resolveDraftIdOnlyFromParsed(parsed, commandName) {
  const positional = parsed._positional;

  if (getSocialSetIdFromParsed(parsed)) {
    error(`${commandName} does not accept social_set_id`, {
      hint: `Use: postey.js ${commandName} <draft_id>`,
    });
  }

  if (parsed["use-default"]) {
    error(`--use-default is not supported for ${commandName}`, {
      hint: `Use: postey.js ${commandName} <draft_id>`,
    });
  }

  if (positional.length === 0) {
    error("draft_id is required");
  }

  if (positional.length > 1) {
    error(`${commandName} only accepts <draft_id>`, {
      hint: `Do not pass social_set_id. Use: postey.js ${commandName} <draft_id>`,
    });
  }

  return positional[0];
}

function parsePlatformList(platformValue) {
  return parsePlatformCsvToEnums(platformValue, "--platform");
}

async function resolvePlatformsForPost(postId, parsed) {
  const fromArg = parsePlatformList(parsed.platform);
  if (fromArg && fromArg.length > 0) {
    return fromArg;
  }

  // No explicit platform provided: infer from enabled platforms on the post.
  const post = await apiRequest("GET", `/posts/${postId}`);
  const inferred = Object.entries(post.platforms || {})
    .filter(([, cfg]) => cfg && cfg.enabled)
    .map(([platform]) => parseSocialPlatformEnum(platform, "platform"));

  if (inferred.length === 0) {
    error(
      "No enabled platforms found on this draft. Pass --platform x,linkedin,...",
    );
  }

  return inferred;
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
        clearTimeout(timer);
        const u = new URL(req.url, "http://localhost");

        if (u.pathname !== "/callback") {
          res.writeHead(404); res.end("Not found"); return;
        }

        const oauthErr = u.searchParams.get("error");
        const code     = u.searchParams.get("code");
        const gotState = u.searchParams.get("state");

        const html = (title, body) =>
          `<!DOCTYPE html><html><head><title>Postey CLI</title><style>
            body{font-family:sans-serif;text-align:center;padding-top:80px;background:#fafafa}
            h2{color:#111}p{color:#555}
          </style></head><body><h2>${title}</h2><p>${body}</p></body></html>`;

        if (oauthErr) {
          const desc = u.searchParams.get("error_description") || oauthErr;
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(html("Authentication error", `${desc}<br>You can close this window.`));
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
    const localPath = path.join(process.cwd(), LOCAL_CONFIG_FILE);
    const existing  = readConfigFile(localPath) || {};
    writeConfig(localPath, { ...existing, oauth: oauthEntry });
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
  if (!oauth) {
    output({ success: true, message: "No OAuth session found — nothing to clear." });
    return;
  }
  clearOAuthConfig();
  console.error(fmt.success("OAuth tokens cleared from config."));
  output({ success: true, message: "Logged out" });
}

async function cmdSocialSetsList() {
  const data = await apiRequest("GET", "/accounts");
  output(data);
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
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", {
    mode: 0o600,
  });
}

async function cmdSetup(args) {
  const parsed = parseArgs(args, { "no-default": "boolean" });

  // Check if running in non-interactive mode (key provided as argument)
  let apiKey = parsed._positional[0] || parsed.key;
  let location = parsed.location || parsed.scope;
  const defaultSocialSetArg = parsed["default-social-set"];
  const noDefault =
    parsed["no-default"] === true || parsed["no-default"] === "true";

  // Non-interactive mode when --key is provided
  const isNonInteractive = !!apiKey;

  // If key provided via argument, skip interactive prompt
  if (!apiKey) {
    console.error("");
    console.error(fmt.title("Postey CLI Setup"));
    console.error("");
    console.error(
      fmt.dim("Sign up free at postey.ai if you don't have an account."),
    );
    console.error("");
    console.error(fmt.info(`Get your API key at: ${fmt.link(API_KEY_URL)}`));
    console.error("");
    apiKey = await prompt(
      `${colors.bold}Enter your Postey API key:${colors.reset} `,
    );
  }

  if (!apiKey) {
    error("API key is required");
  }

  // Determine location
  if (!location) {
    if (isNonInteractive) {
      // Default to global in non-interactive mode
      location = "global";
    } else {
      console.error("");
      console.error(fmt.bold("Where should the API key be stored?"));
      console.error(
        `  ${fmt.num("1.")} Global ${fmt.dim("(~/.config/postey/)")} ${fmt.label("- Available to all projects")}`,
      );
      console.error(
        `  ${fmt.num("2.")} Local ${fmt.dim("(./.postey/)")} ${fmt.label("- Only this project")}`,
      );
      console.error("");
      const choice = await prompt(
        `${colors.bold}Choose location [1/2]${colors.reset} ${fmt.dim("(default: 1)")}: `,
      );
      location = choice === "2" ? "local" : "global";
    }
  }

  const isLocal = location === "local" || location === "2";
  const configPath = isLocal
    ? path.join(process.cwd(), LOCAL_CONFIG_FILE)
    : GLOBAL_CONFIG_FILE;

  // Read existing config to preserve other settings
  const existingConfig = readConfigFile(configPath) || {};
  const newConfig = { ...existingConfig, apiKey };

  writeConfig(configPath, newConfig);

  // Offer to add .postey/ to .gitignore for local config
  if (isLocal) {
    const gitignorePath = path.join(process.cwd(), ".gitignore");
    if (fs.existsSync(gitignorePath)) {
      const gitignore = fs.readFileSync(gitignorePath, "utf-8");
      if (!gitignore.includes(".postey/") && !gitignore.includes(".postey\n")) {
        if (isNonInteractive) {
          // Auto-add to .gitignore in non-interactive mode
          fs.appendFileSync(
            gitignorePath,
            "\n# Postey config (contains API key)\n.postey/\n",
          );
          console.error(fmt.success("Added .postey/ to .gitignore"));
        } else {
          console.error("");
          const addToGitignore = await prompt(
            `${colors.bold}Add .postey/ to .gitignore?${colors.reset} ${fmt.dim("[Y/n]")}: `,
          );
          if (addToGitignore.toLowerCase() !== "n") {
            fs.appendFileSync(
              gitignorePath,
              "\n# Postey config (contains API key)\n.postey/\n",
            );
            console.error(fmt.success("Added .postey/ to .gitignore"));
          }
        }
      }
    } else {
      // No .gitignore exists - offer to create one to protect the API key
      if (isNonInteractive) {
        // Auto-create .gitignore in non-interactive mode
        fs.writeFileSync(
          gitignorePath,
          "# Postey config (contains API key)\n.postey/\n",
        );
        console.error(fmt.success("Created .gitignore with .postey/ entry"));
      } else {
        console.error("");
        console.error(
          fmt.warn(
            "No .gitignore found. Your API key could be accidentally committed.",
          ),
        );
        const createGitignore = await prompt(
          `${colors.bold}Create .gitignore with .postey/ entry?${colors.reset} ${fmt.dim("[Y/n]")}: `,
        );
        if (createGitignore.toLowerCase() !== "n") {
          fs.writeFileSync(
            gitignorePath,
            "# Postey config (contains API key)\n.postey/\n",
          );
          console.error(fmt.success("Created .gitignore with .postey/ entry"));
        } else {
          console.error(
            fmt.warn(
              "Remember to add .postey/ to .gitignore to protect your API key",
            ),
          );
        }
      }
    }
  }

  console.error("");
  console.error(fmt.success(`API key saved to ${fmt.dim(configPath)}`));

  // Handle default social set
  let defaultSocialSetId = null;

  // If --default-social-set was provided, validate it before saving
  if (defaultSocialSetArg) {
    // Validate the social set exists via API
    const origKey = process.env.POSTEY_API_KEY;
    process.env.POSTEY_API_KEY = apiKey;
    try {
      await apiRequest("GET", `/social-sets/${defaultSocialSetArg}`, null, {
        exitOnError: false,
      });
    } catch {
      if (origKey) {
        process.env.POSTEY_API_KEY = origKey;
      } else {
        delete process.env.POSTEY_API_KEY;
      }
      error(`Social set ${defaultSocialSetArg} not found or not accessible`);
    }
    if (origKey) {
      process.env.POSTEY_API_KEY = origKey;
    } else {
      delete process.env.POSTEY_API_KEY;
    }

    defaultSocialSetId = defaultSocialSetArg;
    const updatedConfig = readConfigFile(configPath) || {};
    updatedConfig.defaultSocialSetId = defaultSocialSetId;
    writeConfig(configPath, updatedConfig);
    console.error(
      fmt.success(`Default social set saved: ${defaultSocialSetId}`),
    );
  } else if (noDefault) {
    // Skip setting default social set
    console.error(fmt.dim("Skipping default social set configuration."));
  } else {
    // Fetch social sets to determine what to do
    let socialSets = null;
    try {
      const origKey = process.env.POSTEY_API_KEY;
      process.env.POSTEY_API_KEY = apiKey;
      socialSets = await apiRequest("GET", "/social-sets?limit=50", null, {
        exitOnError: false,
      });
      if (origKey) {
        process.env.POSTEY_API_KEY = origKey;
      } else {
        delete process.env.POSTEY_API_KEY;
      }
    } catch (err) {
      console.error(fmt.warn(`Could not fetch social sets: ${err.message}`));
      console.error(
        fmt.dim(
          "You can set a default later with: postey.js config:set-default",
        ),
      );
    }

    if (socialSets) {
      if (!socialSets.results || socialSets.results.length === 0) {
        // No social sets found - provide helpful guidance
        console.error("");
        console.error(fmt.warn("No social sets found."));
        console.error(
          fmt.dim("To get started, connect a social account at postey.ai:"),
        );
        console.error(
          fmt.info(`${fmt.link("https://app.postey.ai")}`),
        );
        console.error("");
        console.error(
          fmt.dim("After connecting, run: postey.js config:set-default"),
        );
      } else if (socialSets.results.length === 1) {
        // Only one social set - auto-select it without asking
        defaultSocialSetId = socialSets.results[0].id;
        const updatedConfig = readConfigFile(configPath) || {};
        updatedConfig.defaultSocialSetId = defaultSocialSetId;
        writeConfig(configPath, updatedConfig);
        const name = socialSets.results[0].name || "Unnamed";
        const username = socialSets.results[0].username
          ? `@${socialSets.results[0].username}`
          : "";
        console.error(
          fmt.success(
            `Default social set: ${fmt.bold(name)} ${fmt.dim(username)}`,
          ),
        );
      } else if (isNonInteractive) {
        // Multiple social sets in non-interactive mode
        console.error(
          fmt.info(
            `Found ${socialSets.results.length} social sets. Use --default-social-set <id> to set one as default.`,
          ),
        );
      } else {
        // Multiple social sets in interactive mode - ask user to choose
        const formatted = formatSocialSetsForDisplay(socialSets.results);

        console.error("");
        console.error(fmt.bold("Choose a default social set"));
        console.error(
          fmt.dim(
            "This will be used when you don't specify one. You can always override it.",
          ),
        );
        console.error("");
        formatted.forEach(({ displayLine }) => console.error(displayLine));
        console.error("");

        const choice = await prompt(
          `${colors.bold}Enter number${colors.reset} ${fmt.dim("(or Enter to skip)")}: `,
        );
        if (choice) {
          const choiceNum = parseInt(choice, 10);
          if (
            !isNaN(choiceNum) &&
            choiceNum >= 1 &&
            choiceNum <= formatted.length
          ) {
            defaultSocialSetId = formatted[choiceNum - 1].set.id;
            const updatedConfig = readConfigFile(configPath) || {};
            updatedConfig.defaultSocialSetId = defaultSocialSetId;
            writeConfig(configPath, updatedConfig);
            console.error(fmt.success(`Default social set saved`));
          }
        }
      }
    }
  }

  output({
    success: true,
    message: "Setup complete",
    config_path: configPath,
    scope: isLocal ? "local" : "global",
    default_social_set_id: defaultSocialSetId,
  });
}

async function cmdConfigShow() {
  const result  = getApiKey();
  const oauth   = getOAuthConfig();

  if (!result && !oauth) {
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

  // Get default social set info
  const defaultSocialSet = getDefaultSocialSetId();

  // Determine active auth method
  let authMethod, authPreview;
  if (process.env.POSTEY_API_KEY) {
    authMethod  = "api_key (env)";
    authPreview = process.env.POSTEY_API_KEY.slice(0, 8) + "...";
  } else if (oauth?.access_token) {
    const payload   = decodeJwtPayload(oauth.access_token);
    const expiresAt = payload?.exp ?? oauth.expires_at ?? 0;
    const expired   = Date.now() / 1000 > expiresAt;
    authMethod  = expired ? "oauth (expired — run auth:login)" : "oauth";
    authPreview = payload?.sub || payload?.username || "unknown";
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
    default_social_set: defaultSocialSet
      ? { id: defaultSocialSet.id, source: defaultSocialSet.source }
      : null,
    config_files: {
      local: localConfig
        ? {
            path: localConfigPath,
            has_key: !!localConfig.apiKey,
            has_oauth: !!localConfig.oauth,
            has_default_social_set: !!localConfig.defaultSocialSetId,
          }
        : null,
      global: globalConfig
        ? {
            path: GLOBAL_CONFIG_FILE,
            has_key: !!globalConfig.apiKey,
            has_oauth: !!globalConfig.oauth,
            has_default_social_set: !!globalConfig.defaultSocialSetId,
          }
        : null,
    },
  });
}

async function cmdConfigSetDefault(args) {
  const parsed = parseArgs(args);
  if (parsed._positional.length > 2) {
    error(
      "config:set-default usage: config:set-default [account_id] <platform>",
    );
  }

  requireApiKey();

  const positional = parsed._positional;
  const first = positional[0];
  const second = positional[1];

  const firstLooksAccount = typeof first === "string" && /^\d+$/.test(first);
  const accountPositional = firstLooksAccount ? first : null;
  const platformPositional = firstLooksAccount ? second : first;
  const accountId = requireIntId(
    resolveAccountIdFromParsed(parsed, accountPositional),
    "account_id",
  );
  const platformRaw =
    parsed.platform ?? parsed.default_platform ?? platformPositional;
  const defaultPlatform = parseDefaultPlatform(platformRaw);

  // Determine if preferences already exist for this account
  const existing = await apiRequest(
    "GET",
    `/accounts/preferences/${accountId}`,
  );

  const params = new URLSearchParams({ default_platform: defaultPlatform });
  const hasExisting = existing && existing.preference_id != null;
  const method = hasExisting ? "PATCH" : "POST";

  await apiRequest(
    method,
    `/accounts/preferences/${accountId}?${params.toString()}`,
  );

  output({
    success: true,
    message: "Default platform configured",
    account_id: accountId,
    default_platform: defaultPlatform,
    operation: hasExisting ? "updated" : "created",
  });
}

async function cmdDraftsList(args) {
  const parsed = parseArgs(args);
  const socialSetId = resolveSocialSetIdFromParsed(
    parsed,
    parsed._positional[0],
  );

  const params = new URLSearchParams();
  params.set("limit", parsed.limit || "10");
  params.set("account", socialSetId);
  if (parsed.status) params.set("status", parsed.status);
  if (parsed.tag) params.set("tag", parsed.tag);
  if (parsed.sort) params.set("order_by", parsed.sort);

  const data = await apiRequest("GET", `/posts?${params}`);
  output(data);
}

async function cmdDraftsGet(args) {
  const parsed = parseArgs(args, { "use-default": "boolean" });
  const draftId = resolveDraftIdOnlyFromParsed(parsed, "drafts:get");

  const data = await apiRequest("GET", `/posts/${draftId}`);
  output(data);
}

async function cmdDraftsCreate(args) {
  const parsed = parseArgs(args, {
    share: "boolean",
    all: "boolean",
    "publish-now": "boolean",
    "youtube-made-for-kids": "boolean",
    "youtube-notify-subscribers": "boolean",
    "youtube-embeddable": "boolean",
  });
  const accountId = requireIntId(
    resolveAccountIdFromParsed(parsed, parsed._positional[0]),
    "account_id",
  );

  const unsupportedFlags = ["reply-to", "community", "share", "notes"];
  const usedUnsupported = unsupportedFlags.filter((k) =>
    Object.prototype.hasOwnProperty.call(parsed, k),
  );
  if (usedUnsupported.length > 0) {
    error("Unsupported options for /posts/raw create", {
      unsupported: usedUnsupported.map((k) => `--${k}`),
      hint: "Use --text/--file, --platform, --title, --tags, --schedule, --publish-now, --media-urls",
    });
  }

  // Get text content
  let text = parsed.text;
  if (parsed.file) {
    if (!fs.existsSync(parsed.file)) {
      error(`File not found: ${parsed.file}`);
    }
    text = fs.readFileSync(parsed.file, "utf-8");
  }

  if (!text) {
    error("--text or --file is required");
  }

  if (parsed.all && parsed.platform) {
    error("Cannot use both --all and --platform flags");
  }

  // Determine platforms
  let platformEnums = parsePlatformCsvToEnums(parsed.platform, "--platform");
  if (parsed.all) {
    error(
      "--all is not supported for /posts/raw. Pass explicit --platform list.",
    );
  }
  if (!platformEnums || platformEnums.length === 0) {
    const pref = await apiRequest("GET", `/accounts/preferences/${accountId}`);
    if (pref && pref.default_platform) {
      platformEnums = [
        parseSocialPlatformEnum(pref.default_platform, "platform"),
      ];
    } else {
      platformEnums = ["X"];
    }
  }

  if (platformEnums.includes("YOUTUBE") && !parsed["youtube-title"]) {
    error("--youtube-title is required when posting to YOUTUBE");
  }

  const publishNow = parsed["publish-now"] || parsed.schedule === "now";
  if (publishNow && parsed.schedule && parsed.schedule !== "now") {
    error("Cannot use both --publish-now and --schedule <time>");
  }

  const scheduleAt =
    !publishNow && parsed.schedule
      ? coerceFlagValueToString(parsed.schedule, "--schedule")
      : null;

  const content = { text };
  if (parsed["youtube-title"])
    content.youtube_title = coerceFlagValueToString(parsed["youtube-title"], "--youtube-title");
  if (parsed["youtube-description"])
    content.youtube_description = coerceFlagValueToString(parsed["youtube-description"], "--youtube-description");
  if (parsed["youtube-privacy-status"])
    content.youtube_privacy_status = coerceFlagValueToString(parsed["youtube-privacy-status"], "--youtube-privacy-status");
  if (parsed["youtube-category-id"])
    content.youtube_category_id = coerceFlagValueToString(parsed["youtube-category-id"], "--youtube-category-id");
  if (parsed["youtube-made-for-kids"] !== undefined)
    content.youtube_made_for_kids = !!parsed["youtube-made-for-kids"];
  if (parsed["youtube-tags"])
    content.youtube_tags = coerceFlagValueToString(parsed["youtube-tags"], "--youtube-tags");
  if (parsed["youtube-notify-subscribers"] !== undefined)
    content.youtube_notify_subscribers = !!parsed["youtube-notify-subscribers"];
  if (parsed["youtube-license"])
    content.youtube_license = coerceFlagValueToString(parsed["youtube-license"], "--youtube-license");
  if (parsed["youtube-embeddable"] !== undefined)
    content.youtube_embeddable = !!parsed["youtube-embeddable"];
  if (parsed["media-urls"])
    content.media_urls = coerceFlagValueToString(parsed["media-urls"], "--media-urls").split(",").map((s) => s.trim());

  const body = {
    account_id: accountId,
    platforms: platformEnums,
    contents: [content],
    publish_now: !!publishNow,
    schedule_at: scheduleAt,
    draft_title: parsed.title
      ? coerceFlagValueToString(parsed.title, "--title")
      : "Untitled Draft",
    tags: parseTagIds(parsed.tags),
  };

  const data = await apiRequest("POST", "/posts/raw", body);
  output(data);
}

async function cmdDraftsContent(args) {
  const parsed = parseArgs(args);
  const positional = parsed._positional;
  if (positional.length === 0) {
    error("post_id is required");
  }
  if (positional.length > 2) {
    error("drafts:content usage: drafts:content <post_id> [platform]");
  }
  const postId = requireIntId(positional[0], "post_id");
  const platformRaw = parsed.platform ?? positional[1];
  const platform = parseSocialPlatformEnum(platformRaw, "platform");

  const params = new URLSearchParams({
    platform,
    post_id: String(postId),
  });

  const data = await apiRequest("GET", `/posts/parsed/content?${params}`);
  output(data);
}

// ---------------------------------------------------------------------------
// Aliases (human/agent-friendly)
// ---------------------------------------------------------------------------

async function cmdCreateDraftAlias(args) {
  const parsed = parseArgs(args, {
    share: "boolean",
    all: "boolean",
    "publish-now": "boolean",
  });
  const socialSetId = requireSocialSetId(getSocialSetIdFromParsed(parsed));

  const forwarded = [String(socialSetId)];

  // Prefer explicit --file / --text, otherwise treat positional args as the draft content.
  if (Object.prototype.hasOwnProperty.call(parsed, "file")) {
    forwarded.push("--file", coerceFlagValueToString(parsed.file, "--file"));
  } else {
    let text;
    if (Object.prototype.hasOwnProperty.call(parsed, "text")) {
      text = coerceFlagValueToString(parsed.text, "--text");
    } else {
      if (parsed._positional.length === 0) {
        error(
          "Draft text is required (provide it as the first argument, or use --text/--file)",
        );
      }
      text = parsed._positional.join(" ");
    }
    forwarded.push("--text", text);
  }

  pushStringFlag(forwarded, parsed, "platform", "--platform");
  if (parsed.all) forwarded.push("--all");
  pushStringFlag(forwarded, parsed, "title", "--title");
  pushStringFlag(forwarded, parsed, "schedule", "--schedule");
  pushStringFlag(forwarded, parsed, "tags", "--tags", { allowEmpty: true });
  if (parsed["publish-now"]) forwarded.push("--publish-now");
  pushStringFlag(forwarded, parsed, "youtube-title", "--youtube-title");
  pushStringFlag(forwarded, parsed, "youtube-description", "--youtube-description");
  pushStringFlag(forwarded, parsed, "youtube-privacy-status", "--youtube-privacy-status");
  pushStringFlag(forwarded, parsed, "youtube-category-id", "--youtube-category-id");
  if (parsed["youtube-made-for-kids"]) forwarded.push("--youtube-made-for-kids");
  pushStringFlag(forwarded, parsed, "youtube-tags", "--youtube-tags");
  if (parsed["youtube-notify-subscribers"]) forwarded.push("--youtube-notify-subscribers");
  pushStringFlag(forwarded, parsed, "youtube-license", "--youtube-license");
  if (parsed["youtube-embeddable"]) forwarded.push("--youtube-embeddable");
  pushStringFlag(forwarded, parsed, "media-urls", "--media-urls");

  await cmdDraftsCreate(forwarded);
}

async function cmdDraftsDelete(args) {
  const parsed = parseArgs(args);
  const draftId = resolveDraftIdOnlyFromParsed(parsed, "drafts:delete");

  await apiRequest("DELETE", `/posts`, [draftId]);
  output({ success: true, message: "Draft deleted" });
}

async function cmdDraftsSchedule(args) {
  const parsed = parseArgs(args, {
    "natural-posting": "boolean",
    natural_posting: "boolean",
  });
  const draftId = resolveDraftIdOnlyFromParsed(parsed, "drafts:schedule");
  const postId = requireIntId(draftId, "draft_id");

  if (!parsed.time) {
    error("--time is required (ISO datetime)");
  }
  const scheduledAt = coerceFlagValueToString(parsed.time, "--time");
  const platforms = await resolvePlatformsForPost(postId, parsed);

  const data = await apiRequest("PATCH", "/schedules", {
    post_id: postId,
    platforms: platforms.map((platform) => ({ platform, config: {} })),
    scheduled_at: scheduledAt,
    natural_posting: !!(parsed["natural-posting"] || parsed.natural_posting),
  });
  output(data);
}

async function cmdDraftsPublish(args) {
  const parsed = parseArgs(args, {
    "natural-posting": "boolean",
    natural_posting: "boolean",
  });
  const draftId = resolveDraftIdOnlyFromParsed(parsed, "drafts:publish");
  const postId = requireIntId(draftId, "draft_id");
  const platforms = await resolvePlatformsForPost(postId, parsed);

  const data = await apiRequest("POST", "/publish", {
    post_id: postId,
    platforms: platforms.map((platform) => ({ platform, config: {} })),
    natural_posting: !!(parsed["natural-posting"] || parsed.natural_posting),
  });
  output(data);
}

async function cmdTagsList(args) {
  const parsed = parseArgs(args);
  if (parsed._positional.length > 1) {
    error("tags:list accepts at most one positional <account_id>");
  }
  const accountId = requireIntId(
    resolveAccountIdFromParsed(parsed, parsed._positional[0]),
    "account_id",
  );

  const data = await apiRequest("GET", `/tags?account=${accountId}`);
  output(data);
}

async function cmdTagsCreate(args) {
  const parsed = parseArgs(args);
  if (parsed._positional.length > 1) {
    error("tags:create accepts at most one positional <account_id>");
  }
  const accountId = requireIntId(
    resolveAccountIdFromParsed(parsed, parsed._positional[0]),
    "account_id",
  );
  const tag = parsed.tag ?? parsed.name;
  if (!tag || tag === true) {
    error("--tag is required");
  }
  const color = parseTagColor(parsed.color);

  const data = await apiRequest("POST", `/tags`, {
    account_id: accountId,
    tag: String(tag),
    color,
  });
  output(data);
}

async function cmdTagsUpdate(args) {
  const parsed = parseArgs(args);
  const positional = parsed._positional;
  if (positional.length === 0) {
    error("tag_id is required");
  }
  if (positional.length > 2) {
    error(
      "tags:update usage: tags:update <tag_id> [account_id] --tag <tag> --color <color>",
    );
  }
  const tagId = requireIntId(positional[0], "tag_id");
  const accountId = requireIntId(
    resolveAccountIdFromParsed(parsed, positional[1]),
    "account_id",
  );
  const tag = parsed.tag ?? parsed.name;
  if (!tag || tag === true) {
    error("--tag is required");
  }
  const color = parseTagColor(parsed.color);

  const data = await apiRequest("PATCH", `/tags/${tagId}`, {
    account_id: accountId,
    tag: String(tag),
    color,
  });
  output(data);
}

async function cmdTagsDelete(args) {
  const parsed = parseArgs(args);
  const positional = parsed._positional;
  if (positional.length === 0) {
    error("tag_id is required");
  }
  if (positional.length > 2) {
    error("tags:delete usage: tags:delete <tag_id> [account_id]");
  }
  const tagId = requireIntId(positional[0], "tag_id");
  const accountId = requireIntId(
    resolveAccountIdFromParsed(parsed, positional[1]),
    "account_id",
  );

  await apiRequest("DELETE", `/tags/${tagId}?account=${accountId}`);
  output({ success: true, message: "Tag deleted" });
}

function showHelp() {
  console.log(`Postey CLI - Manage social media posts via the Postey API

USAGE:
  postey.js <command> [arguments]

NOTE:
  Commands that take a social_set_id as a positional argument also accept:
    --social-set-id <id>   (or --social_set_id <id>)

SETUP:
  setup                                      Interactive setup - saves API key and optional default social set
    --key <api_key>                          Provide key non-interactively (enables non-interactive mode)
    --location <global|local>                Choose config location (default: global in non-interactive mode)
                                             global: ~/.config/postey/config.json
                                             local: ./.postey/config.json (project-specific)
    --default-social-set <id>                Set default social set non-interactively
    --no-default                             Skip setting default social set in non-interactive mode

  config:show                                Show current config, API key source, and default social set
  config:set-default [account_id] <platform> Set account default platform via API
    --platform <platform>                    Alternative to positional platform
    --account-id <id>                        Alternative to positional account_id
                                             Allowed: X, LINKEDIN

COMMANDS:
  social-sets:list                           List all social sets

  drafts:list [social_set_id] [options]      List drafts (uses default if ID omitted)
    --status <status>                        Filter by: draft, scheduled, published, error, publishing
    --tag <tag_slug>                         Filter by tag slug
    --sort <order>                           Sort by: created_at, -created_at, updated_at, -updated_at,
                                             scheduled_date, -scheduled_date, published_at, -published_at
    --limit <n>                              Max results (default: 10, max: 50)

  drafts:get <draft_id>                      Get a specific draft

  drafts:create [account_id] [options]       Create draft via /posts/raw
    --platform <platforms>                   Comma-separated: X,LINKEDIN,TIKTOK,INSTAGRAM,THREADS,BLUESKY,YOUTUBE
                                             (uses account default platform if omitted; falls back to X)
    --text <text>                            Post caption/content for non-YouTube platforms
    --file, -f <path>                        Read content from file instead of --text
    --title <title>                          Draft title (defaults to "Untitled Draft")
    --tags <ids>                             Comma-separated numeric tag IDs (e.g. 1,2,3)
    --schedule <time>                        ISO datetime, or "now" to publish immediately
    --publish-now                            Publish immediately
    --media-urls <urls>                      Comma-separated media URLs to attach
    --youtube-title <title>                  YouTube video title (required when platform includes YOUTUBE)
    --youtube-description <text>             YouTube video description
    --youtube-privacy-status <status>        YouTube privacy: public, private, unlisted
    --youtube-category-id <id>               YouTube category ID
    --youtube-made-for-kids                  Mark as made for kids
    --youtube-tags <tags>                    YouTube tags string
    --youtube-notify-subscribers             Notify subscribers on publish
    --youtube-license <license>              YouTube license type
    --youtube-embeddable                     Allow embedding

  drafts:update [social_set_id] <draft_id> [options]  Update a draft
    --platform <platforms>                   Comma-separated platforms
                                             (preserves draft's existing platforms if omitted)
    --text <text>                            New post content
    --file, -f <path>                        Read content from file instead of --text
    --media <media_ids>                      Comma-separated media IDs to attach
    --append, -a                             Append to existing thread instead of replacing
    --title <title>                          New draft title
    --schedule <time>                        "now", "next-free-slot", or ISO datetime
    --tags <tag_slugs>                       Comma-separated tag slugs
    --share                                  Generate a public share URL for the draft
    --notes, --scratchpad <text>             Internal notes/scratchpad for the draft
    --use-default                            Required when using default social set with single arg

  create-draft <text> [options]             Alias for drafts:create (positional text + --account-id)
  update-draft <draft_id> [text] [options]  Alias for drafts:update (positional text optional + --social-set-id)

  drafts:delete <draft_id>                   Delete a draft
  drafts:content <post_id> --platform <platform>
                                             Get parsed content via /posts/parsed/content

  drafts:schedule <draft_id> [options]       Schedule a draft
    --time <time>                            ISO datetime (required)
    --platform <platforms>                   Optional comma-separated platforms
                                             (defaults to enabled platforms on the draft)
    --natural-posting                        Enable natural posting

  drafts:publish <draft_id> [options]        Publish a draft immediately
    --platform <platforms>                   Optional comma-separated platforms
                                             (defaults to enabled platforms on the draft)
    --natural-posting                        Enable natural posting

  media:upload --platform <platform> --file <path>
                                             Upload a media file (unlinked). Returns CDN URL
                                             for use in drafts:create --media-urls

  video:post [account_id] [options]          Upload a video and create a multi-platform draft
    --video <path|url>                       Local file path or https:// CDN URL (required)
    --text <caption>                         Caption for all platforms (required)
    --platforms <CSV>                        Comma-separated platform list (required)
                                             Instagram gets video + auto cover thumbnail;
                                             other platforms receive text only
    --cover-time <sec>                       Seconds into video to extract cover frame (default: 3)
    --title <title>                          Internal draft title (default: "Untitled Draft")
    --tags <ids>                             Comma-separated numeric tag IDs
    --schedule <iso>                         Schedule at ISO-8601 UTC datetime
    --publish-now                            Publish immediately after creation

  tags:list [account_id]                     List all tags (uses default account if ID omitted)
  tags:create [account_id] --tag <tag> --color <color>
                                             Create a new tag
                                             Colors: RED, ORANGE, YELLOW, GREEN, TURQUOISE, BLUE,
                                                     SKY_BLUE, LAVENDER, PINK_PURPLE, PINK
  tags:update <tag_id> [account_id] --tag <tag> --color <color>
                                             Update a tag
  tags:delete <tag_id> [account_id]          Delete a tag

EXAMPLES:
  # First time setup (interactive)
  ./postey.js setup

  # Non-interactive setup (for scripts/CI) - auto-selects default if only one social set
  ./postey.js setup --key typ_xxx --location global

  # Non-interactive setup with explicit default social set
  ./postey.js setup --key typ_xxx --location global --default-social-set 123

  # Non-interactive setup, skip default social set selection
  ./postey.js setup --key typ_xxx --no-default

  # Check current configuration (shows API key source and default social set)
  ./postey.js config:show

  # Set account default platform (uses configured default account)
  ./postey.js config:set-default x

  # Set account default platform for a specific account
  ./postey.js config:set-default 123 linkedin

  # List all social sets
  ./postey.js social-sets:list

  # Create a draft (uses default account if configured)
  ./postey.js drafts:create --text "Hello world!"

  # Create a draft with explicit account ID
  ./postey.js drafts:create 123 --text "Hello world!"

  # Create a cross-platform post (specific platforms)
  ./postey.js drafts:create --platform X,LINKEDIN --text "Big announcement!"

  # Create a thread (use --- on its own line to separate posts)
  ./postey.js drafts:create 123 --platform X --text $'First post\\n---\\nSecond post\\n---\\nThird post'

  # Create from file
  ./postey.js drafts:create 123 --platform X --file ./thread.txt

  # Schedule for specific time
  ./postey.js drafts:create 123 --platform X --text "Timed post" --schedule "2026-02-20T14:00:00Z"

  # Create and publish immediately
  ./postey.js drafts:create 123 --platform X --text "Ship it" --publish-now

  # List scheduled drafts sorted by date
  ./postey.js drafts:list 123 --status scheduled --sort scheduled_date

  # Publish a draft immediately
  ./postey.js drafts:publish 456

  # Publish only selected platforms
  ./postey.js drafts:publish 456 --platform x,linkedin

  # Delete a draft
  ./postey.js drafts:delete 456

  # Schedule a draft
  ./postey.js drafts:schedule 456 --time "2026-02-20T14:00:00Z"

  # Get parsed content for a post + platform
  ./postey.js drafts:content 456 --platform X

  # List tags (uses default account if configured)
  ./postey.js tags:list

  # Create a tag
  ./postey.js tags:create --tag "Launch" --color BLUE

  # Update a tag
  ./postey.js tags:update 22 --tag "Launch Q1" --color SKY_BLUE

  # Delete a tag
  ./postey.js tags:delete 22

  # Append to existing thread
  ./postey.js drafts:update 123 456 --append --text "New tweet at the end"

  # Upload local video → Instagram Reel (with auto cover) + text to LinkedIn and X
  ./postey.js video:post 317 --video ./reel.mp4 --text "Caption here" --platforms INSTAGRAM,LINKEDIN,X

  # Post from an already-uploaded CDN URL (skips upload, still extracts cover via ffmpeg)
  ./postey.js video:post 317 --video https://cdn.postey.ai/.../video.mp4 --text "Watch this" --platforms INSTAGRAM

  # Custom cover frame at 10 seconds, publish immediately
  ./postey.js video:post 317 --video ./reel.mp4 --text "Caption" --platforms INSTAGRAM --cover-time 10 --publish-now

CONFIG PRIORITY:
  1. POSTEY_API_KEY environment variable (highest)
  2. ./.postey/config.json (project-local)
  3. ~/.config/postey/config.json (user-global, lowest)

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
// Main Router
// ============================================================================

const COMMANDS = {
  "auth:login":  cmdAuthLogin,
  "auth:logout": cmdAuthLogout,
  setup: cmdSetup,
  "social-sets:list": cmdSocialSetsList,
  "drafts:list": cmdDraftsList,
  "drafts:get": cmdDraftsGet,
  "drafts:content": cmdDraftsContent,
  "drafts:create": cmdDraftsCreate,
  "create-draft": cmdCreateDraftAlias,
  "drafts:delete": cmdDraftsDelete,
  "drafts:schedule": cmdDraftsSchedule,
  "drafts:publish": cmdDraftsPublish,
  "tags:list": cmdTagsList,
  "tags:create": cmdTagsCreate,
  "tags:update": cmdTagsUpdate,
  "tags:delete": cmdTagsDelete,
  "media:upload": cmdMediaUpload,
  "video:post": cmdVideoPost,
  "config:show": cmdConfigShow,
  "config:set-default": cmdConfigSetDefault,
  help: showHelp,
  "--help": showHelp,
  "-h": showHelp,
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

main();
