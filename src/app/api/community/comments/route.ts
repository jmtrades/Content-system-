// ============================================================================
// GET   /api/community/comments — List comments with filters
// POST  /api/community/comments — Submit response to a comment
// PATCH /api/community/comments — Update comment classification
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const respondSchema = z.object({
  comment_id: z.string().uuid(),
  response_text: z.string().min(1).max(5000),
});

const classifySchema = z.object({
  comment_id: z.string().uuid(),
  sentiment: z.enum(['positive', 'negative', 'neutral', 'question', 'complaint']).optional(),
  requires_response: z.boolean().optional(),
  is_potential_customer: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const platform = searchParams.get('platform');
    const sentiment = searchParams.get('sentiment');
    const responded = searchParams.get('responded');
    const requiresResponse = searchParams.get('requires_response');
    const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200);
    const offset = Number(searchParams.get('offset') ?? 0);

    const db = getDb();
    let query = db
      .from('comments')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (platform) query = query.eq('platform', platform);
    if (sentiment) query = query.eq('sentiment', sentiment);
    if (responded !== null && responded !== undefined && responded !== '') {
      query = query.eq('responded', responded === 'true');
    }
    if (requiresResponse !== null && requiresResponse !== undefined && requiresResponse !== '') {
      query = query.eq('requires_response', requiresResponse === 'true');
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 },
      );
    }

    // Calculate sentiment breakdown
    const sentimentBreakdown: Record<string, number> = {};
    for (const comment of data ?? []) {
      const s = comment.sentiment ?? 'neutral';
      sentimentBreakdown[s] = (sentimentBreakdown[s] ?? 0) + 1;
    }

    return NextResponse.json({
      success: true,
      data: {
        comments: data ?? [],
        total: count ?? 0,
        sentiment_breakdown: sentimentBreakdown,
        limit,
        offset,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api:community/comments] GET error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST handler — submit response to a comment
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = respondSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const db = getDb();

    // Verify comment exists
    const { data: comment, error: findErr } = await db
      .from('comments')
      .select('id, platform, post_id, responded')
      .eq('id', parsed.data.comment_id)
      .single();

    if (findErr || !comment) {
      return NextResponse.json(
        { success: false, error: 'Comment not found' },
        { status: 404 },
      );
    }

    // Update comment with response
    const { data: updated, error: updateErr } = await db
      .from('comments')
      .update({
        response_text: parsed.data.response_text,
        responded: true,
        responded_at: new Date().toISOString(),
      })
      .eq('id', parsed.data.comment_id)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json(
        { success: false, error: updateErr.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api:community/comments] POST error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH handler — update comment classification
// ---------------------------------------------------------------------------

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = classifySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { comment_id, ...updates } = parsed.data;

    // Build update payload with only provided fields
    const updatePayload: Record<string, unknown> = {};
    if (updates.sentiment !== undefined) updatePayload.sentiment = updates.sentiment;
    if (updates.requires_response !== undefined) updatePayload.requires_response = updates.requires_response;
    if (updates.is_potential_customer !== undefined) updatePayload.is_potential_customer = updates.is_potential_customer;

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No fields to update' },
        { status: 400 },
      );
    }

    const db = getDb();

    const { data, error } = await db
      .from('comments')
      .update(updatePayload)
      .eq('id', comment_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.code === 'PGRST116' ? 404 : 500 },
      );
    }

    if (!data) {
      return NextResponse.json(
        { success: false, error: 'Comment not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api:community/comments] PATCH error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
