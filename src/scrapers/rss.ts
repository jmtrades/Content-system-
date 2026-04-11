// ============================================================================
// Generic RSS Feed Reader - Reads from config/sources.json
// ============================================================================

import Parser from 'rss-parser';
import {
  type ScrapedItem,
  RateLimiter,
  logger,
  detectCategory,
  truncate,
  withRetry,
} from './utils';
import type { RadarItemCategory } from '@/types';
import * as fs from 'fs';
import * as path from 'path';

const SCRAPER = 'rss';
const rateLimiter = new RateLimiter(2000);

// ---------------------------------------------------------------------------
// Feed configuration
// ---------------------------------------------------------------------------

export interface FeedConfig {
  name: string;
  url: string;
  category: string;
}

// Default feeds in case config/sources.json is not present
const DEFAULT_FEEDS: FeedConfig[] = [
  { name: 'OpenAI Blog', url: 'https://openai.com/blog/rss/', category: 'industry_news' },
  { name: 'Anthropic Blog', url: 'https://www.anthropic.com/feed', category: 'industry_news' },
  { name: 'Google AI Blog', url: 'https://blog.google/technology/ai/rss/', category: 'industry_news' },
  { name: 'Meta AI Blog', url: 'https://ai.meta.com/blog/rss/', category: 'industry_news' },
  { name: 'Hugging Face Blog', url: 'https://huggingface.co/blog/feed.xml', category: 'open_source' },
  { name: 'The Verge AI', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', category: 'industry_news' },
  { name: 'TechCrunch AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/', category: 'industry_news' },
  { name: 'MIT Tech Review AI', url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed', category: 'research_paper' },
  { name: 'Ars Technica AI', url: 'https://feeds.arstechnica.com/arstechnica/technology-lab', category: 'industry_news' },
  { name: 'Towards Data Science', url: 'https://towardsdatascience.com/feed', category: 'tutorial' },
];

// ---------------------------------------------------------------------------
// RSS Parser instance
// ---------------------------------------------------------------------------

const rssParser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'ContentEmpire/1.0 (RSS reader)',
    Accept: 'application/rss+xml, application/xml, text/xml, application/atom+xml',
  },
});

// ---------------------------------------------------------------------------
// loadFeedConfig - Load feeds from config/sources.json if available
// ---------------------------------------------------------------------------

function loadFeedConfig(): FeedConfig[] {
  try {
    const configPath = path.resolve(process.cwd(), 'config', 'sources.json');
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw);

      // Support both { feeds: [...] } and direct array
      const feeds = Array.isArray(parsed) ? parsed : parsed.feeds;
      if (Array.isArray(feeds) && feeds.length > 0) {
        logger.info(SCRAPER, `Loaded ${feeds.length} feeds from config/sources.json`);
        return feeds as FeedConfig[];
      }
    }
  } catch (err) {
    logger.warn(SCRAPER, 'Could not load config/sources.json, using defaults', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  logger.info(SCRAPER, `Using ${DEFAULT_FEEDS.length} default feeds`);
  return DEFAULT_FEEDS;
}

// ---------------------------------------------------------------------------
// scanFeed - Parse a single RSS feed
// ---------------------------------------------------------------------------

async function scanFeed(config: FeedConfig): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];

  try {
    await rateLimiter.wait();

    const feed = await withRetry(
      () => rssParser.parseURL(config.url),
      `rss-${config.name}`,
    );

    if (!feed.items || feed.items.length === 0) {
      logger.warn(SCRAPER, `No items in feed: ${config.name}`);
      return items;
    }

    // Only process items from the last 3 days
    const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;

    for (const entry of feed.items) {
      try {
        const pubDate = entry.pubDate || entry.isoDate;
        if (pubDate && new Date(pubDate).getTime() < cutoff) continue;

        const title = (entry.title || '').replace(/\s+/g, ' ').trim();
        if (!title) continue;

        const link = entry.link || '';
        if (!link) continue;

        const description =
          entry.contentSnippet ||
          entry.content ||
          entry.summary ||
          '';
        const cleanDescription = description
          .replace(/<[^>]*>/g, '')
          .replace(/\s+/g, ' ')
          .trim();

        // Use configured category if it maps to our enum, otherwise detect
        const configCategory = config.category as RadarItemCategory;
        const validCategories: RadarItemCategory[] = [
          'product_launch', 'research_paper', 'funding', 'open_source',
          'regulation', 'tutorial', 'opinion', 'industry_news',
          'tool_update', 'drama', 'breakthrough', 'hiring', 'acquisition',
        ];
        const category = validCategories.includes(configCategory)
          ? configCategory
          : detectCategory(title + ' ' + cleanDescription);

        const author = entry.creator || entry.author || '';

        items.push({
          source: 'rss',
          source_url: link,
          title,
          summary: truncate(cleanDescription || title, 300),
          category,
          importance_score: 40, // Base score for RSS, can be refined
          raw_data: {
            feed_name: config.name,
            feed_url: config.url,
            author,
            published_at: pubDate || null,
            description: truncate(cleanDescription, 1000),
            categories: entry.categories || [],
            guid: entry.guid || entry.id || link,
          },
        });
      } catch (err) {
        logger.warn(SCRAPER, `Failed to parse RSS entry from ${config.name}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info(SCRAPER, `Found ${items.length} articles from ${config.name}`);
  } catch (err) {
    logger.error(SCRAPER, `Failed to fetch feed: ${config.name} (${config.url})`, err);
  }

  return items;
}

// ---------------------------------------------------------------------------
// scanFeeds - Read all configured RSS feeds
// ---------------------------------------------------------------------------

export async function scanFeeds(feeds?: FeedConfig[]): Promise<ScrapedItem[]> {
  const feedList = feeds || loadFeedConfig();
  logger.info(SCRAPER, `Scanning ${feedList.length} RSS feeds...`);

  const allItems: ScrapedItem[] = [];

  // Sequential to respect rate limits
  for (const config of feedList) {
    try {
      const items = await scanFeed(config);
      allItems.push(...items);
    } catch (err) {
      logger.error(SCRAPER, `Failed scanning feed: ${config.name}`, err);
    }
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  const deduped = allItems.filter(item => {
    // Normalize URL for dedup
    const key = item.source_url.replace(/\/$/, '').replace(/\?.*$/, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  logger.info(SCRAPER, `RSS scan complete: ${deduped.length} articles total (${allItems.length - deduped.length} duplicates removed)`);
  return deduped;
}

// ---------------------------------------------------------------------------
// scanAll - Alias for scanFeeds with auto-loaded config
// ---------------------------------------------------------------------------

export async function scanAll(): Promise<ScrapedItem[]> {
  return scanFeeds();
}
