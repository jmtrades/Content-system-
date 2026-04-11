// ============================================================================
// A/B Testing Engine — Create, manage, and analyze content experiments
// ============================================================================
//
// Required tables (run this migration in Supabase SQL editor):
//
// -- Table: ab_experiments
// CREATE TABLE ab_experiments (
//   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//   name TEXT NOT NULL,
//   type TEXT NOT NULL CHECK (type IN ('hook','thumbnail','caption','posting_time','format')),
//   status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','paused','concluded')),
//   min_sample_size INTEGER NOT NULL DEFAULT 100,
//   confidence_threshold REAL NOT NULL DEFAULT 0.95,
//   winner_variant_id TEXT,
//   concluded_at TIMESTAMPTZ,
//   created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
//   updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
// );
//
// -- Table: ab_variants
// CREATE TABLE ab_variants (
//   id TEXT NOT NULL,
//   experiment_id UUID NOT NULL REFERENCES ab_experiments(id) ON DELETE CASCADE,
//   label TEXT NOT NULL,
//   config JSONB NOT NULL DEFAULT '{}',
//   traffic_pct REAL NOT NULL DEFAULT 50,
//   PRIMARY KEY (experiment_id, id)
// );
//
// -- Table: ab_results
// CREATE TABLE ab_results (
//   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//   experiment_id UUID NOT NULL REFERENCES ab_experiments(id) ON DELETE CASCADE,
//   variant_id TEXT NOT NULL,
//   post_id TEXT NOT NULL,
//   views INTEGER NOT NULL DEFAULT 0,
//   engagement_rate REAL NOT NULL DEFAULT 0,
//   watch_time REAL NOT NULL DEFAULT 0,
//   conversion_rate REAL NOT NULL DEFAULT 0,
//   recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
//   UNIQUE(experiment_id, variant_id, post_id)
// );
//
// CREATE INDEX idx_ab_results_experiment ON ab_results(experiment_id);
// CREATE INDEX idx_ab_experiments_status ON ab_experiments(status);
// ============================================================================

import { getDb } from '@/lib/db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExperimentConfig {
  name: string;
  type: 'hook' | 'thumbnail' | 'caption' | 'posting_time' | 'format';
  variants: Array<{ id: string; label: string; config: Record<string, unknown> }>;
  traffic_split: number[];
  min_sample_size: number;
  confidence_threshold: number;
}

interface Experiment {
  id: string;
  name: string;
  type: string;
  status: string;
  min_sample_size: number;
  confidence_threshold: number;
  winner_variant_id: string | null;
  concluded_at: string | null;
  created_at: string;
  updated_at: string;
  variants: Variant[];
}

interface Variant {
  id: string;
  experiment_id: string;
  label: string;
  config: Record<string, unknown>;
  traffic_pct: number;
}

interface ResultRow {
  id: string;
  experiment_id: string;
  variant_id: string;
  post_id: string;
  views: number;
  engagement_rate: number;
  watch_time: number;
  conversion_rate: number;
  recorded_at: string;
}

interface ResultMetrics {
  views: number;
  engagement_rate: number;
  watch_time: number;
  conversion_rate: number;
}

interface VariantStats {
  id: string;
  label: string;
  sample_size: number;
  total_views: number;
  mean_engagement: number;
  mean_watch_time: number;
  conversion_rate: number;
  confidence_interval: [number, number];
}

interface SignificanceResult {
  significant: boolean;
  winner: string | null;
  confidence: number;
  p_value: number;
  variants: Array<{
    id: string;
    sample_size: number;
    mean_engagement: number;
    conversion_rate: number;
    confidence_interval: [number, number];
  }>;
}

interface ExperimentResult {
  experiment: Experiment;
  variants: VariantStats[];
  significance: SignificanceResult;
  total_posts: number;
  total_views: number;
  duration_days: number;
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(message: string): void {
  console.log(`[ab-testing] ${new Date().toISOString()} ${message}`);
}

function logError(message: string, err: unknown): void {
  const detail = err instanceof Error ? err.message : String(err);
  console.error(`[ab-testing] ${new Date().toISOString()} ERROR: ${message} -- ${detail}`);
}

// ---------------------------------------------------------------------------
// Statistical helpers
// ---------------------------------------------------------------------------

/**
 * Approximation of the standard normal cumulative distribution function.
 * Uses the Abramowitz & Stegun approximation (formula 7.1.26).
 */
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * absX);
  const y =
    1.0 -
    (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX));

  return 0.5 * (1.0 + sign * y);
}

