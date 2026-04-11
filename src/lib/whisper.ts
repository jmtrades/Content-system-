// ============================================================================
// Faster-Whisper Wrapper — Audio Transcription & Caption Generation
// ============================================================================

import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import type { CaptionSegment } from '@/types';

const exec = promisify(execCb);

const EXEC_OPTIONS = { maxBuffer: 50 * 1024 * 1024, timeout: 600_000 };

// Default paths — can be overridden via env vars
const CAPTION_WORKER_PATH =
  process.env.CAPTION_WORKER_PATH ?? path.join(process.cwd(), 'scripts', 'caption_worker.py');
const WHISPER_MODEL = process.env.WHISPER_MODEL ?? 'medium';
const PYTHON_BIN = process.env.PYTHON_BIN ?? 'python3';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate SRT captions for a video file.
 *
 * Steps:
 *   1. Extract audio from the video as a 16 kHz mono WAV
 *   2. Run caption_worker.py (faster-whisper) to transcribe
 *   3. Return the path to the generated .srt file
 */
export async function generateCaptions(
  videoPath: string,
  options?: {
    model?: string;
    language?: string;
    outputDir?: string;
  },
): Promise<string> {
  // Verify input exists
  await fs.access(videoPath).catch(() => {
    throw new Error(`Video file not found: ${videoPath}`);
  });

  const outputDir = options?.outputDir ?? path.dirname(videoPath);
  const baseName = path.basename(videoPath, path.extname(videoPath));
  const audioPath = path.join(outputDir, `${baseName}_audio.wav`);
  const srtPath = path.join(outputDir, `${baseName}.srt`);

  // Step 1: Extract audio
  try {
    await exec(
      `ffmpeg -y -i "${videoPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${audioPath}"`,
      EXEC_OPTIONS,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to extract audio from ${videoPath}: ${msg}`);
  }

  // Step 2: Run caption_worker.py
  const model = options?.model ?? WHISPER_MODEL;
  const language = options?.language ?? 'en';

  try {
    // Check if the worker script exists
    await fs.access(CAPTION_WORKER_PATH).catch(() => {
      throw new Error(
        `Caption worker script not found at ${CAPTION_WORKER_PATH}. ` +
          'Set CAPTION_WORKER_PATH env var or place caption_worker.py in scripts/.',
      );
    });

    await exec(
      `${PYTHON_BIN} "${CAPTION_WORKER_PATH}" ` +
        `--audio "${audioPath}" ` +
        `--output "${srtPath}" ` +
        `--model ${model} ` +
        `--language ${language}`,
      EXEC_OPTIONS,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    // Provide helpful context for common failures
    if (msg.includes('ModuleNotFoundError') || msg.includes('No module named')) {
      throw new Error(
        `Whisper model dependency missing. Install with: pip install faster-whisper\n` +
          `Original error: ${msg}`,
      );
    }
    if (msg.includes('Could not load model') || msg.includes('model not found')) {
      throw new Error(
        `Whisper model "${model}" not available. ` +
          `Try: tiny, base, small, medium, or large-v3\n` +
          `Original error: ${msg}`,
      );
    }

    throw new Error(`Caption generation failed: ${msg}`);
  } finally {
    // Clean up the temporary audio file
    await fs.unlink(audioPath).catch(() => {});
  }

  // Verify the SRT was created
  await fs.access(srtPath).catch(() => {
    throw new Error(`SRT file was not generated at ${srtPath}`);
  });

  return srtPath;
}

/**
 * Parse an SRT file into an array of caption segments.
 */
export async function parseSRT(srtPath: string): Promise<CaptionSegment[]> {
  const content = await fs.readFile(srtPath, 'utf-8');
  return parseSRTContent(content);
}

/**
 * Parse raw SRT content string into caption segments.
 */
export function parseSRTContent(content: string): CaptionSegment[] {
  const segments: CaptionSegment[] = [];
  const blocks = content.trim().split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 3) continue;

    const index = parseInt(lines[0], 10);
    if (isNaN(index)) continue;

    const timeLine = lines[1];
    const timeMatch = timeLine.match(
      /(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/,
    );

    if (!timeMatch) continue;

    const startTime = timeMatch[1].replace(',', '.');
    const endTime = timeMatch[2].replace(',', '.');
    const text = lines.slice(2).join('\n').trim();

    segments.push({ index, startTime, endTime, text });
  }

  return segments;
}

/**
 * Convert SRT timestamp (HH:MM:SS.mmm) to total seconds.
 */
export function srtTimeToSeconds(time: string): number {
  const normalized = time.replace(',', '.');
  const match = normalized.match(/(\d{2}):(\d{2}):(\d{2})[.](\d{3})/);
  if (!match) return 0;

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  const millis = parseInt(match[4], 10);

  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

/**
 * Convert total seconds to an SRT-formatted timestamp (HH:MM:SS,mmm).
 */
export function secondsToSRTTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const millis = Math.round((totalSeconds % 1) * 1000);

  return (
    String(hours).padStart(2, '0') +
    ':' +
    String(minutes).padStart(2, '0') +
    ':' +
    String(seconds).padStart(2, '0') +
    ',' +
    String(millis).padStart(3, '0')
  );
}

/**
 * Build an SRT string from caption segments.
 */
export function buildSRT(segments: CaptionSegment[]): string {
  return segments
    .map(
      (seg) =>
        `${seg.index}\n${seg.startTime.replace('.', ',')} --> ${seg.endTime.replace('.', ',')}\n${seg.text}`,
    )
    .join('\n\n');
}

/**
 * Split captions into word-level segments for animated captions.
 * Takes existing segments and breaks them down so each segment is one word.
 */
export function wordLevelCaptions(segments: CaptionSegment[]): CaptionSegment[] {
  const result: CaptionSegment[] = [];
  let idx = 1;

  for (const seg of segments) {
    const words = seg.text.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    const start = srtTimeToSeconds(seg.startTime);
    const end = srtTimeToSeconds(seg.endTime);
    const duration = end - start;
    const wordDuration = duration / words.length;

    for (let i = 0; i < words.length; i++) {
      const wordStart = start + i * wordDuration;
      const wordEnd = start + (i + 1) * wordDuration;

      result.push({
        index: idx++,
        startTime: secondsToSRTTime(wordStart),
        endTime: secondsToSRTTime(wordEnd),
        text: words[i],
      });
    }
  }

  return result;
}

/**
 * Check whether faster-whisper is installed and reachable.
 */
export async function isWhisperAvailable(): Promise<boolean> {
  try {
    await exec(`${PYTHON_BIN} -c "import faster_whisper"`, { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}
