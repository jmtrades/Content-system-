// ============================================================================
// The Operator's Content Empire - Type Definitions
// ============================================================================

// ---------------------------------------------------------------------------
// Platform & Source Enums / Unions
// ---------------------------------------------------------------------------

export type Platform = 'tiktok' | 'reels' | 'youtube_shorts' | 'linkedin' | 'twitter';

export type Source =
  | 'rss'
  | 'reddit'
  | 'hackernews'
  | 'arxiv'
  | 'twitter'
  | 'newsletter'
  | 'blog'
  | 'youtube'
  | 'podcast'
  | 'github'
  | 'producthunt'
  | 'competitor'
  | 'manual';

export type RadarItemCategory =
  | 'product_launch'
  | 'research_paper'
  | 'funding'
  | 'open_source'
  | 'regulation'
  | 'tutorial'
  | 'opinion'
  | 'industry_news'
  | 'tool_update'
  | 'drama'
  | 'breakthrough'
  | 'hiring'
  | 'acquisition';

export type VideoStatus =
  | 'idea'
  | 'scripted'
  | 'recording'
  | 'editing'
  | 'rendering'
  | 'review'
  | 'approved'
  | 'scheduled'
  | 'posted'
  | 'archived';

export type VideoJobStatus =
  | 'queued'
  | 'downloading'
  | 'processing'
  | 'rendering'
  | 'uploading'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type VideoOutputStatus =
  | 'rendering'
  | 'ready'
  | 'uploaded'
  | 'failed'
  | 'deleted';

export type PostingStatus =
  | 'draft'
  | 'scheduled'
  | 'posting'
  | 'posted'
  | 'failed'
  | 'cancelled'
  | 'deleted';

export type PostType =
  | 'short_video'
  | 'long_video'
  | 'carousel'
  | 'static_image'
  | 'story'
  | 'text'
  | 'thread'
  | 'live';

export type CTAType =
  | 'follow'
  | 'comment'
  | 'share'
  | 'link_in_bio'
  | 'dm_keyword'
  | 'product_link'
  | 'newsletter'
  | 'free_resource'
  | 'paid_product'
  | 'affiliate'
  | 'none';

export type GapType =
  | 'topic_gap'
  | 'format_gap'
  | 'posting_time_gap'
  | 'audience_gap'
  | 'monetization_gap'
  | 'engagement_gap'
  | 'platform_gap';

export type ContentPillarName =
  | 'ai_news'
  | 'ai_tutorials'
  | 'ai_tools'
  | 'ai_opinions'
  | 'ai_money'
  | 'ai_career'
  | 'ai_drama';

export type Sentiment = 'positive' | 'negative' | 'neutral' | 'question' | 'complaint';

export type DMStatus = 'open' | 'replied' | 'closed' | 'escalated' | 'spam';

export type MilestoneType =
  | 'follower_count'
  | 'total_views'
  | 'total_likes'
  | 'monthly_revenue'
  | 'post_count'
  | 'viral_post';

export type ProductType =
  | 'digital_product'
  | 'course'
  | 'membership'
  | 'coaching'
  | 'affiliate'
  | 'sponsorship'
  | 'saas';

export type RevenueType =
  | 'one_time'
  | 'recurring'
  | 'affiliate_commission'
  | 'sponsorship'
  | 'tip'
  | 'ad_revenue'
  | 'refund';

export type CommissionType = 'percentage' | 'flat';

export type RevenueTargetPeriod = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export type CompetitorTier = 'mega' | 'macro' | 'mid' | 'micro' | 'nano';

export type AspectRatio = '9:16' | '16:9' | '1:1' | '4:5';

export type RecommendedAction =
  | 'create_immediately'
  | 'prepare_script'
  | 'monitor'
  | 'ignore'
  | 'newsjack';

// ---------------------------------------------------------------------------
// Content Radar
// ---------------------------------------------------------------------------

