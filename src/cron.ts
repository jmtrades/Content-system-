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
import * as twitter from '@/scrapers/twitter';
import * as reddit from '@/scrapers/reddit';
import * as rss from '@/scrapers/rss';
import * as producthunt from '@/scrapers/producthunt';
import * as youtube from '@/scrapers/youtube';
import * as arxiv from '@/scrapers/arxiv';

// ---------------------------------------------------------------------------
// Engine imports
// ---------------------------------------------------------------------------
import * as analyticsEngine from '@/engines/analytics-engine';
import * as commentEngine from '@/engines/comment-engine';
import * as scriptGenerator from '@/engines/script-generator';
import * as optimizer from '@/engines/optimizer';
import * as trendPredictor from '@/engines/trend-predictor';

// Hypergrowth engine — lazy import to avoid circular deps
async function getHypergrowthEngine() {
  return await import('@/engines/hypergrowth-engine');
}

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
  const items = await twitter.scanAccounts();
  await persistScrapedItems('twitter', items);
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
  const items = await rss.scanFeeds();
  await persistScrapedItems('rss', items);
}

async function scanProductHunt(): Promise<void> {
  const items = await producthunt.scanDaily();
  await persistScrapedItems('producthunt', items);
}

async function scanYouTube(): Promise<void> {
  const items = await youtube.scanChannels();
  await persistScrapedItems('youtube', items);
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
  log('writer', 'Starting daily batch script generation...');
  const scripts = await scriptGenerator.generateDailyBatch();
  log('writer', `Daily batch complete: ${scripts.length} scripts generated`);
}

async function runWeeklyEvergreen(): Promise<void> {
  log('writer', 'Generating weekly evergreen content...');
  const scripts = await scriptGenerator.generateWeeklyEvergreen();
  log('writer', `Weekly evergreen complete: ${scripts.length} scripts generated`);
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
  const result = await analyticsEngine.scrapeAnalytics();
  log('brain', `Analytics scrape done: ${result.posts_checked} checked, ${result.analytics_collected} collected, ${result.errors.length} errors`);
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
  const result = await optimizer.weeklyOptimization();
  log('brain', `Weekly optimization complete: ${result.recommendations.length} recommendations generated`);
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
  log('community', 'Processing unresponded comments...');
  const result = await commentEngine.processComments();
  log('community', `Comment processing done: ${result.processed} processed, ${result.responded} responded, ${result.errors} errors`);
}

async function processDMs(): Promise<void> {
  log('community', 'Processing open DM conversations...');
  const suggestions = await commentEngine.processDMs();
  log('community', `DM processing done: ${suggestions.length} response suggestions generated`);
}

// ============================================================================
// TRENDS JOBS — Trend detection & prediction
// ============================================================================

