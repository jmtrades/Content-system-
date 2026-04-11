// ============================================================================
// POST /api/analytics/optimize — Run optimization analysis
// GET  /api/analytics/optimize — Get latest optimization recommendations
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getOllama } from '@/lib/ollama';

// ---------------------------------------------------------------------------
// GET handler — latest recommendations
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const platform = searchParams.get('platform');
    const limit = Math.min(Number(searchParams.get('limit') ?? 20), 100);

    const db = getDb();
    let query = db
      .from('optimization_recommendations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (platform) query = query.eq('platform', platform);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: { recommendations: data ?? [] },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api:analytics/optimize] GET error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST handler — run optimization analysis
// ---------------------------------------------------------------------------

export async function POST(_req: NextRequest) {
  try {
    const db = getDb();

    // Gather recent analytics data
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: dailyAnalytics } = await db
      .from('daily_analytics')
      .select('*')
      .gte('date', thirtyDaysAgo.toISOString().split('T')[0])
      .order('date', { ascending: false });

    const { data: postAnalytics } = await db
      .from('post_analytics')
      .select('*')
      .gte('measured_at', thirtyDaysAgo.toISOString())
      .order('views', { ascending: false })
      .limit(50);

    const { data: recentScripts } = await db
      .from('video_scripts')
      .select('id, topic, content_pillar, hook, cta_type, status, performance_score')
      .order('created_at', { ascending: false })
      .limit(30);

    // Build analytics summary for LLM analysis
    const analyticsSummary = {
      daily_analytics: (dailyAnalytics ?? []).map((d) => ({
        platform: d.platform,
        date: d.date,
        views: d.total_views,
        likes: d.total_likes,
        engagement: d.avg_engagement_rate,
        followers: d.follower_count,
        growth: d.follower_growth,
      })),
      top_posts: (postAnalytics ?? []).slice(0, 10).map((p) => ({
        platform: p.platform,
        views: p.views,
        likes: p.likes,
        comments: p.comments,
        shares: p.shares,
        engagement: p.engagement_rate,
        save_rate: p.save_rate,
        virality: p.virality_score,
      })),
      content_pillars: (recentScripts ?? []).reduce(
        (acc, s) => {
          const pillar = s.content_pillar ?? 'unknown';
          if (!acc[pillar]) acc[pillar] = { count: 0, avg_score: 0, scores: [] };
          acc[pillar].count++;
          if (s.performance_score) acc[pillar].scores.push(s.performance_score);
          return acc;
        },
        {} as Record<string, { count: number; avg_score: number; scores: number[] }>,
      ),
    };

    // Calculate averages for pillars
    for (const pillar of Object.values(analyticsSummary.content_pillars)) {
      pillar.avg_score =
        pillar.scores.length > 0
          ? pillar.scores.reduce((a, b) => a + b, 0) / pillar.scores.length
          : 0;
    }

    const ollama = getOllama();

    const prompt = `You are a social media analytics expert specializing in short-form video content.

Analyze this performance data and provide optimization recommendations:

${JSON.stringify(analyticsSummary, null, 2)}

Return a JSON object with this structure:
{
  "recommendations": [
    {
      "category": "one of: content, timing, engagement, growth, monetization",
      "platform": "platform name or 'all'",
      "priority": "high, medium, or low",
      "title": "Short title of recommendation",
      "description": "Detailed actionable recommendation",
      "expected_impact": "Expected improvement description",
      "metric_to_track": "Which metric to watch"
    }
  ],
  "summary": "Brief overall assessment",
  "best_performing": "What is working well",
  "biggest_opportunity": "The biggest area for improvement"
}

Provide 5-8 specific, actionable recommendations.
Respond ONLY with valid JSON.`;

    const result = await ollama.generateJSON<{
      recommendations: Array<{
        category: string;
        platform: string;
        priority: string;
        title: string;
        description: string;
        expected_impact: string;
        metric_to_track: string;
      }>;
      summary: string;
      best_performing: string;
      biggest_opportunity: string;
    }>('mistral', prompt, {
      temperature: 0.4,
      max_tokens: 3000,
    });

    // Store recommendations
    const recommendationRows = (result.recommendations ?? []).map((rec) => ({
      category: rec.category,
      platform: rec.platform,
      priority: rec.priority,
      title: rec.title,
      description: rec.description,
      expected_impact: rec.expected_impact,
      metric_to_track: rec.metric_to_track,
    }));

    if (recommendationRows.length > 0) {
      await db.from('optimization_recommendations').insert(recommendationRows);
    }

    return NextResponse.json({
      success: true,
      data: {
        recommendations: result.recommendations ?? [],
        summary: result.summary ?? '',
        best_performing: result.best_performing ?? '',
        biggest_opportunity: result.biggest_opportunity ?? '',
        analyzed_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api:analytics/optimize] POST error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
