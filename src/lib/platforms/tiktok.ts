// ============================================================================
// TikTok Content Posting API Client
// ============================================================================

import fs from 'fs/promises';
import type { OAuthTokens, PlatformUploadResult, PlatformMetrics, PlatformAccountMetrics } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TikTokConfig {
  clientKey: string;
  clientSecret: string;
  redirectUri: string;
  tokens?: OAuthTokens;
}

interface TikTokVideoMetrics {
  view_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
}

interface TikTokUploadInitResponse {
  data?: {
    publish_id: string;
    upload_url: string;
  };
  error?: { code: string; message: string };
}

// Re-export shared platform types used by this module
export type { OAuthTokens, PlatformUploadResult, PlatformMetrics, PlatformAccountMetrics };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = 'https://open.tiktokapis.com/v2';
const AUTH_BASE = 'https://www.tiktok.com/v2/auth/authorize';
const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';

const RATE_LIMIT_DELAY_MS = 1000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2000;

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class TikTokClient {
  private clientKey: string;
  private clientSecret: string;
  private redirectUri: string;
  private tokens: OAuthTokens | null;
  private lastRequestTime: number = 0;

  constructor(config?: Partial<TikTokConfig>) {
    this.clientKey = config?.clientKey ?? process.env.TIKTOK_CLIENT_KEY ?? '';
    this.clientSecret = config?.clientSecret ?? process.env.TIKTOK_CLIENT_SECRET ?? '';
    this.redirectUri = config?.redirectUri ?? process.env.TIKTOK_REDIRECT_URI ?? '';
    this.tokens = config?.tokens ?? null;
  }

  // -----------------------------------------------------------------------
  // Authentication
  // -----------------------------------------------------------------------

  /**
   * Returns the OAuth authorization URL to redirect the user to.
   */
  getAuthUrl(scopes: string[] = ['user.info.basic', 'video.publish', 'video.list']): string {
    const params = new URLSearchParams({
      client_key: this.clientKey,
      response_type: 'code',
      scope: scopes.join(','),
      redirect_uri: this.redirectUri,
      state: this.generateState(),
    });

    return `${AUTH_BASE}/?${params.toString()}`;
  }

  /**
   * Exchange an authorization code for access + refresh tokens.
   */
  async authenticate(code: string): Promise<OAuthTokens> {
    const body = new URLSearchParams({
      client_key: this.clientKey,
      client_secret: this.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: this.redirectUri,
    });

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      throw new Error(`TikTok auth failed: ${data.error_description ?? data.error ?? res.statusText}`);
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
   * Refresh the access token using the refresh token.
   */
  async refreshAccessToken(): Promise<OAuthTokens> {
    if (!this.tokens?.refreshToken) {
      throw new Error('No refresh token available. Re-authenticate.');
    }

    const body = new URLSearchParams({
      client_key: this.clientKey,
      client_secret: this.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: this.tokens.refreshToken,
    });

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      throw new Error(`TikTok token refresh failed: ${data.error_description ?? data.error}`);
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
   * Set tokens directly (e.g. loaded from database).
   */
  setTokens(tokens: OAuthTokens): void {
    this.tokens = tokens;
  }

  // -----------------------------------------------------------------------
  // Video Upload
  // -----------------------------------------------------------------------

  /**
   * Upload a video to TikTok.
   *
   * Uses the TikTok Content Posting API v2 flow:
   *   1. Initialize the upload (POST /post/publish/inbox/video/init/)
   *   2. Upload the file to the returned upload URL
   *   3. Return the publish_id for tracking
   */
  async uploadVideo(
    videoPath: string,
    caption: string,
    hashtags: string[] = [],
  ): Promise<PlatformUploadResult> {
    try {
      await this.ensureValidToken();

      const fileStat = await fs.stat(videoPath);
      const fileBuffer = await fs.readFile(videoPath);

      const fullCaption = hashtags.length > 0
        ? `${caption} ${hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}`
        : caption;

      // Step 1: Initialise the upload
      const initRes = await this.request<TikTokUploadInitResponse>(
        '/post/publish/inbox/video/init/',
        'POST',
        {
          source_info: {
            source: 'FILE_UPLOAD',
            video_size: fileStat.size,
            chunk_size: fileStat.size,
            total_chunk_count: 1,
          },
          post_info: {
            title: fullCaption.slice(0, 2200),
            privacy_level: 'SELF_ONLY', // start with self-only; promote after review
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
          },
        },
      );

      if (initRes.error || !initRes.data) {
        return {
          success: false,
          error: initRes.error?.message ?? 'Upload init failed',
        };
      }

      const { publish_id, upload_url } = initRes.data;

      // Step 2: Upload the video binary
      const uploadRes = await fetch(upload_url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Range': `bytes 0-${fileStat.size - 1}/${fileStat.size}`,
        },
        body: fileBuffer,
      });

      if (!uploadRes.ok) {
        return {
          success: false,
          error: `Video upload failed: ${uploadRes.status} ${uploadRes.statusText}`,
        };
      }

      return {
        success: true,
        platformId: publish_id,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[tiktok] uploadVideo failed: ${message}`);
      return { success: false, error: message };
    }
  }

  // -----------------------------------------------------------------------
  // Analytics
  // -----------------------------------------------------------------------

  /**
   * Get metrics for a specific video.
   */
  async getVideoMetrics(videoId: string): Promise<PlatformMetrics> {
    await this.ensureValidToken();

    const data = await this.request<{
      data?: { videos?: TikTokVideoMetrics[] };
    }>('/video/query/', 'POST', {
      filters: { video_ids: [videoId] },
      fields: ['view_count', 'like_count', 'comment_count', 'share_count'],
    });

    const video = data.data?.videos?.[0];
    if (!video) {
      return { views: 0, likes: 0, comments: 0, shares: 0, engagement: 0 };
    }

    const total = video.view_count || 1;
    const engagement =
      ((video.like_count + video.comment_count + video.share_count) / total) * 100;

    return {
      views: video.view_count,
      likes: video.like_count,
      comments: video.comment_count,
      shares: video.share_count,
      engagement: Math.round(engagement * 100) / 100,
    };
  }

  /**
   * Get account-level metrics.
   */
  async getAccountMetrics(): Promise<PlatformAccountMetrics> {
    await this.ensureValidToken();

    const data = await this.request<{
      data?: {
        user?: {
          follower_count?: number;
          following_count?: number;
          likes_count?: number;
          video_count?: number;
        };
      };
    }>('/user/info/', 'GET', undefined, {
      fields: 'follower_count,following_count,likes_count,video_count',
    });

    const user = data.data?.user;

    return {
      followers: user?.follower_count ?? 0,
      totalLikes: user?.likes_count ?? 0,
      totalViews: undefined,
      profileViews: undefined,
    };
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private async ensureValidToken(): Promise<void> {
    if (!this.tokens) {
      throw new Error('TikTok client not authenticated. Call authenticate() first.');
    }

    if (this.tokens.expiresAt && Date.now() > this.tokens.expiresAt - 60_000) {
      await this.refreshAccessToken();
    }
  }

  private async request<T>(
    endpoint: string,
    method: 'GET' | 'POST',
    body?: unknown,
    queryParams?: Record<string, string>,
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      await this.rateLimit();

      try {
        let url = `${API_BASE}${endpoint}`;
        if (queryParams) {
          const params = new URLSearchParams(queryParams);
          url += `?${params.toString()}`;
        }

        const headers: Record<string, string> = {
          Authorization: `Bearer ${this.tokens?.accessToken}`,
        };

        const fetchOptions: RequestInit = { method, headers };

        if (body) {
          headers['Content-Type'] = 'application/json';
          fetchOptions.body = JSON.stringify(body);
        }

        const res = await fetch(url, fetchOptions);

        // Handle rate limiting
        if (res.status === 429) {
          const retryAfter = parseInt(res.headers.get('retry-after') ?? '5', 10);
          console.warn(`[tiktok] Rate limited. Retrying after ${retryAfter}s`);
          await this.delay(retryAfter * 1000);
          continue;
        }

        if (!res.ok) {
          const errBody = await res.text().catch(() => 'unknown');
          throw new Error(`TikTok API ${res.status}: ${errBody}`);
        }

        return (await res.json()) as T;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.error(`[tiktok] Attempt ${attempt + 1}/${MAX_RETRIES}: ${lastError.message}`);

        if (attempt < MAX_RETRIES - 1) {
          await this.delay(RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
        }
      }
    }

    throw lastError ?? new Error('TikTok request failed after all retries');
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

  private generateState(): string {
    return Math.random().toString(36).substring(2, 15);
  }
}
