// ============================================================================
// Hacker News Scraper - Front page and new stories via HN API
// ============================================================================

import {
  type ScrapedItem,
  fetchWithRetry,
  RateLimiter,
  logger,
  detectCategory,
  estimateImportance,
  truncate,
  isAIRelated,
} from './utils';

const SCRAPER = 'hackernews';
const rateLimiter = new RateLimiter(500); // HN API is generous
const HN_API = 'https://hacker-news.firebaseio.com/v0';

// ---------------------------------------------------------------------------
// HN API types
// ---------------------------------------------------------------------------

interface HNStory {
  id: number;
  title: string;
  url?: string;
  text?: string;
  score: number;
  by: string;
  time: number;
  descendants: number; // comment count
  type: string;
}

// ---------------------------------------------------------------------------
// fetchStory - Fetch a single story by ID
// ---------------------------------------------------------------------------

async function fetchStory(id: number): Promise<HNStory | null> {
  try {
    const response = await fetchWithRetry(
      `${HN_API}/item/${id}.json`,
      {},
      `hn-story-${id}`,
      rateLimiter,
    );
    const story = (await response.json()) as HNStory;
    if (!story || story.type !== 'story') return null;
    return story;
  } catch (err) {
    logger.warn(SCRAPER, `Failed to fetch story ${id}`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// storyToItem - Convert HN story to ScrapedItem
// ---------------------------------------------------------------------------

function storyToItem(story: HNStory): ScrapedItem {
  const sourceUrl = story.url || `https://news.ycombinator.com/item?id=${story.id}`;
  const hnUrl = `https://news.ycombinator.com/item?id=${story.id}`;
  const summary = story.text
    ? truncate(story.text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(), 300)
    : story.url || story.title;

  return {
    source: 'hackernews',
    source_url: hnUrl,
    title: story.title,
    summary,
    category: detectCategory(story.title + ' ' + (story.text || '')),
    importance_score: estimateImportance({
      score: story.score,
      comments: story.descendants || 0,
    }),
    raw_data: {
      hn_id: story.id,
      url: story.url || null,
      hn_url: hnUrl,
      score: story.score,
      num_comments: story.descendants || 0,
      author: story.by,
      created_utc: story.time,
      text: story.text ? truncate(story.text, 1000) : null,
    },
  };
}

// ---------------------------------------------------------------------------
// scanFrontPage - Top 30 stories, filtered for AI relevance
// ---------------------------------------------------------------------------

export async function scanFrontPage(limit: number = 30): Promise<ScrapedItem[]> {
  logger.info(SCRAPER, `Scanning HN front page (top ${limit})...`);
  const items: ScrapedItem[] = [];

  try {
    const response = await fetchWithRetry(
      `${HN_API}/topstories.json`,
      {},
      'hn-topstories',
      rateLimiter,
    );
    const storyIds = (await response.json()) as number[];

    if (!Array.isArray(storyIds)) {
      logger.warn(SCRAPER, 'Invalid topstories response');
      return items;
    }

    const topIds = storyIds.slice(0, limit);

    // Fetch stories in batches of 10 to avoid overwhelming the API
    const batchSize = 10;
    for (let i = 0; i < topIds.length; i += batchSize) {
      const batch = topIds.slice(i, i + batchSize);
      const stories = await Promise.all(batch.map(id => fetchStory(id)));

      for (const story of stories) {
        if (!story) continue;

        // Filter for AI-related stories
        const textToCheck = `${story.title} ${story.text || ''} ${story.url || ''}`;
        if (!isAIRelated(textToCheck)) continue;

        items.push(storyToItem(story));
      }
    }

    logger.info(SCRAPER, `Found ${items.length} AI-related stories on HN front page`);
  } catch (err) {
    logger.error(SCRAPER, 'Failed to scan HN front page', err);
  }

  return items;
}

// ---------------------------------------------------------------------------
// scanNewStories - Check newest stories for fresh AI content
// ---------------------------------------------------------------------------

export async function scanNewStories(limit: number = 50): Promise<ScrapedItem[]> {
  logger.info(SCRAPER, `Scanning HN new stories (${limit})...`);
  const items: ScrapedItem[] = [];

  try {
    const response = await fetchWithRetry(
      `${HN_API}/newstories.json`,
      {},
      'hn-newstories',
      rateLimiter,
    );
    const storyIds = (await response.json()) as number[];

    if (!Array.isArray(storyIds)) {
      logger.warn(SCRAPER, 'Invalid newstories response');
      return items;
    }

    const topIds = storyIds.slice(0, limit);

    const batchSize = 10;
    for (let i = 0; i < topIds.length; i += batchSize) {
      const batch = topIds.slice(i, i + batchSize);
      const stories = await Promise.all(batch.map(id => fetchStory(id)));

      for (const story of stories) {
        if (!story) continue;

        const textToCheck = `${story.title} ${story.text || ''} ${story.url || ''}`;
        if (!isAIRelated(textToCheck)) continue;

        items.push(storyToItem(story));
      }
    }

    logger.info(SCRAPER, `Found ${items.length} new AI stories on HN`);
  } catch (err) {
    logger.error(SCRAPER, 'Failed to scan HN new stories', err);
  }

  return items;
}

// ---------------------------------------------------------------------------
// scanAll - Convenience function to run both scans
// ---------------------------------------------------------------------------

export async function scanAll(): Promise<ScrapedItem[]> {
  logger.info(SCRAPER, 'Running full Hacker News scan...');

  const results = await Promise.allSettled([
    scanFrontPage(),
    scanNewStories(),
  ]);

  const items: ScrapedItem[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      items.push(...result.value);
    }
  }

  // Deduplicate by HN story ID
  const seen = new Set<string>();
  const deduped = items.filter(item => {
    const key = String(item.raw_data.hn_id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  logger.info(SCRAPER, `HN scan complete: ${deduped.length} items total`);
  return deduped;
}
