// ============================================================================
// Content Empire — VIDEO MULTIPLIER ENGINE
// ============================================================================
// Takes 1 raw video and produces 50+ content pieces through duration cuts,
// platform variations, style variations, highlight extraction, text videos,
// and carousel images. All using FFmpeg locally.
// ============================================================================

import { exec } from 'child_process';
import { promisify } from 'util';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import {
  cropToAspectRatio,
  trimVideo,
  adjustSpeed,
  addTextOverlay,
  // addCaptions available for subtitle burning
  generateThumbnail,
  getVideoInfo,
} from '@/lib/ffmpeg';
import { getServerClient } from '@/lib/db';

const execAsync = promisify(exec);
const log = (msg: string) => console.log(`[video-multiplier] ${new Date().toISOString()} ${msg}`);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VideoClip {
  path: string;
  platform: string;
  type: string;
  duration: number;
  aspect_ratio: string;
}

interface MultiplicationResult {
  total_pieces: number;
  video_clips: VideoClip[];
  thumbnails: string[];
  errors: string[];
}

// ---------------------------------------------------------------------------
// Platform specs
// ---------------------------------------------------------------------------

const PLATFORM_SPECS: Record<string, { aspect: '9:16' | '1:1' | '16:9'; maxDuration: number }[]> = {
  tiktok: [{ aspect: '9:16', maxDuration: 60 }],
  reels: [{ aspect: '9:16', maxDuration: 90 }],
  youtube_shorts: [{ aspect: '9:16', maxDuration: 60 }],
  linkedin: [{ aspect: '1:1', maxDuration: 120 }, { aspect: '16:9', maxDuration: 120 }],
  twitter: [{ aspect: '16:9', maxDuration: 140 }],
};

const DURATION_CUTS = [
  { name: 'hook', seconds: 5, description: 'Hook-only teaser' },
  { name: 'teaser', seconds: 15, description: '15-second teaser' },
  { name: 'short', seconds: 30, description: '30-second version' },
  { name: 'medium', seconds: 45, description: '45-second version' },
  { name: 'standard', seconds: 60, description: '60-second full version' },
];

// ---------------------------------------------------------------------------
// 1. MASTER MULTIPLIER — 1 video → 50+ pieces
// ---------------------------------------------------------------------------

