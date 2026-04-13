// ============================================================================
// POST /api/studio/process — Run the FULL content pipeline on a video
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { runFullPipeline, getPipelineStatus } from '@/engines/master-pipeline';

// ---------------------------------------------------------------------------
// POST handler — starts the master pipeline
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      input_path,
      script_id: _scriptId,
      script_text,
      hook_text,
      key_points,
      style,
      platforms,
    } = body;

    if (!input_path) {
      return NextResponse.json(
        { success: false, error: 'input_path is required' },
        { status: 400 },
      );
    }

    // Run the full master pipeline asynchronously
    // (returns immediately, pipeline runs in background)
    const pipelinePromise = runFullPipeline({
      videoPath: input_path,
      scriptText: script_text,
      hookText: hook_text,
      keyPoints: key_points,
      editStyle: style || 'hormozi',
      platforms: platforms || ['tiktok', 'reels', 'youtube_shorts', 'linkedin', 'twitter'],
    });

    // Wait up to 5 seconds for initial steps, then return
    const result = await Promise.race([
      pipelinePromise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
    ]);

    if (result) {
      // Pipeline completed within 5 seconds (unlikely for full pipeline)
      return NextResponse.json({
        success: true,
        data: {
          status: 'completed',
          script_id: result.scriptId,
          total_pieces: result.totalContentPieces,
          scheduled_posts: result.scheduledPosts,
          viral_score: result.viralScore,
          flywheel_posts: result.flywheelSequenced,
          errors: result.errors,
          timings: result.timings,
        },
      }, { status: 200 });
    }

    // Pipeline still running — return immediately with status
    const status = getPipelineStatus();
    return NextResponse.json({
      success: true,
      data: {
        status: 'processing',
        current_step: status.currentStep,
        progress: status.progress,
        message: 'Pipeline started — processing video through all engines',
      },
    }, { status: 202 });
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
// GET handler — check pipeline status
// ---------------------------------------------------------------------------

export async function GET() {
  const status = getPipelineStatus();
  return NextResponse.json({
    success: true,
    data: status,
  });
}
