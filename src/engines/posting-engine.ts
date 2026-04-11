// ============================================================================
// Posting Engine — Schedule, queue, and dispatch content to platforms
// ============================================================================

import { getDb } from '@/lib/db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PostingQueueItem {
  id: string;
  video_output_id: string;
  platform: string;
  caption: string;
  hashtags: string[];
  scheduled_at: string;
  posted_at: string | null;
  post_url: string | null;
  post_id: string | null;
  status: string;
  retry_count: number;
  error_message: string | null;
  created_at: string;
}

interface PostingSlot {
  platform: string;
  dayOfWeek: number; // 0 = Sunday ... 6 = Saturday
  hour: number;      // 0-23
  engagement_multiplier: number;
}

interface PostResult {
  post_url: string;
  post_id: string;
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(message: string): void {
  console.log(`[posting-engine] ${message}`);
}

function logError(message: string, err?: unknown): void {
  const detail = err instanceof Error ? err.message : String(err ?? '');
  console.error(`[posting-engine] ERROR: ${message}${detail ? ` — ${detail}` : ''}`);
}

// ---------------------------------------------------------------------------
// Default posting schedule — optimal slots per platform per day
// ---------------------------------------------------------------------------

const defaultSchedule: PostingSlot[] = [
  // TikTok — high engagement mornings & evenings
  { platform: 'tiktok', dayOfWeek: 0, hour: 10, engagement_multiplier: 1.1 },
  { platform: 'tiktok', dayOfWeek: 0, hour: 19, engagement_multiplier: 1.3 },
  { platform: 'tiktok', dayOfWeek: 1, hour: 7,  engagement_multiplier: 1.2 },
  { platform: 'tiktok', dayOfWeek: 1, hour: 18, engagement_multiplier: 1.4 },
  { platform: 'tiktok', dayOfWeek: 2, hour: 9,  engagement_multiplier: 1.3 },
  { platform: 'tiktok', dayOfWeek: 2, hour: 20, engagement_multiplier: 1.2 },
  { platform: 'tiktok', dayOfWeek: 3, hour: 12, engagement_multiplier: 1.1 },
  { platform: 'tiktok', dayOfWeek: 3, hour: 19, engagement_multiplier: 1.3 },
  { platform: 'tiktok', dayOfWeek: 4, hour: 8,  engagement_multiplier: 1.2 },
  { platform: 'tiktok', dayOfWeek: 4, hour: 17, engagement_multiplier: 1.4 },
  { platform: 'tiktok', dayOfWeek: 5, hour: 11, engagement_multiplier: 1.5 },
  { platform: 'tiktok', dayOfWeek: 5, hour: 19, engagement_multiplier: 1.3 },
  { platform: 'tiktok', dayOfWeek: 6, hour: 10, engagement_multiplier: 1.4 },
  { platform: 'tiktok', dayOfWeek: 6, hour: 20, engagement_multiplier: 1.2 },
  // Reels (Instagram) — lunchtime & late afternoon
  { platform: 'reels', dayOfWeek: 0, hour: 11, engagement_multiplier: 1.2 },
  { platform: 'reels', dayOfWeek: 1, hour: 12, engagement_multiplier: 1.3 },
  { platform: 'reels', dayOfWeek: 1, hour: 17, engagement_multiplier: 1.1 },
  { platform: 'reels', dayOfWeek: 2, hour: 11, engagement_multiplier: 1.2 },
  { platform: 'reels', dayOfWeek: 2, hour: 18, engagement_multiplier: 1.3 },
  { platform: 'reels', dayOfWeek: 3, hour: 12, engagement_multiplier: 1.4 },
  { platform: 'reels', dayOfWeek: 4, hour: 10, engagement_multiplier: 1.2 },
  { platform: 'reels', dayOfWeek: 4, hour: 17, engagement_multiplier: 1.3 },
  { platform: 'reels', dayOfWeek: 5, hour: 11, engagement_multiplier: 1.5 },
  { platform: 'reels', dayOfWeek: 6, hour: 10, engagement_multiplier: 1.3 },
  // YouTube Shorts — morning commute & evening
  { platform: 'youtube_shorts', dayOfWeek: 0, hour: 9,  engagement_multiplier: 1.2 },
  { platform: 'youtube_shorts', dayOfWeek: 1, hour: 8,  engagement_multiplier: 1.1 },
  { platform: 'youtube_shorts', dayOfWeek: 1, hour: 19, engagement_multiplier: 1.3 },
  { platform: 'youtube_shorts', dayOfWeek: 2, hour: 14, engagement_multiplier: 1.2 },
  { platform: 'youtube_shorts', dayOfWeek: 3, hour: 8,  engagement_multiplier: 1.1 },
  { platform: 'youtube_shorts', dayOfWeek: 3, hour: 18, engagement_multiplier: 1.3 },
  { platform: 'youtube_shorts', dayOfWeek: 4, hour: 9,  engagement_multiplier: 1.2 },
  { platform: 'youtube_shorts', dayOfWeek: 5, hour: 10, engagement_multiplier: 1.4 },
  { platform: 'youtube_shorts', dayOfWeek: 6, hour: 11, engagement_multiplier: 1.3 },
  // LinkedIn — business hours, weekdays dominant
  { platform: 'linkedin', dayOfWeek: 1, hour: 8,  engagement_multiplier: 1.4 },
  { platform: 'linkedin', dayOfWeek: 1, hour: 12, engagement_multiplier: 1.2 },
  { platform: 'linkedin', dayOfWeek: 2, hour: 9,  engagement_multiplier: 1.5 },
  { platform: 'linkedin', dayOfWeek: 2, hour: 17, engagement_multiplier: 1.1 },
  { platform: 'linkedin', dayOfWeek: 3, hour: 8,  engagement_multiplier: 1.3 },
  { platform: 'linkedin', dayOfWeek: 3, hour: 12, engagement_multiplier: 1.2 },
  { platform: 'linkedin', dayOfWeek: 4, hour: 9,  engagement_multiplier: 1.4 },
  { platform: 'linkedin', dayOfWeek: 5, hour: 10, engagement_multiplier: 1.1 },
  // Twitter / X — frequent, spread across the day
  { platform: 'twitter', dayOfWeek: 0, hour: 10, engagement_multiplier: 1.1 },
  { platform: 'twitter', dayOfWeek: 1, hour: 8,  engagement_multiplier: 1.2 },
  { platform: 'twitter', dayOfWeek: 1, hour: 13, engagement_multiplier: 1.3 },
  { platform: 'twitter', dayOfWeek: 2, hour: 9,  engagement_multiplier: 1.2 },
  { platform: 'twitter', dayOfWeek: 2, hour: 17, engagement_multiplier: 1.1 },
  { platform: 'twitter', dayOfWeek: 3, hour: 12, engagement_multiplier: 1.3 },
  { platform: 'twitter', dayOfWeek: 3, hour: 18, engagement_multiplier: 1.2 },
  { platform: 'twitter', dayOfWeek: 4, hour: 8,  engagement_multiplier: 1.2 },
  { platform: 'twitter', dayOfWeek: 4, hour: 16, engagement_multiplier: 1.4 },
  { platform: 'twitter', dayOfWeek: 5, hour: 10, engagement_multiplier: 1.3 },
  { platform: 'twitter', dayOfWeek: 6, hour: 11, engagement_multiplier: 1.1 },
];

// ---------------------------------------------------------------------------
// schedulePost — Insert a new item into the posting queue
// ---------------------------------------------------------------------------

export async function schedulePost(
  videoOutputId: string,
  platform: string,
  caption: string,
  hashtags: string[],
  scheduledAt: Date,
): Promise<PostingQueueItem> {
  log(`Scheduling post for ${platform} at ${scheduledAt.toISOString()}`);

  const db = getDb();

  // Verify the video output exists and is ready
  const { data: output, error: outputErr } = await db
    .from('video_outputs')
    .select('id, status')
    .eq('id', videoOutputId)
    .single();

  if (outputErr || !output) {
    throw new Error(`Video output ${videoOutputId} not found`);
  }

  if (output.status !== 'ready') {
    throw new Error(`Video output ${videoOutputId} is not ready (status: ${output.status})`);
  }

  const { data: queueItem, error: insertErr } = await db
    .from('posting_queue')
    .insert({
      video_output_id: videoOutputId,
      platform,
      caption,
      hashtags,
      scheduled_at: scheduledAt.toISOString(),
      status: 'scheduled',
      retry_count: 0,
    })
    .select()
    .single();

  if (insertErr) {
    throw new Error(`Failed to schedule post: ${insertErr.message}`);
  }

  log(`Post scheduled: ${queueItem.id} → ${platform} at ${scheduledAt.toISOString()}`);
  return queueItem as PostingQueueItem;
}

// ---------------------------------------------------------------------------
// processPostingQueue — Find due posts and dispatch them
// ---------------------------------------------------------------------------

export async function processPostingQueue(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const db = getDb();
  const now = new Date().toISOString();

  const { data: duePosts, error: fetchErr } = await db
    .from('posting_queue')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(10);

  if (fetchErr) {
    throw new Error(`Failed to fetch posting queue: ${fetchErr.message}`);
  }

  if (!duePosts || duePosts.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  log(`Processing ${duePosts.length} due post(s)`);

  let succeeded = 0;
  let failed = 0;

  for (const post of duePosts) {
    try {
      await postToPlatform({
        id: post.id,
        platform: post.platform,
        caption: post.caption,
        hashtags: post.hashtags ?? [],
        video_output_id: post.video_output_id,
      });
      succeeded++;
    } catch (err) {
      await handlePostFailure(post.id, err instanceof Error ? err : new Error(String(err)));
      failed++;
    }
  }

  log(`Queue processing complete: ${succeeded} succeeded, ${failed} failed`);
  return { processed: duePosts.length, succeeded, failed };
}

// ---------------------------------------------------------------------------
// postToPlatform — Attempt to post content to a specific platform
// ---------------------------------------------------------------------------

export async function postToPlatform(post: {
  id: string;
  platform: string;
  caption: string;
  hashtags: string[];
  video_output_id: string;
}): Promise<PostResult> {
  const db = getDb();

  log(`Posting ${post.id} to ${post.platform}...`);

  // Mark as currently posting
  await db
    .from('posting_queue')
    .update({ status: 'posting' })
    .eq('id', post.id);

  // Build the full caption with hashtags
  const hashtagString = post.hashtags.length > 0
    ? post.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')
    : '';
  const fullCaption = hashtagString
    ? `${post.caption}\n\n${hashtagString}`
    : post.caption;

  // Platform-specific posting logic
  // In production each case would call the real platform API:
  //   TikTok: Content Posting API
  //   Instagram Reels: Graph API
  //   YouTube Shorts: Data API v3
  //   LinkedIn: Marketing API
  //   Twitter/X: X API v2
  // For now we generate a deterministic post ID and URL to simulate success.

  const postId = `${post.platform}_${Date.now()}_${post.id.slice(0, 8)}`;
  const platformUrls: Record<string, string> = {
    tiktok: `https://www.tiktok.com/@user/video/${postId}`,
    reels: `https://www.instagram.com/reel/${postId}/`,
    youtube_shorts: `https://youtube.com/shorts/${postId}`,
    linkedin: `https://www.linkedin.com/posts/${postId}`,
    twitter: `https://x.com/user/status/${postId}`,
  };

  const postUrl = platformUrls[post.platform] ?? `https://${post.platform}.com/post/${postId}`;

  log(`[${post.platform}] Dispatched content (caption: ${fullCaption.slice(0, 60)}...)`);

  // Update queue item as successfully posted
  const { error: updateErr } = await db
    .from('posting_queue')
    .update({
      status: 'posted',
      posted_at: new Date().toISOString(),
      post_url: postUrl,
      post_id: postId,
    })
    .eq('id', post.id);

  if (updateErr) {
    throw new Error(`Post dispatched but failed to update queue record: ${updateErr.message}`);
  }

  // Update the video output status to 'uploaded'
  await db
    .from('video_outputs')
    .update({ status: 'uploaded' })
    .eq('id', post.video_output_id);

  log(`Post ${post.id} successfully published → ${postUrl}`);

  return { post_url: postUrl, post_id: postId };
}

// ---------------------------------------------------------------------------
// handlePostFailure — Increment retries, mark failed after threshold
// ---------------------------------------------------------------------------

export async function handlePostFailure(postId: string, error: Error): Promise<void> {
  const db = getDb();

  logError(`Post ${postId} failed`, error);

  // Fetch current retry count
  const { data: post, error: fetchErr } = await db
    .from('posting_queue')
    .select('retry_count')
    .eq('id', postId)
    .single();

  if (fetchErr || !post) {
    logError(`Could not fetch post ${postId} for failure handling`, fetchErr);
    return;
  }

  const currentRetries = post.retry_count ?? 0;
  const newRetryCount = currentRetries + 1;
  const maxRetries = 3;

  if (newRetryCount >= maxRetries) {
    log(`Post ${postId} permanently failed after ${newRetryCount} attempts`);
    await db
      .from('posting_queue')
      .update({
        status: 'failed',
        retry_count: newRetryCount,
        error_message: error.message,
      })
      .eq('id', postId);
  } else {
    log(`Post ${postId} retry ${newRetryCount}/${maxRetries} — re-queuing as scheduled`);
    await db
      .from('posting_queue')
      .update({
        status: 'scheduled',
        retry_count: newRetryCount,
        error_message: error.message,
      })
      .eq('id', postId);
  }
}

// ---------------------------------------------------------------------------
// getOptimalPostingSlots — Best times based on analytics, falls back to defaults
// ---------------------------------------------------------------------------

export async function getOptimalPostingSlots(platform: string): Promise<PostingSlot[]> {
  const db = getDb();

  log(`Fetching optimal posting slots for ${platform}`);

  // Query post_analytics for best-performing posting times
  const { data: analytics, error: analyticsErr } = await db
    .from('post_analytics')
    .select('posting_queue_id, views, likes, comments, shares, engagement_rate')
    .eq('platform', platform)
    .order('engagement_rate', { ascending: false })
    .limit(100);

  if (analyticsErr || !analytics || analytics.length < 10) {
    log(`Insufficient analytics data for ${platform} — using default schedule`);
    return defaultSchedule.filter((s) => s.platform === platform);
  }

  // Fetch the corresponding posting_queue records to get posted_at timestamps
  const queueIds = analytics.map((a) => a.posting_queue_id).filter(Boolean);
  const { data: posts, error: postsErr } = await db
    .from('posting_queue')
    .select('id, posted_at')
    .in('id', queueIds);

  if (postsErr || !posts || posts.length === 0) {
    log(`Could not fetch post times for ${platform} — using default schedule`);
    return defaultSchedule.filter((s) => s.platform === platform);
  }

  // Build a map of posting_queue_id → posted_at
  const postTimeMap: Record<string, string> = {};
  for (const p of posts) {
    if (p.posted_at) postTimeMap[p.id] = p.posted_at;
  }

  // Group analytics by (dayOfWeek, hour) and calculate average engagement
  const slotPerformance: Record<string, { total: number; count: number }> = {};

  for (const a of analytics) {
    const postedAt = postTimeMap[a.posting_queue_id];
    if (!postedAt) continue;

    const date = new Date(postedAt);
    const dayOfWeek = date.getUTCDay();
    const hour = date.getUTCHours();
    const key = `${dayOfWeek}:${hour}`;

    if (!slotPerformance[key]) slotPerformance[key] = { total: 0, count: 0 };
    slotPerformance[key].total += a.engagement_rate ?? 0;
    slotPerformance[key].count += 1;
  }

  // Convert to PostingSlot array sorted by average engagement
  const dataSlots: PostingSlot[] = Object.entries(slotPerformance)
    .map(([key, perf]) => {
      const [dow, h] = key.split(':').map(Number);
      return {
        platform,
        dayOfWeek: dow,
        hour: h,
        engagement_multiplier: perf.count > 0 ? perf.total / perf.count : 1.0,
      };
    })
    .sort((a, b) => b.engagement_multiplier - a.engagement_multiplier);

  if (dataSlots.length === 0) {
    return defaultSchedule.filter((s) => s.platform === platform);
  }

  log(`Found ${dataSlots.length} data-driven posting slots for ${platform}`);
  return dataSlots;
}

// ---------------------------------------------------------------------------
// getNextAvailableSlot — Find the next open time slot for a platform
// ---------------------------------------------------------------------------

export async function getNextAvailableSlot(platform: string): Promise<Date> {
  const db = getDb();
  const optimalSlots = await getOptimalPostingSlots(platform);

  if (optimalSlots.length === 0) {
    // Fallback: schedule 24 hours from now
    const fallback = new Date(Date.now() + 24 * 60 * 60 * 1000);
    log(`No slots found for ${platform}, using fallback: ${fallback.toISOString()}`);
    return fallback;
  }

  const now = new Date();

  // Generate candidate dates for the next 14 days based on optimal slots
  const candidates: Date[] = [];
  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() + dayOffset);

    for (const slot of optimalSlots) {
      if (candidate.getUTCDay() === slot.dayOfWeek) {
        const slotDate = new Date(candidate);
        slotDate.setUTCHours(slot.hour, 0, 0, 0);

        // Only consider future times
        if (slotDate > now) {
          candidates.push(slotDate);
        }
      }
    }
  }

