#!/usr/bin/env node
// video2post.js — download any video URL, transcribe with Whisper, optionally create Postey drafts
// Requirements: yt-dlp, ffmpeg, whisper (openai-whisper) installed on PATH
//
// Usage: node video2post.js <video-url> [options]
//
// Options:
//   --platform <platforms>   Target Postey platform(s), comma-separated
//                            (X, LINKEDIN, TIKTOK, INSTAGRAM, THREADS, BLUESKY, YOUTUBE)
//   --account-id <id>        Postey account_id — required when --platform is set
//   --output-dir, -o <path>  Save downloaded files to this directory
//   --model <size>           Whisper model: tiny|base|small|medium|large (default: small)
//   --translate              Translate audio to English
//   --help, -h               Show this help
//
// Examples:
//   # Transcribe only (no draft created)
//   node video2post.js https://www.instagram.com/reel/abc123/
//
//   # Transcribe + create a YouTube draft in Postey
//   node video2post.js https://www.instagram.com/reel/abc123/ --platform YOUTUBE --account-id 215
//
//   # Cross-post to multiple platforms
//   node video2post.js https://tiktok.com/@user/video/123 --platform INSTAGRAM,TIKTOK --account-id 215

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// ── Constants ─────────────────────────────────────────────────────────────────

const POSTEY_JS = path.join(__dirname, 'postey.js');

const VALID_PLATFORMS = new Set(['X', 'LINKEDIN', 'TIKTOK', 'INSTAGRAM', 'THREADS', 'BLUESKY', 'YOUTUBE']);