/**
 * Two-proportion Z-test.
 * Tests whether two proportions (p1, p2) are significantly different.
 */
function zTest(
  n1: number,
  p1: number,
  n2: number,
  p2: number,
): { z: number; pValue: number } {
  if (n1 === 0 || n2 === 0) {
    return { z: 0, pValue: 1 };
  }

  const pooledP = (p1 * n1 + p2 * n2) / (n1 + n2);

  // Guard: if pooled proportion is 0 or 1, SE is zero — no test possible
  if (pooledP <= 0 || pooledP >= 1) {
    return { z: 0, pValue: 1 };
  }

  const se = Math.sqrt(pooledP * (1 - pooledP) * (1 / n1 + 1 / n2));

  if (se === 0) {
    return { z: 0, pValue: 1 };
  }

  const z = (p1 - p2) / se;
  const pValue = 2 * (1 - normalCDF(Math.abs(z)));

  return { z, pValue };
}

/**
 * Two-sample Welch's t-test for continuous metrics (e.g. watch_time).
 * Used when comparing means rather than proportions.
 */
function welchTTest(
  n1: number,
  mean1: number,
  var1: number,
  n2: number,
  mean2: number,
  var2: number,
): { t: number; pValue: number } {
  if (n1 < 2 || n2 < 2) {
    return { t: 0, pValue: 1 };
  }

  const se = Math.sqrt(var1 / n1 + var2 / n2);
  if (se === 0) {
    return { t: 0, pValue: 1 };
  }

  const t = (mean1 - mean2) / se;

  // Approximate p-value using normal distribution (valid for large n)
  const pValue = 2 * (1 - normalCDF(Math.abs(t)));

  return { t, pValue };
}

/**
 * Compute the z-value for a given confidence level (e.g. 0.95 -> 1.96).
 */
function zCritical(confidence: number): number {
  // Newton-Raphson approximation for inverse normal CDF
  // Using the rational approximation for common values
  const alpha = 1 - confidence;
  const p = 1 - alpha / 2;

  // Rational approximation of probit function
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.383577518672690e2, -3.066479806614716e1, 2.506628277459239e0,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];

  const q = p - 0.5;

  if (Math.abs(q) <= 0.425) {
    const r = 0.180625 - q * q;
    return (
      (q *
        (((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) *
          r +
          1) *
          r +
          1)) /
      (((((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1) * r + 1) *
        r +
        1)
    );
  }

  // For common confidence levels, return precomputed values
  if (confidence >= 0.99) return 2.576;
  if (confidence >= 0.95) return 1.96;
  if (confidence >= 0.90) return 1.645;
  return 1.28; // ~80% confidence
}

/**
 * Compute the Wilson score confidence interval for a proportion.
 * More accurate than the Wald interval for small sample sizes.
 */
function wilsonInterval(
  n: number,
  p: number,
  confidence: number,
): [number, number] {
  if (n === 0) return [0, 0];

  const z = zCritical(confidence);
  const z2 = z * z;
  const denominator = 1 + z2 / n;

  const center = (p + z2 / (2 * n)) / denominator;
  const margin =
    (z / denominator) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));

  return [
    Math.max(0, Math.round((center - margin) * 10000) / 10000),
    Math.min(1, Math.round((center + margin) * 10000) / 10000),
  ];
}

// ---------------------------------------------------------------------------
// createExperiment
// ---------------------------------------------------------------------------

/**
 * Creates a new A/B experiment with the given configuration.
 * Returns the experiment ID.
 */
