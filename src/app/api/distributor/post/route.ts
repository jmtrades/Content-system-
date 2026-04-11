// ============================================================================
// POST /api/distributor/post — Manually trigger posting for a queue item
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const postSchema = z.object({
  queue_id: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = postSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { queue_id } = parsed.data;
    const db = getDb();

    // Fetch queue item with video output info
    const { data: queueItem, error: queueErr } = await db
      .from('posting_queue')
      .select('*')
      .eq('id', queue_id)
      .single();

    if (queueErr || !queueItem) {
      return NextResponse.json(
        { success: false, error: 'Queue item not found' },
        { status: 404 },
      );
    }

    // Validate the item can be posted
    if (queueItem.status === 'posted') {
      return NextResponse.json(
        { success: false, error: 'This item has already been posted' },
        { status: 400 },
      );
    }

    if (queueItem.status === 'posting') {
      return NextResponse.json(
        { success: false, error: 'This item is currently being posted' },
        { status: 409 },
      );
    }

    // Fetch the associated video output
    const { data: videoOutput, error: voErr } = await db
      .from('video_outputs')
      .select('*')
      .eq('id', queueItem.video_output_id)
      .single();

    if (voErr || !videoOutput) {
      return NextResponse.json(
        { success: false, error: 'Associated video output not found' },
        { status: 404 },
      );
    }

    if (videoOutput.status !== 'ready') {
      return NextResponse.json(
        { success: false, error: `Video output is not ready (status: ${videoOutput.status})` },
        { status: 400 },
      );
    }

    // Mark as posting
    await db
      .from('posting_queue')
      .update({ status: 'posting' })
      .eq('id', queue_id);

    // Attempt to post (platform-specific logic)
    try {
      const postResult = await postToPlatform(
        queueItem.platform,
        videoOutput.output_path,
        queueItem.caption,
        queueItem.hashtags,
      );

      // Update queue item with success
      const { data: updated, error: updateErr } = await db
        .from('posting_queue')
        .update({
          status: 'posted',
          posted_at: new Date().toISOString(),
          post_url: postResult.post_url,
          post_id: postResult.post_id,
        })
        .eq('id', queue_id)
        .select()
        .single();

      if (updateErr) {
        return NextResponse.json(
          { success: false, error: updateErr.message },
          { status: 500 },
        );
      }

      // Update video output status
      await db
        .from('video_outputs')
        .update({ status: 'uploaded' })
        .eq('id', queueItem.video_output_id);

      return NextResponse.json({
        success: true,
        data: updated,
      });
    } catch (postErr) {
      // Mark as failed
      const errorMsg = postErr instanceof Error ? postErr.message : String(postErr);
      await db
        .from('posting_queue')
        .update({
          status: 'failed',
          error_message: errorMsg,
          retry_count: (queueItem.retry_count ?? 0) + 1,
        })
        .eq('id', queue_id);

      return NextResponse.json(
        { success: false, error: `Posting failed: ${errorMsg}` },
        { status: 502 },
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api:distributor/post] POST error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Platform posting logic
// ---------------------------------------------------------------------------

interface PostResult {
  post_url: string;
  post_id: string;
}

async function postToPlatform(
  platform: string,
  videoPath: string,
  caption: string,
  hashtags: string[],
): Promise<PostResult> {
  // Platform-specific API integration
  // In production, each platform would have its own posting flow:
  // - TikTok: TikTok Content Posting API
  // - Instagram Reels: Instagram Graph API
  // - YouTube Shorts: YouTube Data API v3
  // - LinkedIn: LinkedIn Marketing API
  // - Twitter/X: X API v2

  const _fullCaption = hashtags.length > 0
    ? `${caption}\n\n${hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}`
    : caption;

  // Simulate posting — replace with real API calls
  const postId = `${platform}_${Date.now()}`;
  const platformUrls: Record<string, string> = {
    tiktok: `https://www.tiktok.com/@user/video/${postId}`,
    reels: `https://www.instagram.com/reel/${postId}/`,
    youtube_shorts: `https://youtube.com/shorts/${postId}`,
    linkedin: `https://www.linkedin.com/posts/${postId}`,
    twitter: `https://x.com/user/status/${postId}`,
  };

  return {
    post_url: platformUrls[platform] ?? `https://${platform}.com/post/${postId}`,
    post_id: postId,
  };
}
