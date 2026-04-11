// ============================================================================
// Competitor Post Scraper - Tracks competitor content and strategies
// ============================================================================

import * as cheerio from 'cheerio';
import Parser from 'rss-parser';
import {
  type ScrapedItem,
  fetchWithRetry,
  RateLimiter,
  logger,
  detectCategory,
  estimateImportance,
  truncate,
  withRetry,
} from './utils';
import type { Competitor, Platform } from '@/types';
import * as fs from 'fs';
import * as path from 'path';

const SCRAPER = 'competitor';
const rateLimiter = new RateLimiter(3000);

// ---------------------------------------------------------------------------
// RSS Parser
// ---------------------------------------------------------------------------

const rssParser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'ContentEmpire/1.0',
    Accept: 'application/rss+xml, application/xml, text/xml',
  },
});

// ---------------------------------------------------------------------------
// Monetization detection keywords
// ---------------------------------------------------------------------------

const MONETIZATION_KEYWORDS = [
  'link in bio', 'linkinbio', 'link below', 'check the link',
  'use code', 'discount', 'promo code', 'coupon',
  'free download', 'free guide', 'free template', 'free ebook',
  'course', 'masterclass', 'workshop', 'webinar',
  'sign up', 'subscribe', 'join', 'enroll',
  'limited time', 'exclusive offer', 'special offer',
  'affiliate', 'sponsored', 'ad ', '#ad', '#sponsored',
  'paid partnership', 'collaboration',
  'buy now', 'shop now', 'order now', 'get it here',
  'dm me', 'dm for', 'send me a dm',
  'newsletter', 'mailing list', 'email list',
  'membership', 'premium', 'pro plan', 'paid',
  'product', 'tool', 'app', 'software', 'saas',
];

const CTA_PATTERNS = [
  /(?:click|tap|check|hit)\s+(?:the\s+)?link/i,
  /(?:sign|opt)\s+(?:up|in)/i,
  /(?:follow|subscribe)\s+(?:for|to)/i,
  /(?:comment|reply|drop)\s+(?:below|your)/i,
  /(?:share|repost|retweet)\s+this/i,
  /(?:save|bookmark)\s+this/i,
  /(?:tag|mention)\s+(?:a\s+)?(?:friend|someone)/i,
  /(?:download|grab|get)\s+(?:your|my|the|our)/i,
];

// ---------------------------------------------------------------------------
// Topic classification keywords
// ---------------------------------------------------------------------------

const TOPIC_KEYWORDS: Record<string, string[]> = {
  ai_news: ['breaking', 'just released', 'announced', 'launches', 'introduces', 'update', 'news'],
  ai_tutorials: ['how to', 'tutorial', 'guide', 'step by step', 'learn', 'walkthrough', 'tips'],
  ai_tools: ['tool', 'app', 'software', 'platform', 'best', 'top 10', 'review', 'comparison'],
  ai_opinions: ['think', 'opinion', 'hot take', 'unpopular', 'controversial', 'debate', 'wrong'],
  ai_money: ['money', 'income', 'revenue', 'earn', 'monetize', 'freelance', 'business', 'startup'],
  ai_career: ['career', 'job', 'hire', 'resume', 'interview', 'skill', 'learning path', 'certification'],
  ai_drama: ['drama', 'controversy', 'fired', 'lawsuit', 'beef', 'exposed', 'scandal', 'backlash'],
};

// ---------------------------------------------------------------------------
// classifyPostTopic - Categorize content by keyword matching
// ---------------------------------------------------------------------------

export function classifyPostTopic(caption: string): string {
  const lower = caption.toLowerCase();
  let bestMatch = 'ai_news';
  let bestScore = 0;

  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    let score = 0;
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = topic;
    }
  }

  return bestMatch;
}

// ---------------------------------------------------------------------------
// detectMonetization - Detect product mentions, links, CTAs
// ---------------------------------------------------------------------------

