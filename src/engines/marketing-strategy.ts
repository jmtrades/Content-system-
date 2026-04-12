// ============================================================================
// Content Empire — MARKETING STRATEGY ENGINE
// ============================================================================
// World-class marketing frameworks embedded into content generation:
// Hook-Story-Offer (Russell Brunson), Content Flywheel, Dream 100,
// Audience Psychology, Parasocial Relationship Building, and
// Platform-Specific Growth Strategies.
// ============================================================================

import { getServerClient } from '@/lib/db';
import { OllamaClient } from '@/lib/ollama';

const log = (msg: string) => console.log(`[strategy] ${new Date().toISOString()} ${msg}`);

// ---------------------------------------------------------------------------
// HOOK-STORY-OFFER FRAMEWORK (Russell Brunson)
// ---------------------------------------------------------------------------

interface HookStoryOffer {
  hook: string;
  villain: string;
  backstory: string;
  turning_point: string;
  solution: string;
  offer: string;
  cta: string;
  urgency: string;
}

export async function generateHookStoryOffer(
  topic: string,
  product?: string,
): Promise<HookStoryOffer> {
  const llm = new OllamaClient();

  const prompt = `You are the world's best direct-response copywriter. Create a Hook-Story-Offer framework for this topic.

TOPIC: ${topic}
${product ? `PRODUCT TO SELL: ${product}` : 'GOAL: Grow followers and build authority'}

Reply as JSON with these EXACT fields:
{
  "hook": "Pattern interrupt that stops the scroll. Bold, specific, under 15 words.",
  "villain": "The enemy/problem that the audience faces. Make it personal and relatable.",
  "backstory": "Brief origin story — I was in the same situation. 2-3 sentences.",
  "turning_point": "The moment everything changed. What discovery was made? 1-2 sentences.",
  "solution": "The framework/tool/method that solves the problem. Specific and actionable.",
  "offer": "What you're giving them — free resource, community, course. Value-stack it.",
  "cta": "Single clear action. Follow, comment keyword, link in bio.",
  "urgency": "Why they need to act NOW. Scarcity, time limit, or consequence of inaction."
}`;

  try {
    const result = await llm.generateJSON('mistral', prompt);
    return {
      hook: String(result.hook || topic),
      villain: String(result.villain || 'The old way of doing things'),
      backstory: String(result.backstory || 'I was struggling with this too'),
      turning_point: String(result.turning_point || 'Then I discovered something'),
      solution: String(result.solution || 'A better approach'),
      offer: String(result.offer || 'Follow for more insights'),
      cta: String(result.cta || 'Follow for daily AI insights'),
      urgency: String(result.urgency || 'This window won\'t last'),
    };
  } catch {
    return {
      hook: `Most people get ${topic} completely wrong`,
      villain: 'The outdated approach that wastes your time',
      backstory: 'I spent months doing it the hard way before discovering this',
      turning_point: 'Everything changed when I found a better method',
      solution: `The framework that actually works for ${topic}`,
      offer: 'Follow for the full breakdown',
      cta: 'Follow and comment "AI" for the free guide',
      urgency: 'This is only getting more competitive every day',
    };
  }
}

export function hsoToScript(hso: HookStoryOffer, durationSec: number): string {
  if (durationSec <= 30) {
    return `${hso.hook}\n\n${hso.villain}\n\n${hso.solution}\n\n${hso.cta}`;
  }
  if (durationSec <= 60) {
    return `${hso.hook}\n\n${hso.villain}\n\n${hso.backstory}\n\n${hso.turning_point}\n\n${hso.solution}\n\n${hso.cta}`;
  }
  return `${hso.hook}\n\n${hso.villain}\n\n${hso.backstory}\n\n${hso.turning_point}\n\n${hso.solution}\n\n${hso.offer}\n\n${hso.urgency}\n\n${hso.cta}`;
}

// ---------------------------------------------------------------------------
// CONTENT FLYWHEEL — each piece drives to the next
// ---------------------------------------------------------------------------

interface FlywheelSequence {
  trigger_content_id: string;
  follow_ups: Array<{
    type: 'response_to_comments' | 'part_2' | 'deeper_dive' | 'hot_take' | 'tutorial' | 'behind_scenes' | 'results_update';
    delay_hours: number;
    platform: string;
    hook: string;
    body_brief: string;
    why: string;
  }>;
}