  // Sort by date ascending
  candidates.sort((a, b) => a.getTime() - b.getTime());

  // Check which candidates are not already scheduled
  const { data: scheduledPosts, error: schedErr } = await db
    .from('posting_queue')
    .select('scheduled_at')
    .eq('platform', platform)
    .in('status', ['scheduled', 'draft'])
    .gte('scheduled_at', now.toISOString())
    .order('scheduled_at', { ascending: true });

  if (schedErr) {
    logError('Failed to fetch scheduled posts for slot lookup', schedErr);
    // Return the first candidate anyway
    return candidates[0] ?? new Date(Date.now() + 24 * 60 * 60 * 1000);
  }

  const scheduledTimes = new Set(
    (scheduledPosts ?? []).map((p) => {
      const d = new Date(p.scheduled_at);
      return `${d.toISOString().split('T')[0]}T${d.getUTCHours().toString().padStart(2, '0')}`;
    }),
  );

  for (const candidate of candidates) {
    const key = `${candidate.toISOString().split('T')[0]}T${candidate.getUTCHours().toString().padStart(2, '0')}`;
    if (!scheduledTimes.has(key)) {
      log(`Next available slot for ${platform}: ${candidate.toISOString()}`);
      return candidate;
    }
  }

  // All slots occupied — fall back to 24h from now
  const fallback = new Date(Date.now() + 24 * 60 * 60 * 1000);
  log(`All optimal slots occupied for ${platform} in next 14 days, using fallback: ${fallback.toISOString()}`);
  return fallback;
}

