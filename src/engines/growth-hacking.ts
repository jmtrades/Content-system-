// ============================================================================
// Content Empire — GROWTH HACKING MODULE
// ============================================================================
// Platform algorithm exploitation: hashtag optimization, comment baiting,
// first-hour engagement, duet/stitch targeting, viral hook patterns,
// and engagement velocity boosting.
// ============================================================================

import { getServerClient } from '@/lib/db';
import { OllamaClient } from '@/lib/ollama';

const log = (msg: string) => console.log(`[growth-hack] ${new Date().toISOString()} ${msg}`);

// ---------------------------------------------------------------------------
// Platform algorithm intelligence
// ---------------------------------------------------------------------------

export const ALGORITHM_SIGNALS: Record<string, {
  optimal_length_sec: [number, number];
  posts_per_day: number;
  hashtag_count: [number, number];
  first_hour_critical: boolean;
  tips: string[];
}> = {
  tiktok: {
    optimal_length_sec: [21, 34],
    posts_per_day: 6,
    hashtag_count: [5, 8],
    first_hour_critical: true,
    tips: [
      'Use trending sounds for 2-5x reach boost',
      'Reply to every comment in first 60 minutes',
      'Bold text overlay in first 2 seconds',
      'Pattern interrupt in frame 1 (zoom, movement, color)',
      'End with open loop for comments',
      'Post 4-7x per day for maximum algorithmic push',
    ],
  },
  reels: {
    optimal_length_sec: [15, 30],
    posts_per_day: 5,
    hashtag_count: [8, 15],
    first_hour_critical: true,
    tips: [
      'Share to Stories immediately after posting',
      'Share to Feed for double exposure',
      'Use trending audio from Reels tab',
      'First 1.5 seconds must hook — Instagram crops the thumbnail',
      'Add text overlay for muted viewers (85% watch muted)',
    ],
  },
  youtube_shorts: {
    optimal_length_sec: [30, 58],
    posts_per_day: 4,
    hashtag_count: [3, 5],
    first_hour_critical: false,
    tips: [
      'First 3 seconds determine 90% of retention',
      'Bold text overlay with key statement',
      'End with subscribe CTA or question',
      'Longer shorts (45-58s) get more impressions',
      '#Shorts hashtag no longer required but helps discovery',
    ],
  },
  linkedin: {
    optimal_length_sec: [60, 90],
    posts_per_day: 3,
    hashtag_count: [3, 5],
    first_hour_critical: true,
    tips: [
      'First comment strategy: add value in your own comment',
      'Ask a question at the end of every post',
      'Tag relevant people (but only if genuinely relevant)',
      'Post text + video for maximum reach (not just video)',
      'Tuesday-Thursday 8-10 AM performs 40% better',
    ],
  },
  twitter: {
    optimal_length_sec: [15, 60],
    posts_per_day: 8,
    hashtag_count: [2, 4],
    first_hour_critical: true,
    tips: [
      'Thread format for 3-5x reach vs single tweet',
      'Controversial takes drive quote tweets (free distribution)',
      'Ask questions to drive replies (algorithm signal)',
      'Bookmark bait: "Save this for later" drives saves',
      'First tweet must stand alone — many see it without thread',
    ],
  },
};

// ---------------------------------------------------------------------------
// 1. HASHTAG OPTIMIZER — tiered strategy for maximum reach
// ---------------------------------------------------------------------------

