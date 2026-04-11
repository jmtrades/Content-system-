// ============================================================================
// Trend Predictor Engine - Emerging trend detection & prediction
// ============================================================================

import { getDb } from '@/lib/db';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

interface RadarItem {
  id: string;
  source: string;
  source_url: string;
  title: string;
  summary: string;
  category: string;
  importance_score: number;
  trending_velocity: number;
  first_seen_at: string;
  created_at: string;
}

interface TrendPrediction {
  id: string;
  topic: string;
  velocity: number;
  cross_platform_score: number;
  influencer_adoption: number;
  confidence: number;
  predicted_peak: string | null;
  recommended_action: string;
  actual_peak: string | null;
  prediction_accuracy: number | null;
  actioned: boolean;
  created_at: string;
}

interface TrendVelocity {
  topic: string;
  mentions_per_hour: number;
  growth_slope: number;
  total_mentions: number;
}

interface TrendResult {
  topic: string;
  velocity: number;
  cross_platform_score: number;
  influencer_adoption: number;
  confidence: number;
  predicted_peak: string | null;
  recommended_action: string;
}

interface TrendSummaryItem {
  topic: string;
  confidence: number;
  velocity: number;
  recommended_action: string;
  cross_platform_score: number;
  influencer_adoption: number;
  predicted_peak: string | null;
  created_at: string;
}

