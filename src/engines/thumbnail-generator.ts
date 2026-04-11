// ============================================================================
// Thumbnail Generator Engine
// Creates platform-specific thumbnail images using canvas/sharp with
// multiple style presets, auto-scaling text, and batch generation.
// ============================================================================

import { getDb } from '@/lib/db';
import { generateThumbnail as createImage } from '@/lib/canvas';
import * as path from 'path';
import * as fs from 'fs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlatformSize {
  width: number;
  height: number;
}

interface StylePreset {
  name: string;
  backgroundColor: string;
  accentColor: string;
  style: 'gradient' | 'bold' | 'minimal' | 'overlay';
  fontSize?: number;
}

interface ThumbnailConfig {
  title: string;
  subtitle?: string;
  style: string;
  platform: string;
  backgroundColor?: string;
  accentColor?: string;
  backgroundImage?: string;
  outputPath?: string;
}

interface ThumbnailResult {
  path: string;
  platform: string;
  style: string;
  width: number;
  height: number;
  sizeBytes: number;
  generatedAt: string;
}

interface ScriptRecord {
  id: string;
  topic: string;
  hook: string;
  body: string;
  content_pillar: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Platform dimensions
// ---------------------------------------------------------------------------

const platformSizes: Record<string, PlatformSize> = {
  tiktok: { width: 1080, height: 1920 },
  reels: { width: 1080, height: 1920 },
  youtube_shorts: { width: 1080, height: 1920 },
  youtube: { width: 1280, height: 720 },
  linkedin: { width: 1200, height: 627 },
  twitter: { width: 1200, height: 675 },
};

// ---------------------------------------------------------------------------
// Style presets
// ---------------------------------------------------------------------------

const stylePresets: Record<string, StylePreset> = {
  bold: {
    name: 'bold',
    backgroundColor: '#FF0000',
    accentColor: '#FFFF00',
    style: 'bold',
    fontSize: 72,
  },
  minimal: {
    name: 'minimal',
    backgroundColor: '#1a1a2e',
    accentColor: '#e94560',
    style: 'minimal',
    fontSize: 56,
  },
  dramatic: {
    name: 'dramatic',
    backgroundColor: '#0D0D0D',
    accentColor: '#FF6B00',
    style: 'gradient',
    fontSize: 68,
  },
  clean: {
    name: 'clean',
    backgroundColor: '#FFFFFF',
    accentColor: '#0066FF',
    style: 'minimal',
    fontSize: 52,
  },
  neon: {
    name: 'neon',
    backgroundColor: '#0A0A1A',
    accentColor: '#00FFFF',
    style: 'gradient',
    fontSize: 64,
  },
  dark: {
    name: 'dark',
    backgroundColor: '#111111',
    accentColor: '#00FF88',
    style: 'bold',
    fontSize: 60,
  },
  warm: {
    name: 'warm',
    backgroundColor: '#2D1B00',
    accentColor: '#FF9500',
    style: 'gradient',
    fontSize: 58,
  },
  professional: {
    name: 'professional',
    backgroundColor: '#1B2838',
    accentColor: '#4FC3F7',
    style: 'minimal',
    fontSize: 50,
  },
};

const LOG_PREFIX = '[thumbnail-generator]';
const CONTENT_BASE = path.join(process.cwd(), 'content');

// ---------------------------------------------------------------------------
// Main thumbnail generation
// ---------------------------------------------------------------------------

/**
 * Generate a single thumbnail image with the given configuration.
 * Uses the canvas library (sharp) to create the image and saves it to disk.
 *
 * @param config - Thumbnail configuration (title, style, platform, etc.)
 * @returns ThumbnailResult with path, dimensions, and metadata
 */
export async function generateThumbnail(
  config: ThumbnailConfig,
): Promise<ThumbnailResult> {
  console.log(`${LOG_PREFIX} Generating thumbnail — title="${config.title.slice(0, 40)}..." platform="${config.platform}" style="${config.style}"`);

  // Resolve platform dimensions
  const size = platformSizes[config.platform];
  if (!size) {
    throw new Error(`Unsupported platform: ${config.platform}. Available: ${Object.keys(platformSizes).join(', ')}`);
  }

  // Resolve style preset
  const preset = stylePresets[config.style];
  if (!preset) {
    console.warn(`${LOG_PREFIX} Unknown style "${config.style}", falling back to "bold"`);
  }
  const resolvedPreset = preset || stylePresets.bold;

  // Determine output path
  const outputPath = config.outputPath || getOutputPath(`thumb_${Date.now()}`, config.platform);

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  fs.mkdirSync(outputDir, { recursive: true });

  // Build the canvas config for the library
  const canvasConfig = {
    title: config.title,
    subtitle: config.subtitle,
    platform: config.platform as 'tiktok' | 'reels' | 'youtube_shorts' | 'linkedin' | 'twitter',
    style: resolvedPreset.style,
    backgroundColor: config.backgroundColor || resolvedPreset.backgroundColor,
    accentColor: config.accentColor || resolvedPreset.accentColor,
    fontSize: resolvedPreset.fontSize,
    background: config.backgroundImage,
    outputPath,
  };

  // Generate the image
  let imageBuffer: Buffer;
  try {
    imageBuffer = await createImage(canvasConfig);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${LOG_PREFIX} Image generation failed: ${message}`);
    throw new Error(`Thumbnail generation failed: ${message}`);
  }

  // Verify the file was written
  if (!fs.existsSync(outputPath)) {
    // The canvas library should have written it via outputPath config,
    // but if not, write it manually
    fs.writeFileSync(outputPath, imageBuffer);
  }

  const stats = fs.statSync(outputPath);

  const result: ThumbnailResult = {
    path: outputPath,
    platform: config.platform,
    style: config.style,
    width: size.width,
    height: size.height,
    sizeBytes: stats.size,
    generatedAt: new Date().toISOString(),
  };

  console.log(`${LOG_PREFIX} Thumbnail generated — path="${outputPath}" size=${stats.size} bytes`);
  return result;
}

// ---------------------------------------------------------------------------
// Batch generation for all platforms
// ---------------------------------------------------------------------------

/**
 * Generate thumbnails for all target platforms from a script record.
 * Fetches the script from the database and creates thumbnails using
 * the script's topic as the title and hook as the subtitle.
 *
 * @param scriptId - UUID of the script to generate thumbnails for
 * @param style - Style preset to use (default: 'bold')
 * @returns Array of ThumbnailResult for each platform
 */
export async function generateAllThumbnails(
  scriptId: string,
  style: string = 'bold',
): Promise<ThumbnailResult[]> {
  console.log(`${LOG_PREFIX} Generating all thumbnails for script=${scriptId}`);

  const db = getDb();

  // Fetch the script
  const { data: script, error } = await db
    .from('scripts')
    .select('id, topic, hook, body, content_pillar')
    .eq('id', scriptId)
    .single();

  if (error || !script) {
    throw new Error(`Script not found: ${scriptId}`);
  }

  const scriptData = script as ScriptRecord;
  const results: ThumbnailResult[] = [];
  const targetPlatforms = ['tiktok', 'reels', 'youtube_shorts', 'youtube', 'linkedin'];

  for (const platform of targetPlatforms) {
    try {
      const outputPath = getOutputPath(scriptId, platform);

      const result = await generateThumbnail({
        title: scriptData.topic,
        subtitle: scriptData.hook,
        style,
        platform,
        outputPath,
      });

      results.push(result);
      console.log(`${LOG_PREFIX} Thumbnail for ${platform} generated — ${outputPath}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${LOG_PREFIX} Failed to generate ${platform} thumbnail: ${message}`);
    }
  }

  console.log(`${LOG_PREFIX} Batch complete — ${results.length} thumbnails generated for script ${scriptId}`);
  return results;
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Generate the output file path for a thumbnail.
 * Format: content/thumbnails/{date}/{scriptId}/{platform}.png
 *
 * @param scriptId - Script ID or unique identifier
 * @param platform - Target platform name
 * @returns Absolute file path for the thumbnail
 */
export function getOutputPath(scriptId: string, platform: string): string {
  const dateStr = new Date().toISOString().split('T')[0];
  return path.join(
    CONTENT_BASE,
    'thumbnails',
    dateStr,
    scriptId,
    `${platform}.png`,
  );
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { platformSizes, stylePresets };
export type { PlatformSize, StylePreset, ThumbnailConfig, ThumbnailResult };
