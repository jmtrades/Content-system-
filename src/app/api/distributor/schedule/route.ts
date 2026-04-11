// ============================================================================
// POST /api/distributor/schedule — Schedule a post
// GET  /api/distributor/schedule — Get posting schedule
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const scheduleSchema = z.object({
  video_output_id: z.string().uuid(),
  platform: z.enum(['tiktok', 'reels', 'youtube_shorts', 'linkedin', 'twitter']),
  caption: z.string().min(1).max(5000),
  hashtags: z.array(z.string()).default([]),
  scheduled_at: z.string().datetime(),
});

// ---------------------------------------------------------------------------
// GET handler — view posting schedule
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const platform = searchParams.get('platform');
    const fromDate = searchParams.get('from');
    const toDate = searchParams.get('to');
    const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200);

    const db = getDb();
    let query = db
      .from('posting_queue')
      .select('*')
      .in('status', ['scheduled', 'draft'])
      .order('scheduled_at', { ascending: true })
      .limit(limit);

    if (platform) query = query.eq('platform', platform);
    if (fromDate) query = query.gte('scheduled_at', fromDate);
    if (toDate) query = query.lte('scheduled_at', toDate);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        schedule: data ?? [],
        count: (data ?? []).length,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api:distributor/schedule] GET error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST handler — schedule a post
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = scheduleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const db = getDb();

    // Verify video output exists and is ready
    const { data: output, error: outputErr } = await db
      .from('video_outputs')
      .select('id, status, platform')
      .eq('id', parsed.data.video_output_id)
      .single();

    if (outputErr || !output) {
      return NextResponse.json(
        { success: false, error: 'Video output not found' },
        { status: 404 },
      );
    }

    if (output.status !== 'ready') {
      return NextResponse.json(
        { success: false, error: `Video output is not ready (current status: ${output.status})` },
        { status: 400 },
      );
    }

    // Verify the scheduled time is in the future
    const scheduledAt = new Date(parsed.data.scheduled_at);
    if (scheduledAt <= new Date()) {
      return NextResponse.json(
        { success: false, error: 'Scheduled time must be in the future' },
        { status: 400 },
      );
    }

    // Create queue item
    const { data: queueItem, error: queueErr } = await db
      .from('posting_queue')
      .insert({
        video_output_id: parsed.data.video_output_id,
        platform: parsed.data.platform,
        caption: parsed.data.caption,
        hashtags: parsed.data.hashtags,
        scheduled_at: parsed.data.scheduled_at,
        status: 'scheduled',
        retry_count: 0,
      })
      .select()
      .single();

    if (queueErr) {
      return NextResponse.json(
        { success: false, error: queueErr.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data: queueItem }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api:distributor/schedule] POST error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
