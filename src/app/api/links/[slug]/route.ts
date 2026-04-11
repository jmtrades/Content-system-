// ============================================================================
// GET /api/links/[slug] — Smart link router with platform detection & tracking
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// ---------------------------------------------------------------------------
// Platform detection from referrer / user agent
// ---------------------------------------------------------------------------

function detectPlatform(
  referrer: string | null,
  userAgent: string | null,
): string {
  const ref = (referrer ?? '').toLowerCase();
  const ua = (userAgent ?? '').toLowerCase();

  if (ref.includes('tiktok') || ua.includes('tiktok') || ref.includes('musical.ly')) {
    return 'tiktok';
  }
  if (ref.includes('instagram') || ua.includes('instagram')) {
    return 'reels';
  }
  if (ref.includes('youtube') || ua.includes('youtube')) {
    return 'youtube_shorts';
  }
  if (ref.includes('linkedin') || ua.includes('linkedin')) {
    return 'linkedin';
  }
  if (ref.includes('twitter') || ref.includes('x.com') || ua.includes('twitter')) {
    return 'twitter';
  }

  return 'unknown';
}

// ---------------------------------------------------------------------------
// GET handler — redirect with tracking
// ---------------------------------------------------------------------------

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  try {
    const slug = params.slug;
    const db = getDb();

    // Look up the smart link
    const { data: link, error: linkErr } = await db
      .from('smart_links')
      .select('*')
      .eq('slug', slug)
      .eq('active', true)
      .single();

    if (linkErr || !link) {
      return NextResponse.json(
        { success: false, error: 'Link not found' },
        { status: 404 },
      );
    }

    // Detect platform from referrer and user agent
    const referrer = req.headers.get('referer');
    const userAgent = req.headers.get('user-agent');
    const detectedPlatform = detectPlatform(referrer, userAgent);

    // Find the right destination URL
    const destinations = (link.destinations ?? []) as Array<{
      platform: string;
      url: string;
    }>;

    // Try to match detected platform, fall back to first destination
    let destinationUrl = destinations[0]?.url ?? link.default_url ?? '';
    const platformMatch = destinations.find((d) => d.platform === detectedPlatform);
    if (platformMatch) {
      destinationUrl = platformMatch.url;
    }

    if (!destinationUrl) {
      return NextResponse.json(
        { success: false, error: 'No destination configured for this link' },
        { status: 404 },
      );
    }

    // Build UTM params
    const tracking = (link.tracking ?? {}) as {
      utm_source?: string;
      utm_medium?: string;
      utm_campaign?: string;
    };

    const url = new URL(destinationUrl);
    if (tracking.utm_source) url.searchParams.set('utm_source', tracking.utm_source);
    if (tracking.utm_medium) url.searchParams.set('utm_medium', tracking.utm_medium);
    if (tracking.utm_campaign) url.searchParams.set('utm_campaign', tracking.utm_campaign);
    url.searchParams.set('utm_content', slug);

    // Log the click asynchronously
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    db.from('link_clicks').insert({
      smart_link_id: link.id,
      slug,
      detected_platform: detectedPlatform,
      referrer: referrer ?? null,
      user_agent: userAgent ?? null,
      ip_address: ip,
      destination_url: url.toString(),
      clicked_at: new Date().toISOString(),
    }).then(() => {
      // Also increment click counter on the smart link
      return db.rpc('increment_link_clicks', { link_id: link.id });
    }).catch((err) => {
      console.error(`[links] Failed to log click for ${slug}:`, err);
    });

    // Return redirect response
    return NextResponse.redirect(url.toString(), 302);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api:links/[slug]] GET error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