export async function createExperiment(config: ExperimentConfig): Promise<string> {
  const db = getDb();

  // Validate traffic split sums to 100
  const splitSum = config.traffic_split.reduce((a, b) => a + b, 0);
  if (splitSum < 99 || splitSum > 101) {
    throw new Error(
      `Traffic split must sum to ~100, got ${splitSum} (${config.traffic_split.join(', ')})`,
    );
  }

  if (config.variants.length !== config.traffic_split.length) {
    throw new Error(
      `Number of variants (${config.variants.length}) must match traffic split entries (${config.traffic_split.length})`,
    );
  }

  if (config.variants.length < 2) {
    throw new Error('A/B test requires at least 2 variants');
  }

  // Validate variant IDs are unique
  const variantIds = new Set(config.variants.map((v) => v.id));
  if (variantIds.size !== config.variants.length) {
    throw new Error('Variant IDs must be unique within an experiment');
  }

  log(`Creating experiment: "${config.name}" (type=${config.type}, variants=${config.variants.length})`);

  // Insert the experiment
  const { data: experiment, error: expError } = await db
    .from('ab_experiments')
    .insert({
      name: config.name,
      type: config.type,
      status: 'active',
      min_sample_size: config.min_sample_size,
      confidence_threshold: config.confidence_threshold,
    })
    .select('id')
    .single();

  if (expError || !experiment) {
    logError('Failed to create experiment', expError);
    throw new Error(`Failed to create experiment: ${expError?.message ?? 'unknown'}`);
  }

  const experimentId = (experiment as { id: string }).id;

  // Insert variants
  const variantRows = config.variants.map((v, i) => ({
    id: v.id,
    experiment_id: experimentId,
    label: v.label,
    config: v.config,
    traffic_pct: config.traffic_split[i],
  }));

  const { error: varError } = await db.from('ab_variants').insert(variantRows);

  if (varError) {
    logError('Failed to create variants', varError);
    // Clean up the experiment row on failure
    await db.from('ab_experiments').delete().eq('id', experimentId);
    throw new Error(`Failed to create variants: ${varError.message}`);
  }

  log(`Experiment "${config.name}" created with ID ${experimentId}`);
  return experimentId;
}

// ---------------------------------------------------------------------------
// assignVariant
// ---------------------------------------------------------------------------

/**
 * Assigns a variant to a post based on the experiment's traffic split.
 * Uses deterministic hashing so the same post always gets the same variant.
 */
export async function assignVariant(
  experimentId: string,
  postId: string,
): Promise<string> {
  const db = getDb();

  // Check if this post already has an assignment
  const { data: existing } = await db
    .from('ab_results')
    .select('variant_id')
    .eq('experiment_id', experimentId)
    .eq('post_id', postId)
    .limit(1);

  const existingRows = (existing ?? []) as Array<{ variant_id: string }>;
  if (existingRows.length > 0) {
    return existingRows[0].variant_id;
  }

  // Fetch variants with traffic percentages
  const { data: variants, error } = await db
    .from('ab_variants')
    .select('id, label, traffic_pct')
    .eq('experiment_id', experimentId)
    .order('id', { ascending: true });

  if (error || !variants || variants.length === 0) {
    logError(`No variants found for experiment ${experimentId}`, error);
    throw new Error(`No variants found for experiment ${experimentId}`);
  }

  const variantList = variants as Variant[];

  // Deterministic hash-based assignment using a simple string hash
  const hash = deterministicHash(`${experimentId}:${postId}`);
  const bucket = hash % 100; // 0-99

  let cumulative = 0;
  let assignedVariantId = variantList[variantList.length - 1].id; // fallback to last

  for (const variant of variantList) {
    cumulative += variant.traffic_pct;
    if (bucket < cumulative) {
      assignedVariantId = variant.id;
      break;
    }
  }

  log(`Assigned variant "${assignedVariantId}" to post ${postId} in experiment ${experimentId} (bucket=${bucket})`);
  return assignedVariantId;
}

/**
 * Simple deterministic hash for consistent variant assignment.
 * Returns a positive integer.
 */
function deterministicHash(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) & 0x7fffffff;
  }
  return hash;
}

// ---------------------------------------------------------------------------
// recordResult
// ---------------------------------------------------------------------------

/**
 * Records performance metrics for a specific variant assignment.
 * Uses upsert so metrics can be updated as they accumulate.
 */
