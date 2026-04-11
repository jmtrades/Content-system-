// ============================================================================
// Content Empire — Engagement Automation Engine
// ============================================================================
// Strategic engagement automation: comment generation, follow-back management,
// DM sequence automation, community scoring, and engagement scheduling.
// ============================================================================

import { getServerClient } from '@/lib/db';
import { OllamaClient } from '@/lib/ollama';

const log = (msg: string) => console.log(`[engagement] ${new Date().toISOString()} ${msg}`);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StrategicComment {
  id?: string;
  platform: string;
  target_handle: string;
  target_url: string;
  target_content: string;
  generated_comment: string;
  priority: number;
  reason: string;
}

interface EngagementScore {
  user_handle: string;
  platform: string;
  total_interactions: number;
  comment_count: number;
  share_count: number;
  dm_count: number;
  buying_intent_score: number;
  recommended_action: 'nurture' | 'pitch' | 'ignore' | 'vip';
}

interface EngagementTask {
  platform: string;
  action: 'comment' | 'like' | 'share' | 'follow';
  target_url: string;
  target_handle: string;
  reason: string;
  priority: number;
  generated_comment?: string;
}

interface DMSequenceConfig {
  trigger: string;
  steps: Array<{
    delay_hours: number;
    message_template: string;
    condition?: string;
  }>;
}

// ---------------------------------------------------------------------------
// Default DM sequences
// ---------------------------------------------------------------------------

const DEFAULT_DM_SEQUENCES: DMSequenceConfig[] = [
  {
    trigger: 'new_follower',
    steps: [
      { delay_hours: 1, message_template: 'welcome_new_follower' },
      { delay_hours: 24, message_template: 'value_resource' },
      { delay_hours: 72, message_template: 'community_invite' },
    ],
  },
  {
    trigger: 'keyword:free',
    steps: [
      { delay_hours: 0, message_template: 'free_resource_link' },
      { delay_hours: 48, message_template: 'did_you_find_helpful' },
    ],
  },
  {
    trigger: 'keyword:course',
    steps: [
      { delay_hours: 0, message_template: 'course_info' },
      { delay_hours: 24, message_template: 'course_testimonial' },
      { delay_hours: 72, message_template: 'limited_offer' },
    ],
  },
  {
    trigger: 'keyword:help',
    steps: [
      { delay_hours: 0, message_template: 'how_can_i_help' },
      { delay_hours: 24, message_template: 'relevant_resource' },
    ],
  },
];

// ---------------------------------------------------------------------------
// DM message templates
// ---------------------------------------------------------------------------

const MESSAGE_TEMPLATES: Record<string, string> = {
  welcome_new_follower: 'Hey! Thanks for the follow — really appreciate it. I share daily AI insights and actionable tips here. Anything specific you\'re working on with AI?',
  value_resource: 'Quick heads up — I just dropped a free guide on the top 10 AI tools I use daily. Want me to send the link?',
  community_invite: 'BTW I run a small community of AI builders and creators. We share what\'s working, new tools, and help each other grow. Interested in checking it out?',
  free_resource_link: 'Here\'s the free resource! Let me know if you have any questions about it.',
  did_you_find_helpful: 'Hey! Just checking in — did you find that resource helpful? Happy to point you to anything else.',
  course_info: 'Great question about the course! It covers everything from basic AI tools to building full automation systems. What level would you say you\'re at with AI right now?',
  course_testimonial: 'Just wanted to share — one of our members went from zero AI experience to automating 80% of their content pipeline in just 3 weeks. Happy to share more details!',
  limited_offer: 'Quick heads up — we\'re running a limited enrollment window for the next cohort. Let me know if you\'d like to grab a spot.',
  how_can_i_help: 'Hey! I saw your message — happy to help. What are you working on?',
  relevant_resource: 'Based on what you shared, I think you\'d find this really useful — it\'s exactly what helped me solve a similar challenge.',
};

// ---------------------------------------------------------------------------
// Strategic comment generation
// ---------------------------------------------------------------------------

