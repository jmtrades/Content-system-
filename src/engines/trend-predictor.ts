// ============================================================================
// Trend Predictor Engine - Emerging Trend Detection & Prediction
// ============================================================================
// Analyzes radar_items for mention velocity, cross-platform presence, and
// influencer adoption to detect emerging trends early. Combines signals into
// confidence scores, predicts peak timing, and recommends actions.
// ============================================================================

import { getDb } from '@/lib/db';

// ---------------------------------------------------------------------------
// Inline Types
// ---------------------------------------------------------------------------

interface RadarItemRow {
  id: string;
  source: string;
  title: string;
  summary: string;
  category: string;
  importance_score: number;
  trending_velocity: number;
  first_seen_at: string;
  created_at: string;
  processed: boolean;
}

interface TrendPrediction {
  topic: string;
  velocity: number;
  cross_platform_score: number;
  influencer_adoption: number;
  confidence: number;
  predicted_peak: string;
  recommended_action: string;
  actioned: boolean;
}

interface TrendPredictionRow extends TrendPrediction {
  id: string;
  actual_peak: string | null;
  prediction_accuracy: number | null;
  created_at: string;
}

type RecommendedAction =
  | 'create_content_immediately'
  | 'queue_for_next_batch'
  | 'monitor'
  | 'ignore';

interface TrendSummaryItem {
  topic: string;
  velocity: number;
  confidence: number;
  cross_platform_score: number;
  influencer_adoption: number;
  recommended_action: string;
  predicted_peak: string;
  created_at: string;
}

