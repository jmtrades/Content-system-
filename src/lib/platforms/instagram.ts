// ============================================================================
// Instagram Graph API Client (Reels & Insights)
// ============================================================================

import fs from 'fs/promises';
import type { OAuthTokens, PlatformUploadResult, PlatformMetrics, PlatformAccountMetrics } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InstagramConfig {
  accessToken?: string;
  igUserId?: string;
  appId?: string;
  appSecret?: string;
}

interface ContainerStatusResponse {
  status_code?: string;
  status?: string;
  id?: string;
  error?: { message: string; code: number };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GRAPH_API_BASE = 'https://graph.facebook.com/v19.0';
const RATE_LIMIT_DELAY_MS = 1500;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2000;
const CONTAINER_POLL_INTERVAL_MS = 5000;
const CONTAINER_POLL_MAX_ATTEMPTS = 60; // 5 minutes max

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class InstagramClient {
  private accessToken: string;
  private igUserId: string;
  private appId: string;
  private appSecret: string;
  private lastRequestTime: number = 0;

  constructor(config?: Partial<InstagramConfig>) {
    this.accessToken = config?.accessToken ?? process.env.INSTAGRAM_ACCESS_TOKEN ?? '';
    this.igUserId = config?.igUserId ?? process.env.INSTAGRAM_USER_ID ?? '';
    this.appId = config?.appId ?? process.env.INSTAGRAM_APP_ID ?? '';
    this.appSecret = config?.appSecret ?? process.env.INSTAGRAM_APP_SECRET ?? '';
  }

  // -----------------------------------------------------------------------
  // Authentication
  // -----------------------------------------------------------------------

  /**
   * Set a long-lived access token directly.
   */
  setTokens(tokens: OAuthTokens): void {
    this.accessToken = tokens.accessToken;
  }

  /**
   * Exchange a short-lived token for a long-lived token.
   */
  async exchangeForLongLivedToken(shortLivedToken: string): Promise<OAuthTokens> {
    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: this.appId,
      client_secret: this.appSecret,
      fb_exchange_token: shortLivedToken,
    });

    const res = await fetch(`${GRAPH_API_BASE}/oauth/access_token?${params.toString()}`);
    const data = await res.json();

    if (data.error) {
      throw new Error(`Instagram token exchange failed: ${data.error.message}`);
    }

    this.accessToken = data.access_token;

