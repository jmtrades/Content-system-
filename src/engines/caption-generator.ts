// ============================================================================
// Caption Generator Engine
// Generates captions via Whisper, applies style presets, and prepares
// SRT files for FFmpeg burn-in across different visual styles.
// ============================================================================

import { generateCaptions as whisperGenerate, parseSRT } from '@/lib/whisper';
import * as path from 'path';
import * as fs from 'fs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CaptionStyleConfig {
  fontFamily: string;
  fontSize: number;
  primaryColor: string;
  outlineColor: string;
  outlineWidth: number;
  backgroundColor: string;
  bold: boolean;
  alignment: number;
  marginV: number;
}

interface CaptionSegment {
  index: number;
  startTime: string;
  endTime: string;
  text: string;
}

interface CaptionResult {
  srtPath: string;
  segments: CaptionSegment[];
  segmentCount: number;
  style: string;
  generatedAt: string;
}

interface BurnInConfig {
  srtPath: string;
  style: CaptionStyleConfig;
  forceStyleString: string;
}

// ---------------------------------------------------------------------------
// Caption style presets
// ---------------------------------------------------------------------------

const captionStyles: Record<string, CaptionStyleConfig> = {
  bold: {
    fontFamily: 'Arial',
    fontSize: 28,
    primaryColor: '&H00FFFFFF',   // White (ASS BGR format)
    outlineColor: '&H00000000',   // Black outline
    outlineWidth: 3,
    backgroundColor: '&H80000000', // Semi-transparent black
    bold: true,
    alignment: 2,                  // Bottom center
    marginV: 50,
  },
  minimal: {
    fontFamily: 'Helvetica',
    fontSize: 22,
    primaryColor: '&H00FFFFFF',
    outlineColor: '&H00333333',
    outlineWidth: 1,
    backgroundColor: '&H00000000', // Transparent
    bold: false,
    alignment: 2,
    marginV: 40,
  },
  highlight: {
    fontFamily: 'Arial',
    fontSize: 32,
    primaryColor: '&H0000FFFF',   // Yellow (ASS BGR)
    outlineColor: '&H00000000',
    outlineWidth: 4,
    backgroundColor: '&HCC000000', // Dark background
    bold: true,
    alignment: 5,                  // Top center
    marginV: 60,
  },
  karaoke: {
    fontFamily: 'Arial',
    fontSize: 30,
    primaryColor: '&H00FFFFFF',
    outlineColor: '&H000000FF',   // Red outline
    outlineWidth: 2,
    backgroundColor: '&H80000000',
    bold: true,
    alignment: 2,
    marginV: 55,
  },
  subtitle: {
    fontFamily: 'Georgia',
    fontSize: 24,
    primaryColor: '&H00FFFFFF',
    outlineColor: '&H00222222',
    outlineWidth: 2,
    backgroundColor: '&HA0000000',
    bold: false,
    alignment: 2,
    marginV: 30,
  },
};

const LOG_PREFIX = '[caption-generator]';

// ---------------------------------------------------------------------------
// Main caption generation
// ---------------------------------------------------------------------------

/**
 * Generate captions for a video file using Whisper speech-to-text.
 * Produces an SRT file, parses it, and optionally stores metadata in the database.
 *
 * @param videoPath - Absolute or relative path to the video file
 * @param style - Caption style preset name (default: 'bold')
 * @param language - Language code for transcription (default: 'en')
 * @returns CaptionResult with the SRT path, parsed segments, and metadata
 */
