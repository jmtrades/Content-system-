// ============================================================================
// YouTube Data API v3 Client (Shorts Upload & Analytics)
// ============================================================================

import fs from 'fs/promises';
import type { OAuthTokens, PlatformUploadResult, PlatformMetrics, PlatformAccountMetrics } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface YouTubeConfig {
  apiKey?: string;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  tokens?: OAuthTokens;
}

interface YouTubeVideoSnippet {
  title: string;
  description: string;
  tags?: string[];
  categoryId?: string;
}

interface YouTubeVideoStatus {
  privacyStatus: 'public' | 'unlisted' | 'private';
  selfDeclaredMadeForKids?: boolean;
  embeddable?: boolean;
}

interface YouTubeVideoResource {
  id?: string;
  snippet?: YouTubeVideoSnippet;
  status?: YouTubeVideoStatus;
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
    favoriteCount?: string;
  };
}

interface YouTubeListResponse<T> {
  items?: T[];
  pageInfo?: { totalResults: number; resultsPerPage: number };
  error?: { code: number; message: string; errors: Array<{ reason: string }> };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = 'https://www.googleapis.com/youtube/v3';
const UPLOAD_BASE = 'https://www.googleapis.com/upload/youtube/v3';
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ANALYTICS_API_BASE = 'https://youtubeanalytics.googleapis.com/v2';
const RATE_LIMIT_DELAY_MS = 500;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2000;

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class YouTubeClient {
  private apiKey: string;
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;
  private tokens: OAuthTokens | null;
  private lastRequestTime: number = 0;

  constructor(config?: Partial<YouTubeConfig>) {
    this.apiKey = config?.apiKey ?? process.env.YOUTUBE_API_KEY ?? '';
    this.clientId = config?.clientId ?? process.env.YOUTUBE_CLIENT_ID ?? '';
    this.clientSecret = config?.clientSecret ?? process.env.YOUTUBE_CLIENT_SECRET ?? '';
    this.redirectUri = config?.redirectUri ?? process.env.YOUTUBE_REDIRECT_URI ?? '';
    this.tokens = config?.tokens ?? null;
  }

  // -----------------------------------------------------------------------
  // Authentication
  // -----------------------------------------------------------------------

  /**
   * Generate the OAuth consent URL.
   */
  getAuthUrl(
    scopes: string[] = [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/yt-analytics.readonly',
    ],
  ): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: scopes.join(' '),
      access_type: 'offline',
      prompt: 'consent',
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Exchange an authorization code for tokens.
   */
  async authenticate(code: string): Promise<OAuthTokens> {
    const body = new URLSearchParams({
      code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: this.redirectUri,
      grant_type: 'authorization_code',
    });

    const res = await fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const data = await res.json();

    if (data.error) {
      throw new Error(`YouTube auth failed: ${data.error_description ?? data.error}`);
    }

    this.tokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
      tokenType: data.token_type ?? 'Bearer',
      scope: data.scope,
    };

    return this.tokens;
  }

