-- ============================================================================
-- 011_optimizer.sql
-- Optimizer module: persisted optimization configs, schedule presets, hook
-- rankings, variation presets, and weekly reports.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- optimizer_config – generic key/value config store for optimizer outputs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS optimizer_config (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    config_key    TEXT        NOT NULL UNIQUE,
    config_value  JSONB       NOT NULL DEFAULT '{}'::jsonb,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_optimizer_config_key
    ON optimizer_config (config_key);

COMMENT ON TABLE  optimizer_config IS 'Key/value config store for optimizer-generated presets (schedules, hooks, variation presets).';
COMMENT ON COLUMN optimizer_config.config_key IS 'Unique key identifying the config, e.g. schedule:tiktok, hooks, variation_presets.';

-- ---------------------------------------------------------------------------
-- weekly_reports – persisted weekly optimization reports
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS weekly_reports (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    period_start  DATE        NOT NULL,
    period_end    DATE        NOT NULL,
    report_data   JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_weekly_reports_period
    ON weekly_reports (period_end DESC);

COMMENT ON TABLE  weekly_reports IS 'Persisted weekly optimization reports with full analytics snapshots.';
