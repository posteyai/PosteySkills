"use strict";

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

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

// Platforms that can receive a video file attachment
const _VIDEO_CAPABLE_PLATFORMS = new Set(["INSTAGRAM", "TIKTOK", "YOUTUBE"]);

// Per-platform caption character limits
const _VIDEO_CHAR_LIMITS = {
  X: 280, LINKEDIN: 3000, TIKTOK: 2200, INSTAGRAM: 2200,
  THREADS: 500, BLUESKY: 300, YOUTUBE: 5000,
};

function _which(cmd) {
  return spawnSync(
    process.platform === "win32" ? "where" : "which",
    [cmd],
    { encoding: "utf8" },
  ).status === 0;
}

function _detectWhisper() {
  return _which("mlx_whisper") ? "mlx_whisper" : _which("whisper") ? "whisper" : null;
}

function _gcd(a, b) { return b === 0 ? a : _gcd(b, a % b); }

function _vTruncate(text, lim) {
  if (!text) return "";
  return text.length <= lim ? text : text.slice(0, lim - 3) + "...";
}

function _sanitizeFname(t) {
  return (t || "").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_").slice(0, 80) || "video";
}

function _findVideoFile(dir) {
  const exts = [".mp4", ".mkv", ".webm", ".mov", ".avi", ".m4v"];
  const files = fs.readdirSync(dir).filter((f) => exts.includes(path.extname(f).toLowerCase()));
  if (!files.length) {
    console.log(JSON.stringify({ error: `No video file found in ${dir}` }, null, 2));
    process.exit(1);
  }
  return path.join(dir, files[0]);
}

function _vRun(cmd, args) {
  const r = spawnSync(cmd, args, { env: mediaEnv(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (r.error) {
    console.log(JSON.stringify({ error: `Failed to run '${cmd}': ${r.error.message}` }, null, 2));
    process.exit(1);
  }
  if (r.status !== 0) {
    console.log(JSON.stringify({ error: `'${cmd}' exited with code ${r.status}`, stderr: redactUrls(r.stderr)?.slice(0, 500) }, null, 2));
    process.exit(r.status || 1);
  }
  return r;
}

function _buildThumbnail(videoFile, { thumbText, thumbTime, outDir }) {
  const rawThumb = path.join(outDir, "thumb_raw.jpg");
  const resized  = path.join(outDir, "thumb_resized.jpg");
  const final    = path.join(outDir, "thumb_final.jpg");

  let extracted = false;
  if (!thumbTime) {
    const r = spawnSync("ffmpeg", ["-i", videoFile, "-vf", "select=gt(scene\\,0.35)", "-vsync", "vfr", "-frames:v", "1", rawThumb, "-y"], { env: mediaEnv(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    extracted = r.status === 0 && fs.existsSync(rawThumb) && fs.statSync(rawThumb).size > 0;
  }
  if (!extracted) {
    const t = thumbTime != null ? thumbTime : 3;
    const r = spawnSync("ffmpeg", ["-ss", String(t), "-i", videoFile, "-vframes", "1", rawThumb, "-y"], { env: mediaEnv(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    if (r.status !== 0 || !fs.existsSync(rawThumb)) {
      process.stderr.write("Warning: thumbnail frame extraction failed\n");
      return null;
    }
  }

  const rr = spawnSync("ffmpeg", ["-i", rawThumb, "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black", resized, "-y"], { env: mediaEnv(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (rr.status !== 0 || !fs.existsSync(resized)) {
    process.stderr.write("Warning: thumbnail resize failed\n");
    return null;
  }

  const imBin = _which("magick") ? "magick" : _which("convert") ? "convert" : null;
  if (thumbText && imBin) {
    const FONTS = ["/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"];
    const fontArg = FONTS.find((f) => fs.existsSync(f)) || "Arial-Bold";
    const baseArgs = ["-font", fontArg, "-pointsize", "64", "-fill", "white", "-stroke", "black", "-strokewidth", "2", "-gravity", "South", "-annotate", "+0+120", thumbText];
    const imArgs = imBin === "magick" ? ["convert", resized, ...baseArgs, final] : [resized, ...baseArgs, final];
    const ir = spawnSync(imBin, imArgs, { env: mediaEnv(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    if (ir.status === 0 && fs.existsSync(final) && fs.statSync(final).size > 0) return final;
    process.stderr.write("Warning: ImageMagick text overlay failed — using resized frame\n");
  }
  return resized;
}

module.exports = {
  _VIDEO_CAPABLE_PLATFORMS,
  _VIDEO_CHAR_LIMITS,
  _which,
  _detectWhisper,
  _gcd,
  _vTruncate,
  _sanitizeFname,
  _findVideoFile,
  _vRun,
  _buildThumbnail,
};