async function detectTrends(): Promise<void> {
  log('trends', 'Running cross-platform trend detection...');

  // Use the trend predictor engine for full signal analysis
  const trends = await trendPredictor.detectEmergingTrends();
  log('trends', `Detected ${trends.length} emerging trends`);

  // Auto-generate scripts for high-confidence trends that recommend immediate action
  const highConfidenceTrends = trends.filter(
    (t) => t.recommended_action === 'create_immediately' || t.recommended_action === 'create_content_immediately',
  );

  if (highConfidenceTrends.length > 0) {
    log('trends', `Auto-generating scripts for ${highConfidenceTrends.length} high-confidence trends`);
    for (const trend of highConfidenceTrends) {
      try {
        const script = await scriptGenerator.generateScript(
          `TRENDING: ${trend.topic}`,
          'breaking_news',
        );
        log('trends', `Generated script ${script.id} for trending topic "${trend.topic}"`);
      } catch (err) {
        logError('trends', `Failed to auto-generate script for trend "${trend.topic}"`, err);
      }
    }
  }

  // Also evaluate past predictions to improve accuracy over time
  await trendPredictor.evaluatePastPredictions();
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
// HYPERGROWTH JOBS — Maximum velocity content pipeline
// ============================================================================

async function runBreakingNewsPipeline(): Promise<void> {
  const engine = await getHypergrowthEngine();
  const result = await engine.breakingNewsPipeline();
  if (result.triggered) {
    log('hypergrowth', `BREAKING NEWS: ${result.scriptIds.length} scripts created, ${result.scheduledPosts} posts scheduled`);
  }
}

async function runFillCalendar(): Promise<void> {
  const engine = await getHypergrowthEngine();
  const result = await engine.fillPostingCalendar();
  log('hypergrowth', `Calendar: ${result.slots_filled}/${result.total_slots} slots filled`);
}

async function runAdjustVolume(): Promise<void> {
  const engine = await getHypergrowthEngine();
  await engine.adjustVolume();
}

async function runTrendSpeedCheck(): Promise<void> {
  const engine = await getHypergrowthEngine();
  const result = await engine.trendSpeedCheck();
  if (result.scripts_created > 0) {
    log('hypergrowth', `SPEED CHECK: ${result.trends_found} trends, ${result.scripts_created} scripts created (beat competitors)`);
  }
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
  // WRITER — Content generation (HYPERGROWTH: 7 batches/day, not 1)
  // -------------------------------------------------------------------------
  cron.schedule('0 6 * * *', safeTask('writer:batch-morning', runDailyBatch));
  cron.schedule('0 9 * * *', safeTask('writer:batch-9am', runDailyBatch));
  cron.schedule('0 12 * * *', safeTask('writer:batch-noon', runDailyBatch));
  cron.schedule('0 15 * * *', safeTask('writer:batch-3pm', runDailyBatch));
  cron.schedule('0 18 * * *', safeTask('writer:batch-6pm', runDailyBatch));
  cron.schedule('0 21 * * *', safeTask('writer:batch-9pm', runDailyBatch));
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
  // TRENDS — Trend detection (HYPERGROWTH: every 15min, not 4h)
  // -------------------------------------------------------------------------
  cron.schedule('*/15 * * * *', safeTask('trends:detect', detectTrends));

  // -------------------------------------------------------------------------
  // HYPERGROWTH — Breaking news pipeline + calendar fill + volume scaling
  // -------------------------------------------------------------------------
  cron.schedule('*/5 * * * *', safeTask('hypergrowth:breaking-news', runBreakingNewsPipeline));
  cron.schedule('*/30 * * * *', safeTask('hypergrowth:fill-calendar', runFillCalendar));
  cron.schedule('0 */6 * * *', safeTask('hypergrowth:adjust-volume', runAdjustVolume));
  cron.schedule('*/15 * * * *', safeTask('hypergrowth:trend-speed', runTrendSpeedCheck));

  // -------------------------------------------------------------------------
  // SYSTEM — Health & maintenance
  // -------------------------------------------------------------------------
  cron.schedule('*/5 * * * *', safeTask('system:health-check', healthCheck));
  cron.schedule('0 0 * * *', safeTask('system:cleanup', cleanupOldData));

  log('system', '=== ALL CRON JOBS REGISTERED (HYPERGROWTH MODE) ===');
  log('system', 'Schedule summary:');
  log('system', '  Radar:        HN/10m, GitHub-releases/15m, Twitter/15m, Reddit/20m, GitHub-trending/30m, RSS/30m, PH/2h, YT/4h, arXiv/6h');
  log('system', '  Intel:        competitor-posts/3h, competitor-analytics/daily, gap-detection/6h');
  log('system', '  Writer:       7x daily batches (6AM,9AM,12PM,3PM,6PM,9PM), evergreen/Sunday');
  log('system', '  Distributor:  process-queue/1m');
  log('system', '  Brain:        analytics/4h, daily-rollup@11PM, weekly-optimization/Monday, projections/12h');
  log('system', '  Community:    comments/30m, DMs/2h');
  log('system', '  Trends:       detect/15m (hypergrowth speed)');
  log('system', '  Hypergrowth:  breaking-news/5m, fill-calendar/30m, adjust-volume/6h, trend-speed/15m');
  log('system', '  System:       health/5m, cleanup/daily');
  log('system', '  TARGET:       26+ posts/day, <5min breaking news response, 1M followers/30 days');
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
