-- ============================================================================
-- 002_intel.sql
-- Intel module: tracks competitor activity, analytics snapshots, and
-- identifies content gaps the system can exploit.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- competitor_posts – individual pieces of content published by competitors
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS competitor_posts (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    competitor_handle     TEXT        NOT NULL,
    platform              TEXT        NOT NULL,                   -- e.g. 'tiktok', 'instagram', 'youtube'
    post_url              TEXT        NOT NULL UNIQUE,
    post_type             TEXT,                                   -- e.g. 'reel', 'carousel', 'short', 'story'
    caption               TEXT,
    hashtags              TEXT[],
    posted_at             TIMESTAMPTZ,
    views                 INTEGER     DEFAULT 0,
    likes                 INTEGER     DEFAULT 0,
    comments              INTEGER     DEFAULT 0,
    shares                INTEGER     DEFAULT 0,
    engagement_rate       FLOAT       DEFAULT 0,
    topic_category        TEXT,
    hook_text             TEXT,                                   -- opening line / hook of the post
    cta_type              TEXT,                                   -- e.g. 'link_in_bio', 'comment_keyword', 'dm'
    monetization_detected BOOLEAN     DEFAULT FALSE,
    product_mentioned     TEXT,
    scraped_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    raw_data              JSONB
);

CREATE INDEX IF NOT EXISTS idx_competitor_posts_handle_platform
    ON competitor_posts (competitor_handle, platform, posted_at DESC);

CREATE INDEX IF NOT EXISTS idx_competitor_posts_engagement
    ON competitor_posts (engagement_rate DESC);

CREATE INDEX IF NOT EXISTS idx_competitor_posts_topic
    ON competitor_posts (topic_category);

COMMENT ON TABLE competitor_posts IS 'Individual posts scraped from competitor accounts.';

-- ---------------------------------------------------------------------------
-- competitor_analytics – daily roll‑up per competitor per platform
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS competitor_analytics (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    competitor_handle   TEXT        NOT NULL,
    platform            TEXT        NOT NULL,
    date                DATE        NOT NULL,
    follower_count      INTEGER     DEFAULT 0,
    follower_growth     INTEGER     DEFAULT 0,
    avg_engagement_rate FLOAT       DEFAULT 0,
    top_post_url        TEXT,
    top_post_views      INTEGER     DEFAULT 0,
    posting_frequency   FLOAT       DEFAULT 0,                   -- posts per day in the measured window

    CONSTRAINT uq_competitor_analytics_handle_platform_date
        UNIQUE (competitor_handle, platform, date)
);

CREATE INDEX IF NOT EXISTS idx_competitor_analytics_date
    ON competitor_analytics (date DESC);

COMMENT ON TABLE competitor_analytics IS 'Daily aggregated metrics per competitor account.';

-- ---------------------------------------------------------------------------
-- competitor_gaps – opportunities discovered through competitor analysis
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS competitor_gaps (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    gap_type          TEXT        NOT NULL,                       -- e.g. 'topic', 'format', 'audience_segment'
    description       TEXT        NOT NULL,
    opportunity_score FLOAT       NOT NULL DEFAULT 0,            -- higher = bigger opportunity
    detected_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actioned          BOOLEAN     NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_competitor_gaps_opportunity
    ON competitor_gaps (opportunity_score DESC)
    WHERE actioned = FALSE;

COMMENT ON TABLE competitor_gaps IS 'Content gaps and opportunities identified by comparing competitor output to our own.';
