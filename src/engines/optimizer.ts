import { getServerClient } from '@/lib/db';

const log = (msg: string) => console.log(`[optimizer] ${new Date().toISOString()} ${msg}`);

interface TopicPerformance {
  content_pillar: string;
  total_follower_growth: number;
  avg_engagement: number;
  avg_virality: number;
}

interface TimingPerformance {
  platform: string;
  day_of_week: number;
  hour: number;
  avg_views: number;
  avg_engagement: number;
}

interface FormatPerformance {
  caption_style: string;
  color_grade: string;
  text_position: string;
  retention: number;
  engagement: number;
}

interface HookPerformance {
  hook: string;
  avg_retention: number;
  avg_engagement: number;
}

interface Recommendation {
  type: string;
  action: string;
  priority: 'high' | 'medium' | 'low';
}

export async function weeklyOptimization(): Promise<{
  recommendations: Recommendation[];
  report: Record<string, unknown>;
  persisted: {
    pillarsUpdated: number;
    scheduleSlots: number;
    variationPresets: number;
    hooksStored: number;
    reportId: string | null;
  };
}> {
  log('Starting weekly optimization...');

  const persisted = {
    pillarsUpdated: 0,
    scheduleSlots: 0,
    variationPresets: 0,
    hooksStored: 0,
    reportId: null as string | null,
  };

  try {
    const hookData = await analyzeHooks();
    const topicData = await analyzeTopics();
    const timingData = await analyzeTiming();
    const formatData = await analyzeFormats();
    const revenueData = await analyzeRevenue();

    if (topicData.length > 0) {
      persisted.pillarsUpdated = await adjustPillarFrequencies(topicData);
    }

    if (timingData.length > 0) {
      persisted.scheduleSlots = await updatePostingSchedule(timingData);
    }

    if (formatData.length > 0) {
      persisted.variationPresets = await updateVariationPresets(formatData);
    }

    if (hookData.length > 0) {
      persisted.hooksStored = await updateHookTemplates(hookData);
    }

    const recommendations = generateRecommendations(hookData, topicData, timingData, formatData, revenueData);

    const report = await generateWeeklyReport({
      hookData,
      topicData,
      timingData,
      formatData,
      revenueData,
      recommendations,
    });

    persisted.reportId = (report._id as string) || null;

    await calculateGrowthProjections();

    log(`Weekly optimization complete. ${recommendations.length} recommendations generated. Persisted: ${persisted.pillarsUpdated} pillars, ${persisted.scheduleSlots} schedule slots, ${persisted.variationPresets} variation presets, ${persisted.hooksStored} hooks.`);
    return { recommendations, report, persisted };
  } catch (error) {
    log(`Weekly optimization failed: ${error instanceof Error ? error.message : String(error)}`);
    return { recommendations: [], report: {}, persisted };
  }
}

