-- ============================================================================
-- 001_radar.sql
-- Radar module: ingests trending topics, news, and content signals from
-- external sources so the system always knows what is worth talking about.
-- ============================================================================

CREATE TABLE IF NOT EXISTS radar_items (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    source            TEXT        NOT NULL,                       -- e.g. 'twitter', 'reddit', 'rss', 'google_trends'
    source_url        TEXT        NOT NULL UNIQUE,                -- canonical URL; prevents duplicate ingestion
    title             TEXT        NOT NULL,
    summary           TEXT,
    category          TEXT,                                       -- e.g. 'AI', 'Marketing', 'Finance'
    importance_score  FLOAT       NOT NULL DEFAULT 0,             -- 0‑100, higher = more important
    trending_velocity FLOAT       DEFAULT 0,                     -- rate of change in popularity
    first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),        -- when the item first appeared in source
    raw_data          JSONB,                                      -- full payload from the source API
    processed         BOOLEAN     NOT NULL DEFAULT FALSE,        -- TRUE once a script has been generated
    posted            BOOLEAN     NOT NULL DEFAULT FALSE,        -- TRUE once content has been published
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup of the most important items first
CREATE INDEX IF NOT EXISTS idx_radar_items_importance_desc
    ON radar_items (importance_score DESC);

-- Worker queue: quickly find items that still need processing
CREATE INDEX IF NOT EXISTS idx_radar_items_unprocessed
    ON radar_items (created_at DESC)
    WHERE processed = FALSE;

-- Filter by source within a time range
CREATE INDEX IF NOT EXISTS idx_radar_items_source_created
    ON radar_items (source, created_at DESC);

COMMENT ON TABLE  radar_items IS 'Raw trending topics and signals ingested from external sources.';
COMMENT ON COLUMN radar_items.importance_score IS 'Computed score (0‑100) combining recency, virality, and relevance.';
COMMENT ON COLUMN radar_items.trending_velocity IS 'Rate of change in popularity; positive = gaining traction.';
COMMENT ON COLUMN radar_items.raw_data IS 'Complete JSON payload from the originating API for audit / reprocessing.';