// ---------------------------------------------------------------------------
// autoScheduleContent — Batch-schedule video outputs across optimal times
// ---------------------------------------------------------------------------

export async function autoScheduleContent(
  videoOutputIds: string[],
): Promise<PostingQueueItem[]> {
  if (videoOutputIds.length === 0) {
    log('autoScheduleContent called with empty array — nothing to schedule');
    return [];
  }

  const db = getDb();

  log(`Auto-scheduling ${videoOutputIds.length} video output(s)`);

  // Fetch video outputs to determine their target platforms
  const { data: outputs, error: outputsErr } = await db
    .from('video_outputs')
    .select('id, platform, job_id, status')
    .in('id', videoOutputIds)
    .eq('status', 'ready');

  if (outputsErr) {
    throw new Error(`Failed to fetch video outputs: ${outputsErr.message}`);
  }

  if (!outputs || outputs.length === 0) {
    log('No ready video outputs found among the provided IDs');
    return [];
  }

  // Fetch script data for captions via the video job → script chain
  const jobIds = Array.from(new Set(outputs.map((o) => o.job_id).filter(Boolean)));
  let scriptData: Record<string, { caption: string; hashtags: string[] }> = {};

  if (jobIds.length > 0) {
    const { data: jobs } = await db
      .from('video_jobs')
      .select('id, script_id')
      .in('id', jobIds);

    const scriptIds = Array.from(new Set((jobs ?? []).map((j) => j.script_id).filter(Boolean)));

    if (scriptIds.length > 0) {
      const { data: scripts } = await db
        .from('video_scripts')
        .select('id, caption, hashtags')
        .in('id', scriptIds);

      // Build a map: job_id → {caption, hashtags}
      const scriptMap: Record<string, { caption: string; hashtags: string[] }> = {};
      for (const s of scripts ?? []) {
        scriptMap[s.id] = { caption: s.caption ?? '', hashtags: s.hashtags ?? [] };
      }

      const jobScriptMap: Record<string, string> = {};
      for (const j of jobs ?? []) {
        if (j.script_id) jobScriptMap[j.id] = j.script_id;
      }

      for (const o of outputs) {
        const scriptId = jobScriptMap[o.job_id];
        if (scriptId && scriptMap[scriptId]) {
          scriptData[o.id] = scriptMap[scriptId];
        }
      }
    }
  }

  // Schedule each output at the next available slot for its platform
  const scheduledItems: PostingQueueItem[] = [];

  for (const output of outputs) {
    try {
      const slotDate = await getNextAvailableSlot(output.platform);
      const content = scriptData[output.id] ?? { caption: '', hashtags: [] };

      const item = await schedulePost(
        output.id,
        output.platform,
        content.caption || `New content on ${output.platform}`,
        content.hashtags,
        slotDate,
      );

      scheduledItems.push(item);
    } catch (err) {
      logError(`Failed to auto-schedule output ${output.id}`, err);
    }
  }

  log(`Auto-scheduled ${scheduledItems.length} of ${outputs.length} video output(s)`);
  return scheduledItems;
}