interface PredictionEvaluation {
  id: string;
  topic: string;
  predicted_peak: string | null;
  actual_peak: string | null;
  confidence: number;
  accuracy: number;
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(message: string): void {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [trend-predictor] ${message}`);
}

function logError(message: string, err: unknown): void {
  const ts = new Date().toISOString();
  const detail = err instanceof Error ? err.message : String(err);
  console.error(`[${ts}] [trend-predictor] ERROR: ${message} -- ${detail}`);
}

// ---------------------------------------------------------------------------
// calculateTrendVelocity
// ---------------------------------------------------------------------------

export async function calculateTrendVelocity(topic: string): Promise<TrendVelocity> {
  const db = getDb();
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  // Fetch all radar items matching this topic in the last 48 hours
  const { data: items, error } = await db
    .from('radar_items')
    .select('id, created_at, importance_score, trending_velocity')
    .eq('category', topic)
    .gte('created_at', fortyEightHoursAgo)
    .order('created_at', { ascending: true });

  if (error) {
    logError(`Failed to fetch radar items for topic "${topic}"`, error);
    return { topic, mentions_per_hour: 0, growth_slope: 0, total_mentions: 0 };
  }

  const records = (items ?? []) as Array<{
    id: string;
    created_at: string;
    importance_score: number;
    trending_velocity: number;
  }>;

  if (records.length === 0) {
    return { topic, mentions_per_hour: 0, growth_slope: 0, total_mentions: 0 };
  }

  const totalMentions = records.length;
  const hoursSpan = 48;
  const mentionsPerHour = totalMentions / hoursSpan;

  // Calculate growth slope: compare first half vs second half mention rate
  const midpoint = new Date(Date.now() - 24 * 60 * 60 * 1000).getTime();
  let firstHalfCount = 0;
  let secondHalfCount = 0;

  for (const item of records) {
    const itemTime = new Date(item.created_at).getTime();
    if (itemTime < midpoint) {
      firstHalfCount++;
    } else {
      secondHalfCount++;
    }
  }

  // Slope: positive means accelerating, negative means decelerating
  const growthSlope = firstHalfCount > 0
    ? (secondHalfCount - firstHalfCount) / firstHalfCount
    : secondHalfCount > 0 ? 1.0 : 0;

  return {
    topic,
    mentions_per_hour: Math.round(mentionsPerHour * 100) / 100,
    growth_slope: Math.round(growthSlope * 100) / 100,
    total_mentions: totalMentions,
  };
}

// ---------------------------------------------------------------------------
// checkCrossPlatformPresence
// ---------------------------------------------------------------------------

export async function checkCrossPlatformPresence(topic: string): Promise<number> {
  const db = getDb();
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Count distinct sources mentioning this topic in the last 24 hours
  const { data: items, error } = await db
    .from('radar_items')
    .select('source')
    .eq('category', topic)
    .gte('created_at', twentyFourHoursAgo);

  if (error) {
    logError(`Failed to check cross-platform presence for "${topic}"`, error);
    return 0;
  }

  const records = (items ?? []) as Array<{ source: string }>;
  const distinctSources = new Set(records.map((r) => r.source));
  return distinctSources.size;
}

// ---------------------------------------------------------------------------
// checkInfluencerAdoption
// ---------------------------------------------------------------------------

export async function checkInfluencerAdoption(topic: string): Promise<number> {
  const db = getDb();
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  // Check competitor_posts for mentions of this topic
  const { data: posts, error } = await db
    .from('competitor_posts')
    .select('id, competitor_handle')
    .ilike('topic_category', `%${topic}%`)
    .gte('posted_at', fortyEightHoursAgo);

  if (error) {
    logError(`Failed to check influencer adoption for "${topic}"`, error);
    return 0;
  }

  const records = (posts ?? []) as Array<{ id: string; competitor_handle: string }>;

  // Count distinct competitors covering this topic
  const distinctCompetitors = new Set(records.map((r) => r.competitor_handle));
  return distinctCompetitors.size;
}

// ---------------------------------------------------------------------------
// predictPeak
// ---------------------------------------------------------------------------

export function predictPeak(velocity: number, currentMentions: number): string | null {
  // If velocity is very low or negative, no peak prediction
  if (velocity <= 0.05 || currentMentions < 3) {
    return null;
  }

  // Estimate days until peak based on growth curve
  // Fast-growing trends peak sooner; slow ones take longer
  // Using a simple logistic model approximation
  let daysUntilPeak: number;

  if (velocity > 2.0) {
    // Viral speed: peaks in 1-2 days
    daysUntilPeak = 1;
  } else if (velocity > 1.0) {
    // Fast growth: peaks in 2-4 days
    daysUntilPeak = 3;
  } else if (velocity > 0.5) {
    // Moderate growth: peaks in 4-7 days
    daysUntilPeak = 5;
  } else if (velocity > 0.2) {
    // Slow growth: peaks in 7-14 days
    daysUntilPeak = 10;
  } else {
    // Very slow: peaks in 14-30 days
    daysUntilPeak = 21;
  }

  // Adjust based on current mention volume (higher volume = closer to peak)
  if (currentMentions > 50) {
    daysUntilPeak = Math.max(1, Math.floor(daysUntilPeak * 0.5));
  } else if (currentMentions > 20) {
    daysUntilPeak = Math.max(1, Math.floor(daysUntilPeak * 0.75));
  }

  const peakDate = new Date(Date.now() + daysUntilPeak * 24 * 60 * 60 * 1000);
  return peakDate.toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// combineSignals
// ---------------------------------------------------------------------------

export function combineSignals(
  velocity: number,
  crossPlatform: number,
  influencerAdoption: number,
): number {
  // Weighted combination of signals into 0-100 confidence score
  // Velocity: 40% weight (most important for timing)
  // Cross-platform: 35% weight (validates trend is real)
  // Influencer adoption: 25% weight (social proof)

  // Normalize each signal to 0-100 range
  const velocityScore = Math.min(100, velocity * 50); // velocity of 2.0+ = 100
  const crossPlatformScore = Math.min(100, crossPlatform * 15); // 7+ sources = 100
  const influencerScore = Math.min(100, influencerAdoption * 20); // 5+ influencers = 100

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
): 'create_content_immediately' | 'queue_for_next_batch' | 'monitor' | 'ignore' {
  if (confidence >= 75 && velocity > 1.0) {
    return 'create_content_immediately';
  }
  if (confidence >= 50 || (confidence >= 40 && velocity > 0.5)) {
    return 'queue_for_next_batch';
  }
  if (confidence >= 25) {
    return 'monitor';
  }
  return 'ignore';
}

// ---------------------------------------------------------------------------
// detectEmergingTrends
// ---------------------------------------------------------------------------

export async function detectEmergingTrends(): Promise<TrendResult[]> {
  log('Starting emerging trend detection...');
  const db = getDb();
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  // Step 1: Fetch recent radar items grouped by category
  const { data: recentItems, error } = await db
    .from('radar_items')
    .select('id, title, category, source, importance_score, trending_velocity, created_at')
    .gte('created_at', fortyEightHoursAgo)
    .order('created_at', { ascending: false });

  if (error) {
    logError('Failed to fetch recent radar items', error);
    return [];
  }

  const items = (recentItems ?? []) as RadarItem[];

  if (items.length === 0) {
    log('No recent radar items for trend analysis');
    return [];
  }

  log(`Analyzing ${items.length} radar items from the last 48 hours`);

  // Step 2: Group items by category to find potential trends
  const categoryMap: Record<string, RadarItem[]> = {};
  for (const item of items) {
    const cat = item.category ?? 'unknown';
    if (!categoryMap[cat]) {
      categoryMap[cat] = [];
    }
    categoryMap[cat].push(item);
  }

  // Step 3: Filter to categories with meaningful mention volume (3+ mentions)
  const candidateTopics = Object.entries(categoryMap)
    .filter(([, topicItems]) => topicItems.length >= 3)
    .map(([topic]) => topic);

  log(`Found ${candidateTopics.length} candidate topics with 3+ mentions`);

  if (candidateTopics.length === 0) {
    log('No topics meet the minimum mention threshold');
    return [];
  }

  // Step 4: Analyze each candidate topic
  const trends: TrendResult[] = [];

  for (const topic of candidateTopics) {
    try {
      // Calculate all three signals
      const velocityData = await calculateTrendVelocity(topic);
      const crossPlatform = await checkCrossPlatformPresence(topic);
      const influencer = await checkInfluencerAdoption(topic);

      // Combine into confidence score
      const confidence = combineSignals(
        velocityData.mentions_per_hour,
        crossPlatform,
        influencer,
      );

      // Determine recommended action
      const action = getRecommendedAction(confidence, velocityData.mentions_per_hour);

      // Map internal action names to DB-compatible action names
      const dbActionMap: Record<string, string> = {
        create_content_immediately: 'create_immediately',
        queue_for_next_batch: 'prepare_script',
        monitor: 'monitor',
        ignore: 'ignore',
      };

      // Predict the peak date
      const peakDate = predictPeak(velocityData.mentions_per_hour, velocityData.total_mentions);

      const trend: TrendResult = {
        topic,
        velocity: velocityData.mentions_per_hour,
        cross_platform_score: crossPlatform,
        influencer_adoption: influencer,
        confidence,
        predicted_peak: peakDate,
        recommended_action: dbActionMap[action] ?? action,
      };

      trends.push(trend);

      log(`  Topic: "${topic}" | Confidence: ${confidence} | Velocity: ${velocityData.mentions_per_hour}/hr | Action: ${action}`);
    } catch (err) {
      logError(`Failed to analyze topic "${topic}"`, err);
    }
  }

  // Step 5: Store predictions in the database
  if (trends.length > 0) {
    const insertRows = trends.map((t) => ({
      topic: t.topic,
      velocity: t.velocity,
      cross_platform_score: t.cross_platform_score,
      influencer_adoption: t.influencer_adoption,
      confidence: t.confidence / 100, // Store as 0-1 range
      predicted_peak: t.predicted_peak,
      recommended_action: t.recommended_action,
      actioned: false,
    }));

    const { error: insertError } = await db
      .from('trend_predictions')
      .insert(insertRows);

    if (insertError) {
      logError('Failed to store trend predictions', insertError);
    } else {
      log(`Stored ${insertRows.length} trend predictions`);
    }
  }

  // Sort by confidence descending
  trends.sort((a, b) => b.confidence - a.confidence);

  log(`Trend detection complete: ${trends.length} trends identified`);
  return trends;
}

// ---------------------------------------------------------------------------
// evaluatePastPredictions
// ---------------------------------------------------------------------------

export async function evaluatePastPredictions(): Promise<PredictionEvaluation[]> {
  log('Evaluating past trend predictions...');
  const db = getDb();

  // Fetch predictions older than 7 days that haven't been evaluated yet
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: predictions, error } = await db
    .from('trend_predictions')
    .select('*')
    .is('prediction_accuracy', null)
    .lt('created_at', sevenDaysAgo)
    .order('created_at', { ascending: true })
    .limit(50);

  if (error) {
    logError('Failed to fetch past predictions', error);
    return [];
  }

  const records = (predictions ?? []) as TrendPrediction[];

  if (records.length === 0) {
    log('No past predictions to evaluate');
    return [];
  }

  log(`Evaluating ${records.length} past predictions`);
  const evaluations: PredictionEvaluation[] = [];

  for (const prediction of records) {
    try {
      // Check how the topic actually performed after the prediction
      const predictionDate = new Date(prediction.created_at);
      const windowEnd = new Date(predictionDate.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();

      const { data: postPredictionItems, error: fetchError } = await db
        .from('radar_items')
        .select('id, created_at, importance_score')
        .eq('category', prediction.topic)
        .gte('created_at', prediction.created_at)
        .lte('created_at', windowEnd);

      if (fetchError) {
        logError(`Failed to fetch post-prediction data for "${prediction.topic}"`, fetchError);
        continue;
      }

      const itemsAfter = (postPredictionItems ?? []) as Array<{
        id: string;
        created_at: string;
        importance_score: number;
      }>;

      // Determine actual peak date based on highest mention density
      let actualPeak: string | null = null;
      if (itemsAfter.length > 0) {
        // Group by date and find the date with most mentions
        const dateGroups: Record<string, number> = {};
        for (const item of itemsAfter) {
          const date = item.created_at.split('T')[0];
          dateGroups[date] = (dateGroups[date] ?? 0) + 1;
        }

        let maxCount = 0;
        for (const [date, count] of Object.entries(dateGroups)) {
          if (count > maxCount) {
            maxCount = count;
            actualPeak = date;
          }
        }
      }

      // Calculate accuracy based on:
      // 1. Whether the topic actually trended (had mentions after prediction)
      // 2. How close the predicted peak was to actual peak
      let accuracy = 0;

      if (itemsAfter.length === 0 && prediction.recommended_action === 'ignore') {
        // Correctly predicted no trend
        accuracy = 100;
      } else if (itemsAfter.length === 0 && prediction.recommended_action !== 'ignore') {
        // False positive: predicted trend that didn't happen
        accuracy = 10;
      } else if (itemsAfter.length > 0 && prediction.recommended_action === 'ignore') {
        // False negative: missed a real trend
        accuracy = 15;
      } else if (actualPeak && prediction.predicted_peak) {
        // Both peaks exist - compare how close they are
        const predictedPeakTime = new Date(prediction.predicted_peak).getTime();
        const actualPeakTime = new Date(actualPeak).getTime();
        const daysDiff = Math.abs(predictedPeakTime - actualPeakTime) / (24 * 60 * 60 * 1000);

        if (daysDiff <= 1) accuracy = 95;
        else if (daysDiff <= 3) accuracy = 80;
        else if (daysDiff <= 7) accuracy = 60;
        else if (daysDiff <= 14) accuracy = 40;
        else accuracy = 20;

        // Bonus points for correct action recommendation
        if (
          (itemsAfter.length >= 10 && prediction.recommended_action === 'create_immediately') ||
          (itemsAfter.length >= 5 && prediction.recommended_action === 'prepare_script')
        ) {
          accuracy = Math.min(100, accuracy + 10);
        }
      } else {
        // Partial match: topic continued but no clear peak
        accuracy = 50;
      }

      // Update the prediction record
      const { error: updateError } = await db
        .from('trend_predictions')
        .update({
          actual_peak: actualPeak,
          prediction_accuracy: accuracy / 100,
        })
        .eq('id', prediction.id);

      if (updateError) {
        logError(`Failed to update prediction accuracy for "${prediction.topic}"`, updateError);
      }

      evaluations.push({
        id: prediction.id,
        topic: prediction.topic,
        predicted_peak: prediction.predicted_peak,
        actual_peak: actualPeak,
        confidence: prediction.confidence,
        accuracy,
      });

      log(`  "${prediction.topic}": accuracy=${accuracy}% | predicted_peak=${prediction.predicted_peak ?? 'none'} | actual_peak=${actualPeak ?? 'none'}`);
    } catch (err) {
      logError(`Failed to evaluate prediction for "${prediction.topic}"`, err);
    }
  }

  // Log aggregate accuracy
  if (evaluations.length > 0) {
    const avgAccuracy =
      evaluations.reduce((sum, e) => sum + e.accuracy, 0) / evaluations.length;
    log(`Evaluation complete: ${evaluations.length} predictions, avg accuracy ${avgAccuracy.toFixed(1)}%`);
  }

  return evaluations;
}

// ---------------------------------------------------------------------------
// getTrendingSummary
// ---------------------------------------------------------------------------

export async function getTrendingSummary(): Promise<TrendSummaryItem[]> {
  log('Fetching trending summary...');
  const db = getDb();

  // Get the most recent trend predictions, limited to the last 48 hours
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const { data: trends, error } = await db
    .from('trend_predictions')
    .select('topic, confidence, velocity, recommended_action, cross_platform_score, influencer_adoption, predicted_peak, created_at')
    .gte('created_at', fortyEightHoursAgo)
    .order('confidence', { ascending: false })
    .limit(10);

  if (error) {
    logError('Failed to fetch trending summary', error);
    return [];
  }

  const records = (trends ?? []) as TrendSummaryItem[];

  if (records.length === 0) {
    log('No active trends in the last 48 hours');
    return [];
  }

  log(`Top ${records.length} active trends:`);
  for (let i = 0; i < records.length; i++) {
    const t = records[i];
    log(`  ${i + 1}. "${t.topic}" | confidence: ${(t.confidence * 100).toFixed(0)}% | velocity: ${t.velocity}/hr | action: ${t.recommended_action}`);
  }

  return records;
}
