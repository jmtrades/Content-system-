// ============================================================================
// MASTER PIPELINE — Orchestrates every engine into one seamless flow.
// When a user uploads a video, THIS is what runs. The brain of the system.
// ============================================================================

import { getServerClient } from '@/lib/db';

// Engine imports — each step has its own dedicated engine
import { generateScript } from '@/engines/script-generator';
import { generateCaptions } from '@/engines/caption-generator';
import { predictViralScore } from '@/engines/viral-predictor';
import { fullProPipeline } from '@/engines/pro-video-editor';
import { multiplyVideo } from '@/engines/video-multiplier';
import { repurposeContent } from '@/engines/content-repurposer';
import { optimizeHashtags, generateCommentBaitCaption } from '@/engines/growth-hacking';
import { HYPERGROWTH_SCHEDULE, fillPostingCalendar } from '@/engines/hypergrowth-engine';
import { generateContentFlywheel, scheduleFlywheelSequence } from '@/engines/marketing-strategy';
import { sendNotification } from '@/engines/notification-engine';

const log = (msg: string) => console.log(`[pipeline] ${new Date().toISOString()} ${msg}`);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PipelineResult {
  scriptId: string | null;
  captionPath: string | null;
  editedVideos: Record<string, string>;
  totalContentPieces: number;
  scheduledPosts: number;
  viralScore: number;
  flywheelSequenced: number;
  errors: string[];
  timings: Record<string, number>; // ms per step
}

// ---------------------------------------------------------------------------
// Internal state — tracks the currently active pipeline run
// ---------------------------------------------------------------------------

let _pipelineActive = false;
let _currentStep = 'idle';
let _progress = 0;

// ---------------------------------------------------------------------------
// Step runner — wraps each step in try/catch, records timing, continues on error
// ---------------------------------------------------------------------------

async function runStep(
  name: string,
  progressTarget: number,
  result: PipelineResult,
  fn: () => Promise<void>,
): Promise<void> {
  _currentStep = name;
  _progress = Math.max(0, progressTarget - 5);
  log(`[${_progress}%] Step: ${name}`);
  const start = Date.now();

  try {
    await fn();
  } catch (err) {
    const msg = `${name}: ${err instanceof Error ? err.message : String(err)}`;
    result.errors.push(msg);
    log(`ERROR in step "${name}": ${msg}`);
  }

  result.timings[name] = Date.now() - start;
  _progress = progressTarget;
}

// ---------------------------------------------------------------------------
// MASTER PIPELINE — the one function that does everything
// ---------------------------------------------------------------------------

