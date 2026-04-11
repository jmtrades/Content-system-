// ============================================================================
// FFmpeg Wrapper — Video Processing Utilities
// ============================================================================

import { exec as execCb, spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import type { TextOverlay, CaptionStyle, VideoInfo, AspectRatio } from '@/types';

const exec = promisify(execCb);

// Max buffer for exec — some ffprobe outputs can be large
const EXEC_OPTIONS = { maxBuffer: 50 * 1024 * 1024 };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Escape a file path for use inside an ffmpeg filter expression. */
function escapeFilterPath(p: string): string {
  return p
    .replace(/\\/g, '/')
    .replace(/'/g, "'\\''")
    .replace(/:/g, '\\:');
}

/** Shell-escape a file path for command-line arguments. */
function shellEscape(p: string): string {
  return `"${p.replace(/"/g, '\\"')}"`;
}

/** Run ffmpeg and return stdout/stderr. Rejects on non-zero exit. */
async function runFFmpeg(args: string): Promise<string> {
  const cmd = `ffmpeg -y ${args}`;
  try {
    const { stdout, stderr } = await exec(cmd, EXEC_OPTIONS);
    return stdout || stderr;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`FFmpeg failed: ${message}`);
  }
}

/** Run ffprobe and return stdout. */
async function runFFprobe(args: string): Promise<string> {
  const cmd = `ffprobe ${args}`;
  try {
    const { stdout } = await exec(cmd, EXEC_OPTIONS);
    return stdout;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`FFprobe failed: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Crop a video to the specified aspect ratio (center-crop).
 */
export async function cropToAspectRatio(
  input: string,
  output: string,
  ratio: AspectRatio,
): Promise<void> {
  const ratioMap: Record<string, string> = {
    '9:16': 'ih*9/16:ih',
    '16:9': 'iw:iw*9/16',
    '1:1': 'min(iw\\,ih):min(iw\\,ih)',
    '4:5': 'ih*4/5:ih',
  };

  const cropExpr = ratioMap[ratio];
  if (!cropExpr) {
    throw new Error(`Unsupported aspect ratio: ${ratio}`);
  }

  await runFFmpeg(
    `-i ${shellEscape(input)} -vf "crop=${cropExpr}" -c:a copy ${shellEscape(output)}`,
  );
}

/**
 * Add text overlays on top of a video using the drawtext filter.
 */
export async function addTextOverlay(
  input: string,
  output: string,
  texts: TextOverlay[],
): Promise<void> {
  if (texts.length === 0) {
    throw new Error('At least one text overlay is required');
  }

  const filters = texts.map((t) => {
    const fontColor = t.color || 'white';
    const fontSize = t.size || 48;
    const x = 'x=(w-text_w)/2';
    const y = `y=${t.y}`;
    const escapedText = t.text
      .replace(/'/g, "'\\''")
      .replace(/:/g, '\\:')
      .replace(/\\/g, '\\\\');

    let enable = '';
    if (t.startTime !== undefined && t.endTime !== undefined) {
      enable = `:enable='between(t,${t.startTime},${t.endTime})'`;
    }

    const fontFile = t.fontFamily
      ? `:fontfile='${escapeFilterPath(t.fontFamily)}'`
      : '';

    return `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=${fontColor}:${x}:${y}${fontFile}${enable}:borderw=2:bordercolor=black@0.6`;
  });

  const filterChain = filters.join(',');

  await runFFmpeg(
    `-i ${shellEscape(input)} -vf "${filterChain}" -c:a copy ${shellEscape(output)}`,
  );
}

/**
 * Burn SRT captions into a video using the subtitles filter.
 */
export async function addCaptions(
  input: string,
  srtPath: string,
  output: string,
  style?: CaptionStyle,
): Promise<void> {
  // Verify the SRT file exists
  await fs.access(srtPath);

  const escapedSrt = escapeFilterPath(srtPath);

  // Build ASS-style force_style string
  const parts: string[] = [];
  if (style?.fontFamily) parts.push(`FontName=${style.fontFamily}`);
  if (style?.fontSize) parts.push(`FontSize=${style.fontSize}`);
  if (style?.primaryColor) parts.push(`PrimaryColour=${style.primaryColor}`);
  if (style?.outlineColor) parts.push(`OutlineColour=${style.outlineColor}`);
  if (style?.outlineWidth !== undefined) parts.push(`Outline=${style.outlineWidth}`);
  if (style?.backgroundColor) parts.push(`BackColour=${style.backgroundColor}`);
  if (style?.bold) parts.push('Bold=1');
  if (style?.alignment !== undefined) parts.push(`Alignment=${style.alignment}`);
  if (style?.marginV !== undefined) parts.push(`MarginV=${style.marginV}`);

  const forceStyle = parts.length > 0 ? `:force_style='${parts.join(',')}'` : '';

  await runFFmpeg(
    `-i ${shellEscape(input)} -vf "subtitles='${escapedSrt}'${forceStyle}" -c:a copy ${shellEscape(output)}`,
  );
}

/**
 * Trim a video to a specific segment.
 *
 * @param start  Start time in seconds or HH:MM:SS format
 * @param duration  Duration in seconds
 */
export async function trimVideo(
  input: string,
  output: string,
  start: number | string,
  duration: number,
): Promise<void> {
  const startStr = typeof start === 'number' ? start.toString() : start;

  await runFFmpeg(
    `-ss ${startStr} -i ${shellEscape(input)} -t ${duration} -c copy ${shellEscape(output)}`,
  );
}

/**
 * Concatenate intro + main + outro into a single video.
 * All inputs should have the same codec, resolution, and frame rate.
 */
export async function addBumper(
  intro: string,
  main: string,
  outro: string,
  output: string,
): Promise<void> {
  // Create a temporary concat list file
  const listDir = path.dirname(output);
  const listPath = path.join(listDir, `concat_${Date.now()}.txt`);

  const segments = [intro, main, outro].filter(Boolean);
  const listContent = segments.map((s) => `file '${s.replace(/'/g, "'\\''")}'`).join('\n');

  try {
    await fs.writeFile(listPath, listContent, 'utf-8');

    await runFFmpeg(
      `-f concat -safe 0 -i ${shellEscape(listPath)} -c copy ${shellEscape(output)}`,
    );
  } finally {
    // Clean up temporary list file
    await fs.unlink(listPath).catch(() => {});
  }
}

