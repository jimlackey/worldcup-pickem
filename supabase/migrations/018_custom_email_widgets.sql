-- ============================================================================
-- Migration 018: Custom email widgets
--
-- Adds per-pool admin-defined HTML widgets that can be inserted into
-- admin-broadcast emails as {{token}} placeholders alongside the
-- code-defined built-ins (standings-summary, missing-group-picks,
-- missing-knockout-picks, group-phase-picks, knockout-round-picks).
--
-- Design notes:
--   - Pool-scoped. A widget defined in pool A is not visible in pool B.
--   - The `slug` is the literal token: an admin who creates a row with
--     slug='reminder' can write {{reminder}} in an email body.
--   - The slug character set matches the existing token regex in the
--     body renderer (/\{\{([a-zA-Z0-9_-]+)\}\}/): lowercase letters,
--     digits, hyphens, underscores. Length 1..50 keeps tokens readable.
--   - Slug uniqueness is per-pool only (UNIQUE(pool_id, slug)). Two
--     pools can have widgets with the same slug — that's fine, they
--     never co-exist in one email.
--   - `label` is the human-friendly name shown in the picker dropdown
--     and the insert-pill button. Doesn't have to be unique because the
--     slug is the actual identifier.
--   - `html_body` is raw HTML the admin authored. Per the project's
--     "admin is trusted, no XSS concern" policy (see
--     src/lib/email/render-email-body.ts SECURITY NOTE), the body is
--     spliced into the email unescaped, just like a built-in HTML
--     widget's output.
--   - No RLS policies — admin reads/writes go through the service-role
--     client (supabaseAdmin), same pattern as pool_whitelist.
--
-- Idempotency:
--   Every statement below tolerates re-execution. CREATE TABLE uses
--   IF NOT EXISTS; the three ADD CONSTRAINT statements are wrapped in
--   DO blocks that check pg_constraint first; the trigger is dropped
--   before being recreated. Re-running this migration on a database
--   where it has already been applied is a no-op.
-- ============================================================================

CREATE TABLE IF NOT EXISTS custom_email_widgets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pool_id     UUID NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
    slug        TEXT NOT NULL,
    label       TEXT NOT NULL,
    html_body   TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(pool_id, slug)
);

-- Slug format: same character set the email body renderer recognises in
-- {{token}} placeholders. 1..50 chars keeps tokens readable when pasted
-- into a body.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'custom_email_widgets_slug_format'
          AND conrelid = 'custom_email_widgets'::regclass
    ) THEN
        ALTER TABLE custom_email_widgets
            ADD CONSTRAINT custom_email_widgets_slug_format
            CHECK (slug ~ '^[a-zA-Z0-9_-]+$' AND length(slug) BETWEEN 1 AND 50);
    END IF;
END $$;

-- Label: 1..100 chars. Trim the user-facing label so display doesn't
-- get torpedoed by accidental whitespace.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'custom_email_widgets_label_length'
          AND conrelid = 'custom_email_widgets'::regclass
    ) THEN
        ALTER TABLE custom_email_widgets
            ADD CONSTRAINT custom_email_widgets_label_length
            CHECK (length(btrim(label)) BETWEEN 1 AND 100);
    END IF;
END $$;

-- HTML body: capped at 100k so a runaway paste doesn't fill the table.
-- 100k of HTML is well beyond any reasonable single email snippet.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'custom_email_widgets_body_length'
          AND conrelid = 'custom_email_widgets'::regclass
    ) THEN
        ALTER TABLE custom_email_widgets
            ADD CONSTRAINT custom_email_widgets_body_length
            CHECK (length(html_body) <= 100000);
    END IF;
END $$;

-- Fast lookup by pool — admin pages query "all widgets for this pool"
-- in order to populate the picker, the insert pills, and the send-time
-- token map.
CREATE INDEX IF NOT EXISTS idx_custom_email_widgets_pool
    ON custom_email_widgets(pool_id, slug);

-- updated_at trigger — mirror the pattern from migration 001 so the
-- column actually tracks edits (Postgres won't auto-bump it on UPDATE).
-- The trigger function `update_updated_at()` is defined in
-- 001_schema.sql and reused across pool-scoped tables.
--
-- DROP-then-CREATE is idempotent across all Postgres versions; CREATE OR
-- REPLACE TRIGGER would also work on PG 14+ but we keep the broader
-- compatibility pattern that the rest of the migrations use.
DROP TRIGGER IF EXISTS trg_custom_email_widgets_updated_at
    ON custom_email_widgets;
CREATE TRIGGER trg_custom_email_widgets_updated_at
    BEFORE UPDATE ON custom_email_widgets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: enabling is idempotent — already-enabled is a no-op.
ALTER TABLE custom_email_widgets ENABLE ROW LEVEL SECURITY;
-- No policies = no access for anon/authenticated roles. Service role
-- (supabaseAdmin) bypasses RLS, which is how all admin-only tables in
-- this app are accessed.
