// ============================================================================
// Content Empire — HYPERGROWTH ENGINE
// ============================================================================
// Real-time breaking news pipeline, content velocity multiplier, aggressive
// posting calendar, trend speed response, and performance-based volume scaling.
// Target: 1M followers in 30 days through maximum content velocity.
// ============================================================================

import { getServerClient } from '@/lib/db';
import { OllamaClient } from '@/lib/ollama';

const log = (msg: string) => console.log(`[hypergrowth] ${new Date().toISOString()} ${msg}`);

// ---------------------------------------------------------------------------
// Hypergrowth posting schedule — 26+ posts/day across all platforms
// ---------------------------------------------------------------------------

export const HYPERGROWTH_SCHEDULE: Record<string, { posts_per_day: number; peak_hours: number[] }> = {
  tiktok: { posts_per_day: 6, peak_hours: [7, 9, 12, 15, 18, 21] },
  reels: { posts_per_day: 5, peak_hours: [8, 11, 14, 17, 20] },
  youtube_shorts: { posts_per_day: 4, peak_hours: [10, 13, 16, 19] },
  linkedin: { posts_per_day: 3, peak_hours: [8, 12, 17] },
  twitter: { posts_per_day: 8, peak_hours: [7, 9, 11, 13, 15, 17, 19, 21] },
};

export const TOTAL_DAILY_TARGET = Object.values(HYPERGROWTH_SCHEDULE)
  .reduce((sum, p) => sum + p.posts_per_day, 0);

// ---------------------------------------------------------------------------
// 1. BREAKING NEWS PIPELINE — detect → script → schedule in <5 minutes
// ---------------------------------------------------------------------------