export async function generateContentFlywheel(
  scriptId: string,
): Promise<FlywheelSequence> {
  const db = getServerClient();
  const llm = new OllamaClient();

  const { data: script } = await db
    .from('scripts')
    .select('topic, hook, body, content_pillar')
    .eq('id', scriptId)
    .single();

  if (!script) throw new Error(`Script ${scriptId} not found`);

  const prompt = `A video about "${script.topic}" is about to be posted. Generate a content flywheel — a sequence of 6 follow-up posts that each build on the momentum of the previous one. Each post should reference or build on the original.

Reply as JSON array:
[
  {
    "type": "response_to_comments",
    "delay_hours": 4,
    "platform": "tiktok",
    "hook": "You guys had QUESTIONS about my last post...",
    "body_brief": "Address top 3 comments, add new insight",
    "why": "Algorithm rewards reply content; shows you read comments"
  },
  ... 5 more items
]

Types to use: response_to_comments, part_2, deeper_dive, hot_take, tutorial, behind_scenes, results_update

ORIGINAL TOPIC: ${script.topic}
ORIGINAL HOOK: ${script.hook}
PILLAR: ${script.content_pillar}`;

  try {
    const followUps = await llm.generateJSON('mistral', prompt);
    if (Array.isArray(followUps)) {
      return {
        trigger_content_id: scriptId,
        follow_ups: followUps.slice(0, 6).map(f => ({
          type: String(f.type || 'part_2') as FlywheelSequence['follow_ups'][0]['type'],
          delay_hours: Number(f.delay_hours) || 4,
          platform: String(f.platform || 'tiktok'),
          hook: String(f.hook || 'Part 2 of what went viral...'),
          body_brief: String(f.body_brief || 'Follow-up content'),
          why: String(f.why || 'Builds on momentum'),
        })),
      };
    }
  } catch {
    log('Flywheel generation fell back to defaults');
  }

  return {
    trigger_content_id: scriptId,
    follow_ups: [
      { type: 'response_to_comments', delay_hours: 4, platform: 'tiktok', hook: 'The comments on my last post were WILD...', body_brief: 'React to top comments, add bonus insight', why: 'Reply content gets 3x reach' },
      { type: 'part_2', delay_hours: 24, platform: 'tiktok', hook: `Part 2: ${script.topic} — what I didn't tell you`, body_brief: 'Deeper layer of the original topic', why: 'Series content builds followers' },
      { type: 'hot_take', delay_hours: 8, platform: 'twitter', hook: `Unpopular opinion about ${script.topic}`, body_brief: 'Controversial angle on same topic', why: 'Controversy drives quote tweets' },
      { type: 'tutorial', delay_hours: 48, platform: 'youtube_shorts', hook: `How to actually do ${script.topic} (step by step)`, body_brief: 'Actionable tutorial version', why: 'Tutorials drive saves and shares' },
      { type: 'behind_scenes', delay_hours: 12, platform: 'reels', hook: 'How I made that viral post about AI...', body_brief: 'Show the process, humanize the brand', why: 'Behind-scenes builds parasocial connection' },
      { type: 'results_update', delay_hours: 72, platform: 'linkedin', hook: `That ${script.topic} post hit ${Math.floor(Math.random() * 500 + 100)}K views. Here's what I learned.`, body_brief: 'Performance breakdown with lessons', why: 'Social proof drives LinkedIn engagement' },
    ],
  };
}

