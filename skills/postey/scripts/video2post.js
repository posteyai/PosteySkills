#!/usr/bin/env node
// video2post.js — transcribe a video (URL or local file), optionally create Postey drafts
// Requirements: ffmpeg on PATH; yt-dlp for URL inputs; whisper or mlx_whisper for transcription
//               ImageMagick (magick) optional — used for thumbnail text overlay
//
// Usage: node video2post.js <video-url-or-local-path> [options]
//
// Options:
//   --platform <platforms>   Target Postey platform(s), comma-separated
//                            (X, LINKEDIN, TIKTOK, INSTAGRAM, THREADS, BLUESKY, YOUTUBE)
//   --account-id <id>        Postey account_id — required when --platform is set
//   --output-dir, -o <path>  Save downloaded/temp files to this directory
//   --model <size>           Whisper model: tiny|base|small|medium|large (default: small)
//   --translate              Translate audio to English (regardless of source language)
//   --keep-files             Keep downloaded/transcribed files after completion
//   --thumbnail              Extract and optimize a cover thumbnail (9:16, ffmpeg + magick)
//   --thumb-text "<text>"    Text to overlay on the thumbnail (default: video title)
//   --thumb-time <seconds>   Frame timestamp to extract (default: scene-detect, fallback 3s)
//   --help, -h               Show this help
//
// Examples:
//   # Transcribe only (local file)
//   node video2post.js ~/Downloads/my-video.mp4
//
//   # Transcribe + thumbnail + multi-platform draft (local file)
//   node video2post.js ~/Downloads/my-video.mp4 \
//     --thumbnail --thumb-text "10x with Claude AI" \
//     --platform INSTAGRAM,X,LINKEDIN --account-id 317
//
//   # Transcribe only (URL)
//   node video2post.js https://www.instagram.com/reel/abc123/
//
//   # URL + cross-post
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

// Detect which whisper binary is available; prefer mlx_whisper on Apple Silicon
function detectWhisper() {
  if (which('mlx_whisper')) return 'mlx_whisper';
  if (which('whisper'))     return 'whisper';
  return null;
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
    darwin: 'pip install mlx-whisper   (Apple Silicon) or: pip install openai-whisper',
    win32:  'pip install openai-whisper',
    linux:  'pip install openai-whisper',
  },
};

function hint(cmd) {
  const p = process.platform;
  return (INSTALL_HINTS[cmd] || {})[p] || `install ${cmd}`;
}