export async function breakingNewsPipeline(): Promise<{
  triggered: boolean;
  scriptIds: string[];
  scheduledPosts: number;
}> {
  const db = getServerClient();
  const result = { triggered: false, scriptIds: [] as string[], scheduledPosts: 0 };

  try {
    // Find high-importance unprocessed items from last 30 minutes
    const thirtyMinAgo = new Date(Date.now() - 30 * 60000).toISOString();
    const { data: items } = await db
      .from('radar_items')
      .select('id, title, summary, source, importance_score, category')
      .eq('processed', false)
      .gte('importance_score', 75)
      .gte('first_seen_at', thirtyMinAgo)
      .order('importance_score', { ascending: false })
      .limit(3);

    if (!items || items.length === 0) return result;

    result.triggered = true;
    log(`🚨 BREAKING: ${items.length} high-priority items detected!`);

    const llm = new OllamaClient();

    for (const item of items) {
      try {
        // Generate script immediately
        const hookPrompt = `Write 5 viral video hooks (first 3 seconds) for this breaking AI news. Each hook must stop the scroll. Be bold, specific, urgent. Reply as JSON array of strings.

NEWS: ${item.title}
${item.summary || ''}`;

        let hooks: string[];
        try {
          hooks = await llm.generateJSON('mistral', hookPrompt) as unknown as string[];
          if (!Array.isArray(hooks)) hooks = [item.title];
        } catch {
          hooks = [
            `BREAKING: ${item.title}`,
            `This just dropped and nobody's talking about it yet`,
            `Stop everything. ${item.title.split(' ').slice(0, 6).join(' ')}...`,
          ];
        }

        const bodyPrompt = `Write a 30-second video script body for this AI news. Be concise, punchy, give genuine insight. No fluff. Under 100 words.

NEWS: ${item.title}
SUMMARY: ${item.summary || 'Breaking AI news'}`;

        let body: string;
        try { body = await llm.generate('mistral', bodyPrompt); } catch { body = item.summary || item.title; }

        const caption = `${hooks[0]}\n\n${item.title}\n\n#AI #AINews #Breaking #Tech`;

        // Insert script
        const { data: script } = await db
          .from('scripts')
          .insert({
            radar_item_id: item.id,
            topic: item.title,
            content_pillar: 'breaking_news',
            hook: hooks[0],
            hook_variants: hooks,
            body: body.slice(0, 2000),
            cta: 'Follow for more AI updates — I cover everything first.',
            cta_type: 'follow',
            caption,
            caption_variants: [caption],
            hashtags: ['AI', 'AINews', 'Breaking', 'Tech', 'Artificial Intelligence'],
            estimated_duration: 30,
            status: 'approved', // Auto-approve breaking news
          })
          .select('id')
          .single();

        if (!script) continue;
        result.scriptIds.push(script.id);

        // Schedule to ALL platforms within next 15 minutes
        const platforms = Object.keys(HYPERGROWTH_SCHEDULE);
        for (let i = 0; i < platforms.length; i++) {
          const scheduledAt = new Date(Date.now() + (i + 1) * 3 * 60000).toISOString(); // stagger by 3 min
          await db.from('posting_queue').insert({
            platform: platforms[i],
            caption,
            hashtags: ['AI', 'AINews', 'Breaking', 'Tech'],
            scheduled_at: scheduledAt,
            status: 'scheduled',
          });
          result.scheduledPosts++;
        }

        // Mark radar item as processed
        await db.from('radar_items').update({ processed: true }).eq('id', item.id);

        log(`✅ BREAKING SCRIPT: "${item.title}" → ${platforms.length} platforms scheduled`);
      } catch (err) {
        log(`Failed to process breaking item "${item.title}": ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Send notification
    try {
      await db.from('notifications').insert({
        title: '🚨 Breaking News Content Published',
        message: `${result.scriptIds.length} scripts generated, ${result.scheduledPosts} posts scheduled across all platforms`,
        category: 'breaking_news',
        priority: 'critical',
        channels_sent: ['dashboard'],
      });
    } catch { /* notification failure is non-critical */ }

    return result;
  } catch (err) {
    log(`Breaking news pipeline error: ${err instanceof Error ? err.message : String(err)}`);
    return result;
  }
}

// ---------------------------------------------------------------------------
// 2. CONTENT VELOCITY MULTIPLIER — 1 script → 30-50 content pieces
// ---------------------------------------------------------------------------

export async function multiplyContent(scriptId: string): Promise<{
  totalPieces: number;
  scheduled: number;
}> {
  const db = getServerClient();
  const llm = new OllamaClient();
  let totalPieces = 0;
  let scheduled = 0;

  try {
    const { data: script } = await db
      .from('scripts')
      .select('*')
      .eq('id', scriptId)
      .single();

    if (!script) throw new Error(`Script ${scriptId} not found`);

    log(`Multiplying content for: "${script.topic}"`);

    // --- Hook variants → separate scripts ---
    const hookVariants: string[] = script.hook_variants || [script.hook];
    for (let i = 1; i < Math.min(hookVariants.length, 4); i++) {
      await db.from('scripts').insert({
        radar_item_id: script.radar_item_id,
        topic: script.topic,
        content_pillar: script.content_pillar,
        hook: hookVariants[i],
        hook_variants: [hookVariants[i]],
        body: script.body,
        cta: script.cta,
        cta_type: script.cta_type,
        caption: script.caption,
        hashtags: script.hashtags,
        estimated_duration: script.estimated_duration,
        status: 'approved',
      });
      totalPieces++;
    }

    // --- Twitter thread ---
    try {
      const threadPrompt = `Convert this content into a Twitter/X thread of 5-7 tweets. First tweet must be a hook. Last tweet should be a CTA. Each tweet under 280 chars. Reply as JSON array of strings.

TOPIC: ${script.topic}
HOOK: ${script.hook}
BODY: ${script.body?.slice(0, 500)}`;

      const thread = await llm.generateJSON('mistral', threadPrompt);
      if (Array.isArray(thread)) {
        await db.from('repurposed_content').insert({
          script_id: scriptId,
          format: 'twitter_thread',
          content: { tweets: thread },
          status: 'draft',
        });
        totalPieces++;

        // Schedule thread as individual tweets
        for (let i = 0; i < thread.length; i++) {
          await db.from('posting_queue').insert({
            platform: 'twitter',
            caption: String(thread[i]),
            hashtags: (script.hashtags || []).slice(0, 3),
            scheduled_at: new Date(Date.now() + (i + 1) * 15 * 60000).toISOString(),
            status: 'scheduled',
          });
          scheduled++;
        }
      }
    } catch { log('Thread generation failed, continuing'); }

    // --- LinkedIn post ---
    try {
      const linkedinPrompt = `Rewrite this as a professional LinkedIn post (1000-1300 chars). Start with a bold opening line. Use line breaks. End with a question. No hashtags in body.

TOPIC: ${script.topic}
KEY POINTS: ${script.body?.slice(0, 400)}`;

      const linkedinPost = await llm.generate('mistral', linkedinPrompt);
      await db.from('repurposed_content').insert({
        script_id: scriptId,
        format: 'linkedin_post',
        content: { text: linkedinPost },
        status: 'draft',
      });
      totalPieces++;

      await db.from('posting_queue').insert({
        platform: 'linkedin',
        caption: linkedinPost.slice(0, 3000),
        hashtags: (script.hashtags || []).slice(0, 3),
        scheduled_at: new Date(Date.now() + 2 * 3600000).toISOString(),
        status: 'scheduled',
      });
      scheduled++;
    } catch { log('LinkedIn post generation failed, continuing'); }

    // --- Quote cards (5) ---
    try {
      const quotePrompt = `Extract 5 shareable quote-worthy statements from this content. Each should be punchy, screenshot-worthy, under 100 chars. Reply as JSON array of strings.

CONTENT: ${script.hook} ${script.body?.slice(0, 500)}`;

      const quotes = await llm.generateJSON('mistral', quotePrompt);
      if (Array.isArray(quotes)) {
        for (const quote of quotes.slice(0, 5)) {
          await db.from('repurposed_content').insert({
            script_id: scriptId,
            format: 'quote_card',
            content: { quote: String(quote) },
            status: 'draft',
          });
          totalPieces++;
        }
      }
    } catch { log('Quote generation failed, continuing'); }

    // --- Controversial take ---
    try {
      const controversyPrompt = `Take this topic and write a controversial hot take version (2-3 sentences) designed to get people arguing in the comments. Be bold but not offensive. Reply with just the text.

TOPIC: ${script.topic}`;

      const hotTake = await llm.generate('mistral', controversyPrompt);
      await db.from('repurposed_content').insert({
        script_id: scriptId,
        format: 'hot_take',
        content: { text: hotTake },
        status: 'draft',
      });
      totalPieces++;

      // Schedule hot take to Twitter
      await db.from('posting_queue').insert({
        platform: 'twitter',
        caption: hotTake.slice(0, 280),
        hashtags: ['AI', 'HotTake'],
        scheduled_at: new Date(Date.now() + 4 * 3600000).toISOString(),
        status: 'scheduled',
      });
      scheduled++;
    } catch { log('Hot take generation failed, continuing'); }

    // --- Engagement poll ---
    try {
      const pollPrompt = `Create an engagement poll about this topic. Reply as JSON: {"question": "...", "options": ["A", "B", "C", "D"]}

TOPIC: ${script.topic}`;

      const poll = await llm.generateJSON('mistral', pollPrompt);
      await db.from('repurposed_content').insert({
        script_id: scriptId,
        format: 'poll',
        content: poll,
        status: 'draft',
      });
      totalPieces++;
    } catch { log('Poll generation failed, continuing'); }

    log(`✅ Multiplied "${script.topic}" → ${totalPieces} pieces, ${scheduled} scheduled`);
    return { totalPieces, scheduled };
  } catch (err) {
    log(`Content multiplication failed: ${err instanceof Error ? err.message : String(err)}`);
    return { totalPieces, scheduled };
  }
}

// ---------------------------------------------------------------------------
// 3. FILL POSTING CALENDAR — ensure all daily slots are filled
// ---------------------------------------------------------------------------

export async function fillPostingCalendar(date?: Date): Promise<{
  slots_filled: number;
  total_slots: number;
}> {
  const db = getServerClient();
  const targetDate = date || new Date();
  const dateStr = targetDate.toISOString().split('T')[0];
  let slotsFilled = 0;

  try {
    // Count already-scheduled posts for today per platform
    const startOfDay = `${dateStr}T00:00:00Z`;
    const endOfDay = `${dateStr}T23:59:59Z`;

    for (const [platform, config] of Object.entries(HYPERGROWTH_SCHEDULE)) {
      const { data: existing } = await db
        .from('posting_queue')
        .select('id, scheduled_at')
        .eq('platform', platform)
        .gte('scheduled_at', startOfDay)
        .lte('scheduled_at', endOfDay)
        .in('status', ['scheduled', 'posted', 'posting']);

      const existingCount = existing?.length || 0;
      const slotsNeeded = config.posts_per_day - existingCount;

      if (slotsNeeded <= 0) continue;

      // Get highest-scoring unscheduled scripts
      const { data: scripts } = await db
        .from('scripts')
        .select('id, topic, caption, hashtags, performance_score')
        .in('status', ['approved', 'draft'])
        .order('performance_score', { ascending: false, nullsFirst: false })
        .limit(slotsNeeded);

      if (!scripts || scripts.length === 0) continue;

      // Find which peak hours are unfilled
      const existingHours = new Set(
        (existing || []).map((p: { scheduled_at: string }) => new Date(p.scheduled_at).getUTCHours())
      );
      const availableHours = config.peak_hours.filter(h => !existingHours.has(h));

      for (let i = 0; i < Math.min(scripts.length, availableHours.length); i++) {
        const hour = availableHours[i];
        const scheduledAt = `${dateStr}T${String(hour).padStart(2, '0')}:${String(Math.floor(Math.random() * 30)).padStart(2, '0')}:00Z`;

        await db.from('posting_queue').insert({
          platform,
          caption: scripts[i].caption || scripts[i].topic,
          hashtags: scripts[i].hashtags || ['AI'],
          scheduled_at: scheduledAt,
          status: 'scheduled',
        });

        // Mark script as scheduled
        await db.from('scripts').update({ status: 'posted' }).eq('id', scripts[i].id);
        slotsFilled++;
      }
    }

    log(`Calendar filled: ${slotsFilled} new posts scheduled for ${dateStr}`);
    return { slots_filled: slotsFilled, total_slots: TOTAL_DAILY_TARGET };
  } catch (err) {
    log(`Calendar fill error: ${err instanceof Error ? err.message : String(err)}`);
    return { slots_filled: slotsFilled, total_slots: TOTAL_DAILY_TARGET };
  }
}

// ---------------------------------------------------------------------------
// 4. TREND SPEED CHECK — be first to cover every major story
// ---------------------------------------------------------------------------

export async function trendSpeedCheck(): Promise<{
  trends_found: number;
  scripts_created: number;
}> {
  const db = getServerClient();
  let scriptsCreated = 0;

  try {
    // Get radar items from last 15 minutes with importance > 60
    const fifteenMinAgo = new Date(Date.now() - 15 * 60000).toISOString();
    const { data: items } = await db
      .from('radar_items')
      .select('id, title, summary, importance_score')
      .eq('processed', false)
      .gte('importance_score', 60)
      .gte('first_seen_at', fifteenMinAgo)
      .order('importance_score', { ascending: false })
      .limit(5);

    if (!items || items.length === 0) return { trends_found: 0, scripts_created: 0 };

    // Check if any competitor already covered these
    for (const item of items) {
      const keywords = item.title.toLowerCase().split(/\s+/).filter((w: string) => w.length > 4).slice(0, 3);
      if (keywords.length === 0) continue;

      const { data: competitorCoverage } = await db
        .from('competitor_posts')
        .select('id')
        .gte('posted_at', fifteenMinAgo)
        .limit(1);

      // If no competitors covered it yet, we go FAST
      const isUncovered = !competitorCoverage || competitorCoverage.length === 0;

      if (isUncovered || item.importance_score >= 80) {
        const llm = new OllamaClient();
        try {
          const hookPrompt = `Write a viral 3-second video hook for this AI news. Bold, urgent, specific. Under 15 words. Reply with just the hook text.

NEWS: ${item.title}`;

          const hook = await llm.generate('mistral', hookPrompt);

          await db.from('scripts').insert({
            radar_item_id: item.id,
            topic: item.title,
            content_pillar: 'breaking_news',
            hook: hook.trim().replace(/^["']|["']$/g, ''),
            body: item.summary || item.title,
            cta: 'Follow for the fastest AI news coverage.',
            cta_type: 'follow',
            caption: `${hook.trim()}\n\n#AI #AINews #Breaking`,
            hashtags: ['AI', 'AINews', 'Breaking', 'Tech'],
            estimated_duration: 30,
            status: 'approved',
          });

          await db.from('radar_items').update({ processed: true }).eq('id', item.id);
          scriptsCreated++;
          log(`⚡ SPEED: Beat competitors on "${item.title}"`);
        } catch {
          log(`Speed script generation failed for "${item.title}"`);
        }
      }
    }

    return { trends_found: items.length, scripts_created: scriptsCreated };
  } catch (err) {
    log(`Trend speed check error: ${err instanceof Error ? err.message : String(err)}`);
    return { trends_found: 0, scripts_created: 0 };
  }
}

