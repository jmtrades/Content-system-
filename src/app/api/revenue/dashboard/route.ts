// ============================================================================
// GET /api/revenue/dashboard — Full revenue dashboard data
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(_req: NextRequest) {
  try {
    const db = getDb();
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // Date boundaries
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    const startOfWeekStr = startOfWeek.toISOString().split('T')[0];

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfMonthStr = startOfMonth.toISOString().split('T')[0];

    // Fetch all revenue events
    const { data: allEvents, error: eventsErr } = await db
      .from('revenue_events')
      .select('*')
      .order('created_at', { ascending: false });

    if (eventsErr) {
      return NextResponse.json(
        { success: false, error: eventsErr.message },
        { status: 500 },
      );
    }

    const events = allEvents ?? [];

    // Helper to sum amounts (refunds are negative)
    const sumEvents = (filtered: typeof events): number =>
      filtered.reduce(
        (sum, e) => sum + (e.type === 'refund' ? -(e.amount ?? 0) : (e.amount ?? 0)),
        0,
      );

    // Time-based totals
    const todayEvents = events.filter(
      (e) => (e.created_at ?? '').split('T')[0] === todayStr,
    );
    const weekEvents = events.filter(
      (e) => (e.created_at ?? '') >= `${startOfWeekStr}T00:00:00`,
    );
    const monthEvents = events.filter(
      (e) => (e.created_at ?? '') >= `${startOfMonthStr}T00:00:00`,
    );

    // Revenue by product
    const byProduct: Record<string, { product_id: string; total: number; count: number }> = {};
    for (const e of events) {
      const pid = e.product_id;
      if (!byProduct[pid]) byProduct[pid] = { product_id: pid, total: 0, count: 0 };
      byProduct[pid].total += e.type === 'refund' ? -(e.amount ?? 0) : (e.amount ?? 0);
      byProduct[pid].count++;
    }

    // Revenue by platform
    const byPlatform: Record<string, { platform: string; total: number; count: number }> = {};
    for (const e of events) {
      const p = e.source_platform ?? 'unknown';
      if (!byPlatform[p]) byPlatform[p] = { platform: p, total: 0, count: 0 };
      byPlatform[p].total += e.type === 'refund' ? -(e.amount ?? 0) : (e.amount ?? 0);
      byPlatform[p].count++;
    }

    // MRR calculation (sum of recurring events this month)
    const recurringThisMonth = monthEvents.filter(
      (e) => e.type === 'recurring',
    );
    const mrr = sumEvents(recurringThisMonth);

    // Fetch revenue targets
    const { data: targets } = await db
      .from('revenue_targets')
      .select('*')
      .order('start_date', { ascending: false });

    // Fetch products for enrichment
    const { data: products } = await db.from('products').select('id, name, type, price');

    const productMap: Record<string, Record<string, unknown>> = {};
    for (const p of products ?? []) {
      productMap[p.id] = p;
    }

    // Enrich byProduct with product names
    const byProductArray = Object.values(byProduct).map((bp) => ({
      ...bp,
      product: productMap[bp.product_id] ?? null,
      total: Math.round(bp.total * 100) / 100,
    }));

    // Fetch affiliate link performance
    const { data: affiliates } = await db
      .from('affiliate_links')
      .select('*')
      .eq('active', true)
      .order('revenue_earned', { ascending: false });

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          today: Math.round(sumEvents(todayEvents) * 100) / 100,
          this_week: Math.round(sumEvents(weekEvents) * 100) / 100,
          this_month: Math.round(sumEvents(monthEvents) * 100) / 100,
          all_time: Math.round(sumEvents(events) * 100) / 100,
          mrr: Math.round(mrr * 100) / 100,
          total_transactions: events.length,
        },
        by_product: byProductArray,
        by_platform: Object.values(byPlatform).map((bp) => ({
          ...bp,
          total: Math.round(bp.total * 100) / 100,
        })),
        targets: targets ?? [],
        affiliates: affiliates ?? [],
        recent_events: events.slice(0, 20),
        generated_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api:revenue/dashboard] GET error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
