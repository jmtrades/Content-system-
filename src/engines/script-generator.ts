// ============================================================================
// Script Generator Engine
// Generates AI-powered video scripts using Ollama, distributed across content
// pillars with weighted selection, hook formulas, and platform-specific output.
// ============================================================================

import { getDb } from '@/lib/db';
import { getOllama } from '@/lib/ollama';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ContentPillar {
  name: string;
  description: string;
  frequency: number;
  monetization: string;
}

interface RadarItem {
  id: string;
  title: string;
  summary: string;
  source?: string;
  category?: string;
  importance_score?: number;
}

interface CompetitorGap {
  id: string;
  description: string;
  gap_type?: string;
  opportunity_score?: number;
}

interface GeneratedScript {
  hook: string;
  hook_variants: string[];
  body: string;
  cta: string;
  cta_type: string;
  caption: string;
  caption_variants: string[];
  hashtags: string[];
  estimated_duration: number;
  monetization_hook: string | null;
  trending_sound_suggestion: string | null;
  text_overlay_suggestions: TextOverlaySuggestion[];
}

interface TextOverlaySuggestion {
  text: string;
  size: number;
  color: string;
  y: number;
  startTime: number;
  endTime: number;
}

interface ScriptRecord {
  id: string;
  topic: string;
  hook: string;
  body: string;
  cta: string;
  status: string;
  content_pillar: string;
  created_at: string;
  [key: string]: unknown;
}

interface PlatformConstraints {
  max_duration: number;
  aspect_ratio: string;
  max_caption: number;
}

// ---------------------------------------------------------------------------
// Content pillars — weighted distribution for a balanced content calendar
// ---------------------------------------------------------------------------

const contentPillars: ContentPillar[] = [
  { name: 'breaking_news', description: 'First to cover new AI drops — models, products, policy changes', frequency: 0.30, monetization: 'builds authority and drives urgency views' },
  { name: 'tutorials_quickwins', description: 'Show useful AI tricks in 60 seconds or less', frequency: 0.25, monetization: 'product tie-in and affiliate links' },
  { name: 'frameworks_insights', description: 'Original thinking and mental models for using AI', frequency: 0.20, monetization: 'thought leadership and consulting funnel' },
  { name: 'competitor_reactions', description: 'React to influencer content, hot takes, and announcements', frequency: 0.10, monetization: 'steals audience from bigger creators' },
  { name: 'controversies_hot_takes', description: 'Bold AI opinions that spark debate', frequency: 0.10, monetization: 'drives engagement and comment wars' },
  { name: 'lifestyle_behind_scenes', description: 'Day in the life of an AI-powered creator', frequency: 0.05, monetization: 'builds personal connection and parasocial bond' },
];

// ---------------------------------------------------------------------------
// Hook templates — proven formulas that stop the scroll
// ---------------------------------------------------------------------------

const hookTemplates: string[] = [
  'Stop scrolling. {topic} just changed everything.',
  'Nobody is talking about this {topic} trick...',
  'I tested {topic} so you don\'t have to. Here\'s what happened.',
  'POV: You just discovered {topic} and your mind is blown.',
  'This {topic} hack saved me 10 hours this week.',
  '{topic} is here and it\'s terrifying. Here\'s why.',
  'Delete your old workflow. {topic} makes it obsolete.',
  'Hot take: {topic} is overhyped. Let me explain.',
  'I asked AI to {topic}. The result was insane.',
  'If you\'re not using {topic} yet, you\'re already behind.',
  'The {topic} secret that top creators don\'t share.',
  'WARNING: {topic} will make you rethink everything.',
  '3 things about {topic} that nobody tells you.',
  'I went from zero to pro with {topic} in one day.',
  'Your boss doesn\'t want you to know about {topic}.',
  'This changes EVERYTHING about {topic}.',
  'Why {topic} is the biggest opportunity right now.',
  'The {topic} mistake that 90% of people make.',
];

// ---------------------------------------------------------------------------
// Platform constraints
// ---------------------------------------------------------------------------

