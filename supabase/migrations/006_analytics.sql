-- ============================================================================
-- 006_analytics.sql
-- Analytics module: per‑post metrics snapshots and daily roll‑ups.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- post_analytics – point‑in‑time metric snapshots for individual posts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS post_analytics (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    posting_queue_id    UUID        NOT NULL REFERENCES posting_queue (id) ON DELETE CASCADE,
    platform            TEXT        NOT NULL,
    post_url            TEXT,
    measured_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Engagement metrics
    views               INTEGER     DEFAULT 0,
    likes               INTEGER     DEFAULT 0,
    comments            INTEGER     DEFAULT 0,
    shares              INTEGER     DEFAULT 0,
    saves               INTEGER     DEFAULT 0,

    -- Watch metrics
    watch_time_seconds  FLOAT       DEFAULT 0,
    avg_watch_percentage FLOAT      DEFAULT 0,

    -- Reach metrics
    reach               INTEGER     DEFAULT 0,
    impressions         INTEGER     DEFAULT 0,

    -- Profile / conversion metrics
    follower_count      INTEGER     DEFAULT 0,
    follower_change     INTEGER     DEFAULT 0,
    profile_visits      INTEGER     DEFAULT 0,
    link_clicks         INTEGER     DEFAULT 0,
    dm_opens            INTEGER     DEFAULT 0,
    bio_link_clicks     INTEGER     DEFAULT 0,

    -- Computed rates
    engagement_rate     FLOAT       DEFAULT 0,
    virality_score      FLOAT       DEFAULT 0,
    save_rate           FLOAT       DEFAULT 0,
    conversion_rate     FLOAT       DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_post_analytics_queue
    ON post_analytics (posting_queue_id, measured_at DESC);

CREATE INDEX IF NOT EXISTS idx_post_analytics_platform_measured
    ON post_analytics (platform, measured_at DESC);

CREATE INDEX IF NOT EXISTS idx_post_analytics_engagement
    ON post_analytics (engagement_rate DESC);

COMMENT ON TABLE post_analytics IS 'Point‑in‑time performance snapshots for published posts.';

-- ---------------------------------------------------------------------------
-- daily_analytics – one row per platform per day
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_analytics (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    platform            TEXT        NOT NULL,
    date                DATE        NOT NULL,

    -- Aggregate counts
    total_views         BIGINT      DEFAULT 0,
    total_likes         BIGINT      DEFAULT 0,
    total_comments      BIGINT      DEFAULT 0,
    total_shares        BIGINT      DEFAULT 0,
    total_saves         BIGINT      DEFAULT 0,

    -- Account‑level
    follower_count      INTEGER     DEFAULT 0,
    follower_growth     INTEGER     DEFAULT 0,

    -- Best / worst performers (references post_analytics or posting_queue)
    top_post_id         UUID,
    worst_post_id       UUID,

    -- Rates
    avg_engagement_rate FLOAT       DEFAULT 0,
    revenue_attributed  DECIMAL(10,2) DEFAULT 0,

    posts_published     INTEGER     DEFAULT 0,

    CONSTRAINT uq_daily_analytics_platform_date
        UNIQUE (platform, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_analytics_date
    ON daily_analytics (date DESC);

COMMENT ON TABLE daily_analytics IS 'Daily aggregated metrics per platform for high‑level dashboards.';
