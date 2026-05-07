'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const MIME_TYPES = {
  '.mp4':  'video/mp4',
  '.mov':  'video/quicktime',
  '.avi':  'video/x-msvideo',
  '.webm': 'video/webm',
  '.mkv':  'video/x-matroska',
  '.3gp':  'video/3gpp',
  '.flv':  'video/x-flv',
  '.wmv':  'video/x-ms-wmv',
  '.m4v':  'video/mp4',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
};

// Per-platform media constraints (ported from MediaValidatorSingleton)
const PLATFORM_MEDIA_CONSTRAINTS = {
  X: {
    video: {
      maxSizeBytes: 512 * 1024 * 1024,
      maxDurationSeconds: 140,
      minDurationSeconds: 0.5,
      allowedMimeTypes: ['video/mp4', 'video/quicktime'],
      maxWidth: 1920, maxHeight: 1200,
      minWidth: 32,   minHeight: 32,
      maxFrameRate: 60,
    },
    image: {
      maxSizeBytes: 5 * 1024 * 1024,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    },
    gif: {
      maxSizeBytes: 15 * 1024 * 1024,
      allowedMimeTypes: ['image/gif'],
    },
  },
  INSTAGRAM: {
    video: {
      maxSizeBytes: 650 * 1024 * 1024,
      maxDurationSeconds: 90,
      minDurationSeconds: 3,
      allowedMimeTypes: ['video/mp4', 'video/quicktime'],
      maxWidth: 1920, maxHeight: 1920,
      minWidth: 320,  minHeight: 320,
      maxFrameRate: 60,
      minAspectRatio: 4 / 5,
      maxAspectRatio: 16 / 9,
    },
    image: {
      maxSizeBytes: 8 * 1024 * 1024,
      allowedMimeTypes: ['image/jpeg', 'image/png'],
      minAspectRatio: 4 / 5,
      maxAspectRatio: 1.91,
    },
  },
  TIKTOK: {
    video: {
      maxSizeBytes: 287 * 1024 * 1024,
      maxDurationSeconds: 600,
      minDurationSeconds: 3,
      allowedMimeTypes: ['video/mp4', 'video/webm', 'video/quicktime'],
      maxWidth: 4096, maxHeight: 4096,
      minWidth: 360,  minHeight: 360,
      maxFrameRate: 60,
    },
    image: {
      maxSizeBytes: 20 * 1024 * 1024,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    },
  },
  LINKEDIN: {
    video: {
      maxSizeBytes: 5 * 1024 * 1024 * 1024,
      maxDurationSeconds: 900,
      minDurationSeconds: 3,
      allowedMimeTypes: ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'],
      maxWidth: 4096, maxHeight: 2304,
      minWidth: 256,  minHeight: 144,
    },
    image: {
      maxSizeBytes: 100 * 1024 * 1024,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif'],
    },
  },
  YOUTUBE: {
    video: {
      maxSizeBytes: 128 * 1024 * 1024 * 1024,
      maxDurationSeconds: 43200,
      minDurationSeconds: 1,
      allowedMimeTypes: [
        'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm',
        'video/x-matroska', 'video/3gpp', 'video/x-flv', 'video/x-ms-wmv',
      ],
      maxWidth: 7680, maxHeight: 4320,
      minWidth: 240,  minHeight: 144,
    },
    image: {
      maxSizeBytes: 2 * 1024 * 1024,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif'],
    },
  },
  BLUESKY: {
    video: {
      maxSizeBytes: 50 * 1024 * 1024,
      maxDurationSeconds: 60,
      minDurationSeconds: 1,
      allowedMimeTypes: ['video/mp4', 'video/quicktime', 'video/webm'],
      maxWidth: 1920, maxHeight: 1920,
      minWidth: 240,  minHeight: 240,
      maxFrameRate: 60,
    },
    image: {
      maxSizeBytes: 1 * 1024 * 1024,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    },
  },
  THREADS: {
    video: {
      maxSizeBytes: 100 * 1024 * 1024,
      maxDurationSeconds: 90,
      minDurationSeconds: 1,
      allowedMimeTypes: ['video/mp4', 'video/quicktime'],
      maxWidth: 1920, maxHeight: 1920,
      minWidth: 320,  minHeight: 320,
    },
    image: {
      maxSizeBytes: 8 * 1024 * 1024,
      allowedMimeTypes: ['image/jpeg', 'image/png'],
    },
  },
};