    return {
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 5184000) * 1000,
      tokenType: data.token_type ?? 'bearer',
    };
  }

  /**
   * Refresh a long-lived token (valid tokens can be refreshed before expiry).
   */
  async refreshToken(): Promise<OAuthTokens> {
    const params = new URLSearchParams({
      grant_type: 'ig_refresh_token',
      access_token: this.accessToken,
    });

    const res = await fetch(`${GRAPH_API_BASE}/refresh_access_token?${params.toString()}`);
    const data = await res.json();

    if (data.error) {
      throw new Error(`Instagram token refresh failed: ${data.error.message}`);
    }

    this.accessToken = data.access_token;

    return {
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 5184000) * 1000,
      tokenType: data.token_type ?? 'bearer',
    };
  }

  // -----------------------------------------------------------------------
  // Reel Upload (Container-based workflow)
  // -----------------------------------------------------------------------

  /**
   * Upload a Reel to Instagram.
   *
   * The Instagram API requires a 3-step process:
   *   1. Create a media container with a publicly-accessible video URL
   *   2. Poll until the container is ready
   *   3. Publish the container
   *
   * NOTE: Instagram requires the video to be hosted at a public URL.
   *       This method expects `videoUrl` to be a publicly-accessible URL.
   *       If you have a local file, upload it to your CDN/storage first.
   */
  async uploadReel(
    videoUrl: string,
    caption: string,
    options?: {
      coverUrl?: string;
      shareToFeed?: boolean;
      locationId?: string;
    },
  ): Promise<PlatformUploadResult> {
    try {
      // Step 1: Create the media container
      const containerParams: Record<string, string> = {
        media_type: 'REELS',
        video_url: videoUrl,
        caption,
        access_token: this.accessToken,
      };

      if (options?.coverUrl) containerParams.cover_url = options.coverUrl;
      if (options?.shareToFeed !== undefined) {
        containerParams.share_to_feed = String(options.shareToFeed);
      }
      if (options?.locationId) containerParams.location_id = options.locationId;

      const containerRes = await this.request<{ id: string }>(
        `/${this.igUserId}/media`,
        'POST',
        containerParams,
      );

      if (!containerRes.id) {
        return { success: false, error: 'Failed to create media container' };
      }

      const containerId = containerRes.id;

      // Step 2: Poll until the container is ready
      const ready = await this.waitForContainer(containerId);
      if (!ready) {
        return { success: false, error: 'Container processing timed out or failed' };
      }

      // Step 3: Publish
      const publishRes = await this.request<{ id: string }>(
        `/${this.igUserId}/media_publish`,
        'POST',
        {
          creation_id: containerId,
          access_token: this.accessToken,
        },
      );

      if (!publishRes.id) {
        return { success: false, error: 'Failed to publish reel' };
      }

      return {
        success: true,
        platformId: publishRes.id,
        url: `https://www.instagram.com/reel/${publishRes.id}/`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[instagram] uploadReel failed: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * Poll a media container until it reaches FINISHED status.
   */
  private async waitForContainer(containerId: string): Promise<boolean> {
    for (let i = 0; i < CONTAINER_POLL_MAX_ATTEMPTS; i++) {
      const status = await this.request<ContainerStatusResponse>(
        `/${containerId}`,
        'GET',
        { fields: 'status_code', access_token: this.accessToken },
      );

      const code = status.status_code ?? status.status;

      if (code === 'FINISHED') return true;
      if (code === 'ERROR') {
        console.error(`[instagram] Container ${containerId} failed: ${JSON.stringify(status)}`);
        return false;
      }

      // IN_PROGRESS or other states — wait and retry
      await this.delay(CONTAINER_POLL_INTERVAL_MS);
    }

    console.error(`[instagram] Container ${containerId} timed out after ${CONTAINER_POLL_MAX_ATTEMPTS} polls`);
    return false;
  }

  // -----------------------------------------------------------------------
  // Insights / Analytics
  // -----------------------------------------------------------------------

  /**
   * Get insights for a specific media item (post/reel).
   */
  async getMediaInsights(
    mediaId: string,
  ): Promise<PlatformMetrics> {
    try {
      const data = await this.request<{
        data?: Array<{ name: string; values: Array<{ value: number }> }>;
      }>(
        `/${mediaId}/insights`,
        'GET',
        {
          metric: 'reach,impressions,likes,comments,shares,saved,plays',
          access_token: this.accessToken,
        },
      );

      const metrics: Record<string, number> = {};
      for (const item of data.data ?? []) {
        metrics[item.name] = item.values?.[0]?.value ?? 0;
      }

      const views = metrics.plays ?? metrics.impressions ?? 0;
      const total = views || 1;
      const engagementTotal = (metrics.likes ?? 0) + (metrics.comments ?? 0) + (metrics.shares ?? 0) + (metrics.saved ?? 0);
      const engagement = (engagementTotal / total) * 100;

      return {
        views,
        likes: metrics.likes ?? 0,
        comments: metrics.comments ?? 0,
        shares: metrics.shares ?? 0,
        engagement: Math.round(engagement * 100) / 100,
        reach: metrics.reach ?? 0,
        impressions: metrics.impressions ?? 0,
        saves: metrics.saved ?? 0,
      };
    } catch (err) {
      console.error(`[instagram] getMediaInsights failed: ${err}`);
      return { views: 0, likes: 0, comments: 0, shares: 0, engagement: 0 };
    }
  }

  /**
   * Get account-level insights.
   */
  async getAccountInsights(): Promise<PlatformAccountMetrics> {
    try {
      // Get basic account info
      const profile = await this.request<{
        followers_count?: number;
        media_count?: number;
      }>(
        `/${this.igUserId}`,
        'GET',
        {
          fields: 'followers_count,media_count',
          access_token: this.accessToken,
        },
      );

      // Get profile views (last 30 days)
      const insights = await this.request<{
        data?: Array<{ name: string; values: Array<{ value: number }> }>;
      }>(
        `/${this.igUserId}/insights`,
        'GET',
        {
          metric: 'profile_views,impressions,reach',
          period: 'day',
          since: String(Math.floor(Date.now() / 1000) - 30 * 86400),
          until: String(Math.floor(Date.now() / 1000)),
          access_token: this.accessToken,
        },
      );

      let profileViews = 0;
      for (const item of insights.data ?? []) {
        if (item.name === 'profile_views') {
          profileViews = item.values?.reduce((sum, v) => sum + (v.value ?? 0), 0) ?? 0;
        }
      }

      return {
        followers: profile.followers_count ?? 0,
        profileViews,
      };
    } catch (err) {
      console.error(`[instagram] getAccountInsights failed: ${err}`);
      return { followers: 0 };
    }
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private async request<T>(
    endpoint: string,
    method: 'GET' | 'POST',
    params?: Record<string, string>,
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      await this.rateLimit();

      try {
        let url = `${GRAPH_API_BASE}${endpoint}`;

        if (method === 'GET' && params) {
          const qs = new URLSearchParams(params);
          url += `?${qs.toString()}`;
        }

        const fetchOptions: RequestInit = { method };

        if (method === 'POST' && params) {
          fetchOptions.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
          fetchOptions.body = new URLSearchParams(params).toString();
        }

        const res = await fetch(url, fetchOptions);

        // Handle rate limiting
        if (res.status === 429) {
          const retryAfter = parseInt(res.headers.get('retry-after') ?? '60', 10);
          console.warn(`[instagram] Rate limited. Retrying after ${retryAfter}s`);
          await this.delay(retryAfter * 1000);
          continue;
        }

        const data = await res.json();

        if (data.error) {
          throw new Error(`Instagram API error (${data.error.code}): ${data.error.message}`);
        }

        return data as T;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.error(`[instagram] Attempt ${attempt + 1}/${MAX_RETRIES}: ${lastError.message}`);

        if (attempt < MAX_RETRIES - 1) {
          await this.delay(RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
        }
      }
    }

    throw lastError ?? new Error('Instagram request failed after all retries');
  }

  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < RATE_LIMIT_DELAY_MS) {
      await this.delay(RATE_LIMIT_DELAY_MS - elapsed);
    }
    this.lastRequestTime = Date.now();
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
