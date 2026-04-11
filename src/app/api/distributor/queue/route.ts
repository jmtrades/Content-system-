// ============================================================================
// GET /api/distributor/queue — View posting queue with filters
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const platform = searchParams.get('platform');
    const fromDate = searchParams.get('from');
    const toDate = searchParams.get('to');
    const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200);
    const offset = Number(searchParams.get('offset') ?? 0);

    const db = getDb();

    // Build query
    let query = db
      .from('posting_queue')
      .select('*', { count: 'exact' })
      .order('scheduled_at', { ascending: true });

    if (status) query = query.eq('status', status);
    if (platform) query = query.eq('platform', platform);
    if (fromDate) query = query.gte('scheduled_at', fromDate);
    if (toDate) query = query.lte('scheduled_at', toDate);

    query = query.range(offset, offset + limit - 1);

    const { data: queueItems, error: queueErr, count } = await query;

    if (queueErr) {
      return NextResponse.json(
        { success: false, error: queueErr.message },
        { status: 500 },
      );
    }

    // Fetch related video output info
    const outputIds = (queueItems ?? [])
      .map((item) => item.video_output_id)
      .filter(Boolean);

    let outputs: Record<string, unknown>[] = [];
    if (outputIds.length > 0) {
      const { data: outputData } = await db
        .from('video_outputs')
        .select('id, job_id, platform, output_path, thumbnail_path, duration_seconds, status')
        .in('id', outputIds);

      outputs = outputData ?? [];
    }

    // Create a lookup map
    const outputMap: Record<string, Record<string, unknown>> = {};
    for (const output of outputs) {
      outputMap[output.id as string] = output;
    }

    // Enrich queue items with video output data
    const enrichedItems = (queueItems ?? []).map((item) => ({
      ...item,
      video_output: outputMap[item.video_output_id] ?? null,
    }));

    return NextResponse.json({
      success: true,
      data: {
        queue: enrichedItems,
        total: count ?? 0,
        limit,
        offset,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api:distributor/queue] GET error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
