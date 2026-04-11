// ============================================================================
// POST /api/studio/process — Start a video processing job
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const processSchema = z.object({
  input_path: z.string().min(1),
  script_id: z.string().uuid(),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
});

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = processSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { input_path, script_id } = parsed.data;
    const db = getDb();

    // Verify script exists
    const { data: script, error: scriptErr } = await db
      .from('video_scripts')
      .select('id, topic, status, platform_versions')
      .eq('id', script_id)
      .single();

    if (scriptErr || !script) {
      return NextResponse.json(
        { success: false, error: 'Script not found' },
        { status: 404 },
      );
    }

    // Create job record
    const { data: job, error: jobErr } = await db
      .from('video_jobs')
      .insert({
        script_id,
        input_path,
        status: 'queued',
        processing_started_at: null,
        processing_completed_at: null,
        error_message: null,
      })
      .select()
      .single();

    if (jobErr) {
      return NextResponse.json(
        { success: false, error: jobErr.message },
        { status: 500 },
      );
    }

    // Update script status to editing
    await db
      .from('video_scripts')
      .update({ status: 'editing' })
      .eq('id', script_id);

    // Start processing asynchronously
    // In production, this would be handled by a job queue (BullMQ, etc.)
    processVideoAsync(job.id, input_path, script).catch((err) => {
      console.error(`[video-processor] Job ${job.id} failed:`, err);
    });

    return NextResponse.json({
      success: true,
      data: {
        job_id: job.id,
        status: 'queued',
        script_id,
        input_path,
        created_at: job.created_at,
      },
    }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api:studio/process] POST error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Async video processing (fires and forgets from the request handler)
// ---------------------------------------------------------------------------

async function processVideoAsync(
  jobId: string,
  inputPath: string,
  script: Record<string, unknown>,
): Promise<void> {
  const db = getDb();

  try {
    // Mark as processing
    await db
      .from('video_jobs')
      .update({
        status: 'processing',
        processing_started_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    const platforms = ['tiktok', 'reels', 'youtube_shorts', 'linkedin', 'twitter'] as const;
    const platformVersions = (script.platform_versions ?? {}) as Record<string, unknown>;

    for (const platform of platforms) {
      const version = platformVersions[platform] as Record<string, unknown> | undefined;
      if (!version) continue;

      // Create a video output record for each platform variant
      await db.from('video_outputs').insert({
        job_id: jobId,
        platform,
        variant_number: 1,
        output_path: `content/processed/${jobId}/${platform}_v1.mp4`,
        thumbnail_path: `content/processed/${jobId}/${platform}_thumb.jpg`,
        caption_path: `content/processed/${jobId}/${platform}_captions.srt`,
        duration_seconds: (version.max_duration as number) ?? 60,
        file_size_bytes: 0,
        variation_config: {
          hook_variant: 0,
          caption_style: 'default',
          music_track: 'none',
          color_grade: 'natural',
          text_position: 'center',
          speed_adjustment: 1.0,
        },
        status: 'rendering',
      });
    }

    // Update job status to rendering
    await db
      .from('video_jobs')
      .update({ status: 'rendering' })
      .eq('id', jobId);

    // Mark outputs as ready (in production, actual ffmpeg processing happens here)
    await db
      .from('video_outputs')
      .update({ status: 'ready' })
      .eq('job_id', jobId);

    // Complete job
    await db
      .from('video_jobs')
      .update({
        status: 'completed',
        processing_completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    // Update script status
    await db
      .from('video_scripts')
      .update({ status: 'review' })
      .eq('id', script.id as string);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
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
