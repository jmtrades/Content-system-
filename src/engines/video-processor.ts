// ============================================================================
// Video Processor Engine
// Full pipeline for processing raw video into platform-specific variants
// with cropping, overlays, captions, music, and thumbnails.
// ============================================================================

import { getDb } from '@/lib/db';
import {
  cropToAspectRatio,
  addTextOverlay,
  addCaptions,
  addMusic,
  generateThumbnail,
} from '@/lib/ffmpeg';
import * as path from 'path';
import * as fs from 'fs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlatformSpec {
  width: number;
  height: number;
  aspect_ratio: string;
  max_duration: number;
  max_file_size_mb: number;
  recommended_bitrate: string;
}

interface VariationPreset {
  name: string;
  caption_style: string;
  music_track: string | null;
  music_volume: number;
  color_grade: string;
  text_position: string;
  speed_adjustment: number;
  hook_variant: number;
}

interface VariationConfig {
  caption_style?: string;
  music_track?: string | null;
  music_volume?: number;
  color_grade?: string;
  text_position?: string;
  speed_adjustment?: number;
  hook_variant?: number;
  srt_path?: string;
  text_overlays?: TextOverlayItem[];
}

interface TextOverlayItem {
  text: string;
  size?: number;
  color?: string;
  y?: number;
  startTime?: number;
  endTime?: number;
}

interface VideoJobRecord {
  id: string;
  script_id: string;
  input_path: string;
  status: string;
  created_at: string;
  [key: string]: unknown;
}

interface ScriptData {
  id: string;
  topic: string;
  hook: string;
  body: string;
  platform_versions: Record<string, PlatformVersion>;
  [key: string]: unknown;
}

interface PlatformVersion {
  hook?: string;
  body?: string;
  cta?: string;
  caption?: string;
  hashtags?: string[];
  aspect_ratio?: string;
  max_duration?: number;
  text_overlay_suggestions?: TextOverlayItem[];
}

// ---------------------------------------------------------------------------
// Platform specifications
// ---------------------------------------------------------------------------

const platformSpecs: Record<string, PlatformSpec> = {
  tiktok: {
    width: 1080,
    height: 1920,
    aspect_ratio: '9:16',
    max_duration: 60,
    max_file_size_mb: 287,
    recommended_bitrate: '4M',
  },
  reels: {
    width: 1080,
    height: 1920,
    aspect_ratio: '9:16',
    max_duration: 90,
    max_file_size_mb: 250,
    recommended_bitrate: '3.5M',
  },
  youtube_shorts: {
    width: 1080,
    height: 1920,
    aspect_ratio: '9:16',
    max_duration: 60,
    max_file_size_mb: 500,
    recommended_bitrate: '5M',
  },
  linkedin: {
    width: 1080,
    height: 1350,
    aspect_ratio: '4:5',
    max_duration: 120,
    max_file_size_mb: 200,
    recommended_bitrate: '3M',
  },
};

// ---------------------------------------------------------------------------
// Variation presets — different editing styles for A/B testing
// ---------------------------------------------------------------------------

const variationPresets: VariationPreset[] = [
  { name: 'default', caption_style: 'bold', music_track: null, music_volume: 0.15, color_grade: 'natural', text_position: 'center', speed_adjustment: 1.0, hook_variant: 0 },
  { name: 'energetic', caption_style: 'highlight', music_track: 'upbeat_01.mp3', music_volume: 0.20, color_grade: 'vibrant', text_position: 'top', speed_adjustment: 1.1, hook_variant: 0 },
  { name: 'minimal', caption_style: 'minimal', music_track: null, music_volume: 0.0, color_grade: 'natural', text_position: 'bottom', speed_adjustment: 1.0, hook_variant: 1 },
  { name: 'dramatic', caption_style: 'bold', music_track: 'dramatic_01.mp3', music_volume: 0.25, color_grade: 'cinematic', text_position: 'center', speed_adjustment: 0.95, hook_variant: 0 },
  { name: 'fast_paced', caption_style: 'highlight', music_track: 'hiphop_01.mp3', music_volume: 0.18, color_grade: 'contrast', text_position: 'center', speed_adjustment: 1.2, hook_variant: 2 },
  { name: 'clean', caption_style: 'minimal', music_track: 'ambient_01.mp3', music_volume: 0.10, color_grade: 'soft', text_position: 'bottom', speed_adjustment: 1.0, hook_variant: 0 },
  { name: 'bold_text', caption_style: 'bold', music_track: null, music_volume: 0.0, color_grade: 'natural', text_position: 'top', speed_adjustment: 1.0, hook_variant: 1 },
  { name: 'story_mode', caption_style: 'highlight', music_track: 'storytelling_01.mp3', music_volume: 0.12, color_grade: 'warm', text_position: 'center', speed_adjustment: 1.0, hook_variant: 0 },
  { name: 'hype', caption_style: 'bold', music_track: 'trap_01.mp3', music_volume: 0.22, color_grade: 'vibrant', text_position: 'center', speed_adjustment: 1.15, hook_variant: 2 },
  { name: 'professional', caption_style: 'minimal', music_track: 'corporate_01.mp3', music_volume: 0.08, color_grade: 'natural', text_position: 'bottom', speed_adjustment: 1.0, hook_variant: 0 },
];

