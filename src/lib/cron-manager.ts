// ============================================================================
// Content Empire — Cron Manager (runs inside Next.js process)
// ============================================================================
// Singleton that starts all background jobs when the dashboard is opened.
// No separate process needed — everything runs within the Next.js server.
// ============================================================================

import cron from 'node-cron';

const log = (cat: string, msg: string) =>
  console.log(`[${new Date().toISOString()}] [cron:${cat}] ${msg}`);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let initialized = false;
type CronTask = ReturnType<typeof cron.schedule>;
const tasks: Map<string, CronTask> = new Map();
const lastRunTimes: Map<string, Date> = new Map();
const lastErrors: Map<string, string> = new Map();

// ---------------------------------------------------------------------------
// Safe runner
// ---------------------------------------------------------------------------

function safeRun(name: string, fn: () => Promise<void>): () => void {
  return () => {
    log(name, 'Starting...');
    const start = Date.now();
    fn()
      .then(() => {
        const ms = Date.now() - start;
        log(name, `Done (${(ms / 1000).toFixed(1)}s)`);
        lastRunTimes.set(name, new Date());
        lastErrors.delete(name);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        log(name, `ERROR: ${msg}`);
        lastRunTimes.set(name, new Date());
        lastErrors.set(name, msg);
      });
  };
}

// ---------------------------------------------------------------------------
// Dynamic imports (avoid circular deps / bundling issues)
// ---------------------------------------------------------------------------

async function importScrapers() {
  const [hackernews, github, twitter, reddit, rss, producthunt, youtube, arxiv] =
    await Promise.all([
      import('@/scrapers/hackernews'),
      import('@/scrapers/github'),
      import('@/scrapers/twitter'),
      import('@/scrapers/reddit'),
      import('@/scrapers/rss'),
      import('@/scrapers/producthunt'),
      import('@/scrapers/youtube'),
      import('@/scrapers/arxiv'),
    ]);
  return { hackernews, github, twitter, reddit, rss, producthunt, youtube, arxiv };
}

async function persistItems(source: string, items: Array<{ source_url: string; title: string; summary?: string; category?: string; importance_score?: number; raw_data?: Record<string, unknown> }>) {
  const { getServerClient } = await import('@/lib/db');
  const db = getServerClient();
  if (items.length === 0) return;
  const rows = items.map(item => ({
    source,
    source_url: item.source_url,
    title: item.title,
    summary: item.summary ?? null,
    category: item.category ?? 'industry_news',
    importance_score: item.importance_score ?? 50,
    raw_data: item.raw_data ?? {},
    processed: false,
    posted: false,
  }));
  await db.from('radar_items').upsert(rows, { onConflict: 'source_url' });
  log('persist', `Saved ${rows.length} items from ${source}`);
}

// ---------------------------------------------------------------------------
// Job definitions
// ---------------------------------------------------------------------------

