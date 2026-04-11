-- ============================================================================
-- 011_enhancements.sql
-- Enhancement tables: A/B testing, content repurposing, viral predictions,
-- notifications, engagement automation, DM sequences, community scoring,
-- optimizer config, weekly reports, hook rankings, schedule config.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Optimizer config (generic key/value store)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS optimizer_config (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    config_key    TEXT        NOT NULL UNIQUE,
    config_value  JSONB       NOT NULL DEFAULT '{}'::jsonb,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_optimizer_config_key ON optimizer_config(config_key);

-- ---------------------------------------------------------------------------
-- Weekly optimization reports
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS weekly_reports (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    period_start  DATE        NOT NULL,
    period_end    DATE        NOT NULL,
    report_data   JSONB       NOT NULL DEFAULT '{}'::jsonb,
    recommendations JSONB,
    changes_applied JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_period ON weekly_reports(period_end DESC);

-- ---------------------------------------------------------------------------
-- A/B Testing: experiments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ab_experiments (
    id                    UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    name                  TEXT    NOT NULL,
    type                  TEXT    NOT NULL,
    status                TEXT    DEFAULT 'active',
    traffic_split         JSONB   NOT NULL DEFAULT '[]'::jsonb,
    min_sample_size       INTEGER DEFAULT 1000,
    confidence_threshold  FLOAT   DEFAULT 0.95,
    winner_variant_id     TEXT,
    started_at            TIMESTAMPTZ DEFAULT NOW(),
    completed_at          TIMESTAMPTZ,
    created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- A/B Testing: variants
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ab_variants (
    id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id   UUID    REFERENCES ab_experiments(id) ON DELETE CASCADE,
    variant_id      TEXT    NOT NULL,
    label           TEXT    NOT NULL,
    config          JSONB   NOT NULL DEFAULT '{}'::jsonb,
    impressions     INTEGER DEFAULT 0,
    conversions     INTEGER DEFAULT 0,
    total_engagement FLOAT  DEFAULT 0,
    total_watch_time FLOAT  DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(experiment_id, variant_id)
);

-- ---------------------------------------------------------------------------
-- A/B Testing: assignments (which post got which variant)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ab_assignments (
    id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id   UUID    REFERENCES ab_experiments(id) ON DELETE CASCADE,
    variant_id      TEXT    NOT NULL,
    post_id         UUID,
    assigned_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ab_assignments_experiment ON ab_assignments(experiment_id);

-- ---------------------------------------------------------------------------
-- Repurposed content
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS repurposed_content (
    id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    script_id           UUID    REFERENCES scripts(id) ON DELETE CASCADE,
    format              TEXT    NOT NULL,
    content             JSONB   NOT NULL DEFAULT '{}'::jsonb,
    status              TEXT    DEFAULT 'draft',
    posted_at           TIMESTAMPTZ,
    post_url            TEXT,
    engagement_metrics  JSONB,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_repurposed_script ON repurposed_content(script_id);
CREATE INDEX IF NOT EXISTS idx_repurposed_format ON repurposed_content(format);

-- ---------------------------------------------------------------------------
-- Viral predictions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS viral_predictions (
    id                      UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    script_id               UUID    REFERENCES scripts(id) ON DELETE CASCADE,
    predicted_score         INTEGER NOT NULL,
    confidence              FLOAT   NOT NULL,
    predicted_views_low     INTEGER,
    predicted_views_mid     INTEGER,
    predicted_views_high    INTEGER,
    factors                 JSONB   NOT NULL DEFAULT '{}'::jsonb,
    recommendations         JSONB,
    optimal_posting_time    TIMESTAMPTZ,
    best_platform           TEXT,
    actual_views            INTEGER,
    actual_engagement_rate  FLOAT,
    prediction_error        FLOAT,
    created_at              TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_viral_predictions_script ON viral_predictions(script_id);

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    title           TEXT    NOT NULL,
    message         TEXT    NOT NULL,
    category        TEXT    NOT NULL,
    priority        TEXT    DEFAULT 'medium',
    channels_sent   TEXT[],
    read            BOOLEAN DEFAULT FALSE,
    action_url      TEXT,
    data            JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(created_at DESC) WHERE read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_category ON notifications(category, created_at DESC);

-- ---------------------------------------------------------------------------
-- Engagement actions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS engagement_actions (
    id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    platform        TEXT    NOT NULL,
    action_type     TEXT    NOT NULL,
    target_handle   TEXT,
    target_url      TEXT,
    content         TEXT,
    status          TEXT    DEFAULT 'pending',
    result          JSONB,
    scheduled_at    TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_engagement_pending ON engagement_actions(status) WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- DM sequences
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dm_sequences (
    id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    user_handle     TEXT    NOT NULL,
    platform        TEXT    NOT NULL,
    trigger_type    TEXT    NOT NULL,
    current_step    INTEGER DEFAULT 0,
    total_steps     INTEGER NOT NULL,
    status          TEXT    DEFAULT 'active',
    next_message_at TIMESTAMPTZ,
    conversion_event TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dm_sequences_active ON dm_sequences(next_message_at) WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- Community member scoring
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS community_scores (
    id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    user_handle         TEXT    NOT NULL,
    platform            TEXT    NOT NULL,
    total_interactions  INTEGER DEFAULT 0,
    comment_count       INTEGER DEFAULT 0,
    share_count         INTEGER DEFAULT 0,
    dm_count            INTEGER DEFAULT 0,
    buying_intent_score INTEGER DEFAULT 0,
    recommended_action  TEXT    DEFAULT 'nurture',
    last_interaction_at TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_handle, platform)
);
CREATE INDEX IF NOT EXISTS idx_community_scores_intent ON community_scores(buying_intent_score DESC);

-- ---------------------------------------------------------------------------
-- Hook performance tracking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hook_rankings (
    id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    hook_template   TEXT    NOT NULL,
    times_used      INTEGER DEFAULT 0,
    avg_retention   FLOAT   DEFAULT 0,
    avg_engagement  FLOAT   DEFAULT 0,
    rank_score      FLOAT   DEFAULT 0,
    last_used_at    TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hook_rankings_score ON hook_rankings(rank_score DESC);

-- ---------------------------------------------------------------------------
-- Schedule config (optimized posting times)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schedule_config (
    id                      UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    platform                TEXT    NOT NULL,
    day_of_week             INTEGER NOT NULL,
    hour                    INTEGER NOT NULL,
    engagement_multiplier   FLOAT   DEFAULT 1.0,
    auto_optimized          BOOLEAN DEFAULT FALSE,
    updated_at              TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(platform, day_of_week, hour)
);
CREATE INDEX IF NOT EXISTS idx_schedule_config_platform ON schedule_config(platform);
