-- ============================================================================
-- 005_distributor.sql
-- Distributor module: scheduling and tracking of posts across platforms.
-- ============================================================================

CREATE TABLE IF NOT EXISTS posting_queue (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    video_output_id UUID        NOT NULL REFERENCES video_outputs (id) ON DELETE CASCADE,
    platform        TEXT        NOT NULL,
    caption         TEXT,
    hashtags        TEXT[],
    scheduled_at    TIMESTAMPTZ NOT NULL,                         -- when the post should go live
    posted_at       TIMESTAMPTZ,                                  -- actual publish timestamp
    post_url        TEXT,                                          -- URL once published
    post_id         TEXT,                                          -- platform‑native post identifier
    status          TEXT        NOT NULL DEFAULT 'scheduled',     -- scheduled | posting | posted | failed
    retry_count     INTEGER     NOT NULL DEFAULT 0,
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary worker query: "what needs to be posted now?"
CREATE INDEX IF NOT EXISTS idx_posting_queue_scheduled
    ON posting_queue (scheduled_at ASC)
    WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_posting_queue_status
    ON posting_queue (status);

CREATE INDEX IF NOT EXISTS idx_posting_queue_platform_posted
    ON posting_queue (platform, posted_at DESC);

CREATE INDEX IF NOT EXISTS idx_posting_queue_video_output
    ON posting_queue (video_output_id);

COMMENT ON TABLE  posting_queue IS 'Outbound posting schedule — one row per platform post.';
COMMENT ON COLUMN posting_queue.retry_count IS 'Number of times the system has retried after a transient failure.';