export async function runFullPipeline(config: {
  videoPath: string;
  scriptText?: string;
  hookText?: string;
  keyPoints?: string[];
  editStyle?: string;
  platforms?: string[];
}): Promise<PipelineResult> {
  _pipelineActive = true;
  _currentStep = 'initializing';
  _progress = 0;

  const result: PipelineResult = {
    scriptId: null,
    captionPath: null,
    editedVideos: {},
    totalContentPieces: 0,
    scheduledPosts: 0,
    viralScore: 0,
    flywheelSequenced: 0,
    errors: [],
    timings: {},
  };

  const platforms = config.platforms ?? Object.keys(HYPERGROWTH_SCHEDULE);

  log('=== MASTER PIPELINE START ===');
  log(`Video: ${config.videoPath}`);
  log(`Platforms: ${platforms.join(', ')}`);
  const pipelineStart = Date.now();

  // =========================================================================
  // STEP 1: Generate / Store Script
  // =========================================================================
  await runStep('script_generation', 10, result, async () => {
    const db = getServerClient();

    if (config.scriptText) {
      // Store the provided script text directly in DB
      const hook = config.hookText || config.scriptText.split('\n')[0] || 'Uploaded video';
      const { data, error } = await db
        .from('scripts')
        .insert({
          topic: hook,
          content_pillar: 'frameworks_insights',
          hook,
          hook_variants: [hook],
          body: config.scriptText,
          cta: 'Follow for more AI insights — I break everything first.',
          cta_type: 'follow',
          caption: hook,
          hashtags: ['AI', 'AITools', 'Tech', 'TheOperator'],
          estimated_duration: 60,
          status: 'approved',
        })
        .select('id')
        .single();

      if (error) throw new Error(`Script insert failed: ${error.message}`);
      result.scriptId = data.id;
      log(`Script stored from provided text — id=${data.id}`);
    } else {
      // Auto-generate script via Ollama
      const script = await generateScript(
        config.hookText || 'AI breaking news and insights',
        'breaking_news',
        'tiktok',
      );
      result.scriptId = script.id;
      log(`Script generated via Ollama — id=${script.id}`);
    }
  });

  // =========================================================================
  // STEP 2: Generate Captions (Faster-Whisper)
  // =========================================================================
  await runStep('caption_generation', 20, result, async () => {
    const captionResult = await generateCaptions(config.videoPath, 'bold', 'en');
    result.captionPath = captionResult.srtPath;
    log(`Captions generated — ${captionResult.segmentCount} segments -> ${captionResult.srtPath}`);
  });

  // =========================================================================
  // STEP 3: Viral Score Prediction
  // =========================================================================
  await runStep('viral_prediction', 30, result, async () => {
    if (!result.scriptId) {
      log('WARN: No script ID available — skipping viral prediction');
      return;
    }

    const prediction = await predictViralScore(result.scriptId);
    result.viralScore = prediction.score;

    if (prediction.score < 50) {
      log(`WARN: Viral score is low (${prediction.score}/100) — continuing anyway`);
    }
    if (prediction.score > 75) {
      log(`PRIORITY: Viral score is high (${prediction.score}/100) — marking as priority content`);
      const db = getServerClient();
      await db
        .from('scripts')
        .update({ status: 'priority' })
        .eq('id', result.scriptId);
    }

    log(`Viral score: ${prediction.score}/100 (confidence: ${(prediction.confidence * 100).toFixed(0)}%)`);
  });

  // =========================================================================
  // STEP 4: Pro Video Edit
  // =========================================================================
  await runStep('pro_video_edit', 45, result, async () => {
    // Build script data for the editor
    let scriptData = {
      id: result.scriptId || `pipeline_${Date.now()}`,
      hook: config.hookText || 'Watch this',
      body: config.scriptText || '',
      cta: 'Follow for daily AI insights',
      keyPoints: config.keyPoints,
    };

    if (result.scriptId) {
      const db = getServerClient();
      const { data } = await db
        .from('scripts')
        .select('id, hook, body, cta')
        .eq('id', result.scriptId)
        .single();
      if (data) {
        scriptData = {
          id: data.id,
          hook: data.hook || scriptData.hook,
          body: data.body || scriptData.body,
          cta: data.cta || scriptData.cta,
          keyPoints: config.keyPoints,
        };
      }
    }

    const editResult = await fullProPipeline(
      config.videoPath,
      scriptData,
      result.captionPath || undefined,
    );

    result.editedVideos = editResult.outputs;
    result.totalContentPieces += Object.keys(editResult.outputs).length;
    log(`Pro edit complete — ${Object.keys(editResult.outputs).length} platform versions created`);
  });

  // =========================================================================
  // STEP 5: Video Multiplication (50+ cuts/variations)
  // =========================================================================
  await runStep('video_multiplication', 58, result, async () => {
    // Multiply from the first available edited video, or the original
    const sourceVideo =
      Object.values(result.editedVideos)[0] || config.videoPath;

    const multiResult = await multiplyVideo(sourceVideo, result.scriptId || undefined);
    result.totalContentPieces += multiResult.total_pieces;
    log(`Video multiplied — ${multiResult.total_pieces} pieces (${multiResult.errors.length} sub-errors)`);

    if (multiResult.errors.length > 0) {
      for (const e of multiResult.errors) {
        result.errors.push(`video_multiplication: ${e}`);
      }
    }
  });

  // =========================================================================
  // STEP 6: Content Repurposing (Twitter thread, LinkedIn, carousel, quotes, etc.)
  // =========================================================================
  await runStep('content_repurposing', 68, result, async () => {
    if (!result.scriptId) {
      log('WARN: No script ID — skipping content repurposing');
      return;
    }

    const repurposed = await repurposeContent(result.scriptId);
    result.totalContentPieces += repurposed.length;
    log(`Content repurposed — ${repurposed.length} formats (thread, LinkedIn, carousel, blog, newsletter, quotes, poll, BTS, hot take, tutorial)`);
  });

  // =========================================================================
  // STEP 7: Growth Hacking Optimization (hashtags + comment bait per platform)
  // =========================================================================
  await runStep('growth_hacking', 78, result, async () => {
    if (!result.scriptId) {
      log('WARN: No script ID — skipping growth hacking');
      return;
    }

    // Fetch the script for caption / hashtag generation
    const db = getServerClient();
    const { data: script } = await db
      .from('scripts')
      .select('topic, hook, body, caption')
      .eq('id', result.scriptId)
      .single();

    if (!script) {
      log('WARN: Script not found in DB — skipping growth hacking');
      return;
    }

    for (const platform of platforms) {
      try {
        // Optimize hashtags for this platform
        const tags = await optimizeHashtags(
          script.topic,
          platform,
          script.caption || '',
        );
        log(`Hashtags optimized for ${platform}: ${tags.length} tags`);

        // Generate comment-baiting caption for this platform
        const baitCaption = await generateCommentBaitCaption(
          { topic: script.topic, hook: script.hook, body: script.body },
          platform,
        );
        log(`Comment-bait caption for ${platform}: "${baitCaption.slice(0, 60)}..."`);
      } catch (platformErr) {
        result.errors.push(
          `growth_hacking(${platform}): ${platformErr instanceof Error ? platformErr.message : String(platformErr)}`,
        );
      }
    }
  });

  // =========================================================================
  // STEP 8: Schedule Posts (fill posting calendar at optimal times)
  // =========================================================================
  await runStep('scheduling', 88, result, async () => {
    const calendarResult = await fillPostingCalendar();
    result.scheduledPosts += calendarResult.slots_filled;
    log(`Posting calendar filled — ${calendarResult.slots_filled}/${calendarResult.total_slots} slots across all platforms`);

    // Also insert direct posts for this video to the posting queue
    const db = getServerClient();
    const caption = config.hookText || config.scriptText?.split('\n')[0] || 'AI insights you need to see';

    for (let i = 0; i < platforms.length; i++) {
      const platform = platforms[i];
      const scheduledAt = new Date(Date.now() + (i + 1) * 30 * 60000).toISOString();

      await db.from('posting_queue').insert({
        platform,
        caption,
        hashtags: ['AI', 'AITools', 'Tech', 'TheOperator', 'ContentEmpire'],
        scheduled_at: scheduledAt,
        status: 'scheduled',
      });
      result.scheduledPosts++;
    }
  });

  // =========================================================================
  // STEP 9: Content Flywheel (6-post follow-up sequence)
  // =========================================================================
  await runStep('content_flywheel', 95, result, async () => {
    if (!result.scriptId) {
      log('WARN: No script ID — skipping flywheel');
      return;
    }

    const flywheel = await generateContentFlywheel(result.scriptId);
    const scheduled = await scheduleFlywheelSequence(flywheel);
    result.flywheelSequenced = scheduled;
    result.scheduledPosts += scheduled;
    log(`Flywheel created — ${flywheel.follow_ups.length} follow-ups, ${scheduled} scheduled`);
  });

  // =========================================================================
  // STEP 10: Notifications
  // =========================================================================
  await runStep('notifications', 100, result, async () => {
    const summary = [
      `${result.totalContentPieces} pieces created`,
      `${result.scheduledPosts} posts scheduled`,
      `viral score: ${result.viralScore}/100`,
      result.errors.length > 0
        ? `${result.errors.length} non-fatal errors`
        : 'no errors',
    ].join(' | ');

    await sendNotification({
      title: 'Pipeline Complete',
      message: `Pipeline complete: ${summary}`,
      category: 'content_ready',
      priority: result.viralScore > 75 ? 'high' : 'medium',
      channels: ['dashboard', 'telegram', 'discord'],
      data: {
        script_id: result.scriptId,
        total_pieces: result.totalContentPieces,
        scheduled_posts: result.scheduledPosts,
        viral_score: result.viralScore,
        flywheel_sequenced: result.flywheelSequenced,
        error_count: result.errors.length,
      },
    });

    log(`Notification sent: ${summary}`);
  });

  // =========================================================================
  // DONE
  // =========================================================================
  const totalMs = Date.now() - pipelineStart;
  result.timings['total'] = totalMs;

  _pipelineActive = false;
  _currentStep = 'complete';
  _progress = 100;

  log('=== MASTER PIPELINE COMPLETE ===');
  log(`Total time: ${(totalMs / 1000).toFixed(1)}s`);
  log(`Script: ${result.scriptId}`);
  log(`Viral Score: ${result.viralScore}/100`);
  log(`Content Pieces: ${result.totalContentPieces}`);
  log(`Scheduled Posts: ${result.scheduledPosts}`);
  log(`Flywheel Posts: ${result.flywheelSequenced}`);
  log(`Errors: ${result.errors.length}`);
  if (result.errors.length > 0) {
    result.errors.forEach((e) => log(`  -> ${e}`));
  }
  log(`Timings: ${JSON.stringify(result.timings)}`);

  return result;
}

// ---------------------------------------------------------------------------
// Pipeline Status (used by dashboards / polling endpoints)
// ---------------------------------------------------------------------------

export async function getPipelineStatus(): Promise<{
  active: boolean;
  currentStep: string;
  progress: number;
}> {
  return {
    active: _pipelineActive,
    currentStep: _currentStep,
    progress: _progress,
  };
}
