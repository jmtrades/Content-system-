// ============================================================================
// LinkedIn Share API Client (Video Upload & Analytics)
// ============================================================================

import fs from 'fs/promises';
import type { OAuthTokens, PlatformUploadResult, PlatformMetrics, PlatformAccountMetrics } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LinkedInConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  tokens?: OAuthTokens;
  personUrn?: string;
}

interface LinkedInUploadRegisterResponse {
  value?: {
    uploadMechanism?: {
      'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'?: {
        uploadUrl: string;
        headers: Record<string, string>;
      };
    };
    asset?: string;
    mediaArtifact?: string;
  };
}

interface LinkedInShareResponse {
  id?: string;
  activity?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = 'https://api.linkedin.com/v2';
const AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const RATE_LIMIT_DELAY_MS = 500;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2000;

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class LinkedInClient {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;
  private tokens: OAuthTokens | null;
  private personUrn: string;
  private lastRequestTime: number = 0;

  constructor(config?: Partial<LinkedInConfig>) {
    this.clientId = config?.clientId ?? process.env.LINKEDIN_CLIENT_ID ?? '';
    this.clientSecret = config?.clientSecret ?? process.env.LINKEDIN_CLIENT_SECRET ?? '';
    this.redirectUri = config?.redirectUri ?? process.env.LINKEDIN_REDIRECT_URI ?? '';
    this.tokens = config?.tokens ?? null;
    this.personUrn = config?.personUrn ?? process.env.LINKEDIN_PERSON_URN ?? '';
  }

  // -----------------------------------------------------------------------
  // Authentication
  // -----------------------------------------------------------------------

  /**
   * Generate the OAuth consent URL.
   */
  getAuthUrl(
    scopes: string[] = ['r_liteprofile', 'r_organization_social', 'w_member_social', 'w_organization_social'],
  ): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: scopes.join(' '),
      state: Math.random().toString(36).substring(2, 15),
    });

    return `${AUTH_URL}?${params.toString()}`;
  }

  /**
   * Exchange an authorization code for tokens.
   */
  async authenticate(code: string): Promise<OAuthTokens> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: this.redirectUri,
    });

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const data = await res.json();

    if (data.error) {
      throw new Error(`LinkedIn auth failed: ${data.error_description ?? data.error}`);
    }

    this.tokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
      tokenType: 'Bearer',
      scope: data.scope,
    };

    // Fetch the person URN if not already set
    if (!this.personUrn) {
      await this.fetchPersonUrn();
    }

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
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const data = await res.json();

    if (data.error) {
      throw new Error(`LinkedIn token refresh failed: ${data.error_description ?? data.error}`);
    }

    this.tokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? this.tokens.refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
      tokenType: 'Bearer',
    };

    return this.tokens;
  }

  /**
   * Set tokens directly (e.g. loaded from database).
   */
  setTokens(tokens: OAuthTokens): void {
    this.tokens = tokens;
  }

  /**
   * Set the person URN (urn:li:person:xxx).
   */
  setPersonUrn(urn: string): void {
    this.personUrn = urn;
  }

  // -----------------------------------------------------------------------
  // Video Upload
  // -----------------------------------------------------------------------

  /**
   * Upload a video and create a share post.
   *
   * LinkedIn video upload flow:
   *   1. Register the upload to get an upload URL and asset URN
   *   2. Upload the binary to the upload URL
   *   3. Create a share (UGC post) referencing the asset
   */
  async uploadVideo(
    videoPath: string,
    caption: string,
  ): Promise<PlatformUploadResult> {
    try {
      await this.ensureValidToken();

      const fileStat = await fs.stat(videoPath);
      const fileBuffer = await fs.readFile(videoPath);
      const owner = this.personUrn;

      if (!owner) {
        return { success: false, error: 'Person URN not set. Authenticate first.' };
      }

      // Step 1: Register the upload
      const registerBody = {
        registerUploadRequest: {
          owner,
          recipes: ['urn:li:digitalmediaRecipe:feedshare-video'],
          serviceRelationships: [
            {
              identifier: 'urn:li:userGeneratedContent',
              relationshipType: 'OWNER',
            },
          ],
          supportedUploadMechanism: ['SYNCHRONOUS_UPLOAD'],
        },
      };

      const registerRes = await this.request<LinkedInUploadRegisterResponse>(
        '/assets?action=registerUpload',
        'POST',
        registerBody,
      );

      const uploadInfo =
        registerRes.value?.uploadMechanism?.[
          'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'
        ];
      const asset = registerRes.value?.asset;

      if (!uploadInfo?.uploadUrl || !asset) {
        return { success: false, error: 'Failed to register upload with LinkedIn' };
      }

      // Step 2: Upload the video binary
      const uploadHeaders: Record<string, string> = {
        ...uploadInfo.headers,
        'Content-Type': 'application/octet-stream',
        Authorization: `Bearer ${this.tokens!.accessToken}`,
      };

      const uploadRes = await fetch(uploadInfo.uploadUrl, {
        method: 'PUT',
        headers: uploadHeaders,
        body: fileBuffer,
      });

      if (!uploadRes.ok) {
        const errBody = await uploadRes.text().catch(() => 'unknown');
        return { success: false, error: `Video upload failed (${uploadRes.status}): ${errBody}` };
      }

      // Step 3: Create the share post
      const shareBody = {
        author: owner,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: caption },
            shareMediaCategory: 'VIDEO',
            media: [
              {
                status: 'READY',
                media: asset,
                title: { text: caption.slice(0, 200) },
              },
            ],
          },
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
        },
      };

      const shareRes = await this.request<LinkedInShareResponse>(
        '/ugcPosts',
        'POST',
        shareBody,
      );

      return {
        success: true,
        platformId: shareRes.id ?? shareRes.activity,
        url: shareRes.activity
          ? `https://www.linkedin.com/feed/update/${shareRes.activity}`
          : undefined,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[linkedin] uploadVideo failed: ${message}`);
      return { success: false, error: message };
    }
  }

  // -----------------------------------------------------------------------
  // Analytics
  // -----------------------------------------------------------------------

  /**
   * Get metrics for a specific post.
   */
  async getPostMetrics(postUrn: string): Promise<PlatformMetrics> {
    try {
      await this.ensureValidToken();

      const encodedUrn = encodeURIComponent(postUrn);

      const data = await this.request<{
        elements?: Array<{
          totalShareStatistics?: {
            impressionCount?: number;
            clickCount?: number;
            likeCount?: number;
            commentCount?: number;
            shareCount?: number;
            engagement?: number;
          };
        }>;
      }>(
        `/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${encodedUrn}`,
        'GET',
      );

      // Also try the social actions endpoint for UGC posts
      const socialData = await this.request<{
        likes?: { paging?: { total?: number } };
        comments?: { paging?: { total?: number } };
      }>(`/socialActions/${encodedUrn}`, 'GET').catch(() => null);

      const stats = data.elements?.[0]?.totalShareStatistics;

      const likes = stats?.likeCount ?? socialData?.likes?.paging?.total ?? 0;
      const comments = stats?.commentCount ?? socialData?.comments?.paging?.total ?? 0;
      const shares = stats?.shareCount ?? 0;
      const impressions = stats?.impressionCount ?? 0;
      const clicks = stats?.clickCount ?? 0;
      const total = impressions || 1;
      const engagement = ((likes + comments + shares + clicks) / total) * 100;

      return {
        views: impressions,
        likes,
        comments,
        shares,
        engagement: Math.round(engagement * 100) / 100,
        impressions,
        clicks,
      };
    } catch (err) {
      console.error(`[linkedin] getPostMetrics failed: ${err}`);
      return { views: 0, likes: 0, comments: 0, shares: 0, engagement: 0 };
    }
  }

  /**
   * Get profile-level statistics.
   */
  async getProfileStats(): Promise<PlatformAccountMetrics> {
    try {
      await this.ensureValidToken();

      // Get basic profile info
      const profile = await this.request<{
        id?: string;
        vanityName?: string;
        localizedFirstName?: string;
        localizedLastName?: string;
      }>('/me', 'GET');

      // Get network size (connections = followers for personal profiles)
      const network = await this.request<{
        firstDegreeSize?: number;
      }>('/networkSizes/urn:li:person:' + (profile.id ?? ''), 'GET').catch(() => null);

      return {
        followers: network?.firstDegreeSize ?? 0,
        profileViews: undefined, // LinkedIn doesn't expose this via API for personal profiles
      };
    } catch (err) {
      console.error(`[linkedin] getProfileStats failed: ${err}`);
      return { followers: 0 };
    }
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private async fetchPersonUrn(): Promise<void> {
    try {
      const profile = await this.request<{ id?: string }>('/me', 'GET');
      if (profile.id) {
        this.personUrn = `urn:li:person:${profile.id}`;
      }
    } catch (err) {
      console.error(`[linkedin] Failed to fetch person URN: ${err}`);
    }
  }

  private async ensureValidToken(): Promise<void> {
    if (!this.tokens) {
      throw new Error('LinkedIn client not authenticated. Call authenticate() or setTokens() first.');
    }

    if (this.tokens.expiresAt && Date.now() > this.tokens.expiresAt - 60_000) {
      await this.refreshAccessToken();
    }
  }

  private async request<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT',
    body?: unknown,
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      await this.rateLimit();

      try {
        const url = `${API_BASE}${endpoint}`;
        const headers: Record<string, string> = {
          Authorization: `Bearer ${this.tokens?.accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
          'LinkedIn-Version': '202401',
        };

        const fetchOptions: RequestInit = { method, headers };

        if (body) {
          headers['Content-Type'] = 'application/json';
          fetchOptions.body = JSON.stringify(body);
        }

        const res = await fetch(url, fetchOptions);

        if (res.status === 429) {
          const retryAfter = parseInt(res.headers.get('retry-after') ?? '60', 10);
          console.warn(`[linkedin] Rate limited. Retrying after ${retryAfter}s`);
          await this.delay(retryAfter * 1000);
          continue;
        }

        if (!res.ok) {
          const errBody = await res.text().catch(() => 'unknown');
          throw new Error(`LinkedIn API ${res.status}: ${errBody}`);
        }

        // Some LinkedIn endpoints return 204 No Content
        if (res.status === 204) {
          return {} as T;
        }

        return (await res.json()) as T;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.error(`[linkedin] Attempt ${attempt + 1}/${MAX_RETRIES}: ${lastError.message}`);

        if (attempt < MAX_RETRIES - 1) {
          await this.delay(RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
        }
      }
    }

    throw lastError ?? new Error('LinkedIn request failed after all retries');
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