// ---------------------------------------------------------------------------
// 5. PERFORMANCE-BASED VOLUME SCALING
// ---------------------------------------------------------------------------

export async function adjustVolume(): Promise<void> {
  const db = getServerClient();

  try {
    // Check platform engagement rates over last 7 days
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: analytics } = await db
      .from('post_analytics')
      .select('platform, engagement_rate, views, follower_change')
      .gte('measured_at', weekAgo);

    if (!analytics || analytics.length === 0) {
      log('No analytics data for volume adjustment');
      return;
    }

    // Group by platform
    const platformStats: Record<string, { totalEngagement: number; totalViews: number; totalFollowerGrowth: number; count: number }> = {};

    for (const a of analytics) {
      if (!platformStats[a.platform]) {
        platformStats[a.platform] = { totalEngagement: 0, totalViews: 0, totalFollowerGrowth: 0, count: 0 };
      }
      platformStats[a.platform].totalEngagement += a.engagement_rate || 0;
      platformStats[a.platform].totalViews += a.views || 0;
      platformStats[a.platform].totalFollowerGrowth += a.follower_change || 0;
      platformStats[a.platform].count++;
    }

    for (const [platform, stats] of Object.entries(platformStats)) {
      const avgEngagement = stats.count > 0 ? stats.totalEngagement / stats.count : 0;
      const weeklyFollowerGrowth = stats.totalFollowerGrowth;

      // If engagement > 5%, increase frequency
      if (avgEngagement > 0.05 && HYPERGROWTH_SCHEDULE[platform]) {
        const newTarget = Math.min(10, Math.ceil(HYPERGROWTH_SCHEDULE[platform].posts_per_day * 1.5));
        log(`📈 ${platform}: ${(avgEngagement * 100).toFixed(1)}% engagement → increasing to ${newTarget} posts/day`);
        HYPERGROWTH_SCHEDULE[platform].posts_per_day = newTarget;
      }

      // If driving >1000 followers/week, double down
      if (weeklyFollowerGrowth > 1000 && HYPERGROWTH_SCHEDULE[platform]) {
        log(`🚀 ${platform}: +${weeklyFollowerGrowth} followers/week → doubling content frequency`);
        HYPERGROWTH_SCHEDULE[platform].posts_per_day = Math.min(12, HYPERGROWTH_SCHEDULE[platform].posts_per_day * 2);
      }
    }

    // Check content pillar performance
    const { data: pillarData } = await db
      .from('content_pillar_config')
      .select('name, frequency');

    if (pillarData) {
      log(`Volume adjustment complete. Current targets: ${JSON.stringify(
        Object.fromEntries(Object.entries(HYPERGROWTH_SCHEDULE).map(([k, v]) => [k, v.posts_per_day]))
      )}`);
    }
  } catch (err) {
    log(`Volume adjustment error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// 6. COMMENT BAIT GENERATION
// ---------------------------------------------------------------------------

export async function generateCommentBait(scriptId: string): Promise<string[]> {
  const db = getServerClient();
  const llm = new OllamaClient();

  try {
    const { data: script } = await db
      .from('scripts')
      .select('topic, hook, body')
      .eq('id', scriptId)
      .single();

    if (!script) return [];

    const prompt = `Generate 5 comment-baiting elements for this video. Each should provoke maximum comments. Reply as JSON array of strings.

Types needed:
1. Controversial statement (forces agree/disagree)
2. Easy question ("What do you think about X?")
3. Challenge ("Bet you can't name 3 AI tools that do X")
4. Fill-in-the-blank ("The best AI tool for ___ is ___")
5. This-or-that choice ("ChatGPT or Claude for coding?")

TOPIC: ${script.topic}
HOOK: ${script.hook}`;

    const result = await llm.generateJSON('mistral', prompt);
    if (Array.isArray(result)) {
      return result.map(String).slice(0, 5);
    }
    return [`What do you think about ${script.topic}? Comment below 👇`];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// 7. HYPERGROWTH METRICS DASHBOARD
// ---------------------------------------------------------------------------

export interface HypergrowthMetrics {
  daily_content_output: number;
  posts_today: number;
  posts_target: number;
  breaking_news_response_avg_min: number;
  viral_score_avg: number;
  content_multiplication_ratio: number;
  trending_topics_covered: number;
  trending_topics_missed: number;
  follower_velocity: Record<string, number>;
  projected_1m_date: string;
  posts_per_platform: Record<string, number>;
}

export async function getHypergrowthMetrics(): Promise<HypergrowthMetrics> {
  const db = getServerClient();
  const today = new Date().toISOString().split('T')[0];
  const startOfDay = `${today}T00:00:00Z`;

  try {
    // Posts today per platform
    const { data: todayPosts } = await db
      .from('posting_queue')
      .select('platform')
      .gte('scheduled_at', startOfDay)
      .in('status', ['scheduled', 'posted', 'posting']);

    const postsPerPlatform: Record<string, number> = {};
    for (const p of todayPosts || []) {
      postsPerPlatform[p.platform] = (postsPerPlatform[p.platform] || 0) + 1;
    }

    // Scripts today
    const { data: todayScripts } = await db
      .from('scripts')
      .select('id')
      .gte('created_at', startOfDay);

    // Viral score average
    const { data: predictions } = await db
      .from('viral_predictions')
      .select('predicted_score')
      .gte('created_at', startOfDay);

    const avgViral = predictions && predictions.length > 0
      ? predictions.reduce((s: number, p: { predicted_score: number }) => s + p.predicted_score, 0) / predictions.length
      : 0;

    // Trending topics covered vs missed
    const { data: radarItems } = await db
      .from('radar_items')
      .select('processed, importance_score')
      .gte('first_seen_at', startOfDay)
      .gte('importance_score', 60);

    const covered = (radarItems || []).filter((r: { processed: boolean }) => r.processed).length;
    const missed = (radarItems || []).filter((r: { processed: boolean }) => !r.processed).length;

    // Follower velocity from growth_velocity
    const { data: velocity } = await db
      .from('growth_velocity')
      .select('platform, daily_growth, follower_count')
      .eq('date', today);

    const followerVelocity: Record<string, number> = {};
    let totalFollowers = 0;
    let totalDailyGrowth = 0;

    for (const v of velocity || []) {
      followerVelocity[v.platform] = v.daily_growth || 0;
      totalFollowers += v.follower_count || 0;
      totalDailyGrowth += v.daily_growth || 0;
    }

    // Project 1M date
    const daysTo1M = totalDailyGrowth > 0
      ? Math.ceil((1000000 - totalFollowers) / totalDailyGrowth)
      : 999;
    const projected1MDate = new Date(Date.now() + daysTo1M * 86400000).toISOString().split('T')[0];

    return {
      daily_content_output: (todayScripts?.length || 0),
      posts_today: todayPosts?.length || 0,
      posts_target: TOTAL_DAILY_TARGET,
      breaking_news_response_avg_min: 5, // Target
      viral_score_avg: Math.round(avgViral),
      content_multiplication_ratio: (todayPosts?.length || 1) / Math.max(1, todayScripts?.length || 1),
      trending_topics_covered: covered,
      trending_topics_missed: missed,
      follower_velocity: followerVelocity,
      projected_1m_date: projected1MDate,
      posts_per_platform: postsPerPlatform,
    };
  } catch (err) {
    log(`Metrics error: ${err instanceof Error ? err.message : String(err)}`);
    return {
      daily_content_output: 0, posts_today: 0, posts_target: TOTAL_DAILY_TARGET,
      breaking_news_response_avg_min: 0, viral_score_avg: 0, content_multiplication_ratio: 0,
      trending_topics_covered: 0, trending_topics_missed: 0,
      follower_velocity: {}, projected_1m_date: 'N/A', posts_per_platform: {},
    };
  }
}
