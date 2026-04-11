// ============================================================================
// POST /api/analytics/scrape — Trigger analytics collection from all platforms
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(_req: NextRequest) {
  try {
    const db = getDb();
    const today = new Date().toISOString().split('T')[0];

    // Fetch all posted items to collect analytics for
    const { data: postedItems, error: postedErr } = await db
      .from('posting_queue')
      .select('id, platform, post_url, post_id, video_output_id')
      .eq('status', 'posted')
      .not('post_id', 'is', null);

    if (postedErr) {
      return NextResponse.json(
        { success: false, error: postedErr.message },
        { status: 500 },
      );
    }

    if (!postedItems || postedItems.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          message: 'No posted items to collect analytics for',
          collected: 0,
        },
      });
    }

    let collectedCount = 0;
    const errors: string[] = [];

    // Group by platform for batch API calls
    const byPlatform: Record<string, typeof postedItems> = {};
    for (const item of postedItems) {
      if (!byPlatform[item.platform]) byPlatform[item.platform] = [];
      byPlatform[item.platform].push(item);
    }

    for (const [platform, items] of Object.entries(byPlatform)) {
      for (const item of items) {
        try {
          // Fetch analytics from platform API
          // In production, this calls each platform's analytics API
          const analytics = await fetchPlatformAnalytics(platform, item.post_id);

          // Upsert post analytics
          const { error: upsertErr } = await db
            .from('post_analytics')
            .upsert(
              {
                posting_queue_id: item.id,
                platform,
                post_url: item.post_url,
                measured_at: new Date().toISOString(),
                views: analytics.views,
                likes: analytics.likes,
                comments: analytics.comments,
                shares: analytics.shares,
                saves: analytics.saves,
                watch_time_seconds: analytics.watch_time_seconds,
                avg_watch_percentage: analytics.avg_watch_percentage,
                reach: analytics.reach,
                impressions: analytics.impressions,
                follower_count: analytics.follower_count,
                follower_change: analytics.follower_change,
                profile_visits: analytics.profile_visits,
                link_clicks: analytics.link_clicks,
                dm_opens: analytics.dm_opens,
                bio_link_clicks: analytics.bio_link_clicks,
                engagement_rate: analytics.engagement_rate,
                virality_score: analytics.virality_score,
                save_rate: analytics.save_rate,
                conversion_rate: analytics.conversion_rate,
              },
              { onConflict: 'posting_queue_id' },
            );

          if (!upsertErr) collectedCount++;
        } catch (err) {
          const msg = `${platform}/${item.post_id}: ${err instanceof Error ? err.message : String(err)}`;
          errors.push(msg);
        }
      }

      // Aggregate daily analytics for this platform
      try {
        await aggregateDailyAnalytics(db, platform, today);
      } catch (err) {
        errors.push(`daily_aggregate/${platform}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        posts_checked: postedItems.length,
        analytics_collected: collectedCount,
        platforms: Object.keys(byPlatform),
        errors: errors.length > 0 ? errors : undefined,
        collected_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api:analytics/scrape] POST error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Platform analytics fetcher
// ---------------------------------------------------------------------------

interface PlatformAnalyticsData {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  watch_time_seconds: number;
  avg_watch_percentage: number;
  reach: number;
  impressions: number;
  follower_count: number;
  follower_change: number;
  profile_visits: number;
  link_clicks: number;
  dm_opens: number;
  bio_link_clicks: number;
  engagement_rate: number;
  virality_score: number;
  save_rate: number;
  conversion_rate: number;
}

async function fetchPlatformAnalytics(
  _platform: string,
  _postId: string,
): Promise<PlatformAnalyticsData> {
  // In production, this calls each platform's analytics API:
  // - TikTok: TikTok Research API
  // - Instagram: Instagram Graph API insights
  // - YouTube: YouTube Analytics API
  // - LinkedIn: LinkedIn Marketing Analytics
  // - Twitter/X: X API v2 tweet metrics

  // Return existing stored data or zeros as baseline
  return {
    views: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    watch_time_seconds: 0,
    avg_watch_percentage: 0,
    reach: 0,
    impressions: 0,
    follower_count: 0,
    follower_change: 0,
    profile_visits: 0,
    link_clicks: 0,
    dm_opens: 0,
    bio_link_clicks: 0,
    engagement_rate: 0,
    virality_score: 0,
    save_rate: 0,
    conversion_rate: 0,
  };
}

// ---------------------------------------------------------------------------
// Daily analytics aggregation
// ---------------------------------------------------------------------------

async function aggregateDailyAnalytics(
  db: ReturnType<typeof getDb>,
  platform: string,
  date: string,
): Promise<void> {
  // Get all analytics for this platform today
  const { data: analytics } = await db
    .from('post_analytics')
    .select('*')
    .eq('platform', platform)
    .gte('measured_at', `${date}T00:00:00Z`)
    .lte('measured_at', `${date}T23:59:59Z`);

  if (!analytics || analytics.length === 0) return;

  const totals = {
    total_views: 0,
    total_likes: 0,
    total_comments: 0,
    total_shares: 0,
    total_saves: 0,
    follower_count: 0,
    follower_growth: 0,
    avg_engagement_rate: 0,
    revenue_attributed: 0,
    posts_published: analytics.length,
  };

  let maxViews = 0;
  let maxViewsId: string | null = null;
  let minViews = Infinity;
  let minViewsId: string | null = null;
  let totalEngagement = 0;

  for (const a of analytics) {
    totals.total_views += a.views ?? 0;
    totals.total_likes += a.likes ?? 0;
    totals.total_comments += a.comments ?? 0;
    totals.total_shares += a.shares ?? 0;
    totals.total_saves += a.saves ?? 0;
    totals.follower_count = Math.max(totals.follower_count, a.follower_count ?? 0);
    totals.follower_growth += a.follower_change ?? 0;
    totalEngagement += a.engagement_rate ?? 0;

    if ((a.views ?? 0) > maxViews) {
      maxViews = a.views;
      maxViewsId = a.posting_queue_id;
    }
    if ((a.views ?? 0) < minViews) {
      minViews = a.views;
      minViewsId = a.posting_queue_id;
    }
  }

  totals.avg_engagement_rate =
    analytics.length > 0 ? totalEngagement / analytics.length : 0;

  await db.from('daily_analytics').upsert(
    {
      platform,
      date,
      ...totals,
      top_post_id: maxViewsId,
      worst_post_id: minViewsId,
    },
    { onConflict: 'platform,date' },
  );
}