export async function generateStrategicComments(limit: number = 10): Promise<StrategicComment[]> {
  log(`Generating up to ${limit} strategic comments...`);
  const db = getServerClient();
  const llm = new OllamaClient();

  try {
    // Find high-engagement competitor posts from last 24h
    const oneDayAgo = new Date(Date.now() - 24 * 3600000).toISOString();
    const { data: posts } = await db
      .from('competitor_posts')
      .select('competitor_handle, platform, post_url, caption, topic_category, engagement_rate')
      .gte('posted_at', oneDayAgo)
      .order('engagement_rate', { ascending: false })
      .limit(limit * 2);

    if (!posts || posts.length === 0) {
      log('No recent competitor posts found for strategic commenting');
      return [];
    }

    const comments: StrategicComment[] = [];

    for (const post of posts.slice(0, limit)) {
      try {
        const prompt = `Generate a thoughtful, value-adding comment for this social media post. The comment should:
1. Add genuine insight or a unique perspective
2. Be conversational and authentic (NOT generic like "Great post!")
3. Subtly position the commenter as knowledgeable about AI
4. Encourage further discussion
5. Be 1-3 sentences max

Post by @${post.competitor_handle} about: "${(post.caption || '').slice(0, 300)}"
Topic: ${post.topic_category || 'AI'}

Reply with ONLY the comment text, nothing else.`;

        const comment = await llm.generate('mistral', prompt);
        const cleanComment = comment.trim().replace(/^["']|["']$/g, '');

        if (cleanComment.length > 10 && cleanComment.length < 500) {
          const strategic: StrategicComment = {
            platform: post.platform,
            target_handle: post.competitor_handle,
            target_url: post.post_url || '',
            target_content: (post.caption || '').slice(0, 200),
            generated_comment: cleanComment,
            priority: Math.round((post.engagement_rate || 0) * 100),
            reason: `High-engagement post (${((post.engagement_rate || 0) * 100).toFixed(1)}%) by @${post.competitor_handle}`,
          };

          // Store in engagement_actions
          const { data: inserted } = await db
            .from('engagement_actions')
            .insert({
              platform: post.platform,
              action_type: 'comment',
              target_handle: post.competitor_handle,
              target_url: post.post_url,
              content: cleanComment,
              status: 'pending',
              result: { reason: strategic.reason, priority: strategic.priority },
            })
            .select('id')
            .single();

          if (inserted) strategic.id = inserted.id;
          comments.push(strategic);
        }
      } catch (err) {
        log(`Failed to generate comment for @${post.competitor_handle}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    log(`Generated ${comments.length} strategic comments`);
    return comments;
  } catch (err) {
    log(`Strategic comment generation failed: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Follow-back processing
// ---------------------------------------------------------------------------

export async function processFollowBacks(): Promise<{ analyzed: number; followedBack: number; ignored: number }> {
  log('Processing follow-backs...');
  const db = getServerClient();

  try {
    // Get community members who we haven't scored yet or scored recently
    const { data: members } = await db
      .from('community_scores')
      .select('*')
      .gte('total_interactions', 2)
      .order('last_interaction_at', { ascending: false })
      .limit(50);

    if (!members || members.length === 0) {
      log('No community members to evaluate for follow-back');
      return { analyzed: 0, followedBack: 0, ignored: 0 };
    }

    let followedBack = 0;
    let ignored = 0;

    for (const member of members) {
      const isHighValue = member.total_interactions >= 3 || member.buying_intent_score >= 30;

      if (isHighValue) {
        await db.from('engagement_actions').insert({
          platform: member.platform,
          action_type: 'follow',
          target_handle: member.user_handle,
          status: 'pending',
          result: { reason: `High-value follower: ${member.total_interactions} interactions, ${member.buying_intent_score} intent score` },
        });
        followedBack++;
      } else {
        ignored++;
      }
    }

    log(`Follow-back processing: ${members.length} analyzed, ${followedBack} queued for follow, ${ignored} ignored`);
    return { analyzed: members.length, followedBack, ignored };
  } catch (err) {
    log(`Follow-back processing failed: ${err instanceof Error ? err.message : String(err)}`);
    return { analyzed: 0, followedBack: 0, ignored: 0 };
  }
}

// ---------------------------------------------------------------------------
// DM sequence management
// ---------------------------------------------------------------------------

export async function manageDMSequences(): Promise<{ sequencesProcessed: number; messagesSent: number }> {
  log('Managing DM sequences...');
  const db = getServerClient();
  const llm = new OllamaClient();

  try {
    // Find active sequences that need their next message sent
    const now = new Date().toISOString();
    const { data: dueSequences } = await db
      .from('dm_sequences')
      .select('*')
      .eq('status', 'active')
      .lte('next_message_at', now)
      .limit(20);

    if (!dueSequences || dueSequences.length === 0) {
      log('No DM sequences due for processing');
      return { sequencesProcessed: 0, messagesSent: 0 };
    }

    let messagesSent = 0;

    for (const seq of dueSequences) {
      try {
        const triggerConfig = DEFAULT_DM_SEQUENCES.find(d => d.trigger === seq.trigger_type);
        if (!triggerConfig || seq.current_step >= triggerConfig.steps.length) {
          // Sequence complete
          await db.from('dm_sequences').update({ status: 'completed' }).eq('id', seq.id);
          continue;
        }

        const step = triggerConfig.steps[seq.current_step];
        const template = MESSAGE_TEMPLATES[step.message_template] || step.message_template;

        // Personalize with Ollama
        let personalizedMessage: string;
        try {
          const prompt = `Personalize this DM message for @${seq.user_handle} on ${seq.platform}. Keep the same intent but make it feel natural and personal. Do not add emojis. Reply with ONLY the message text.

Template: "${template}"`;
          personalizedMessage = (await llm.generate('phi3:mini', prompt)).trim().replace(/^["']|["']$/g, '');
        } catch {
          personalizedMessage = template;
        }

        // Store the message as an engagement action
        await db.from('engagement_actions').insert({
          platform: seq.platform,
          action_type: 'dm',
          target_handle: seq.user_handle,
          content: personalizedMessage,
          status: 'pending',
          result: { sequence_id: seq.id, step: seq.current_step, trigger: seq.trigger_type },
        });

        // Update sequence to next step
        const nextStep = seq.current_step + 1;
        const isComplete = nextStep >= triggerConfig.steps.length;

        if (isComplete) {
          await db.from('dm_sequences').update({ status: 'completed', current_step: nextStep }).eq('id', seq.id);
        } else {
          const nextStepConfig = triggerConfig.steps[nextStep];
          const nextMessageAt = new Date(Date.now() + nextStepConfig.delay_hours * 3600000).toISOString();
          await db.from('dm_sequences').update({ current_step: nextStep, next_message_at: nextMessageAt }).eq('id', seq.id);
        }

        messagesSent++;
      } catch (err) {
        log(`Failed to process sequence for @${seq.user_handle}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    log(`DM sequences: ${dueSequences.length} processed, ${messagesSent} messages queued`);
    return { sequencesProcessed: dueSequences.length, messagesSent };
  } catch (err) {
    log(`DM sequence management failed: ${err instanceof Error ? err.message : String(err)}`);
    return { sequencesProcessed: 0, messagesSent: 0 };
  }
}

// ---------------------------------------------------------------------------
// Start a new DM sequence for a user
// ---------------------------------------------------------------------------

export async function startDMSequence(userHandle: string, platform: string, trigger: string): Promise<string | null> {
  const db = getServerClient();

  const config = DEFAULT_DM_SEQUENCES.find(d => d.trigger === trigger);
  if (!config) {
    log(`No sequence config for trigger: ${trigger}`);
    return null;
  }

  // Check if user already has an active sequence
  const { data: existing } = await db
    .from('dm_sequences')
    .select('id')
    .eq('user_handle', userHandle)
    .eq('platform', platform)
    .eq('status', 'active')
    .limit(1);

  if (existing && existing.length > 0) {
    log(`User @${userHandle} already has an active sequence`);
    return existing[0].id;
  }

  const firstStepDelay = config.steps[0].delay_hours;
  const nextMessageAt = new Date(Date.now() + firstStepDelay * 3600000).toISOString();

  const { data: inserted } = await db
    .from('dm_sequences')
    .insert({
      user_handle: userHandle,
      platform,
      trigger_type: trigger,
      current_step: 0,
      total_steps: config.steps.length,
      next_message_at: nextMessageAt,
    })
    .select('id')
    .single();

  if (inserted) {
    log(`Started DM sequence for @${userHandle} (trigger: ${trigger}, ${config.steps.length} steps)`);
    return inserted.id;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Engagement scoring
// ---------------------------------------------------------------------------

export async function scoreEngagement(): Promise<EngagementScore[]> {
  log('Scoring community engagement...');
  const db = getServerClient();
  const llm = new OllamaClient();

  try {
    // Aggregate interactions from comments
    const { data: commentData } = await db
      .from('comments')
      .select('author_handle, platform, content, is_potential_customer')
      .not('author_handle', 'is', null)
      .order('created_at', { ascending: false })
      .limit(500);

    if (!commentData || commentData.length === 0) {
      log('No comment data for engagement scoring');
      return [];
    }

    // Group by user
    const userMap = new Map<string, {
      handle: string;
      platform: string;
      comments: string[];
      commentCount: number;
      hasBuyingIntent: boolean;
    }>();

    for (const c of commentData) {
      const key = `${c.author_handle}:${c.platform}`;
      const existing = userMap.get(key);
      if (existing) {
        existing.commentCount++;
        existing.comments.push(c.content);
        if (c.is_potential_customer) existing.hasBuyingIntent = true;
      } else {
        userMap.set(key, {
          handle: c.author_handle,
          platform: c.platform,
          comments: [c.content],
          commentCount: 1,
          hasBuyingIntent: c.is_potential_customer || false,
        });
      }
    }

    const scores: EngagementScore[] = [];

    for (const [_key, user] of userMap) {
      // Calculate buying intent from comment content
      let buyingIntent = user.hasBuyingIntent ? 40 : 0;
      buyingIntent += Math.min(30, user.commentCount * 5); // More comments = more intent

      // Use LLM for top commenters to assess intent
      if (user.commentCount >= 3 && buyingIntent < 60) {
        try {
          const prompt = `Based on these comments from a social media follower, rate their buying intent from 0-100. Consider: do they ask about products, prices, how to get started, express pain points, or show interest in services? Reply with ONLY a JSON: {"score": <number>}

Comments: ${user.comments.slice(0, 5).map(c => `"${c.slice(0, 100)}"`).join(', ')}`;

          const result = await llm.generateJSON('phi3:mini', prompt);
          buyingIntent = Math.max(buyingIntent, Number(result.score) || 0);
        } catch {
          // Keep existing score
        }
      }

      buyingIntent = Math.min(100, buyingIntent);

      let recommended_action: EngagementScore['recommended_action'];
      if (buyingIntent >= 70) recommended_action = 'pitch';
      else if (buyingIntent >= 40 || user.commentCount >= 5) recommended_action = 'nurture';
      else if (user.commentCount >= 10) recommended_action = 'vip';
      else recommended_action = 'ignore';

      const score: EngagementScore = {
        user_handle: user.handle,
        platform: user.platform,
        total_interactions: user.commentCount,
        comment_count: user.commentCount,
        share_count: 0,
        dm_count: 0,
        buying_intent_score: buyingIntent,
        recommended_action,
      };

      // Upsert to community_scores
      await db.from('community_scores').upsert({
        user_handle: user.handle,
        platform: user.platform,
        total_interactions: user.commentCount,
        comment_count: user.commentCount,
        buying_intent_score: buyingIntent,
        recommended_action,
        last_interaction_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_handle,platform' });

      scores.push(score);
    }

    scores.sort((a, b) => b.buying_intent_score - a.buying_intent_score);
    log(`Scored ${scores.length} community members. ${scores.filter(s => s.recommended_action === 'pitch').length} ready for pitch, ${scores.filter(s => s.recommended_action === 'vip').length} VIPs`);
    return scores;
  } catch (err) {
    log(`Engagement scoring failed: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Daily engagement schedule
// ---------------------------------------------------------------------------

export async function getEngagementSchedule(): Promise<EngagementTask[]> {
  log('Generating daily engagement schedule...');
  const db = getServerClient();

  try {
    const tasks: EngagementTask[] = [];

    // 1. Pending strategic comments
    const { data: pendingComments } = await db
      .from('engagement_actions')
      .select('*')
      .eq('action_type', 'comment')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(10);

    if (pendingComments) {
      for (const c of pendingComments) {
        tasks.push({
          platform: c.platform,
          action: 'comment',
          target_url: c.target_url || '',
          target_handle: c.target_handle || '',
          reason: (c.result as Record<string, string>)?.reason || 'Strategic comment',
          priority: (c.result as Record<string, number>)?.priority || 50,
          generated_comment: c.content || undefined,
        });
      }
    }

    // 2. Pending follow-backs
    const { data: pendingFollows } = await db
      .from('engagement_actions')
      .select('*')
      .eq('action_type', 'follow')
      .eq('status', 'pending')
      .limit(10);

    if (pendingFollows) {
      for (const f of pendingFollows) {
        tasks.push({
          platform: f.platform,
          action: 'follow',
          target_url: '',
          target_handle: f.target_handle || '',
          reason: (f.result as Record<string, string>)?.reason || 'Follow-back high-value user',
          priority: 40,
        });
      }
    }

    // 3. High-intent DMs that need responses
    const { data: highIntentUsers } = await db
      .from('community_scores')
      .select('user_handle, platform, buying_intent_score')
      .eq('recommended_action', 'pitch')
      .order('buying_intent_score', { ascending: false })
      .limit(5);

    if (highIntentUsers) {
      for (const u of highIntentUsers) {
        tasks.push({
          platform: u.platform,
          action: 'comment',
          target_url: '',
          target_handle: u.user_handle,
          reason: `High buying intent (${u.buying_intent_score}/100) — engage and nurture`,
          priority: 90,
        });
      }
    }

    tasks.sort((a, b) => b.priority - a.priority);
    log(`Generated engagement schedule: ${tasks.length} tasks`);
    return tasks;
  } catch (err) {
    log(`Engagement schedule generation failed: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}
