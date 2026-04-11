// ============================================================================
// Revenue Tracker — Track, attribute, and analyze revenue across the empire
// ============================================================================

import { getDb } from '@/lib/db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TrackRevenueInput {
  product_id: string;
  amount: number;
  currency?: string;
  type: string;
  source_platform?: string | null;
  customer_email?: string;
  stripe_payment_id?: string;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
}

interface RevenueEvent {
  id: string;
  product_id: string;
  amount: number;
  currency: string;
  type: string;
  source_platform: string | null;
  source_post_id: string | null;
  customer_email: string;
  stripe_payment_id: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  created_at: string;
}

interface RevenueDashboard {
  today: number;
  this_week: number;
  this_month: number;
  all_time: number;
  by_product: {
    product_id: string;
    product_name: string;
    product_type: string;
    total: number;
    count: number;
  }[];
  by_platform: {
    platform: string;
    total: number;
    count: number;
  }[];
  revenue_per_follower: {
    platform: string;
    revenue: number;
    followers: number;
    revenue_per_follower: number;
  }[];
  mrr: number;
  targets: {
    id: string;
    period: string;
    target_amount: number;
    actual_amount: number;
    start_date: string;
    end_date: string;
    on_track: boolean;
  }[];
  recent_events: RevenueEvent[];
  generated_at: string;
}

