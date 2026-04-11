// ============================================================================
// Product Hunt Scraper - Daily top AI product launches
// ============================================================================

import * as cheerio from 'cheerio';
import {
  type ScrapedItem,
  fetchWithRetry,
  RateLimiter,
  logger,
  detectCategory,
  estimateImportance,
  truncate,
} from './utils';

const SCRAPER = 'producthunt';
const rateLimiter = new RateLimiter(3000); // Conservative rate limiting

// ---------------------------------------------------------------------------
// scanDaily - Scrapes today's top AI launches from Product Hunt
// ---------------------------------------------------------------------------

export async function scanDaily(): Promise<ScrapedItem[]> {
  logger.info(SCRAPER, 'Scanning Product Hunt AI launches...');
  const items: ScrapedItem[] = [];

  try {
    // Product Hunt topics page for AI
    const url = 'https://www.producthunt.com/topics/artificial-intelligence';

    const response = await fetchWithRetry(
      url,
      {
        headers: {
          Accept: 'text/html,application/xhtml+xml',
        },
      },
      'producthunt-ai',
      rateLimiter,
    );

    const html = await response.text();
    const $ = cheerio.load(html);

    // Product Hunt renders product cards in their page
    // They use various structures; try common selectors
    // Look for product list items / cards
    const selectors = [
      '[data-test="post-item"]',
      '.styles_item__Dk_nz',
      'div[class*="post"]',
      'a[href*="/posts/"]',
    ];

    let found = false;

    for (const selector of selectors) {
      const elements = $(selector);
      if (elements.length === 0) continue;
      found = true;

      elements.each((_i, el) => {
        try {
          const $el = $(el);

          // Try to extract product name
          const name =
            $el.find('h3').first().text().trim() ||
            $el.find('[data-test="post-name"]').text().trim() ||
            $el.find('strong').first().text().trim() ||
            '';

          if (!name) return;

          // Tagline / description
          const tagline =
            $el.find('p').first().text().trim() ||
            $el.find('[data-test="post-tagline"]').text().trim() ||
            '';

          // Votes / upvotes
          const votesText =
            $el.find('[data-test="vote-button"] span').text().trim() ||
            $el.find('button span').first().text().trim() ||
            '0';
          const votes = parseInt(votesText.replace(/[^\d]/g, ''), 10) || 0;

          // URL
          let productUrl = '';
          const linkEl = $el.is('a') ? $el : $el.find('a').first();
          const href = linkEl.attr('href') || '';
          if (href) {
            productUrl = href.startsWith('http')
              ? href
              : `https://www.producthunt.com${href}`;
          }

          if (!productUrl) return;

          items.push({
            source: 'producthunt',
            source_url: productUrl,
            title: name,
            summary: truncate(tagline || name, 300),
            category: 'product_launch',
            importance_score: estimateImportance({ votes }),
            raw_data: {
              name,
              tagline,
              votes,
              url: productUrl,
            },
          });
        } catch (err) {
          logger.warn(SCRAPER, 'Failed to parse a Product Hunt item', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });

      break; // Use the first selector that matches
    }

    // Fallback: try to extract from embedded JSON data (Next.js props)
    if (!found || items.length === 0) {
      logger.info(SCRAPER, 'Trying JSON extraction fallback...');

      // Look for __NEXT_DATA__ or similar embedded JSON
      const scriptTags = $('script[type="application/json"]');
      scriptTags.each((_i, el) => {
        try {
          const raw = $(el).html();
          if (!raw) return;
          const data = JSON.parse(raw);
          extractProductsFromJson(data, items);
        } catch {
          // Not valid JSON or wrong structure, skip
        }
      });

      // Also check script#__NEXT_DATA__
      const nextData = $('script#__NEXT_DATA__').html();
      if (nextData) {
        try {
          const data = JSON.parse(nextData);
          extractProductsFromJson(data, items);
        } catch {
          // Skip
        }
      }
    }

    logger.info(SCRAPER, `Found ${items.length} Product Hunt AI launches`);
  } catch (err) {
    logger.error(SCRAPER, 'Failed to scrape Product Hunt', err);
  }

  return items;
}

// ---------------------------------------------------------------------------
// Extract products from embedded JSON (Next.js hydration data)
// ---------------------------------------------------------------------------

function extractProductsFromJson(
  obj: unknown,
  items: ScrapedItem[],
  depth: number = 0,
): void {
  if (depth > 10 || !obj || typeof obj !== 'object') return;

  // Look for objects that look like products
  const record = obj as Record<string, unknown>;

  if (
    typeof record.name === 'string' &&
    typeof record.tagline === 'string' &&
    (typeof record.slug === 'string' || typeof record.url === 'string')
  ) {
    const name = record.name as string;
    const tagline = record.tagline as string;
    const slug = (record.slug as string) || '';
    const votesCount =
      typeof record.votesCount === 'number'
        ? record.votesCount
        : typeof record.votes_count === 'number'
          ? record.votes_count
          : 0;

    const productUrl = slug
      ? `https://www.producthunt.com/posts/${slug}`
      : (record.url as string) || '';

    if (productUrl && !items.some(i => i.source_url === productUrl)) {
      items.push({
        source: 'producthunt',
        source_url: productUrl,
        title: name,
        summary: truncate(tagline, 300),
        category: 'product_launch',
        importance_score: estimateImportance({ votes: votesCount }),
        raw_data: {
          name,
          tagline,
          votes: votesCount,
          slug,
          url: productUrl,
          description: typeof record.description === 'string' ? record.description : '',
        },
      });
    }
    return;
  }

  // Recurse into arrays and objects
  if (Array.isArray(obj)) {
    for (const item of obj) {
      extractProductsFromJson(item, items, depth + 1);
    }
  } else {
    for (const value of Object.values(record)) {
      if (value && typeof value === 'object') {
        extractProductsFromJson(value, items, depth + 1);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// scanAll - Alias for scanDaily
// ---------------------------------------------------------------------------

export async function scanAll(): Promise<ScrapedItem[]> {
  return scanDaily();
}
