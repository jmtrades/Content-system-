-- ============================================================================
-- 009_trends.sql
-- Trends module: forward‑looking trend predictions with accuracy tracking
-- so the system learns which signals to trust over time.
-- ============================================================================

CREATE TABLE IF NOT EXISTS trend_predictions (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    topic                 TEXT        NOT NULL,
    velocity              FLOAT       NOT NULL DEFAULT 0,        -- current rate of growth
    cross_platform_score  FLOAT       NOT NULL DEFAULT 0,        -- 0‑1; how many platforms show the trend
    influencer_adoption   FLOAT       NOT NULL DEFAULT 0,        -- 0‑1; share of tracked influencers using it
    confidence            FLOAT       NOT NULL DEFAULT 0,        -- 0‑1; model confidence in the prediction
    predicted_peak        TIMESTAMPTZ,                            -- when the trend is expected to peak
    recommended_action    TEXT,                                   -- e.g. 'create_now', 'schedule_next_week', 'monitor'
    actual_peak           TIMESTAMPTZ,                            -- filled in retrospectively
    prediction_accuracy   FLOAT,                                 -- 0‑1; how close predicted_peak was to actual_peak
    actioned              BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trend_predictions_confidence
    ON trend_predictions (confidence DESC)
    WHERE actioned = FALSE;

CREATE INDEX IF NOT EXISTS idx_trend_predictions_velocity
    ON trend_predictions (velocity DESC);

CREATE INDEX IF NOT EXISTS idx_trend_predictions_created
    ON trend_predictions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trend_predictions_topic
    ON trend_predictions (topic);

COMMENT ON TABLE  trend_predictions IS 'Forward‑looking trend forecasts with retrospective accuracy tracking.';
COMMENT ON COLUMN trend_predictions.prediction_accuracy IS 'Retrospective score (0‑1) comparing predicted_peak to actual_peak.';
COMMENT ON COLUMN trend_predictions.cross_platform_score IS 'Normalised score (0‑1) indicating how broadly the trend appears across platforms.';