function registerJobs() {
  // --- RADAR (news scanning) ---
  tasks.set('radar:hackernews', cron.schedule('*/10 * * * *', safeRun('radar:hackernews', async () => {
    const s = await importScrapers();
    await persistItems('hackernews', await s.hackernews.scanFrontPage(30));
  })));

  tasks.set('radar:github', cron.schedule('*/15 * * * *', safeRun('radar:github', async () => {
    const s = await importScrapers();
    await persistItems('github_releases', await s.github.scanReleases());
  })));

  tasks.set('radar:twitter', cron.schedule('*/15 * * * *', safeRun('radar:twitter', async () => {
    const s = await importScrapers();
    await persistItems('twitter', await s.twitter.scanAccounts());
  })));

  tasks.set('radar:reddit', cron.schedule('*/20 * * * *', safeRun('radar:reddit', async () => {
    const s = await importScrapers();
    await persistItems('reddit', await s.reddit.scanAll());
  })));

  tasks.set('radar:rss', cron.schedule('*/30 * * * *', safeRun('radar:rss', async () => {
    const s = await importScrapers();
    await persistItems('rss', await s.rss.scanFeeds());
  })));

  tasks.set('radar:producthunt', cron.schedule('0 */2 * * *', safeRun('radar:producthunt', async () => {
    const s = await importScrapers();
    await persistItems('producthunt', await s.producthunt.scanDaily());
  })));

  tasks.set('radar:youtube', cron.schedule('0 */4 * * *', safeRun('radar:youtube', async () => {
    const s = await importScrapers();
    await persistItems('youtube', await s.youtube.scanChannels());
  })));

  tasks.set('radar:arxiv', cron.schedule('0 */6 * * *', safeRun('radar:arxiv', async () => {
    const s = await importScrapers();
    await persistItems('arxiv', await s.arxiv.scanAll());
  })));

  // --- WRITER (script generation — 7x daily for hypergrowth) ---
  const writerJob = safeRun('writer:batch', async () => {
    const gen = await import('@/engines/script-generator');
    await gen.generateDailyBatch();
  });
  for (const hour of [6, 9, 12, 15, 18, 21]) {
    tasks.set(`writer:batch-${hour}`, cron.schedule(`0 ${hour} * * *`, writerJob));
  }

  // --- DISTRIBUTOR (post queue — every minute) ---
  tasks.set('distributor:queue', cron.schedule('* * * * *', safeRun('distributor:queue', async () => {
    const { getServerClient: getDb } = await import('@/lib/db');
    const db = getDb();
    const { data: due } = await db
      .from('posting_queue')
      .select('id')
      .eq('status', 'scheduled')
      .lte('scheduled_at', new Date().toISOString())
      .limit(5);
    if (due && due.length > 0) {
      const engine = await import('@/engines/posting-engine');
      await engine.processPostingQueue();
    }
  })));

  // --- BRAIN (analytics) ---
  tasks.set('brain:analytics', cron.schedule('0 */4 * * *', safeRun('brain:analytics', async () => {
    const engine = await import('@/engines/analytics-engine');
    await engine.scrapeAnalytics();
  })));

  tasks.set('brain:optimization', cron.schedule('0 0 * * 1', safeRun('brain:optimization', async () => {
    const engine = await import('@/engines/optimizer');
    await engine.weeklyOptimization();
  })));

  // --- COMMUNITY ---
  tasks.set('community:comments', cron.schedule('*/30 * * * *', safeRun('community:comments', async () => {
    const engine = await import('@/engines/comment-engine');
    await engine.processComments();
  })));

  // --- TRENDS (every 15 min for hypergrowth) ---
  tasks.set('trends:detect', cron.schedule('*/15 * * * *', safeRun('trends:detect', async () => {
    const engine = await import('@/engines/trend-predictor');
    await engine.detectEmergingTrends();
  })));

  // --- HYPERGROWTH ---
  tasks.set('hypergrowth:breaking', cron.schedule('*/5 * * * *', safeRun('hypergrowth:breaking', async () => {
    const engine = await import('@/engines/hypergrowth-engine');
    await engine.breakingNewsPipeline();
  })));

  tasks.set('hypergrowth:calendar', cron.schedule('*/30 * * * *', safeRun('hypergrowth:calendar', async () => {
    const engine = await import('@/engines/hypergrowth-engine');
    await engine.fillPostingCalendar();
  })));

  tasks.set('hypergrowth:volume', cron.schedule('0 */6 * * *', safeRun('hypergrowth:volume', async () => {
    const engine = await import('@/engines/hypergrowth-engine');
    await engine.adjustVolume();
  })));

  tasks.set('hypergrowth:speed', cron.schedule('*/15 * * * *', safeRun('hypergrowth:speed', async () => {
    const engine = await import('@/engines/hypergrowth-engine');
    await engine.trendSpeedCheck();
  })));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function ensureCronStarted(): boolean {
  if (initialized) return false; // already running
  initialized = true;
  log('system', '🚀 Starting Content Empire background engine...');
  registerJobs();
  log('system', `✅ ${tasks.size} cron jobs registered. System is LIVE.`);
  return true;
}

export function stopAll(): void {
  for (const [name, task] of tasks) {
    task.stop();
    log('system', `Stopped: ${name}`);
  }
  tasks.clear();
  initialized = false;
}

export function isRunning(): boolean {
  return initialized;
}

export function getStatus(): {
  running: boolean;
  jobs: Array<{
    name: string;
    lastRun: string | null;
    lastError: string | null;
    status: 'healthy' | 'error' | 'pending';
  }>;
  totalJobs: number;
} {
  const jobs = Array.from(tasks.keys()).map(name => ({
    name,
    lastRun: lastRunTimes.get(name)?.toISOString() || null,
    lastError: lastErrors.get(name) || null,
    status: (lastErrors.has(name) ? 'error' : lastRunTimes.has(name) ? 'healthy' : 'pending') as 'healthy' | 'error' | 'pending',
  }));

  return { running: initialized, jobs, totalJobs: tasks.size };
}