export async function scheduleFlywheelSequence(flywheel: FlywheelSequence): Promise<number> {
  const db = getServerClient();
  let scheduled = 0;

  for (const followUp of flywheel.follow_ups) {
    const scheduledAt = new Date(Date.now() + followUp.delay_hours * 3600000).toISOString();

    try {
      // Create the script
      const { data: script } = await db
        .from('scripts')
        .insert({
          topic: followUp.hook,
          content_pillar: followUp.type === 'tutorial' ? 'tutorials_quickwins' :
                          followUp.type === 'hot_take' ? 'controversies_hot_takes' :
                          followUp.type === 'behind_scenes' ? 'lifestyle_behind_scenes' :
                          'frameworks_insights',
          hook: followUp.hook,
          body: followUp.body_brief,
          cta: 'Follow for daily AI insights — I cover everything first.',
          cta_type: 'follow',
          caption: followUp.hook,
          hashtags: ['AI', 'ContentCreator', 'TheOperator'],
          estimated_duration: 30,
          status: 'approved',
        })
        .select('id')
        .single();

      if (!script) continue;

      // Schedule to platform
      await db.from('posting_queue').insert({
        platform: followUp.platform,
        caption: followUp.hook,
        hashtags: ['AI', 'ContentCreator'],
        scheduled_at: scheduledAt,
        status: 'scheduled',
      });

      scheduled++;
    } catch (err) {
      log(`Failed to schedule flywheel step: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  log(`Flywheel: scheduled ${scheduled} follow-up posts from script ${flywheel.trigger_content_id}`);
  return scheduled;
}

// ---------------------------------------------------------------------------
// DREAM 100 — Strategic collaboration targeting
// ---------------------------------------------------------------------------

interface Dream100Target {
  handle: string;
  platform: string;
  follower_count: number;
  engagement_rate: number;
  content_overlap: string;
  collaboration_ideas: string[];
  relationship_stage: 'cold' | 'warm' | 'engaged' | 'collaborating';
  next_action: string;
  priority: number;
}

export async function buildDream100List(): Promise<Dream100Target[]> {
  const db = getServerClient();
  const llm = new OllamaClient();

  try {
    // Get top competitors by engagement
    const { data: competitors } = await db
      .from('competitor_posts')
      .select('competitor_handle, platform, engagement_rate')
      .order('engagement_rate', { ascending: false })
      .limit(200);

    if (!competitors || competitors.length === 0) return [];

    // Aggregate by handle
    const handleMap = new Map<string, { platforms: Set<string>; totalEngagement: number; count: number }>();

    for (const c of competitors) {
      const key = c.competitor_handle;
      const existing = handleMap.get(key);
      if (existing) {
        existing.platforms.add(c.platform);
        existing.totalEngagement += c.engagement_rate || 0;
        existing.count++;
      } else {
        handleMap.set(key, { platforms: new Set([c.platform]), totalEngagement: c.engagement_rate || 0, count: 1 });
      }
    }

    const targets: Dream100Target[] = [];

    for (const [handle, data] of handleMap) {
      const avgEngagement = data.totalEngagement / data.count;
      const platformList = Array.from(data.platforms);

      // Generate collaboration ideas
      let collabIdeas: string[];
      try {
        const prompt = `Generate 3 collaboration ideas between an AI content creator (@theoperator) and @${handle}. Ideas should benefit both parties. Reply as JSON array of strings. Short (under 20 words each).`;
        const ideas = await llm.generateJSON('phi3:mini', prompt);
        collabIdeas = Array.isArray(ideas) ? ideas.map(String).slice(0, 3) : ['Joint live discussion', 'Duet/reaction video', 'Guest feature'];
      } catch {
        collabIdeas = ['Joint live discussion', 'Duet/reaction video', 'Guest feature'];
      }

      targets.push({
        handle,
        platform: platformList[0],
        follower_count: 0, // Would need to scrape
        engagement_rate: avgEngagement,
        content_overlap: 'AI & Technology',
        collaboration_ideas: collabIdeas,
        relationship_stage: 'cold',
        next_action: `Engage with 3 of their posts this week (genuine, value-adding comments)`,
        priority: Math.round(avgEngagement * 1000),
      });
    }

    targets.sort((a, b) => b.priority - a.priority);
    const dream100 = targets.slice(0, 100);

    log(`Built Dream 100 list: ${dream100.length} targets`);
    return dream100;
  } catch (err) {
    log(`Dream 100 build failed: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// AUDIENCE PSYCHOLOGY — build dedicated followers, not just numbers
// ---------------------------------------------------------------------------

interface AudiencePersona {
  name: string;
  description: string;
  pain_points: string[];
  desires: string[];
  content_preferences: string[];
  buying_triggers: string[];
  language_style: string;
  platforms: string[];
}

export const AUDIENCE_PERSONAS: AudiencePersona[] = [
  {
    name: 'The Aspiring Creator',
    description: 'Wants to build an audience and monetize with AI tools. 25-35 years old, tech-comfortable but not a developer.',
    pain_points: ['Overwhelmed by AI tool options', 'Not sure where to start', 'Fears being replaced by AI', 'Struggles with consistency'],
    desires: ['Build a profitable online business', 'Automate boring tasks', 'Look smart to peers', 'Get ahead of the curve'],
    content_preferences: ['Quick tutorials', 'Tool reviews', 'Money-making strategies', 'Behind-the-scenes'],
    buying_triggers: ['Seeing someone like them succeed', 'FOMO on a tool or opportunity', 'Step-by-step proof it works', 'Limited-time offers'],
    language_style: 'Casual, relatable, some slang. Not corporate.',
    platforms: ['tiktok', 'reels', 'youtube_shorts'],
  },
  {
    name: 'The Business Builder',
    description: 'Runs or wants to run a business. Interested in AI for competitive advantage. 30-50, more professional.',
    pain_points: ['Losing to competitors using AI', 'Team is slow to adopt', 'Doesn\'t understand the technology', 'Wasting money on wrong tools'],
    desires: ['10x productivity', 'Cut costs', 'Scale without hiring', 'Be seen as innovative'],
    content_preferences: ['ROI-focused case studies', 'Framework breakdowns', 'Industry insights', 'Expert interviews'],
    buying_triggers: ['Clear ROI numbers', 'Competitor examples', 'Authority/credentials', 'Done-for-you solutions'],
    language_style: 'Professional but not boring. Numbers and results.',
    platforms: ['linkedin', 'youtube_shorts', 'twitter'],
  },
  {
    name: 'The Tech Enthusiast',
    description: 'Loves AI for the technology itself. Wants to build, tinker, understand how things work. 20-40, likely a developer or student.',
    pain_points: ['Hard to keep up with the pace of AI', 'Too much noise, not enough signal', 'Wants deep technical content', 'Needs curated sources'],
    desires: ['Be first to know about new models', 'Understand architecture', 'Build cool things', 'Join a community of builders'],
    content_preferences: ['Breaking news first', 'Technical deep dives', 'Benchmark comparisons', 'Open source spotlights'],
    buying_triggers: ['Exclusive access', 'Community of peers', 'Technical depth others don\'t provide', 'Early access to tools'],
    language_style: 'Technical but accessible. No dumbing down.',
    platforms: ['twitter', 'youtube_shorts', 'linkedin'],
  },
];

export async function tailorContentToPersona(
  script: { topic: string; hook: string; body: string },
  persona: AudiencePersona,
): Promise<{ hook: string; body: string; cta: string; caption: string }> {
  const llm = new OllamaClient();

  const prompt = `Rewrite this content specifically for this audience persona. Match their language, hit their pain points, speak to their desires.

PERSONA: ${persona.name}
- Pain points: ${persona.pain_points.join(', ')}
- Desires: ${persona.desires.join(', ')}
- Language: ${persona.language_style}
- Platforms: ${persona.platforms.join(', ')}

ORIGINAL TOPIC: ${script.topic}
ORIGINAL HOOK: ${script.hook}
ORIGINAL BODY: ${script.body.slice(0, 300)}

Reply as JSON: {"hook": "...", "body": "...", "cta": "...", "caption": "..."}
Keep hook under 15 words. Body under 200 words. CTA under 20 words. Caption under 200 chars.`;

  try {
    const result = await llm.generateJSON('mistral', prompt);
    return {
      hook: String(result.hook || script.hook),
      body: String(result.body || script.body),
      cta: String(result.cta || 'Follow for more'),
      caption: String(result.caption || script.hook),
    };
  } catch {
    return { hook: script.hook, body: script.body, cta: 'Follow for daily AI insights', caption: script.hook };
  }
}

// ---------------------------------------------------------------------------
// PARASOCIAL RELATIONSHIP BUILDER — recurring content types
// ---------------------------------------------------------------------------

export const PARASOCIAL_CONTENT_TYPES = [
  {
    type: 'day_in_life',
    frequency_per_week: 2,
    hook_templates: [
      'Day in the life of an AI content creator',
      'What my morning routine looks like running an AI business',
      'POV: You automate everything with AI',
    ],
    purpose: 'Humanize the brand. Let audience feel like they know you.',
  },
  {
    type: 'wins_and_losses',
    frequency_per_week: 1,
    hook_templates: [
      'I just hit {milestone} and here\'s what I learned',
      'I failed at {thing} this week. Here\'s the lesson.',
      'Real talk: this is what nobody shows you about being a creator',
    ],
    purpose: 'Vulnerability builds trust. Wins build aspirational connection.',
  },
  {
    type: 'audience_shoutout',
    frequency_per_week: 1,
    hook_templates: [
      'One of you just sent me this incredible message...',
      'Your comments literally made my day. Let me respond to some.',
      'I asked you guys for AI questions and WOW...',
    ],
    purpose: 'Make audience feel seen. Reward engagement.',
  },
  {
    type: 'strong_opinion',
    frequency_per_week: 2,
    hook_templates: [
      'I\'m going to say what everyone\'s thinking about {topic}',
      'Unpopular opinion: {controversial_take}',
      'I don\'t care if this is controversial. {bold_statement}',
    ],
    purpose: 'Tribal identity. People follow those who say what they\'re thinking.',
  },
  {
    type: 'exclusive_insider',
    frequency_per_week: 1,
    hook_templates: [
      'I have access to something nobody else is showing...',
      'My insider source just told me about {thing}',
      'This hasn\'t been announced yet but...',
    ],
    purpose: 'Status signaling. People follow for exclusive access.',
  },
];

// ---------------------------------------------------------------------------
// MASTER STRATEGY: Generate a full week of strategic content
// ---------------------------------------------------------------------------

export async function generateWeeklyStrategyPlan(): Promise<{
  scripts: Array<{
    day: number;
    slot: number;
    platform: string;
    persona: string;
    content_type: string;
    hook: string;
    framework: string;
    flywheel_position: string;
  }>;
  dream100_actions: Array<{ handle: string; action: string }>;
  total_posts: number;
}> {
  const db = getServerClient();
  const llm = new OllamaClient();
  const scripts: Array<{
    day: number; slot: number; platform: string; persona: string;
    content_type: string; hook: string; framework: string; flywheel_position: string;
  }> = [];

  const platforms = ['tiktok', 'reels', 'youtube_shorts', 'linkedin', 'twitter'];
  const postsPerDay: Record<string, number> = { tiktok: 6, reels: 5, youtube_shorts: 4, linkedin: 3, twitter: 8 };

  for (let day = 0; day < 7; day++) {
    for (const platform of platforms) {
      const dailyTarget = postsPerDay[platform];
      const persona = AUDIENCE_PERSONAS[day % AUDIENCE_PERSONAS.length];

      for (let slot = 0; slot < dailyTarget; slot++) {
        // Rotate content types
        const contentTypes = ['breaking_news', 'tutorial', 'framework', 'hot_take', 'behind_scenes', 'tool_review', 'reaction', 'story'];
        const contentType = contentTypes[(day * dailyTarget + slot) % contentTypes.length];

        // Assign framework
        const frameworks = ['hook_story_offer', 'problem_solution', 'list_format', 'before_after', 'myth_busting', 'prediction', 'comparison'];
        const framework = frameworks[slot % frameworks.length];

        // Flywheel position
        const positions = ['original', 'follow_up', 'part_2', 'response', 'repurpose', 'cross_promote'];
        const position = positions[slot % positions.length];

        scripts.push({
          day,
          slot,
          platform,
          persona: persona.name,
          content_type: contentType,
          hook: `[${contentType}] Script for ${platform} - Day ${day + 1}, Slot ${slot + 1}`,
          framework,
          flywheel_position: position,
        });
      }
    }
  }

  // Generate Dream 100 weekly actions
  const dream100Actions: Array<{ handle: string; action: string }> = [];
  try {
    const { data: topCompetitors } = await db
      .from('competitor_posts')
      .select('competitor_handle')
      .order('engagement_rate', { ascending: false })
      .limit(10);

    if (topCompetitors) {
      const handles = Array.from(new Set(topCompetitors.map((c: { competitor_handle: string }) => c.competitor_handle)));
      for (const handle of handles.slice(0, 10)) {
        try {
          const prompt = `Generate a specific engagement action for @${handle} this week. Something that builds a genuine relationship. Under 30 words. Reply with just the action.`;
          const action = await llm.generate('phi3:mini', prompt);
          dream100Actions.push({ handle: String(handle), action: action.trim() });
        } catch {
          dream100Actions.push({ handle: String(handle), action: 'Leave 3 value-adding comments on their best posts this week' });
        }
      }
    }
  } catch {
    log('Dream 100 actions generation failed');
  }

  log(`Weekly strategy: ${scripts.length} content slots planned, ${dream100Actions.length} Dream 100 actions`);

  return {
    scripts,
    dream100_actions: dream100Actions,
    total_posts: scripts.length,
  };
}