export async function optimizeHashtags(
  topic: string,
  platform: string,
  _caption: string,
): Promise<string[]> {
  const llm = new OllamaClient();
  const spec = ALGORITHM_SIGNALS[platform] || ALGORITHM_SIGNALS.tiktok;
  const [_minTags, maxTags] = spec.hashtag_count;

  try {
    // Get trending hashtags from competitor posts
    const db = getServerClient();
    const { data: recentPosts } = await db
      .from('competitor_posts')
      .select('hashtags')
      .eq('platform', platform)
      .order('engagement_rate', { ascending: false })
      .limit(20);

    const trendingTags = new Set<string>();
    for (const post of recentPosts || []) {
      for (const tag of (post.hashtags || [])) {
        trendingTags.add(String(tag).replace('#', '').toLowerCase());
      }
    }

    const trendingList = Array.from(trendingTags).slice(0, 20).join(', ');

    const prompt = `Generate optimized hashtags for a ${platform} post about "${topic}".

Use this TIERED strategy:
- Tier 1 (3 tags): HIGH-VOLUME trending tags (>1M posts) for broad discovery
- Tier 2 (5 tags): MEDIUM-VOLUME niche tags (100K-1M) for targeting
- Tier 3 (${maxTags - 8} tags): LOW-VOLUME specific tags (<100K) for ranking
- Tier 4 (2 tags): BRAND tags: TheOperator, ContentEmpire

Currently trending in this niche: ${trendingList || 'AI, ChatGPT, Tech'}

Reply as JSON array of strings (hashtags WITHOUT the # symbol). Total: ${maxTags} tags.`;

    const result = await llm.generateJSON('mistral', prompt);
    if (Array.isArray(result)) {
      const tags = result
        .map(t => String(t).replace('#', '').trim())
        .filter(t => t.length > 0 && t.length < 50)
        .slice(0, maxTags);

      // Ensure brand tags
      if (!tags.includes('TheOperator')) tags.push('TheOperator');
      if (!tags.includes('AI')) tags.unshift('AI');

      return tags.slice(0, maxTags);
    }
  } catch {
    log(`Hashtag optimization failed for "${topic}", using defaults`);
  }

  // Fallback defaults per platform
  const defaults: Record<string, string[]> = {
    tiktok: ['AI', 'AITools', 'Tech', 'Artificial Intelligence', 'ChatGPT', 'TheOperator'],
    reels: ['AI', 'AITools', 'ArtificialIntelligence', 'TechTok', 'Innovation', 'FutureTech', 'ChatGPT', 'TheOperator'],
    youtube_shorts: ['AI', 'AITools', 'Shorts', 'TheOperator'],
    linkedin: ['AI', 'Innovation', 'Technology', 'TheOperator'],
    twitter: ['AI', 'Tech', 'TheOperator'],
  };
  return (defaults[platform] || defaults.tiktok).slice(0, maxTags);
}

// ---------------------------------------------------------------------------
// 2. COMMENT BAITING CAPTIONS
// ---------------------------------------------------------------------------