/**
 * Adjust playback speed of a video.
 *
 * @param speed  Multiplier (e.g. 1.5 = 1.5x faster, 0.5 = half speed)
 */
export async function adjustSpeed(
  input: string,
  output: string,
  speed: number,
): Promise<void> {
  if (speed <= 0) {
    throw new Error('Speed multiplier must be positive');
  }

  // Video: setpts=PTS/speed (inverse because setpts expects a divisor)
  // Audio: atempo only supports 0.5–2.0 so we chain multiple filters if needed
  const videoPts = (1 / speed).toFixed(6);

  const atempoFilters: string[] = [];
  let remaining = speed;

  // atempo filter only accepts values between 0.5 and 2.0
  while (remaining > 2.0) {
    atempoFilters.push('atempo=2.0');
    remaining /= 2.0;
  }
  while (remaining < 0.5) {
    atempoFilters.push('atempo=0.5');
    remaining /= 0.5;
  }
  atempoFilters.push(`atempo=${remaining.toFixed(6)}`);

  const audioFilter = atempoFilters.join(',');

  await runFFmpeg(
    `-i ${shellEscape(input)} -filter_complex "[0:v]setpts=${videoPts}*PTS[v];[0:a]${audioFilter}[a]" -map "[v]" -map "[a]" ${shellEscape(output)}`,
  );
}

