// ============================================================================
// POST /api/radar/scan — Trigger manual scan of all sources
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import {
  fetchWithRetry,
  RateLimiter,
  isAIRelated,
  detectCategory,
  estimateImportance,
  logger,
  type ScrapedItem,
} from '@/scrapers/utils';

// ---------------------------------------------------------------------------
// Scanner: RSS feeds
// ---------------------------------------------------------------------------

async function scanRSS(rateLimiter: RateLimiter): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];
  const db = getDb();

  const { data: sources } = await db
    .from('source_configs')
    .select('*')
    .eq('type', 'rss')
    .eq('enabled', true);

  if (!sources || sources.length === 0) return items;

  for (const source of sources) {
    try {
      const res = await fetchWithRetry(source.url, {}, `rss:${source.name}`, rateLimiter);
      const text = await res.text();

      // Parse RSS XML — extract <item> elements
      const itemMatches = text.match(/<item[\s\S]*?<\/item>/gi) ?? [];

      for (const xmlItem of itemMatches) {
        const title = xmlItem.match(/<title><!\[CDATA\[(.*?)\]\]>|<title>(.*?)<\/title>/)?.[1]
          ?? xmlItem.match(/<title>(.*?)<\/title>/)?.[1]
          ?? '';
        const link = xmlItem.match(/<link>(.*?)<\/link>/)?.[1] ?? '';
        const description =
          xmlItem.match(/<description><!\[CDATA\[(.*?)\]\]>/)?.[1]
          ?? xmlItem.match(/<description>(.*?)<\/description>/)?.[1]
          ?? '';

        const combined = `${title} ${description}`;
        if (!isAIRelated(combined)) continue;

        items.push({
          source: 'rss',
          source_url: link,
          title: title.slice(0, 500),
          summary: description.replace(/<[^>]*>/g, '').slice(0, 1000),
          category: detectCategory(combined),
          importance_score: estimateImportance({}),
          raw_data: { feed_name: source.name, feed_url: source.url },
        });
      }
    } catch (err) {
      logger.error('rss', `Failed to scan feed ${source.name}`, err);
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Scanner: HackerNews
// ---------------------------------------------------------------------------

async function scanHackerNews(rateLimiter: RateLimiter): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];

  try {
    const res = await fetchWithRetry(
      'https://hacker-news.firebaseio.com/v0/topstories.json',
      {},
      'hackernews:top',
      rateLimiter,
    );
    const storyIds: number[] = await res.json();
    const topIds = storyIds.slice(0, 30);

    for (const id of topIds) {
      try {
        const storyRes = await fetchWithRetry(
          `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
          {},
          `hackernews:item:${id}`,
          rateLimiter,
        );
        const story = await storyRes.json();
        if (!story || story.type !== 'story') continue;

        const text = `${story.title ?? ''} ${story.text ?? ''}`;
        if (!isAIRelated(text)) continue;

        items.push({
          source: 'hackernews',
          source_url: story.url ?? `https://news.ycombinator.com/item?id=${id}`,
          title: (story.title ?? '').slice(0, 500),
          summary: (story.text ?? story.title ?? '').replace(/<[^>]*>/g, '').slice(0, 1000),
          category: detectCategory(text),
          importance_score: estimateImportance({
            score: story.score ?? 0,
            comments: story.descendants ?? 0,
          }),
          raw_data: {
            hn_id: id,
            score: story.score,
            comments: story.descendants,
            by: story.by,
          },
        });
      } catch (err) {
        logger.error('hackernews', `Failed to fetch story ${id}`, err);
      }
    }
  } catch (err) {
    logger.error('hackernews', 'Failed to fetch top stories', err);
  }

  return items;
}

// ---------------------------------------------------------------------------
// Scanner: Reddit
// ---------------------------------------------------------------------------

async function scanReddit(rateLimiter: RateLimiter): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];
  const subreddits = [
    'artificial',
    'MachineLearning',
    'LocalLLaMA',
    'ChatGPT',
    'singularity',
    'StableDiffusion',
  ];

  for (const sub of subreddits) {
    try {
      const res = await fetchWithRetry(
        `https://www.reddit.com/r/${sub}/hot.json?limit=15`,
        { headers: { Accept: 'application/json' } },
        `reddit:${sub}`,
        rateLimiter,
      );
      const data = await res.json();
      const posts = data?.data?.children ?? [];

      for (const post of posts) {
        const p = post.data;
        if (!p || p.stickied) continue;

        const text = `${p.title ?? ''} ${p.selftext ?? ''}`;
        if (!isAIRelated(text)) continue;

        items.push({
          source: 'reddit',
          source_url: `https://reddit.com${p.permalink}`,
          title: (p.title ?? '').slice(0, 500),
          summary: (p.selftext ?? p.title ?? '').slice(0, 1000),
          category: detectCategory(text),
          importance_score: estimateImportance({
            score: p.score ?? 0,
            comments: p.num_comments ?? 0,
          }),
          raw_data: {
            subreddit: sub,
            score: p.score,
            comments: p.num_comments,
            author: p.author,
            upvote_ratio: p.upvote_ratio,
          },
        });
      }
    } catch (err) {
      logger.error('reddit', `Failed to scan r/${sub}`, err);
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Persist scanned items (dedup by source_url)
// ---------------------------------------------------------------------------

async function persistItems(items: ScrapedItem[]): Promise<number> {
  if (items.length === 0) return 0;

  const db = getDb();
  let newCount = 0;

  for (const item of items) {
    // Check for duplicate
    const { data: existing } = await db
      .from('radar_items')
      .select('id')
      .eq('source_url', item.source_url)
      .limit(1);

    if (existing && existing.length > 0) continue;

    const { error } = await db.from('radar_items').insert({
      source: item.source,
      source_url: item.source_url,
      title: item.title,
      summary: item.summary,
      category: item.category,
      importance_score: item.importance_score,
      trending_velocity: 0,
      raw_data: item.raw_data,
      processed: false,
      posted: false,
    });

    if (!error) newCount++;
  }

  return newCount;
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(_req: NextRequest) {
  try {
    const rateLimiter = new RateLimiter(500);

    const [rssItems, hnItems, redditItems] = await Promise.allSettled([
      scanRSS(rateLimiter),
      scanHackerNews(rateLimiter),
      scanReddit(rateLimiter),
    ]);

    const allItems: ScrapedItem[] = [
      ...(rssItems.status === 'fulfilled' ? rssItems.value : []),
      ...(hnItems.status === 'fulfilled' ? hnItems.value : []),
      ...(redditItems.status === 'fulfilled' ? redditItems.value : []),
    ];

    const newItemCount = await persistItems(allItems);

    const errors: string[] = [];
    if (rssItems.status === 'rejected') errors.push(`RSS: ${rssItems.reason}`);
    if (hnItems.status === 'rejected') errors.push(`HackerNews: ${hnItems.reason}`);
    if (redditItems.status === 'rejected') errors.push(`Reddit: ${redditItems.reason}`);

    return NextResponse.json({
      success: true,
      data: {
        total_scanned: allItems.length,
        new_items: newItemCount,
        duplicates_skipped: allItems.length - newItemCount,
        sources: {
          rss: rssItems.status === 'fulfilled' ? rssItems.value.length : 0,
          hackernews: hnItems.status === 'fulfilled' ? hnItems.value.length : 0,
          reddit: redditItems.status === 'fulfilled' ? redditItems.value.length : 0,
        },
        errors: errors.length > 0 ? errors : undefined,
        scanned_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api:radar/scan] POST error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
