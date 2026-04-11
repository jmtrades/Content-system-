// ============================================================================
// GET   /api/community/dms — List DM conversations
// PATCH /api/community/dms — Update DM status/notes
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const updateDMSchema = z.object({
  dm_id: z.string().uuid(),
  status: z.enum(['open', 'replied', 'closed', 'escalated', 'spam']).optional(),
  notes: z.string().max(5000).optional(),
  is_potential_customer: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const platform = searchParams.get('platform');
    const status = searchParams.get('status');
    const isPotentialCustomer = searchParams.get('is_potential_customer');
    const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200);
    const offset = Number(searchParams.get('offset') ?? 0);

    const db = getDb();
    let query = db
      .from('dm_conversations')
      .select('*', { count: 'exact' })
      .order('last_message_at', { ascending: false });

    if (platform) query = query.eq('platform', platform);
    if (status) query = query.eq('status', status);
    if (isPotentialCustomer !== null && isPotentialCustomer !== undefined && isPotentialCustomer !== '') {
      query = query.eq('is_potential_customer', isPotentialCustomer === 'true');
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 },
      );
    }

    // Status breakdown
    const statusBreakdown: Record<string, number> = {};
    for (const dm of data ?? []) {
      const s = dm.status ?? 'open';
      statusBreakdown[s] = (statusBreakdown[s] ?? 0) + 1;
    }

    return NextResponse.json({
      success: true,
      data: {
        conversations: data ?? [],
        total: count ?? 0,
        status_breakdown: statusBreakdown,
        limit,
        offset,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api:community/dms] GET error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH handler — update DM status/notes
// ---------------------------------------------------------------------------

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = updateDMSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { dm_id, ...updates } = parsed.data;

    // Build update payload
    const updatePayload: Record<string, unknown> = {};
    if (updates.status !== undefined) updatePayload.status = updates.status;
    if (updates.notes !== undefined) updatePayload.notes = updates.notes;
    if (updates.is_potential_customer !== undefined) {
      updatePayload.is_potential_customer = updates.is_potential_customer;
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No fields to update' },
        { status: 400 },
      );
    }

    const db = getDb();

    const { data, error } = await db
      .from('dm_conversations')
      .update(updatePayload)
      .eq('id', dm_id)
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
        { success: false, error: 'DM conversation not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api:community/dms] PATCH error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