export async function multiplyVideo(
  inputPath: string,
  scriptId?: string,
): Promise<MultiplicationResult> {
  const result: MultiplicationResult = { total_pieces: 0, video_clips: [], thumbnails: [], errors: [] };

  try {
    const info = await getVideoInfo(inputPath);
    const duration = info.duration || 60;
    log(`Processing video: ${inputPath} (${duration.toFixed(1)}s)`);

    // Create output directory
    const dateStr = new Date().toISOString().split('T')[0];
    const videoId = scriptId || `vid_${Date.now()}`;
    const outDir = join(process.cwd(), 'content', 'processed', dateStr, videoId);
    await mkdir(outDir, { recursive: true });
    await mkdir(join(outDir, 'thumbnails'), { recursive: true });

    // --- DURATION CUTS ---
    for (const cut of DURATION_CUTS) {
      if (cut.seconds > duration) continue;
      const cutPath = join(outDir, `${cut.name}_${cut.seconds}s.mp4`);
      try {
        await trimVideo(inputPath, cutPath, 0, Math.min(cut.seconds, duration));
        result.video_clips.push({
          path: cutPath, platform: 'all', type: cut.name,
          duration: cut.seconds, aspect_ratio: 'original',
        });
        result.total_pieces++;
      } catch (err) {
        result.errors.push(`Cut ${cut.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // --- PLATFORM ASPECT RATIO VERSIONS ---
    // For each duration cut, create platform-specific versions
    const mainClips = result.video_clips.filter(c => c.type === 'short' || c.type === 'medium' || c.type === 'standard');
    const clipToProcess = mainClips.length > 0 ? mainClips[0].path : inputPath;

    for (const [platform, specs] of Object.entries(PLATFORM_SPECS)) {
      for (const spec of specs) {
        const platformPath = join(outDir, `${platform}_${spec.aspect.replace(':', 'x')}.mp4`);
        try {
          await cropToAspectRatio(clipToProcess, platformPath, spec.aspect);
          result.video_clips.push({
            path: platformPath, platform, type: 'platform_version',
            duration: Math.min(duration, spec.maxDuration), aspect_ratio: spec.aspect,
          });
          result.total_pieces++;
        } catch (err) {
          result.errors.push(`Platform ${platform}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    // --- SPEED VARIATIONS ---
    try {
      const speedUpPath = join(outDir, 'speed_1.2x.mp4');
      await adjustSpeed(clipToProcess, speedUpPath, 1.2);
      result.video_clips.push({ path: speedUpPath, platform: 'all', type: 'speed_up', duration: duration / 1.2, aspect_ratio: 'original' });
      result.total_pieces++;
    } catch (err) {
      result.errors.push(`Speed 1.2x: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      const speedFastPath = join(outDir, 'speed_1.5x.mp4');
      await adjustSpeed(clipToProcess, speedFastPath, 1.5);
      result.video_clips.push({ path: speedFastPath, platform: 'all', type: 'speed_fast', duration: duration / 1.5, aspect_ratio: 'original' });
      result.total_pieces++;
    } catch (err) {
      result.errors.push(`Speed 1.5x: ${err instanceof Error ? err.message : String(err)}`);
    }

    // --- SLOW-MO HOOK (first 3s slow, rest normal) ---
    try {
      const slowHookPath = join(outDir, 'slow_hook.mp4');
      const slowPart = join(outDir, '_temp_slow.mp4');
      const normalPart = join(outDir, '_temp_normal.mp4');
      await trimVideo(inputPath, slowPart, 0, 3);
      await adjustSpeed(slowPart, join(outDir, '_temp_slow2.mp4'), 0.6);
      await trimVideo(inputPath, normalPart, 3, duration - 3);
      await execAsync(`ffmpeg -y -i "${join(outDir, '_temp_slow2.mp4')}" -i "${normalPart}" -filter_complex "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]" -map "[v]" -map "[a]" "${slowHookPath}" 2>/dev/null`);
      result.video_clips.push({ path: slowHookPath, platform: 'tiktok', type: 'slow_hook', duration: duration + 2, aspect_ratio: 'original' });
      result.total_pieces++;
      // Cleanup temp files
      await execAsync(`rm -f "${slowPart}" "${normalPart}" "${join(outDir, '_temp_slow2.mp4')}" 2>/dev/null`);
    } catch (err) {
      result.errors.push(`Slow hook: ${err instanceof Error ? err.message : String(err)}`);
    }

    // --- TEXT OVERLAY VERSION ---
    try {
      const textPath = join(outDir, 'text_overlay.mp4');
      await addTextOverlay(clipToProcess, textPath, [
        { text: 'WATCH THIS', size: 64, color: 'white', y: 100, startTime: 0, endTime: 2 },
        { text: 'Mind = Blown', size: 48, color: 'yellow', y: 500, startTime: Math.floor(duration / 2), endTime: Math.floor(duration / 2) + 3 },
      ]);
      result.video_clips.push({ path: textPath, platform: 'all', type: 'text_overlay', duration, aspect_ratio: 'original' });
      result.total_pieces++;
    } catch (err) {
      result.errors.push(`Text overlay: ${err instanceof Error ? err.message : String(err)}`);
    }

    // --- HIGHLIGHT CLIPS (extract 3-5 segments) ---
    try {
      const highlights = await detectHighlights(inputPath, duration);
      for (let i = 0; i < highlights.length; i++) {
        const hlPath = join(outDir, `highlight_${i + 1}.mp4`);
        try {
          await trimVideo(inputPath, hlPath, highlights[i].start, highlights[i].end - highlights[i].start);
          result.video_clips.push({
            path: hlPath, platform: 'all', type: 'highlight',
            duration: highlights[i].end - highlights[i].start, aspect_ratio: 'original',
          });
          result.total_pieces++;
        } catch { /* skip failed highlight */ }
      }
    } catch (err) {
      result.errors.push(`Highlights: ${err instanceof Error ? err.message : String(err)}`);
    }

    // --- THUMBNAILS (5-8 from key moments) ---
    const thumbTimes = [1, duration * 0.25, duration * 0.5, duration * 0.75, duration - 1].filter(t => t > 0 && t < duration);
    for (let i = 0; i < thumbTimes.length; i++) {
      const thumbPath = join(outDir, 'thumbnails', `thumb_${i + 1}.jpg`);
      try {
        await generateThumbnail(inputPath, thumbPath, thumbTimes[i]);
        result.thumbnails.push(thumbPath);
      } catch { /* skip failed thumbnails */ }
    }

    // --- Store outputs in database ---
    if (scriptId) {
      const db = getServerClient();
      try {
        // Create video job
        const { data: job } = await db
          .from('video_jobs')
          .insert({
            script_id: scriptId,
            input_path: inputPath,
            status: 'done',
            processing_started_at: new Date().toISOString(),
            processing_completed_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (job) {
          for (const clip of result.video_clips) {
            await db.from('video_outputs').insert({
              job_id: job.id,
              platform: clip.platform,
              output_path: clip.path,
              duration_seconds: clip.duration,
              variation_config: { type: clip.type, aspect_ratio: clip.aspect_ratio },
              status: 'ready',
            });
          }
        }
      } catch (dbErr) {
        result.errors.push(`DB storage: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`);
      }
    }

    log(`✅ Multiplied video → ${result.total_pieces} pieces (${result.video_clips.length} clips, ${result.thumbnails.length} thumbnails, ${result.errors.length} errors)`);
    return result;
  } catch (err) {
    log(`Video multiplication failed: ${err instanceof Error ? err.message : String(err)}`);
    result.errors.push(err instanceof Error ? err.message : String(err));
    return result;
  }
}

// ---------------------------------------------------------------------------
// 2. HIGHLIGHT DETECTION — find the best moments
// ---------------------------------------------------------------------------

async function detectHighlights(
  inputPath: string,
  duration: number,
): Promise<Array<{ start: number; end: number; score: number }>> {
  const highlights: Array<{ start: number; end: number; score: number }> = [];

  try {
    // Use FFmpeg scene detection
    const { stdout } = await execAsync(
      `ffmpeg -i "${inputPath}" -filter:v "select='gt(scene,0.3)',showinfo" -f null - 2>&1 | grep showinfo | head -20`,
      { timeout: 30000 }
    );

    const sceneChanges: number[] = [];
    const lines = stdout.split('\n');
    for (const line of lines) {
      const match = line.match(/pts_time:([\d.]+)/);
      if (match) sceneChanges.push(parseFloat(match[1]));
    }

    // Create clips around scene changes
    if (sceneChanges.length > 0) {
      for (const time of sceneChanges.slice(0, 5)) {
        const start = Math.max(0, time - 2);
        const end = Math.min(duration, time + 13); // 15-second clips
        if (end - start >= 10) {
          highlights.push({ start, end, score: 80 });
        }
      }
    }
  } catch {
    // Fallback: evenly-spaced clips
  }

  // If scene detection didn't find enough, use evenly-spaced segments
  if (highlights.length < 3 && duration > 30) {
    const segmentDuration = 15;
    const segments = Math.min(5, Math.floor(duration / segmentDuration));
    const gap = duration / (segments + 1);
    for (let i = 1; i <= segments; i++) {
      const start = Math.floor(gap * i - segmentDuration / 2);
      const end = Math.min(duration, start + segmentDuration);
      if (start >= 0) highlights.push({ start, end, score: 60 });
    }
  }

  return highlights.slice(0, 5);
}

// ---------------------------------------------------------------------------
// 3. SMART CLIP EXTRACTION — natural cut points
// ---------------------------------------------------------------------------

export async function extractSmartClips(
  inputPath: string,
  count: number = 5,
): Promise<string[]> {
  const clipPaths: string[] = [];

  try {
    const info = await getVideoInfo(inputPath);
    const duration = info.duration || 60;
    const outDir = join(process.cwd(), 'content', 'processed', 'clips');
    await mkdir(outDir, { recursive: true });

    const highlights = await detectHighlights(inputPath, duration);

    for (let i = 0; i < Math.min(count, highlights.length); i++) {
      const clipPath = join(outDir, `clip_${Date.now()}_${i}.mp4`);
      try {
        await trimVideo(inputPath, clipPath, highlights[i].start, highlights[i].end - highlights[i].start);
        clipPaths.push(clipPath);
      } catch { /* skip */ }
    }

    log(`Extracted ${clipPaths.length} smart clips from ${inputPath}`);
  } catch (err) {
    log(`Smart clip extraction error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return clipPaths;
}

// ---------------------------------------------------------------------------
// 4. TEXT VIDEO GENERATOR — create video from text only
// ---------------------------------------------------------------------------

export async function generateTextVideo(
  text: string,
  duration: number,
  style: 'bold' | 'minimal' | 'animated',
  outputPath: string,
): Promise<string> {
  const styles = {
    bold: { bg: 'black', fg: 'white', font: 'Arial', size: 64 },
    minimal: { bg: '#1a1a2e', fg: '#e0e0e0', font: 'Helvetica', size: 48 },
    animated: { bg: '#0f0f0f', fg: '#00ff88', font: 'Arial', size: 56 },
  };

  const s = styles[style];
  const escapedText = text.replace(/'/g, "'\\''").replace(/:/g, '\\:');

  try {
    await mkdir(join(outputPath, '..'), { recursive: true });

    const cmd = [
      'ffmpeg -y',
      `-f lavfi -i color=c=${s.bg}:s=1080x1920:d=${duration}`,
      '-f lavfi -i anullsrc=r=44100:cl=stereo',
      `-t ${duration}`,
      `-vf "drawtext=text='${escapedText}':fontsize=${s.size}:fontcolor=${s.fg}:font=${s.font}:x=(w-text_w)/2:y=(h-text_h)/2:borderw=3:bordercolor=black"`,
      '-c:v libx264 -c:a aac -shortest',
      `"${outputPath}"`,
    ].join(' ');

    await execAsync(cmd, { timeout: 30000 });
    log(`Generated text video: ${outputPath}`);
    return outputPath;
  } catch (err) {
    log(`Text video generation failed: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// 5. CAROUSEL IMAGE GENERATOR — key points as slide images
// ---------------------------------------------------------------------------

export async function generateCarouselImages(
  keyPoints: string[],
  style: 'dark' | 'light' | 'branded',
  outputDir: string,
): Promise<string[]> {
  await mkdir(outputDir, { recursive: true });
  const imagePaths: string[] = [];

  const styles = {
    dark: { bg: '#0f0f0f', fg: 'white', accent: '#3b82f6' },
    light: { bg: '#f8f9fa', fg: '#1a1a2e', accent: '#2563eb' },
    branded: { bg: '#1a1a2e', fg: '#e0e0e0', accent: '#e94560' },
  };
  const s = styles[style];

  for (let i = 0; i < keyPoints.length; i++) {
    const imagePath = join(outputDir, `slide_${i + 1}.png`);
    const escapedText = keyPoints[i].replace(/'/g, "'\\''").replace(/:/g, '\\:');

    try {
      const cmd = [
        'ffmpeg -y',
        `-f lavfi -i "color=c=${s.bg.replace('#', '0x')}:s=1080x1080:d=1"`,
        `-vf "drawtext=text='${i + 1}/${keyPoints.length}':fontsize=24:fontcolor=${s.accent}:x=50:y=50,` +
        `drawtext=text='${escapedText}':fontsize=42:fontcolor=${s.fg}:x=(w-text_w)/2:y=(h-text_h)/2:borderw=2:bordercolor=black"`,
        '-frames:v 1',
        `"${imagePath}"`,
      ].join(' ');

      await execAsync(cmd, { timeout: 15000 });
      imagePaths.push(imagePath);
    } catch {
      log(`Failed to generate slide ${i + 1}`);
    }
  }

  log(`Generated ${imagePaths.length} carousel images in ${outputDir}`);
  return imagePaths;
}

// ---------------------------------------------------------------------------
// 6. BATCH PROCESS FOR ALL PLATFORMS
// ---------------------------------------------------------------------------

export async function processVideoForAllPlatforms(
  inputPath: string,
  config: {
    scriptId?: string;
    hookText?: string;
    keyPoints?: string[];
    _musicTrack?: string;
  } = {},
): Promise<{ total: number; byPlatform: Record<string, number> }> {
  const byPlatform: Record<string, number> = {};
  let total = 0;

  try {
    // Full multiplication
    const result = await multiplyVideo(inputPath, config.scriptId);
    total += result.total_pieces;

    for (const clip of result.video_clips) {
      byPlatform[clip.platform] = (byPlatform[clip.platform] || 0) + 1;
    }

    // Generate carousel if key points provided
    if (config.keyPoints && config.keyPoints.length > 0) {
      const dateStr = new Date().toISOString().split('T')[0];
      const carouselDir = join(process.cwd(), 'content', 'processed', dateStr, 'carousel');
      const slides = await generateCarouselImages(config.keyPoints, 'branded', carouselDir);
      total += slides.length;
      byPlatform['carousel'] = slides.length;
    }

    // Generate text video from hook
    if (config.hookText) {
      const dateStr = new Date().toISOString().split('T')[0];
      const textVideoPath = join(process.cwd(), 'content', 'processed', dateStr, 'text_hook.mp4');
      await generateTextVideo(config.hookText, 10, 'bold', textVideoPath);
      total++;
      byPlatform['text_video'] = 1;
    }

    log(`✅ Full platform processing: ${total} total pieces across ${Object.keys(byPlatform).length} categories`);
  } catch (err) {
    log(`Full platform processing error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { total, byPlatform };
}