const platformConstraints: Record<string, PlatformConstraints> = {
  tiktok: { max_duration: 60, aspect_ratio: '9:16', max_caption: 2200 },
  reels: { max_duration: 90, aspect_ratio: '9:16', max_caption: 2200 },
  youtube_shorts: { max_duration: 60, aspect_ratio: '9:16', max_caption: 5000 },
  linkedin: { max_duration: 120, aspect_ratio: '9:16', max_caption: 3000 },
  twitter: { max_duration: 140, aspect_ratio: '16:9', max_caption: 280 },
};

const LOG_PREFIX = '[script-generator]';

// ---------------------------------------------------------------------------
// Core generation function
// ---------------------------------------------------------------------------

/**
 * Generate a complete video script for a given topic and content pillar.
 * Calls Ollama to produce the script, then persists it to the `scripts` table.
 */
export async function generateScript(
  topic: string,
  pillar: string,
  platform: string = 'tiktok',
): Promise<ScriptRecord> {
  console.log(`${LOG_PREFIX} Generating script — topic="${topic}" pillar="${pillar}" platform="${platform}"`);

  const ollama = getOllama();
  const prompt = buildPrompt(topic, pillar, platform);

  let generated: GeneratedScript;
  try {
    generated = await ollama.generateJSON<GeneratedScript>('mistral', prompt, {
      temperature: 0.8,
      max_tokens: 2000,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${LOG_PREFIX} Ollama generation failed: ${message}`);
    throw new Error(`Script generation failed: ${message}`);
  }

  // Build platform-specific versions
  const platformVersions = buildPlatformVersions(generated);

  // Persist to database
  const db = getDb();
  const { data, error } = await db
    .from('scripts')
    .insert({
      topic,
      content_pillar: pillar,
      hook: generated.hook || 'Hook not generated',
      hook_variants: generated.hook_variants || [],
      body: generated.body || 'Body not generated',
      cta: generated.cta || '',
      cta_type: generated.cta_type || 'follow',
      caption: generated.caption || '',
      caption_variants: generated.caption_variants || [],
      hashtags: generated.hashtags || [],
      platform_versions: platformVersions,
      estimated_duration: generated.estimated_duration || 45,
      monetization_hook: generated.monetization_hook || null,
      status: 'draft',
      performance_score: null,
    })
    .select()
    .single();

  if (error) {
    console.error(`${LOG_PREFIX} Database insert failed: ${error.message}`);
    throw new Error(`Failed to save script: ${error.message}`);
  }

  console.log(`${LOG_PREFIX} Script created — id=${data.id} topic="${topic}"`);
  return data as ScriptRecord;
}

// ---------------------------------------------------------------------------
// Specialised generators
// ---------------------------------------------------------------------------

/**
 * Generate a script from a hot radar item (breaking news, trending topic).
 */
export async function generateBreakingNewsScript(
  radarItem: RadarItem,
): Promise<ScriptRecord> {
  console.log(`${LOG_PREFIX} Generating breaking news script from radar item "${radarItem.id}"`);

  const topic = `BREAKING: ${radarItem.title}`;
  const ollama = getOllama();

  const prompt = buildPrompt(topic, 'breaking_news', 'tiktok') +
    `\n\nAdditional context from the news source:\n` +
    `Title: ${radarItem.title}\n` +
    `Summary: ${radarItem.summary}\n` +
    (radarItem.source ? `Source: ${radarItem.source}\n` : '') +
    (radarItem.category ? `Category: ${radarItem.category}\n` : '') +
    `\nMake this URGENT. The viewer must feel like they are the first to know.`;

  let generated: GeneratedScript;
  try {
    generated = await ollama.generateJSON<GeneratedScript>('mistral', prompt, {
      temperature: 0.85,
      max_tokens: 2000,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${LOG_PREFIX} Breaking news generation failed: ${message}`);
    throw new Error(`Breaking news script generation failed: ${message}`);
  }

  const platformVersions = buildPlatformVersions(generated);
  const db = getDb();

  const { data, error } = await db
    .from('scripts')
    .insert({
      radar_item_id: radarItem.id,
      topic,
      content_pillar: 'breaking_news',
      hook: generated.hook || 'Breaking news hook',
      hook_variants: generated.hook_variants || [],
      body: generated.body || '',
      cta: generated.cta || '',
      cta_type: generated.cta_type || 'follow',
      caption: generated.caption || '',
      caption_variants: generated.caption_variants || [],
      hashtags: generated.hashtags || [],
      platform_versions: platformVersions,
      estimated_duration: generated.estimated_duration || 45,
      monetization_hook: generated.monetization_hook || null,
      status: 'draft',
      performance_score: null,
    })
    .select()
    .single();

  if (error) {
    console.error(`${LOG_PREFIX} Failed to save breaking news script: ${error.message}`);
    throw new Error(`Failed to save breaking news script: ${error.message}`);
  }

  // Mark radar item as processed
  await db
    .from('radar_items')
    .update({ processed: true })
    .eq('id', radarItem.id);

  console.log(`${LOG_PREFIX} Breaking news script created — id=${data.id}`);
  return data as ScriptRecord;
}

/**
 * Generate a script from a competitor content gap.
 */
export async function generateGapScript(
  gap: CompetitorGap,
): Promise<ScriptRecord> {
  console.log(`${LOG_PREFIX} Generating gap script from gap "${gap.id}"`);

  const topic = `Content gap opportunity: ${gap.description}`;
  const ollama = getOllama();

  const prompt = buildPrompt(topic, 'frameworks_insights', 'tiktok') +
    `\n\nThis script addresses a competitor content gap:\n` +
    `Description: ${gap.description}\n` +
    (gap.gap_type ? `Gap type: ${gap.gap_type}\n` : '') +
    (gap.opportunity_score ? `Opportunity score: ${gap.opportunity_score}/100\n` : '') +
    `\nFill this gap with ORIGINAL perspective. Position as the first creator to cover this angle.`;

  let generated: GeneratedScript;
  try {
    generated = await ollama.generateJSON<GeneratedScript>('mistral', prompt, {
      temperature: 0.75,
      max_tokens: 2000,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${LOG_PREFIX} Gap script generation failed: ${message}`);
    throw new Error(`Gap script generation failed: ${message}`);
  }

  const platformVersions = buildPlatformVersions(generated);
  const db = getDb();

  const { data, error } = await db
    .from('scripts')
    .insert({
      gap_id: gap.id,
      topic,
      content_pillar: 'frameworks_insights',
      hook: generated.hook || 'Gap opportunity hook',
      hook_variants: generated.hook_variants || [],
      body: generated.body || '',
      cta: generated.cta || '',
      cta_type: generated.cta_type || 'follow',
      caption: generated.caption || '',
      caption_variants: generated.caption_variants || [],
      hashtags: generated.hashtags || [],
      platform_versions: platformVersions,
      estimated_duration: generated.estimated_duration || 45,
      monetization_hook: generated.monetization_hook || null,
      status: 'draft',
      performance_score: null,
    })
    .select()
    .single();

  if (error) {
    console.error(`${LOG_PREFIX} Failed to save gap script: ${error.message}`);
    throw new Error(`Failed to save gap script: ${error.message}`);
  }

  // Mark gap as actioned
  await db
    .from('competitor_gaps')
    .update({ actioned: true })
    .eq('id', gap.id);

  console.log(`${LOG_PREFIX} Gap script created — id=${data.id}`);
  return data as ScriptRecord;
}

// ---------------------------------------------------------------------------
// Batch generation
// ---------------------------------------------------------------------------

/**
 * Generate a daily batch of 5-8 scripts distributed across content pillars.
 * Pulls hot radar items and unfilled gaps to supplement topic selection.
 */
export async function generateDailyBatch(): Promise<ScriptRecord[]> {
  console.log(`${LOG_PREFIX} Starting daily batch generation`);

  const db = getDb();
  const scripts: ScriptRecord[] = [];
  const targetCount = 5 + Math.floor(Math.random() * 4); // 5-8 scripts

  // Fetch unprocessed high-importance radar items
  const { data: radarItems } = await db
    .from('radar_items')
    .select('id, title, summary, source, category, importance_score')
    .eq('processed', false)
    .order('importance_score', { ascending: false })
    .limit(3);

  // Fetch unactioned gaps with high opportunity score
  const { data: gaps } = await db
    .from('competitor_gaps')
    .select('id, description, gap_type, opportunity_score')
    .eq('actioned', false)
    .order('opportunity_score', { ascending: false })
    .limit(2);

  let generated = 0;

  // Generate scripts from top radar items first
  if (radarItems && radarItems.length > 0) {
    for (const item of radarItems) {
      if (generated >= targetCount) break;
      try {
        const script = await generateBreakingNewsScript(item as RadarItem);
        scripts.push(script);
        generated++;
        console.log(`${LOG_PREFIX} Batch [${generated}/${targetCount}] — radar item "${item.title}"`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`${LOG_PREFIX} Batch radar script failed: ${message}`);
      }
    }
  }

  // Generate scripts from competitor gaps
  if (gaps && gaps.length > 0) {
    for (const gap of gaps) {
      if (generated >= targetCount) break;
      try {
        const script = await generateGapScript(gap as CompetitorGap);
        scripts.push(script);
        generated++;
        console.log(`${LOG_PREFIX} Batch [${generated}/${targetCount}] — gap "${gap.description.slice(0, 50)}"`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`${LOG_PREFIX} Batch gap script failed: ${message}`);
      }
    }
  }

  // Fill remaining slots with pillar-balanced topics
  const genericTopics = [
    'New AI model just dropped — what it means for creators',
    'How to use ChatGPT for content research in 2 minutes',
    'The AI tool stack every creator needs in 2025',
    'Why AI-generated content is about to explode',
    'I automated my entire content pipeline with AI',
    'The hidden AI feature nobody uses',
    'AI vs Human creativity — the real truth',
    'How to 10x your output with AI workflows',
  ];

  while (generated < targetCount) {
    const pillar = selectPillar();
    const topicIndex = generated % genericTopics.length;
    const topic = genericTopics[topicIndex];

    try {
      const script = await generateScript(topic, pillar.name);
      scripts.push(script);
      generated++;
      console.log(`${LOG_PREFIX} Batch [${generated}/${targetCount}] — pillar="${pillar.name}" topic="${topic}"`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${LOG_PREFIX} Batch generic script failed: ${message}`);
      generated++; // Increment to avoid infinite loop on persistent failures
    }
  }

  console.log(`${LOG_PREFIX} Daily batch complete — ${scripts.length} scripts generated`);
  return scripts;
}

/**
 * Generate evergreen content scripts for the week.
 * These are timeless pieces that can be scheduled at any point.
 */
export async function generateWeeklyEvergreen(): Promise<ScriptRecord[]> {
  console.log(`${LOG_PREFIX} Generating weekly evergreen content`);

  const evergreenTopics = [
    { topic: '5 AI tools that will save you hours every day', pillar: 'tutorials_quickwins' },
    { topic: 'The beginner\'s guide to prompt engineering', pillar: 'tutorials_quickwins' },
    { topic: 'Why most people use AI wrong — and how to fix it', pillar: 'frameworks_insights' },
    { topic: 'AI productivity framework: the 80/20 rule for automation', pillar: 'frameworks_insights' },
    { topic: 'Hot take: AI won\'t replace you, but someone using AI will', pillar: 'controversies_hot_takes' },
    { topic: 'My morning routine as an AI-powered content creator', pillar: 'lifestyle_behind_scenes' },
    { topic: 'The AI tools I actually pay for (and why)', pillar: 'tutorials_quickwins' },
  ];

  const scripts: ScriptRecord[] = [];

  for (const item of evergreenTopics) {
    try {
      const script = await generateScript(item.topic, item.pillar);
      scripts.push(script);
      console.log(`${LOG_PREFIX} Evergreen script created — topic="${item.topic}"`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${LOG_PREFIX} Evergreen script failed for "${item.topic}": ${message}`);
    }
  }

  console.log(`${LOG_PREFIX} Weekly evergreen complete — ${scripts.length} scripts generated`);
  return scripts;
}

// ---------------------------------------------------------------------------
// Pillar selection (weighted random)
// ---------------------------------------------------------------------------

/**
 * Select a content pillar using weighted random selection based on frequency.
 */
export function selectPillar(): ContentPillar {
  const roll = Math.random();
  let cumulative = 0;

  for (const pillar of contentPillars) {
    cumulative += pillar.frequency;
    if (roll <= cumulative) {
      return pillar;
    }
  }

  // Fallback to the last pillar (shouldn't happen if frequencies sum to 1.0)
  return contentPillars[contentPillars.length - 1];
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

/**
 * Build a detailed LLM prompt for script generation.
 */
export function buildPrompt(
  topic: string,
  pillar: string,
  platform: string,
): string {
  const constraints = platformConstraints[platform] || platformConstraints.tiktok;
  const pillarInfo = contentPillars.find((p) => p.name === pillar);
  const pillarDesc = pillarInfo?.description || 'General AI content';
  const pillarMoney = pillarInfo?.monetization || 'audience growth';

  // Pick a random hook template for inspiration
  const hookTemplate = hookTemplates[Math.floor(Math.random() * hookTemplates.length)];
  const exampleHook = hookTemplate.replace(/\{topic\}/g, topic.split(' ').slice(0, 3).join(' '));

  return `You are an elite short-form video scriptwriter specializing in AI and tech content.
Your scripts consistently get millions of views because they combine irresistible hooks,
dense value, and strong calls to action.

CONTENT PILLAR: ${pillar}
Pillar description: ${pillarDesc}
Monetization angle: ${pillarMoney}

TOPIC: ${topic}

TARGET PLATFORM: ${platform}
Max duration: ${constraints.max_duration} seconds
Aspect ratio: ${constraints.aspect_ratio}
Max caption length: ${constraints.max_caption} characters

HOOK INSPIRATION (adapt, do not copy verbatim): "${exampleHook}"

RULES:
1. The HOOK must stop the scroll in under 3 seconds. Use pattern interrupts, curiosity gaps, or shock value.
2. The BODY must deliver dense, actionable value. No fluff. Every sentence earns its place.
3. The CTA must feel natural and create urgency (not "like and subscribe" generic stuff).
4. Keep the estimated duration under ${constraints.max_duration} seconds.
5. Caption should be optimized for ${platform} with relevant keywords.
6. Include 3-7 trending and niche hashtags.
7. Text overlay suggestions should highlight key moments visually.

Return a JSON object with these exact fields:
{
  "hook": "The attention-grabbing opening line (first 3 seconds)",
  "hook_variants": ["Alternative hook 1", "Alternative hook 2", "Alternative hook 3"],
  "body": "The main content of the script — what to say/show, broken into clear beats",
  "cta": "The call to action at the end",
  "cta_type": "one of: follow, comment, share, link_in_bio, dm_keyword, product_link, newsletter, free_resource, paid_product, affiliate, none",
  "caption": "The caption to post with the video",
  "caption_variants": ["Alternative caption 1", "Alternative caption 2"],
  "hashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5"],
  "estimated_duration": 45,
  "monetization_hook": "How this content drives revenue (or null if purely growth)",
  "trending_sound_suggestion": "Suggested trending audio if applicable (or null)",
  "text_overlay_suggestions": [
    {"text": "Key text on screen", "size": 48, "color": "#FFFFFF", "y": 0.3, "startTime": 0, "endTime": 3},
    {"text": "Second overlay", "size": 36, "color": "#FFFF00", "y": 0.5, "startTime": 3, "endTime": 6}
  ]
}

Respond ONLY with valid JSON. No markdown, no explanation, no code blocks.`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build platform-specific version objects from a generated script.
 */
function buildPlatformVersions(
  generated: GeneratedScript,
): Record<string, unknown> {
  const platforms = Object.keys(platformConstraints);
  const versions: Record<string, unknown> = {};

  for (const platform of platforms) {
    const constraints = platformConstraints[platform];
    versions[platform] = {
      hook: generated.hook,
      body: generated.body,
      cta: generated.cta,
      caption: (generated.caption || '').slice(0, constraints.max_caption),
      hashtags: generated.hashtags || [],
      aspect_ratio: constraints.aspect_ratio,
      max_duration: constraints.max_duration,
      text_overlay_suggestions: generated.text_overlay_suggestions || [],
    };
  }

  return versions;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { contentPillars, hookTemplates, platformConstraints };
export type { ContentPillar, RadarItem, CompetitorGap, GeneratedScript, ScriptRecord };
