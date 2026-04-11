// ============================================================================
// Reddit Scraper - Scans AI subreddits via Reddit's free JSON API
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
import type { RadarItemCategory } from '@/types';

const SCRAPER = 'reddit';
const rateLimiter = new RateLimiter(2000); // Reddit is strict: ~30 req/min

const DEFAULT_SUBREDDITS = [
  'MachineLearning',
  'LocalLLaMA',
  'artificial',
  'singularity',
  'ChatGPT',
];

// ---------------------------------------------------------------------------
// Reddit JSON API types
// ---------------------------------------------------------------------------

interface RedditPost {
  data: {
    id: string;
    title: string;
    selftext: string;
    url: string;
    permalink: string;
    score: number;
    num_comments: number;
    created_utc: number;
    link_flair_text: string | null;
    subreddit: string;
    author: string;
    domain: string;
    is_self: boolean;
    over_18: boolean;
    thumbnail: string;
    ups: number;
    upvote_ratio: number;
  };
}

interface RedditListing {
  data: {
    children: RedditPost[];
    after: string | null;
  };
}

// ---------------------------------------------------------------------------
// Category detection using Reddit flair + keywords
// ---------------------------------------------------------------------------

function redditCategory(flair: string | null, title: string, selftext: string): RadarItemCategory {
  const flairLower = (flair || '').toLowerCase();
  const combined = `${flairLower} ${title} ${selftext}`;

  // Flair-specific mappings
  if (flairLower.includes('research') || flairLower.includes('paper')) return 'research_paper';
  if (flairLower.includes('project') || flairLower.includes('open source')) return 'open_source';
  if (flairLower.includes('news')) return 'industry_news';
  if (flairLower.includes('discussion')) return 'opinion';
  if (flairLower.includes('tutorial') || flairLower.includes('guide')) return 'tutorial';

  return detectCategory(combined);
}

// ---------------------------------------------------------------------------
// scanSubreddit - Fetch top/hot posts from a single subreddit
// ---------------------------------------------------------------------------

export async function scanSubreddit(
  subreddit: string,
  sort: 'hot' | 'new' | 'top' = 'hot',
  limit: number = 25,
): Promise<ScrapedItem[]> {
  logger.info(SCRAPER, `Scanning r/${subreddit} (${sort})...`);
  const items: ScrapedItem[] = [];

  try {
    const url = `https://www.reddit.com/r/${subreddit}/${sort}.json?limit=${limit}&t=day`;

    const response = await fetchWithRetry(
      url,
      {
        headers: {
          Accept: 'application/json',
        },
      },
      `reddit-${subreddit}`,
      rateLimiter,
    );

    const listing = (await response.json()) as RedditListing;

    if (!listing?.data?.children) {
      logger.warn(SCRAPER, `No posts returned for r/${subreddit}`);
      return items;
    }

    for (const post of listing.data.children) {
      const d = post.data;
      if (d.over_18) continue; // Skip NSFW

      const permalink = `https://www.reddit.com${d.permalink}`;
      const selftext = d.selftext || '';
      const category = redditCategory(d.link_flair_text, d.title, selftext);

      items.push({
        source: 'reddit',
        source_url: permalink,
        title: d.title,
        summary: truncate(selftext || d.url || d.title, 300),
        category,
        importance_score: estimateImportance({
          score: d.score,
          comments: d.num_comments,
        }),
        raw_data: {
          subreddit: d.subreddit,
          post_id: d.id,
          score: d.score,
          num_comments: d.num_comments,
          url: d.url,
          selftext: truncate(selftext, 1000),
          created_utc: d.created_utc,
          author: d.author,
          flair: d.link_flair_text,
          domain: d.domain,
          upvote_ratio: d.upvote_ratio,
          is_self: d.is_self,
        },
      });
    }

    logger.info(SCRAPER, `Found ${items.length} posts in r/${subreddit}`);
  } catch (err) {
    logger.error(SCRAPER, `Failed to scrape r/${subreddit}`, err);
  }

  return items;
}

// ---------------------------------------------------------------------------
// scanAll - Scans all default AI subreddits
// ---------------------------------------------------------------------------

export async function scanAll(subreddits: string[] = DEFAULT_SUBREDDITS): Promise<ScrapedItem[]> {
  logger.info(SCRAPER, `Scanning ${subreddits.length} subreddits...`);

  const allItems: ScrapedItem[] = [];

  // Sequential to respect Reddit rate limits
  for (const sub of subreddits) {
    try {
      const items = await scanSubreddit(sub);
      allItems.push(...items);
    } catch (err) {
      logger.error(SCRAPER, `Failed scanning r/${sub}`, err);
    }
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  const deduped = allItems.filter(item => {
    if (seen.has(item.source_url)) return false;
    seen.add(item.source_url);
    return true;
  });

  logger.info(SCRAPER, `Reddit scan complete: ${deduped.length} items total`);
  return deduped;
}