/**
 * Mix a background music track into a video at a given volume.
 *
 * @param musicVolume  Volume of the music track (0.0–1.0, default 0.15)
 */
export async function addMusic(
  video: string,
  music: string,
  output: string,
  musicVolume: number = 0.15,
): Promise<void> {
  const vol = Math.max(0, Math.min(1, musicVolume));

  await runFFmpeg(
    `-i ${shellEscape(video)} -i ${shellEscape(music)} ` +
      `-filter_complex "[1:a]volume=${vol.toFixed(2)}[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=2[a]" ` +
      `-map 0:v -map "[a]" -c:v copy -shortest ${shellEscape(output)}`,
  );
}

/**
 * Extract a single frame as a thumbnail image.
 *
 * @param timestamp  Time in seconds or HH:MM:SS format
 */
export async function generateThumbnail(
  input: string,
  output: string,
  timestamp: number | string = 1,
): Promise<void> {
  const ts = typeof timestamp === 'number' ? timestamp.toString() : timestamp;

  await runFFmpeg(
    `-ss ${ts} -i ${shellEscape(input)} -frames:v 1 -q:v 2 ${shellEscape(output)}`,
  );
}

/**
 * Get detailed information about a video file using ffprobe.
 */
export async function getVideoInfo(input: string): Promise<VideoInfo> {
  const raw = await runFFprobe(
    `-v quiet -print_format json -show_format -show_streams ${shellEscape(input)}`,
  );

  const probe = JSON.parse(raw) as {
    format?: {
      duration?: string;
      bit_rate?: string;
      size?: string;
    };
    streams?: Array<{
      codec_type?: string;
      codec_name?: string;
      width?: number;
      height?: number;
      r_frame_rate?: string;
      sample_rate?: string;
    }>;
  };

  const videoStream = probe.streams?.find((s) => s.codec_type === 'video');
  const audioStream = probe.streams?.find((s) => s.codec_type === 'audio');

  if (!videoStream) {
    throw new Error(`No video stream found in ${input}`);
  }

  // Parse frame rate from "30/1" or "30000/1001" format
  let fps = 30;
  if (videoStream.r_frame_rate) {
    const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
    if (num && den) fps = Math.round((num / den) * 100) / 100;
  }

  return {
    duration: parseFloat(probe.format?.duration ?? '0'),
    width: videoStream.width ?? 0,
    height: videoStream.height ?? 0,
    codec: videoStream.codec_name ?? 'unknown',
    fps,
    bitrate: parseInt(probe.format?.bit_rate ?? '0', 10),
    audioCodec: audioStream?.codec_name,
    audioSampleRate: audioStream?.sample_rate ? parseInt(audioStream.sample_rate, 10) : undefined,
    fileSize: parseInt(probe.format?.size ?? '0', 10),
  };
}

/**
 * Extract audio from a video file as WAV (used before whisper transcription).
 */
export async function extractAudio(
  input: string,
  output: string,
  sampleRate: number = 16000,
): Promise<void> {
  await runFFmpeg(
    `-i ${shellEscape(input)} -vn -acodec pcm_s16le -ar ${sampleRate} -ac 1 ${shellEscape(output)}`,
  );
}

/**
 * Scale video to a specific resolution.
 */
export async function scaleVideo(
  input: string,
  output: string,
  width: number,
  height: number,
): Promise<void> {
  await runFFmpeg(
    `-i ${shellEscape(input)} -vf "scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2" -c:a copy ${shellEscape(output)}`,
  );
}

/**
 * Run an arbitrary ffmpeg command via spawn, streaming progress to a callback.
 * Returns a promise that resolves when the process completes.
 */
export function runWithProgress(
  args: string[],
  onProgress?: (line: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', ['-y', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });

    proc.stderr?.on('data', (data: Buffer) => {
      const line = data.toString();
      if (onProgress) onProgress(line);
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
    });
  });
}
