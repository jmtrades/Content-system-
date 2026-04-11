-- ============================================================================
-- 007_revenue.sql
-- Revenue module: products, transactions, affiliate tracking, and targets.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- products – digital products, courses, memberships, etc.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
    id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    name             TEXT          NOT NULL,
    slug             TEXT          NOT NULL UNIQUE,
    price            DECIMAL(10,2) NOT NULL,
    type             TEXT          NOT NULL,                      -- e.g. 'ebook', 'course', 'membership', 'template'
    stripe_price_id  TEXT,
    landing_page_url TEXT,
    active           BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_active
    ON products (active)
    WHERE active = TRUE;

COMMENT ON TABLE products IS 'Catalogue of products available for sale.';

-- ---------------------------------------------------------------------------
-- revenue_events – individual monetary transactions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS revenue_events (
    id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id        UUID          NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
    amount            DECIMAL(10,2) NOT NULL,
    currency          TEXT          NOT NULL DEFAULT 'GBP',
    type              TEXT          NOT NULL,                     -- e.g. 'sale', 'refund', 'subscription', 'affiliate'
    source_platform   TEXT,                                       -- platform that drove this transaction
    source_post_id    UUID,                                       -- optional link to posting_queue row
    customer_email    TEXT,
    stripe_payment_id TEXT,
    utm_source        TEXT,
    utm_medium        TEXT,
    utm_campaign      TEXT,
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revenue_events_product
    ON revenue_events (product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_revenue_events_created
    ON revenue_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_revenue_events_type
    ON revenue_events (type);

CREATE INDEX IF NOT EXISTS idx_revenue_events_source_platform
    ON revenue_events (source_platform);

COMMENT ON TABLE revenue_events IS 'Individual revenue transactions tied back to products and content.';

-- ---------------------------------------------------------------------------
-- affiliate_links – partner / affiliate tracking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS affiliate_links (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tool_name       TEXT          NOT NULL,                       -- name of the affiliated tool / service
    affiliate_url   TEXT          NOT NULL,
    commission_rate DECIMAL(5,2)  NOT NULL DEFAULT 0,
    commission_type TEXT          NOT NULL DEFAULT 'percentage',  -- 'percentage' | 'flat'
    clicks          INTEGER       NOT NULL DEFAULT 0,
    conversions     INTEGER       NOT NULL DEFAULT 0,
    revenue_earned  DECIMAL(10,2) NOT NULL DEFAULT 0,
    active          BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_links_active
    ON affiliate_links (active)
    WHERE active = TRUE;

COMMENT ON TABLE affiliate_links IS 'Affiliate / partner link tracking and revenue attribution.';

-- ---------------------------------------------------------------------------
-- revenue_targets – periodic revenue goals and progress
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS revenue_targets (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    period        TEXT          NOT NULL,                         -- e.g. 'monthly', 'quarterly', 'annual'
    target_amount DECIMAL(10,2) NOT NULL,
    actual_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    start_date    DATE          NOT NULL,
    end_date      DATE          NOT NULL,
    on_track      BOOLEAN       NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revenue_targets_period
    ON revenue_targets (start_date DESC, end_date DESC);

COMMENT ON TABLE revenue_targets IS 'Revenue goals and progress tracking by period.';
