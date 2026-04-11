// ============================================================================
// YouTube Channel Scraper - AI channel RSS feeds
// ============================================================================

import Parser from 'rss-parser';
import {
  type ScrapedItem,
  RateLimiter,
  logger,
  detectCategory,
  truncate,
  withRetry,
  isAIRelated,
} from './utils';

const SCRAPER = 'youtube';
const rateLimiter = new RateLimiter(2000);

// ---------------------------------------------------------------------------
// Channel configuration - name + YouTube channel ID
// ---------------------------------------------------------------------------

interface YouTubeChannel {
  name: string;
  channelId: string;
}

const DEFAULT_CHANNELS: YouTubeChannel[] = [
  { name: 'Two Minute Papers', channelId: 'UCbfYPyITQ-7l4upoX8nvctg' },
  { name: 'Yannic Kilcher', channelId: 'UCZHmQk67mSJgfCCTn7xBfew' },
  { name: 'AI Explained', channelId: 'UCNJ1Ymd5yFuUPtn21xtRbbw' },
  { name: 'Matt Wolfe', channelId: 'UCJifBczgDnKC19wGD0N3YPg' },
  { name: 'TheAIGRID', channelId: 'UCiGlMiGJn2CVoFuEJqIFKKg' },
];

// ---------------------------------------------------------------------------
// RSS Parser instance
// ---------------------------------------------------------------------------

const rssParser = new Parser({
  customFields: {
    item: [
      ['media:group', 'mediaGroup'],
      ['media:thumbnail', 'mediaThumbnail'],
      ['yt:videoId', 'ytVideoId'],
      ['yt:channelId', 'ytChannelId'],
    ],
  },
  timeout: 15000,
});

// ---------------------------------------------------------------------------
// scanChannel - Fetch RSS feed for a single YouTube channel
// ---------------------------------------------------------------------------

async function scanChannel(channel: YouTubeChannel): Promise<ScrapedItem[]> {
  const items: ScrapedItem[] = [];

  try {
    await rateLimiter.wait();

    const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channel.channelId}`;

    const feed = await withRetry(
      () => rssParser.parseURL(feedUrl),
      `youtube-${channel.name}`,
    );

    if (!feed.items || feed.items.length === 0) {
      logger.warn(SCRAPER, `No videos found for ${channel.name}`);
      return items;
    }

    // Only get videos from the last 7 days
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

    for (const entry of feed.items) {
      try {
        const pubDate = entry.pubDate || entry.isoDate;
        if (pubDate && new Date(pubDate).getTime() < cutoff) continue;

        const title = (entry.title || '').trim();
        if (!title) continue;

        const entryAny = entry as unknown as Record<string, unknown>;
        const videoId =
          (entryAny.ytVideoId as string) ||
          (typeof entryAny.id === 'string' ? entryAny.id.replace('yt:video:', '') : '') ||
          '';
        const videoUrl = videoId
          ? `https://www.youtube.com/watch?v=${videoId}`
          : entry.link || '';

        // Extract thumbnail URL
        const mediaGroup = entryAny.mediaGroup as Record<string, unknown> | undefined;
        const mediaThumbnail = entryAny.mediaThumbnail as Record<string, string> | undefined;

        let thumbnailUrl = '';
        if (mediaThumbnail?.url) {
          thumbnailUrl = mediaThumbnail.url;
        } else if (mediaGroup) {
          const thumb = (mediaGroup as Record<string, unknown>)['media:thumbnail'] as Record<string, string> | undefined;
          if (thumb?.url) {
            thumbnailUrl = thumb.url;
          }
        }
        if (!thumbnailUrl && videoId) {
          thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
        }

        const description = entry.contentSnippet || entry.content || entry.summary || '';
        const cleanDescription = description
          .replace(/<[^>]*>/g, '')
          .replace(/\s+/g, ' ')
          .trim();

        // Importance: AI YouTubers are always relevant
        let importance = 50;
        if (isAIRelated(title)) importance += 15;
        if (/breaking|just released|announced|leaked|exclusive/i.test(title)) importance += 10;

        items.push({
          source: 'youtube',
          source_url: videoUrl,
          title,
          summary: truncate(cleanDescription || title, 300),
          category: detectCategory(title + ' ' + cleanDescription),
          importance_score: Math.min(100, importance),
          raw_data: {
            channel_name: channel.name,
            channel_id: channel.channelId,
            video_id: videoId,
            video_url: videoUrl,
            thumbnail_url: thumbnailUrl,
            published_at: pubDate || null,
            description: truncate(cleanDescription, 1000),
          },
        });
      } catch (err) {
        logger.warn(SCRAPER, `Failed to parse video from ${channel.name}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info(SCRAPER, `Found ${items.length} recent videos from ${channel.name}`);
  } catch (err) {
    logger.error(SCRAPER, `Failed to fetch feed for ${channel.name}`, err);
  }

  return items;
}

// ---------------------------------------------------------------------------
// scanChannels - Fetch all configured YouTube channels
// ---------------------------------------------------------------------------

export async function scanChannels(
  channels: YouTubeChannel[] = DEFAULT_CHANNELS,
): Promise<ScrapedItem[]> {
  logger.info(SCRAPER, `Scanning ${channels.length} YouTube channels...`);

  const allItems: ScrapedItem[] = [];

  // Sequential to be polite
  for (const channel of channels) {
    try {
      const items = await scanChannel(channel);
      allItems.push(...items);
    } catch (err) {
      logger.error(SCRAPER, `Failed scanning ${channel.name}`, err);
    }
  }

  // Deduplicate by video ID
  const seen = new Set<string>();
  const deduped = allItems.filter(item => {
    const key = String(item.raw_data.video_id || item.source_url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  logger.info(SCRAPER, `YouTube scan complete: ${deduped.length} videos total`);
  return deduped;
}

// ---------------------------------------------------------------------------
// scanAll - Alias for scanChannels with defaults
// ---------------------------------------------------------------------------

export async function scanAll(): Promise<ScrapedItem[]> {
  return scanChannels();
}
