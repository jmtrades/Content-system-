// ============================================================================
// arXiv RSS Scraper - AI research papers from arXiv feeds
// ============================================================================

import Parser from 'rss-parser';
import {
  type ScrapedItem,
  RateLimiter,
  logger,
  truncate,
  withRetry,
} from './utils';

const SCRAPER = 'arxiv';
const rateLimiter = new RateLimiter(3000); // Be polite to arXiv

// arXiv RSS feeds for AI-related categories
const ARXIV_CATEGORIES = [
  { id: 'cs.AI', name: 'Artificial Intelligence' },
  { id: 'cs.CL', name: 'Computation and Language (NLP)' },
  { id: 'cs.LG', name: 'Machine Learning' },
];

// ---------------------------------------------------------------------------
// RSS Parser instance
// ---------------------------------------------------------------------------

const rssParser = new Parser({
  customFields: {
    item: [
      ['dc:creator', 'creator'],
      ['arxiv:comment', 'arxivComment'],
      ['arxiv:primary_category', 'primaryCategory', { keepArray: false }],
    ],
  },
  timeout: 30000,
});

// ---------------------------------------------------------------------------
// parseArxivId - Extract arXiv ID from URL
// ---------------------------------------------------------------------------

function parseArxivId(url: string): string {
  // e.g., http://arxiv.org/abs/2401.12345 -> 2401.12345
  const match = url.match(/(\d{4}\.\d{4,5})(v\d+)?/);
  return match ? match[1] : url;
}

// ---------------------------------------------------------------------------
// parseAuthors - Extract clean author list
// ---------------------------------------------------------------------------

function parseAuthors(creator: string | undefined): string[] {
  if (!creator) return [];
  // arXiv RSS uses <dc:creator> with comma or newline separated authors
  return creator
    .split(/[,\n]/)
    .map(a => a.replace(/<[^>]*>/g, '').trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// scanCategory - Fetch RSS feed for a single arXiv category
// ---------------------------------------------------------------------------

async function scanCategory(categoryId: string, categoryName: string): Promise<ScrapedItem[]> {
  logger.info(SCRAPER, `Scanning arXiv ${categoryId} (${categoryName})...`);
  const items: ScrapedItem[] = [];

  try {
    await rateLimiter.wait();

    const feed = await withRetry(
      () => rssParser.parseURL(`https://export.arxiv.org/rss/${categoryId}`),
      `arxiv-${categoryId}`,
    );

    if (!feed.items || feed.items.length === 0) {
      logger.warn(SCRAPER, `No items in arXiv ${categoryId} feed`);
      return items;
    }

    for (const entry of feed.items) {
      try {
        const title = (entry.title || '').replace(/\s+/g, ' ').trim();
        if (!title) continue;

        const link = entry.link || '';
        const arxivId = parseArxivId(link);

        // arXiv RSS description contains the abstract
        const rawDescription = entry.contentSnippet || entry.content || entry.summary || '';
        const abstract = rawDescription
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        const authors = parseAuthors(
          (entry as unknown as Record<string, unknown>).creator as string | undefined,
        );
        const published = entry.pubDate || entry.isoDate || '';

        // Importance based on whether it's a replacement or new submission
        const isNew = !title.toLowerCase().includes('replaced');
        const baseImportance = isNew ? 40 : 25;

        // Boost for papers mentioning key topics
        let importance = baseImportance;
        const lowerTitle = title.toLowerCase();
        if (/gpt|llm|large language|transformer|diffusion|attention/i.test(lowerTitle)) {
          importance += 15;
        }
        if (/state.of.the.art|sota|breakthrough|novel|first/i.test(lowerTitle)) {
          importance += 10;
        }

        items.push({
          source: 'arxiv',
          source_url: link,
          title: title.replace(/^\(.*?\)\s*/, ''), // Remove category prefix
          summary: truncate(abstract, 300),
          category: 'research_paper',
          importance_score: Math.min(100, importance),
          raw_data: {
            arxiv_id: arxivId,
            authors,
            abstract: truncate(abstract, 1500),
            categories: categoryId,
            category_name: categoryName,
            published: published,
            is_new: isNew,
          },
        });
      } catch (err) {
        logger.warn(SCRAPER, 'Failed to parse arXiv entry', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info(SCRAPER, `Found ${items.length} papers in arXiv ${categoryId}`);
  } catch (err) {
    logger.error(SCRAPER, `Failed to fetch arXiv ${categoryId} RSS`, err);
  }

  return items;
}

// ---------------------------------------------------------------------------
// scanCategories - Fetch all configured arXiv categories
// ---------------------------------------------------------------------------

export async function scanCategories(): Promise<ScrapedItem[]> {
  logger.info(SCRAPER, `Scanning ${ARXIV_CATEGORIES.length} arXiv categories...`);

  const allItems: ScrapedItem[] = [];

  // Sequential to respect rate limits
  for (const cat of ARXIV_CATEGORIES) {
    try {
      const items = await scanCategory(cat.id, cat.name);
      allItems.push(...items);
    } catch (err) {
      logger.error(SCRAPER, `Failed scanning arXiv ${cat.id}`, err);
    }
  }

  // Deduplicate by arXiv ID (papers can appear in multiple categories)
  const seen = new Set<string>();
  const deduped = allItems.filter(item => {
    const key = String(item.raw_data.arxiv_id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  logger.info(SCRAPER, `arXiv scan complete: ${deduped.length} papers total`);
  return deduped;
}

// ---------------------------------------------------------------------------
// scanAll - Alias for scanCategories
// ---------------------------------------------------------------------------

export async function scanAll(): Promise<ScrapedItem[]> {
  return scanCategories();
}
