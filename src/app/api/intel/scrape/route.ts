// ============================================================================
// POST /api/intel/scrape — Trigger competitor scraping
// GET  /api/intel/scrape — Get latest competitor data
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { logger } from '@/scrapers/utils';

// ---------------------------------------------------------------------------
// GET handler — latest competitor data
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const handle = searchParams.get('handle');
    const platform = searchParams.get('platform');
    const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200);

    const db = getDb();

    // Fetch latest competitor posts
    let postsQuery = db
      .from('competitor_posts')
      .select('*')
      .order('scraped_at', { ascending: false })
      .limit(limit);

    if (handle) postsQuery = postsQuery.eq('competitor_handle', handle);
    if (platform) postsQuery = postsQuery.eq('platform', platform);

    // Fetch latest competitor analytics
    let analyticsQuery = db
      .from('competitor_analytics')
      .select('*')
      .order('date', { ascending: false })
      .limit(50);

    if (handle) analyticsQuery = analyticsQuery.eq('competitor_handle', handle);
    if (platform) analyticsQuery = analyticsQuery.eq('platform', platform);

    const [postsResult, analyticsResult] = await Promise.all([postsQuery, analyticsQuery]);

    if (postsResult.error) {
      return NextResponse.json(
        { success: false, error: postsResult.error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        posts: postsResult.data ?? [],
        analytics: analyticsResult.data ?? [],
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api:intel/scrape] GET error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST handler — trigger competitor scraping
// ---------------------------------------------------------------------------

export async function POST(_req: NextRequest) {
  try {
    const db = getDb();

    // Load competitors from config/database
    const { data: competitors, error: compError } = await db
      .from('competitors')
      .select('*')
      .eq('active', true);

    if (compError) {
      return NextResponse.json(
        { success: false, error: compError.message },
        { status: 500 },
      );
    }

    if (!competitors || competitors.length === 0) {
      return NextResponse.json({
        success: true,
        data: { message: 'No active competitors configured', scraped: 0 },
      });
    }

    let totalScraped = 0;
    const errors: string[] = [];

    for (const competitor of competitors) {
      try {
        // For each competitor platform, scrape public data
        for (const platform of competitor.platforms ?? []) {
          try {
            // Scrape publicly available data via platform-specific logic
            const profileData = await scrapeCompetitorProfile(
              competitor.handle,
              platform,
            );

            if (profileData) {
              // Store analytics snapshot
              await db.from('competitor_analytics').upsert(
                {
                  competitor_handle: competitor.handle,
                  platform,
                  date: new Date().toISOString().split('T')[0],
                  follower_count: profileData.follower_count ?? 0,
                  follower_growth: profileData.follower_growth ?? 0,
                  avg_engagement_rate: profileData.avg_engagement_rate ?? 0,
                  top_post_url: profileData.top_post_url ?? '',
                  top_post_views: profileData.top_post_views ?? 0,
                  posting_frequency: profileData.posting_frequency ?? 0,
                },
                { onConflict: 'competitor_handle,platform,date' },
              );

              // Store recent posts
              for (const post of profileData.recent_posts ?? []) {
                const { error: postError } = await db
                  .from('competitor_posts')
                  .upsert(
                    {
                      competitor_handle: competitor.handle,
                      platform,
                      post_url: post.url,
                      post_type: post.type ?? 'short_video',
                      caption: post.caption ?? '',
                      hashtags: post.hashtags ?? [],
                      posted_at: post.posted_at ?? new Date().toISOString(),
                      views: post.views ?? 0,
                      likes: post.likes ?? 0,
                      comments: post.comments ?? 0,
                      shares: post.shares ?? 0,
                      engagement_rate: post.engagement_rate ?? 0,
                      topic_category: post.topic_category ?? 'unknown',
                      hook_text: post.hook_text ?? '',
                      cta_type: post.cta_type ?? 'none',
                      monetization_detected: post.monetization_detected ?? false,
                      product_mentioned: post.product_mentioned ?? null,
                      scraped_at: new Date().toISOString(),
                      raw_data: post.raw_data ?? {},
                    },
                    { onConflict: 'post_url' },
                  );

                if (!postError) totalScraped++;
              }
            }
          } catch (platErr) {
            const msg = `${competitor.handle}/${platform}: ${platErr instanceof Error ? platErr.message : String(platErr)}`;
            logger.error('intel', msg);
            errors.push(msg);
          }
        }
      } catch (compErr) {
        const msg = `${competitor.handle}: ${compErr instanceof Error ? compErr.message : String(compErr)}`;
        logger.error('intel', msg);
        errors.push(msg);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        competitors_checked: competitors.length,
        posts_scraped: totalScraped,
        errors: errors.length > 0 ? errors : undefined,
        scraped_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api:intel/scrape] POST error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Competitor Profile Scraper (public data only)
// ---------------------------------------------------------------------------

interface CompetitorProfileData {
  follower_count: number;
  follower_growth: number;
  avg_engagement_rate: number;
  top_post_url: string;
  top_post_views: number;
  posting_frequency: number;
  recent_posts: Array<{
    url: string;
    type: string;
    caption: string;
    hashtags: string[];
    posted_at: string;
    views: number;
    likes: number;
    comments: number;
    shares: number;
    engagement_rate: number;
    topic_category: string;
    hook_text: string;
    cta_type: string;
    monetization_detected: boolean;
    product_mentioned: string | null;
    raw_data: Record<string, unknown>;
  }>;
}

async function scrapeCompetitorProfile(
  handle: string,
  platform: string,
): Promise<CompetitorProfileData | null> {
  // Platform-specific scraping logic
  // In production, this would use puppeteer or platform APIs
  // For now, returns data from any existing cached/stored records
  const db = getDb();

  const { data: existingPosts } = await db
    .from('competitor_posts')
    .select('*')
    .eq('competitor_handle', handle)
    .eq('platform', platform)
    .order('scraped_at', { ascending: false })
    .limit(10);

  const { data: analytics } = await db
    .from('competitor_analytics')
    .select('*')
    .eq('competitor_handle', handle)
    .eq('platform', platform)
    .order('date', { ascending: false })
    .limit(1)
    .single();

  return {
    follower_count: analytics?.follower_count ?? 0,
    follower_growth: analytics?.follower_growth ?? 0,
    avg_engagement_rate: analytics?.avg_engagement_rate ?? 0,
    top_post_url: analytics?.top_post_url ?? '',
    top_post_views: analytics?.top_post_views ?? 0,
    posting_frequency: analytics?.posting_frequency ?? 0,
    recent_posts: (existingPosts ?? []).map((p) => ({
      url: p.post_url,
      type: p.post_type,
      caption: p.caption,
      hashtags: p.hashtags,
      posted_at: p.posted_at,
      views: p.views,
      likes: p.likes,
      comments: p.comments,
      shares: p.shares,
      engagement_rate: p.engagement_rate,
      topic_category: p.topic_category,
      hook_text: p.hook_text,
      cta_type: p.cta_type,
      monetization_detected: p.monetization_detected,
      product_mentioned: p.product_mentioned,
      raw_data: p.raw_data ?? {},
    })),
  };
}
