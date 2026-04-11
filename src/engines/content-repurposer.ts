// ============================================================================
// Content Repurposer Engine — Transform one script into 10+ content formats
// ============================================================================
//
// Required table (run this migration in Supabase SQL editor):
//
// CREATE TABLE repurposed_content (
//   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//   script_id UUID NOT NULL,
//   format TEXT NOT NULL,
//   title TEXT,
//   content JSONB NOT NULL DEFAULT '{}',
//   platform TEXT,
//   status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
//   published_at TIMESTAMPTZ,
//   performance_score REAL,
//   created_at TIMESTAMPTZ NOT NULL DEFAULT now()
// );
//
// CREATE INDEX idx_repurposed_script ON repurposed_content(script_id);
// CREATE INDEX idx_repurposed_format ON repurposed_content(format);
// CREATE INDEX idx_repurposed_status ON repurposed_content(status);
// ============================================================================

import { getDb } from '@/lib/db';
import { getOllama } from '@/lib/ollama';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Script {
  id: string;
  topic: string;
  hook: string;
  body: string;
  cta: string;
  content_pillar: string;
  caption?: string;
  hashtags?: string[];
  estimated_duration?: number;
  created_at: string;
}

interface BlogOutline {
  title: string;
  meta_description: string;
  sections: Array<{
    heading: string;
    level: 'h1' | 'h2' | 'h3';
    key_points: string[];
    estimated_word_count: number;
  }>;
  suggested_internal_links: string[];
  seo_keywords: string[];
  estimated_read_time: number;
}

interface RepurposedContent {
  format: string;
  platform: string;
  title: string;
  content: unknown;
}

