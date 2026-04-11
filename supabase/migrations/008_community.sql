-- ============================================================================
-- 008_community.sql
-- Community module: inbound comments and DM conversations for engagement
-- tracking and lead identification.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- comments – individual comments on published posts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comments (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    platform              TEXT        NOT NULL,
    post_id               TEXT        NOT NULL,                   -- platform‑native post identifier
    comment_id            TEXT,                                   -- platform‑native comment identifier
    author_handle         TEXT,
    author_name           TEXT,
    content               TEXT        NOT NULL,
    sentiment             TEXT,                                   -- e.g. 'positive', 'neutral', 'negative', 'question'
    requires_response     BOOLEAN     NOT NULL DEFAULT FALSE,
    response_text         TEXT,
    responded             BOOLEAN     NOT NULL DEFAULT FALSE,
    responded_at          TIMESTAMPTZ,
    is_potential_customer BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_post
    ON comments (platform, post_id);

CREATE INDEX IF NOT EXISTS idx_comments_needs_response
    ON comments (created_at DESC)
    WHERE requires_response = TRUE AND responded = FALSE;

CREATE INDEX IF NOT EXISTS idx_comments_potential_customer
    ON comments (created_at DESC)
    WHERE is_potential_customer = TRUE;

CREATE INDEX IF NOT EXISTS idx_comments_sentiment
    ON comments (sentiment);

COMMENT ON TABLE  comments IS 'Inbound comments scraped from published posts.';
COMMENT ON COLUMN comments.sentiment IS 'Computed sentiment label used to prioritise responses.';

-- ---------------------------------------------------------------------------
-- dm_conversations – direct‑message threads
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dm_conversations (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    platform              TEXT        NOT NULL,
    user_handle           TEXT        NOT NULL,
    user_name             TEXT,
    status                TEXT        NOT NULL DEFAULT 'open',    -- open | closed | snoozed
    last_message_at       TIMESTAMPTZ,
    is_potential_customer BOOLEAN     NOT NULL DEFAULT FALSE,
    notes                 TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dm_conversations_status
    ON dm_conversations (status, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_dm_conversations_platform_handle
    ON dm_conversations (platform, user_handle);

CREATE INDEX IF NOT EXISTS idx_dm_conversations_potential_customer
    ON dm_conversations (created_at DESC)
    WHERE is_potential_customer = TRUE;

COMMENT ON TABLE dm_conversations IS 'Direct‑message conversation threads for community management.';
