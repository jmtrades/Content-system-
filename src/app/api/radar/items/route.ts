// ============================================================================
// GET /api/radar/items — List radar items with filters
// POST /api/radar/items — Create manual radar item
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const createItemSchema = z.object({
  source: z.string().default('manual'),
  source_url: z.string().url(),
  title: z.string().min(1).max(500),
  summary: z.string().max(2000).default(''),
  category: z.enum([
    'product_launch', 'research_paper', 'funding', 'open_source',
    'regulation', 'tutorial', 'opinion', 'industry_news', 'tool_update',
    'drama', 'breakthrough', 'hiring', 'acquisition',
  ]),
  importance_score: z.number().min(0).max(100).default(50),
  raw_data: z.record(z.string(), z.unknown()).default({}),
});

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const source = searchParams.get('source');
    const category = searchParams.get('category');
    const minImportance = searchParams.get('min_importance');
    const processed = searchParams.get('processed');
    const sortBy = searchParams.get('sort_by') ?? 'importance_score';
    const sortOrder = searchParams.get('sort_order') ?? 'desc';
    const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200);
    const offset = Number(searchParams.get('offset') ?? 0);

    const db = getDb();
    let query = db.from('radar_items').select('*', { count: 'exact' });

    if (source) query = query.eq('source', source);
    if (category) query = query.eq('category', category);
    if (minImportance) query = query.gte('importance_score', Number(minImportance));
    if (processed !== null && processed !== undefined && processed !== '') {
      query = query.eq('processed', processed === 'true');
    }

    const validSortFields = ['importance_score', 'created_at', 'trending_velocity'];
    const actualSortBy = validSortFields.includes(sortBy) ? sortBy : 'importance_score';
    query = query.order(actualSortBy, { ascending: sortOrder === 'asc' });
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
        items: data ?? [],
        total: count ?? 0,
        limit,
        offset,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api:radar/items] GET error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = createItemSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const db = getDb();

    // Check duplicate
    const { data: existing } = await db
      .from('radar_items')
      .select('id')
      .eq('source_url', parsed.data.source_url)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { success: false, error: 'Item with this source_url already exists' },
        { status: 409 },
      );
    }

    const { data, error } = await db
      .from('radar_items')
      .insert({
        ...parsed.data,
        trending_velocity: 0,
        processed: false,
        posted: false,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api:radar/items] POST error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
