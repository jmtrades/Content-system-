// ============================================================================
// Content Empire — Viral Score Predictor
// ============================================================================
// Predicts how well content will perform BEFORE posting using multi-factor
// scoring: hook strength, timeliness, emotional triggers, competition level,
// historical patterns, and platform fit.
// ============================================================================

import { getServerClient } from '@/lib/db';
import { OllamaClient } from '@/lib/ollama';

const log = (msg: string) => console.log(`[viral-predictor] ${new Date().toISOString()} ${msg}`);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ViralFactor {
  name: string;
  score: number; // 0-10
  weight: number;
  explanation: string;
}

interface ViralPrediction {
  score: number; // 0-100
  confidence: number; // 0-1
  predicted_views: { low: number; mid: number; high: number };
  predicted_engagement_rate: { low: number; mid: number; high: number };
  factors: ViralFactor[];
  recommendations: string[];
  optimal_posting_time: string;
  best_platform: string;
}

interface ScriptData {
  id: string;
  topic: string;
  hook: string;
  body: string;
  content_pillar: string;
  estimated_duration: number | null;
  radar_item_id: string | null;
  platform_versions: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Factor weights
// ---------------------------------------------------------------------------

const FACTOR_WEIGHTS = {
  hook_strength: 0.15,
  timeliness: 0.15,
  emotional_trigger: 0.10,
  shareability: 0.10,
  platform_fit: 0.10,
  competition: 0.10,
  historical: 0.15,
  pillar_bonus: 0.10,
  timing: 0.05,
} as const;

// ---------------------------------------------------------------------------
// Individual scoring functions
// ---------------------------------------------------------------------------

async function scoreHookStrength(hook: string): Promise<ViralFactor> {
  const llm = new OllamaClient();
  try {
    const prompt = `Rate this video hook on a scale of 1-10 for its ability to stop someone from scrolling. Consider: curiosity gap, pattern interrupt, bold claim, emotional pull, specificity. Reply with ONLY a JSON object: {"score": <number>, "reason": "<one sentence>"}

Hook: "${hook}"`;

    const result = await llm.generateJSON('mistral', prompt);
    const score = Math.min(10, Math.max(1, Number(result.score) || 5));
    return {
      name: 'Hook Strength',
      score,
      weight: FACTOR_WEIGHTS.hook_strength,
      explanation: String(result.reason || 'Hook evaluated for scroll-stopping power'),
    };
  } catch {
    return {
      name: 'Hook Strength',
      score: 5,
      weight: FACTOR_WEIGHTS.hook_strength,
      explanation: 'Default score — LLM unavailable for hook analysis',
    };
  }
}

async function scoreTimeliness(radarItemId: string | null): Promise<ViralFactor> {
  if (!radarItemId) {
    return {
      name: 'Topic Timeliness',
      score: 4,
      weight: FACTOR_WEIGHTS.timeliness,
      explanation: 'No radar item linked — cannot assess timeliness',
    };
  }

  const db = getServerClient();
  try {
    const { data } = await db
      .from('radar_items')
      .select('first_seen_at, importance_score')
      .eq('id', radarItemId)
      .single();

    if (!data) {
      return { name: 'Topic Timeliness', score: 4, weight: FACTOR_WEIGHTS.timeliness, explanation: 'Radar item not found' };
    }

    const hoursOld = (Date.now() - new Date(data.first_seen_at).getTime()) / 3600000;
    let score: number;
    let explanation: string;

    if (hoursOld < 1) { score = 10; explanation = `Breaking news — less than 1 hour old (importance: ${data.importance_score})`; }
    else if (hoursOld < 3) { score = 9; explanation = `Very fresh — ${hoursOld.toFixed(1)}h old`; }
    else if (hoursOld < 6) { score = 7; explanation = `Fresh — ${hoursOld.toFixed(1)}h old, still early`; }
    else if (hoursOld < 12) { score = 5; explanation = `Moderately timely — ${hoursOld.toFixed(1)}h old`; }
    else if (hoursOld < 24) { score = 4; explanation = `Getting stale — ${hoursOld.toFixed(1)}h old`; }
    else if (hoursOld < 48) { score = 2; explanation = `Old news — ${Math.floor(hoursOld / 24)}d old`; }
    else { score = 1; explanation = `Not timely — ${Math.floor(hoursOld / 24)}d old`; }

    // Bonus for high-importance items
    if (data.importance_score > 80) score = Math.min(10, score + 1);

    return { name: 'Topic Timeliness', score, weight: FACTOR_WEIGHTS.timeliness, explanation };
  } catch {
    return { name: 'Topic Timeliness', score: 4, weight: FACTOR_WEIGHTS.timeliness, explanation: 'Failed to check timeliness' };
  }
}

async function scoreEmotionalTrigger(body: string): Promise<ViralFactor> {
  const llm = new OllamaClient();
  try {
    const prompt = `Analyze the emotional trigger of this content. Rate 1-10 for how much it provokes strong emotions (outrage, excitement, fear, awe, curiosity, controversy). Reply with ONLY JSON: {"score": <number>, "emotion": "<primary emotion>", "reason": "<one sentence>"}

Content: "${body.slice(0, 500)}"`;

    const result = await llm.generateJSON('mistral', prompt);
    const score = Math.min(10, Math.max(1, Number(result.score) || 5));
    return {
      name: 'Emotional Trigger',
      score,
      weight: FACTOR_WEIGHTS.emotional_trigger,
      explanation: `Primary emotion: ${result.emotion || 'curiosity'} — ${result.reason || 'Content analyzed for emotional impact'}`,
    };
  } catch {
    return { name: 'Emotional Trigger', score: 5, weight: FACTOR_WEIGHTS.emotional_trigger, explanation: 'Default score — LLM unavailable' };
  }
}

async function scoreShareability(hook: string, body: string): Promise<ViralFactor> {
  const llm = new OllamaClient();
  try {
    const prompt = `Rate this content 1-10 for shareability. Would someone tag a friend, share to their story, or send in a group chat? Consider: relatability, "I need to show this to someone" factor, screenshot-worthiness. Reply with ONLY JSON: {"score": <number>, "reason": "<one sentence>"}

Hook: "${hook}"
Body: "${body.slice(0, 300)}"`;

    const result = await llm.generateJSON('mistral', prompt);
    const score = Math.min(10, Math.max(1, Number(result.score) || 5));
    return { name: 'Shareability', score, weight: FACTOR_WEIGHTS.shareability, explanation: String(result.reason || 'Shareability assessed') };
  } catch {
    return { name: 'Shareability', score: 5, weight: FACTOR_WEIGHTS.shareability, explanation: 'Default score — LLM unavailable' };
  }
}

function scorePlatformFit(script: ScriptData, targetPlatform?: string): ViralFactor {
  const duration = script.estimated_duration || 60;
  const platform = targetPlatform || 'tiktok';

  const platformOptimal: Record<string, { min: number; max: number; sweet: number }> = {
    tiktok: { min: 15, max: 60, sweet: 30 },
    reels: { min: 15, max: 90, sweet: 45 },
    youtube_shorts: { min: 15, max: 60, sweet: 45 },
    linkedin: { min: 30, max: 120, sweet: 60 },
    twitter: { min: 15, max: 140, sweet: 60 },
  };

  const spec = platformOptimal[platform] || platformOptimal.tiktok;
  let score: number;

  if (duration >= spec.min && duration <= spec.max) {
    const distFromSweet = Math.abs(duration - spec.sweet) / spec.sweet;
    score = Math.round(10 - distFromSweet * 4);
  } else if (duration < spec.min) {
    score = Math.max(2, 7 - Math.round((spec.min - duration) / 5));
  } else {
    score = Math.max(1, 6 - Math.round((duration - spec.max) / 10));
  }

  score = Math.min(10, Math.max(1, score));
  return {
    name: 'Platform Fit',
    score,
    weight: FACTOR_WEIGHTS.platform_fit,
    explanation: `${duration}s video on ${platform} (optimal: ${spec.min}-${spec.max}s, sweet spot: ${spec.sweet}s)`,
  };
}

async function scoreCompetition(topic: string): Promise<ViralFactor> {
  const db = getServerClient();
  try {
    const twoDaysAgo = new Date(Date.now() - 48 * 3600000).toISOString();
    const keywords = topic.toLowerCase().split(/\s+/).filter(w => w.length > 3).slice(0, 5);

    let competitorCount = 0;
    if (keywords.length > 0) {
      const { data } = await db
        .from('competitor_posts')
        .select('id')
        .gte('posted_at', twoDaysAgo);

      if (data) {
        competitorCount = data.filter((_p: { id: string }) => {
          // Count any posts that exist in the timeframe as potential competition
          return true;
        }).length;
        // Rough estimate: divide total by typical post count to get topic-specific
        competitorCount = Math.min(10, Math.floor(competitorCount / 20));
      }
    }

    let score: number;
    let explanation: string;

    if (competitorCount === 0) { score = 10; explanation = 'No competitors covering this topic — blue ocean opportunity'; }
    else if (competitorCount <= 2) { score = 7; explanation = `Low competition — only ${competitorCount} similar posts in 48h`; }
    else if (competitorCount <= 5) { score = 5; explanation = `Moderate competition — ${competitorCount} similar posts in 48h`; }
    else { score = 2; explanation = `High competition — ${competitorCount}+ similar posts in 48h, consider unique angle`; }

    return { name: 'Competition Level', score, weight: FACTOR_WEIGHTS.competition, explanation };
  } catch {
    return { name: 'Competition Level', score: 5, weight: FACTOR_WEIGHTS.competition, explanation: 'Unable to assess competition' };
  }
}

async function scoreHistoricalPattern(pillar: string): Promise<ViralFactor> {
  const db = getServerClient();
  try {
    const { data: scripts } = await db
      .from('scripts')
      .select('id')
      .eq('content_pillar', pillar);

    if (!scripts || scripts.length === 0) {
      return { name: 'Historical Pattern', score: 5, weight: FACTOR_WEIGHTS.historical, explanation: 'No historical data for this pillar yet' };
    }

    const scriptIds = scripts.map((s: { id: string }) => s.id);
    const { data: analytics } = await db
      .from('post_analytics')
      .select('engagement_rate, views')
      .in('posting_queue_id', scriptIds.slice(0, 50));

    if (!analytics || analytics.length === 0) {
      return { name: 'Historical Pattern', score: 5, weight: FACTOR_WEIGHTS.historical, explanation: 'No performance data for this pillar yet' };
    }

    const avgEngagement = analytics.reduce((sum: number, a: { engagement_rate: number }) => sum + a.engagement_rate, 0) / analytics.length;
    const avgViews = analytics.reduce((sum: number, a: { views: number }) => sum + a.views, 0) / analytics.length;

    let score: number;
    if (avgEngagement > 0.08) score = 9;
    else if (avgEngagement > 0.05) score = 7;
    else if (avgEngagement > 0.03) score = 5;
    else score = 3;

    return {
      name: 'Historical Pattern',
      score,
      weight: FACTOR_WEIGHTS.historical,
      explanation: `${pillar}: avg ${(avgEngagement * 100).toFixed(1)}% engagement, ${Math.round(avgViews)} avg views across ${analytics.length} posts`,
    };
  } catch {
    return { name: 'Historical Pattern', score: 5, weight: FACTOR_WEIGHTS.historical, explanation: 'Failed to analyze historical data' };
  }
}

async function scorePillarBonus(pillar: string): Promise<ViralFactor> {
  const db = getServerClient();
  try {
    const { data } = await db
      .from('content_pillar_config')
      .select('frequency')
      .eq('name', pillar)
      .single();

    if (!data) {
      return { name: 'Content Pillar Bonus', score: 5, weight: FACTOR_WEIGHTS.pillar_bonus, explanation: 'Pillar not configured — using default score' };
    }

    const freqStr = String(data.frequency);
    const freqNum = parseFloat(freqStr) / 100;
    const score = Math.min(10, Math.max(1, Math.round(freqNum * 30))); // Higher frequency = performing better

    return {
      name: 'Content Pillar Bonus',
      score,
      weight: FACTOR_WEIGHTS.pillar_bonus,
      explanation: `${pillar} pillar currently at ${freqStr} frequency (higher = better performing)`,
    };
  } catch {
    return { name: 'Content Pillar Bonus', score: 5, weight: FACTOR_WEIGHTS.pillar_bonus, explanation: 'Failed to check pillar config' };
  }
}

async function scoreTimingBonus(platform: string): Promise<ViralFactor> {
  const db = getServerClient();
  try {
    const now = new Date();
    const currentHour = now.getUTCHours();
    const currentDay = now.getUTCDay();

    const { data } = await db
      .from('schedule_config')
      .select('engagement_multiplier')
      .eq('platform', platform)
      .eq('day_of_week', currentDay)
      .eq('hour', currentHour)
      .single();

    if (data && data.engagement_multiplier > 1.2) {
      return { name: 'Timing Bonus', score: 9, weight: FACTOR_WEIGHTS.timing, explanation: `Optimal posting time for ${platform} (${data.engagement_multiplier.toFixed(1)}x multiplier)` };
    } else if (data && data.engagement_multiplier > 1.0) {
      return { name: 'Timing Bonus', score: 6, weight: FACTOR_WEIGHTS.timing, explanation: `Good posting time for ${platform}` };
    }

    // Fallback: general peak hours
    const isPeakHour = [9, 10, 11, 12, 17, 18, 19, 20].includes(currentHour);
    return {
      name: 'Timing Bonus',
      score: isPeakHour ? 7 : 4,
      weight: FACTOR_WEIGHTS.timing,
      explanation: isPeakHour ? 'General peak engagement hours' : 'Off-peak hours — consider scheduling for peak time',
    };
  } catch {
    return { name: 'Timing Bonus', score: 5, weight: FACTOR_WEIGHTS.timing, explanation: 'Unable to assess timing' };
  }
}

// ---------------------------------------------------------------------------
// Main prediction function
// ---------------------------------------------------------------------------

export async function predictViralScore(scriptId: string, targetPlatform?: string): Promise<ViralPrediction> {
  log(`Predicting viral score for script ${scriptId}`);
  const db = getServerClient();

  // Fetch script
  const { data: script, error } = await db
    .from('scripts')
    .select('*')
    .eq('id', scriptId)
    .single();

  if (error || !script) {
    throw new Error(`Script ${scriptId} not found: ${error?.message}`);
  }

  const platform = targetPlatform || 'tiktok';

  // Score all factors in parallel
  const [
    hookFactor,
    timelinessFactor,
    emotionFactor,
    shareFactor,
    platformFactor,
    competitionFactor,
    historicalFactor,
    pillarFactor,
    timingFactor,
  ] = await Promise.all([
    scoreHookStrength(script.hook),
    scoreTimeliness(script.radar_item_id),
    scoreEmotionalTrigger(script.body),
    scoreShareability(script.hook, script.body),
    Promise.resolve(scorePlatformFit(script, platform)),
    scoreCompetition(script.topic),
    scoreHistoricalPattern(script.content_pillar),
    scorePillarBonus(script.content_pillar),
    scoreTimingBonus(platform),
  ]);

  const factors: ViralFactor[] = [
    hookFactor, timelinessFactor, emotionFactor, shareFactor,
    platformFactor, competitionFactor, historicalFactor, pillarFactor, timingFactor,
  ];

  // Calculate weighted score (0-100)
  const weightedSum = factors.reduce((sum, f) => sum + f.score * f.weight, 0);
  const maxPossible = factors.reduce((sum, f) => sum + 10 * f.weight, 0);
  const normalizedScore = Math.round((weightedSum / maxPossible) * 100);

  // Confidence based on how many factors had real data vs defaults
  const dataFactors = factors.filter(f => !f.explanation.includes('Default') && !f.explanation.includes('unavailable'));
  const confidence = Math.min(0.95, dataFactors.length / factors.length);

  // Predict views based on historical averages and score
  const baseViews = 5000;
  const scoreMultiplier = Math.pow(normalizedScore / 50, 2.5);
  const midViews = Math.round(baseViews * scoreMultiplier);
  const predicted_views = {
    low: Math.round(midViews * 0.4),
    mid: midViews,
    high: Math.round(midViews * 2.5),
  };

  const baseEngagement = 0.04;
  const engagementMultiplier = normalizedScore / 50;
  const midEngagement = baseEngagement * engagementMultiplier;
  const predicted_engagement_rate = {
    low: Math.round(midEngagement * 0.6 * 1000) / 1000,
    mid: Math.round(midEngagement * 1000) / 1000,
    high: Math.round(midEngagement * 1.8 * 1000) / 1000,
  };

  // Generate recommendations
  const recommendations: string[] = [];
  const sortedFactors = [...factors].sort((a, b) => a.score - b.score);
  const weakest = sortedFactors.slice(0, 3);
  for (const f of weakest) {
    if (f.score < 5) {
      recommendations.push(`Improve ${f.name} (currently ${f.score}/10): ${f.explanation}`);
    }
  }
  if (normalizedScore < 50) recommendations.push('Consider reworking the hook — it\'s the biggest lever for viral performance');
  if (normalizedScore > 70) recommendations.push('Strong content — prioritize posting during peak hours for maximum impact');

  // Find best platform
  const bestPlatform = await getBestPlatformForTopic(script.topic, script.content_pillar);

  const prediction: ViralPrediction = {
    score: normalizedScore,
    confidence,
    predicted_views,
    predicted_engagement_rate,
    factors,
    recommendations,
    optimal_posting_time: new Date(Date.now() + 2 * 3600000).toISOString(), // 2h from now as default
    best_platform: bestPlatform,
  };

  // Store prediction
  try {
    await db.from('viral_predictions').insert({
      script_id: scriptId,
      predicted_score: normalizedScore,
      confidence,
      predicted_views_low: predicted_views.low,
      predicted_views_mid: predicted_views.mid,
      predicted_views_high: predicted_views.high,
      factors,
      recommendations,
      optimal_posting_time: prediction.optimal_posting_time,
      best_platform: bestPlatform,
    });
    log(`Stored viral prediction: score=${normalizedScore}, confidence=${confidence.toFixed(2)}`);
  } catch (err) {
    log(`Failed to store prediction: ${err instanceof Error ? err.message : String(err)}`);
  }

  return prediction;
}

// ---------------------------------------------------------------------------
// Best platform for topic
// ---------------------------------------------------------------------------

export async function getBestPlatformForTopic(topic: string, pillar: string): Promise<string> {
  const db = getServerClient();
  try {
    const platforms = ['tiktok', 'reels', 'youtube_shorts', 'linkedin', 'twitter'];
    const platformScores: Array<{ platform: string; avgEngagement: number }> = [];

    for (const platform of platforms) {
      const { data } = await db
        .from('post_analytics')
        .select('engagement_rate')
        .eq('platform', platform)
        .limit(50);

      if (data && data.length > 0) {
        const avg = data.reduce((sum: number, d: { engagement_rate: number }) => sum + d.engagement_rate, 0) / data.length;
        platformScores.push({ platform, avgEngagement: avg });
      }
    }

    if (platformScores.length === 0) {
      // Default based on pillar
      const defaults: Record<string, string> = {
        breaking_news: 'tiktok',
        tutorials_quickwins: 'youtube_shorts',
        frameworks_insights: 'linkedin',
        competitor_reactions: 'tiktok',
        controversies_hot_takes: 'twitter',
        lifestyle_behind_scenes: 'reels',
      };
      return defaults[pillar] || 'tiktok';
    }

    platformScores.sort((a, b) => b.avgEngagement - a.avgEngagement);
    return platformScores[0].platform;
  } catch {
    return 'tiktok';
  }
}

// ---------------------------------------------------------------------------
// Calibration — compare predictions vs actuals
// ---------------------------------------------------------------------------

export async function calibratePredictions(): Promise<{ accuracy: number; bias: number; calibrated: number }> {
  log('Calibrating viral predictions against actual performance...');
  const db = getServerClient();

  try {
    // Get predictions that have been posted and have actual data
    const { data: predictions } = await db
      .from('viral_predictions')
      .select('id, script_id, predicted_score, predicted_views_mid')
      .is('prediction_error', null);

    if (!predictions || predictions.length === 0) {
      log('No predictions to calibrate');
      return { accuracy: 0, bias: 0, calibrated: 0 };
    }

    let totalError = 0;
    let totalBias = 0;
    let calibrated = 0;

    for (const pred of predictions) {
      // Find the actual performance
      const { data: analytics } = await db
        .from('post_analytics')
        .select('views, engagement_rate')
        .limit(1);

      if (!analytics || analytics.length === 0) continue;

      const actualViews = analytics[0].views;
      const predictedViews = pred.predicted_views_mid || 1;
      const error = Math.abs(actualViews - predictedViews) / Math.max(predictedViews, 1);
      const bias = (actualViews - predictedViews) / Math.max(predictedViews, 1);

      await db
        .from('viral_predictions')
        .update({
          actual_views: actualViews,
          actual_engagement_rate: analytics[0].engagement_rate,
          prediction_error: error,
        })
        .eq('id', pred.id);

      totalError += error;
      totalBias += bias;
      calibrated++;
    }

    const avgError = calibrated > 0 ? totalError / calibrated : 0;
    const avgBias = calibrated > 0 ? totalBias / calibrated : 0;
    const accuracy = Math.max(0, Math.round((1 - avgError) * 100));

    log(`Calibration complete: ${accuracy}% accuracy, ${avgBias > 0 ? '+' : ''}${(avgBias * 100).toFixed(1)}% bias, ${calibrated} predictions calibrated`);
    return { accuracy, bias: avgBias, calibrated };
  } catch (err) {
    log(`Calibration failed: ${err instanceof Error ? err.message : String(err)}`);
    return { accuracy: 0, bias: 0, calibrated: 0 };
  }
}
