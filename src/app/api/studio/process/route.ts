// ============================================================================
// POST /api/studio/process — Run the FULL content pipeline on a video
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { runFullPipeline, getPipelineStatus } from '@/engines/master-pipeline';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const processSchema = z.object({
  input_path: z.string().min(1),
  script_id: z.string().uuid().optional(),
  script_text: z.string().optional(),
  hook_text: z.string().optional(),
  key_points: z.array(z.string()).optional(),
  edit_style: z.string().optional(),
  platforms: z.array(z.string()).optional(),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
});

// ---------------------------------------------------------------------------
// POST handler — kicks off the full master pipeline
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

    const {
      input_path,
      script_id,
      script_text,
      hook_text,
      key_points,
      edit_style,
      platforms,
    } = parsed.data;

    const db = getDb();

    // If a script_id was supplied, fetch the script text from DB
    let resolvedScriptText = script_text;
    let resolvedHookText = hook_text;

    if (script_id) {
      const { data: script, error: scriptErr } = await db
        .from('video_scripts')
        .select('id, topic, hook, body, status, platform_versions')
        .eq('id', script_id)
        .single();

      if (scriptErr || !script) {
        return NextResponse.json(
          { success: false, error: 'Script not found' },
          { status: 404 },
        );
      }

      resolvedScriptText = resolvedScriptText || script.body;
      resolvedHookText = resolvedHookText || script.hook || script.topic;

      // Update script status to editing
      await db
        .from('video_scripts')
        .update({ status: 'editing' })
        .eq('id', script_id);
    }

    // Create a job record for tracking
    const { data: job, error: jobErr } = await db
      .from('video_jobs')
      .insert({
        script_id: script_id || null,
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

    // Fire the full master pipeline asynchronously
    runFullPipelineAsync(job.id, {
      videoPath: input_path,
      scriptText: resolvedScriptText,
      hookText: resolvedHookText,
      keyPoints: key_points,
      editStyle: edit_style,
      platforms,
    }).catch((err) => {
      console.error(`[api:studio/process] Pipeline job ${job.id} failed:`, err);
    });

    return NextResponse.json({
      success: true,
      data: {
        job_id: job.id,
        status: 'queued',
        script_id: script_id || null,
        input_path,
        created_at: job.created_at,
        message: 'Master pipeline started — all 10 steps will execute automatically.',
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
// GET handler — returns current pipeline status
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const status = await getPipelineStatus();
    return NextResponse.json({ success: true, data: status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Async pipeline execution (fires and forgets from the request handler)
// ---------------------------------------------------------------------------

async function runFullPipelineAsync(
  jobId: string,
  config: {
    videoPath: string;
    scriptText?: string;
    hookText?: string;
    keyPoints?: string[];
    editStyle?: string;
    platforms?: string[];
  },
): Promise<void> {
  const db = getDb();

  try {
    // Mark job as processing
    await db
      .from('video_jobs')
      .update({
        status: 'processing',
        processing_started_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    // Run the full master pipeline
    const pipelineResult = await runFullPipeline(config);

    // Mark job as completed with pipeline summary
    await db
      .from('video_jobs')
      .update({
        status: 'completed',
        processing_completed_at: new Date().toISOString(),
        error_message: pipelineResult.errors.length > 0
          ? pipelineResult.errors.join('; ')
          : null,
      })
      .eq('id', jobId);

    // Update associated script status if we have one
    if (pipelineResult.scriptId) {
      await db
        .from('video_scripts')
        .update({ status: 'review' })
        .eq('id', pipelineResult.scriptId);
    }

    console.log(
      `[api:studio/process] Job ${jobId} completed — ` +
      `${pipelineResult.totalContentPieces} pieces, ` +
      `${pipelineResult.scheduledPosts} posts scheduled, ` +
      `viral score: ${pipelineResult.viralScore}/100`,
    );
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
