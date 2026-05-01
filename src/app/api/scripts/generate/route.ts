// ============================================================================
// POST /api/scripts/generate — Generate a new video script via LLM
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { getOllama } from '@/lib/ollama';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const generateSchema = z.object({
  topic: z.string().min(3).max(500),
  pillar: z.string().min(1).optional().default('breaking_news'),
  platform: z.enum(['tiktok', 'reels', 'youtube_shorts', 'linkedin', 'twitter']).optional(),
  radar_item_id: z.string().uuid().optional(),
  gap_id: z.string().uuid().optional(),
});

// ---------------------------------------------------------------------------
// Platform-specific constraints
// ---------------------------------------------------------------------------

const PLATFORM_CONSTRAINTS: Record<string, { max_duration: number; aspect_ratio: string; max_caption: number }> = {
  tiktok: { max_duration: 60, aspect_ratio: '9:16', max_caption: 2200 },
  reels: { max_duration: 90, aspect_ratio: '9:16', max_caption: 2200 },
  youtube_shorts: { max_duration: 60, aspect_ratio: '9:16', max_caption: 5000 },
  linkedin: { max_duration: 120, aspect_ratio: '9:16', max_caption: 3000 },
  twitter: { max_duration: 140, aspect_ratio: '16:9', max_caption: 280 },
};

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = generateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { topic, pillar, platform, radar_item_id, gap_id } = parsed.data;
    const db = getDb();

    // Fetch context if radar_item_id or gap_id provided
    let radarContext = '';
    let gapContext = '';

    if (radar_item_id) {
      const { data: radarItem } = await db
        .from('radar_items')
        .select('*')
        .eq('id', radar_item_id)
        .single();

      if (radarItem) {
        radarContext = `\n\nRadar item context:\nTitle: ${radarItem.title}\nSummary: ${radarItem.summary}\nSource: ${radarItem.source}\nCategory: ${radarItem.category}`;
      }
    }

    if (gap_id) {
      const { data: gap } = await db
        .from('competitor_gaps')
        .select('*')
        .eq('id', gap_id)
        .single();

      if (gap) {
        gapContext = `\n\nContent gap to address:\nType: ${gap.gap_type}\nDescription: ${gap.description}\nOpportunity score: ${gap.opportunity_score}`;
      }
    }

    const targetPlatform = platform ?? 'tiktok';
    const constraints = PLATFORM_CONSTRAINTS[targetPlatform];

    const prompt = `You are a viral short-form video script writer for AI content.

Generate a complete video script for the following:

Topic: ${topic}
Content pillar: ${pillar}
Target platform: ${targetPlatform}
Max duration: ${constraints.max_duration} seconds
Aspect ratio: ${constraints.aspect_ratio}${radarContext}${gapContext}

Return a JSON object with these exact fields:
{
  "hook": "The attention-grabbing opening line (first 3 seconds)",
  "hook_variants": ["Alternative hook 1", "Alternative hook 2"],
  "body": "The main content of the script (what to say/show)",
  "cta": "The call to action at the end",
  "cta_type": "one of: follow, comment, share, link_in_bio, dm_keyword, product_link, newsletter, free_resource, paid_product, affiliate, none",
  "caption": "The caption to post with the video",
  "caption_variants": ["Alternative caption 1"],
  "hashtags": ["hashtag1", "hashtag2", "hashtag3"],
  "estimated_duration": 45,
  "monetization_hook": "How this can be monetized (or null)",
  "trending_sound_suggestion": "Suggested trending sound (or null)",
  "text_overlay_suggestions": [
    {"text": "overlay text", "size": 48, "color": "#FFFFFF", "y": 0.3, "startTime": 0, "endTime": 3}
  ]
}

Make the hook extremely attention-grabbing. The body should be clear and value-packed.
Respond ONLY with valid JSON.`;

    const ollama = getOllama();
    const generated = await ollama.generateJSON<{
      hook: string;
      hook_variants: string[];
      body: string;
      cta: string;
      cta_type: string;
      caption: string;
      caption_variants: string[];
      hashtags: string[];
      estimated_duration: number;
      monetization_hook: string | null;
      trending_sound_suggestion: string | null;
      text_overlay_suggestions: Array<{
        text: string;
        size: number;
        color: string;
        y: number;
        startTime: number;
        endTime: number;
      }>;
    }>('mistral', prompt, {
      temperature: 0.8,
      max_tokens: 2000,
    });

    // Build platform versions
    const platforms = ['tiktok', 'reels', 'youtube_shorts', 'linkedin', 'twitter'] as const;
    const platformVersions: Record<string, unknown> = {};

    for (const p of platforms) {
      const pc = PLATFORM_CONSTRAINTS[p];
      platformVersions[p] = {
        hook: generated.hook,
        body: generated.body,
        cta: generated.cta,
        caption: generated.caption.slice(0, pc.max_caption),
        hashtags: generated.hashtags,
        aspect_ratio: pc.aspect_ratio,
        max_duration: pc.max_duration,
        text_overlay_suggestions: generated.text_overlay_suggestions ?? [],
      };
    }

    // Persist the script
    const { data: script, error } = await db
      .from('video_scripts')
      .insert({
        radar_item_id: radar_item_id ?? null,
        gap_id: gap_id ?? null,
        topic,
        hook: generated.hook,
        hook_variants: generated.hook_variants ?? [],
        body: generated.body,
        cta: generated.cta,
        cta_type: generated.cta_type ?? 'follow',
        caption: generated.caption,
        caption_variants: generated.caption_variants ?? [],
        hashtags: generated.hashtags ?? [],
        platform_versions: platformVersions,
        estimated_duration: generated.estimated_duration ?? 45,
        content_pillar: pillar,
        monetization_hook: generated.monetization_hook ?? null,
        trending_sound_suggestion: generated.trending_sound_suggestion ?? null,
        status: 'scripted',
        performance_score: null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 },
      );
    }

    // Mark radar item as processed if applicable
    if (radar_item_id) {
      await db
        .from('radar_items')
        .update({ processed: true })
        .eq('id', radar_item_id);
    }

    return NextResponse.json({ success: true, data: script }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api:scripts/generate] POST error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