const PLATFORM_CHAR_LIMITS = {
  X: 280,
  LINKEDIN: 3000,
  TIKTOK: 2200,
  INSTAGRAM: 2200,
  THREADS: 500,
  BLUESKY: 300,
  YOUTUBE: 5000,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const isWindows = process.platform === 'win32';

function which(cmd) {
  const result = spawnSync(isWindows ? 'where' : 'which', [cmd], { encoding: 'utf8' });
  return result.status === 0;
}

const INSTALL_HINTS = {
  'yt-dlp': {
    darwin: 'brew install yt-dlp   (or: pip install yt-dlp)',
    win32:  'winget install yt-dlp.yt-dlp   (or: pip install yt-dlp)',
    linux:  'pip install yt-dlp   (or: sudo apt install yt-dlp)',
  },
  ffmpeg: {
    darwin: 'brew install ffmpeg',
    win32:  'winget install Gyan.FFmpeg',
    linux:  'sudo apt install ffmpeg',
  },
  whisper: {
    darwin: 'pip install openai-whisper',
    win32:  'pip install openai-whisper',
    linux:  'pip install openai-whisper',
  },
};

function hint(cmd) {
  const p = process.platform;
  return (INSTALL_HINTS[cmd] || {})[p] || `install ${cmd}`;
}

function checkDeps() {
  const missing = ['yt-dlp', 'ffmpeg', 'whisper'].filter(c => !which(c));
  if (missing.length === 0) return;
  process.stderr.write('Missing required tools:\n');
  missing.forEach(c => process.stderr.write(`  ${c}  →  ${hint(c)}\n`));
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  if (result.error) {
    process.stderr.write(`Failed to run '${cmd}': ${result.error.message}\n`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.stderr.write(`'${cmd}' exited with code ${result.status}\n`);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status || 1);
  }
  return result;
}

function findVideoFile(dir) {
  const videoExts = ['.mp4', '.mkv', '.webm', '.mov', '.avi', '.m4v'];
  const files = fs.readdirSync(dir).filter(f => videoExts.includes(path.extname(f).toLowerCase()));
  if (files.length === 0) {
    process.stderr.write(`No video file found in ${dir}\n`);
    process.exit(1);
  }
  return path.join(dir, files[0]);
}

function sanitizeFilename(title) {
  return (title || '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_').slice(0, 80) || 'video';
}

function truncate(text, limit) {
  if (!text) return '';
  return text.length <= limit ? text : text.slice(0, limit - 3) + '...';
}

function fetchVideoTitle(url) {
  const result = spawnSync('yt-dlp', ['--print', '%(title)s', '--no-download', url], { encoding: 'utf8' });
  if (result.status === 0 && result.stdout) {
    return result.stdout.trim().split('\n')[0] || '';
  }
  return '';
}

function createPosteyDraft(accountId, platform, args) {
  const result = spawnSync(
    process.execPath,
    [POSTEY_JS, 'drafts:create', String(accountId), '--platform', platform, ...args],
    { encoding: 'utf8', env: process.env },
  );
  if (result.error) return { error: result.error.message };
  try {
    return JSON.parse(result.stdout);
  } catch {
    return { error: result.stderr || result.stdout || 'Unknown error' };
  }
}

function uploadPosteyMedia(platform, filePath) {
  const result = spawnSync(
    process.execPath,
    [POSTEY_JS, 'media:upload', '--platform', platform, '--file', filePath],
    { encoding: 'utf8', env: process.env },
  );
  if (result.error) return { error: result.error.message };
  try {
    return JSON.parse(result.stdout);
  } catch {
    return { error: result.stderr || result.stdout || 'Upload failed' };
  }
}

// ── Argument parsing ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  process.stdout.write([
    'Usage: node video2post.js <video-url> [options]',
    '',
    'Options:',
    '  --platform <platforms>   Target Postey platform(s), comma-separated',
    '                           (X, LINKEDIN, TIKTOK, INSTAGRAM, THREADS, BLUESKY, YOUTUBE)',
    '  --account-id <id>        Postey account_id — required when --platform is set',
    '  --output-dir, -o <path>  Save downloaded files to this directory',
    '  --model <size>           Whisper model: tiny|base|small|medium|large (default: small)',
    '  --translate              Translate audio to English (regardless of source language)',
    '  --keep-files             Keep downloaded/transcribed files after completion',
    '  --help, -h               Show this help',
    '',
    'Examples:',
    '  # Transcribe only',
    '  node video2post.js https://www.instagram.com/reel/abc123/',
    '',
    '  # Transcribe + create a YouTube draft in Postey',
    '  node video2post.js https://www.instagram.com/reel/abc123/ --platform YOUTUBE --account-id 215',
    '',
    '  # Cross-post to multiple platforms',
    '  node video2post.js https://tiktok.com/@user/video/123 --platform INSTAGRAM,TIKTOK --account-id 215',
    '',
  ].join('\n'));
  process.exit(0);
}

const url = args[0];
let outputDir = null;
let whisperModel = 'small';
let platformsRaw = null;
let accountId = null;
let translate = false;
let keepFiles = false;

for (let i = 1; i < args.length; i++) {
  if ((args[i] === '--output-dir' || args[i] === '-o') && args[i + 1]) {
    outputDir = args[++i];
  } else if (args[i] === '--model' && args[i + 1]) {
    whisperModel = args[++i];
  } else if (args[i] === '--platform' && args[i + 1]) {
    platformsRaw = args[++i];
  } else if (args[i] === '--account-id' && args[i + 1]) {
    accountId = args[++i];
  } else if (args[i] === '--translate') {
    translate = true;
  } else if (args[i] === '--keep-files') {
    keepFiles = true;
  }
}

// Validate platforms
let platforms = [];
if (platformsRaw) {
  platforms = platformsRaw.toUpperCase().split(',').map(p => p.trim()).filter(Boolean);
  const invalid = platforms.filter(p => !VALID_PLATFORMS.has(p));
  if (invalid.length > 0) {
    process.stderr.write(`Invalid platform(s): ${invalid.join(', ')}\nAllowed: ${[...VALID_PLATFORMS].join(', ')}\n`);
    process.exit(1);
  }
  if (!accountId) {
    process.stderr.write('--account-id is required when --platform is set\n');
    process.exit(1);
  }
}

function cleanupTmpDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    process.stderr.write(`Cleaned up temp files: ${dir}\n`);
  } catch (e) {
    process.stderr.write(`Warning: could not clean up ${dir}: ${e.message}\n`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

checkDeps();

const autoTmpDir = !outputDir;
const tmpDir = outputDir || path.join(os.tmpdir(), `v2p_${crypto.randomBytes(4).toString('hex')}`);
fs.mkdirSync(tmpDir, { recursive: true });

// 1. Fetch video metadata for proper file naming
process.stderr.write(`Fetching metadata: ${url}\n`);
const videoTitle = fetchVideoTitle(url);
const safeFilename = sanitizeFilename(videoTitle);

// 2. Download video
process.stderr.write(`Downloading: ${url}\n`);
run('yt-dlp', [
  '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
  '--merge-output-format', 'mp4',
  '-o', path.join(tmpDir, safeFilename + '.%(ext)s'),
  url,
]);

const videoFile = findVideoFile(tmpDir);

// 3. Extract 16 kHz mono WAV for Whisper
const audioFile = path.join(tmpDir, 'audio.wav');
process.stderr.write('Extracting audio...\n');
run('ffmpeg', ['-i', videoFile, '-ar', '16000', '-ac', '1', audioFile, '-y']);

// 4. Transcribe with Whisper
const whisperTask = translate ? 'translate' : 'transcribe';
process.stderr.write(`Transcribing (model: ${whisperModel}, task: ${whisperTask})...\n`);
run('whisper', [audioFile, '--model', whisperModel, '--task', whisperTask, '--output_format', 'json', '--output_dir', tmpDir]);

// 5. Read Whisper JSON output
const whisperJsonPath = path.join(tmpDir, 'audio.json');
if (!fs.existsSync(whisperJsonPath)) {
  process.stderr.write(`Whisper output not found at ${whisperJsonPath}\n`);
  process.exit(1);
}

const whisperData = JSON.parse(fs.readFileSync(whisperJsonPath, 'utf8'));
const transcript = (whisperData.text || '').trim();
const segments = (whisperData.segments || []).map(s => ({
  start: s.start,
  end: s.end,
  text: s.text.trim(),
}));
const durationSeconds = segments.length > 0 ? Math.round(segments[segments.length - 1].end) : 0;

// 6. Create Postey drafts if platforms specified
const drafts = [];
if (platforms.length > 0) {
  process.stderr.write(`Creating Postey drafts for: ${platforms.join(', ')}\n`);
  for (const platform of platforms) {
    // Upload media first, get CDN URL
    process.stderr.write(`Uploading media for ${platform}...\n`);
    const mediaResult = uploadPosteyMedia(platform, videoFile);
    const cdnUrl = mediaResult?.url ?? null;

    let draftArgs;
    if (platform === 'YOUTUBE') {
      const ytTitle = videoTitle || safeFilename.replace(/_/g, ' ');
      const ytDesc = truncate(transcript, PLATFORM_CHAR_LIMITS.YOUTUBE);
      draftArgs = ['--youtube-title', ytTitle, '--youtube-description', ytDesc, '--text', ytDesc];
    } else {
      const text = truncate(transcript, PLATFORM_CHAR_LIMITS[platform]);
      draftArgs = ['--text', text];
    }
    if (cdnUrl) draftArgs.push('--media-urls', cdnUrl);

    const draftResult = createPosteyDraft(accountId, platform, draftArgs);
    drafts.push({ platform, result: draftResult, cdn_url: cdnUrl, media: mediaResult });
  }
}

// 7. Output result JSON
const output = {
  url,
  video_title: videoTitle || null,
  transcript,
  segments,
  duration_seconds: durationSeconds,
  video_file: videoFile,
  audio_file: audioFile,
  tmp_dir: tmpDir,
};

if (drafts.length > 0) {
  output.drafts = drafts;
}

process.stdout.write(JSON.stringify(output, null, 2) + '\n');

// 8. Clean up auto-generated temp directory
if (autoTmpDir && !keepFiles) {
  cleanupTmpDir(tmpDir);
}
