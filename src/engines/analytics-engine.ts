// ============================================================================
// Analytics Engine — Scrape, aggregate, and analyze content performance
// ============================================================================

import { getDb } from '@/lib/db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlatformMetrics {
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

interface HookPerformanceRow {
  hook: string;
  post_count: number;
  avg_retention: number;
  avg_engagement: number;
  total_views: number;
}

interface TopicPerformanceRow {
  content_pillar: string;
  post_count: number;
  avg_engagement: number;
  avg_views: number;
  total_follower_growth: number;
  avg_virality: number;
}

interface TimeSlotPerformanceRow {
  platform: string;
  day_of_week: number;
  hour: number;
  avg_engagement: number;
  avg_views: number;
  post_count: number;
}

interface FormatPerformanceRow {
  caption_style: string;
  color_grade: string;
  text_position: string;
  post_count: number;
  avg_engagement: number;
  avg_views: number;
  avg_retention: number;
}

interface RevenueAttributionRow {
  content_pillar: string;
  topic: string;
  total_revenue: number;
  event_count: number;
}

interface AnalyticsSummary {
  period: string;
  total_views: number;
  total_likes: number;
  total_comments: number;
  total_shares: number;
  total_saves: number;
  avg_engagement_rate: number;
  total_follower_growth: number;
  posts_published: number;
  platform_breakdown: {
    platform: string;
    views: number;
    engagement_rate: number;
    follower_growth: number;
    posts: number;
  }[];
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(message: string): void {
  console.log(`[analytics-engine] ${message}`);
}

function logError(message: string, err?: unknown): void {
  const detail = err instanceof Error ? err.message : String(err ?? '');
  console.error(`[analytics-engine] ERROR: ${message}${detail ? ` — ${detail}` : ''}`);
}

// ---------------------------------------------------------------------------
// fetchPlatformMetrics — Placeholder for real platform API calls
// ---------------------------------------------------------------------------

export async function fetchPlatformMetrics(
  platform: string,
  postId: string,
): Promise<PlatformMetrics> {
  // In production this would call each platform's analytics API:
  //   TikTok:        TikTok Research API — video insights
  //   Instagram:     Graph API — media insights
  //   YouTube:       YouTube Analytics API — video metrics
  //   LinkedIn:      Marketing Analytics API — share stats
  //   Twitter/X:     X API v2 — tweet metrics
  //
  // For now, return a zero-filled structure that matches the post_analytics
  // schema so that the data pipeline is wired correctly.

  log(`Fetching metrics for ${platform}/${postId} (placeholder)`);

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
// scrapeAnalytics — Pull metrics for all posted content
// ---------------------------------------------------------------------------

export async function scrapeAnalytics(): Promise<{
  posts_checked: number;
  analytics_collected: number;
  errors: string[];
}> {
  const db = getDb();

  log('Starting analytics scrape for all posted content');

  // Fetch all posted items that have a post_id (i.e. were actually published)
  const { data: postedItems, error: fetchErr } = await db
    .from('posting_queue')
    .select('id, platform, post_url, post_id, video_output_id, posted_at')
    .eq('status', 'posted')
    .not('post_id', 'is', null)
    .order('posted_at', { ascending: false })
    .limit(200);

  if (fetchErr) {
    throw new Error(`Failed to fetch posted items: ${fetchErr.message}`);
  }

  if (!postedItems || postedItems.length === 0) {
    log('No posted items to collect analytics for');
    return { posts_checked: 0, analytics_collected: 0, errors: [] };
  }

  log(`Checking analytics for ${postedItems.length} posted item(s)`);

  let collected = 0;
  const errors: string[] = [];

  for (const item of postedItems) {
    try {
      const metrics = await fetchPlatformMetrics(item.platform, item.post_id);

      const { error: upsertErr } = await db
        .from('post_analytics')
        .upsert(
          {
            posting_queue_id: item.id,
            platform: item.platform,
            post_url: item.post_url,
            measured_at: new Date().toISOString(),
            views: metrics.views,
            likes: metrics.likes,
            comments: metrics.comments,
            shares: metrics.shares,
            saves: metrics.saves,
            watch_time_seconds: metrics.watch_time_seconds,
            avg_watch_percentage: metrics.avg_watch_percentage,
            reach: metrics.reach,
            impressions: metrics.impressions,
            follower_count: metrics.follower_count,
            follower_change: metrics.follower_change,
            profile_visits: metrics.profile_visits,
            link_clicks: metrics.link_clicks,
            dm_opens: metrics.dm_opens,
            bio_link_clicks: metrics.bio_link_clicks,
            engagement_rate: metrics.engagement_rate,
            virality_score: metrics.virality_score,
            save_rate: metrics.save_rate,
            conversion_rate: metrics.conversion_rate,
          },
          { onConflict: 'posting_queue_id' },
        );

      if (upsertErr) {
        errors.push(`${item.platform}/${item.post_id}: ${upsertErr.message}`);
      } else {
        collected++;
      }
    } catch (err) {
      const msg = `${item.platform}/${item.post_id}: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      logError(`Failed to scrape analytics for ${item.id}`, err);
    }
  }

  log(`Analytics scrape complete: ${collected}/${postedItems.length} collected, ${errors.length} error(s)`);
  return { posts_checked: postedItems.length, analytics_collected: collected, errors };
}

// ---------------------------------------------------------------------------
// dailyRollup — Aggregate post_analytics into daily_analytics
// ---------------------------------------------------------------------------

export async function dailyRollup(dateOverride?: string): Promise<{
  platforms_processed: number;
  records_upserted: number;
}> {
  const db = getDb();
  const targetDate = dateOverride ?? new Date().toISOString().split('T')[0];
  const platforms = ['tiktok', 'reels', 'youtube_shorts', 'linkedin', 'twitter'];

  log(`Running daily rollup for ${targetDate}`);

  let recordsUpserted = 0;
  let platformsProcessed = 0;

  for (const platform of platforms) {
    const { data: analytics, error: fetchErr } = await db
      .from('post_analytics')
      .select('posting_queue_id, views, likes, comments, shares, saves, follower_count, follower_change, engagement_rate')
      .eq('platform', platform)
      .gte('measured_at', `${targetDate}T00:00:00Z`)
      .lte('measured_at', `${targetDate}T23:59:59Z`);

    if (fetchErr) {
      logError(`Failed to fetch analytics for ${platform} on ${targetDate}`, fetchErr);
      continue;
    }

    if (!analytics || analytics.length === 0) continue;

    let totalViews = 0;
    let totalLikes = 0;
    let totalComments = 0;
    let totalShares = 0;
    let totalSaves = 0;
    let maxFollowerCount = 0;
    let totalFollowerGrowth = 0;
    let totalEngagement = 0;

    let maxViews = -1;
    let maxViewsId: string | null = null;
    let minViews = Infinity;
    let minViewsId: string | null = null;

    for (const a of analytics) {
      const views = a.views ?? 0;
      totalViews += views;
      totalLikes += a.likes ?? 0;
      totalComments += a.comments ?? 0;
      totalShares += a.shares ?? 0;
      totalSaves += a.saves ?? 0;
      maxFollowerCount = Math.max(maxFollowerCount, a.follower_count ?? 0);
      totalFollowerGrowth += a.follower_change ?? 0;
      totalEngagement += a.engagement_rate ?? 0;

      if (views > maxViews) {
        maxViews = views;
        maxViewsId = a.posting_queue_id;
      }
      if (views < minViews) {
        minViews = views;
        minViewsId = a.posting_queue_id;
      }
    }

    const avgEngagement = analytics.length > 0 ? totalEngagement / analytics.length : 0;

    // Fetch revenue attributed to this platform today
    const { data: revenueData } = await db
      .from('revenue_events')
      .select('amount, type')
      .eq('source_platform', platform)
      .gte('created_at', `${targetDate}T00:00:00Z`)
      .lte('created_at', `${targetDate}T23:59:59Z`);

    const revenueAttributed = (revenueData ?? []).reduce(
      (sum, e) => sum + (e.type === 'refund' ? -(e.amount ?? 0) : (e.amount ?? 0)),
      0,
    );

    const { error: upsertErr } = await db
      .from('daily_analytics')
      .upsert(
        {
          platform,
          date: targetDate,
          total_views: totalViews,
          total_likes: totalLikes,
          total_comments: totalComments,
          total_shares: totalShares,
          total_saves: totalSaves,
          follower_count: maxFollowerCount,
          follower_growth: totalFollowerGrowth,
          top_post_id: maxViewsId,
          worst_post_id: minViewsId,
          avg_engagement_rate: Math.round(avgEngagement * 10000) / 10000,
          revenue_attributed: Math.round(revenueAttributed * 100) / 100,
          posts_published: analytics.length,
        },
        { onConflict: 'platform,date' },
      );

    if (upsertErr) {
      logError(`Failed to upsert daily analytics for ${platform}/${targetDate}`, upsertErr);
    } else {
      recordsUpserted++;
      platformsProcessed++;
    }
  }

  log(`Daily rollup complete: ${platformsProcessed} platforms, ${recordsUpserted} records upserted`);
  return { platforms_processed: platformsProcessed, records_upserted: recordsUpserted };
}

// ---------------------------------------------------------------------------
// analyzeHookPerformance — Which hooks drive the best retention/engagement
// ---------------------------------------------------------------------------

export async function analyzeHookPerformance(): Promise<HookPerformanceRow[]> {
  const db = getDb();

  log('Analyzing hook performance');

  // Join: video_scripts → video_jobs → video_outputs → posting_queue → post_analytics
  // We do this in steps since Supabase JS doesn't support arbitrary multi-table JOINs.

  // Step 1: Get all scripts with hooks
  const { data: scripts, error: scriptsErr } = await db
    .from('video_scripts')
    .select('id, hook')
    .not('hook', 'is', null);

  if (scriptsErr || !scripts || scripts.length === 0) {
    log('No scripts found for hook analysis');
    return [];
  }

  const scriptMap: Record<string, string> = {};
  for (const s of scripts) {
    scriptMap[s.id] = s.hook;
  }

  // Step 2: Get video jobs to map script_id → job_id
  const { data: jobs } = await db
    .from('video_jobs')
    .select('id, script_id')
    .in('script_id', Object.keys(scriptMap));

  if (!jobs || jobs.length === 0) return [];

  const jobToScript: Record<string, string> = {};
  for (const j of jobs) {
    if (j.script_id) jobToScript[j.id] = j.script_id;
  }

  // Step 3: Get video outputs → posting_queue linkage
  const { data: outputs } = await db
    .from('video_outputs')
    .select('id, job_id')
    .in('job_id', Object.keys(jobToScript));

  if (!outputs || outputs.length === 0) return [];

  const outputToJob: Record<string, string> = {};
  for (const o of outputs) {
    outputToJob[o.id] = o.job_id;
  }

  // Step 4: Get posting queue items
  const { data: queueItems } = await db
    .from('posting_queue')
    .select('id, video_output_id')
    .eq('status', 'posted')
    .in('video_output_id', Object.keys(outputToJob));

  if (!queueItems || queueItems.length === 0) return [];

  const queueToOutput: Record<string, string> = {};
  for (const q of queueItems) {
    queueToOutput[q.id] = q.video_output_id;
  }

  // Step 5: Get post analytics for those queue items
  const { data: analytics } = await db
    .from('post_analytics')
    .select('posting_queue_id, avg_watch_percentage, engagement_rate, views')
    .in('posting_queue_id', Object.keys(queueToOutput));

  if (!analytics || analytics.length === 0) return [];

  // Step 6: Group by hook text and aggregate
  const hookStats: Record<string, {
    total_retention: number;
    total_engagement: number;
    total_views: number;
    count: number;
  }> = {};

  for (const a of analytics) {
    const outputId = queueToOutput[a.posting_queue_id];
    const jobId = outputToJob[outputId];
    const scriptId = jobToScript[jobId];
    const hook = scriptMap[scriptId];

    if (!hook) continue;

    if (!hookStats[hook]) {
      hookStats[hook] = { total_retention: 0, total_engagement: 0, total_views: 0, count: 0 };
    }

    hookStats[hook].total_retention += a.avg_watch_percentage ?? 0;
    hookStats[hook].total_engagement += a.engagement_rate ?? 0;
    hookStats[hook].total_views += a.views ?? 0;
    hookStats[hook].count += 1;
  }

  // Build result sorted by average engagement descending
  const results: HookPerformanceRow[] = Object.entries(hookStats)
    .map(([hook, stats]) => ({
      hook,
      post_count: stats.count,
      avg_retention: stats.count > 0 ? Math.round((stats.total_retention / stats.count) * 100) / 100 : 0,
      avg_engagement: stats.count > 0 ? Math.round((stats.total_engagement / stats.count) * 10000) / 10000 : 0,
      total_views: stats.total_views,
    }))
    .sort((a, b) => b.avg_engagement - a.avg_engagement);

  log(`Hook analysis complete: ${results.length} unique hooks analyzed`);
  return results;
}

// ---------------------------------------------------------------------------
// analyzeTopicPerformance — Engagement by content pillar
// ---------------------------------------------------------------------------

export async function analyzeTopicPerformance(): Promise<TopicPerformanceRow[]> {
  const db = getDb();

  log('Analyzing topic/pillar performance');

  // Step 1: Scripts with content pillars
  const { data: scripts } = await db
    .from('video_scripts')
    .select('id, content_pillar')
    .not('content_pillar', 'is', null);

  if (!scripts || scripts.length === 0) return [];

  const scriptPillar: Record<string, string> = {};
  for (const s of scripts) {
    scriptPillar[s.id] = s.content_pillar;
  }

  // Step 2: Jobs
  const { data: jobs } = await db
    .from('video_jobs')
    .select('id, script_id')
    .in('script_id', Object.keys(scriptPillar));

  if (!jobs || jobs.length === 0) return [];

  const jobToScript: Record<string, string> = {};
  for (const j of jobs) {
    if (j.script_id) jobToScript[j.id] = j.script_id;
  }

  // Step 3: Outputs
  const { data: outputs } = await db
    .from('video_outputs')
    .select('id, job_id')
    .in('job_id', Object.keys(jobToScript));

  if (!outputs || outputs.length === 0) return [];

  const outputToJob: Record<string, string> = {};
  for (const o of outputs) {
    outputToJob[o.id] = o.job_id;
  }

  // Step 4: Queue items
  const { data: queueItems } = await db
    .from('posting_queue')
    .select('id, video_output_id')
    .eq('status', 'posted')
    .in('video_output_id', Object.keys(outputToJob));

  if (!queueItems || queueItems.length === 0) return [];

  const queueToOutput: Record<string, string> = {};
  for (const q of queueItems) {
    queueToOutput[q.id] = q.video_output_id;
  }

  // Step 5: Analytics
  const { data: analytics } = await db
    .from('post_analytics')
    .select('posting_queue_id, views, engagement_rate, follower_change, virality_score')
    .in('posting_queue_id', Object.keys(queueToOutput));

  if (!analytics || analytics.length === 0) return [];

  // Step 6: Group by content_pillar
  const pillarStats: Record<string, {
    total_engagement: number;
    total_views: number;
    total_follower_growth: number;
    total_virality: number;
    count: number;
  }> = {};

  for (const a of analytics) {
    const outputId = queueToOutput[a.posting_queue_id];
    const jobId = outputToJob[outputId];
    const scriptId = jobToScript[jobId];
    const pillar = scriptPillar[scriptId];

    if (!pillar) continue;

    if (!pillarStats[pillar]) {
      pillarStats[pillar] = {
        total_engagement: 0,
        total_views: 0,
        total_follower_growth: 0,
        total_virality: 0,
        count: 0,
      };
    }

    pillarStats[pillar].total_engagement += a.engagement_rate ?? 0;
    pillarStats[pillar].total_views += a.views ?? 0;
    pillarStats[pillar].total_follower_growth += a.follower_change ?? 0;
    pillarStats[pillar].total_virality += a.virality_score ?? 0;
    pillarStats[pillar].count += 1;
  }

  const results: TopicPerformanceRow[] = Object.entries(pillarStats)
    .map(([pillar, stats]) => ({
      content_pillar: pillar,
      post_count: stats.count,
      avg_engagement: stats.count > 0 ? Math.round((stats.total_engagement / stats.count) * 10000) / 10000 : 0,
      avg_views: stats.count > 0 ? Math.round(stats.total_views / stats.count) : 0,
      total_follower_growth: stats.total_follower_growth,
      avg_virality: stats.count > 0 ? Math.round((stats.total_virality / stats.count) * 10000) / 10000 : 0,
    }))
    .sort((a, b) => b.avg_engagement - a.avg_engagement);

  log(`Topic analysis complete: ${results.length} pillars analyzed`);
  return results;
}

// ---------------------------------------------------------------------------
// analyzePostingTimes — Best times to post per platform
// ---------------------------------------------------------------------------

export async function analyzePostingTimes(): Promise<TimeSlotPerformanceRow[]> {
  const db = getDb();

  log('Analyzing posting time performance');

  // Fetch posted items with their timestamps
  const { data: postedItems, error: postsErr } = await db
    .from('posting_queue')
    .select('id, platform, posted_at')
    .eq('status', 'posted')
    .not('posted_at', 'is', null)
    .order('posted_at', { ascending: false })
    .limit(500);

  if (postsErr || !postedItems || postedItems.length === 0) {
    log('No posted items for time analysis');
    return [];
  }

  const queueIds = postedItems.map((p) => p.id);

  // Fetch analytics for these posts
  const { data: analytics, error: analyticsErr } = await db
    .from('post_analytics')
    .select('posting_queue_id, views, engagement_rate')
    .in('posting_queue_id', queueIds);

  if (analyticsErr || !analytics || analytics.length === 0) return [];

  const analyticsMap: Record<string, { views: number; engagement: number }> = {};
  for (const a of analytics) {
    analyticsMap[a.posting_queue_id] = {
      views: a.views ?? 0,
      engagement: a.engagement_rate ?? 0,
    };
  }

  // Group by platform, day_of_week, hour
  const slotStats: Record<string, {
    total_engagement: number;
    total_views: number;
    count: number;
  }> = {};

  for (const post of postedItems) {
    const a = analyticsMap[post.id];
    if (!a) continue;

    const postedDate = new Date(post.posted_at);
    const dayOfWeek = postedDate.getUTCDay();
    const hour = postedDate.getUTCHours();
    const key = `${post.platform}:${dayOfWeek}:${hour}`;

    if (!slotStats[key]) {
      slotStats[key] = { total_engagement: 0, total_views: 0, count: 0 };
    }

    slotStats[key].total_engagement += a.engagement;
    slotStats[key].total_views += a.views;
    slotStats[key].count += 1;
  }

  const results: TimeSlotPerformanceRow[] = Object.entries(slotStats)
    .map(([key, stats]) => {
      const [platform, dow, h] = key.split(':');
      return {
        platform,
        day_of_week: Number(dow),
        hour: Number(h),
        avg_engagement: stats.count > 0 ? Math.round((stats.total_engagement / stats.count) * 10000) / 10000 : 0,
        avg_views: stats.count > 0 ? Math.round(stats.total_views / stats.count) : 0,
        post_count: stats.count,
      };
    })
    .sort((a, b) => b.avg_engagement - a.avg_engagement);

  log(`Posting time analysis complete: ${results.length} time slots analyzed`);
  return results;
}

// ---------------------------------------------------------------------------
// analyzeFormatPerformance — Compare variation configs (caption style, etc.)
// ---------------------------------------------------------------------------

export async function analyzeFormatPerformance(): Promise<FormatPerformanceRow[]> {
  const db = getDb();

  log('Analyzing format/variation performance');

  // Fetch video outputs with variation_config
  const { data: outputs, error: outputsErr } = await db
    .from('video_outputs')
    .select('id, variation_config')
    .not('variation_config', 'is', null);

  if (outputsErr || !outputs || outputs.length === 0) {
    log('No video outputs with variation configs found');
    return [];
  }

  const outputConfigs: Record<string, {
    caption_style: string;
    color_grade: string;
    text_position: string;
  }> = {};

  for (const o of outputs) {
    const config = o.variation_config;
    if (config && typeof config === 'object') {
      outputConfigs[o.id] = {
        caption_style: (config as Record<string, string>).caption_style ?? 'default',
        color_grade: (config as Record<string, string>).color_grade ?? 'default',
        text_position: (config as Record<string, string>).text_position ?? 'bottom',
      };
    }
  }

  // Get posted queue items linked to these outputs
  const { data: queueItems } = await db
    .from('posting_queue')
    .select('id, video_output_id')
    .eq('status', 'posted')
    .in('video_output_id', Object.keys(outputConfigs));

  if (!queueItems || queueItems.length === 0) return [];

  const queueToOutput: Record<string, string> = {};
  for (const q of queueItems) {
    queueToOutput[q.id] = q.video_output_id;
  }

  // Get analytics
  const { data: analytics } = await db
    .from('post_analytics')
    .select('posting_queue_id, views, engagement_rate, avg_watch_percentage')
    .in('posting_queue_id', Object.keys(queueToOutput));

  if (!analytics || analytics.length === 0) return [];

  // Group by format key (caption_style + color_grade + text_position)
  const formatStats: Record<string, {
    caption_style: string;
    color_grade: string;
    text_position: string;
    total_engagement: number;
    total_views: number;
    total_retention: number;
    count: number;
  }> = {};

  for (const a of analytics) {
    const outputId = queueToOutput[a.posting_queue_id];
    const config = outputConfigs[outputId];
    if (!config) continue;

    const key = `${config.caption_style}|${config.color_grade}|${config.text_position}`;

    if (!formatStats[key]) {
      formatStats[key] = {
        ...config,
        total_engagement: 0,
        total_views: 0,
        total_retention: 0,
        count: 0,
      };
    }

    formatStats[key].total_engagement += a.engagement_rate ?? 0;
    formatStats[key].total_views += a.views ?? 0;
    formatStats[key].total_retention += a.avg_watch_percentage ?? 0;
    formatStats[key].count += 1;
  }

  const results: FormatPerformanceRow[] = Object.values(formatStats)
    .map((stats) => ({
      caption_style: stats.caption_style,
      color_grade: stats.color_grade,
      text_position: stats.text_position,
      post_count: stats.count,
      avg_engagement: stats.count > 0 ? Math.round((stats.total_engagement / stats.count) * 10000) / 10000 : 0,
      avg_views: stats.count > 0 ? Math.round(stats.total_views / stats.count) : 0,
      avg_retention: stats.count > 0 ? Math.round((stats.total_retention / stats.count) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.avg_engagement - a.avg_engagement);

  log(`Format analysis complete: ${results.length} format combinations analyzed`);
  return results;
}

// ---------------------------------------------------------------------------
// analyzeRevenueAttribution — Revenue by content pillar and topic
// ---------------------------------------------------------------------------

export async function analyzeRevenueAttribution(): Promise<RevenueAttributionRow[]> {
  const db = getDb();

  log('Analyzing revenue attribution by content pillar');

  // Fetch revenue events that have source_post_id set
  const { data: revenueEvents, error: revErr } = await db
    .from('revenue_events')
    .select('id, amount, type, source_post_id')
    .not('source_post_id', 'is', null);

  if (revErr || !revenueEvents || revenueEvents.length === 0) {
    log('No attributed revenue events found');
    return [];
  }

  // Map source_post_id → posting_queue → video_output → video_job → script
  const postIds = revenueEvents.map((e) => e.source_post_id).filter(Boolean);

  const { data: queueItems } = await db
    .from('posting_queue')
    .select('id, video_output_id')
    .in('id', postIds);

  if (!queueItems || queueItems.length === 0) return [];

  const queueToOutput: Record<string, string> = {};
  for (const q of queueItems) {
    queueToOutput[q.id] = q.video_output_id;
  }

  const outputIds = Array.from(new Set(Object.values(queueToOutput)));
  const { data: outputs } = await db
    .from('video_outputs')
    .select('id, job_id')
    .in('id', outputIds);

  if (!outputs || outputs.length === 0) return [];

  const outputToJob: Record<string, string> = {};
  for (const o of outputs) {
    outputToJob[o.id] = o.job_id;
  }

  const jobIds = Array.from(new Set(Object.values(outputToJob)));
  const { data: jobs } = await db
    .from('video_jobs')
    .select('id, script_id')
    .in('id', jobIds);

  if (!jobs || jobs.length === 0) return [];

  const jobToScript: Record<string, string> = {};
  for (const j of jobs) {
    if (j.script_id) jobToScript[j.id] = j.script_id;
  }

  const scriptIds = Array.from(new Set(Object.values(jobToScript)));
  const { data: scripts } = await db
    .from('video_scripts')
    .select('id, content_pillar, topic')
    .in('id', scriptIds);

  if (!scripts || scripts.length === 0) return [];

  const scriptInfo: Record<string, { pillar: string; topic: string }> = {};
  for (const s of scripts) {
    scriptInfo[s.id] = {
      pillar: s.content_pillar ?? 'unknown',
      topic: s.topic ?? 'unknown',
    };
  }

  // Aggregate revenue by pillar + topic
  const revenueByPillarTopic: Record<string, { total: number; count: number }> = {};

  for (const event of revenueEvents) {
    const queueId = event.source_post_id;
    const outputId = queueToOutput[queueId];
    if (!outputId) continue;

    const jobId = outputToJob[outputId];
    if (!jobId) continue;

    const scriptId = jobToScript[jobId];
    if (!scriptId) continue;

    const info = scriptInfo[scriptId];
    if (!info) continue;

    const key = `${info.pillar}::${info.topic}`;
    if (!revenueByPillarTopic[key]) {
      revenueByPillarTopic[key] = { total: 0, count: 0 };
    }

    const amount = event.type === 'refund' ? -(event.amount ?? 0) : (event.amount ?? 0);
    revenueByPillarTopic[key].total += amount;
    revenueByPillarTopic[key].count += 1;
  }

  const results: RevenueAttributionRow[] = Object.entries(revenueByPillarTopic)
    .map(([key, stats]) => {
      const [pillar, topic] = key.split('::');
      return {
        content_pillar: pillar,
        topic,
        total_revenue: Math.round(stats.total * 100) / 100,
        event_count: stats.count,
      };
    })
    .sort((a, b) => b.total_revenue - a.total_revenue);

  log(`Revenue attribution complete: ${results.length} pillar-topic combinations`);
  return results;
}

// ---------------------------------------------------------------------------
// getAnalyticsSummary — Summary stats for a given period
// ---------------------------------------------------------------------------

export async function getAnalyticsSummary(
  period: 'day' | 'week' | 'month',
): Promise<AnalyticsSummary> {
  const db = getDb();
  const now = new Date();
  let startDate: string;

  switch (period) {
    case 'day':
      startDate = now.toISOString().split('T')[0];
      break;
    case 'week': {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      startDate = weekAgo.toISOString().split('T')[0];
      break;
    }
    case 'month': {
      const monthAgo = new Date(now);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      startDate = monthAgo.toISOString().split('T')[0];
      break;
    }
  }

  log(`Generating analytics summary for period: ${period} (from ${startDate})`);

  const { data: dailyRecords, error: fetchErr } = await db
    .from('daily_analytics')
    .select('*')
    .gte('date', startDate)
    .order('date', { ascending: true });

  if (fetchErr) {
    throw new Error(`Failed to fetch daily analytics: ${fetchErr.message}`);
  }

  const records = dailyRecords ?? [];

  // Aggregate totals
  let totalViews = 0;
  let totalLikes = 0;
  let totalComments = 0;
  let totalShares = 0;
  let totalSaves = 0;
  let totalEngagement = 0;
  let totalFollowerGrowth = 0;
  let totalPosts = 0;
  let engagementCount = 0;

  // Platform breakdown
  const platformAgg: Record<string, {
    views: number;
    engagement_total: number;
    engagement_count: number;
    follower_growth: number;
    posts: number;
  }> = {};

  for (const r of records) {
    totalViews += r.total_views ?? 0;
    totalLikes += r.total_likes ?? 0;
    totalComments += r.total_comments ?? 0;
    totalShares += r.total_shares ?? 0;
    totalSaves += r.total_saves ?? 0;
    totalFollowerGrowth += r.follower_growth ?? 0;
    totalPosts += r.posts_published ?? 0;
    totalEngagement += r.avg_engagement_rate ?? 0;
    engagementCount += 1;

    const p = r.platform ?? 'unknown';
    if (!platformAgg[p]) {
      platformAgg[p] = { views: 0, engagement_total: 0, engagement_count: 0, follower_growth: 0, posts: 0 };
    }
    platformAgg[p].views += r.total_views ?? 0;
    platformAgg[p].engagement_total += r.avg_engagement_rate ?? 0;
    platformAgg[p].engagement_count += 1;
    platformAgg[p].follower_growth += r.follower_growth ?? 0;
    platformAgg[p].posts += r.posts_published ?? 0;
  }

  const platformBreakdown = Object.entries(platformAgg).map(([platform, agg]) => ({
    platform,
    views: agg.views,
    engagement_rate: agg.engagement_count > 0
      ? Math.round((agg.engagement_total / agg.engagement_count) * 10000) / 10000
      : 0,
    follower_growth: agg.follower_growth,
    posts: agg.posts,
  }));

  const summary: AnalyticsSummary = {
    period,
    total_views: totalViews,
    total_likes: totalLikes,
    total_comments: totalComments,
    total_shares: totalShares,
    total_saves: totalSaves,
    avg_engagement_rate: engagementCount > 0
      ? Math.round((totalEngagement / engagementCount) * 10000) / 10000
      : 0,
    total_follower_growth: totalFollowerGrowth,
    posts_published: totalPosts,
    platform_breakdown: platformBreakdown,
  };

  log(`Summary for ${period}: ${totalViews} views, ${totalPosts} posts, ${totalFollowerGrowth} follower growth`);
  return summary;
}