interface RepurposedRecord {
  id: string;
  script_id: string;
  format: string;
  title: string;
  content: unknown;
  platform: string;
  status: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(message: string): void {
  console.log(`[content-repurposer] ${new Date().toISOString()} ${message}`);
}

function logError(message: string, err: unknown): void {
  const detail = err instanceof Error ? err.message : String(err);
  console.error(`[content-repurposer] ${new Date().toISOString()} ERROR: ${message} -- ${detail}`);
}

// ---------------------------------------------------------------------------
// Helper: extract the full script text from its components
// ---------------------------------------------------------------------------

function buildFullScript(script: Script): string {
  const parts: string[] = [];
  if (script.hook) parts.push(`HOOK: ${script.hook}`);
  if (script.body) parts.push(`BODY: ${script.body}`);
  if (script.cta) parts.push(`CTA: ${script.cta}`);
  return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// repurposeContent — master function
// ---------------------------------------------------------------------------

/**
 * Takes a script ID, fetches the script, and generates 10+ content formats.
 * Each format is stored in the repurposed_content table and returned.
 */
export async function repurposeContent(scriptId: string): Promise<RepurposedContent[]> {
  const db = getDb();
  log(`Starting repurpose for script ${scriptId}`);

  // Fetch the script
  const { data: scriptRow, error: scriptError } = await db
    .from('scripts')
    .select('*')
    .eq('id', scriptId)
    .single();

  if (scriptError || !scriptRow) {
    logError(`Script ${scriptId} not found`, scriptError);
    throw new Error(`Script not found: ${scriptId}`);
  }

  const script = scriptRow as Script;
  log(`Repurposing script: "${script.topic}" (pillar=${script.content_pillar})`);

  // Generate all formats in parallel where possible
  const [
    twitterThread,
    linkedInPost,
    carouselSlides,
    blogOutline,
    newsletter,
    quoteCards,
    poll,
    behindTheScenes,
    controversialTake,
    tutorial,
  ] = await Promise.all([
    generateTwitterThread(script),
    generateLinkedInPost(script),
    generateCarouselSlides(script),
    generateBlogOutline(script),
    generateNewsletterSegment(script),
    generateQuoteCards(script),
    generateEngagementPoll(script),
    generateBehindTheScenes(script),
    generateControversialTake(script),
    generateTutorialVersion(script),
  ]);

  const outputs: RepurposedContent[] = [
    {
      format: 'twitter_thread',
      platform: 'twitter',
      title: `Thread: ${script.topic}`,
      content: twitterThread,
    },
    {
      format: 'linkedin_post',
      platform: 'linkedin',
      title: `LinkedIn: ${script.topic}`,
      content: linkedInPost,
    },
    {
      format: 'instagram_carousel',
      platform: 'instagram',
      title: `Carousel: ${script.topic}`,
      content: carouselSlides,
    },
    {
      format: 'blog_outline',
      platform: 'blog',
      title: blogOutline.title,
      content: blogOutline,
    },
    {
      format: 'newsletter',
      platform: 'email',
      title: `Newsletter: ${script.topic}`,
      content: newsletter,
    },
    {
      format: 'quote_cards',
      platform: 'instagram',
      title: `Quotes: ${script.topic}`,
      content: quoteCards,
    },
    {
      format: 'engagement_poll',
      platform: 'multi',
      title: `Poll: ${script.topic}`,
      content: poll,
    },
    {
      format: 'behind_the_scenes',
      platform: 'instagram',
      title: `BTS: ${script.topic}`,
      content: behindTheScenes,
    },
    {
      format: 'controversial_take',
      platform: 'twitter',
      title: `Hot Take: ${script.topic}`,
      content: controversialTake,
    },
    {
      format: 'tutorial',
      platform: 'blog',
      title: `How-To: ${script.topic}`,
      content: tutorial,
    },
  ];

  // Store all repurposed content in the database
  const insertRows = outputs.map((o) => ({
    script_id: scriptId,
    format: o.format,
    title: o.title,
    content: o.content,
    platform: o.platform,
    status: 'draft',
  }));

  const { error: insertError } = await db
    .from('repurposed_content')
    .insert(insertRows);

  if (insertError) {
    logError('Failed to store repurposed content', insertError);
  } else {
    log(`Stored ${insertRows.length} repurposed content items for script ${scriptId}`);
  }

  return outputs;
}

// ---------------------------------------------------------------------------
// generateTwitterThread
// ---------------------------------------------------------------------------

/**
 * Generates a Twitter/X thread of 5-10 tweets from the script.
 * Each tweet stays under 280 characters.
 */
export async function generateTwitterThread(script: Script): Promise<string[]> {
  const llm = getOllama();
  const fullScript = buildFullScript(script);

  const prompt = `You are an expert social media strategist specializing in Twitter/X threads.

Given this video script about "${script.topic}":

${fullScript}

Create a Twitter/X thread of 6-8 tweets that breaks down the key points. Rules:
1. Tweet 1 must be a strong hook that creates curiosity (max 280 chars)
2. Each subsequent tweet reveals one key insight or point
3. Use line breaks within tweets for readability
4. Include a "thread tax" tweet at the end asking for retweet/follow
5. Every tweet MUST be under 280 characters
6. Use numbers to show progression (1/, 2/, etc.)
7. No hashtags in the thread body — save them for the last tweet
8. Make it conversational, not robotic

Return a JSON object with a "tweets" array of strings.`;

  const result = await llm.generateJSON<{ tweets: string[] }>('mistral', prompt, {
    temperature: 0.7,
    max_tokens: 2000,
  });

  const tweets = result.tweets ?? [];

  // Enforce 280-char limit, truncating if the LLM exceeded it
  const trimmed = tweets.map((t) => (t.length > 280 ? t.slice(0, 277) + '...' : t));

  log(`Generated Twitter thread: ${trimmed.length} tweets for "${script.topic}"`);
  return trimmed;
}

// ---------------------------------------------------------------------------
// generateLinkedInPost
// ---------------------------------------------------------------------------

/**
 * Generates a professional LinkedIn post (max 1300 chars) from the script.
 */
export async function generateLinkedInPost(script: Script): Promise<string> {
  const llm = getOllama();
  const fullScript = buildFullScript(script);

  const prompt = `You are a LinkedIn thought leader in technology and AI.

Given this video script about "${script.topic}":

${fullScript}

Write a professional LinkedIn post (max 1300 characters). Rules:
1. Start with a bold opening line that stops the scroll (use a line break after it)
2. Share 3-4 key insights in a professional, authoritative tone
3. Use short paragraphs with line breaks between them
4. Include a personal reflection or lesson learned
5. End with a question to drive comments
6. Add 3-5 relevant hashtags at the very end
7. Use professional language but avoid being boring — be authentic
8. Do NOT use bullet points — use short paragraphs instead
9. Total length must be under 1300 characters

Return a JSON object with a "post" field containing the full post text.`;

  const result = await llm.generateJSON<{ post: string }>('mistral', prompt, {
    temperature: 0.6,
    max_tokens: 1000,
  });

  let post = result.post ?? '';
  if (post.length > 1300) {
    post = post.slice(0, 1297) + '...';
  }

  log(`Generated LinkedIn post: ${post.length} chars for "${script.topic}"`);
  return post;
}

// ---------------------------------------------------------------------------
// generateCarouselSlides
// ---------------------------------------------------------------------------

/**
 * Generates text for 10 Instagram carousel slides from the script.
 */
export async function generateCarouselSlides(script: Script): Promise<string[]> {
  const llm = getOllama();
  const fullScript = buildFullScript(script);

  const prompt = `You are an Instagram content designer specializing in educational carousels.

Given this video script about "${script.topic}":

${fullScript}

Create text for exactly 10 Instagram carousel slides. Rules:
1. Slide 1: Bold title slide with a hook question or statement (max 50 chars)
2. Slides 2-9: One key point per slide, concise and scannable
3. Slide 10: CTA slide — ask them to save, share, and follow
4. Each slide text must be under 100 characters (they go on visual slides)
5. Use active voice and power words
6. Make each slide standalone but connected to the story
7. Design for visual impact — short, punchy text

Return a JSON object with a "slides" array of exactly 10 strings.`;

  const result = await llm.generateJSON<{ slides: string[] }>('mistral', prompt, {
    temperature: 0.7,
    max_tokens: 1500,
  });

  const slides = (result.slides ?? []).slice(0, 10);

  // Pad to 10 if LLM returned fewer
  while (slides.length < 10) {
    slides.push(`Key insight #${slides.length + 1} about ${script.topic}`);
  }

  log(`Generated ${slides.length} carousel slides for "${script.topic}"`);
  return slides;
}

// ---------------------------------------------------------------------------
// generateBlogOutline
// ---------------------------------------------------------------------------

/**
 * Generates a structured blog post outline with SEO considerations.
 */
export async function generateBlogOutline(script: Script): Promise<BlogOutline> {
  const llm = getOllama();
  const fullScript = buildFullScript(script);

  const prompt = `You are an SEO content strategist.

Given this video script about "${script.topic}":

${fullScript}

Create a comprehensive blog post outline. Return a JSON object with:
{
  "title": "SEO-optimized blog title (60 chars max)",
  "meta_description": "Meta description for search engines (155 chars max)",
  "sections": [
    {
      "heading": "Section heading",
      "level": "h1" or "h2" or "h3",
      "key_points": ["point 1", "point 2"],
      "estimated_word_count": 200
    }
  ],
  "suggested_internal_links": ["related topic 1", "related topic 2"],
  "seo_keywords": ["keyword1", "keyword2", "keyword3"],
  "estimated_read_time": 5
}

Rules:
1. Include 1 H1 (the title), 4-6 H2 sections, and 2-3 H3 subsections
2. Each section should have 2-4 key points
3. Target 1500-2500 word count total
4. Include an introduction and conclusion section
5. SEO keywords should be long-tail and specific
6. Estimated read time in minutes`;

  const result = await llm.generateJSON<BlogOutline>('mistral', prompt, {
    temperature: 0.5,
    max_tokens: 2000,
  });

  // Ensure required fields exist with defaults
  const outline: BlogOutline = {
    title: result.title || `${script.topic}: What You Need to Know`,
    meta_description:
      result.meta_description ||
      `Everything you need to know about ${script.topic}. Key insights and actionable takeaways.`,
    sections: result.sections ?? [
      {
        heading: script.topic,
        level: 'h1',
        key_points: ['Introduction to the topic'],
        estimated_word_count: 200,
      },
    ],
    suggested_internal_links: result.suggested_internal_links ?? [],
    seo_keywords: result.seo_keywords ?? [script.topic],
    estimated_read_time: result.estimated_read_time ?? 5,
  };

  log(`Generated blog outline: "${outline.title}" (${outline.sections.length} sections)`);
  return outline;
}

// ---------------------------------------------------------------------------
// generateNewsletterSegment
// ---------------------------------------------------------------------------

/**
 * Generates an email-friendly newsletter segment from the script.
 */
export async function generateNewsletterSegment(script: Script): Promise<string> {
  const llm = getOllama();
  const fullScript = buildFullScript(script);

  const prompt = `You are an email newsletter writer with a 40%+ open rate.

Given this video script about "${script.topic}":

${fullScript}

Write a newsletter segment (400-600 words) that can be dropped into a weekly digest email. Rules:
1. Start with a compelling subject line suggestion in brackets: [SUBJECT: ...]
2. Open with a personal, conversational hook — like you're writing to a friend
3. Break down the key insights in 3-4 short paragraphs
4. Include one "money quote" — a standout line readers will remember
5. End with a clear CTA: link to the video, reply to discuss, or share
6. Use simple formatting: short paragraphs, bold for emphasis (use **bold**)
7. Write at an 8th-grade reading level — accessible but not dumbed down
8. Include a P.S. line with a teaser for next week or a bonus insight

Return a JSON object with a "newsletter" field containing the full text.`;

  const result = await llm.generateJSON<{ newsletter: string }>('mistral', prompt, {
    temperature: 0.7,
    max_tokens: 1500,
  });

  const newsletter = result.newsletter ?? '';
  log(`Generated newsletter segment: ${newsletter.length} chars for "${script.topic}"`);
  return newsletter;
}

// ---------------------------------------------------------------------------
// generateQuoteCards
// ---------------------------------------------------------------------------

/**
 * Extracts 3-5 shareable quote-card texts from the script.
 */
export async function generateQuoteCards(script: Script): Promise<string[]> {
  const llm = getOllama();
  const fullScript = buildFullScript(script);

  const prompt = `You are a social media content designer who creates viral quote cards.

Given this video script about "${script.topic}":

${fullScript}

Extract or create 5 shareable quote-card texts. Rules:
1. Each quote must be 50-120 characters (fits on a visual card)
2. Quotes should be insightful, provocative, or inspiring
3. They must make sense without any context (standalone value)
4. Mix formats: bold statement, question, statistic, metaphor, prediction
5. Avoid generic motivational platitudes — be specific to the topic
6. Each quote should make someone want to screenshot and share

Return a JSON object with a "quotes" array of 5 strings.`;

  const result = await llm.generateJSON<{ quotes: string[] }>('mistral', prompt, {
    temperature: 0.8,
    max_tokens: 1000,
  });

  const quotes = (result.quotes ?? []).slice(0, 5);
  log(`Generated ${quotes.length} quote cards for "${script.topic}"`);
  return quotes;
}

// ---------------------------------------------------------------------------
// generateEngagementPoll
// ---------------------------------------------------------------------------

/**
 * Creates a poll/question designed to drive engagement around the topic.
 */
export async function generateEngagementPoll(
  script: Script,
): Promise<{ question: string; options: string[] }> {
  const llm = getOllama();
  const fullScript = buildFullScript(script);

  const prompt = `You are a community manager who creates polls that go viral.

Given this video script about "${script.topic}":

${fullScript}

Create an engagement poll that will get people debating. Rules:
1. The question must be polarizing enough to drive votes but not offensive
2. Provide exactly 4 options (works on Twitter, IG Stories, LinkedIn, YouTube)
3. Options should be roughly balanced — no obviously "correct" answer
4. The poll should relate directly to the script's core topic
5. Make people WANT to see the results (curiosity-driven)
6. Question must be under 140 characters

Return a JSON object with:
{
  "question": "The poll question",
  "options": ["Option A", "Option B", "Option C", "Option D"]
}`;

  const result = await llm.generateJSON<{ question: string; options: string[] }>(
    'mistral',
    prompt,
    { temperature: 0.8, max_tokens: 500 },
  );

  const poll = {
    question: result.question || `What's your take on ${script.topic}?`,
    options: (result.options ?? ['Agree', 'Disagree', 'It depends', 'Not sure']).slice(0, 4),
  };

  // Pad to 4 options if needed
  while (poll.options.length < 4) {
    poll.options.push(`Option ${poll.options.length + 1}`);
  }

  log(`Generated engagement poll: "${poll.question}" for "${script.topic}"`);
  return poll;
}

// ---------------------------------------------------------------------------
// generateBehindTheScenes
// ---------------------------------------------------------------------------

/**
 * Creates a behind-the-scenes story angle for the content.
 */
export async function generateBehindTheScenes(script: Script): Promise<string> {
  const llm = getOllama();
  const fullScript = buildFullScript(script);

  const prompt = `You are a content creator who excels at behind-the-scenes storytelling.

Given this video script about "${script.topic}":

${fullScript}

Write a behind-the-scenes post (200-350 words) that shows the human side of creating this content. Rules:
1. Share what sparked your interest in this topic
2. Mention a challenge or surprise you encountered while researching
3. Include a personal opinion or prediction that didn't make it into the video
4. Be vulnerable and authentic — show the messy process
5. End with what you're working on next (creates anticipation)
6. Write in first person, casual tone
7. This is for Instagram Stories or a casual social post

Return a JSON object with a "post" field containing the full text.`;

  const result = await llm.generateJSON<{ post: string }>('mistral', prompt, {
    temperature: 0.8,
    max_tokens: 1000,
  });

  const post = result.post ?? '';
  log(`Generated BTS post: ${post.length} chars for "${script.topic}"`);
  return post;
}

// ---------------------------------------------------------------------------
// generateControversialTake
// ---------------------------------------------------------------------------

/**
 * Creates a spicy, controversial version of the content designed for debate.
 */
export async function generateControversialTake(script: Script): Promise<string> {
  const llm = getOllama();
  const fullScript = buildFullScript(script);

  const prompt = `You are a tech commentator known for bold, contrarian takes.

Given this video script about "${script.topic}":

${fullScript}

Write a controversial hot take post (150-280 characters) designed to spark debate. Rules:
1. Take a bold, contrarian position on the topic
2. Use a provocative opening line
3. State an opinion most people would disagree with — but you can defend
4. Keep it professional — edgy but not offensive or harmful
5. End with something that invites responses ("Change my mind" / "Fight me")
6. This should feel like a tweet that quote-tweets would explode on
7. Must be under 280 characters total

Return a JSON object with a "take" field containing the text.`;

  const result = await llm.generateJSON<{ take: string }>('mistral', prompt, {
    temperature: 0.9,
    max_tokens: 500,
  });

  let take = result.take ?? '';
  if (take.length > 280) {
    take = take.slice(0, 277) + '...';
  }

  log(`Generated controversial take: ${take.length} chars for "${script.topic}"`);
  return take;
}

// ---------------------------------------------------------------------------
// generateTutorialVersion
// ---------------------------------------------------------------------------

/**
 * Converts the script into a step-by-step tutorial/how-to format.
 */
export async function generateTutorialVersion(script: Script): Promise<string> {
  const llm = getOllama();
  const fullScript = buildFullScript(script);

  const prompt = `You are a technical writer who creates clear, actionable tutorials.

Given this video script about "${script.topic}":

${fullScript}

Convert this into a step-by-step tutorial/how-to guide (400-700 words). Rules:
1. Title: "How to [achieve outcome] with ${script.topic}"
2. Start with "What you'll learn" and "What you'll need" sections
3. Break the content into 5-8 numbered steps
4. Each step should have a clear action verb at the start
5. Include tips or warnings where relevant (prefix with TIP: or WARNING:)
6. End with "Next Steps" suggesting what to explore further
7. Write for someone who is technically competent but unfamiliar with this specific topic
8. Use simple, direct language — no fluff

Return a JSON object with a "tutorial" field containing the full tutorial text.`;

  const result = await llm.generateJSON<{ tutorial: string }>('mistral', prompt, {
    temperature: 0.5,
    max_tokens: 2000,
  });

  const tutorial = result.tutorial ?? '';
  log(`Generated tutorial: ${tutorial.length} chars for "${script.topic}"`);
  return tutorial;
}

// ---------------------------------------------------------------------------
// getRepurposedContent — fetch stored repurposed content for a script
// ---------------------------------------------------------------------------

/**
 * Fetches all previously repurposed content for a given script.
 */
export async function getRepurposedContent(
  scriptId: string,
): Promise<RepurposedRecord[]> {
  const db = getDb();

  const { data, error } = await db
    .from('repurposed_content')
    .select('*')
    .eq('script_id', scriptId)
    .order('created_at', { ascending: false });

  if (error) {
    logError(`Failed to fetch repurposed content for script ${scriptId}`, error);
    return [];
  }

  return (data ?? []) as RepurposedRecord[];
}

// ---------------------------------------------------------------------------
// getRepurposedByFormat — fetch repurposed content filtered by format
// ---------------------------------------------------------------------------

/**
 * Fetches repurposed content across all scripts, filtered by format.
 * Useful for building a queue of, e.g., all pending Twitter threads.
 */
export async function getRepurposedByFormat(
  format: string,
  status?: string,
): Promise<RepurposedRecord[]> {
  const db = getDb();

  let query = db
    .from('repurposed_content')
    .select('*')
    .eq('format', format)
    .order('created_at', { ascending: false })
    .limit(50);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    logError(`Failed to fetch repurposed content for format ${format}`, error);
    return [];
  }

  return (data ?? []) as RepurposedRecord[];
}

// ---------------------------------------------------------------------------
// markPublished — update status of a repurposed content item
// ---------------------------------------------------------------------------

/**
 * Marks a repurposed content item as published.
 */
export async function markPublished(
  repurposedId: string,
  performanceScore?: number,
): Promise<void> {
  const db = getDb();

  const updateData: Record<string, unknown> = {
    status: 'published',
    published_at: new Date().toISOString(),
  };

  if (performanceScore !== undefined) {
    updateData.performance_score = performanceScore;
  }

  const { error } = await db
    .from('repurposed_content')
    .update(updateData)
    .eq('id', repurposedId);

  if (error) {
    logError(`Failed to mark repurposed content ${repurposedId} as published`, error);
    throw new Error(`Failed to update status: ${error.message}`);
  }

  log(`Marked repurposed content ${repurposedId} as published`);
}

// ---------------------------------------------------------------------------
// getRepurposeStats — summary statistics
// ---------------------------------------------------------------------------

/**
 * Returns statistics on repurposed content generation and performance.
 */
export async function getRepurposeStats(): Promise<{
  total_generated: number;
  total_published: number;
  by_format: Record<string, { generated: number; published: number; avg_score: number }>;
  top_performing_format: string;
}> {
  const db = getDb();

  const { data: allContent, error } = await db
    .from('repurposed_content')
    .select('format, status, performance_score');

  if (error) {
    logError('Failed to fetch repurpose stats', error);
    return {
      total_generated: 0,
      total_published: 0,
      by_format: {},
      top_performing_format: 'unknown',
    };
  }

  const records = (allContent ?? []) as Array<{
    format: string;
    status: string;
    performance_score: number | null;
  }>;

  const byFormat: Record<
    string,
    { generated: number; published: number; scores: number[] }
  > = {};

  for (const record of records) {
    if (!byFormat[record.format]) {
      byFormat[record.format] = { generated: 0, published: 0, scores: [] };
    }
    byFormat[record.format].generated++;
    if (record.status === 'published') {
      byFormat[record.format].published++;
    }
    if (record.performance_score !== null) {
      byFormat[record.format].scores.push(record.performance_score);
    }
  }

  const formatStats: Record<
    string,
    { generated: number; published: number; avg_score: number }
  > = {};

  let topFormat = 'unknown';
  let topScore = -1;

  for (const [format, stats] of Object.entries(byFormat)) {
    const avgScore =
      stats.scores.length > 0
        ? stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length
        : 0;

    formatStats[format] = {
      generated: stats.generated,
      published: stats.published,
      avg_score: Math.round(avgScore * 100) / 100,
    };

    if (avgScore > topScore) {
      topScore = avgScore;
      topFormat = format;
    }
  }

  return {
    total_generated: records.length,
    total_published: records.filter((r) => r.status === 'published').length,
    by_format: formatStats,
    top_performing_format: topFormat,
  };
}
