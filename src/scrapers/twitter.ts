// ============================================================================
// Twitter/X Scraper - Uses Nitter RSS bridge for public account feeds
// ============================================================================

import Parser from 'rss-parser';
import {
  type ScrapedItem,
  RateLimiter,
  logger,
  detectCategory,
  estimateImportance,
  truncate,
  withRetry,
  isAIRelated,
} from './utils';

const SCRAPER = 'twitter';
const rateLimiter = new RateLimiter(3000); // Conservative for Nitter instances

// Default AI accounts to track
const DEFAULT_HANDLES = [
  'OpenAI',
  'AnthropicAI',
  'GoogleAI',
  'MetaAI',
  'ylecun',
  'karpathy',
  'elonmusk',
  'sama',
];

// Nitter instances (public mirrors of Twitter via RSS)
// These rotate; we try multiple and use whichever works
const NITTER_INSTANCES = [
  'https://nitter.privacydev.net',
  'https://nitter.poast.org',
  'https://nitter.woodland.cafe',
  'https://nitter.net',
];

// ---------------------------------------------------------------------------
// RSS Parser instance
// ---------------------------------------------------------------------------

const rssParser = new Parser({
  timeout: 15000,
});

// ---------------------------------------------------------------------------
// findWorkingInstance - Find a Nitter instance that responds
// ---------------------------------------------------------------------------

let cachedInstance: string | null = null;
let instanceCheckedAt = 0;
const INSTANCE_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

async function findWorkingInstance(): Promise<string | null> {
  // Use cached instance if still fresh
  if (cachedInstance && Date.now() - instanceCheckedAt < INSTANCE_CACHE_TTL) {
    return cachedInstance;
  }

  for (const instance of NITTER_INSTANCES) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(instance, {
        signal: controller.signal,
        headers: { 'User-Agent': 'ContentEmpire/1.0' },
      });

      clearTimeout(timeoutId);

      if (response.ok || response.status === 302) {
        cachedInstance = instance;
        instanceCheckedAt = Date.now();
        logger.info(SCRAPER, `Using Nitter instance: ${instance}`);
        return instance;
      }
    } catch {
      // This instance is down, try next
    }
  }

  logger.warn(SCRAPER, 'No Nitter instances available');
  return null;
}

// ---------------------------------------------------------------------------
// parseTweetText - Extract meaningful text from RSS content
// ---------------------------------------------------------------------------

function parseTweetText(content: string): { text: string; hasMedia: boolean } {
  // Remove HTML tags but preserve text
  let text = content
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

  const hasMedia = /\.(jpg|png|gif|mp4|webp)/i.test(content) ||
    content.includes('pic.twitter.com') ||
    content.includes('video');

  return { text, hasMedia };
}

// ---------------------------------------------------------------------------
// scanAccount - Fetch RSS feed for a single Twitter account
// ---------------------------------------------------------------------------

async function scanAccount(
  handle: string,
  nitterUrl: string,
): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];
  const cleanHandle = handle.replace(/^@/, '');

  try {
    await rateLimiter.wait();

    const feedUrl = `${nitterUrl}/${cleanHandle}/rss`;

    const feed = await withRetry(
      () => rssParser.parseURL(feedUrl),
      `twitter-${cleanHandle}`,
    );

    if (!feed.items || feed.items.length === 0) {
      logger.warn(SCRAPER, `No tweets found for @${cleanHandle}`);
      return items;
    }

    // Only process recent tweets (last 48 hours)
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;

    for (const entry of feed.items) {
      try {
        const pubDate = entry.pubDate || entry.isoDate;
        if (pubDate && new Date(pubDate).getTime() < cutoff) continue;

        const rawContent = entry.contentSnippet || entry.content || entry.title || '';
        const { text, hasMedia } = parseTweetText(rawContent);

        if (!text) continue;

        // Build the real Twitter URL from the Nitter link
        const nitterLink = entry.link || '';
        const twitterUrl = nitterLink
          .replace(new RegExp(`^${nitterUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), 'https://twitter.com')
          .replace(/\/nitter\//g, '/');

        items.push({
          source: 'twitter',
          source_url: twitterUrl || `https://twitter.com/${cleanHandle}`,
          title: truncate(text, 120),
          summary: truncate(text, 300),
          category: detectCategory(text),
          importance_score: estimateImportance({}), // No engagement data from RSS
          raw_data: {
            handle: cleanHandle,
            full_text: truncate(text, 1000),
            published_at: pubDate || null,
            has_media: hasMedia,
            original_url: twitterUrl,
          },
        });
      } catch (err) {
        logger.warn(SCRAPER, `Failed to parse tweet from @${cleanHandle}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info(SCRAPER, `Found ${items.length} tweets from @${cleanHandle}`);
  } catch (err) {
    logger.error(SCRAPER, `Failed to fetch feed for @${cleanHandle}`, err);
  }

  return items;
}

// ---------------------------------------------------------------------------
// scanAccounts - Scrape RSS feeds for key AI accounts
// ---------------------------------------------------------------------------

export async function scanAccounts(
  handles: string[] = DEFAULT_HANDLES,
): Promise<ScrapedItem[]> {
  logger.info(SCRAPER, `Scanning ${handles.length} Twitter accounts...`);

  const nitterUrl = await findWorkingInstance();
  if (!nitterUrl) {
    logger.error(SCRAPER, 'No working Nitter instance found. Twitter scraping unavailable.');
    return [];
  }

  const allItems: ScrapedItem[] = [];

  // Sequential to respect rate limits
  for (const handle of handles) {
    try {
      const items = await scanAccount(handle, nitterUrl);
      allItems.push(...items);
    } catch (err) {
      logger.error(SCRAPER, `Failed scanning @${handle}`, err);
    }
  }

  logger.info(SCRAPER, `Twitter scan complete: ${allItems.length} tweets total`);
  return allItems;
}

// ---------------------------------------------------------------------------
// scanAll - Default scan of all configured accounts
// ---------------------------------------------------------------------------

export async function scanAll(): Promise<ScrapedItem[]> {
  return scanAccounts();
}
