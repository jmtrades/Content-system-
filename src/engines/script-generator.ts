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
  // --- CURIOSITY (5) ---
  'I found something about {topic} that nobody is talking about.',
  'There is a hidden feature inside {topic} that changes the entire game.',
  'I spent 48 hours testing {topic}. What I found surprised even me.',
  'Everyone is using {topic} wrong. Let me show you what actually works.',
  'The {topic} trick that 1% of people know about — and it is free.',

  // --- FEAR (4) ---
  'If you are still doing {old_thing}, you are already behind on {topic}.',
  'Stop what you are doing. {topic} just made your current workflow obsolete.',
  '{topic} is quietly replacing people who ignore it. Here is the proof.',
  'Your competitors already switched to {topic}. You have about 30 days.',

  // --- AUTHORITY (4) ---
  'After testing 100+ tools, here is the only {topic} stack that actually works.',
  'I have generated $2M using {topic}. Here is the exact framework.',
  'I reviewed every {topic} option on the market. Only 3 are worth your time.',
  '10,000 hours with {topic} taught me one thing nobody talks about.',

  // --- CONTROVERSY (4) ---
  'Unpopular opinion: {topic} is massively overhyped — and here is why that is good for you.',
  'Everyone is celebrating {topic}. They are missing the real story.',
  'I am going to say what no creator will about {topic}.',
  'Hot take: the people hyping {topic} have never actually used it.',

  // --- URGENCY (4) ---
  '{company} just quietly released a {topic} update that changes everything.',
  'This {topic} window closes in 90 days. Here is how to move now.',
  '{topic} just had its biggest update ever and nobody covered it.',
  'The {topic} opportunity that exists right now will not exist in 6 months.',

  // --- SOCIAL PROOF (4) ---
  '47,000 people switched to {topic} this month. Here is why.',
  'Every creator I know just adopted {topic}. The results are insane.',
  'My audience asked me to cover {topic} 200 times. So I finally tested it.',
  'The top 1% of creators all use {topic}. I reverse-engineered their setup.',

  // --- STORY (5) ---
  'I went from $0 to $10K/month using {topic} in 90 days. Here is the framework.',
  'Last year I was struggling with content. Then I found {topic}.',
  'I almost quit creating. {topic} saved my entire business.',
  'Six months ago I could not even explain {topic}. Now it runs my workflow.',
  'I replaced my entire team with {topic}. Here is exactly what happened.',
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

  // Platform-specific writing directives
  const platformDirectives: Record<string, string> = {
    tiktok: `PLATFORM DIRECTIVE — TikTok:
- Open MID-SENTENCE. No greeting. Viewer lands in the middle of the thought.
- Use "POV:" and "Wait for it" patterns where natural (not forced).
- End on a cliffhanger or open loop that demands a comment or Part 2.
- Pacing: fastest of all platforms. One idea per sentence. No pauses.
- Sound-first — script must work even as pure audio.`,
    reels: `PLATFORM DIRECTIVE — Instagram Reels:
- Front-load the value in the first sentence. Muted viewers read text overlays.
- Design the body so every beat works as a standalone text-on-screen moment.
- CTA must include "Save this" or "Send to someone who needs this."
- Pacing: slightly slower than TikTok. Allow 1-beat pauses for text reading.
- Visual-first — every sentence should pair with a clear on-screen graphic.`,
    youtube_shorts: `PLATFORM DIRECTIVE — YouTube Shorts:
- Longer setup is acceptable. YouTube viewers tolerate 5-8s of context.
- Deliver a DEEPER insight than TikTok or Reels — viewers expect more substance.
- CTA must be subscribe-oriented: "Subscribe if you want more breakdowns like this."
- Pacing: medium. You have room for a brief story or analogy.
- Discovery-first — title/caption keywords matter for YouTube search.`,
    linkedin: `PLATFORM DIRECTIVE — LinkedIn:
- Professional framing. Reference data points, industry reports, or named companies.
- Take a CONTRARIAN angle — challenge conventional wisdom with evidence.
- End with a genuine question that invites senior professionals to comment.
- Pacing: deliberate and authoritative. Short paragraphs, not bullet-fire.
- Credibility-first — cite specific numbers, timeframes, company names.`,
    twitter: `PLATFORM DIRECTIVE — Twitter/X:
- Thread-optimized: every single sentence must be a standalone tweetable quote.
- Open with the single most surprising or provocative claim.
- End with a clear "Repost if you agree" or "Bookmark this" CTA.
- Pacing: staccato. Fragment sentences are fine. Punch and move.
- Shareability-first — every line should be screenshot-worthy.`,
  };

  const platformDir = platformDirectives[platform] || platformDirectives.tiktok;

  return `You are a world-class short-form video scriptwriter. You write scripts that perform like content from Alex Hormozi, MrBeast, and Gary Vee — not because you copy them, but because you understand the psychological architecture underneath their best-performing content.

=============================================================
CHARACTER / VOICE DNA
=============================================================
Write as a SPECIFIC persona:
- Confident but not arrogant. Slightly irreverent. Deeply knowledgeable.
- Uses SHORT punchy sentences. Rarely more than 12 words.
- Speaks in PATTERNS OF THREE (three examples, three beats, three contrasts).
- Constantly contrasts the OLD way vs the NEW way.
- Never hedges. Never says "might" or "could potentially." States facts and moves on.
- Sounds like a smart friend who just discovered something and grabbed you by the arm to tell you.
- Uses concrete specifics — dollar amounts, time saved, exact tool names, version numbers.

=============================================================
CONTENT PILLAR: ${pillar}
=============================================================
Pillar description: ${pillarDesc}
Monetization angle: ${pillarMoney}

=============================================================
TOPIC
=============================================================
${topic}

=============================================================
PLATFORM CONSTRAINTS
=============================================================
Target platform: ${platform}
Max duration: ${constraints.max_duration} seconds
Aspect ratio: ${constraints.aspect_ratio}
Max caption length: ${constraints.max_caption} characters

${platformDir}

=============================================================
HOOK INSPIRATION
=============================================================
Adapt this template (do NOT copy verbatim): "${exampleHook}"
Generate 3 additional hook variants using DIFFERENT psychological triggers (curiosity, fear, authority, controversy, urgency, social proof, or story).

=============================================================
PROVEN SCRIPT ARCHITECTURE (follow this structure exactly)
=============================================================

HOOK (0-3 seconds):
  Pattern interrupt -> curiosity gap -> implicit promise.
  The viewer must feel "I CANNOT scroll past this."
  One sentence. Maximum two. No greetings. No pleasantries.

TENSION (3-8 seconds):
  Identify the VILLAIN. This is the outdated method, the common mistake, or the hidden cost.
  Use the format: "Most people do X. That is the problem."
  Create an information gap the viewer NEEDS closed.

VALUE (8-35 seconds):
  Deliver the core insight using the "Not X, but Y" framework.
  Requirements:
  - At least ONE concrete example with specific numbers (dollars, hours, percentages).
  - At least ONE "Not X, but Y" reframe.
  - Exactly 2-3 "screenshot moments" — single sentences so quotable people will literally screenshot them.
  - Mark each screenshot moment with [SCREENSHOT MOMENT] in the body text.
  - Speak in patterns of three where possible: "First... Second... Third..." or "Faster. Cheaper. Better."

PROOF (35-45 seconds):
  Ground the insight with ONE of: personal experience, a specific result with numbers, a named case study, or a verifiable data point.
  Format: "I did X. Result was Y." or "Company X saw Y% improvement."
  Never use vague proof like "studies show" or "experts agree."

CTA (45-${constraints.max_duration} seconds):
  Single clear action. Must include a REASON WHY ("Follow because I drop one of these every day" not just "Follow me").
  Must feel like a natural next step, not a bolt-on ask.

=============================================================
ENGAGEMENT ENGINEERING (mandatory)
=============================================================
Every script MUST contain:
1. At least ONE "comment trigger" — a controversial claim, a direct question, or a fill-in-the-blank prompt that compels viewers to comment.
2. Exactly 2-3 "screenshot moments" — quotable standalone sentences marked with [SCREENSHOT MOMENT] in the body.
3. The CTA must give a concrete REASON to follow/subscribe, not just ask for the action.

=============================================================
ANTI-AI-SLOP RULES (violating any of these is an automatic failure)
=============================================================
NEVER use:
- "In today's video" or "Hey guys" or any greeting as an opening
- "Without further ado" or "Let's dive in" or "Let's get started"
- "In this rapidly evolving landscape" or "In today's digital age"
- "Game-changer" or "revolutionary" without SPECIFIC proof
- Generic statements that could apply to ANY topic ("AI is changing the world")
- Listicle format without a strong narrative thread connecting the points
- Corporate or formal tone ("It is imperative that" / "One must consider")
- Emojis anywhere in the spoken script
- Filler phrases ("So basically" / "You know" / "Actually" / "Literally")
- Any sentence so generic it could apply to 100 different topics — every line MUST be ultra-specific to ${topic}

=============================================================
OUTPUT FORMAT
=============================================================
Return a JSON object with these exact fields:
{
  "hook": "The pattern-interrupt opening line (first 3 seconds, max 2 sentences)",
  "hook_variants": ["Variant using different psych trigger", "Another variant", "Third variant"],
  "body": "Full script body from TENSION through PROOF. Include [SCREENSHOT MOMENT] markers on quotable lines. Write exactly as it should be spoken aloud — conversational, punchy, specific.",
  "cta": "The call to action with a specific REASON to act",
  "cta_type": "one of: follow, comment, share, link_in_bio, dm_keyword, product_link, newsletter, free_resource, paid_product, affiliate, none",
  "caption": "Platform-optimized caption with keywords (no hashtags here)",
  "caption_variants": ["Alternative caption 1", "Alternative caption 2"],
  "hashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5"],
  "estimated_duration": 45,
  "monetization_hook": "Specific monetization angle for this script (or null if purely growth)",
  "trending_sound_suggestion": "Specific trending audio name if applicable (or null)",
  "text_overlay_suggestions": [
    {"text": "Key text on screen matching a screenshot moment", "size": 48, "color": "#FFFFFF", "y": 0.3, "startTime": 0, "endTime": 3},
    {"text": "Second overlay for next beat", "size": 36, "color": "#FFFF00", "y": 0.5, "startTime": 3, "endTime": 6}
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