interface VelocityResult {
  mentionsPerHour: number;
  growthSlope: number;
  totalMentions: number;
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(fn: string, message: string): void {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [trend-predictor:${fn}] ${message}`);
}

function logError(fn: string, message: string, err: unknown): void {
  const ts = new Date().toISOString();
  const detail = err instanceof Error ? err.message : String(err);
  console.error(`[${ts}] [trend-predictor:${fn}] ERROR: ${message} -- ${detail}`);
}

// ---------------------------------------------------------------------------
// calculateTrendVelocity
// ---------------------------------------------------------------------------

export async function calculateTrendVelocity(topic: string): Promise<VelocityResult> {
  const db = getDb();

  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  try {
    // Count mentions in the last 48 hours
    const { data: allMentions, error: allErr } = await db
      .from('radar_items')
      .select('id, created_at')
      .ilike('title', `%${topic}%`)
      .gte('created_at', fortyEightHoursAgo);

    if (allErr) {
      logError('calculateTrendVelocity', `Failed to query mentions for "${topic}"`, allErr);
      return { mentionsPerHour: 0, growthSlope: 0, totalMentions: 0 };
    }

    const total = allMentions?.length ?? 0;
    if (total === 0) {
      return { mentionsPerHour: 0, growthSlope: 0, totalMentions: 0 };
    }

    const mentionsPerHour = total / 48;

    // Count mentions in the first 24h vs the second 24h to calculate slope
    const { data: recentMentions, error: recentErr } = await db
      .from('radar_items')
      .select('id')
      .ilike('title', `%${topic}%`)
      .gte('created_at', twentyFourHoursAgo);

    if (recentErr) {
      logError('calculateTrendVelocity', `Failed to query recent mentions for "${topic}"`, recentErr);
      return { mentionsPerHour, growthSlope: 0, totalMentions: total };
    }

    const recentCount = recentMentions?.length ?? 0;
    const olderCount = total - recentCount;

    // Slope: positive means accelerating, negative means decelerating
    const growthSlope = olderCount > 0 ? (recentCount - olderCount) / olderCount : recentCount > 0 ? 1 : 0;

    return { mentionsPerHour, growthSlope, totalMentions: total };
  } catch (err) {
    logError('calculateTrendVelocity', `Unexpected error for "${topic}"`, err);
    return { mentionsPerHour: 0, growthSlope: 0, totalMentions: 0 };
  }
}

// ---------------------------------------------------------------------------
// checkCrossPlatformPresence
// ---------------------------------------------------------------------------

export async function checkCrossPlatformPresence(topic: string): Promise<number> {
  const db = getDb();

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data: mentions, error } = await db
      .from('radar_items')
      .select('source')
      .ilike('title', `%${topic}%`)
      .gte('created_at', twentyFourHoursAgo);

    if (error) {
      logError('checkCrossPlatformPresence', `Failed to check cross-platform presence for "${topic}"`, error);
      return 0;
    }

    if (!mentions || mentions.length === 0) {
      return 0;
    }

    // Count distinct sources
    const distinctSources = new Set(mentions.map((m: { source: string }) => m.source));
    return distinctSources.size;
  } catch (err) {
    logError('checkCrossPlatformPresence', `Unexpected error for "${topic}"`, err);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// checkInfluencerAdoption
// ---------------------------------------------------------------------------

export async function checkInfluencerAdoption(topic: string): Promise<number> {
  const db = getDb();

  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  try {
    const { data: posts, error } = await db
      .from('competitor_posts')
      .select('id, competitor_handle')
      .ilike('caption', `%${topic}%`)
      .gte('posted_at', fortyEightHoursAgo);

    if (error) {
      logError('checkInfluencerAdoption', `Failed to check influencer adoption for "${topic}"`, error);
      return 0;
    }

    if (!posts || posts.length === 0) {
      return 0;
    }

    // Count distinct competitors covering this topic
    const distinctCompetitors = new Set(posts.map((p: { competitor_handle: string }) => p.competitor_handle));
    return distinctCompetitors.size;
  } catch (err) {
    logError('checkInfluencerAdoption', `Unexpected error for "${topic}"`, err);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// predictPeak
// ---------------------------------------------------------------------------

export function predictPeak(velocity: number, currentMentions: number): string {
  // Estimate when the trend will peak based on growth curve analysis.
  // A simple heuristic: faster velocity = sooner peak, more mentions = closer to peak.

  let daysUntilPeak: number;

  if (velocity <= 0) {
    // Already declining or stagnant -- peak is now or in the past
    daysUntilPeak = 0;
  } else if (velocity > 0.5 && currentMentions > 20) {
    // High velocity with many mentions: peak very soon
    daysUntilPeak = 1;
  } else if (velocity > 0.3) {
    // Moderate-high velocity: peak in 2-3 days
    daysUntilPeak = 2;
  } else if (velocity > 0.1) {
    // Moderate velocity: peak in 4-7 days
    daysUntilPeak = 5;
  } else {
    // Low velocity: slow burn, peak in 7-14 days
    daysUntilPeak = 10;
  }

  const peakDate = new Date(Date.now() + daysUntilPeak * 24 * 60 * 60 * 1000);
  return peakDate.toISOString();
}

// ---------------------------------------------------------------------------
// combineSignals
// ---------------------------------------------------------------------------

export function combineSignals(
  velocity: number,
  crossPlatform: number,
  influencerAdoption: number,
): number {
  // Weighted combination of signals into a 0-100 confidence score.
  // Weights: velocity = 40%, cross-platform = 35%, influencer adoption = 25%

  // Normalize velocity (growth slope) to 0-100 scale
  const velocityScore = Math.min(100, Math.max(0, (velocity + 1) * 50));

  // Normalize cross-platform presence (assume 1-10 sources meaningful)
  const crossPlatformScore = Math.min(100, crossPlatform * 15);

  // Normalize influencer adoption (assume 1-5 competitors is significant)
  const influencerScore = Math.min(100, influencerAdoption * 25);

  const combined =
    velocityScore * 0.40 +
    crossPlatformScore * 0.35 +
    influencerScore * 0.25;

  return Math.round(Math.min(100, Math.max(0, combined)));
}

// ---------------------------------------------------------------------------
// getRecommendedAction
// ---------------------------------------------------------------------------

export function getRecommendedAction(
  confidence: number,
  velocity: number,
): RecommendedAction {
  if (confidence >= 80 && velocity > 0.3) {
    return 'create_content_immediately';
  }
  if (confidence >= 60 || (confidence >= 50 && velocity > 0.2)) {
    return 'queue_for_next_batch';
  }
  if (confidence >= 30) {
    return 'monitor';
  }
  return 'ignore';
}

// ---------------------------------------------------------------------------
// detectEmergingTrends
// ---------------------------------------------------------------------------

export async function detectEmergingTrends(): Promise<TrendPrediction[]> {
  log('detectEmergingTrends', 'Starting emerging trend detection cycle');

  const db = getDb();
  const predictions: TrendPrediction[] = [];

  try {
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    // Step 1: Get all recent radar items and group by category
    const { data: recentItems, error: fetchErr } = await db
      .from('radar_items')
      .select('title, category, importance_score, trending_velocity, source, created_at')
      .gte('created_at', fortyEightHoursAgo)
      .order('created_at', { ascending: false });

    if (fetchErr) {
      logError('detectEmergingTrends', 'Failed to fetch recent radar items', fetchErr);
      return [];
    }

    if (!recentItems || recentItems.length === 0) {
      log('detectEmergingTrends', 'No recent items for trend analysis');
      return [];
    }

    log('detectEmergingTrends', `Analyzing ${recentItems.length} items from last 48h`);

    // Step 2: Group by category to identify trending topics
    const categoryMap: Record<string, {
      count: number;
      sources: Set<string>;
      totalImportance: number;
      totalVelocity: number;
      titles: string[];
    }> = {};

    for (const item of recentItems as RadarItemRow[]) {
      const cat = item.category ?? 'unknown';
      if (!categoryMap[cat]) {
        categoryMap[cat] = {
          count: 0,
          sources: new Set(),
          totalImportance: 0,
          totalVelocity: 0,
          titles: [],
        };
      }
      categoryMap[cat].count++;
      categoryMap[cat].sources.add(item.source);
      categoryMap[cat].totalImportance += item.importance_score ?? 0;
      categoryMap[cat].totalVelocity += item.trending_velocity ?? 0;
      if (categoryMap[cat].titles.length < 5) {
        categoryMap[cat].titles.push(item.title);
      }
    }

    // Step 3: For each category with sufficient mentions, calculate signals
    for (const [topic, data] of Object.entries(categoryMap)) {
      if (data.count < 2) continue; // Skip topics with too few mentions

      const crossPlatform = data.sources.size;

      // Check influencer/competitor adoption for this topic
      const influencerAdoption = await checkInfluencerAdoption(topic);

      // Calculate velocity from the trending_velocity average
      const avgVelocity = data.totalVelocity / data.count;
      const mentionGrowthRate = data.count / 48; // mentions per hour

      // Combine growth rate with reported velocity for a composite velocity signal
      const compositeVelocity = (mentionGrowthRate * 10 + avgVelocity) / 2;
      const normalizedVelocity = Math.min(1, compositeVelocity / 50);

      // Combine all signals
      const confidence = combineSignals(normalizedVelocity, crossPlatform, influencerAdoption);
      const recommendedAction = getRecommendedAction(confidence, normalizedVelocity);
      const predictedPeak = predictPeak(normalizedVelocity, data.count);

      const prediction: TrendPrediction = {
        topic,
        velocity: Math.round(compositeVelocity * 100) / 100,
        cross_platform_score: crossPlatform * 10,
        influencer_adoption: influencerAdoption,
        confidence,
        predicted_peak: predictedPeak,
        recommended_action: recommendedAction,
        actioned: false,
      };

      predictions.push(prediction);
    }

    // Step 4: Sort by confidence descending
    predictions.sort((a, b) => b.confidence - a.confidence);

    // Step 5: Store predictions in trend_predictions table
    if (predictions.length > 0) {
      const rows = predictions.map((p) => ({
        topic: p.topic,
        velocity: p.velocity,
        cross_platform_score: p.cross_platform_score,
        influencer_adoption: p.influencer_adoption,
        confidence: p.confidence,
        predicted_peak: p.predicted_peak,
        recommended_action: p.recommended_action,
        actioned: false,
      }));

      const { error: insertErr } = await db
        .from('trend_predictions')
        .insert(rows);

      if (insertErr) {
        logError('detectEmergingTrends', 'Failed to store trend predictions', insertErr);
      } else {
        log('detectEmergingTrends', `Stored ${predictions.length} trend predictions`);
      }
    }

    log('detectEmergingTrends', `Detection complete: ${predictions.length} trends found`);
    for (const p of predictions.slice(0, 5)) {
      log('detectEmergingTrends', `  [${p.confidence}%] ${p.topic} -> ${p.recommended_action}`);
    }
  } catch (err) {
    logError('detectEmergingTrends', 'Unexpected error in trend detection', err);
  }

  return predictions;
}

// ---------------------------------------------------------------------------
// evaluatePastPredictions
// ---------------------------------------------------------------------------

export async function evaluatePastPredictions(): Promise<{ evaluated: number; avgAccuracy: number }> {
  log('evaluatePastPredictions', 'Evaluating past trend predictions for accuracy');

  const db = getDb();
  let evaluatedCount = 0;
  let totalAccuracy = 0;

  try {
    // Fetch predictions that have passed their predicted peak and haven't been scored yet
    const { data: pastPredictions, error: fetchErr } = await db
      .from('trend_predictions')
      .select('*')
      .is('prediction_accuracy', null)
      .lt('predicted_peak', new Date().toISOString())
      .order('created_at', { ascending: true })
      .limit(50);

    if (fetchErr) {
      logError('evaluatePastPredictions', 'Failed to fetch past predictions', fetchErr);
      return { evaluated: 0, avgAccuracy: 0 };
    }

    if (!pastPredictions || pastPredictions.length === 0) {
      log('evaluatePastPredictions', 'No past predictions to evaluate');
      return { evaluated: 0, avgAccuracy: 0 };
    }

    for (const prediction of pastPredictions as TrendPredictionRow[]) {
      try {
        // Check how the topic actually performed after prediction
        const predictionDate = new Date(prediction.created_at);
        const peakDate = new Date(prediction.predicted_peak);
        const windowStart = predictionDate.toISOString();
        const windowEnd = new Date(peakDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

        const { data: actualMentions, error: mentionErr } = await db
          .from('radar_items')
          .select('id, created_at, importance_score')
          .ilike('category', `%${prediction.topic}%`)
          .gte('created_at', windowStart)
          .lte('created_at', windowEnd);

        if (mentionErr) {
          logError('evaluatePastPredictions', `Failed to check actual data for "${prediction.topic}"`, mentionErr);
          continue;
        }

        const actualCount = actualMentions?.length ?? 0;

        // Score accuracy based on whether the predicted confidence matched reality
        // High confidence + many actual mentions = accurate
        // High confidence + few actual mentions = inaccurate
        let accuracy: number;

        if (prediction.confidence >= 70) {
          // We predicted this would be big
          accuracy = actualCount >= 5 ? Math.min(100, 60 + actualCount * 4) : Math.max(0, 40 - (5 - actualCount) * 10);
        } else if (prediction.confidence >= 40) {
          // We predicted moderate interest
          accuracy = actualCount >= 2 && actualCount <= 10 ? 70 + Math.min(30, actualCount * 3) : 40;
        } else {
          // We predicted low interest
          accuracy = actualCount <= 3 ? 80 : Math.max(20, 60 - actualCount * 5);
        }

        accuracy = Math.min(100, Math.max(0, Math.round(accuracy)));

        const { error: updateErr } = await db
          .from('trend_predictions')
          .update({
            prediction_accuracy: accuracy,
            actual_peak: actualCount > 0 ? windowEnd : null,
          })
          .eq('id', prediction.id);

        if (updateErr) {
          logError('evaluatePastPredictions', `Failed to update accuracy for prediction ${prediction.id}`, updateErr);
        } else {
          evaluatedCount++;
          totalAccuracy += accuracy;
        }
      } catch (err) {
        logError('evaluatePastPredictions', `Error evaluating prediction ${prediction.id}`, err);
      }
    }

    const avgAccuracy = evaluatedCount > 0 ? Math.round(totalAccuracy / evaluatedCount) : 0;
    log('evaluatePastPredictions', `Evaluated ${evaluatedCount} predictions, avg accuracy: ${avgAccuracy}%`);

    return { evaluated: evaluatedCount, avgAccuracy };
  } catch (err) {
    logError('evaluatePastPredictions', 'Unexpected error', err);
    return { evaluated: 0, avgAccuracy: 0 };
  }
}

// ---------------------------------------------------------------------------
// getTrendingSummary
// ---------------------------------------------------------------------------

export async function getTrendingSummary(): Promise<TrendSummaryItem[]> {
  log('getTrendingSummary', 'Fetching top 10 active trends');

  const db = getDb();

  try {
    const { data: trends, error } = await db
      .from('trend_predictions')
      .select('topic, velocity, confidence, cross_platform_score, influencer_adoption, recommended_action, predicted_peak, created_at')
      .gte('predicted_peak', new Date().toISOString())
      .eq('actioned', false)
      .order('confidence', { ascending: false })
      .limit(10);

    if (error) {
      logError('getTrendingSummary', 'Failed to fetch trending summary', error);
      return [];
    }

    const summary = (trends ?? []) as TrendSummaryItem[];

    log('getTrendingSummary', `Returning ${summary.length} active trends`);
    for (const t of summary) {
      log('getTrendingSummary', `  [${t.confidence}%] ${t.topic} -> ${t.recommended_action} (peak: ${t.predicted_peak.split('T')[0]})`);
    }

    return summary;
  } catch (err) {
    logError('getTrendingSummary', 'Unexpected error', err);
    return [];
  }
}