export interface RadarItem {
  id: string;
  source: Source;
  source_url: string;
  title: string;
  summary: string;
  category: RadarItemCategory;
  importance_score: number;
  trending_velocity: number;
  first_seen_at: string;
  raw_data: Record<string, unknown>;
  processed: boolean;
  posted: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Competitor Intelligence
// ---------------------------------------------------------------------------

export interface CompetitorPost {
  id: string;
  competitor_handle: string;
  platform: Platform;
  post_url: string;
  post_type: PostType;
  caption: string;
  hashtags: string[];
  posted_at: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  engagement_rate: number;
  topic_category: string;
  hook_text: string;
  cta_type: CTAType;
  monetization_detected: boolean;
  product_mentioned: string | null;
  scraped_at: string;
  raw_data: Record<string, unknown>;
}

export interface CompetitorAnalytics {
  id: string;
  competitor_handle: string;
  platform: Platform;
  date: string;
  follower_count: number;
  follower_growth: number;
  avg_engagement_rate: number;
  top_post_url: string;
  top_post_views: number;
  posting_frequency: number;
}

export interface CompetitorGap {
  id: string;
  gap_type: GapType;
  description: string;
  opportunity_score: number;
  detected_at: string;
  actioned: boolean;
}

// ---------------------------------------------------------------------------
// Video Scripting
// ---------------------------------------------------------------------------

export interface PlatformScript {
  hook: string;
  body: string;
  cta: string;
  caption: string;
  hashtags: string[];
  aspect_ratio: AspectRatio;
  max_duration: number;
  text_overlay_suggestions: TextOverlay[];
}

export interface VideoScript {
  id: string;
  radar_item_id: string | null;
  gap_id: string | null;
  topic: string;
  hook: string;
  hook_variants: string[];
  body: string;
  cta: string;
  cta_type: CTAType;
  caption: string;
  caption_variants: string[];
  hashtags: string[];
  platform_versions: Record<Platform, PlatformScript>;
  estimated_duration: number;
  content_pillar: ContentPillarName;
  monetization_hook: string | null;
  trending_sound_suggestion: string | null;
  status: VideoStatus;
  performance_score: number | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Video Processing
// ---------------------------------------------------------------------------

export interface VariationConfig {
  hook_variant: number;
  caption_style: string;
  music_track: string;
  color_grade: string;
  text_position: string;
  speed_adjustment: number;
}

export interface VideoJob {
  id: string;
  script_id: string;
  input_path: string;
  status: VideoJobStatus;
  processing_started_at: string | null;
  processing_completed_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface VideoOutput {
  id: string;
  job_id: string;
  platform: Platform;
  variant_number: number;
  output_path: string;
  thumbnail_path: string;
  caption_path: string;
  duration_seconds: number;
  file_size_bytes: number;
  variation_config: VariationConfig;
  status: VideoOutputStatus;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Posting & Scheduling
// ---------------------------------------------------------------------------

export interface PostingQueueItem {
  id: string;
  video_output_id: string;
  platform: Platform;
  caption: string;
  hashtags: string[];
  scheduled_at: string;
  posted_at: string | null;
  post_url: string | null;
  post_id: string | null;
  status: PostingStatus;
  retry_count: number;
  error_message: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Analytics & Performance
// ---------------------------------------------------------------------------

export interface PostAnalytics {
  id: string;
  posting_queue_id: string;
  platform: Platform;
  post_url: string;
  measured_at: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  watch_time_seconds: number;
  avg_watch_percentage: number;
  reach: number;
  impressions: number;
  follower_count: number;
  follower_change: number;
  profile_visits: number;
  link_clicks: number;
  dm_opens: number;
  bio_link_clicks: number;
  engagement_rate: number;
  virality_score: number;
  save_rate: number;
  conversion_rate: number;
}

export interface DailyAnalytics {
  id: string;
  platform: Platform;
  date: string;
  total_views: number;
  total_likes: number;
  total_comments: number;
  total_shares: number;
  total_saves: number;
  follower_count: number;
  follower_growth: number;
  top_post_id: string | null;
  worst_post_id: string | null;
  avg_engagement_rate: number;
  revenue_attributed: number;
  posts_published: number;
}

export interface GrowthMilestone {
  id: string;
  platform: Platform;
  milestone_type: MilestoneType;
  milestone_value: number;
  reached_at: string;
  days_from_start: number;
  posts_published: number;
  total_views_at_milestone: number;
}

export interface GrowthVelocity {
  id: string;
  platform: Platform;
  date: string;
  follower_count: number;
  daily_growth: number;
  growth_rate: number;
  projected_100k_date: string | null;
  projected_revenue_monthly: number;
}

// ---------------------------------------------------------------------------
// Monetization
// ---------------------------------------------------------------------------

export interface Product {
  id: string;
  name: string;
  slug: string;
  price: number;
  type: ProductType;
  stripe_price_id: string;
  landing_page_url: string;
  active: boolean;
  created_at: string;
}

export interface RevenueEvent {
  id: string;
  product_id: string;
  amount: number;
  currency: string;
  type: RevenueType;
  source_platform: Platform | null;
  source_post_id: string | null;
  customer_email: string;
  stripe_payment_id: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  created_at: string;
}

export interface AffiliateLink {
  id: string;
  tool_name: string;
  affiliate_url: string;
  commission_rate: number;
  commission_type: CommissionType;
  clicks: number;
  conversions: number;
  revenue_earned: number;
  active: boolean;
  created_at: string;
}

export interface RevenueTarget {
  id: string;
  period: RevenueTargetPeriod;
  target_amount: number;
  actual_amount: number;
  start_date: string;
  end_date: string;
  on_track: boolean;
}

// ---------------------------------------------------------------------------
// Community & Engagement
// ---------------------------------------------------------------------------

export interface Comment {
  id: string;
  platform: Platform;
  post_id: string;
  comment_id: string;
  author_handle: string;
  author_name: string;
  content: string;
  sentiment: Sentiment;
  requires_response: boolean;
  response_text: string | null;
  responded: boolean;
  responded_at: string | null;
  is_potential_customer: boolean;
  created_at: string;
}

export interface DMConversation {
  id: string;
  platform: Platform;
  user_handle: string;
  user_name: string;
  status: DMStatus;
  last_message_at: string;
  is_potential_customer: boolean;
  notes: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Trend Prediction
// ---------------------------------------------------------------------------

export interface TrendPrediction {
  id: string;
  topic: string;
  velocity: number;
  cross_platform_score: number;
  influencer_adoption: number;
  confidence: number;
  predicted_peak: string;
  recommended_action: RecommendedAction;
  actual_peak: string | null;
  prediction_accuracy: number | null;
  actioned: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Configuration Types
// ---------------------------------------------------------------------------

export interface ContentPillar {
  name: ContentPillarName;
  description: string;
  frequency: string;
  monetization: string;
}

export interface PostingSlot {
  platform: Platform;
  dayOfWeek: number;
  hour: number;
  engagement_multiplier: number;
}

export interface Competitor {
  handle: string;
  platforms: Platform[];
  tier: CompetitorTier;
}

export interface TextOverlay {
  text: string;
  size: number;
  color: string;
  y: number;
  startTime: number;
  endTime: number;
}

export interface SmartLinkDestination {
  platform: Platform;
  url: string;
}

export interface SmartLinkTracking {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
}

export interface SmartLink {
  slug: string;
  destinations: SmartLinkDestination[];
  tracking: SmartLinkTracking;
}

// ---------------------------------------------------------------------------
// Source Configuration
// ---------------------------------------------------------------------------

export interface SourceConfig {
  id: string;
  name: string;
  type: Source;
  url: string;
  category: string;
  check_interval_minutes: number;
  enabled: boolean;
  priority: number;
}

// ---------------------------------------------------------------------------
// Hook Template
// ---------------------------------------------------------------------------

export interface HookTemplate {
  id: string;
  name: string;
  template: string;
  category: string;
  effectiveness_score: number;
  example: string;
  best_for: ContentPillarName[];
}

// ---------------------------------------------------------------------------
// Platform Configuration
// ---------------------------------------------------------------------------

export interface PlatformConfig {
  platform: Platform;
  display_name: string;
  max_duration_seconds: number;
  min_duration_seconds: number;
  aspect_ratio: AspectRatio;
  resolution: { width: number; height: number };
  max_file_size_mb: number;
  supported_formats: string[];
  video_codec: string;
  audio_codec: string;
  max_caption_length: number;
  max_hashtags: number;
  supports_music: boolean;
  supports_text_overlay: boolean;
  api_posting_supported: boolean;
  optimal_fps: number;
  bitrate_mbps: number;
}

// ---------------------------------------------------------------------------
// Schedule Configuration
// ---------------------------------------------------------------------------

export interface ScheduleSlot {
  time: string;
  content_pillar: ContentPillarName;
  priority: number;
}

export interface DaySchedule {
  slots: ScheduleSlot[];
}

export interface PlatformSchedule {
  platform: Platform;
  timezone: string;
  days: Record<string, DaySchedule>;
}

// ---------------------------------------------------------------------------
// Ollama / LLM Types
// ---------------------------------------------------------------------------

export type OllamaModel = 'mistral' | 'llama3:8b' | 'phi3:mini';

export interface OllamaGenerateOptions {
  system?: string;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  max_tokens?: number;
  stop?: string[];
}

export interface OllamaResponse {
  model: string;
  response: string;
  done: boolean;
  total_duration?: number;
  eval_count?: number;
}

// ---------------------------------------------------------------------------
// Trend Signal
// ---------------------------------------------------------------------------

export interface TrendSignal {
  topic: string;
  mentionGrowth: number;
  crossPlatformScore: number;
  influencerCoverage: number;
  compositeScore: number;
  confidence: number;
  recommendedAction: RecommendedAction;
}

// ---------------------------------------------------------------------------
// Revenue Dashboard
// ---------------------------------------------------------------------------

export interface RevenueDashboard {
  today: number;
  thisWeek: number;
  thisMonth: number;
  allTime: number;
  mrr: number;
  byProduct: { product_id: string; product_name: string; total: number }[];
  byPlatform: { platform: Platform; total: number }[];
  recentEvents: RevenueEvent[];
  targets: RevenueTarget[];
}

// ---------------------------------------------------------------------------
// Comment Classification
// ---------------------------------------------------------------------------

export interface CommentClassification {
  sentiment: Sentiment;
  requires_response: boolean;
  buying_intent: number;
  topic: string;
  urgency: 'low' | 'medium' | 'high';
}

// ---------------------------------------------------------------------------
// Weekly Report
// ---------------------------------------------------------------------------

export interface WeeklyReport {
  period: { start: string; end: string };
  summary: {
    totalViews: number;
    totalEngagement: number;
    followerGrowth: number;
    revenue: number;
    postsPublished: number;
  };
  topPosts: { post_id: string; platform: Platform; views: number; engagement_rate: number }[];
  pillarPerformance: { pillar: ContentPillarName; avgViews: number; avgEngagement: number; count: number }[];
  platformBreakdown: { platform: Platform; views: number; followers: number; growth: number }[];
  recommendations: string[];
  growthProjection: { projected100kDate: string | null; currentTrajectory: string };
}

// ---------------------------------------------------------------------------
// Thumbnail Types
// ---------------------------------------------------------------------------

export interface ThumbnailConfig {
  scriptId: string;
  title: string;
  subtitle?: string;
  style: 'bold' | 'minimal' | 'dramatic' | 'clean';
  platform: Platform;
  backgroundImagePath?: string;
  brandColor?: string;
}

// ---------------------------------------------------------------------------
// Caption Segment
// ---------------------------------------------------------------------------

export interface CaptionSegment {
  index: number;
  startTime: string;
  endTime: string;
  text: string;
}

export interface CaptionStylePreset {
  name: string;
  fontFamily: string;
  fontSize: number;
  primaryColor: string;
  outlineColor: string;
  outlineWidth: number;
  backgroundColor: string;
  position: 'bottom' | 'center' | 'top';
}