export function detectMonetization(caption: string): {
  isMonetized: boolean;
  signals: string[];
  ctaDetected: boolean;
  productMentioned: string | null;
} {
  const lower = caption.toLowerCase();
  const signals: string[] = [];
  let ctaDetected = false;
  let productMentioned: string | null = null;

  // Check monetization keywords
  for (const keyword of MONETIZATION_KEYWORDS) {
    if (lower.includes(keyword.toLowerCase())) {
      signals.push(keyword);
    }
  }

  // Check CTA patterns
  for (const pattern of CTA_PATTERNS) {
    if (pattern.test(lower)) {
      ctaDetected = true;
      break;
    }
  }

  // Try to extract product mentions (URLs, @mentions of products)
  const urlMatch = caption.match(/(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/);
  if (urlMatch && !['twitter.com', 'instagram.com', 'youtube.com', 'tiktok.com', 'linkedin.com'].includes(urlMatch[1])) {
    productMentioned = urlMatch[1];
  }

  return {
    isMonetized: signals.length > 0,
    signals,
    ctaDetected,
    productMentioned,
  };
}

// ---------------------------------------------------------------------------
// extractHashtags - Pull hashtags from text
// ---------------------------------------------------------------------------

function extractHashtags(text: string): string[] {
  const matches = text.match(/#[\w]+/g);
  return matches ? matches.map(tag => tag.toLowerCase()) : [];
}

// ---------------------------------------------------------------------------
// Load competitor config
// ---------------------------------------------------------------------------

function loadCompetitors(): Competitor[] {
  try {
    const configPath = path.resolve(process.cwd(), 'config', 'competitors.json');
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw);
      const competitors = Array.isArray(parsed) ? parsed : parsed.competitors;
      if (Array.isArray(competitors) && competitors.length > 0) {
        logger.info(SCRAPER, `Loaded ${competitors.length} competitors from config`);
        return competitors as Competitor[];
      }
    }
  } catch (err) {
    logger.warn(SCRAPER, 'Could not load config/competitors.json', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Default competitors
  return [
    { handle: 'maboroshi_ai', platforms: ['tiktok', 'youtube_shorts'] as Platform[], tier: 'micro' },
    { handle: 'theaiadvantage', platforms: ['youtube_shorts', 'tiktok'] as Platform[], tier: 'macro' },
    { handle: 'aiJason', platforms: ['youtube_shorts'] as Platform[], tier: 'mid' },
    { handle: 'mattshumer_', platforms: ['twitter'] as Platform[], tier: 'micro' },
    { handle: 'riaborshi', platforms: ['tiktok', 'reels'] as Platform[], tier: 'micro' },
  ];
}

// ---------------------------------------------------------------------------
// Scrape YouTube channel via RSS (public, no auth)
// ---------------------------------------------------------------------------

async function scrapeYouTubeCompetitor(handle: string): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];

  try {
    await rateLimiter.wait();

    // Try channel handle-based feed first
    const feedUrl = `https://www.youtube.com/feeds/videos.xml?user=${handle}`;

    let feed;
    try {
      feed = await withRetry(
        () => rssParser.parseURL(feedUrl),
        `competitor-yt-${handle}`,
      );
    } catch {
      // Handle might be a custom URL, try @handle format via search
      logger.warn(SCRAPER, `YouTube RSS failed for ${handle}, skipping`);
      return items;
    }

    if (!feed.items) return items;

    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

    for (const entry of feed.items.slice(0, 10)) {
      const pubDate = entry.pubDate || entry.isoDate;
      if (pubDate && new Date(pubDate).getTime() < cutoff) continue;

      const title = (entry.title || '').trim();
      const description = (entry.contentSnippet || entry.content || '').replace(/<[^>]*>/g, '').trim();
      const link = entry.link || '';
      const hashtags = extractHashtags(title + ' ' + description);

      const monetization = detectMonetization(title + ' ' + description);
      const topic = classifyPostTopic(title + ' ' + description);

      items.push({
        source: 'competitor',
        source_url: link,
        title: `[${handle}] ${title}`,
        summary: truncate(description || title, 300),
        category: detectCategory(title + ' ' + description),
        importance_score: 35,
        raw_data: {
          competitor_handle: handle,
          platform: 'youtube_shorts',
          content: truncate(description, 1000),
          hashtags,
          posted_at: pubDate || null,
          topic_category: topic,
          monetization_detected: monetization.isMonetized,
          monetization_signals: monetization.signals,
          cta_detected: monetization.ctaDetected,
          product_mentioned: monetization.productMentioned,
        },
      });
    }
  } catch (err) {
    logger.error(SCRAPER, `Failed to scrape YouTube competitor: ${handle}`, err);
  }

  return items;
}

// ---------------------------------------------------------------------------
// Scrape Twitter/X competitor via Nitter RSS
// ---------------------------------------------------------------------------

