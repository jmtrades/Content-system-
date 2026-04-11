// ============================================================================
// Twitter (X) API v2 Client — Tweets, Media Upload & Analytics
// ============================================================================

import fs from 'fs/promises';
import crypto from 'crypto';
import type { OAuthTokens, PlatformUploadResult, PlatformMetrics, PlatformAccountMetrics } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TwitterConfig {
  apiKey?: string;
  apiSecret?: string;
  bearerToken?: string;
  tokens?: OAuthTokens;
}

interface TwitterTweetResponse {
  data?: {
    id: string;
    text: string;
  };
  errors?: Array<{ message: string; title: string }>;
}

interface TwitterMediaUploadResponse {
  media_id_string?: string;
  processing_info?: {
    state: string;
    check_after_secs?: number;
    progress_percent?: number;
    error?: { message: string };
  };
  error?: string;
}

interface TwitterTweetMetrics {
  data?: {
    id: string;
    public_metrics?: {
      impression_count: number;
      like_count: number;
      reply_count: number;
      retweet_count: number;
      quote_count: number;
      bookmark_count: number;
    };
    non_public_metrics?: {
      impression_count: number;
      url_link_clicks: number;
      user_profile_clicks: number;
    };
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_V2_BASE = 'https://api.twitter.com/2';
const UPLOAD_BASE = 'https://upload.twitter.com/1.1';
const OAUTH2_TOKEN_URL = 'https://api.twitter.com/2/oauth2/token';
const RATE_LIMIT_DELAY_MS = 1000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2000;
const MEDIA_POLL_INTERVAL_MS = 5000;
const MEDIA_POLL_MAX_ATTEMPTS = 120; // 10 minutes max for video processing
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks for media upload

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class TwitterClient {
  private apiKey: string;
  private apiSecret: string;
  private bearerToken: string;
  private tokens: OAuthTokens | null;
  private lastRequestTime: number = 0;

  constructor(config?: Partial<TwitterConfig>) {
    this.apiKey = config?.apiKey ?? process.env.TWITTER_API_KEY ?? '';
    this.apiSecret = config?.apiSecret ?? process.env.TWITTER_API_SECRET ?? '';
    this.bearerToken = config?.bearerToken ?? process.env.TWITTER_BEARER_TOKEN ?? '';
    this.tokens = config?.tokens ?? null;
  }

  // -----------------------------------------------------------------------
  // Authentication (OAuth 2.0 with PKCE)
  // -----------------------------------------------------------------------

  /**
   * Generate the OAuth 2.0 authorization URL.
   */
  getAuthUrl(
    redirectUri: string,
    scopes: string[] = ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
    codeChallenge?: string,
  ): string {
    const state = Math.random().toString(36).substring(2, 15);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.apiKey,
      redirect_uri: redirectUri,
      scope: scopes.join(' '),
      state,
      code_challenge: codeChallenge ?? state,
      code_challenge_method: codeChallenge ? 'S256' : 'plain',
    });

    return `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
  }

  /**
   * Exchange an authorization code for tokens.
   */
  async authenticate(
    code: string,
    redirectUri: string,
    codeVerifier: string,
  ): Promise<OAuthTokens> {
    const body = new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      client_id: this.apiKey,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    });

    const res = await fetch(OAUTH2_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString('base64')}`,
      },
      body: body.toString(),
    });

    const data = await res.json();

    if (data.error) {
      throw new Error(`Twitter auth failed: ${data.error_description ?? data.error}`);
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
      grant_type: 'refresh_token',
      refresh_token: this.tokens.refreshToken,
      client_id: this.apiKey,
    });

    const res = await fetch(OAUTH2_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString('base64')}`,
      },
      body: body.toString(),
    });

    const data = await res.json();

    if (data.error) {
      throw new Error(`Twitter token refresh failed: ${data.error_description ?? data.error}`);
    }

    this.tokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? this.tokens.refreshToken,
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
  // Tweet / Post
  // -----------------------------------------------------------------------

  /**
   * Post a tweet, optionally attaching media.
   */
  async postTweet(
    text: string,
    mediaId?: string,
  ): Promise<PlatformUploadResult> {
    try {
      await this.ensureValidToken();

      const tweetBody: Record<string, unknown> = {
        text: text.slice(0, 280),
      };

      if (mediaId) {
        tweetBody.media = { media_ids: [mediaId] };
      }

      const data = await this.request<TwitterTweetResponse>(
        '/tweets',
        'POST',
        tweetBody,
      );

      if (data.errors?.length) {
        return {
          success: false,
          error: data.errors.map((e) => e.message).join('; '),
        };
      }

      return {
        success: true,
        platformId: data.data?.id,
        url: data.data?.id
          ? `https://twitter.com/i/status/${data.data.id}`
          : undefined,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[twitter] postTweet failed: ${message}`);
      return { success: false, error: message };
    }
  }

  // -----------------------------------------------------------------------
  // Media Upload (chunked upload for videos)
  // -----------------------------------------------------------------------

  /**
   * Upload a media file (image or video).
   *
   * Uses the chunked media upload flow:
   *   1. INIT — declare the upload
   *   2. APPEND — upload chunks
   *   3. FINALIZE — complete the upload
   *   4. STATUS — poll until processing is done (for videos)
   */
  async uploadMedia(
    filePath: string,
    mediaType: 'image' | 'video' = 'video',
  ): Promise<string> {
    await this.ensureValidToken();

    const fileBuffer = await fs.readFile(filePath);
    const fileStat = await fs.stat(filePath);
    const mimeType = mediaType === 'video' ? 'video/mp4' : 'image/jpeg';
    const mediaCategory = mediaType === 'video' ? 'tweet_video' : 'tweet_image';

    // Step 1: INIT
    const initParams = new URLSearchParams({
      command: 'INIT',
      total_bytes: String(fileStat.size),
      media_type: mimeType,
      media_category: mediaCategory,
    });

    const initRes = await this.uploadRequest<TwitterMediaUploadResponse>(
      `/media/upload.json?${initParams.toString()}`,
      'POST',
    );

    const mediaIdString = initRes.media_id_string;
    if (!mediaIdString) {
      throw new Error('Failed to initialize media upload: no media_id returned');
    }

    // Step 2: APPEND — upload in chunks
    const totalChunks = Math.ceil(fileBuffer.length / CHUNK_SIZE);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, fileBuffer.length);
      const chunk = fileBuffer.subarray(start, end);

      // Build multipart form data manually
      const boundary = `----FormBoundary${crypto.randomUUID().replace(/-/g, '')}`;
      const parts: Buffer[] = [];

      // command field
      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="command"\r\n\r\nAPPEND\r\n`,
      ));

      // media_id field
      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="media_id"\r\n\r\n${mediaIdString}\r\n`,
      ));

      // segment_index field
      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="segment_index"\r\n\r\n${i}\r\n`,
      ));

      // media_data field
      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="media_data"; filename="chunk"\r\nContent-Type: ${mimeType}\r\n\r\n`,
      ));
      parts.push(chunk);
      parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

      const body = Buffer.concat(parts);

      await fetch(`${UPLOAD_BASE}/media/upload.json`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.tokens!.accessToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });
    }

    // Step 3: FINALIZE
    const finalizeParams = new URLSearchParams({
      command: 'FINALIZE',
      media_id: mediaIdString,
    });

    const finalizeRes = await this.uploadRequest<TwitterMediaUploadResponse>(
      `/media/upload.json?${finalizeParams.toString()}`,
      'POST',
    );

    // Step 4: Poll for processing status (videos need processing)
    if (finalizeRes.processing_info) {
      await this.waitForMediaProcessing(mediaIdString);
    }

    return mediaIdString;
  }

  /**
   * Poll until media processing is complete.
   */
  private async waitForMediaProcessing(mediaId: string): Promise<void> {
    for (let i = 0; i < MEDIA_POLL_MAX_ATTEMPTS; i++) {
      const params = new URLSearchParams({
        command: 'STATUS',
        media_id: mediaId,
      });

      const status = await this.uploadRequest<TwitterMediaUploadResponse>(
        `/media/upload.json?${params.toString()}`,
        'GET',
      );

      const state = status.processing_info?.state;

      if (state === 'succeeded') return;
      if (state === 'failed') {
        throw new Error(
          `Media processing failed: ${status.processing_info?.error?.message ?? 'unknown error'}`,
        );
      }

      const waitSeconds = status.processing_info?.check_after_secs ?? 5;
      await this.delay(waitSeconds * 1000);
    }

    throw new Error('Media processing timed out');
  }

  // -----------------------------------------------------------------------
  // Analytics
  // -----------------------------------------------------------------------

  /**
   * Get metrics for a specific tweet.
   */
  async getTweetMetrics(tweetId: string): Promise<PlatformMetrics> {
    try {
      // Use bearer token or user token for read access
      const data = await this.request<TwitterTweetMetrics>(
        `/tweets/${tweetId}?tweet.fields=public_metrics,non_public_metrics`,
        'GET',
      );

      const pub = data.data?.public_metrics;
      const nonPub = data.data?.non_public_metrics;

      if (!pub) {
        return { views: 0, likes: 0, comments: 0, shares: 0, engagement: 0 };
      }

      const views = pub.impression_count ?? nonPub?.impression_count ?? 0;
      const likes = pub.like_count ?? 0;
      const comments = pub.reply_count ?? 0;
      const shares = (pub.retweet_count ?? 0) + (pub.quote_count ?? 0);
      const total = views || 1;
      const engagement = ((likes + comments + shares) / total) * 100;

      return {
        views,
        likes,
        comments,
        shares,
        engagement: Math.round(engagement * 100) / 100,
        retweets: pub.retweet_count ?? 0,
        quotes: pub.quote_count ?? 0,
        bookmarks: pub.bookmark_count ?? 0,
      };
    } catch (err) {
      console.error(`[twitter] getTweetMetrics failed: ${err}`);
      return { views: 0, likes: 0, comments: 0, shares: 0, engagement: 0 };
    }
  }

  /**
   * Get account-level metrics.
   */
  async getAccountMetrics(): Promise<PlatformAccountMetrics> {
    try {
      await this.ensureValidToken();

      const data = await this.request<{
        data?: {
          id: string;
          public_metrics?: {
            followers_count: number;
            following_count: number;
            tweet_count: number;
            listed_count: number;
          };
        };
      }>('/users/me?user.fields=public_metrics', 'GET');

      const metrics = data.data?.public_metrics;

      return {
        followers: metrics?.followers_count ?? 0,
        totalLikes: undefined,
        totalViews: undefined,
        profileViews: undefined,
      };
    } catch (err) {
      console.error(`[twitter] getAccountMetrics failed: ${err}`);
      return { followers: 0 };
    }
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private async ensureValidToken(): Promise<void> {
    if (!this.tokens) {
      throw new Error('Twitter client not authenticated. Call authenticate() or setTokens() first.');
    }

    if (this.tokens.expiresAt && Date.now() > this.tokens.expiresAt - 60_000) {
      await this.refreshAccessToken();
    }
  }

  private getAuthHeader(): string {
    if (this.tokens?.accessToken) {
      return `Bearer ${this.tokens.accessToken}`;
    }
    if (this.bearerToken) {
      return `Bearer ${this.bearerToken}`;
    }
    throw new Error('No authentication available');
  }

  private async request<T>(
    endpoint: string,
    method: 'GET' | 'POST',
    body?: unknown,
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      await this.rateLimit();

      try {
        const url = `${API_V2_BASE}${endpoint}`;
        const headers: Record<string, string> = {
          Authorization: this.getAuthHeader(),
        };

        const fetchOptions: RequestInit = { method, headers };

        if (body) {
          headers['Content-Type'] = 'application/json';
          fetchOptions.body = JSON.stringify(body);
        }

        const res = await fetch(url, fetchOptions);

        if (res.status === 429) {
          const resetTime = res.headers.get('x-rate-limit-reset');
          const waitMs = resetTime
            ? Math.max(0, parseInt(resetTime, 10) * 1000 - Date.now()) + 1000
            : 60_000;
          console.warn(`[twitter] Rate limited. Waiting ${Math.round(waitMs / 1000)}s`);
          await this.delay(Math.min(waitMs, 300_000)); // Cap at 5 minutes
          continue;
        }

        if (!res.ok) {
          const errBody = await res.text().catch(() => 'unknown');
          throw new Error(`Twitter API ${res.status}: ${errBody}`);
        }

        return (await res.json()) as T;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.error(`[twitter] Attempt ${attempt + 1}/${MAX_RETRIES}: ${lastError.message}`);

        if (attempt < MAX_RETRIES - 1) {
          await this.delay(RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
        }
      }
    }

    throw lastError ?? new Error('Twitter request failed after all retries');
  }

  private async uploadRequest<T>(endpoint: string, method: 'GET' | 'POST'): Promise<T> {
    await this.rateLimit();

    const url = `${UPLOAD_BASE}${endpoint}`;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.tokens?.accessToken}`,
      },
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => 'unknown');
      throw new Error(`Twitter Upload API ${res.status}: ${errBody}`);
    }

    return (await res.json()) as T;
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