  /**
   * Refresh the access token.
   */
  async refreshAccessToken(): Promise<OAuthTokens> {
    if (!this.tokens?.refreshToken) {
      throw new Error('No refresh token available. Re-authenticate.');
    }

    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: this.tokens.refreshToken,
      grant_type: 'refresh_token',
    });

    const res = await fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const data = await res.json();

    if (data.error) {
      throw new Error(`YouTube token refresh failed: ${data.error_description ?? data.error}`);
    }

    this.tokens = {
      accessToken: data.access_token,
      refreshToken: this.tokens.refreshToken, // Google doesn't always return a new refresh token
      expiresAt: Date.now() + data.expires_in * 1000,
      tokenType: data.token_type ?? 'Bearer',
      scope: data.scope,
    };

    return this.tokens;
  }

  /**
   * Set tokens directly (e.g. loaded from database).
   */
  setTokens(tokens: OAuthTokens): void {
    this.tokens = tokens;
  }

  // -----------------------------------------------------------------------
  // Video Upload
  // -----------------------------------------------------------------------

  /**
   * Upload a YouTube Short.
   *
   * Shorts are regular video uploads with #Shorts in the title/description
   * and a vertical aspect ratio (9:16) under 60 seconds.
   */
  async uploadShort(
    videoPath: string,
    title: string,
    description: string,
    tags: string[] = [],
  ): Promise<PlatformUploadResult> {
    try {
      await this.ensureValidToken();

      const fileBuffer = await fs.readFile(videoPath);
      const fileStat = await fs.stat(videoPath);

      // Ensure #Shorts is in the title for YouTube to treat it as a Short
      const shortTitle = title.includes('#Shorts') ? title : `${title} #Shorts`;

      const metadata = {
        snippet: {
          title: shortTitle.slice(0, 100),
          description: description.slice(0, 5000),
          tags: tags.slice(0, 500),
          categoryId: '28', // Science & Technology
        },
        status: {
          privacyStatus: 'public' as const,
          selfDeclaredMadeForKids: false,
          embeddable: true,
        },
      };

      // Resumable upload — Step 1: Initiate
      const initRes = await fetch(
        `${UPLOAD_BASE}/videos?uploadType=resumable&part=snippet,status`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.tokens!.accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
            'X-Upload-Content-Length': String(fileStat.size),
            'X-Upload-Content-Type': 'video/mp4',
          },
          body: JSON.stringify(metadata),
        },
      );

      if (!initRes.ok) {
        const errBody = await initRes.text().catch(() => 'unknown');
        return { success: false, error: `Upload init failed (${initRes.status}): ${errBody}` };
      }

      const uploadUrl = initRes.headers.get('location');
      if (!uploadUrl) {
        return { success: false, error: 'No upload URL returned from YouTube' };
      }

      // Step 2: Upload the video binary
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Length': String(fileStat.size),
        },
        body: fileBuffer,
      });

      if (!uploadRes.ok) {
        const errBody = await uploadRes.text().catch(() => 'unknown');
        return { success: false, error: `Video upload failed (${uploadRes.status}): ${errBody}` };
      }

      const result = (await uploadRes.json()) as YouTubeVideoResource;

      return {
        success: true,
        platformId: result.id,
        url: result.id ? `https://youtube.com/shorts/${result.id}` : undefined,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[youtube] uploadShort failed: ${message}`);
      return { success: false, error: message };
    }
  }

  // -----------------------------------------------------------------------
  // Analytics
  // -----------------------------------------------------------------------

  /**
   * Get metrics for a specific video.
   * Uses the API key for unauthenticated read access.
   */
  async getVideoAnalytics(videoId: string): Promise<PlatformMetrics & { watchTime?: number }> {
    try {
      const data = await this.apiRequest<YouTubeListResponse<YouTubeVideoResource>>(
        '/videos',
        {
          part: 'statistics',
          id: videoId,
        },
      );

      const stats = data.items?.[0]?.statistics;
      if (!stats) {
        return { views: 0, likes: 0, comments: 0, shares: 0, engagement: 0 };
      }

      const views = parseInt(stats.viewCount ?? '0', 10);
      const likes = parseInt(stats.likeCount ?? '0', 10);
      const comments = parseInt(stats.commentCount ?? '0', 10);
      const total = views || 1;
      const engagement = ((likes + comments) / total) * 100;

      // Try to get watch time from YouTube Analytics API
      let watchTime = 0;
      try {
        await this.ensureValidToken();
        const analyticsData = await this.authenticatedRequest<{
          rows?: Array<[string, number]>;
        }>(
          `${ANALYTICS_API_BASE}/reports`,
          {
            ids: 'channel==MINE',
            startDate: '2020-01-01',
            endDate: new Date().toISOString().split('T')[0],
            metrics: 'estimatedMinutesWatched',
            filters: `video==${videoId}`,
          },
        );
        watchTime = analyticsData.rows?.[0]?.[1] ?? 0;
      } catch {
        // Watch time requires OAuth — silently ignore if unavailable
      }

      return {
        views,
        likes,
        comments,
        shares: 0, // YouTube API doesn't expose share count
        engagement: Math.round(engagement * 100) / 100,
        watchTime,
      };
    } catch (err) {
      console.error(`[youtube] getVideoAnalytics failed: ${err}`);
      return { views: 0, likes: 0, comments: 0, shares: 0, engagement: 0 };
    }
  }

  /**
   * Get channel-level statistics.
   */
  async getChannelStats(): Promise<PlatformAccountMetrics> {
    try {
      // Try with OAuth first (channel==mine), fall back to API key
      let channelData: YouTubeListResponse<{
        statistics?: {
          subscriberCount?: string;
          viewCount?: string;
          videoCount?: string;
        };
      }>;

      if (this.tokens) {
        await this.ensureValidToken();
        channelData = await this.authenticatedRequest(
          `${API_BASE}/channels`,
          { part: 'statistics', mine: 'true' },
        );
      } else {
        // Need a channel ID for API-key-only access
        throw new Error('OAuth tokens required for channel stats');
      }

      const stats = channelData.items?.[0]?.statistics;

      return {
        followers: parseInt(stats?.subscriberCount ?? '0', 10),
        totalViews: parseInt(stats?.viewCount ?? '0', 10),
      };
    } catch (err) {
      console.error(`[youtube] getChannelStats failed: ${err}`);
      return { followers: 0 };
    }
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private async ensureValidToken(): Promise<void> {
    if (!this.tokens) {
      throw new Error('YouTube client not authenticated. Call authenticate() or setTokens() first.');
    }

    if (this.tokens.expiresAt && Date.now() > this.tokens.expiresAt - 60_000) {
      await this.refreshAccessToken();
    }
  }

  /**
   * Public API request using API key (no OAuth needed).
   */
  private async apiRequest<T>(endpoint: string, params: Record<string, string>): Promise<T> {
    const allParams = { ...params, key: this.apiKey };
    return this.doRequest<T>(`${API_BASE}${endpoint}`, allParams);
  }

  /**
   * Authenticated request using OAuth bearer token.
   */
  private async authenticatedRequest<T>(url: string, params: Record<string, string>): Promise<T> {
    return this.doRequest<T>(url, params, this.tokens?.accessToken);
  }

  private async doRequest<T>(
    baseUrl: string,
    params: Record<string, string>,
    bearerToken?: string,
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      await this.rateLimit();

      try {
        const qs = new URLSearchParams(params);
        const url = `${baseUrl}?${qs.toString()}`;
        const headers: Record<string, string> = {};

        if (bearerToken) {
          headers.Authorization = `Bearer ${bearerToken}`;
        }

        const res = await fetch(url, { method: 'GET', headers });

        if (res.status === 429) {
          const retryAfter = parseInt(res.headers.get('retry-after') ?? '10', 10);
          console.warn(`[youtube] Rate limited. Retrying after ${retryAfter}s`);
          await this.delay(retryAfter * 1000);
          continue;
        }

        if (res.status === 403) {
          const body = await res.json().catch(() => ({}));
          const reason = (body as YouTubeListResponse<unknown>).error?.errors?.[0]?.reason;
          if (reason === 'quotaExceeded') {
            throw new Error('YouTube API quota exceeded. Try again tomorrow.');
          }
        }

        if (!res.ok) {
          const errBody = await res.text().catch(() => 'unknown');
          throw new Error(`YouTube API ${res.status}: ${errBody}`);
        }

        return (await res.json()) as T;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.error(`[youtube] Attempt ${attempt + 1}/${MAX_RETRIES}: ${lastError.message}`);

        if (attempt < MAX_RETRIES - 1) {
          await this.delay(RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
        }
      }
    }

    throw lastError ?? new Error('YouTube request failed after all retries');
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