export async function recordResult(
  experimentId: string,
  variantId: string,
  postId: string,
  metrics: ResultMetrics,
): Promise<void> {
  const db = getDb();

  const { error } = await db.from('ab_results').upsert(
    {
      experiment_id: experimentId,
      variant_id: variantId,
      post_id: postId,
      views: metrics.views,
      engagement_rate: metrics.engagement_rate,
      watch_time: metrics.watch_time,
      conversion_rate: metrics.conversion_rate,
      recorded_at: new Date().toISOString(),
    },
    { onConflict: 'experiment_id,variant_id,post_id' },
  );

  if (error) {
    logError(`Failed to record result for experiment ${experimentId}, variant ${variantId}`, error);
    throw new Error(`Failed to record result: ${error.message}`);
  }

  log(`Recorded result for experiment ${experimentId}, variant ${variantId}, post ${postId}: views=${metrics.views}, engagement=${metrics.engagement_rate}`);
}

// ---------------------------------------------------------------------------
// checkSignificance
// ---------------------------------------------------------------------------

/**
 * Evaluates whether the experiment has reached statistical significance.
 * Uses the Z-test for proportions (engagement_rate, conversion_rate) and
 * Welch's t-test for continuous metrics (watch_time).
 */
export async function checkSignificance(
  experimentId: string,
): Promise<SignificanceResult> {
  const db = getDb();

  // Fetch experiment config
  const { data: experiment, error: expError } = await db
    .from('ab_experiments')
    .select('*')
    .eq('id', experimentId)
    .single();

  if (expError || !experiment) {
    logError(`Experiment ${experimentId} not found`, expError);
    throw new Error(`Experiment not found: ${experimentId}`);
  }

  const exp = experiment as Experiment;

  // Fetch all results grouped by variant
  const { data: results, error: resError } = await db
    .from('ab_results')
    .select('*')
    .eq('experiment_id', experimentId);

  if (resError) {
    logError(`Failed to fetch results for experiment ${experimentId}`, resError);
    throw new Error(`Failed to fetch results: ${resError.message}`);
  }

  const rows = (results ?? []) as ResultRow[];

  // Group results by variant
  const variantGroups: Record<string, ResultRow[]> = {};
  for (const row of rows) {
    if (!variantGroups[row.variant_id]) {
      variantGroups[row.variant_id] = [];
    }
    variantGroups[row.variant_id].push(row);
  }

  // Fetch variant metadata
  const { data: variantMeta } = await db
    .from('ab_variants')
    .select('id, label')
    .eq('experiment_id', experimentId);

  const variantLabels: Record<string, string> = {};
  for (const v of (variantMeta ?? []) as Array<{ id: string; label: string }>) {
    variantLabels[v.id] = v.label;
  }

  // Compute stats for each variant
  const variantStats: Array<{
    id: string;
    sample_size: number;
    mean_engagement: number;
    variance_engagement: number;
    conversion_rate: number;
    mean_watch_time: number;
    variance_watch_time: number;
    total_views: number;
    confidence_interval: [number, number];
  }> = [];

  for (const [variantId, variantRows] of Object.entries(variantGroups)) {
    const n = variantRows.length;
    const totalViews = variantRows.reduce((s, r) => s + r.views, 0);
    const meanEngagement =
      variantRows.reduce((s, r) => s + r.engagement_rate, 0) / n;
    const meanConversion =
      variantRows.reduce((s, r) => s + r.conversion_rate, 0) / n;
    const meanWatchTime =
      variantRows.reduce((s, r) => s + r.watch_time, 0) / n;

    // Variance calculations
    const varEngagement =
      variantRows.reduce(
        (s, r) => s + Math.pow(r.engagement_rate - meanEngagement, 2),
        0,
      ) /
      Math.max(1, n - 1);

    const varWatchTime =
      variantRows.reduce(
        (s, r) => s + Math.pow(r.watch_time - meanWatchTime, 2),
        0,
      ) /
      Math.max(1, n - 1);

    const ci = wilsonInterval(n, meanEngagement, exp.confidence_threshold);

    variantStats.push({
      id: variantId,
      sample_size: n,
      mean_engagement: Math.round(meanEngagement * 10000) / 10000,
      variance_engagement: varEngagement,
      conversion_rate: Math.round(meanConversion * 10000) / 10000,
      mean_watch_time: Math.round(meanWatchTime * 100) / 100,
      variance_watch_time: varWatchTime,
      total_views: totalViews,
      confidence_interval: ci,
    });
  }

  // Check if minimum sample size is met
  const allMeetMinSample = variantStats.every(
    (v) => v.sample_size >= exp.min_sample_size,
  );

  if (!allMeetMinSample || variantStats.length < 2) {
    log(
      `Experiment ${experimentId}: insufficient data (min_sample=${exp.min_sample_size}, ` +
        `variants=${variantStats.map((v) => `${v.id}:${v.sample_size}`).join(', ')})`,
    );

    return {
      significant: false,
      winner: null,
      confidence: 0,
      p_value: 1,
      variants: variantStats.map((v) => ({
        id: v.id,
        sample_size: v.sample_size,
        mean_engagement: v.mean_engagement,
        conversion_rate: v.conversion_rate,
        confidence_interval: v.confidence_interval,
      })),
    };
  }

  // Pairwise comparisons: find the best-performing variant
  // Sort by mean engagement descending
  variantStats.sort((a, b) => b.mean_engagement - a.mean_engagement);
  const best = variantStats[0];

  // Compare best against all others to confirm significance
  let worstPValue = 0;

  for (let i = 1; i < variantStats.length; i++) {
    const challenger = variantStats[i];

    // Z-test on engagement rate
    const engagementTest = zTest(
      best.sample_size,
      best.mean_engagement,
      challenger.sample_size,
      challenger.mean_engagement,
    );

    // Z-test on conversion rate
    const conversionTest = zTest(
      best.sample_size,
      best.conversion_rate,
      challenger.sample_size,
      challenger.conversion_rate,
    );

    // Welch's t-test on watch time
    const watchTimeTest = welchTTest(
      best.sample_size,
      best.mean_watch_time,
      best.variance_watch_time,
      challenger.sample_size,
      challenger.mean_watch_time,
      challenger.variance_watch_time,
    );

    // Use the worst (highest) p-value among all pairwise comparisons
    // This is conservative: all comparisons must be significant
    const combinedP = Math.max(
      engagementTest.pValue,
      Math.min(conversionTest.pValue, watchTimeTest.pValue),
    );

    if (combinedP > worstPValue) {
      worstPValue = combinedP;
    }
  }

  const isSignificant = worstPValue < (1 - exp.confidence_threshold);
  const confidence = Math.round((1 - worstPValue) * 10000) / 10000;

  log(
    `Experiment ${experimentId}: significant=${isSignificant}, ` +
      `p_value=${worstPValue.toFixed(6)}, confidence=${confidence}, ` +
      `winner=${isSignificant ? best.id : 'none'}`,
  );

  return {
    significant: isSignificant,
    winner: isSignificant ? best.id : null,
    confidence,
    p_value: Math.round(worstPValue * 100000) / 100000,
    variants: variantStats.map((v) => ({
      id: v.id,
      sample_size: v.sample_size,
      mean_engagement: v.mean_engagement,
      conversion_rate: v.conversion_rate,
      confidence_interval: v.confidence_interval,
    })),
  };
}