export async function generateCommentBaitCaption(
  script: { topic: string; hook: string; body: string },
  platform: string,
): Promise<string> {
  const llm = new OllamaClient();

  const platformInstructions: Record<string, string> = {
    tiktok: 'SHORT caption (under 150 chars). End with a question or hot take that FORCES people to comment. Use caps for emphasis.',
    reels: 'Caption under 200 chars. End with a question. Include 1-2 emoji strategically. Make people want to tag a friend.',
    youtube_shorts: 'Descriptive caption under 100 chars that creates curiosity gap. End with "...thoughts?"',
    linkedin: 'Professional but bold caption (300-500 chars). End with a thought-provoking question. No emojis unless tasteful.',
    twitter: 'Under 200 chars. Controversial or question-based. Designed for quote tweets and replies.',
  };

  try {
    const prompt = `Write a ${platform} caption for this video that MAXIMIZES comments.

PLATFORM STYLE: ${platformInstructions[platform] || platformInstructions.tiktok}

TOPIC: ${script.topic}
HOOK: ${script.hook}

COMMENT BAIT TECHNIQUES (use 1-2):
- Controversial opinion that splits the audience
- Fill-in-the-blank ("The best AI tool for ___ is ___")
- This-or-that ("ChatGPT or Claude?")
- Challenge ("Bet you can't name 5...")
- FOMO ("Only 2% of people know this")
- Direct question ("Am I wrong?")

Reply with ONLY the caption text. No explanation.`;

    const caption = await llm.generate('mistral', prompt);
    return caption.trim().replace(/^["']|["']$/g, '');
  } catch {
    return `${script.hook}\n\nWhat do you think? Comment below 👇`;
  }
}

// ---------------------------------------------------------------------------
// 3. FIRST-HOUR ENGAGEMENT AUTOMATION
// ---------------------------------------------------------------------------

export async function firstHourEngagement(
  postId: string,
  platform: string,
): Promise<{ comments_replied: number; self_comment: string }> {
  const db = getServerClient();
  const llm = new OllamaClient();
  let commentsReplied = 0;

  try {
    // Get comments on this post
    const { data: comments } = await db
      .from('comments')
      .select('id, content, author_handle, responded')
      .eq('post_id', postId)
      .eq('responded', false)
      .order('created_at', { ascending: true })
      .limit(20);

    // Generate replies for each comment
    for (const comment of comments || []) {
      try {
        const replyPrompt = `Generate a short reply (under 100 chars) to this comment on my ${platform} post. Be friendly, add value, ask a follow-up question to keep the conversation going. Reply with ONLY the text.

COMMENT from @${comment.author_handle}: "${comment.content}"`;

        const reply = await llm.generate('phi3:mini', replyPrompt);

        await db.from('comments').update({
          response_text: reply.trim(),
          responded: true,
          responded_at: new Date().toISOString(),
        }).eq('id', comment.id);

        commentsReplied++;
      } catch {
        // Skip failed replies, continue with others
      }
    }

    // Generate self-comment (creator comments on own post for engagement boost)
    let selfComment = '';
    try {
      const selfPrompt = `Generate a self-comment for my own ${platform} post. This comment should add a bonus tip, a controversial follow-up, or ask a question that drives more discussion. Under 150 chars. Reply with ONLY the text.

POST TOPIC: ${postId}`;

      selfComment = (await llm.generate('phi3:mini', selfPrompt)).trim();
    } catch {
      selfComment = 'What would you add to this? Drop your thoughts below 👇';
    }

    // Store self-comment as engagement action
    await db.from('engagement_actions').insert({
      platform,
      action_type: 'comment',
      target_url: postId,
      content: selfComment,
      status: 'pending',
      result: { type: 'self_comment', post_id: postId },
    });

    log(`First-hour: ${commentsReplied} replies + 1 self-comment for post ${postId}`);
    return { comments_replied: commentsReplied, self_comment: selfComment };
  } catch (err) {
    log(`First-hour engagement error: ${err instanceof Error ? err.message : String(err)}`);
    return { comments_replied: 0, self_comment: '' };
  }
}

// ---------------------------------------------------------------------------
// 4. DUET/STITCH/COLLAB TARGETING
// ---------------------------------------------------------------------------

interface DuetTarget {
  creator_handle: string;
  post_url: string;
  post_content: string;
  engagement_rate: number;
  response_angle: string;
  priority: number;
}

export async function findDuetTargets(platform: string, limit: number = 5): Promise<DuetTarget[]> {
  const db = getServerClient();
  const llm = new OllamaClient();

  try {
    const oneDayAgo = new Date(Date.now() - 24 * 3600000).toISOString();
    const { data: posts } = await db
      .from('competitor_posts')
      .select('competitor_handle, post_url, caption, engagement_rate, topic_category')
      .eq('platform', platform)
      .gte('posted_at', oneDayAgo)
      .gte('engagement_rate', 0.03)
      .order('engagement_rate', { ascending: false })
      .limit(limit * 3);

    if (!posts || posts.length === 0) return [];

    const targets: DuetTarget[] = [];

    for (const post of posts.slice(0, limit)) {
      try {
        const anglePrompt = `I want to create a duet/stitch response to this creator's post. Generate a unique angle that adds value, challenges their take, or builds on their idea. Under 50 words. Reply with just the angle.

CREATOR: @${post.competitor_handle}
THEIR POST: "${(post.caption || '').slice(0, 300)}"
TOPIC: ${post.topic_category || 'AI'}`;

        const angle = await llm.generate('phi3:mini', anglePrompt);

        targets.push({
          creator_handle: post.competitor_handle,
          post_url: post.post_url || '',
          post_content: (post.caption || '').slice(0, 200),
          engagement_rate: post.engagement_rate,
          response_angle: angle.trim(),
          priority: Math.round((post.engagement_rate || 0) * 1000),
        });
      } catch {
        // Skip failed targets
      }
    }

    targets.sort((a, b) => b.priority - a.priority);
    log(`Found ${targets.length} duet/stitch targets for ${platform}`);
    return targets;
  } catch (err) {
    log(`Duet target search error: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// 5. VIRAL HOOK PATTERN GENERATOR
// ---------------------------------------------------------------------------

type HookPattern = 'curiosity_gap' | 'pattern_interrupt' | 'bold_claim' | 'controversy' | 'urgency' | 'social_proof' | 'fear' | 'exclusivity';

interface ViralHook {
  text: string;
  pattern: HookPattern;
  predicted_retention: number;
  platform_best_fit: string;
}

export async function generateViralHooks(topic: string, count: number = 10): Promise<ViralHook[]> {
  const llm = new OllamaClient();

  const patterns: Array<{ type: HookPattern; instruction: string; platform: string }> = [
    { type: 'curiosity_gap', instruction: 'Create mystery that MUST be resolved. "I found something about {topic} that nobody is talking about"', platform: 'tiktok' },
    { type: 'pattern_interrupt', instruction: 'Start with something unexpected or shocking. Break the scroll pattern.', platform: 'reels' },
    { type: 'bold_claim', instruction: 'Make a specific, bold prediction. "This will replace {X} within 6 months"', platform: 'youtube_shorts' },
    { type: 'controversy', instruction: 'Challenge popular opinion. "Everyone is wrong about {topic}. Here\'s why"', platform: 'twitter' },
    { type: 'urgency', instruction: 'Create time pressure. "If you\'re not doing {X} by tomorrow, you\'re already behind"', platform: 'tiktok' },
    { type: 'social_proof', instruction: 'Reference numbers and adoption. "{Number} people have already switched to {X}"', platform: 'linkedin' },
    { type: 'fear', instruction: 'Highlight a threat. "The AI feature that should terrify every {professional}"', platform: 'youtube_shorts' },
    { type: 'exclusivity', instruction: 'Create insider knowledge. "I\'m sharing this before it goes mainstream"', platform: 'tiktok' },
  ];

  const hooks: ViralHook[] = [];

  for (const pattern of patterns.slice(0, count)) {
    try {
      const prompt = `Write a viral video hook (first 3 seconds) using the "${pattern.type}" pattern.

PATTERN: ${pattern.instruction}
TOPIC: ${topic}

Rules:
- Under 15 words
- Must stop the scroll
- Specific, not generic
- No "Hey guys" or "In this video"

Reply with ONLY the hook text.`;

      const hookText = await llm.generate('mistral', prompt);
      hooks.push({
        text: hookText.trim().replace(/^["']|["']$/g, ''),
        pattern: pattern.type,
        predicted_retention: 70 + Math.floor(Math.random() * 25),
        platform_best_fit: pattern.platform,
      });
    } catch {
      hooks.push({
        text: `${topic} — this changes everything`,
        pattern: pattern.type,
        predicted_retention: 60,
        platform_best_fit: pattern.platform,
      });
    }
  }

  return hooks;
}

// ---------------------------------------------------------------------------
// 6. ENGAGEMENT VELOCITY BOOSTER
// ---------------------------------------------------------------------------

export async function boostEngagement(postId: string, platform: string): Promise<void> {
  const db = getServerClient();

  try {
    // 1. Schedule a "response to my last post" follow-up in 4-6 hours
    const followUpTime = new Date(Date.now() + (4 + Math.random() * 2) * 3600000).toISOString();
    await db.from('posting_queue').insert({
      platform,
      caption: 'The response to my last post was INSANE. Here\'s what you missed 👇',
      hashtags: ['AI', 'Viral', 'FollowUp'],
      scheduled_at: followUpTime,
      status: 'scheduled',
    });

    // 2. Cross-promote on other platforms
    const otherPlatforms = ['tiktok', 'reels', 'youtube_shorts', 'linkedin', 'twitter']
      .filter(p => p !== platform);

    for (const other of otherPlatforms.slice(0, 2)) {
      await db.from('posting_queue').insert({
        platform: other,
        caption: `This is blowing up on ${platform}. Full video there → link in bio`,
        hashtags: ['AI', 'Viral'],
        scheduled_at: new Date(Date.now() + 2 * 3600000).toISOString(),
        status: 'scheduled',
      });
    }

    // 3. Run first-hour engagement
    await firstHourEngagement(postId, platform);

    log(`Engagement boost triggered for post ${postId} on ${platform}`);
  } catch (err) {
    log(`Engagement boost error: ${err instanceof Error ? err.message : String(err)}`);
  }
}
