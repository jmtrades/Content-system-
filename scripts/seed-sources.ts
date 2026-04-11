// ============================================================================
// Seed Sources - Populates the database with initial configuration data
// ============================================================================
// Usage:
//   npx tsx scripts/seed-sources.ts
// ============================================================================

import { readFileSync } from 'fs';
import path from 'path';
import { getServerClient } from '@/lib/db';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadJSON<T>(relativePath: string): T {
  const fullPath = path.join(process.cwd(), relativePath);
  const raw = readFileSync(fullPath, 'utf-8');
  return JSON.parse(raw) as T;
}

function log(section: string, message: string): void {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${section}] ${message}`);
}

function logError(section: string, message: string, err: unknown): void {
  const detail = err instanceof Error ? err.message : String(err);
  console.error(`[${section}] ERROR: ${message} — ${detail}`);
}

// ---------------------------------------------------------------------------
// Source configuration types (mirrors config/sources.json shape)
// ---------------------------------------------------------------------------

interface SourceEntry {
  id: string;
  name: string;
  type: string;
  url: string;
  category: string;
  check_interval_minutes: number;
  enabled: boolean;
  priority: number;
}

interface CompetitorEntry {
  handle: string;
  name: string;
  platforms: string[];
  tier: string;
  niche: string;
  estimated_followers: number;
  notes: string;
}

// ---------------------------------------------------------------------------
// 1. Seed radar_sources
// ---------------------------------------------------------------------------

async function seedRadarSources(): Promise<void> {
  log('sources', 'Loading config/sources.json...');
  const { sources } = loadJSON<{ sources: SourceEntry[] }>('config/sources.json');
  log('sources', `Found ${sources.length} sources to seed`);

  const db = getServerClient();

  const rows = sources.map((s) => ({
    source_id: s.id,
    name: s.name,
    type: s.type,
    url: s.url,
    category: s.category,
    check_interval_minutes: s.check_interval_minutes,
    enabled: s.enabled,
    priority: s.priority,
  }));

  const { data, error } = await db
    .from('radar_sources')
    .upsert(rows, { onConflict: 'source_id' })
    .select();

  if (error) {
    logError('sources', 'Failed to upsert radar_sources', error);
    // Fallback: log each source so the user knows what was attempted
    for (const s of sources) {
      log('sources', `  [LOGGED] ${s.id} — ${s.name} (${s.type}, priority ${s.priority})`);
    }
  } else {
    log('sources', `Successfully upserted ${data.length} radar sources`);
  }
}

// ---------------------------------------------------------------------------
// 2. Seed competitor tracking entries
// ---------------------------------------------------------------------------

async function seedCompetitors(): Promise<void> {
  log('competitors', 'Loading config/competitors.json...');
  const { competitors } = loadJSON<{ competitors: CompetitorEntry[] }>('config/competitors.json');
  log('competitors', `Found ${competitors.length} competitors to seed`);

  const db = getServerClient();

  // Create one tracking entry per competitor per platform
  const rows: Record<string, unknown>[] = [];
  for (const c of competitors) {
    for (const platform of c.platforms) {
      rows.push({
        competitor_handle: c.handle,
        competitor_name: c.name,
        platform,
        tier: c.tier,
        niche: c.niche,
        estimated_followers: c.estimated_followers,
        notes: c.notes,
        tracking_enabled: true,
      });
    }
  }

  const { data, error } = await db
    .from('competitor_tracking')
    .upsert(rows, { onConflict: 'competitor_handle,platform' })
    .select();

  if (error) {
    logError('competitors', 'Failed to upsert competitor_tracking', error);
    // Fallback: log entries
    for (const c of competitors) {
      log('competitors', `  [LOGGED] ${c.handle} — ${c.name} (${c.platforms.join(', ')})`);
    }
  } else {
    log('competitors', `Successfully upserted ${data.length} competitor tracking entries`);
  }
}

// ---------------------------------------------------------------------------
// 3. Seed content pillar configuration
// ---------------------------------------------------------------------------

async function seedContentPillars(): Promise<void> {
  log('pillars', 'Seeding content pillar configuration...');

  const pillars = [
    {
      name: 'breaking_news',
      description: 'Breaking AI news, launches, and industry-shaking announcements. First-mover content for maximum reach.',
      frequency: '0.30',
      monetization: 'audience_growth',
    },
    {
      name: 'tutorials_quickwins',
      description: 'Step-by-step tutorials and quick-win guides. High save rate content that drives affiliate and product revenue.',
      frequency: '0.25',
      monetization: 'affiliate_links',
    },
    {
      name: 'frameworks_insights',
      description: 'Original frameworks, mental models, and deep insights. Authority-building content that sells premium products.',
      frequency: '0.20',
      monetization: 'courses_premium',
    },
    {
      name: 'competitor_reactions',
      description: 'Reaction videos and commentary on competitor content. Leverages existing audiences for discovery.',
      frequency: '0.10',
      monetization: 'audience_growth',
    },
    {
      name: 'controversies_hot_takes',
      description: 'Controversial opinions and hot takes on AI trends. High engagement content for algorithm boost.',
      frequency: '0.10',
      monetization: 'engagement_boost',
    },
    {
      name: 'lifestyle_behind_scenes',
      description: 'Behind-the-scenes of building with AI. Personal brand content that deepens community connection.',
      frequency: '0.05',
      monetization: 'community_trust',
    },
  ];

  const db = getServerClient();

  const { data, error } = await db
    .from('content_pillar_config')
    .upsert(pillars, { onConflict: 'name' })
    .select();

  if (error) {
    logError('pillars', 'Failed to upsert content_pillar_config', error);
    for (const p of pillars) {
      log('pillars', `  [LOGGED] ${p.name} — frequency: ${p.frequency}, monetization: ${p.monetization}`);
    }
  } else {
    log('pillars', `Successfully upserted ${data.length} content pillars`);
  }
}

// ---------------------------------------------------------------------------
// 4. Seed initial products
// ---------------------------------------------------------------------------

async function seedProducts(): Promise<void> {
  log('products', 'Seeding initial products...');

  const products = [
    {
      name: 'Prompt Pack',
      slug: 'prompt-pack',
      price: 9.97,
      type: 'one_time',
      landing_page_url: '/go/prompts',
      active: true,
    },
    {
      name: 'The Operator Community',
      slug: 'operator-community',
      price: 97.00,
      type: 'subscription',
      landing_page_url: '/go/community',
      active: true,
    },
    {
      name: 'AI Mastery Course',
      slug: 'ai-mastery-course',
      price: 497.00,
      type: 'one_time',
      landing_page_url: '/go/course',
      active: true,
    },
    {
      name: 'Done-For-You AI Setup',
      slug: 'done-for-you-ai-setup',
      price: 2997.00,
      type: 'service',
      landing_page_url: '/go/setup',
      active: true,
    },
  ];

  const db = getServerClient();

  const { data, error } = await db
    .from('products')
    .upsert(products, { onConflict: 'slug' })
    .select();

  if (error) {
    logError('products', 'Failed to upsert products', error);
    for (const p of products) {
      log('products', `  [LOGGED] ${p.name} — ${p.price} GBP (${p.type})`);
    }
  } else {
    log('products', `Successfully upserted ${data.length} products`);
  }
}

// ---------------------------------------------------------------------------
// 5. Seed revenue targets
// ---------------------------------------------------------------------------

async function seedRevenueTargets(): Promise<void> {
  log('targets', 'Seeding initial revenue targets...');

  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay() + 1); // Monday
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);

  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const formatDate = (d: Date): string => d.toISOString().split('T')[0];

  const targets = [
    {
      period: 'daily',
      target_amount: 1000.00,
      actual_amount: 0,
      start_date: formatDate(today),
      end_date: formatDate(today),
      on_track: false,
    },
    {
      period: 'weekly',
      target_amount: 7000.00,
      actual_amount: 0,
      start_date: formatDate(startOfWeek),
      end_date: formatDate(endOfWeek),
      on_track: false,
    },
    {
      period: 'monthly',
      target_amount: 30000.00,
      actual_amount: 0,
      start_date: formatDate(startOfMonth),
      end_date: formatDate(endOfMonth),
      on_track: false,
    },
  ];

  const db = getServerClient();

  const { data, error } = await db
    .from('revenue_targets')
    .insert(targets)
    .select();

  if (error) {
    logError('targets', 'Failed to insert revenue_targets', error);
    for (const t of targets) {
      log('targets', `  [LOGGED] ${t.period} — target: ${t.target_amount} GBP (${t.start_date} to ${t.end_date})`);
    }
  } else {
    log('targets', `Successfully inserted ${data.length} revenue targets`);
  }
}

// ---------------------------------------------------------------------------
// 6. Seed smart links
// ---------------------------------------------------------------------------

async function seedSmartLinks(): Promise<void> {
  log('links', 'Seeding initial smart links...');

  const smartLinks = [
    {
      slug: 'go',
      destinations: {
        default: '/dashboard',
        tiktok: '/dashboard?utm_source=tiktok',
        reels: '/dashboard?utm_source=reels',
        youtube_shorts: '/dashboard?utm_source=youtube_shorts',
        twitter: '/dashboard?utm_source=twitter',
        linkedin: '/dashboard?utm_source=linkedin',
      },
      tracking: true,
    },
    {
      slug: 'community',
      destinations: {
        default: 'https://community.theoperator.ai',
        tiktok: 'https://community.theoperator.ai?utm_source=tiktok',
        reels: 'https://community.theoperator.ai?utm_source=reels',
        youtube_shorts: 'https://community.theoperator.ai?utm_source=youtube_shorts',
        twitter: 'https://community.theoperator.ai?utm_source=twitter',
        linkedin: 'https://community.theoperator.ai?utm_source=linkedin',
      },
      tracking: true,
    },
    {
      slug: 'prompts',
      destinations: {
        default: 'https://theoperator.ai/products/prompt-pack',
        tiktok: 'https://theoperator.ai/products/prompt-pack?utm_source=tiktok',
        reels: 'https://theoperator.ai/products/prompt-pack?utm_source=reels',
        youtube_shorts: 'https://theoperator.ai/products/prompt-pack?utm_source=youtube_shorts',
        twitter: 'https://theoperator.ai/products/prompt-pack?utm_source=twitter',
        linkedin: 'https://theoperator.ai/products/prompt-pack?utm_source=linkedin',
      },
      tracking: true,
    },
    {
      slug: 'course',
      destinations: {
        default: 'https://theoperator.ai/products/ai-mastery-course',
        tiktok: 'https://theoperator.ai/products/ai-mastery-course?utm_source=tiktok',
        reels: 'https://theoperator.ai/products/ai-mastery-course?utm_source=reels',
        youtube_shorts: 'https://theoperator.ai/products/ai-mastery-course?utm_source=youtube_shorts',
        twitter: 'https://theoperator.ai/products/ai-mastery-course?utm_source=twitter',
        linkedin: 'https://theoperator.ai/products/ai-mastery-course?utm_source=linkedin',
      },
      tracking: true,
    },
    {
      slug: 'setup',
      destinations: {
        default: 'https://theoperator.ai/products/done-for-you-ai-setup',
        tiktok: 'https://theoperator.ai/products/done-for-you-ai-setup?utm_source=tiktok',
        reels: 'https://theoperator.ai/products/done-for-you-ai-setup?utm_source=reels',
        youtube_shorts: 'https://theoperator.ai/products/done-for-you-ai-setup?utm_source=youtube_shorts',
        twitter: 'https://theoperator.ai/products/done-for-you-ai-setup?utm_source=twitter',
        linkedin: 'https://theoperator.ai/products/done-for-you-ai-setup?utm_source=linkedin',
      },
      tracking: true,
    },
  ];

  const db = getServerClient();

  const { data, error } = await db
    .from('smart_links')
    .upsert(smartLinks, { onConflict: 'slug' })
    .select();

  if (error) {
    logError('links', 'Failed to upsert smart_links', error);
    for (const l of smartLinks) {
      log('links', `  [LOGGED] /${l.slug} — ${Object.keys(l.destinations).length} destinations`);
    }
  } else {
    log('links', `Successfully upserted ${data.length} smart links`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('');
  console.log('============================================================================');
  console.log(' Content Empire - Database Seeder');
  console.log('============================================================================');
  console.log('');

  let exitCode = 0;

  const steps: [string, () => Promise<void>][] = [
    ['Radar Sources', seedRadarSources],
    ['Competitor Tracking', seedCompetitors],
    ['Content Pillars', seedContentPillars],
    ['Products', seedProducts],
    ['Revenue Targets', seedRevenueTargets],
    ['Smart Links', seedSmartLinks],
  ];

  for (const [label, fn] of steps) {
    try {
      await fn();
    } catch (err) {
      logError(label, `Unhandled error during seeding`, err);
      exitCode = 1;
    }
  }

  console.log('');
  if (exitCode === 0) {
    console.log('============================================================================');
    console.log(' Seeding complete! All data has been inserted.');
    console.log('============================================================================');
  } else {
    console.log('============================================================================');
    console.log(' Seeding finished with errors. Check the logs above for details.');
    console.log(' Tables that failed may not exist yet — run migrations first:');
    console.log('   supabase db push');
    console.log('============================================================================');
  }

  process.exit(exitCode);
}

main();