const LOG_PREFIX = '[video-processor]';
const CONTENT_BASE = path.join(process.cwd(), 'content');

// ---------------------------------------------------------------------------
// Main processing pipeline
// ---------------------------------------------------------------------------

/**
 * Process a raw video through the full pipeline:
 * 1. Create a video_jobs record
 * 2. Generate versions for all target platforms
 * 3. Update job status throughout
 */
export async function processVideo(
  inputPath: string,
  scriptId: string,
): Promise<VideoJobRecord> {
  console.log(`${LOG_PREFIX} Starting processing — input="${inputPath}" script="${scriptId}"`);

  const db = getDb();

  // Verify input file exists
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input video file not found: ${inputPath}`);
  }

  // Fetch associated script
  const { data: script, error: scriptErr } = await db
    .from('scripts')
    .select('*')
    .eq('id', scriptId)
    .single();

  if (scriptErr || !script) {
    throw new Error(`Script not found: ${scriptId}`);
  }

  // Create job record
  const { data: job, error: jobErr } = await db
    .from('video_jobs')
    .insert({
      script_id: scriptId,
      input_path: inputPath,
      status: 'queued',
      processing_started_at: null,
      processing_completed_at: null,
      error_message: null,
    })
    .select()
    .single();

  if (jobErr || !job) {
    throw new Error(`Failed to create video job: ${jobErr?.message || 'Unknown error'}`);
  }

  const jobId = job.id as string;
  console.log(`${LOG_PREFIX} Job created — id=${jobId}`);

  // Process asynchronously
  processAsync(jobId, inputPath, script as ScriptData).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${LOG_PREFIX} Job ${jobId} failed: ${message}`);
  });

  return job as VideoJobRecord;
}

/**
 * Internal async processing pipeline that runs after job creation.
 */