export async function generateCaptions(
  videoPath: string,
  style: string = 'bold',
  language: string = 'en',
): Promise<CaptionResult> {
  console.log(`${LOG_PREFIX} Generating captions — video="${videoPath}" style="${style}" lang="${language}"`);

  // Resolve the video path
  const absoluteVideoPath = path.isAbsolute(videoPath)
    ? videoPath
    : path.join(process.cwd(), videoPath);

  // Verify the video file exists
  if (!fs.existsSync(absoluteVideoPath)) {
    throw new Error(`Video file not found: ${absoluteVideoPath}`);
  }

  // Determine output directory
  const outputDir = path.dirname(absoluteVideoPath);
  const baseName = path.basename(absoluteVideoPath, path.extname(absoluteVideoPath));
  const srtFileName = `${baseName}_captions.srt`;
  const srtPath = path.join(outputDir, srtFileName);

  // Generate captions via Whisper
  let generatedSrtPath: string;
  try {
    generatedSrtPath = await whisperGenerate(absoluteVideoPath, {
      language,
      outputDir,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${LOG_PREFIX} Whisper generation failed: ${message}`);
    throw new Error(`Caption generation failed: ${message}`);
  }

  // If Whisper output path differs from our expected path, rename
  if (generatedSrtPath !== srtPath && fs.existsSync(generatedSrtPath)) {
    try {
      fs.copyFileSync(generatedSrtPath, srtPath);
      // Clean up the original if it differs
      if (generatedSrtPath !== srtPath) {
        fs.unlinkSync(generatedSrtPath);
      }
    } catch {
      // If rename fails, use the generated path
      console.warn(`${LOG_PREFIX} Could not move SRT to expected path, using generated path`);
    }
  }

  const finalSrtPath = fs.existsSync(srtPath) ? srtPath : generatedSrtPath;

  // Parse the SRT file
  let segments: CaptionSegment[];
  try {
    segments = await parseSRT(finalSrtPath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${LOG_PREFIX} SRT parsing failed: ${message}`);
    throw new Error(`Failed to parse generated SRT file: ${message}`);
  }

  const result: CaptionResult = {
    srtPath: finalSrtPath,
    segments,
    segmentCount: segments.length,
    style,
    generatedAt: new Date().toISOString(),
  };

  console.log(`${LOG_PREFIX} Captions generated — ${segments.length} segments, saved to "${finalSrtPath}"`);
  return result;
}

// ---------------------------------------------------------------------------
// Style configuration
// ---------------------------------------------------------------------------

/**
 * Get the caption style configuration for a given preset name.
 * Falls back to 'bold' if the style name is not recognized.
 */
export function getStyleConfig(style: string): CaptionStyleConfig {
  const config = captionStyles[style];
  if (!config) {
    console.warn(`${LOG_PREFIX} Unknown caption style "${style}", falling back to "bold"`);
    return captionStyles.bold;
  }
  return { ...config };
}

/**
 * List all available caption style names.
 */
export function getAvailableStyles(): string[] {
  return Object.keys(captionStyles);
}

// ---------------------------------------------------------------------------
// FFmpeg burn-in preparation
// ---------------------------------------------------------------------------

/**
 * Prepare a caption SRT file and style configuration for FFmpeg subtitle burn-in.
 * Returns the SRT path and an ASS-compatible force_style string that can be
 * passed directly to the FFmpeg `subtitles` filter.
 *
 * @param srtPath - Path to the SRT caption file
 * @param style - Caption style preset name (default: 'bold')
 * @returns BurnInConfig with the SRT path and force_style string
 */
export function formatForBurnIn(
  srtPath: string,
  style: string = 'bold',
): BurnInConfig {
  console.log(`${LOG_PREFIX} Preparing burn-in config — srt="${srtPath}" style="${style}"`);

  // Resolve SRT path
  const absoluteSrtPath = path.isAbsolute(srtPath)
    ? srtPath
    : path.join(process.cwd(), srtPath);

  // Verify the SRT file exists
  if (!fs.existsSync(absoluteSrtPath)) {
    throw new Error(`SRT file not found: ${absoluteSrtPath}`);
  }

  const config = getStyleConfig(style);

  // Build the ASS force_style string for FFmpeg's subtitles filter
  const styleParts: string[] = [];

  if (config.fontFamily) {
    styleParts.push(`FontName=${config.fontFamily}`);
  }
  if (config.fontSize) {
    styleParts.push(`FontSize=${config.fontSize}`);
  }
  if (config.primaryColor) {
    styleParts.push(`PrimaryColour=${config.primaryColor}`);
  }
  if (config.outlineColor) {
    styleParts.push(`OutlineColour=${config.outlineColor}`);
  }
  if (config.outlineWidth !== undefined) {
    styleParts.push(`Outline=${config.outlineWidth}`);
  }
  if (config.backgroundColor) {
    styleParts.push(`BackColour=${config.backgroundColor}`);
  }
  if (config.bold) {
    styleParts.push('Bold=1');
  }
  if (config.alignment !== undefined) {
    styleParts.push(`Alignment=${config.alignment}`);
  }
  if (config.marginV !== undefined) {
    styleParts.push(`MarginV=${config.marginV}`);
  }

  const forceStyleString = styleParts.join(',');

  console.log(`${LOG_PREFIX} Burn-in config ready — force_style="${forceStyleString}"`);

  return {
    srtPath: absoluteSrtPath,
    style: config,
    forceStyleString,
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { captionStyles };
export type { CaptionStyleConfig, CaptionSegment, CaptionResult, BurnInConfig };
