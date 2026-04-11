// ============================================================================
// Scraper Module Index - Barrel exports for all scrapers
// ============================================================================

export * as github from './github';
export * as reddit from './reddit';
export * as producthunt from './producthunt';
export * as hackernews from './hackernews';
export * as arxiv from './arxiv';
export * as twitter from './twitter';
export * as youtube from './youtube';
export * as rss from './rss';
export * as competitor from './competitor';

export type { ScrapedItem } from './utils';
export { isAIRelated, detectCategory, estimateImportance } from './utils';

// ---------------------------------------------------------------------------
// scanAllSources - Run all scrapers and return combined results
// ---------------------------------------------------------------------------

import * as github from './github';
import * as reddit from './reddit';
import * as producthunt from './producthunt';
import * as hackernews from './hackernews';
import * as arxiv from './arxiv';
import * as twitter from './twitter';
import * as youtube from './youtube';
import * as rss from './rss';
import * as competitor from './competitor';
import type { ScrapedItem } from './utils';
import { logger } from './utils';

export async function scanAllSources(): Promise<ScrapedItem[]> {
  logger.info('orchestrator', 'Starting full scan of all sources...');
  const startTime = Date.now();

  const results = await Promise.allSettled([
    github.scanAll(),
    reddit.scanAll(),
    producthunt.scanAll(),
    hackernews.scanAll(),
    arxiv.scanAll(),
    twitter.scanAll(),
    youtube.scanAll(),
    rss.scanAll(),
    competitor.scanAll(),
  ]);

  const scraperNames = [
    'github', 'reddit', 'producthunt', 'hackernews',
    'arxiv', 'twitter', 'youtube', 'rss', 'competitor',
  ];

  const allItems: ScrapedItem[] = [];

  results.forEach((result, idx) => {
    if (result.status === 'fulfilled') {
      logger.info('orchestrator', `${scraperNames[idx]}: ${result.value.length} items`);
      allItems.push(...result.value);
    } else {
      logger.error('orchestrator', `${scraperNames[idx]} failed`, result.reason);
    }
  });

  // Global deduplication by source_url
  const seen = new Set<string>();
  const deduped = allItems.filter(item => {
    const key = item.source_url.replace(/\/$/, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by importance
  deduped.sort((a, b) => b.importance_score - a.importance_score);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  logger.info('orchestrator', `Full scan complete in ${elapsed}s: ${deduped.length} items (${allItems.length - deduped.length} duplicates removed)`);

  return deduped;
}
