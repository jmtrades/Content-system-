// ============================================================================
// GET  /api/revenue/events — List revenue events with filters
// POST /api/revenue/events — Manual revenue entry
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const createEventSchema = z.object({
  product_id: z.string().uuid(),
  amount: z.number().positive(),
  currency: z.string().length(3).default('USD'),
  type: z.enum([
    'one_time', 'recurring', 'affiliate_commission',
    'sponsorship', 'tip', 'ad_revenue', 'refund',
  ]),
  source_platform: z
    .enum(['tiktok', 'reels', 'youtube_shorts', 'linkedin', 'twitter'])
    .nullable()
    .default(null),
  source_post_id: z.string().nullable().default(null),
  customer_email: z.string().email(),
  stripe_payment_id: z.string().default(''),
  utm_source: z.string().nullable().default(null),
  utm_medium: z.string().nullable().default(null),
  utm_campaign: z.string().nullable().default(null),
});

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');
    const productId = searchParams.get('product_id');
    const sourcePlatform = searchParams.get('source_platform');
    const fromDate = searchParams.get('from');
    const toDate = searchParams.get('to');
    const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200);
    const offset = Number(searchParams.get('offset') ?? 0);

    const db = getDb();
    let query = db
      .from('revenue_events')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (type) query = query.eq('type', type);
    if (productId) query = query.eq('product_id', productId);
    if (sourcePlatform) query = query.eq('source_platform', sourcePlatform);
    if (fromDate) query = query.gte('created_at', fromDate);
    if (toDate) query = query.lte('created_at', toDate);

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 },
      );
    }

    // Calculate totals for the filtered results
    const totalAmount = (data ?? []).reduce(
      (sum, e) => sum + (e.type === 'refund' ? -(e.amount ?? 0) : (e.amount ?? 0)),
      0,
    );

    return NextResponse.json({
      success: true,
      data: {
        events: data ?? [],
        total: count ?? 0,
        total_amount: Math.round(totalAmount * 100) / 100,
        limit,
        offset,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api:revenue/events] GET error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST handler — manual revenue entry
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = createEventSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const db = getDb();

    // Verify product exists
    const { data: product, error: prodErr } = await db
      .from('products')
      .select('id, name')
      .eq('id', parsed.data.product_id)
      .single();

    if (prodErr || !product) {
      return NextResponse.json(
        { success: false, error: 'Product not found' },
        { status: 404 },
      );
    }

    const { data: event, error: insertErr } = await db
      .from('revenue_events')
      .insert(parsed.data)
      .select()
      .single();

    if (insertErr) {
      return NextResponse.json(
        { success: false, error: insertErr.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data: event }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api:revenue/events] POST error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
