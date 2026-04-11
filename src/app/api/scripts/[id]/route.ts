// ============================================================================
// GET    /api/scripts/[id] — Get single script
// PUT    /api/scripts/[id] — Update script (full replace for editing)
// PATCH  /api/scripts/[id] — Update script status
// DELETE /api/scripts/[id] — Delete script
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const updateScriptSchema = z.object({
  topic: z.string().min(1).max(500).optional(),
  hook: z.string().min(1).optional(),
  hook_variants: z.array(z.string()).optional(),
  body: z.string().min(1).optional(),
  cta: z.string().optional(),
  cta_type: z.enum([
    'follow', 'comment', 'share', 'link_in_bio', 'dm_keyword',
    'product_link', 'newsletter', 'free_resource', 'paid_product',
    'affiliate', 'none',
  ]).optional(),
  caption: z.string().optional(),
  caption_variants: z.array(z.string()).optional(),
  hashtags: z.array(z.string()).optional(),
  estimated_duration: z.number().positive().optional(),
  content_pillar: z.enum([
    'ai_news', 'ai_tutorials', 'ai_tools', 'ai_opinions',
    'ai_money', 'ai_career', 'ai_drama',
  ]).optional(),
  monetization_hook: z.string().nullable().optional(),
  trending_sound_suggestion: z.string().nullable().optional(),
});

const patchStatusSchema = z.object({
  status: z.enum([
    'idea', 'scripted', 'recording', 'editing', 'rendering',
    'review', 'approved', 'scheduled', 'posted', 'archived',
  ]),
});

// ---------------------------------------------------------------------------
// Helper: extract ID from route params
// ---------------------------------------------------------------------------

function getIdFromParams(params: { id: string }): string {
  return params.id;
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const id = getIdFromParams(params);
    const db = getDb();

    const { data, error } = await db
      .from('video_scripts')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.code === 'PGRST116' ? 404 : 500 },
      );
    }

    if (!data) {
      return NextResponse.json(
        { success: false, error: 'Script not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api:scripts/[id]] GET error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// PUT handler — full update for editing
// ---------------------------------------------------------------------------

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const id = getIdFromParams(params);
    const body = await req.json();
    const parsed = updateScriptSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const db = getDb();

    // Verify exists
    const { data: existing } = await db
      .from('video_scripts')
      .select('id')
      .eq('id', id)
      .single();

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Script not found' },
        { status: 404 },
      );
    }

    const { data, error } = await db
      .from('video_scripts')
      .update(parsed.data)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api:scripts/[id]] PUT error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH handler — update status only
// ---------------------------------------------------------------------------

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const id = getIdFromParams(params);
    const body = await req.json();
    const parsed = patchStatusSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const db = getDb();

    const { data, error } = await db
      .from('video_scripts')
      .update({ status: parsed.data.status })
      .eq('id', id)
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
        { success: false, error: 'Script not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api:scripts/[id]] PATCH error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE handler
// ---------------------------------------------------------------------------

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const id = getIdFromParams(params);
    const db = getDb();

    const { data, error } = await db
      .from('video_scripts')
      .delete()
      .eq('id', id)
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
        { success: false, error: 'Script not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: { id, deleted: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api:scripts/[id]] DELETE error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
