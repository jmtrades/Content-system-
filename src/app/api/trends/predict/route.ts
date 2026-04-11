// ============================================================================
// GET  /api/trends/predict — List trend predictions with confidence filter
// POST /api/trends/predict — Trigger trend analysis
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { getOllama } from '@/lib/ollama';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const confidenceSchema = z.number().min(0).max(1);

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const minConfidence = searchParams.get('min_confidence');
    const actioned = searchParams.get('actioned');
    const action = searchParams.get('recommended_action');
    const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200);
    const offset = Number(searchParams.get('offset') ?? 0);

    const db = getDb();
    let query = db
      .from('trend_predictions')
      .select('*', { count: 'exact' })
      .order('confidence', { ascending: false });

    if (minConfidence) {
      const parsed = confidenceSchema.safeParse(Number(minConfidence));
      if (parsed.success) {
        query = query.gte('confidence', parsed.data);
      }
    }

    if (actioned !== null && actioned !== undefined && actioned !== '') {
      query = query.eq('actioned', actioned === 'true');
    }

    if (action) query = query.eq('recommended_action', action);

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        predictions: data ?? [],
        total: count ?? 0,
        limit,
        offset,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api:trends/predict] GET error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST handler — trigger trend analysis
// ---------------------------------------------------------------------------

export async function POST(_req: NextRequest) {
  try {
    const db = getDb();

    // Gather signals for trend detection
    // 1. Recent radar items grouped by topic
    const { data: recentItems } = await db
      .from('radar_items')
      .select('title, summary, category, importance_score, trending_velocity, source, created_at')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('importance_score', { ascending: false })
      .limit(50);

    // 2. Top performing content (what's working)
    const { data: topContent } = await db
      .from('post_analytics')
      .select('platform, views, likes, shares, engagement_rate, virality_score')
      .order('virality_score', { ascending: false })
      .limit(20);

    // 3. Competitor activity
    const { data: competitorPosts } = await db
      .from('competitor_posts')
      .select('topic_category, views, likes, engagement_rate, posted_at')
      .gte('posted_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('views', { ascending: false })
      .limit(30);

    const signals = {
      radar_items: recentItems ?? [],
      top_content: topContent ?? [],
      competitor_activity: competitorPosts ?? [],
    };

    const ollama = getOllama();

    const prompt = `You are an AI content trend analyst. Analyze these signals and predict upcoming trends.

Current signals:
${JSON.stringify(signals, null, 2)}

Identify 3-6 emerging trends. For each trend, return JSON in this exact format:
{
  "trends": [
    {
      "topic": "The trend topic/theme",
      "velocity": 0.75,
      "cross_platform_score": 0.8,
      "influencer_adoption": 0.6,
      "confidence": 0.85,
      "predicted_peak": "2026-04-25T00:00:00Z",
      "recommended_action": "one of: create_immediately, prepare_script, monitor, ignore, newsjack",
      "reasoning": "Why this is trending"
    }
  ]
}

velocity: 0-1, how fast the trend is growing
cross_platform_score: 0-1, how many platforms it spans
influencer_adoption: 0-1, how many influencers are covering it
confidence: 0-1, how confident you are in this prediction

Respond ONLY with valid JSON.`;

    const result = await ollama.generateJSON<{
      trends: Array<{
        topic: string;
        velocity: number;
        cross_platform_score: number;
        influencer_adoption: number;
        confidence: number;
        predicted_peak: string;
        recommended_action: string;
        reasoning: string;
      }>;
    }>('mistral', prompt, {
      temperature: 0.5,
      max_tokens: 3000,
    });

    // Persist predictions
    const predictions = (result.trends ?? []).map((trend) => ({
      topic: trend.topic,
      velocity: Math.max(0, Math.min(1, trend.velocity ?? 0)),
      cross_platform_score: Math.max(0, Math.min(1, trend.cross_platform_score ?? 0)),
      influencer_adoption: Math.max(0, Math.min(1, trend.influencer_adoption ?? 0)),
      confidence: Math.max(0, Math.min(1, trend.confidence ?? 0)),
      predicted_peak: trend.predicted_peak ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      recommended_action: trend.recommended_action ?? 'monitor',
      actioned: false,
    }));

    let insertedPredictions: Record<string, unknown>[] = [];
    if (predictions.length > 0) {
      const { data: inserted, error: insertErr } = await db
        .from('trend_predictions')
        .insert(predictions)
        .select();

      if (insertErr) {
        console.error('[trends/predict] Insert error:', insertErr.message);
      } else {
        insertedPredictions = inserted ?? [];
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        predictions: insertedPredictions,
        signals_analyzed: {
          radar_items: (recentItems ?? []).length,
          top_content: (topContent ?? []).length,
          competitor_activity: (competitorPosts ?? []).length,
        },
        analyzed_at: new Date().toISOString(),
      },
    }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api:trends/predict] POST error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
