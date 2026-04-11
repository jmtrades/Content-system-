-- ============================================================================
-- 010_growth.sql
-- Growth module: milestone tracking, velocity projections, content‑pillar
-- configuration, and smart link routing with click tracking.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- growth_milestones – notable follower / view milestones reached
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS growth_milestones (
    id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    platform                 TEXT        NOT NULL,
    milestone_type           TEXT        NOT NULL,                -- e.g. 'followers', 'total_views', 'monthly_revenue'
    milestone_value          INTEGER     NOT NULL,
    reached_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    days_from_start          INTEGER,                             -- days since the account / system launch
    posts_published          INTEGER,                             -- total posts at time of milestone
    total_views_at_milestone BIGINT
);

CREATE INDEX IF NOT EXISTS idx_growth_milestones_platform
    ON growth_milestones (platform, reached_at DESC);

CREATE INDEX IF NOT EXISTS idx_growth_milestones_type
    ON growth_milestones (milestone_type, milestone_value DESC);

COMMENT ON TABLE growth_milestones IS 'Records of significant growth milestones for retrospective analysis.';

-- ---------------------------------------------------------------------------
-- growth_velocity – daily growth snapshots and projections
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS growth_velocity (
    id                       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    platform                 TEXT          NOT NULL,
    date                     DATE          NOT NULL,
    follower_count           INTEGER       DEFAULT 0,
    daily_growth             INTEGER       DEFAULT 0,
    growth_rate              FLOAT         DEFAULT 0,            -- daily percentage change
    projected_100k_date      DATE,
    projected_revenue_monthly DECIMAL(10,2),

    CONSTRAINT uq_growth_velocity_platform_date
        UNIQUE (platform, date)
);

CREATE INDEX IF NOT EXISTS idx_growth_velocity_date
    ON growth_velocity (date DESC);

COMMENT ON TABLE  growth_velocity IS 'Daily follower growth snapshots with forward projections.';
COMMENT ON COLUMN growth_velocity.projected_100k_date IS 'Extrapolated date when the account will reach 100 000 followers at current velocity.';

-- ---------------------------------------------------------------------------
-- content_pillar_config – configurable content pillars
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS content_pillar_config (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT        NOT NULL UNIQUE,                    -- e.g. 'education', 'entertainment', 'inspiration'
    description   TEXT,
    frequency     TEXT,                                           -- e.g. '3x per week', 'daily'
    monetization  TEXT,                                           -- how this pillar drives revenue
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE content_pillar_config IS 'Defines the strategic content pillars and their posting cadence.';

-- ---------------------------------------------------------------------------
-- smart_links – redirect / routing links with platform‑aware destinations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS smart_links (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    slug          TEXT        NOT NULL UNIQUE,                    -- short URL slug, e.g. 'my-ebook'
    destinations  JSONB       NOT NULL DEFAULT '{}'::jsonb,      -- keyed by platform or 'default'
    tracking      BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  smart_links IS 'Platform‑aware redirect links (link‑in‑bio replacement).';
COMMENT ON COLUMN smart_links.destinations IS 'JSON object mapping platform names (or "default") to destination URLs.';

-- ---------------------------------------------------------------------------
-- link_clicks – click‑level events for smart_links
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS link_clicks (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    link_id     UUID        NOT NULL REFERENCES smart_links (id) ON DELETE CASCADE,
    platform    TEXT,                                              -- inferred source platform
    ip_hash     TEXT,                                              -- hashed IP for unique‑visitor counting (no PII)
    user_agent  TEXT,
    clicked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_link_clicks_link
    ON link_clicks (link_id, clicked_at DESC);

CREATE INDEX IF NOT EXISTS idx_link_clicks_clicked_at
    ON link_clicks (clicked_at DESC);

COMMENT ON TABLE  link_clicks IS 'Per‑click events for smart links; used for attribution and analytics.';
COMMENT ON COLUMN link_clicks.ip_hash IS 'SHA‑256 hash of the visitor IP — no raw PII stored.';
