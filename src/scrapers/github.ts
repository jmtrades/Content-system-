// ============================================================================
// GitHub Scraper - Trending repos, releases, and new AI repositories
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
  daysAgo,
  isoDate,
} from './utils';

const SCRAPER = 'github';
const rateLimiter = new RateLimiter(1200); // ~50 req/min for unauthenticated

const DEFAULT_REPOS = [
  'openai/openai-python',
  'langchain-ai/langchain',
  'meta-llama/llama',
  'huggingface/transformers',
  'ollama/ollama',
  'ggerganov/llama.cpp',
  'AUTOMATIC1111/stable-diffusion-webui',
  'comfyanonymous/ComfyUI',
  'microsoft/autogen',
  'crewAI/crewAI',
];

// ---------------------------------------------------------------------------
// scanTrending - Scrapes github.com/trending?since=daily
// ---------------------------------------------------------------------------

export async function scanTrending(): Promise<ScrapedItem[]> {
  logger.info(SCRAPER, 'Scanning GitHub trending repositories...');
  const items: ScrapedItem[] = [];

  try {
    const response = await fetchWithRetry(
      'https://github.com/trending?since=daily',
      {},
      'github-trending',
      rateLimiter,
    );
    const html = await response.text();
    const $ = cheerio.load(html);

    $('article.Box-row').each((_i, el) => {
      try {
        const $el = $(el);

        // Repository name (owner/repo)
        const repoLink = $el.find('h2 a').attr('href')?.trim();
        if (!repoLink) return;
        const repoName = repoLink.replace(/^\//, '').trim();

        // Description
        const description = $el.find('p.col-9').text().trim() || 'No description';

        // Language
        const language = $el.find('[itemprop="programmingLanguage"]').text().trim() || 'Unknown';

        // Stars (total)
        const starsText = $el.find('a[href$="/stargazers"]').text().trim().replace(/,/g, '');
        const stars = parseInt(starsText, 10) || 0;

        // Forks
        const forksText = $el.find('a[href$="/forks"]').text().trim().replace(/,/g, '');
        const forks = parseInt(forksText, 10) || 0;

        // Stars today
        const starsTodayText = $el.find('span.d-inline-block.float-sm-right').text().trim();
        const starsTodayMatch = starsTodayText.match(/([\d,]+)\s+stars?\s+today/i);
        const starsToday = starsTodayMatch ? parseInt(starsTodayMatch[1].replace(/,/g, ''), 10) : 0;

        const sourceUrl = `https://github.com/${repoName}`;
        const title = `${repoName} trending on GitHub`;
        const summary = truncate(description, 300);

        items.push({
          source: 'github',
          source_url: sourceUrl,
          title,
          summary,
          category: detectCategory(`${repoName} ${description} open source github`),
          importance_score: estimateImportance({ stars, comments: starsToday }),
          raw_data: {
            repo_name: repoName,
            description,
            language,
            stars,
            forks,
            stars_today: starsToday,
          },
        });
      } catch (err) {
        logger.warn(SCRAPER, 'Failed to parse a trending repo row', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    logger.info(SCRAPER, `Found ${items.length} trending repositories`);
  } catch (err) {
    logger.error(SCRAPER, 'Failed to scrape GitHub trending', err);
  }

  return items;
}

// ---------------------------------------------------------------------------
// scanReleases - Checks GitHub API for latest releases on key repos
// ---------------------------------------------------------------------------

export async function scanReleases(repos: string[] = DEFAULT_REPOS): Promise<ScrapedItem[]> {
  logger.info(SCRAPER, `Scanning releases for ${repos.length} repositories...`);
  const items: ScrapedItem[] = [];

  for (const repo of repos) {
    try {
      const response = await fetchWithRetry(
        `https://api.github.com/repos/${repo}/releases?per_page=5`,
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
          },
        },
        `github-release-${repo}`,
        rateLimiter,
      );

      const releases = (await response.json()) as Array<{
        tag_name: string;
        name: string;
        body: string;
        html_url: string;
        published_at: string;
        prerelease: boolean;
        draft: boolean;
        author: { login: string };
        assets: Array<{ download_count: number }>;
      }>;

      if (!Array.isArray(releases)) continue;

      // Only include releases from the last 7 days
      const sevenDaysAgo = daysAgo(7).getTime();

      for (const release of releases) {
        if (release.draft) continue;
        const publishedAt = new Date(release.published_at).getTime();
        if (publishedAt < sevenDaysAgo) continue;

        const releaseName = release.name || release.tag_name;
        const body = release.body || '';
        const totalDownloads = release.assets.reduce(
          (sum, a) => sum + (a.download_count || 0),
          0,
        );

        items.push({
          source: 'github',
          source_url: release.html_url,
          title: `${repo} ${releaseName} released`,
          summary: truncate(body.replace(/\r?\n/g, ' '), 300),
          category: 'tool_update',
          importance_score: estimateImportance({ score: totalDownloads }),
          raw_data: {
            repo,
            tag_name: release.tag_name,
            release_name: releaseName,
            body: truncate(body, 1000),
            published_at: release.published_at,
            prerelease: release.prerelease,
            author: release.author?.login,
            total_downloads: totalDownloads,
          },
        });
      }

      logger.info(SCRAPER, `Checked releases for ${repo}`);
    } catch (err) {
      logger.error(SCRAPER, `Failed to fetch releases for ${repo}`, err);
    }
  }

  logger.info(SCRAPER, `Found ${items.length} recent releases`);
  return items;
}

// ---------------------------------------------------------------------------
// scanNewRepos - Finds new repos with 50+ stars in AI/ML topics (last 7 days)
// ---------------------------------------------------------------------------

export async function scanNewRepos(): Promise<ScrapedItem[]> {
  logger.info(SCRAPER, 'Scanning for new AI/ML repositories...');
  const items: ScrapedItem[] = [];

  const since = isoDate(daysAgo(7));

  // Search queries covering different AI/ML facets
  const queries = [
    `topic:artificial-intelligence stars:>50 created:>${since}`,
    `topic:machine-learning stars:>50 created:>${since}`,
    `topic:llm stars:>50 created:>${since}`,
    `topic:deep-learning stars:>50 created:>${since}`,
    `topic:generative-ai stars:>50 created:>${since}`,
  ];

  const seenRepos = new Set<string>();

  for (const query of queries) {
    try {
      const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=30`;

      const response = await fetchWithRetry(
        url,
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
          },
        },
        'github-search',
        rateLimiter,
      );

      const data = (await response.json()) as {
        items: Array<{
          full_name: string;
          html_url: string;
          description: string;
          stargazers_count: number;
          forks_count: number;
          language: string;
          topics: string[];
          created_at: string;
          owner: { login: string };
        }>;
      };

      if (!data.items || !Array.isArray(data.items)) continue;

      for (const repo of data.items) {
        if (seenRepos.has(repo.full_name)) continue;
        seenRepos.add(repo.full_name);

        const description = repo.description || 'No description';

        items.push({
          source: 'github',
          source_url: repo.html_url,
          title: `New AI repo: ${repo.full_name}`,
          summary: truncate(description, 300),
          category: 'open_source',
          importance_score: estimateImportance({ stars: repo.stargazers_count }),
          raw_data: {
            repo_name: repo.full_name,
            description,
            stars: repo.stargazers_count,
            forks: repo.forks_count,
            language: repo.language,
            topics: repo.topics,
            created_at: repo.created_at,
            owner: repo.owner?.login,
          },
        });
      }

      logger.info(SCRAPER, `Search query returned ${data.items.length} repos`);
    } catch (err) {
      logger.error(SCRAPER, `Failed GitHub search query`, err);
    }
  }

  logger.info(SCRAPER, `Found ${items.length} new AI/ML repositories`);
  return items;
}

// ---------------------------------------------------------------------------
// scanAll - Convenience function to run all GitHub scans
// ---------------------------------------------------------------------------

export async function scanAll(): Promise<ScrapedItem[]> {
  logger.info(SCRAPER, 'Running full GitHub scan...');

  const results = await Promise.allSettled([
    scanTrending(),
    scanReleases(),
    scanNewRepos(),
  ]);

  const items: ScrapedItem[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      items.push(...result.value);
    }
  }

  // Deduplicate by source_url
  const seen = new Set<string>();
  const deduped = items.filter(item => {
    if (seen.has(item.source_url)) return false;
    seen.add(item.source_url);
    return true;
  });

  logger.info(SCRAPER, `GitHub scan complete: ${deduped.length} items total`);
  return deduped;
}