// ---------------------------------------------------------------------------
// getActiveExperiments
// ---------------------------------------------------------------------------

/**
 * Returns all currently active experiments with their variants.
 */
export async function getActiveExperiments(): Promise<Experiment[]> {
  const db = getDb();

  const { data: experiments, error } = await db
    .from('ab_experiments')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) {
    logError('Failed to fetch active experiments', error);
    return [];
  }

  const exps = (experiments ?? []) as Experiment[];

  // Fetch variants for each experiment
  for (const exp of exps) {
    const { data: variants } = await db
      .from('ab_variants')
      .select('*')
      .eq('experiment_id', exp.id);

    exp.variants = (variants ?? []) as Variant[];
  }

  log(`Found ${exps.length} active experiments`);
  return exps;
}

// ---------------------------------------------------------------------------
// concludeExperiment
// ---------------------------------------------------------------------------

/**
 * Concludes an experiment, optionally declaring the winner based on
 * current significance results.
 */
export async function concludeExperiment(experimentId: string): Promise<void> {
  const db = getDb();

  // Run final significance check
  const significance = await checkSignificance(experimentId);

  const updateData: Record<string, unknown> = {
    status: 'concluded',
    concluded_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (significance.significant && significance.winner) {
    updateData.winner_variant_id = significance.winner;
    log(
      `Concluding experiment ${experimentId} with winner: ${significance.winner} ` +
        `(confidence=${significance.confidence}, p=${significance.p_value})`,
    );
  } else {
    log(
      `Concluding experiment ${experimentId} without a winner ` +
        `(insufficient significance: p=${significance.p_value})`,
    );
  }

  const { error } = await db
    .from('ab_experiments')
    .update(updateData)
    .eq('id', experimentId);

  if (error) {
    logError(`Failed to conclude experiment ${experimentId}`, error);
    throw new Error(`Failed to conclude experiment: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// getExperimentResults
// ---------------------------------------------------------------------------

/**
 * Returns comprehensive results for an experiment including per-variant
 * statistics, significance testing, and summary metrics.
 */
export async function getExperimentResults(
  experimentId: string,
): Promise<ExperimentResult> {
  const db = getDb();

  // Fetch experiment
  const { data: experiment, error: expError } = await db
    .from('ab_experiments')
    .select('*')
    .eq('id', experimentId)
    .single();

  if (expError || !experiment) {
    throw new Error(`Experiment not found: ${experimentId}`);
  }

  const exp = experiment as Experiment;

  // Fetch variants
  const { data: variants } = await db
    .from('ab_variants')
    .select('*')
    .eq('experiment_id', experimentId);

  exp.variants = (variants ?? []) as Variant[];

  // Fetch all results
  const { data: results } = await db
    .from('ab_results')
    .select('*')
    .eq('experiment_id', experimentId);

  const rows = (results ?? []) as ResultRow[];

  // Build per-variant stats
  const variantGroups: Record<string, ResultRow[]> = {};
  for (const row of rows) {
    if (!variantGroups[row.variant_id]) {
      variantGroups[row.variant_id] = [];
    }
    variantGroups[row.variant_id].push(row);
  }

  const variantStatsList: VariantStats[] = [];

  for (const variant of exp.variants) {
    const variantRows = variantGroups[variant.id] ?? [];
    const n = variantRows.length;

    if (n === 0) {
      variantStatsList.push({
        id: variant.id,
        label: variant.label,
        sample_size: 0,
        total_views: 0,
        mean_engagement: 0,
        mean_watch_time: 0,
        conversion_rate: 0,
        confidence_interval: [0, 0],
      });
      continue;
    }

    const totalViews = variantRows.reduce((s, r) => s + r.views, 0);
    const meanEngagement =
      variantRows.reduce((s, r) => s + r.engagement_rate, 0) / n;
    const meanWatchTime =
      variantRows.reduce((s, r) => s + r.watch_time, 0) / n;
    const meanConversion =
      variantRows.reduce((s, r) => s + r.conversion_rate, 0) / n;

    const ci = wilsonInterval(n, meanEngagement, exp.confidence_threshold);

    variantStatsList.push({
      id: variant.id,
      label: variant.label,
      sample_size: n,
      total_views: totalViews,
      mean_engagement: Math.round(meanEngagement * 10000) / 10000,
      mean_watch_time: Math.round(meanWatchTime * 100) / 100,
      conversion_rate: Math.round(meanConversion * 10000) / 10000,
      confidence_interval: ci,
    });
  }

  // Run significance test
  const significance = await checkSignificance(experimentId);

  // Summary metrics
  const totalPosts = rows.length;
  const totalViews = rows.reduce((s, r) => s + r.views, 0);

  const createdAt = new Date(exp.created_at).getTime();
  const endTime = exp.concluded_at
    ? new Date(exp.concluded_at).getTime()
    : Date.now();
  const durationDays = Math.round((endTime - createdAt) / (24 * 60 * 60 * 1000));

  log(
    `Results for experiment ${experimentId}: ` +
      `${totalPosts} posts, ${totalViews} views, ${durationDays} days, ` +
      `significant=${significance.significant}`,
  );

  return {
    experiment: exp,
    variants: variantStatsList,
    significance,
    total_posts: totalPosts,
    total_views: totalViews,
    duration_days: durationDays,
  };
}

// ---------------------------------------------------------------------------
// autoCheckExperiments — batch check all active experiments
// ---------------------------------------------------------------------------

/**
 * Iterates over all active experiments, checks significance, and
 * auto-concludes any that have reached statistical significance with
 * sufficient sample size.
 */
export async function autoCheckExperiments(): Promise<{
  checked: number;
  concluded: string[];
}> {
  log('Running auto-check on all active experiments...');

  const experiments = await getActiveExperiments();
  const concluded: string[] = [];

  for (const exp of experiments) {
    try {
      const result = await checkSignificance(exp.id);

      if (result.significant && result.winner) {
        log(
          `Auto-concluding experiment "${exp.name}" (${exp.id}): ` +
            `winner=${result.winner}, confidence=${result.confidence}`,
        );

        await concludeExperiment(exp.id);
        concluded.push(exp.id);
      }
    } catch (err) {
      logError(`Failed to check experiment "${exp.name}" (${exp.id})`, err);
    }
  }

  log(
    `Auto-check complete: ${experiments.length} checked, ${concluded.length} concluded`,
  );

  return { checked: experiments.length, concluded };
}

// ---------------------------------------------------------------------------
// Utility: suggested experiments for common content tests
// ---------------------------------------------------------------------------

/**
 * Returns preset experiment templates for common A/B testing scenarios.
 * These can be used directly with createExperiment().
 */
export function getSuggestedExperiments(): ExperimentConfig[] {
  return [
    {
      name: 'Hook Style: Question vs Statement',
      type: 'hook',
      variants: [
        {
          id: 'question',
          label: 'Question Hook',
          config: { style: 'question', template: 'Did you know {topic}?' },
        },
        {
          id: 'statement',
          label: 'Statement Hook',
          config: { style: 'statement', template: '{topic} just changed everything.' },
        },
      ],
      traffic_split: [50, 50],
      min_sample_size: 50,
      confidence_threshold: 0.95,
    },
    {
      name: 'Thumbnail: Face vs No Face',
      type: 'thumbnail',
      variants: [
        {
          id: 'with_face',
          label: 'Face Thumbnail',
          config: { include_face: true, text_overlay: true },
        },
        {
          id: 'no_face',
          label: 'No Face Thumbnail',
          config: { include_face: false, text_overlay: true },
        },
      ],
      traffic_split: [50, 50],
      min_sample_size: 30,
      confidence_threshold: 0.95,
    },
    {
      name: 'Caption Length: Short vs Long vs Medium',
      type: 'caption',
      variants: [
        {
          id: 'short',
          label: 'Short Caption (<100 chars)',
          config: { max_length: 100 },
        },
        {
          id: 'medium',
          label: 'Medium Caption (100-300 chars)',
          config: { max_length: 300 },
        },
        {
          id: 'long',
          label: 'Long Caption (300+ chars)',
          config: { max_length: 1000 },
        },
      ],
      traffic_split: [33, 33, 34],
      min_sample_size: 40,
      confidence_threshold: 0.95,
    },
    {
      name: 'Posting Time: Morning vs Afternoon vs Evening',
      type: 'posting_time',
      variants: [
        {
          id: 'morning',
          label: 'Morning (8-10 AM)',
          config: { hour_start: 8, hour_end: 10 },
        },
        {
          id: 'afternoon',
          label: 'Afternoon (12-2 PM)',
          config: { hour_start: 12, hour_end: 14 },
        },
        {
          id: 'evening',
          label: 'Evening (6-8 PM)',
          config: { hour_start: 18, hour_end: 20 },
        },
      ],
      traffic_split: [33, 33, 34],
      min_sample_size: 30,
      confidence_threshold: 0.90,
    },
  ];
}
