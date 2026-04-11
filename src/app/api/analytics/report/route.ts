// ============================================================================
// GET /api/analytics/report — Generate analytics report by period
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const periodSchema = z.enum(['daily', 'weekly', 'monthly']);

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const periodParam = searchParams.get('period') ?? 'weekly';
    const platform = searchParams.get('platform');

    const periodParsed = periodSchema.safeParse(periodParam);
    if (!periodParsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid period. Must be one of: daily, weekly, monthly',
        },
        { status: 400 },
      );
    }

    const period = periodParsed.data;
    const db = getDb();

    // Calculate date range
    const now = new Date();
    const startDate = new Date(now);
    switch (period) {
      case 'daily':
        startDate.setDate(startDate.getDate() - 1);
        break;
      case 'weekly':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'monthly':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
    }
    const startDateStr = startDate.toISOString().split('T')[0];

    // Fetch daily analytics for the period
    let analyticsQuery = db
      .from('daily_analytics')
      .select('*')
      .gte('date', startDateStr)
      .order('date', { ascending: true });

    if (platform) analyticsQuery = analyticsQuery.eq('platform', platform);

    const { data: dailyData, error: dailyErr } = await analyticsQuery;

    if (dailyErr) {
      return NextResponse.json(
        { success: false, error: dailyErr.message },
        { status: 500 },
      );
    }

    const analytics = dailyData ?? [];

    // Aggregate totals
    const totals = {
      total_views: 0,
      total_likes: 0,
      total_comments: 0,
      total_shares: 0,
      total_saves: 0,
      total_posts_published: 0,
      avg_engagement_rate: 0,
      total_follower_growth: 0,
      total_revenue_attributed: 0,
    };

    const platformTotals: Record<string, typeof totals> = {};

    for (const day of analytics) {
      totals.total_views += day.total_views ?? 0;
      totals.total_likes += day.total_likes ?? 0;
      totals.total_comments += day.total_comments ?? 0;
      totals.total_shares += day.total_shares ?? 0;
      totals.total_saves += day.total_saves ?? 0;
      totals.total_posts_published += day.posts_published ?? 0;
      totals.total_follower_growth += day.follower_growth ?? 0;
      totals.total_revenue_attributed += day.revenue_attributed ?? 0;

      const p = day.platform;
      if (!platformTotals[p]) {
        platformTotals[p] = { ...totals };
        Object.keys(platformTotals[p]).forEach(
          (k) => ((platformTotals[p] as Record<string, number>)[k] = 0),
        );
      }
      platformTotals[p].total_views += day.total_views ?? 0;
      platformTotals[p].total_likes += day.total_likes ?? 0;
      platformTotals[p].total_comments += day.total_comments ?? 0;
      platformTotals[p].total_shares += day.total_shares ?? 0;
      platformTotals[p].total_saves += day.total_saves ?? 0;
      platformTotals[p].total_posts_published += day.posts_published ?? 0;
      platformTotals[p].total_follower_growth += day.follower_growth ?? 0;
      platformTotals[p].total_revenue_attributed += day.revenue_attributed ?? 0;
    }

    if (analytics.length > 0) {
      const engagementValues = analytics
        .map((a) => a.avg_engagement_rate ?? 0)
        .filter((v) => v > 0);
      totals.avg_engagement_rate =
        engagementValues.length > 0
          ? engagementValues.reduce((a, b) => a + b, 0) / engagementValues.length
          : 0;
    }

    // Fetch top performing posts
    let topPostsQuery = db
      .from('post_analytics')
      .select('*')
      .gte('measured_at', startDate.toISOString())
      .order('views', { ascending: false })
      .limit(10);

    if (platform) topPostsQuery = topPostsQuery.eq('platform', platform);

    const { data: topPosts } = await topPostsQuery;

    // Fetch growth velocity data
    let growthQuery = db
      .from('growth_velocity')
      .select('*')
      .gte('date', startDateStr)
      .order('date', { ascending: true });

    if (platform) growthQuery = growthQuery.eq('platform', platform);

    const { data: growthData } = await growthQuery;

    return NextResponse.json({
      success: true,
      data: {
        period,
        start_date: startDateStr,
        end_date: now.toISOString().split('T')[0],
        totals,
        by_platform: platformTotals,
        daily_breakdown: analytics,
        top_posts: topPosts ?? [],
        growth: growthData ?? [],
        generated_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api:analytics/report] GET error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