function checkDeps(isLocalFile) {
  const required = ['ffmpeg'];
  if (!isLocalFile) required.push('yt-dlp');
  if (!detectWhisper()) required.push('whisper');

  const missing = required.filter(c => c === 'whisper' ? false : !which(c));
  // whisper absence was already checked above
  const allMissing = missing.concat(detectWhisper() ? [] : ['whisper']);

  if (allMissing.length === 0) return;
  process.stderr.write('Missing required tools:\n');
  allMissing.forEach(c => process.stderr.write(`  ${c}  →  ${hint(c)}\n`));
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

// Detect ImageMagick v7 binary (prefers `magick`, falls back to `convert`)
function imageMagickBin() {
  if (which('magick')) return 'magick';
  if (which('convert')) return 'convert';
  return null;
}

/**
 * Extract a frame from videoFile, resize to 1080×1920 (9:16), optionally add text.
 * Returns the path to the final thumbnail JPEG, or null on failure.
 */
function buildThumbnail(videoFile, { thumbText, thumbTime, outDir }) {
  const rawThumb  = path.join(outDir, 'thumb_raw.jpg');
  const resized   = path.join(outDir, 'thumb_resized.jpg');
  const final     = path.join(outDir, 'thumb_final.jpg');

  // Step 1 — best-frame via scene detection; fallback to thumbTime (default 3 s)
  let extracted = false;
  if (!thumbTime) {
    const r = spawnSync('ffmpeg', [
      '-i', videoFile,
      '-vf', 'select=gt(scene\\,0.35)', '-vsync', 'vfr',
      '-frames:v', '1', rawThumb, '-y',
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    extracted = r.status === 0 && fs.existsSync(rawThumb) && fs.statSync(rawThumb).size > 0;
  }
  if (!extracted) {
    const t = thumbTime != null ? thumbTime : 3;
    const r = spawnSync('ffmpeg', ['-ss', String(t), '-i', videoFile, '-vframes', '1', rawThumb, '-y'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (r.status !== 0 || !fs.existsSync(rawThumb)) {
      process.stderr.write('Warning: thumbnail frame extraction failed — skipping thumbnail\n');
      return null;
    }
  }

  // Step 2 — resize to 1080×1920 with black letterbox padding
  const resizeResult = spawnSync('ffmpeg', [
    '-i', rawThumb,
    '-vf',
    'scale=1080:1920:force_original_aspect_ratio=decrease,' +
    'pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black',
    resized, '-y',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

  if (resizeResult.status !== 0 || !fs.existsSync(resized)) {
    process.stderr.write('Warning: thumbnail resize failed — skipping thumbnail\n');
    return null;
  }

  // Step 3 — text overlay via ImageMagick (optional)
  const imBin = imageMagickBin();
  if (thumbText && imBin) {
    // Prefer a font file path; fall back to font name if no file found
    const FONT_CANDIDATES = [
      '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
      '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
      '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
    ];
    const fontArg = FONT_CANDIDATES.find(f => fs.existsSync(f)) || 'Arial-Bold';

    const baseArgs = [
      '-font', fontArg,
      '-pointsize', '64',
      '-fill', 'white',
      '-stroke', 'black', '-strokewidth', '2',
      '-gravity', 'South', '-annotate', '+0+120', thumbText,
    ];
    const imArgs = imBin === 'magick'
      ? ['convert', resized, ...baseArgs, final]
      : [resized, ...baseArgs, final];

    const imResult = spawnSync(imBin, imArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (imResult.status === 0 && fs.existsSync(final) && fs.statSync(final).size > 0) {
      return final;
    }
    process.stderr.write(`Warning: ImageMagick text overlay failed — using resized frame without text\n`);
    if (imResult.stderr) process.stderr.write(imResult.stderr + '\n');
  }

  return resized;
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
    'Usage: node video2post.js <video-url-or-local-path> [options]',
    '',
    'Options:',
    '  --platform <platforms>   Target Postey platform(s), comma-separated',
    '                           (X, LINKEDIN, TIKTOK, INSTAGRAM, THREADS, BLUESKY, YOUTUBE)',
    '  --account-id <id>        Postey account_id — required when --platform is set',
    '  --output-dir, -o <path>  Save downloaded/temp files to this directory',
    '  --model <size>           Whisper model: tiny|base|small|medium|large (default: small)',
    '  --translate              Translate audio to English (regardless of source language)',
    '  --keep-files             Keep downloaded/transcribed files after completion',
    '  --thumbnail              Extract and optimize a cover thumbnail (9:16)',
    '  --thumb-text "<text>"    Text overlay on thumbnail (default: video title)',
    '  --thumb-time <seconds>   Frame timestamp (default: scene-detect, fallback 3s)',
    '  --help, -h               Show this help',
    '',
    'Examples:',
    '  # Transcribe only (local file)',
    '  node video2post.js ~/Downloads/my-video.mp4',
    '',
    '  # Local file + thumbnail + multi-platform draft',
    '  node video2post.js ~/Downloads/my-video.mp4 \\',
    '    --thumbnail --thumb-text "10x with Claude AI" \\',
    '    --platform INSTAGRAM,X,LINKEDIN --account-id 317',
    '',
    '  # Transcribe only (URL)',
    '  node video2post.js https://www.instagram.com/reel/abc123/',
    '',
    '  # URL + cross-post',
    '  node video2post.js https://tiktok.com/@user/video/123 --platform INSTAGRAM,TIKTOK --account-id 215',
    '',
  ].join('\n'));
  process.exit(0);
}

const input = args[0];
let outputDir = null;
let whisperModel = 'small';
let platformsRaw = null;
let accountId = null;
let translate = false;
let keepFiles = false;
let buildThumb = false;
let thumbText = null;
let thumbTime = null;

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
  } else if (args[i] === '--thumbnail') {
    buildThumb = true;
  } else if (args[i] === '--thumb-text' && args[i + 1]) {
    thumbText = args[++i];
  } else if (args[i] === '--thumb-time' && args[i + 1]) {
    thumbTime = parseFloat(args[++i]);
  }
}

// Determine if input is a local file path or a URL
const isLocalFile = !input.startsWith('http://') && !input.startsWith('https://');

// Resolve ~ in local paths
function resolveInputPath(p) {
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return path.resolve(p);
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

checkDeps(isLocalFile);

const autoTmpDir = !outputDir;
const tmpDir = outputDir || path.join(os.tmpdir(), `v2p_${crypto.randomBytes(4).toString('hex')}`);
fs.mkdirSync(tmpDir, { recursive: true });

let videoFile;
let videoTitle;

if (isLocalFile) {
  // Local file — skip download
  videoFile = resolveInputPath(input);
  if (!fs.existsSync(videoFile)) {
    process.stderr.write(`Local file not found: ${videoFile}\n`);
    process.exit(1);
  }
  videoTitle = path.basename(videoFile, path.extname(videoFile));
  process.stderr.write(`Using local file: ${videoFile}\n`);
} else {
  // URL — fetch title then download
  process.stderr.write(`Fetching metadata: ${input}\n`);
  videoTitle = fetchVideoTitle(input);
  const safeFilename = sanitizeFilename(videoTitle);

  process.stderr.write(`Downloading: ${input}\n`);
  run('yt-dlp', [
    '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
    '--merge-output-format', 'mp4',
    '-o', path.join(tmpDir, safeFilename + '.%(ext)s'),
    input,
  ]);
  videoFile = findVideoFile(tmpDir);
}

// Build thumbnail if requested
let thumbnailFile = null;
if (buildThumb) {
  process.stderr.write('Building thumbnail...\n');
  const resolvedThumbText = thumbText || videoTitle || null;
  thumbnailFile = buildThumbnail(videoFile, {
    thumbText: resolvedThumbText,
    thumbTime,
    outDir: tmpDir,
  });
  if (thumbnailFile) {
    process.stderr.write(`Thumbnail: ${thumbnailFile}\n`);
  }
}

// Extract 16 kHz mono WAV for Whisper
const audioFile = path.join(tmpDir, 'audio.wav');
process.stderr.write('Extracting audio...\n');
run('ffmpeg', ['-i', videoFile, '-ar', '16000', '-ac', '1', audioFile, '-y']);

// Transcribe with the available Whisper binary
const whisperBin = detectWhisper();
const whisperTask = translate ? 'translate' : 'transcribe';
process.stderr.write(`Transcribing with ${whisperBin} (model: ${whisperModel}, task: ${whisperTask})...\n`);

if (whisperBin === 'mlx_whisper') {
  // mlx_whisper outputs a JSON file next to the audio file
  run('mlx_whisper', [audioFile, '--model', `mlx-community/whisper-${whisperModel}-mlx`, '--output-format', 'json', '--output-dir', tmpDir]);
} else {
  run('whisper', [audioFile, '--model', whisperModel, '--task', whisperTask, '--output_format', 'json', '--output_dir', tmpDir]);
}

// Read Whisper JSON output
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

// Create Postey drafts if platforms specified
const drafts = [];
if (platforms.length > 0) {
  process.stderr.write(`Creating Postey drafts for: ${platforms.join(', ')}\n`);
  for (const platform of platforms) {
    // Upload video media first, get CDN URL
    process.stderr.write(`Uploading video for ${platform}...\n`);
    const mediaResult = uploadPosteyMedia(platform, videoFile);
    const videoCdnUrl = mediaResult?.url ?? null;

    let draftArgs;
    if (platform === 'YOUTUBE') {
      const ytTitle = videoTitle || 'Video';
      const ytDesc = truncate(transcript, PLATFORM_CHAR_LIMITS.YOUTUBE);
      draftArgs = ['--youtube-title', ytTitle, '--youtube-description', ytDesc, '--text', ytDesc];
    } else {
      const text = truncate(transcript, PLATFORM_CHAR_LIMITS[platform]);
      draftArgs = ['--text', text];
    }

    // Collect media URLs (video + thumbnail for Instagram)
    const mediaUrls = [];
    if (videoCdnUrl) mediaUrls.push(videoCdnUrl);

    if (platform === 'INSTAGRAM' && thumbnailFile) {
      process.stderr.write('Uploading thumbnail for INSTAGRAM...\n');
      const thumbResult = uploadPosteyMedia('INSTAGRAM', thumbnailFile);
      if (thumbResult?.url) mediaUrls.push(thumbResult.url);
    }

    if (mediaUrls.length > 0) draftArgs.push('--media-urls', mediaUrls.join(','));

    const draftResult = createPosteyDraft(accountId, platform, draftArgs);
    drafts.push({ platform, result: draftResult, cdn_url: videoCdnUrl, media: mediaResult });
  }
}

// Output result JSON
const output = {
  input,
  video_title: videoTitle || null,
  transcript,
  segments,
  duration_seconds: durationSeconds,
  video_file: videoFile,
  audio_file: audioFile,
  thumbnail_file: thumbnailFile || null,
  tmp_dir: tmpDir,
};

if (drafts.length > 0) {
  output.drafts = drafts;
}

process.stdout.write(JSON.stringify(output, null, 2) + '\n');

// Clean up auto-generated temp directory
if (autoTmpDir && !keepFiles) {
  cleanupTmpDir(tmpDir);
}
