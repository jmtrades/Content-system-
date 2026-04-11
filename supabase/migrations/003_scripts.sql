-- ============================================================================
-- 003_scripts.sql
-- Scripts module: AI‑generated video scripts linked back to the radar item
-- or competitor gap that inspired them.
-- ============================================================================

CREATE TABLE IF NOT EXISTS scripts (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    radar_item_id      UUID        REFERENCES radar_items (id) ON DELETE SET NULL,
    gap_id             UUID        REFERENCES competitor_gaps (id) ON DELETE SET NULL,
    topic              TEXT        NOT NULL,
    content_pillar     TEXT,                                      -- e.g. 'education', 'entertainment', 'inspiration'
    hook               TEXT        NOT NULL,                      -- primary opening hook
    hook_variants      JSONB       DEFAULT '[]'::jsonb,          -- alternative hooks for A/B testing
    body               TEXT        NOT NULL,                      -- main script body
    cta                TEXT,                                      -- primary call‑to‑action line
    cta_type           TEXT,                                      -- e.g. 'follow', 'link_in_bio', 'comment'
    caption            TEXT,                                      -- primary social‑media caption
    caption_variants   JSONB       DEFAULT '[]'::jsonb,          -- alternative captions
    hashtags           TEXT[],
    platform_versions  JSONB       DEFAULT '{}'::jsonb,          -- platform‑specific tweaks keyed by platform name
    estimated_duration INTEGER,                                   -- seconds
    monetization_hook  TEXT,                                      -- product / affiliate tie‑in
    status             TEXT        NOT NULL DEFAULT 'draft',      -- draft | approved | filmed | posted | archived
    performance_score  FLOAT,                                    -- filled in after posting; normalised 0‑100
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scripts_status
    ON scripts (status);

CREATE INDEX IF NOT EXISTS idx_scripts_content_pillar
    ON scripts (content_pillar);

CREATE INDEX IF NOT EXISTS idx_scripts_created
    ON scripts (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_scripts_radar_item
    ON scripts (radar_item_id)
    WHERE radar_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_scripts_gap
    ON scripts (gap_id)
    WHERE gap_id IS NOT NULL;

COMMENT ON TABLE  scripts IS 'AI‑generated video scripts with hook/body/CTA structure.';
COMMENT ON COLUMN scripts.hook_variants IS 'JSON array of alternative hook strings for split testing.';
COMMENT ON COLUMN scripts.platform_versions IS 'JSON object keyed by platform name containing adjusted script fields.';