function detectMediaCategory(mimeType) {
  if (mimeType === 'image/gif') return 'gif';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'unknown';
}

function getVideoInfo(filePath) {
  const result = spawnSync('ffprobe', [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_streams',
    '-show_format',
    filePath,
  ], { encoding: 'utf8' });

  if (result.status !== 0 || !result.stdout) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function validateMedia(filePath, platform, errorFn) {
  const constraints = PLATFORM_MEDIA_CONSTRAINTS[platform];
  if (!constraints) return;

  const stat = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
  const category = detectMediaCategory(mimeType);
  const limits = constraints[category] || constraints.video;
  if (!limits) return;

  const issues = [];

  if (limits.maxSizeBytes && stat.size > limits.maxSizeBytes) {
    const mb = (stat.size / 1024 / 1024).toFixed(1);
    const maxMb = (limits.maxSizeBytes / 1024 / 1024).toFixed(0);
    issues.push(`File too large: ${mb} MB (max ${maxMb} MB for ${platform} ${category})`);
  }

  if (limits.allowedMimeTypes && !limits.allowedMimeTypes.includes(mimeType)) {
    const allowed = limits.allowedMimeTypes.map(m => m.split('/')[1]).join(', ');
    issues.push(`Unsupported format ${ext} (${mimeType}) for ${platform} ${category}. Allowed: ${allowed}`);
  }

  if (issues.length > 0) {
    errorFn('Media validation failed', { platform, category, file: path.basename(filePath), issues });
    return;
  }

  if (category !== 'video') return;

  // ffprobe availability check
  const probeCheck = spawnSync('ffprobe', ['-version'], { encoding: 'utf8' });
  if (probeCheck.status !== 0) return;

  const info = getVideoInfo(filePath);
  if (!info) return;

  const videoStream = (info.streams || []).find(s => s.codec_type === 'video');
  const format = info.format || {};
  const durationSeconds = parseFloat(format.duration || 0);
  const videoIssues = [];

  if (limits.maxDurationSeconds && durationSeconds > limits.maxDurationSeconds)
    videoIssues.push(`Duration too long: ${durationSeconds.toFixed(1)}s (max ${limits.maxDurationSeconds}s)`);
  if (limits.minDurationSeconds && durationSeconds > 0 && durationSeconds < limits.minDurationSeconds)
    videoIssues.push(`Duration too short: ${durationSeconds.toFixed(1)}s (min ${limits.minDurationSeconds}s)`);

  if (videoStream) {
    const w = videoStream.width || 0;
    const h = videoStream.height || 0;

    if (limits.maxWidth  && w > limits.maxWidth)  videoIssues.push(`Width too large: ${w}px (max ${limits.maxWidth}px)`);
    if (limits.maxHeight && h > limits.maxHeight) videoIssues.push(`Height too large: ${h}px (max ${limits.maxHeight}px)`);
    if (limits.minWidth  && w > 0 && w < limits.minWidth)  videoIssues.push(`Width too small: ${w}px (min ${limits.minWidth}px)`);
    if (limits.minHeight && h > 0 && h < limits.minHeight) videoIssues.push(`Height too small: ${h}px (min ${limits.minHeight}px)`);

    if (w > 0 && h > 0) {
      const aspect = w / h;
      if (limits.minAspectRatio && aspect < limits.minAspectRatio)
        videoIssues.push(`Aspect ratio too narrow: ${aspect.toFixed(2)} (min ${limits.minAspectRatio.toFixed(2)})`);
      if (limits.maxAspectRatio && aspect > limits.maxAspectRatio)
        videoIssues.push(`Aspect ratio too wide: ${aspect.toFixed(2)} (max ${limits.maxAspectRatio.toFixed(2)})`);
    }

    if (limits.maxFrameRate) {
      const fpsStr = videoStream.r_frame_rate || videoStream.avg_frame_rate || '';
      const [num, den] = fpsStr.split('/').map(Number);
      const fps = den && den > 0 ? num / den : num || 0;
      if (fps > limits.maxFrameRate)
        videoIssues.push(`Frame rate too high: ${fps.toFixed(1)} fps (max ${limits.maxFrameRate} fps)`);
    }
  }

  if (videoIssues.length > 0) {
    errorFn('Media validation failed', { platform, category, file: path.basename(filePath), issues: videoIssues });
  }
}

module.exports = { validateMedia, MIME_TYPES, PLATFORM_MEDIA_CONSTRAINTS };