interface StripeWebhookEvent {
  type: string;
  data: {
    object: Record<string, unknown>;
  };
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(message: string): void {
  console.log(`[revenue-tracker] ${message}`);
}

function logError(message: string, err?: unknown): void {
  const detail = err instanceof Error ? err.message : String(err ?? '');
  console.error(`[revenue-tracker] ERROR: ${message}${detail ? ` — ${detail}` : ''}`);
}

// ---------------------------------------------------------------------------
// trackRevenue — Record a revenue event
// ---------------------------------------------------------------------------

export async function trackRevenue(event: TrackRevenueInput): Promise<RevenueEvent> {
  const db = getDb();

  log(`Tracking revenue: ${event.type} ${event.amount} ${event.currency ?? 'USD'} for product ${event.product_id}`);

  // Verify the product exists
  const { data: product, error: prodErr } = await db
    .from('products')
    .select('id, name')
    .eq('id', event.product_id)
    .single();

  if (prodErr || !product) {
    throw new Error(`Product ${event.product_id} not found`);
  }

  const { data: inserted, error: insertErr } = await db
    .from('revenue_events')
    .insert({
      product_id: event.product_id,
      amount: event.amount,
      currency: (event.currency ?? 'USD').toUpperCase(),
      type: event.type,
      source_platform: event.source_platform ?? null,
      source_post_id: null,
      customer_email: event.customer_email ?? '',
      stripe_payment_id: event.stripe_payment_id ?? '',
      utm_source: event.utm_source ?? null,
      utm_medium: event.utm_medium ?? null,
      utm_campaign: event.utm_campaign ?? null,
    })
    .select()
    .single();

  if (insertErr) {
    throw new Error(`Failed to track revenue event: ${insertErr.message}`);
  }

  const revenueEvent = inserted as RevenueEvent;

  // Try to attribute the revenue to a specific post
  try {
    await attributeRevenue(revenueEvent);
  } catch (err) {
    logError('Revenue attribution failed (non-fatal)', err);
  }

  log(`Revenue event recorded: ${revenueEvent.id} — ${event.amount} ${event.currency ?? 'USD'}`);
  return revenueEvent;
}

// ---------------------------------------------------------------------------
// attributeRevenue — Determine which post drove the sale
// ---------------------------------------------------------------------------

export async function attributeRevenue(event: RevenueEvent): Promise<void> {
  const db = getDb();

  log(`Attributing revenue event ${event.id}`);

  // Strategy 1: UTM campaign contains a post reference
  if (event.utm_campaign) {
    // Convention: utm_campaign may be set to the posting_queue ID or slug
    const { data: matchedPost } = await db
      .from('posting_queue')
      .select('id')
      .eq('id', event.utm_campaign)
      .single();

    if (matchedPost) {
      await db
        .from('revenue_events')
        .update({ source_post_id: matchedPost.id })
        .eq('id', event.id);

      log(`Attributed event ${event.id} to post ${matchedPost.id} via UTM campaign`);
      return;
    }
  }

  // Strategy 2: UTM source matches a platform — find the most recent post on that platform
  if (event.utm_source) {
    const platformAliases: Record<string, string> = {
      tiktok: 'tiktok',
      instagram: 'reels',
      reels: 'reels',
      youtube: 'youtube_shorts',
      youtube_shorts: 'youtube_shorts',
      linkedin: 'linkedin',
      twitter: 'twitter',
      x: 'twitter',
    };

    const platform = platformAliases[event.utm_source.toLowerCase()];

    if (platform) {
      // Last-touch model: attribute to the most recently posted content on this platform
      const { data: recentPost } = await db
        .from('posting_queue')
        .select('id')
        .eq('platform', platform)
        .eq('status', 'posted')
        .order('posted_at', { ascending: false })
        .limit(1)
        .single();

      if (recentPost) {
        await db
          .from('revenue_events')
          .update({
            source_post_id: recentPost.id,
            source_platform: platform,
          })
          .eq('id', event.id);

        log(`Attributed event ${event.id} to post ${recentPost.id} via UTM source (${platform})`);
        return;
      }
    }
  }

  // Strategy 3: If source_platform is set, use last-touch on that platform
  if (event.source_platform) {
    const { data: recentPost } = await db
      .from('posting_queue')
      .select('id')
      .eq('platform', event.source_platform)
      .eq('status', 'posted')
      .order('posted_at', { ascending: false })
      .limit(1)
      .single();

    if (recentPost) {
      await db
        .from('revenue_events')
        .update({ source_post_id: recentPost.id })
        .eq('id', event.id);

      log(`Attributed event ${event.id} to post ${recentPost.id} via source_platform`);
      return;
    }
  }

  log(`Could not attribute revenue event ${event.id} to any specific post`);
}

// ---------------------------------------------------------------------------
// getRevenueDashboard — Comprehensive revenue overview
// ---------------------------------------------------------------------------

export async function getRevenueDashboard(): Promise<RevenueDashboard> {
  const db = getDb();
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  log('Generating revenue dashboard');

  // Calculate date boundaries
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  const startOfWeekStr = startOfWeek.toISOString().split('T')[0];

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfMonthStr = startOfMonth.toISOString().split('T')[0];

  // Fetch all revenue events
  const { data: allEvents, error: eventsErr } = await db
    .from('revenue_events')
    .select('*')
    .order('created_at', { ascending: false });

  if (eventsErr) {
    throw new Error(`Failed to fetch revenue events: ${eventsErr.message}`);
  }

  const events = (allEvents ?? []) as RevenueEvent[];

  // Helper: sum event amounts (refunds are subtracted)
  const sumEvents = (filtered: RevenueEvent[]): number =>
    filtered.reduce(
      (sum, e) => sum + (e.type === 'refund' ? -(e.amount ?? 0) : (e.amount ?? 0)),
      0,
    );

  // Time-period totals
  const todayEvents = events.filter(
    (e) => (e.created_at ?? '').split('T')[0] === todayStr,
  );
  const weekEvents = events.filter(
    (e) => (e.created_at ?? '') >= `${startOfWeekStr}T00:00:00`,
  );
  const monthEvents = events.filter(
    (e) => (e.created_at ?? '') >= `${startOfMonthStr}T00:00:00`,
  );

  // Revenue by product
  const byProductMap: Record<string, { total: number; count: number }> = {};
  for (const e of events) {
    const pid = e.product_id;
    if (!byProductMap[pid]) byProductMap[pid] = { total: 0, count: 0 };
    byProductMap[pid].total += e.type === 'refund' ? -(e.amount ?? 0) : (e.amount ?? 0);
    byProductMap[pid].count += 1;
  }

  // Fetch product details for enrichment
  const productIds = Object.keys(byProductMap);
  const productLookup: Record<string, { name: string; type: string }> = {};

  if (productIds.length > 0) {
    const { data: products } = await db
      .from('products')
      .select('id, name, type')
      .in('id', productIds);

    for (const p of products ?? []) {
      productLookup[p.id] = { name: p.name, type: p.type };
    }
  }

  const byProduct = Object.entries(byProductMap).map(([pid, stats]) => ({
    product_id: pid,
    product_name: productLookup[pid]?.name ?? 'Unknown',
    product_type: productLookup[pid]?.type ?? 'unknown',
    total: Math.round(stats.total * 100) / 100,
    count: stats.count,
  }));

  // Revenue by platform
  const byPlatformMap: Record<string, { total: number; count: number }> = {};
  for (const e of events) {
    const p = e.source_platform ?? 'unknown';
    if (!byPlatformMap[p]) byPlatformMap[p] = { total: 0, count: 0 };
    byPlatformMap[p].total += e.type === 'refund' ? -(e.amount ?? 0) : (e.amount ?? 0);
    byPlatformMap[p].count += 1;
  }

  const byPlatform = Object.entries(byPlatformMap).map(([platform, stats]) => ({
    platform,
    total: Math.round(stats.total * 100) / 100,
    count: stats.count,
  }));

  // Revenue per follower — requires daily_analytics for follower counts
  const platforms = ['tiktok', 'reels', 'youtube_shorts', 'linkedin', 'twitter'];
  const revenuePerFollower: RevenueDashboard['revenue_per_follower'] = [];

  for (const platform of platforms) {
    const platformRevenue = byPlatformMap[platform]?.total ?? 0;

    // Get the latest follower count from daily_analytics
    const { data: latestDA } = await db
      .from('daily_analytics')
      .select('follower_count')
      .eq('platform', platform)
      .order('date', { ascending: false })
      .limit(1);

    const followers = latestDA?.[0]?.follower_count ?? 0;

    revenuePerFollower.push({
      platform,
      revenue: Math.round(platformRevenue * 100) / 100,
      followers,
      revenue_per_follower: followers > 0
        ? Math.round((platformRevenue / followers) * 10000) / 10000
        : 0,
    });
  }

  // MRR — sum of recurring revenue in the current month
  const recurringThisMonth = monthEvents.filter((e) => e.type === 'recurring');
  const mrr = sumEvents(recurringThisMonth);

  // Fetch revenue targets
  const { data: targets } = await db
    .from('revenue_targets')
    .select('*')
    .order('start_date', { ascending: false });

  return {
    today: Math.round(sumEvents(todayEvents) * 100) / 100,
    this_week: Math.round(sumEvents(weekEvents) * 100) / 100,
    this_month: Math.round(sumEvents(monthEvents) * 100) / 100,
    all_time: Math.round(sumEvents(events) * 100) / 100,
    by_product: byProduct,
    by_platform: byPlatform,
    revenue_per_follower: revenuePerFollower,
    mrr: Math.round(mrr * 100) / 100,
    targets: (targets ?? []).map((t) => ({
      id: t.id,
      period: t.period,
      target_amount: t.target_amount,
      actual_amount: t.actual_amount,
      start_date: t.start_date,
      end_date: t.end_date,
      on_track: t.on_track,
    })),
    recent_events: events.slice(0, 20),
    generated_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// getRevenueForPeriod — Sum revenue for a given period
// ---------------------------------------------------------------------------

export async function getRevenueForPeriod(
  period: 'today' | 'week' | 'month' | 'all',
): Promise<{ total: number; count: number; period: string; from: string }> {
  const db = getDb();
  const now = new Date();
  let fromDate: string;

  switch (period) {
    case 'today':
      fromDate = now.toISOString().split('T')[0] + 'T00:00:00Z';
      break;
    case 'week': {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      fromDate = weekAgo.toISOString();
      break;
    }
    case 'month': {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      fromDate = monthStart.toISOString();
      break;
    }
    case 'all':
      fromDate = '1970-01-01T00:00:00Z';
      break;
  }

  log(`Fetching revenue for period: ${period} (from ${fromDate})`);

  let query = db
    .from('revenue_events')
    .select('amount, type');

  if (period !== 'all') {
    query = query.gte('created_at', fromDate);
  }

  const { data: events, error: fetchErr } = await query;

  if (fetchErr) {
    throw new Error(`Failed to fetch revenue events: ${fetchErr.message}`);
  }

  const rows = events ?? [];
  const total = rows.reduce(
    (sum, e) => sum + (e.type === 'refund' ? -(e.amount ?? 0) : (e.amount ?? 0)),
    0,
  );

  return {
    total: Math.round(total * 100) / 100,
    count: rows.length,
    period,
    from: fromDate,
  };
}

// ---------------------------------------------------------------------------
// handleStripeWebhook — Process Stripe webhook events
// ---------------------------------------------------------------------------

export async function handleStripeWebhook(event: StripeWebhookEvent): Promise<{
  handled: boolean;
  event_type: string;
}> {
  const db = getDb();

  log(`Processing Stripe webhook: ${event.type}`);

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const customerEmail = (session.customer_email as string) ?? '';
      const amountTotal = ((session.amount_total as number) ?? 0) / 100;
      const paymentId = (session.payment_intent as string) ?? (session.id as string) ?? '';
      const metadata = (session.metadata as Record<string, string>) ?? {};

      if (metadata.product_id && amountTotal > 0) {
        await db.from('revenue_events').insert({
          product_id: metadata.product_id,
          amount: amountTotal,
          currency: ((session.currency as string) ?? 'usd').toUpperCase(),
          type: 'one_time',
          customer_email: customerEmail,
          stripe_payment_id: paymentId,
          source_platform: metadata.source_platform ?? null,
          utm_source: metadata.utm_source ?? null,
          utm_medium: metadata.utm_medium ?? null,
          utm_campaign: metadata.utm_campaign ?? null,
        });
        log(`Checkout completed: ${amountTotal} from ${customerEmail}`);
      }
      break;
    }

    case 'payment_intent.succeeded': {
      const pi = event.data.object;
      const amount = ((pi.amount as number) ?? 0) / 100;
      const paymentId = (pi.id as string) ?? '';
      const metadata = (pi.metadata as Record<string, string>) ?? {};

      // Deduplicate against checkout.session.completed
      const { data: existing } = await db
        .from('revenue_events')
        .select('id')
        .eq('stripe_payment_id', paymentId)
        .limit(1);

      if (existing && existing.length > 0) {
        log(`Payment intent ${paymentId} already recorded — skipping`);
        break;
      }

      if (metadata.product_id && amount > 0) {
        await db.from('revenue_events').insert({
          product_id: metadata.product_id,
          amount,
          currency: ((pi.currency as string) ?? 'usd').toUpperCase(),
          type: 'one_time',
          customer_email: metadata.customer_email ?? '',
          stripe_payment_id: paymentId,
          utm_source: metadata.utm_source ?? null,
          utm_medium: metadata.utm_medium ?? null,
          utm_campaign: metadata.utm_campaign ?? null,
        });
        log(`Payment succeeded: ${amount}`);
      }
      break;
    }

    case 'invoice.paid': {
      const invoice = event.data.object;
      const amount = ((invoice.amount_paid as number) ?? 0) / 100;
      const customerEmail = (invoice.customer_email as string) ?? '';
      const paymentId = (invoice.payment_intent as string) ?? (invoice.id as string) ?? '';
      const metadata = (invoice.metadata as Record<string, string>) ?? {};

      if (amount > 0) {
        await db.from('revenue_events').insert({
          product_id: metadata.product_id ?? '',
          amount,
          currency: ((invoice.currency as string) ?? 'usd').toUpperCase(),
          type: 'recurring',
          customer_email: customerEmail,
          stripe_payment_id: paymentId,
          utm_source: metadata.utm_source ?? null,
          utm_medium: metadata.utm_medium ?? null,
          utm_campaign: metadata.utm_campaign ?? null,
        });
        log(`Invoice paid (recurring): ${amount} from ${customerEmail}`);
      }
      break;
    }

    case 'customer.subscription.created': {
      const sub = event.data.object;
      const subId = (sub.id as string) ?? '';
      const status = (sub.status as string) ?? '';
      const metadata = (sub.metadata as Record<string, string>) ?? {};

      await db.from('subscriptions').upsert(
        {
          stripe_subscription_id: subId,
          status,
          product_id: metadata.product_id ?? null,
          customer_email: metadata.customer_email ?? '',
          current_period_start: sub.current_period_start
            ? new Date((sub.current_period_start as number) * 1000).toISOString()
            : null,
          current_period_end: sub.current_period_end
            ? new Date((sub.current_period_end as number) * 1000).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'stripe_subscription_id' },
      );
      log(`Subscription created: ${subId} (${status})`);
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      const subId = (sub.id as string) ?? '';

      await db
        .from('subscriptions')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_subscription_id', subId);

      log(`Subscription cancelled: ${subId}`);
      break;
    }

    default:
      log(`Unhandled Stripe event type: ${event.type}`);
      return { handled: false, event_type: event.type };
  }

  return { handled: true, event_type: event.type };
}

// ---------------------------------------------------------------------------
// calculateROI — Revenue per follower for a platform
// ---------------------------------------------------------------------------

export async function calculateROI(platform: string): Promise<{
  platform: string;
  total_revenue: number;
  follower_count: number;
  revenue_per_follower: number;
  total_posts: number;
  revenue_per_post: number;
}> {
  const db = getDb();

  log(`Calculating ROI for ${platform}`);

  // Total revenue from this platform
  const { data: revenueData, error: revErr } = await db
    .from('revenue_events')
    .select('amount, type')
    .eq('source_platform', platform);

  if (revErr) {
    throw new Error(`Failed to fetch revenue for ${platform}: ${revErr.message}`);
  }

  const totalRevenue = (revenueData ?? []).reduce(
    (sum, e) => sum + (e.type === 'refund' ? -(e.amount ?? 0) : (e.amount ?? 0)),
    0,
  );

  // Latest follower count
  const { data: latestAnalytics } = await db
    .from('daily_analytics')
    .select('follower_count')
    .eq('platform', platform)
    .order('date', { ascending: false })
    .limit(1);

  const followerCount = latestAnalytics?.[0]?.follower_count ?? 0;

  // Total posts on this platform
  const { data: postCount } = await db
    .from('posting_queue')
    .select('id', { count: 'exact', head: true })
    .eq('platform', platform)
    .eq('status', 'posted');

  const totalPosts = (postCount as unknown as { count?: number })?.count ?? 0;

  const result = {
    platform,
    total_revenue: Math.round(totalRevenue * 100) / 100,
    follower_count: followerCount,
    revenue_per_follower: followerCount > 0
      ? Math.round((totalRevenue / followerCount) * 10000) / 10000
      : 0,
    total_posts: typeof totalPosts === 'number' ? totalPosts : 0,
    revenue_per_post: totalPosts > 0
      ? Math.round((totalRevenue / totalPosts) * 100) / 100
      : 0,
  };

  log(`ROI for ${platform}: $${result.total_revenue} / ${result.follower_count} followers = $${result.revenue_per_follower}/follower`);
  return result;
}

// ---------------------------------------------------------------------------
// updateTargetProgress — Recalculate actual_amount and on_track for targets
// ---------------------------------------------------------------------------

export async function updateTargetProgress(): Promise<{
  targets_updated: number;
}> {
  const db = getDb();

  log('Updating revenue target progress');

  const { data: targets, error: targetsErr } = await db
    .from('revenue_targets')
    .select('*');

  if (targetsErr) {
    throw new Error(`Failed to fetch revenue targets: ${targetsErr.message}`);
  }

  if (!targets || targets.length === 0) {
    log('No revenue targets to update');
    return { targets_updated: 0 };
  }

  let updated = 0;

  for (const target of targets) {
    try {
      // Sum revenue events within the target's date range
      const { data: events, error: eventsErr } = await db
        .from('revenue_events')
        .select('amount, type')
        .gte('created_at', target.start_date)
        .lte('created_at', target.end_date);

      if (eventsErr) {
        logError(`Failed to fetch events for target ${target.id}`, eventsErr);
        continue;
      }

      const actualAmount = (events ?? []).reduce(
        (sum, e) => sum + (e.type === 'refund' ? -(e.amount ?? 0) : (e.amount ?? 0)),
        0,
      );

      // Determine if on track based on elapsed time vs progress
      const startDate = new Date(target.start_date);
      const endDate = new Date(target.end_date);
      const now = new Date();

      const totalDuration = endDate.getTime() - startDate.getTime();
      const elapsed = now.getTime() - startDate.getTime();
      const elapsedRatio = totalDuration > 0 ? Math.min(1, elapsed / totalDuration) : 1;

      const expectedAmount = target.target_amount * elapsedRatio;
      const onTrack = actualAmount >= expectedAmount * 0.9; // 90% threshold for on-track

      const { error: updateErr } = await db
        .from('revenue_targets')
        .update({
          actual_amount: Math.round(actualAmount * 100) / 100,
          on_track: onTrack,
        })
        .eq('id', target.id);

      if (updateErr) {
        logError(`Failed to update target ${target.id}`, updateErr);
      } else {
        updated++;
        log(`Target ${target.id} (${target.period}): $${Math.round(actualAmount * 100) / 100} / $${target.target_amount} — ${onTrack ? 'on track' : 'behind'}`);
      }
    } catch (err) {
      logError(`Error processing target ${target.id}`, err);
    }
  }

  log(`Target progress update complete: ${updated}/${targets.length} targets updated`);
  return { targets_updated: updated };
}