async function scrapeTwitterCompetitor(handle: string): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];

  // Try Nitter instances
  const nitterInstances = [
    'https://nitter.privacydev.net',
    'https://nitter.poast.org',
    'https://nitter.net',
  ];

  for (const instance of nitterInstances) {
    try {
      await rateLimiter.wait();

      const feedUrl = `${instance}/${handle}/rss`;
      const feed = await withRetry(
        () => rssParser.parseURL(feedUrl),
        `competitor-twitter-${handle}`,
      );

      if (!feed.items) continue;

      const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;

      for (const entry of feed.items.slice(0, 15)) {
        const pubDate = entry.pubDate || entry.isoDate;
        if (pubDate && new Date(pubDate).getTime() < cutoff) continue;

        const content = (entry.contentSnippet || entry.content || entry.title || '')
          .replace(/<[^>]*>/g, '')
          .trim();
        const link = (entry.link || '')
          .replace(new RegExp(`^${instance.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), 'https://twitter.com');

        const hashtags = extractHashtags(content);
        const monetization = detectMonetization(content);
        const topic = classifyPostTopic(content);

        items.push({
          source: 'competitor',
          source_url: link,
          title: `[${handle}] ${truncate(content, 100)}`,
          summary: truncate(content, 300),
          category: detectCategory(content),
          importance_score: 30,
          raw_data: {
            competitor_handle: handle,
            platform: 'twitter',
            content: truncate(content, 1000),
            hashtags,
            posted_at: pubDate || null,
            topic_category: topic,
            monetization_detected: monetization.isMonetized,
            monetization_signals: monetization.signals,
            cta_detected: monetization.ctaDetected,
            product_mentioned: monetization.productMentioned,
          },
        });
      }

      // If we got results from this instance, don't try others
      if (items.length > 0) break;
    } catch {
      // Try next instance
      continue;
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Scrape generic web page for competitor content (fallback)
// ---------------------------------------------------------------------------

async function scrapeWebProfile(handle: string, platform: Platform): Promise<ScrapedItem[]> {
  // For platforms without public RSS/API, attempt a basic page scrape
  const items: ScrapedItem[] = [];

  const profileUrls: Record<string, string> = {
    tiktok: `https://www.tiktok.com/@${handle}`,
    reels: `https://www.instagram.com/${handle}/`,
    linkedin: `https://www.linkedin.com/in/${handle}/`,
  };

  const url = profileUrls[platform];
  if (!url) return items;

  try {
    await rateLimiter.wait();

    const response = await fetchWithRetry(url, {}, `competitor-web-${handle}`, rateLimiter);
    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract any structured data (JSON-LD)
    $('script[type="application/ld+json"]').each((_i, el) => {
      try {
        const data = JSON.parse($(el).html() || '');
        if (data && typeof data === 'object') {
          items.push({
            source: 'competitor',
            source_url: url,
            title: `[${handle}] Profile data from ${platform}`,
            summary: truncate(JSON.stringify(data), 300),
            category: 'industry_news',
            importance_score: 20,
            raw_data: {
              competitor_handle: handle,
              platform,
              structured_data: data,
              scraped_at: new Date().toISOString(),
            },
          });
        }
      } catch {
        // Invalid JSON-LD, skip
      }
    });

    // Extract meta description as a signal
    const metaDescription = $('meta[name="description"]').attr('content') ||
      $('meta[property="og:description"]').attr('content') || '';
    if (metaDescription && items.length === 0) {
      items.push({
        source: 'competitor',
        source_url: url,
        title: `[${handle}] ${platform} profile`,
        summary: truncate(metaDescription, 300),
        category: 'industry_news',
        importance_score: 15,
        raw_data: {
          competitor_handle: handle,
          platform,
          meta_description: metaDescription,
          scraped_at: new Date().toISOString(),
        },
      });
    }
  } catch (err) {
    logger.warn(SCRAPER, `Failed to scrape web profile for ${handle} on ${platform}`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return items;
}

// ---------------------------------------------------------------------------
// scanCompetitorPosts - Main function to scan all competitors
// ---------------------------------------------------------------------------

export async function scanCompetitorPosts(
  competitors?: Competitor[],
): Promise<ScrapedItem[]> {
  const competitorList = competitors || loadCompetitors();
  logger.info(SCRAPER, `Scanning ${competitorList.length} competitors...`);

  const allItems: ScrapedItem[] = [];

  for (const competitor of competitorList) {
    logger.info(SCRAPER, `Scanning competitor: ${competitor.handle} (${competitor.platforms.join(', ')})`);

    for (const platform of competitor.platforms) {
      try {
        let items: ScrapedItem[] = [];

        switch (platform) {
          case 'youtube_shorts':
            items = await scrapeYouTubeCompetitor(competitor.handle);
            break;
          case 'twitter':
            items = await scrapeTwitterCompetitor(competitor.handle);
            break;
          default:
            // Fallback to web scraping
            items = await scrapeWebProfile(competitor.handle, platform);
            break;
        }

        allItems.push(...items);
      } catch (err) {
        logger.error(SCRAPER, `Failed scanning ${competitor.handle} on ${platform}`, err);
      }
    }
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  const deduped = allItems.filter(item => {
    if (seen.has(item.source_url)) return false;
    seen.add(item.source_url);
    return true;
  });

  logger.info(SCRAPER, `Competitor scan complete: ${deduped.length} posts total`);
  return deduped;
}

// ---------------------------------------------------------------------------
// scanAll - Alias for scanCompetitorPosts with auto-loaded config
// ---------------------------------------------------------------------------

export async function scanAll(): Promise<ScrapedItem[]> {
  return scanCompetitorPosts();
}
