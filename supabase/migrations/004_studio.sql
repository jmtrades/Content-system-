-- ============================================================================
-- 004_studio.sql
-- Studio module: video production pipeline — one job per script, potentially
-- multiple output variants (different platforms, aspect ratios, etc.).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- video_jobs – one render/encode job per script
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS video_jobs (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    script_id               UUID        NOT NULL REFERENCES scripts (id) ON DELETE CASCADE,
    input_path              TEXT        NOT NULL,                 -- path or URL to source footage / assets
    status                  TEXT        NOT NULL DEFAULT 'queued',-- queued | processing | completed | failed
    processing_started_at   TIMESTAMPTZ,
    processing_completed_at TIMESTAMPTZ,
    error_message           TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_video_jobs_status
    ON video_jobs (status);

CREATE INDEX IF NOT EXISTS idx_video_jobs_script
    ON video_jobs (script_id);

CREATE INDEX IF NOT EXISTS idx_video_jobs_queued
    ON video_jobs (created_at ASC)
    WHERE status = 'queued';

COMMENT ON TABLE video_jobs IS 'Video render/encode jobs — one per script submission.';

-- ---------------------------------------------------------------------------
-- video_outputs – finished artefacts produced by a job
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS video_outputs (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id            UUID        NOT NULL REFERENCES video_jobs (id) ON DELETE CASCADE,
    platform          TEXT        NOT NULL,                       -- target platform for this variant
    variant_number    INTEGER     NOT NULL DEFAULT 1,
    output_path       TEXT        NOT NULL,                       -- path or URL to the rendered file
    thumbnail_path    TEXT,
    caption_path      TEXT,                                       -- path to burned‑in caption / SRT file
    duration_seconds  FLOAT,
    file_size_bytes   BIGINT,
    variation_config  JSONB       DEFAULT '{}'::jsonb,           -- aspect ratio, overlay, music track, etc.
    status            TEXT        NOT NULL DEFAULT 'ready',       -- ready | posted | archived
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_video_outputs_job
    ON video_outputs (job_id);

CREATE INDEX IF NOT EXISTS idx_video_outputs_platform_status
    ON video_outputs (platform, status);

COMMENT ON TABLE  video_outputs IS 'Rendered video files — one row per platform/variant combination.';
COMMENT ON COLUMN video_outputs.variation_config IS 'JSON describing how this variant differs (aspect ratio, overlays, music, etc.).';
