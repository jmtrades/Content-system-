// ============================================================================
// GET  /api/intel/gaps — List detected content gaps
// POST /api/intel/gaps — Mark a gap as actioned
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const actionGapSchema = z.object({
  id: z.string().uuid(),
  actioned: z.boolean().default(true),
  notes: z.string().max(2000).optional(),
});

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const gapType = searchParams.get('gap_type');
    const actioned = searchParams.get('actioned');
    const minScore = searchParams.get('min_score');
    const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200);
    const offset = Number(searchParams.get('offset') ?? 0);

    const db = getDb();
    let query = db
      .from('competitor_gaps')
      .select('*', { count: 'exact' })
      .order('opportunity_score', { ascending: false });

    if (gapType) query = query.eq('gap_type', gapType);
    if (actioned !== null && actioned !== undefined && actioned !== '') {
      query = query.eq('actioned', actioned === 'true');
    }
    if (minScore) query = query.gte('opportunity_score', Number(minScore));

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        gaps: data ?? [],
        total: count ?? 0,
        limit,
        offset,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api:intel/gaps] GET error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST handler — mark gap as actioned
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = actionGapSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const db = getDb();
    const updatePayload: Record<string, unknown> = {
      actioned: parsed.data.actioned,
    };
    if (parsed.data.notes !== undefined) {
      updatePayload.notes = parsed.data.notes;
    }

    const { data, error } = await db
      .from('competitor_gaps')
      .update(updatePayload)
      .eq('id', parsed.data.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 },
      );
    }

    if (!data) {
      return NextResponse.json(
        { success: false, error: 'Gap not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api:intel/gaps] POST error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
