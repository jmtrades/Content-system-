// ============================================================================
// Content Empire - Standalone Cron Job Runner
// ============================================================================
// Run with: npx tsx src/cron.ts
//
// This process manages ALL recurring jobs for the Content Empire system.
// It is designed to run as a long-lived background process alongside the
// Next.js dev/production server.
// ============================================================================

import cron from 'node-cron';
import { getServerClient } from '@/lib/db';

// ---------------------------------------------------------------------------
// Scraper imports
// ---------------------------------------------------------------------------
import * as hackernews from '@/scrapers/hackernews';
import * as github from '@/scrapers/github';
import * as reddit from '@/scrapers/reddit';
import * as producthunt from '@/scrapers/producthunt';
import * as arxiv from '@/scrapers/arxiv';

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(category: string, message: string): void {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [cron:${category}] ${message}`);
}

function logError(category: string, message: string, err: unknown): void {
  const ts = new Date().toISOString();
  const detail = err instanceof Error ? err.message : String(err);
  console.error(`[${ts}] [cron:${category}] ERROR: ${message} — ${detail}`);
}

// ---------------------------------------------------------------------------
// Safe wrapper for cron tasks
// ---------------------------------------------------------------------------

function safeTask(name: string, fn: () => Promise<void>): () => void {
  return () => {
    log(name, 'Starting...');
    const start = Date.now();
    fn()
      .then(() => {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        log(name, `Completed in ${elapsed}s`);
      })
      .catch((err) => {
        logError(name, 'Task failed', err);
      });
  };
}

// ---------------------------------------------------------------------------
// Helper: persist scraped items to Supabase
// ---------------------------------------------------------------------------

async function persistScrapedItems(
  source: string,
  items: Array<{
    title: string;
    source_url: string;
    summary?: string;
    category?: string;
    importance_score?: number;
    trending_velocity?: number;
    raw_data?: Record<string, unknown>;
  }>,
): Promise<void> {
  if (items.length === 0) {
    log(source, 'No new items to persist');
    return;
  }

  const db = getServerClient();
  const rows = items.map((item) => ({
    source,
    source_url: item.source_url,
    title: item.title,
    summary: item.summary ?? null,
    category: item.category ?? 'industry_news',
    importance_score: item.importance_score ?? 50,
    trending_velocity: item.trending_velocity ?? 0,
    raw_data: item.raw_data ?? {},
    processed: false,
    posted: false,
  }));

  const { error } = await db
    .from('radar_items')
    .upsert(rows, { onConflict: 'source_url' });

  if (error) {
    logError(source, `Failed to persist ${rows.length} items`, error);
  } else {
    log(source, `Persisted ${rows.length} items`);
  }
}

// ============================================================================
// RADAR JOBS — Content signal ingestion
// ============================================================================

async function scanHackerNews(): Promise<void> {
  const items = await hackernews.scanFrontPage(30);
  await persistScrapedItems('hackernews', items);
}

async function scanGitHubReleases(): Promise<void> {
  const items = await github.scanReleases();
  await persistScrapedItems('github_releases', items);
}

async function scanTwitter(): Promise<void> {
  // Twitter/X scraping requires API credentials. When the twitter scraper
  // module is built, import and call it here. For now, log a placeholder.
  log('twitter', 'Twitter scanner not yet implemented — skipping');
}

async function scanReddit(): Promise<void> {
  const items = await reddit.scanAll();
  await persistScrapedItems('reddit', items);
}

async function scanGitHubTrending(): Promise<void> {
  const items = await github.scanTrending();
  await persistScrapedItems('github_trending', items);
}

async function scanRSS(): Promise<void> {
  // RSS scanner will process all RSS-type sources from config/sources.json.
  // When the RSS scraper module is built, import and call it here.
  log('rss', 'RSS scanner not yet implemented — skipping');
}

async function scanProductHunt(): Promise<void> {
  const items = await producthunt.scanDaily();
  await persistScrapedItems('producthunt', items);
}

async function scanYouTube(): Promise<void> {
  // YouTube scraping requires API key. When the YouTube scraper module is
  // built, import and call it here.
  log('youtube', 'YouTube scanner not yet implemented — skipping');
}

async function scanArXiv(): Promise<void> {
  const items = await arxiv.scanAll();
  await persistScrapedItems('arxiv', items);
}

// ============================================================================
// INTEL JOBS — Competitor intelligence
// ============================================================================

async function scrapeCompetitorPosts(): Promise<void> {
  const db = getServerClient();
  const { data: competitors, error } = await db
    .from('competitor_tracking')
    .select('competitor_handle, platform')
    .eq('tracking_enabled', true);

  if (error) {
    logError('intel', 'Failed to fetch competitor list', error);
    return;
  }

  log('intel', `Processing ${competitors?.length ?? 0} competitor-platform pairs`);
  // When competitor scraping modules are built, iterate and scrape here.
  // Each platform (TikTok, Instagram, YouTube, Twitter) needs its own
  // scraper that saves to the competitor_posts table.
}

async function runCompetitorAnalytics(): Promise<void> {
  const db = getServerClient();

  // Aggregate the last 24 hours of competitor_posts into competitor_analytics
  const { error } = await db.rpc('aggregate_competitor_analytics');

  if (error) {
    // RPC may not exist yet — this is expected before migrations are complete
    logError('intel', 'competitor analytics aggregation failed (RPC may not exist)', error);
  }
}

async function detectContentGaps(): Promise<void> {
  const db = getServerClient();

  // Analyze competitor content vs. our content to find gaps
  const { data: competitorTopics, error: compErr } = await db
    .from('competitor_posts')
    .select('topic_category, competitor_handle')
    .gte('posted_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

  if (compErr) {
    logError('intel', 'Failed to fetch competitor topics for gap detection', compErr);
    return;
  }

  const { data: ourTopics, error: ourErr } = await db
    .from('radar_items')
    .select('category')
    .eq('posted', true)
    .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

  if (ourErr) {
    logError('intel', 'Failed to fetch our topics for gap detection', ourErr);
    return;
  }

  // Build frequency maps
  const competitorFreq: Record<string, number> = {};
  for (const row of competitorTopics ?? []) {
    const topic = row.topic_category ?? 'unknown';
    competitorFreq[topic] = (competitorFreq[topic] ?? 0) + 1;
  }

  const ourFreq: Record<string, number> = {};
  for (const row of ourTopics ?? []) {
    const cat = row.category ?? 'unknown';
    ourFreq[cat] = (ourFreq[cat] ?? 0) + 1;
  }

  // Find topics competitors cover that we do not
  const gaps: Record<string, unknown>[] = [];
  for (const [topic, count] of Object.entries(competitorFreq)) {
    if ((ourFreq[topic] ?? 0) === 0 && count >= 3) {
      gaps.push({
        gap_type: 'topic_gap',
        description: `Competitors published ${count} posts about "${topic}" this week, but we published none.`,
        opportunity_score: Math.min(100, count * 15),
        actioned: false,
      });
    }
  }

  if (gaps.length > 0) {
    const { error: insertErr } = await db.from('content_gaps').insert(gaps);
    if (insertErr) {
      logError('intel', 'Failed to insert content gaps', insertErr);
    } else {
      log('intel', `Detected and stored ${gaps.length} content gaps`);
    }
  } else {
    log('intel', 'No new content gaps detected');
  }
}

// ============================================================================
// WRITER JOBS — Script & content generation
// ============================================================================

async function runDailyBatch(): Promise<void> {
  const db = getServerClient();

  // Find the top unprocessed radar items and generate scripts
  const { data: items, error } = await db
    .from('radar_items')
    .select('*')
    .eq('processed', false)
    .order('importance_score', { ascending: false })
    .limit(10);

  if (error) {
    logError('writer', 'Failed to fetch unprocessed items', error);
    return;
  }

  log('writer', `Found ${items?.length ?? 0} unprocessed items for daily batch`);

  // When the writer engine is built, pass each item to the script generator.
  // For now, mark items as processed to prevent re-queuing.
  if (items && items.length > 0) {
    const ids = items.map((i: { id: string }) => i.id);
    const { error: updateErr } = await db
      .from('radar_items')
      .update({ processed: true })
      .in('id', ids);

    if (updateErr) {
      logError('writer', 'Failed to mark items as processed', updateErr);
    }
  }
}

async function runWeeklyEvergreen(): Promise<void> {
  log('writer', 'Generating weekly evergreen content ideas...');

  const db = getServerClient();

  // Fetch top-performing content pillars for evergreen topic generation
  const { data: pillars, error } = await db
    .from('content_pillar_config')
    .select('*');

  if (error) {
    logError('writer', 'Failed to fetch content pillars', error);
    return;
  }

  log('writer', `Processing ${pillars?.length ?? 0} pillars for evergreen content`);
  // When the writer engine is built, generate evergreen scripts per pillar here.
}

// ============================================================================
// DISTRIBUTOR JOBS — Post queue processing
// ============================================================================

async function processPostingQueue(): Promise<void> {
  const db = getServerClient();

  const { data: pending, error } = await db
    .from('posting_queue')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(5);

  if (error) {
    logError('distributor', 'Failed to fetch posting queue', error);
    return;
  }

  if (!pending || pending.length === 0) {
    return; // Nothing to post — silent return since this runs every minute
  }

  log('distributor', `Processing ${pending.length} queued posts`);

  for (const post of pending) {
    try {
      // Mark as posting
      await db
        .from('posting_queue')
        .update({ status: 'posting' })
        .eq('id', post.id);

      // When platform posting modules are built, dispatch to the correct
      // platform API here. For now, log the attempt.
      log('distributor', `Would post to ${post.platform}: ${post.id}`);

      // Mark as posted (placeholder — real implementation awaits platform APIs)
      await db
        .from('posting_queue')
        .update({
          status: 'posted',
          posted_at: new Date().toISOString(),
        })
        .eq('id', post.id);
    } catch (err) {
      logError('distributor', `Failed to process post ${post.id}`, err);
      const retryCount = (post.retry_count ?? 0) + 1;
      await db
        .from('posting_queue')
        .update({
          status: retryCount >= 3 ? 'failed' : 'scheduled',
          retry_count: retryCount,
          error_message: err instanceof Error ? err.message : String(err),
        })
        .eq('id', post.id);
    }
  }
}

// ============================================================================
// BRAIN JOBS — Analytics & optimization
// ============================================================================

async function scrapeAnalytics(): Promise<void> {
  log('brain', 'Scraping platform analytics...');
  // When platform API modules are built, pull analytics for each connected
  // platform and store in post_analytics / daily_analytics tables.
}

async function runDailyRollup(): Promise<void> {
  log('brain', 'Running daily analytics rollup...');

  const db = getServerClient();
  const today = new Date().toISOString().split('T')[0];

  const platforms = ['tiktok', 'reels', 'youtube_shorts', 'linkedin', 'twitter'];

  for (const platform of platforms) {
    const { data: analytics, error } = await db
      .from('post_analytics')
      .select('views, likes, comments, shares, saves, follower_count, follower_change, engagement_rate')
      .eq('platform', platform)
      .gte('measured_at', `${today}T00:00:00Z`)
      .lte('measured_at', `${today}T23:59:59Z`);

    if (error || !analytics || analytics.length === 0) continue;

    const rollup = {
      platform,
      date: today,
      total_views: analytics.reduce((sum: number, a: { views: number }) => sum + (a.views ?? 0), 0),
      total_likes: analytics.reduce((sum: number, a: { likes: number }) => sum + (a.likes ?? 0), 0),
      total_comments: analytics.reduce((sum: number, a: { comments: number }) => sum + (a.comments ?? 0), 0),
      total_shares: analytics.reduce((sum: number, a: { shares: number }) => sum + (a.shares ?? 0), 0),
      total_saves: analytics.reduce((sum: number, a: { saves: number }) => sum + (a.saves ?? 0), 0),
      follower_count: analytics[analytics.length - 1]?.follower_count ?? 0,
      follower_growth: analytics.reduce((sum: number, a: { follower_change: number }) => sum + (a.follower_change ?? 0), 0),
      avg_engagement_rate:
        analytics.reduce((sum: number, a: { engagement_rate: number }) => sum + (a.engagement_rate ?? 0), 0) /
        analytics.length,
      posts_published: analytics.length,
    };

    await db
      .from('daily_analytics')
      .upsert(rollup, { onConflict: 'platform,date' });
  }

  log('brain', 'Daily rollup complete');
}

async function runWeeklyOptimization(): Promise<void> {
  log('brain', 'Running weekly content optimization analysis...');

  const db = getServerClient();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Fetch this week's daily analytics across all platforms
  const { data: weekData, error } = await db
    .from('daily_analytics')
    .select('*')
    .gte('date', weekAgo)
    .order('date', { ascending: true });

  if (error) {
    logError('brain', 'Failed to fetch weekly analytics', error);
    return;
  }

  log('brain', `Analyzed ${weekData?.length ?? 0} daily analytics records for optimization`);
  // When the optimization engine is built, analyze pillar performance,
  // posting times, and content formats to generate recommendations.
}

async function runGrowthProjections(): Promise<void> {
  log('brain', 'Calculating growth projections...');

  const db = getServerClient();
  const platforms = ['tiktok', 'reels', 'youtube_shorts', 'linkedin', 'twitter'];
  const today = new Date().toISOString().split('T')[0];

  for (const platform of platforms) {
    // Get the last 30 days of daily analytics
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const { data: history, error } = await db
      .from('daily_analytics')
      .select('date, follower_count, follower_growth')
      .eq('platform', platform)
      .gte('date', thirtyDaysAgo)
      .order('date', { ascending: true });

    if (error || !history || history.length < 2) continue;

    const latestFollowers = history[history.length - 1]?.follower_count ?? 0;
    const avgDailyGrowth =
      history.reduce((sum: number, h: { follower_growth: number }) => sum + (h.follower_growth ?? 0), 0) /
      history.length;

    const growthRate = latestFollowers > 0 ? avgDailyGrowth / latestFollowers : 0;

    // Project date to 100k followers
    let projected100kDate: string | null = null;
    if (avgDailyGrowth > 0 && latestFollowers < 100_000) {
      const daysTo100k = Math.ceil((100_000 - latestFollowers) / avgDailyGrowth);
      const target = new Date(Date.now() + daysTo100k * 24 * 60 * 60 * 1000);
      projected100kDate = target.toISOString().split('T')[0];
    }

    await db.from('growth_velocity').upsert(
      {
        platform,
        date: today,
        follower_count: latestFollowers,
        daily_growth: Math.round(avgDailyGrowth),
        growth_rate: growthRate,
        projected_100k_date: projected100kDate,
      },
      { onConflict: 'platform,date' },
    );
  }

  log('brain', 'Growth projections updated');
}

// ============================================================================
// COMMUNITY JOBS — Engagement management
// ============================================================================

async function processComments(): Promise<void> {
  const db = getServerClient();

  const { data: unprocessed, error } = await db
    .from('comments')
    .select('*')
    .eq('responded', false)
    .eq('requires_response', true)
    .order('created_at', { ascending: true })
    .limit(20);

  if (error) {
    logError('community', 'Failed to fetch unprocessed comments', error);
    return;
  }

  if (!unprocessed || unprocessed.length === 0) {
    return;
  }

  log('community', `Processing ${unprocessed.length} comments requiring response`);
  // When the community engine is built, generate and post responses here.
  // For now, log each comment that needs attention.
  for (const comment of unprocessed) {
    log('community', `  Needs response: [${comment.platform}] ${comment.author_handle}: "${comment.content?.substring(0, 80)}..."`);
  }
}

async function processDMs(): Promise<void> {
  const db = getServerClient();

  const { data: openDMs, error } = await db
    .from('dm_conversations')
    .select('*')
    .eq('status', 'open')
    .order('last_message_at', { ascending: true })
    .limit(10);

  if (error) {
    logError('community', 'Failed to fetch open DMs', error);
    return;
  }

  if (!openDMs || openDMs.length === 0) {
    return;
  }

  log('community', `Processing ${openDMs.length} open DM conversations`);
  // When the community engine is built, triage and respond to DMs here.
}

// ============================================================================
// TRENDS JOBS — Trend detection & prediction
// ============================================================================

async function detectTrends(): Promise<void> {
  log('trends', 'Running cross-platform trend detection...');

  const db = getServerClient();
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

  // Count mentions by topic/category across recent radar items
  const { data: recentItems, error } = await db
    .from('radar_items')
    .select('title, category, importance_score, trending_velocity')
    .gte('created_at', sixHoursAgo);

  if (error) {
    logError('trends', 'Failed to fetch recent items for trend detection', error);
    return;
  }

  if (!recentItems || recentItems.length === 0) {
    log('trends', 'No recent items for trend analysis');
    return;
  }

  // Group by category and calculate composite scores
  const categoryScores: Record<string, { count: number; totalImportance: number; totalVelocity: number }> = {};
  for (const item of recentItems) {
    const cat = item.category ?? 'unknown';
    if (!categoryScores[cat]) {
      categoryScores[cat] = { count: 0, totalImportance: 0, totalVelocity: 0 };
    }
    categoryScores[cat].count += 1;
    categoryScores[cat].totalImportance += item.importance_score ?? 0;
    categoryScores[cat].totalVelocity += item.trending_velocity ?? 0;
  }

  // Categories with 3+ mentions and high average importance are trends
  const trendInserts: Record<string, unknown>[] = [];
  for (const [topic, scores] of Object.entries(categoryScores)) {
    if (scores.count >= 3) {
      const avgImportance = scores.totalImportance / scores.count;
      const compositeScore = (scores.count * 10 + avgImportance + scores.totalVelocity) / 3;
      const confidence = Math.min(1, compositeScore / 100);

      let recommendedAction: string;
      if (compositeScore >= 80) recommendedAction = 'create_immediately';
      else if (compositeScore >= 60) recommendedAction = 'prepare_script';
      else if (compositeScore >= 40) recommendedAction = 'monitor';
      else recommendedAction = 'ignore';

      trendInserts.push({
        topic,
        velocity: scores.totalVelocity / scores.count,
        cross_platform_score: scores.count * 10,
        influencer_adoption: 0,
        confidence,
        recommended_action: recommendedAction,
        actioned: false,
      });
    }
  }

  if (trendInserts.length > 0) {
    const { error: insertErr } = await db.from('trend_predictions').insert(trendInserts);
    if (insertErr) {
      logError('trends', 'Failed to insert trend predictions', insertErr);
    } else {
      log('trends', `Detected ${trendInserts.length} trending topics`);
    }
  } else {
    log('trends', 'No significant trends detected in this cycle');
  }
}

// ============================================================================
// SYSTEM JOBS — Health & maintenance
// ============================================================================

async function healthCheck(): Promise<void> {
  const checks: { name: string; ok: boolean; detail: string }[] = [];

  // Check Supabase connectivity
  try {
    const db = getServerClient();
    const { error } = await db.from('radar_items').select('id').limit(1);
    checks.push({ name: 'supabase', ok: !error, detail: error ? error.message : 'connected' });
  } catch (err) {
    checks.push({ name: 'supabase', ok: false, detail: err instanceof Error ? err.message : String(err) });
  }

  // Check Ollama connectivity
  try {
    const ollamaUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
    const res = await fetch(`${ollamaUrl}/api/tags`);
    checks.push({ name: 'ollama', ok: res.ok, detail: res.ok ? 'running' : `status ${res.status}` });
  } catch (err) {
    checks.push({ name: 'ollama', ok: false, detail: err instanceof Error ? err.message : String(err) });
  }

  // Report results
  const allOk = checks.every((c) => c.ok);
  const summary = checks.map((c) => `${c.name}: ${c.ok ? 'OK' : 'FAIL'} (${c.detail})`).join(', ');

  if (allOk) {
    log('health', `All systems operational — ${summary}`);
  } else {
    logError('health', `Some systems are down — ${summary}`, new Error('health check failed'));
  }
}

async function cleanupOldData(): Promise<void> {
  log('cleanup', 'Removing data older than 90 days...');

  const db = getServerClient();
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const tables = [
    { name: 'radar_items', dateCol: 'created_at', condition: { processed: true, posted: true } },
    { name: 'post_analytics', dateCol: 'measured_at', condition: {} },
    { name: 'link_clicks', dateCol: 'clicked_at', condition: {} },
    { name: 'competitor_posts', dateCol: 'scraped_at', condition: {} },
  ];

  for (const table of tables) {
    try {
      let query = db
        .from(table.name)
        .delete()
        .lt(table.dateCol, cutoff);

      for (const [key, value] of Object.entries(table.condition)) {
        query = query.eq(key, value as boolean);
      }

      const { error } = await query;

      if (error) {
        logError('cleanup', `Failed to clean ${table.name}`, error);
      } else {
        log('cleanup', `Cleaned old records from ${table.name}`);
      }
    } catch (err) {
      logError('cleanup', `Error cleaning ${table.name}`, err);
    }
  }

  log('cleanup', 'Cleanup cycle complete');
}

// ============================================================================
// CRON SCHEDULE REGISTRATION
// ============================================================================

function registerAllJobs(): void {
  log('system', 'Registering cron jobs...');

  // -------------------------------------------------------------------------
  // RADAR — Content signal ingestion
  // -------------------------------------------------------------------------
  cron.schedule('*/10 * * * *', safeTask('radar:hackernews', scanHackerNews));
  cron.schedule('*/15 * * * *', safeTask('radar:github-releases', scanGitHubReleases));
  cron.schedule('*/15 * * * *', safeTask('radar:twitter', scanTwitter));
  cron.schedule('*/20 * * * *', safeTask('radar:reddit', scanReddit));
  cron.schedule('*/30 * * * *', safeTask('radar:github-trending', scanGitHubTrending));
  cron.schedule('*/30 * * * *', safeTask('radar:rss', scanRSS));
  cron.schedule('0 */2 * * *', safeTask('radar:producthunt', scanProductHunt));
  cron.schedule('0 */4 * * *', safeTask('radar:youtube', scanYouTube));
  cron.schedule('0 */6 * * *', safeTask('radar:arxiv', scanArXiv));

  // -------------------------------------------------------------------------
  // INTEL — Competitor intelligence
  // -------------------------------------------------------------------------
  cron.schedule('0 */3 * * *', safeTask('intel:competitor-posts', scrapeCompetitorPosts));
  cron.schedule('0 0 * * *', safeTask('intel:competitor-analytics', runCompetitorAnalytics));
  cron.schedule('0 */6 * * *', safeTask('intel:gap-detection', detectContentGaps));

  // -------------------------------------------------------------------------
  // WRITER — Content generation
  // -------------------------------------------------------------------------
  cron.schedule('0 6 * * *', safeTask('writer:daily-batch', runDailyBatch));
  cron.schedule('0 0 * * 0', safeTask('writer:weekly-evergreen', runWeeklyEvergreen));

  // -------------------------------------------------------------------------
  // DISTRIBUTOR — Post queue processing
  // -------------------------------------------------------------------------
  cron.schedule('* * * * *', safeTask('distributor:process-queue', processPostingQueue));

  // -------------------------------------------------------------------------
  // BRAIN — Analytics & optimization
  // -------------------------------------------------------------------------
  cron.schedule('0 */4 * * *', safeTask('brain:scrape-analytics', scrapeAnalytics));
  cron.schedule('0 23 * * *', safeTask('brain:daily-rollup', runDailyRollup));
  cron.schedule('0 0 * * 1', safeTask('brain:weekly-optimization', runWeeklyOptimization));
  cron.schedule('0 */12 * * *', safeTask('brain:growth-projections', runGrowthProjections));

  // -------------------------------------------------------------------------
  // COMMUNITY — Engagement management
  // -------------------------------------------------------------------------
  cron.schedule('*/30 * * * *', safeTask('community:comments', processComments));
  cron.schedule('0 */2 * * *', safeTask('community:dms', processDMs));

  // -------------------------------------------------------------------------
  // TRENDS — Trend detection & prediction
  // -------------------------------------------------------------------------
  cron.schedule('0 */4 * * *', safeTask('trends:detect', detectTrends));

  // -------------------------------------------------------------------------
  // SYSTEM — Health & maintenance
  // -------------------------------------------------------------------------
  cron.schedule('*/5 * * * *', safeTask('system:health-check', healthCheck));
  cron.schedule('0 0 * * *', safeTask('system:cleanup', cleanupOldData));

  log('system', 'All cron jobs registered successfully');
  log('system', 'Schedule summary:');
  log('system', '  Radar:       HN/10m, GitHub-releases/15m, Twitter/15m, Reddit/20m, GitHub-trending/30m, RSS/30m, ProductHunt/2h, YouTube/4h, arXiv/6h');
  log('system', '  Intel:       competitor-posts/3h, competitor-analytics/daily@midnight, gap-detection/6h');
  log('system', '  Writer:      daily-batch@6AM, weekly-evergreen/Sunday@midnight');
  log('system', '  Distributor: process-queue/1m');
  log('system', '  Brain:       analytics/4h, daily-rollup@11PM, weekly-optimization/Monday@midnight, growth-projections/12h');
  log('system', '  Community:   comments/30m, DMs/2h');
  log('system', '  Trends:      detect/4h');
  log('system', '  System:      health/5m, cleanup/daily@midnight');
}

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

function setupShutdownHandlers(): void {
  const shutdown = (signal: string) => {
    log('system', `Received ${signal}. Shutting down gracefully...`);

    // Stop all scheduled cron jobs
    const tasks = cron.getTasks();
    tasks.forEach((task) => task.stop());

    log('system', `Stopped ${tasks.size} cron tasks`);
    log('system', 'Goodbye.');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGHUP', () => shutdown('SIGHUP'));

  process.on('uncaughtException', (err) => {
    logError('system', 'Uncaught exception', err);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logError('system', 'Unhandled rejection', reason);
  });
}

// ============================================================================
// MAIN
// ============================================================================

function main(): void {
  console.log('');
  console.log('============================================================================');
  console.log(' Content Empire - Cron Job Runner');
  console.log('============================================================================');
  console.log('');

  setupShutdownHandlers();
  registerAllJobs();

  log('system', 'Cron runner is active. Press Ctrl+C to stop.');

  // Run an initial health check on startup
  healthCheck().catch((err) => logError('system', 'Initial health check failed', err));
}

main();