async function processAsync(
  jobId: string,
  inputPath: string,
  script: ScriptData,
): Promise<void> {
  const db = getDb();

  try {
    // Mark as processing
    await updateJobStatus(jobId, 'processing');
    await db
      .from('video_jobs')
      .update({ processing_started_at: new Date().toISOString() })
      .eq('id', jobId);

    // Generate all platform versions
    await generateAllVersions(inputPath, script.id, jobId, script);

    // Mark as completed
    await updateJobStatus(jobId, 'completed');
    await db
      .from('video_jobs')
      .update({ processing_completed_at: new Date().toISOString() })
      .eq('id', jobId);

    // Update script status to review
    await db
      .from('scripts')
      .update({ status: 'review' })
      .eq('id', script.id);

    console.log(`${LOG_PREFIX} Job ${jobId} completed successfully`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${LOG_PREFIX} Job ${jobId} processing error: ${message}`);

    await db
      .from('video_jobs')
      .update({
        status: 'failed',
        error_message: message,
        processing_completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);
  }
}

// ---------------------------------------------------------------------------
// Multi-platform generation
// ---------------------------------------------------------------------------

/**
 * Generate video versions for all target platforms.
 */
export async function generateAllVersions(
  inputPath: string,
  scriptId: string,
  jobId?: string,
  scriptData?: ScriptData,
): Promise<string[]> {
  console.log(`${LOG_PREFIX} Generating all platform versions for script=${scriptId}`);

  const db = getDb();
  const outputPaths: string[] = [];

  // Fetch script if not provided
  let script = scriptData;
  if (!script) {
    const { data, error } = await db
      .from('scripts')
      .select('*')
      .eq('id', scriptId)
      .single();

    if (error || !data) {
      throw new Error(`Script not found: ${scriptId}`);
    }
    script = data as ScriptData;
  }

  const platforms = Object.keys(platformSpecs);
  const dateStr = new Date().toISOString().split('T')[0];
  const videoId = jobId || `manual_${Date.now()}`;

  for (const platform of platforms) {
    const spec = platformSpecs[platform];
    const platformVersion = script.platform_versions?.[platform] as PlatformVersion | undefined;
    const storagePath = getStoragePath(dateStr, videoId);
    const outputPath = path.join(storagePath, `${platform}_v1.mp4`);

    try {
      // Ensure output directory exists
      fs.mkdirSync(storagePath, { recursive: true });

      // Build variation config from preset and script data
      const config: VariationConfig = {
        caption_style: 'bold',
        music_track: null,
        music_volume: 0.15,
        color_grade: 'natural',
        text_position: 'center',
        speed_adjustment: 1.0,
        hook_variant: 0,
        text_overlays: platformVersion?.text_overlay_suggestions || [],
      };

      // Generate the variation
      await generateVariation(inputPath, config, outputPath, spec);

      // Generate thumbnail
      const thumbPath = path.join(storagePath, `${platform}_thumb.jpg`);
      try {
        await generateThumbnail(inputPath, thumbPath, 1);
      } catch (thumbErr) {
        const thumbMsg = thumbErr instanceof Error ? thumbErr.message : String(thumbErr);
        console.warn(`${LOG_PREFIX} Thumbnail generation failed for ${platform}: ${thumbMsg}`);
      }

      // Create video_outputs record if we have a job
      if (jobId) {
        const relativePath = path.relative(process.cwd(), outputPath);
        const relativeThumbPath = path.relative(process.cwd(), thumbPath);

        await db.from('video_outputs').insert({
          job_id: jobId,
          platform,
          variant_number: 1,
          output_path: relativePath,
          thumbnail_path: relativeThumbPath,
          caption_path: null,
          duration_seconds: spec.max_duration,
          file_size_bytes: fs.existsSync(outputPath) ? fs.statSync(outputPath).size : 0,
          variation_config: config,
          status: 'ready',
        });
      }

      outputPaths.push(outputPath);
      console.log(`${LOG_PREFIX} Generated ${platform} version — ${outputPath}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${LOG_PREFIX} Failed to generate ${platform} version: ${message}`);

      // Record failed output if we have a job
      if (jobId) {
        await db.from('video_outputs').insert({
          job_id: jobId,
          platform,
          variant_number: 1,
          output_path: outputPath,
          duration_seconds: 0,
          file_size_bytes: 0,
          variation_config: { error: message },
          status: 'ready',
        });
      }
    }
  }

  console.log(`${LOG_PREFIX} All versions generated — ${outputPaths.length} succeeded out of ${platforms.length}`);
  return outputPaths;
}

// ---------------------------------------------------------------------------
// Single variation generation
// ---------------------------------------------------------------------------

/**
 * Generate a single video variation with the given configuration.
 * Applies cropping, text overlays, captions, and music as configured.
 */
export async function generateVariation(
  inputPath: string,
  config: VariationConfig,
  outputPath: string,
  spec?: PlatformSpec,
): Promise<void> {
  console.log(`${LOG_PREFIX} Generating variation — output="${outputPath}"`);

  const outputDir = path.dirname(outputPath);
  fs.mkdirSync(outputDir, { recursive: true });

  // Stage 1: Crop to target aspect ratio
  const targetSpec = spec || platformSpecs.tiktok;
  const croppedPath = path.join(outputDir, `_cropped_${Date.now()}.mp4`);

  try {
    await cropToAspectRatio(inputPath, croppedPath, targetSpec.aspect_ratio as '9:16' | '16:9' | '1:1' | '4:5');
  } catch (cropErr) {
    // If cropping fails (e.g., unsupported ratio), copy the input as-is
    const message = cropErr instanceof Error ? cropErr.message : String(cropErr);
    console.warn(`${LOG_PREFIX} Crop failed (using original): ${message}`);
    fs.copyFileSync(inputPath, croppedPath);
  }

  let currentPath = croppedPath;
  const tempFiles: string[] = [croppedPath];

  // Stage 2: Add text overlays if configured
  if (config.text_overlays && config.text_overlays.length > 0) {
    const overlayPath = path.join(outputDir, `_overlay_${Date.now()}.mp4`);
    try {
      const overlays = config.text_overlays.map((overlay) => ({
        text: overlay.text,
        size: overlay.size || 48,
        color: overlay.color || 'white',
        y: typeof overlay.y === 'number' ? Math.round(overlay.y * targetSpec.height) : 500,
        startTime: overlay.startTime ?? 0,
        endTime: overlay.endTime ?? 5,
      }));

      await addTextOverlay(currentPath, overlayPath, overlays);
      currentPath = overlayPath;
      tempFiles.push(overlayPath);
    } catch (overlayErr) {
      const message = overlayErr instanceof Error ? overlayErr.message : String(overlayErr);
      console.warn(`${LOG_PREFIX} Text overlay failed (skipping): ${message}`);
    }
  }

  // Stage 3: Burn in captions if SRT path provided
  if (config.srt_path && fs.existsSync(config.srt_path)) {
    const captionedPath = path.join(outputDir, `_captioned_${Date.now()}.mp4`);
    try {
      await addCaptions(currentPath, config.srt_path, captionedPath);
      currentPath = captionedPath;
      tempFiles.push(captionedPath);
    } catch (captionErr) {
      const message = captionErr instanceof Error ? captionErr.message : String(captionErr);
      console.warn(`${LOG_PREFIX} Caption burn-in failed (skipping): ${message}`);
    }
  }

  // Stage 4: Add background music if configured
  if (config.music_track) {
    const musicPath = path.join(CONTENT_BASE, 'music', config.music_track);
    if (fs.existsSync(musicPath)) {
      const musicedPath = path.join(outputDir, `_music_${Date.now()}.mp4`);
      try {
        await addMusic(currentPath, musicPath, musicedPath, config.music_volume || 0.15);
        currentPath = musicedPath;
        tempFiles.push(musicedPath);
      } catch (musicErr) {
        const message = musicErr instanceof Error ? musicErr.message : String(musicErr);
        console.warn(`${LOG_PREFIX} Music mixing failed (skipping): ${message}`);
      }
    } else {
      console.warn(`${LOG_PREFIX} Music track not found: ${musicPath}`);
    }
  }

  // Stage 5: Move final file to output path
  if (currentPath !== outputPath) {
    fs.copyFileSync(currentPath, outputPath);
  }

  // Clean up temp files
  for (const tempFile of tempFiles) {
    try {
      if (fs.existsSync(tempFile) && tempFile !== outputPath) {
        fs.unlinkSync(tempFile);
      }
    } catch {
      // Ignore cleanup failures
    }
  }

  console.log(`${LOG_PREFIX} Variation generated — ${outputPath}`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the storage path for processed video outputs.
 * Format: content/processed/{date}/{videoId}/
 */
export function getStoragePath(date: string, videoId: string): string {
  return path.join(CONTENT_BASE, 'processed', date, videoId);
}

/**
 * Update the status of a video job record.
 */
export async function updateJobStatus(
  jobId: string,
  status: string,
): Promise<void> {
  const db = getDb();

  const { error } = await db
    .from('video_jobs')
    .update({ status })
    .eq('id', jobId);

  if (error) {
    console.error(`${LOG_PREFIX} Failed to update job status: ${error.message}`);
    throw new Error(`Failed to update job ${jobId} status to ${status}: ${error.message}`);
  }

  console.log(`${LOG_PREFIX} Job ${jobId} status updated to "${status}"`);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { platformSpecs, variationPresets };
export type {
  PlatformSpec,
  VariationPreset,
  VariationConfig,
  VideoJobRecord,
  ScriptData,
  PlatformVersion,
};
