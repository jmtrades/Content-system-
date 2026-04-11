// ============================================================================
// Shared Platform Client Types
// ============================================================================

/**
 * OAuth tokens stored and managed by each platform client.
 */
export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType?: string;
  scope?: string;
}

/**
 * Result of a video/media upload operation.
 */
export interface PlatformUploadResult {
  success: boolean;
  platformId?: string;
  url?: string;
  error?: string;
}

/**
 * Post / video-level metrics.
 */
export interface PlatformMetrics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  engagement: number;
  [key: string]: number;
}

/**
 * Account-level metrics.
 */
export interface PlatformAccountMetrics {
  followers: number;
  profileViews?: number;
  totalViews?: number;
  totalLikes?: number;
  [key: string]: number | undefined;
}