async function analyzeHooks(): Promise<HookPerformance[]> {
  const db = getServerClient();
  try {
    const { data: scripts } = await db
      .from('scripts')
      .select('id, hook')
      .not('hook', 'is', null);

    if (!scripts || scripts.length === 0) return [];

    const results: HookPerformance[] = [];

    for (const script of scripts.slice(0, 50)) {
      const { data: jobs } = await db
        .from('video_jobs')
        .select('id')
        .eq('script_id', script.id);

      if (!jobs || jobs.length === 0) continue;

      const jobIds = jobs.map((j: { id: string }) => j.id);
      const { data: outputs } = await db
        .from('video_outputs')
        .select('id')
        .in('job_id', jobIds);

      if (!outputs || outputs.length === 0) continue;

      const outputIds = outputs.map((o: { id: string }) => o.id);
      const { data: queueItems } = await db
        .from('posting_queue')
        .select('id')
        .in('video_output_id', outputIds)
        .eq('status', 'posted');

      if (!queueItems || queueItems.length === 0) continue;

      const queueIds = queueItems.map((q: { id: string }) => q.id);
      const { data: analytics } = await db
        .from('post_analytics')
        .select('avg_watch_percentage, engagement_rate')
        .in('posting_queue_id', queueIds);

      if (!analytics || analytics.length === 0) continue;

      const avgRetention = analytics.reduce((sum: number, a: { avg_watch_percentage: number }) => sum + (a.avg_watch_percentage || 0), 0) / analytics.length;
      const avgEngagement = analytics.reduce((sum: number, a: { engagement_rate: number }) => sum + (a.engagement_rate || 0), 0) / analytics.length;

      results.push({
        hook: script.hook,
        avg_retention: avgRetention,
        avg_engagement: avgEngagement,
      });
    }

    return results.sort((a, b) => b.avg_retention - a.avg_retention);
  } catch (error) {
    log(`Hook analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

async function analyzeTopics(): Promise<TopicPerformance[]> {
  const db = getServerClient();
  try {
    const { data: pillars } = await db
      .from('scripts')
      .select('content_pillar')
      .not('content_pillar', 'is', null);

    if (!pillars) return [];

    const uniquePillars = Array.from(new Set(pillars.map((p: { content_pillar: string }) => p.content_pillar)));
    const results: TopicPerformance[] = [];

    for (const pillar of uniquePillars) {
      const { data: scripts } = await db
        .from('scripts')
        .select('id')
        .eq('content_pillar', pillar);

      if (!scripts || scripts.length === 0) continue;

      const scriptIds = scripts.map((s: { id: string }) => s.id);
      const { data: jobs } = await db
        .from('video_jobs')
        .select('id')
        .in('script_id', scriptIds);

      if (!jobs || jobs.length === 0) continue;

      const jobIds = jobs.map((j: { id: string }) => j.id);
      const { data: outputs } = await db
        .from('video_outputs')
        .select('id')
        .in('job_id', jobIds);

      if (!outputs || outputs.length === 0) continue;

      const outputIds = outputs.map((o: { id: string }) => o.id);
      const { data: queueItems } = await db
        .from('posting_queue')
        .select('id')
        .in('video_output_id', outputIds)
        .eq('status', 'posted');

      if (!queueItems || queueItems.length === 0) continue;

      const queueIds = queueItems.map((q: { id: string }) => q.id);
      const { data: analytics } = await db
        .from('post_analytics')
        .select('engagement_rate, follower_change, virality_score')
        .in('posting_queue_id', queueIds);

      if (!analytics || analytics.length === 0) continue;

      const totalGrowth = analytics.reduce((sum: number, a: { follower_change: number }) => sum + (a.follower_change || 0), 0);
      const avgEngagement = analytics.reduce((sum: number, a: { engagement_rate: number }) => sum + (a.engagement_rate || 0), 0) / analytics.length;
      const avgVirality = analytics.reduce((sum: number, a: { virality_score: number }) => sum + (a.virality_score || 0), 0) / analytics.length;

      results.push({
        content_pillar: pillar,
        total_follower_growth: totalGrowth,
        avg_engagement: avgEngagement,
        avg_virality: avgVirality,
      });
    }

    return results.sort((a, b) => b.total_follower_growth - a.total_follower_growth);
  } catch (error) {
    log(`Topic analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

async function analyzeTiming(): Promise<TimingPerformance[]> {
  const db = getServerClient();
  try {
    const { data: posted } = await db
      .from('posting_queue')
      .select('id, platform, posted_at')
      .eq('status', 'posted')
      .not('posted_at', 'is', null);

    if (!posted || posted.length === 0) return [];

    const timeSlots: Record<string, { views: number[]; engagement: number[] }> = {};

    for (const post of posted) {
      const date = new Date(post.posted_at);
      const dow = date.getUTCDay();
      const hour = date.getUTCHours();
      const key = `${post.platform}-${dow}-${hour}`;

      const { data: analytics } = await db
        .from('post_analytics')
        .select('views, engagement_rate')
        .eq('posting_queue_id', post.id)
        .order('measured_at', { ascending: false })
        .limit(1);

      if (!analytics || analytics.length === 0) continue;

      if (!timeSlots[key]) {
        timeSlots[key] = { views: [], engagement: [] };
      }
      timeSlots[key].views.push(analytics[0].views || 0);
      timeSlots[key].engagement.push(analytics[0].engagement_rate || 0);
    }

    const results: TimingPerformance[] = Object.entries(timeSlots).map(([key, data]) => {
      const [platform, dow, hour] = key.split('-');
      return {
        platform,
        day_of_week: parseInt(dow),
        hour: parseInt(hour),
        avg_views: data.views.reduce((a, b) => a + b, 0) / data.views.length,
        avg_engagement: data.engagement.reduce((a, b) => a + b, 0) / data.engagement.length,
      };
    });

    return results.sort((a, b) => b.avg_views - a.avg_views);
  } catch (error) {
    log(`Timing analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

async function analyzeFormats(): Promise<FormatPerformance[]> {
  const db = getServerClient();
  try {
    const { data: outputs } = await db
      .from('video_outputs')
      .select('id, variation_config')
      .not('variation_config', 'is', null);

    if (!outputs || outputs.length === 0) return [];

    const formatGroups: Record<string, { retention: number[]; engagement: number[] }> = {};

    for (const output of outputs) {
      const config = output.variation_config as Record<string, string>;
      if (!config) continue;

      const key = `${config.caption_style || 'default'}-${config.color_grade || 'none'}-${config.text_position || 'center'}`;

      const { data: queueItems } = await db
        .from('posting_queue')
        .select('id')
        .eq('video_output_id', output.id)
        .eq('status', 'posted');

      if (!queueItems || queueItems.length === 0) continue;

      const queueIds = queueItems.map((q: { id: string }) => q.id);
      const { data: analytics } = await db
        .from('post_analytics')
        .select('avg_watch_percentage, engagement_rate')
        .in('posting_queue_id', queueIds);

      if (!analytics || analytics.length === 0) continue;

      if (!formatGroups[key]) {
        formatGroups[key] = { retention: [], engagement: [] };
      }

      for (const a of analytics) {
        formatGroups[key].retention.push(a.avg_watch_percentage || 0);
        formatGroups[key].engagement.push(a.engagement_rate || 0);
      }
    }

    const results: FormatPerformance[] = Object.entries(formatGroups).map(([key, data]) => {
      const [caption_style, color_grade, text_position] = key.split('-');
      return {
        caption_style,
        color_grade,
        text_position,
        retention: data.retention.reduce((a, b) => a + b, 0) / data.retention.length,
        engagement: data.engagement.reduce((a, b) => a + b, 0) / data.engagement.length,
      };
    });

    return results.sort((a, b) => b.retention - a.retention);
  } catch (error) {
    log(`Format analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

async function analyzeRevenue(): Promise<{ content_pillar: string; attributed_revenue: number; total_clicks: number }[]> {
  const db = getServerClient();
  try {
    const { data: events } = await db
      .from('revenue_events')
      .select('amount, source_post_id')
      .not('source_post_id', 'is', null);

    if (!events || events.length === 0) return [];

    const pillarRevenue: Record<string, { revenue: number; clicks: number }> = {};

    for (const event of events) {
      const { data: queueItem } = await db
        .from('posting_queue')
        .select('video_output_id')
        .eq('id', event.source_post_id)
        .single();

      if (!queueItem) continue;

      const { data: output } = await db
        .from('video_outputs')
        .select('job_id')
        .eq('id', queueItem.video_output_id)
        .single();

      if (!output) continue;

      const { data: job } = await db
        .from('video_jobs')
        .select('script_id')
        .eq('id', output.job_id)
        .single();

      if (!job) continue;

      const { data: script } = await db
        .from('scripts')
        .select('content_pillar')
        .eq('id', job.script_id)
        .single();

      if (!script) continue;

      const pillar = script.content_pillar;
      if (!pillarRevenue[pillar]) {
        pillarRevenue[pillar] = { revenue: 0, clicks: 0 };
      }
      pillarRevenue[pillar].revenue += parseFloat(event.amount) || 0;
      pillarRevenue[pillar].clicks += 1;
    }

    return Object.entries(pillarRevenue)
      .map(([pillar, data]) => ({
        content_pillar: pillar,
        attributed_revenue: data.revenue,
        total_clicks: data.clicks,
      }))
      .sort((a, b) => b.attributed_revenue - a.attributed_revenue);
  } catch (error) {
    log(`Revenue analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

/**
 * UPSERTs content_pillar_config rows with the optimised frequency values.
 * The `frequency` column is TEXT in the schema, so we store a human-readable
 * string like "25.0% (optimized)" alongside the raw numeric value.
 * Returns the number of pillars successfully updated.
 */
export async function adjustPillarFrequencies(topicData: TopicPerformance[]): Promise<number> {
  const db = getServerClient();
  let updated = 0;

  try {
    const totalGrowth = topicData.reduce((sum, t) => sum + Math.max(0, t.total_follower_growth), 0);
    if (totalGrowth === 0) {
      log('No positive growth data — skipping pillar adjustment');
      return 0;
    }

    for (const topic of topicData) {
      const rawFrequency = Math.max(0, topic.total_follower_growth) / totalGrowth;
      const newFrequency = Math.max(0.05, Math.min(0.40, rawFrequency));
      const frequencyLabel = `${(newFrequency * 100).toFixed(1)}%`;

      // Try update first; if no rows matched, insert a new config row
      const { data: existing } = await db
        .from('content_pillar_config')
        .select('id')
        .eq('name', topic.content_pillar)
        .limit(1);

      if (existing && existing.length > 0) {
        const { error } = await db
          .from('content_pillar_config')
          .update({
            frequency: frequencyLabel,
            updated_at: new Date().toISOString(),
          })
          .eq('name', topic.content_pillar);

        if (error) {
          log(`Failed to update pillar ${topic.content_pillar}: ${error.message}`);
        } else {
          updated++;
          log(`Updated pillar ${topic.content_pillar} frequency to ${frequencyLabel}`);
        }
      } else {
        const { error } = await db
          .from('content_pillar_config')
          .insert({
            name: topic.content_pillar,
            frequency: frequencyLabel,
            description: `Auto-created by optimizer — avg engagement ${(topic.avg_engagement * 100).toFixed(2)}%, virality ${(topic.avg_virality * 100).toFixed(2)}%`,
            updated_at: new Date().toISOString(),
          });

        if (error) {
          log(`Failed to insert pillar ${topic.content_pillar}: ${error.message}`);
        } else {
          updated++;
          log(`Inserted new pillar config ${topic.content_pillar} with frequency ${frequencyLabel}`);
        }
      }
    }
  } catch (error) {
    log(`Pillar frequency adjustment failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  return updated;
}

/**
 * Calculates best posting times per platform and persists them to the
 * optimizer_config table under keys like "schedule:<platform>".
 * The posting engine reads these to determine optimal scheduling windows.
 * Returns the total number of schedule slot entries persisted.
 */
export async function updatePostingSchedule(timingData: TimingPerformance[]): Promise<number> {
  const db = getServerClient();
  let totalSlots = 0;

  try {
    const platformSlots: Record<string, TimingPerformance[]> = {};
    for (const slot of timingData) {
      if (!platformSlots[slot.platform]) {
        platformSlots[slot.platform] = [];
      }
      platformSlots[slot.platform].push(slot);
    }

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    for (const [platform, slots] of Object.entries(platformSlots)) {
      const topSlots = slots
        .sort((a, b) => b.avg_views - a.avg_views)
        .slice(0, 5);

      const scheduleEntries = topSlots.map((s, rank) => ({
        rank: rank + 1,
        day_of_week: s.day_of_week,
        day_name: days[s.day_of_week],
        hour: s.hour,
        avg_views: Math.round(s.avg_views),
        avg_engagement: parseFloat(s.avg_engagement.toFixed(4)),
      }));

      const configKey = `schedule:${platform}`;
      const configValue = {
        platform,
        optimal_slots: scheduleEntries,
        updated_at: new Date().toISOString(),
      };

      const { error } = await db
        .from('optimizer_config')
        .upsert(
          {
            config_key: configKey,
            config_value: configValue,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'config_key' },
        );

      if (error) {
        log(`Failed to persist schedule for ${platform}: ${error.message}`);
      } else {
        totalSlots += scheduleEntries.length;
        log(`Persisted ${scheduleEntries.length} optimal time slots for ${platform}`);
      }
    }
  } catch (error) {
    log(`Posting schedule update failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  return totalSlots;
}

/**
 * Ranks variation configs by retention and engagement, then persists the
 * top-performing presets to optimizer_config under key "variation_presets".
 * The video-processor reads these presets when generating future videos.
 * Returns the number of presets stored.
 */
export async function updateVariationPresets(formatData: FormatPerformance[]): Promise<number> {
  const db = getServerClient();

  try {
    if (formatData.length === 0) return 0;

    const topFormats = formatData.slice(0, 10);

    const rankedPresets = topFormats.map((f, rank) => ({
      rank: rank + 1,
      caption_style: f.caption_style,
      color_grade: f.color_grade,
      text_position: f.text_position,
      retention: parseFloat((f.retention * 100).toFixed(2)),
      engagement: parseFloat((f.engagement * 100).toFixed(4)),
      // Composite score: 70% retention, 30% engagement for ranking
      score: parseFloat(((f.retention * 0.7 + f.engagement * 0.3) * 100).toFixed(2)),
    }));

    const configValue = {
      presets: rankedPresets,
      total_formats_analyzed: formatData.length,
      updated_at: new Date().toISOString(),
    };

    const { error } = await db
      .from('optimizer_config')
      .upsert(
        {
          config_key: 'variation_presets',
          config_value: configValue,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'config_key' },
      );

    if (error) {
      log(`Failed to persist variation presets: ${error.message}`);
      return 0;
    }

    log(`Persisted ${rankedPresets.length} ranked variation presets`);
    return rankedPresets.length;
  } catch (error) {
    log(`Variation preset update failed: ${error instanceof Error ? error.message : String(error)}`);
    return 0;
  }
}

/**
 * Ranks hooks by avg_watch_percentage and engagement_rate, then stores the
 * top performers in optimizer_config under key "hooks".
 * The script generator reads these to inform future hook generation.
 * Returns the number of hooks stored.
 */
export async function updateHookTemplates(hookData: HookPerformance[]): Promise<number> {
  const db = getServerClient();

  try {
    if (hookData.length === 0) return 0;

    // Sort by composite score: 60% retention, 40% engagement
    const ranked = [...hookData]
      .map((h) => ({
        ...h,
        score: h.avg_retention * 0.6 + h.avg_engagement * 0.4,
      }))
      .sort((a, b) => b.score - a.score);

    const topHooks = ranked.slice(0, 20).map((h, rank) => ({
      rank: rank + 1,
      hook: h.hook,
      avg_retention: parseFloat((h.avg_retention * 100).toFixed(2)),
      avg_engagement: parseFloat((h.avg_engagement * 100).toFixed(4)),
      score: parseFloat((h.score * 100).toFixed(2)),
    }));

    const configValue = {
      hooks: topHooks,
      total_hooks_analyzed: hookData.length,
      updated_at: new Date().toISOString(),
    };

    const { error } = await db
      .from('optimizer_config')
      .upsert(
        {
          config_key: 'hooks',
          config_value: configValue,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'config_key' },
      );

    if (error) {
      log(`Failed to persist hook templates: ${error.message}`);
      return 0;
    }

    log(`Persisted ${topHooks.length} ranked hook templates`);
    return topHooks.length;
  } catch (error) {
    log(`Hook template update failed: ${error instanceof Error ? error.message : String(error)}`);
    return 0;
  }
}

export function generateRecommendations(
  hookData: HookPerformance[],
  topicData: TopicPerformance[],
  timingData: TimingPerformance[],
  formatData: FormatPerformance[],
  revenueData: { content_pillar: string; attributed_revenue: number; total_clicks: number }[],
): Recommendation[] {
  const recommendations: Recommendation[] = [];

  if (hookData.length > 0) {
    const bestHook = hookData[0];
    recommendations.push({
      type: 'hook',
      action: `Double down on hook style: "${bestHook.hook.substring(0, 50)}..." — ${(bestHook.avg_retention * 100).toFixed(1)}% retention`,
      priority: 'high',
    });
  }

  if (topicData.length > 0) {
    const bestPillar = topicData[0];
    recommendations.push({
      type: 'topic',
      action: `Increase "${bestPillar.content_pillar}" content — driving ${bestPillar.total_follower_growth} follower growth`,
      priority: 'high',
    });

    if (topicData.length > 1) {
      const worstPillar = topicData[topicData.length - 1];
      if (worstPillar.total_follower_growth <= 0) {
        recommendations.push({
          type: 'topic',
          action: `Consider reducing "${worstPillar.content_pillar}" content — negative or zero growth`,
          priority: 'medium',
        });
      }
    }
  }

  if (timingData.length > 0) {
    const bestTime = timingData[0];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    recommendations.push({
      type: 'timing',
      action: `Best posting window: ${bestTime.platform} at ${bestTime.hour}:00 on ${days[bestTime.day_of_week]} (${bestTime.avg_views.toFixed(0)} avg views)`,
      priority: 'medium',
    });
  }

  if (formatData.length > 0) {
    const bestFormat = formatData[0];
    recommendations.push({
      type: 'format',
      action: `Best video format: ${bestFormat.caption_style} captions, ${bestFormat.color_grade} grade, ${bestFormat.text_position} text — ${(bestFormat.retention * 100).toFixed(1)}% retention`,
      priority: 'medium',
    });
  }

  if (revenueData.length > 0 && revenueData[0].attributed_revenue > 0) {
    recommendations.push({
      type: 'revenue',
      action: `"${revenueData[0].content_pillar}" drives most revenue (£${revenueData[0].attributed_revenue.toFixed(2)}) — prioritize monetization hooks here`,
      priority: 'high',
    });
  }

  return recommendations;
}

/**
 * Generates and persists a weekly report to the weekly_reports table.
 * Returns the full report object with `_id` set to the inserted row's id.
 */
export async function generateWeeklyReport(data: {
  hookData: HookPerformance[];
  topicData: TopicPerformance[];
  timingData: TimingPerformance[];
  formatData: FormatPerformance[];
  revenueData: { content_pillar: string; attributed_revenue: number; total_clicks: number }[];
  recommendations: Recommendation[];
}): Promise<Record<string, unknown>> {
  const db = getServerClient();
  try {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const periodStart = weekAgo.toISOString().split('T')[0];
    const periodEnd = now.toISOString().split('T')[0];

    const { data: weeklyAnalytics } = await db
      .from('daily_analytics')
      .select('*')
      .gte('date', periodStart)
      .lte('date', periodEnd);

    const totalViews = (weeklyAnalytics || []).reduce((sum: number, d: { total_views: number }) => sum + (d.total_views || 0), 0);
    const totalFollowerGrowth = (weeklyAnalytics || []).reduce((sum: number, d: { follower_growth: number }) => sum + (d.follower_growth || 0), 0);
    const postsPublished = (weeklyAnalytics || []).reduce((sum: number, d: { posts_published: number }) => sum + (d.posts_published || 0), 0);

    const { data: weeklyRevenue } = await db
      .from('revenue_events')
      .select('amount')
      .gte('created_at', weekAgo.toISOString());

    const totalRevenue = (weeklyRevenue || []).reduce((sum: number, r: { amount: string }) => sum + (parseFloat(r.amount) || 0), 0);

    const report = {
      period: {
        start: periodStart,
        end: periodEnd,
      },
      summary: {
        total_views: totalViews,
        total_follower_growth: totalFollowerGrowth,
        posts_published: postsPublished,
        total_revenue: totalRevenue,
      },
      top_hooks: data.hookData.slice(0, 5),
      top_pillars: data.topicData.slice(0, 5),
      best_times: data.timingData.slice(0, 10),
      best_formats: data.formatData.slice(0, 5),
      revenue_by_pillar: data.revenueData,
      recommendations: data.recommendations,
      generated_at: now.toISOString(),
    };

    // Persist the report to the weekly_reports table
    const { data: inserted, error } = await db
      .from('weekly_reports')
      .insert({
        period_start: periodStart,
        period_end: periodEnd,
        report_data: report,
      })
      .select('id')
      .single();

    if (error) {
      log(`Failed to persist weekly report: ${error.message}`);
    } else {
      log(`Weekly report persisted with id ${inserted.id}`);
    }

    log(`Weekly report: ${totalViews} views, ${totalFollowerGrowth} followers gained, ${postsPublished} posts, £${totalRevenue.toFixed(2)} revenue`);

    return {
      ...report,
      _id: inserted?.id || null,
    };
  } catch (error) {
    log(`Weekly report generation failed: ${error instanceof Error ? error.message : String(error)}`);
    return {};
  }
}

export async function calculateGrowthProjections(): Promise<void> {
  const db = getServerClient();
  const platforms = ['tiktok', 'instagram', 'youtube', 'linkedin', 'twitter'];

  try {
    for (const platform of platforms) {
      const { data: recentGrowth } = await db
        .from('growth_velocity')
        .select('daily_growth, follower_count')
        .eq('platform', platform)
        .order('date', { ascending: false })
        .limit(7);

      if (!recentGrowth || recentGrowth.length === 0) continue;

      const avgDailyGrowth = recentGrowth.reduce((sum: number, r: { daily_growth: number }) => sum + (r.daily_growth || 0), 0) / recentGrowth.length;
      const currentFollowers = recentGrowth[0].follower_count || 0;

      if (avgDailyGrowth <= 0) {
        log(`${platform}: No positive growth — cannot project`);
        continue;
      }

      const daysTo100k = Math.ceil((100000 - currentFollowers) / avgDailyGrowth);
      const projected100kDate = new Date();
      projected100kDate.setDate(projected100kDate.getDate() + daysTo100k);

      const growthRate = currentFollowers > 0 ? (avgDailyGrowth / currentFollowers) * 100 : 0;
      const projectedMonthlyRevenue = currentFollowers * 0.001 * 97;

      const today = new Date().toISOString().split('T')[0];

      const { error } = await db
        .from('growth_velocity')
        .upsert({
          platform,
          date: today,
          follower_count: currentFollowers,
          daily_growth: Math.round(avgDailyGrowth),
          growth_rate: growthRate,
          projected_100k_date: projected100kDate.toISOString().split('T')[0],
          projected_revenue_monthly: projectedMonthlyRevenue,
        }, { onConflict: 'platform,date' });

      if (error) {
        log(`Failed to update growth projection for ${platform}: ${error.message}`);
      } else {
        log(`${platform}: ${currentFollowers} followers, +${Math.round(avgDailyGrowth)}/day, 100K projected by ${projected100kDate.toISOString().split('T')[0]}`);
      }
    }
  } catch (error) {
    log(`Growth projections failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
