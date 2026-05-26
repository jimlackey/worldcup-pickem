-- ============================================================================
-- Migration 023: Per-pool About page configuration
-- ============================================================================
--
-- CONTEXT
-- -------
-- The /{slug}/about page used to render fully static copy describing
-- generically how a World Cup pick'em pool works. Pool admins had no
-- way to customise it — every pool got the same wording, the same
-- sections, and there was no place for pool-specific concerns like
-- payouts.
--
-- This migration makes the About page fully per-pool configurable:
--
--   - Three optional sections, each with its own toggle:
--       * about_show_stages          — "The four stages" block
--       * about_show_scoring         — "Scoring" block (prose + grid)
--       * about_show_payout          — "Payout" block (new, off by default)
--
--   - Eight free-text fields the pool admin can edit:
--       * about_header_text          — opening overview paragraph
--       * about_stages_intro_text    — secondary overview paragraph
--                                      (the "four stages: two for
--                                      picking…" prose), shown above
--                                      the stage tiles
--       * about_stage1_text          — description in the Stage 1 tile
--       * about_stage2_text          — description in the Stage 2 tile
--       * about_stage3_text          — description in the Stage 3 tile
--       * about_stage4_text          — description in the Stage 4 tile
--       * about_scoring_text         — prose above the scoring grid
--       * about_payout_text          — prose for the Payout section
--       * about_footer_text          — closing prose at the bottom
--
-- The default values are the exact copy that used to be hard-coded
-- inside src/app/[poolSlug]/about/about-view.tsx, so existing pools
-- read identically after the migration runs. New pools inherit the
-- same defaults via the column-level DEFAULT clause — no separate
-- initialise function needed.
--
-- WHY ON `pools` AND NOT A SIDECAR TABLE
-- --------------------------------------
-- Every other per-pool config flag (consolation_match_enabled,
-- requires_login_to_view, show_fifa_rankings, show_match_lines) lives
-- as a column on `pools`. The About page already fetches the pool row;
-- adding columns here keeps the read path to one query and matches
-- the existing pattern.
--
-- LENGTH BOUND
-- ------------
-- 5000 chars per field is well above what anyone needs for About-page
-- copy and prevents pathological payloads. The Stage descriptions
-- today are ~250 chars each; the header is ~330. The CAP gives ~15×
-- headroom which is plenty without being absurd.
--
-- IDEMPOTENCY
-- -----------
-- ADD COLUMN IF NOT EXISTS makes the schema changes safe to re-run.
-- The CHECK constraints are wrapped in DO blocks so they only attempt
-- creation when missing.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Section toggles.
-- ----------------------------------------------------------------------------
-- Stages and Scoring default ON because they're part of the page today
-- and we want zero behavioural change for existing pools. Payout
-- defaults OFF because the section is brand-new and pools have no
-- payout copy yet — turning it on without copy would render a blank
-- section header.
ALTER TABLE pools
    ADD COLUMN IF NOT EXISTS about_show_stages   BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS about_show_scoring  BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS about_show_payout   BOOLEAN NOT NULL DEFAULT FALSE;

-- ----------------------------------------------------------------------------
-- 2. Free-text fields.
-- ----------------------------------------------------------------------------
-- All defaults mirror the previous hard-coded copy from
-- src/app/[poolSlug]/about/about-view.tsx so the visible page is
-- unchanged on existing pools the moment this runs. Payout and footer
-- default to '' (empty) — admins fill them in if they want them.
ALTER TABLE pools
    ADD COLUMN IF NOT EXISTS about_header_text TEXT NOT NULL DEFAULT
        E'This is a World Cup pick''em pool. Players make predictions for every match in the tournament — first for the group stage, then for the knockout bracket — and earn points for each correct pick. Standings update automatically as match results are entered, and the player with the most points at the end of the Final wins.',
    ADD COLUMN IF NOT EXISTS about_stages_intro_text TEXT NOT NULL DEFAULT
        E'The pool runs in four stages: two for picking, two for playing. Pick deadlines are strict — once a stage locks, those picks can no longer be edited.',
    ADD COLUMN IF NOT EXISTS about_stage1_text TEXT NOT NULL DEFAULT
        E'Pick a winner (or draw) for all 72 group-stage matches. You can create multiple pick sets up to your pool''s limit and edit them as often as you like until the lock time. Once the deadline passes, group picks are frozen for the rest of the tournament.',
    ADD COLUMN IF NOT EXISTS about_stage2_text TEXT NOT NULL DEFAULT
        E'The 12 groups play out their round-robin schedules. Each completed match is graded against your group picks and the points roll into the standings. While group games are underway, all players'' group picks become visible so you can see how you stack up against the rest of the pool.',
    ADD COLUMN IF NOT EXISTS about_stage3_text TEXT NOT NULL DEFAULT
        E'Once the group stage is finalised and the bracket is seeded, the knockout picker opens. Pick the winner for every match across all 31 knockout slots — Round of 32 through the Final. Like group picks, you can edit freely until the lock time; after that, your bracket is frozen.',
    ADD COLUMN IF NOT EXISTS about_stage4_text TEXT NOT NULL DEFAULT
        E'The bracket plays out from R32 to the Final. Each completed knockout match is graded against your bracket picks. Points scale up as the rounds get later (see scoring below), so the Final is worth the most. After the Final, the player with the highest total wins the pool.',
    ADD COLUMN IF NOT EXISTS about_scoring_text TEXT NOT NULL DEFAULT
        E'You earn points for every correct pick. Group-stage picks are graded as home win, draw, or away win. Knockout picks are graded on the team you picked to advance — if your pick wins the match, you score; if they lose (or have already been eliminated in an earlier round), you don''t.',
    ADD COLUMN IF NOT EXISTS about_payout_text TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS about_footer_text TEXT NOT NULL DEFAULT '';

-- ----------------------------------------------------------------------------
-- 3. Length caps.
-- ----------------------------------------------------------------------------
-- 5000 chars per field. Wrapped in DO blocks so re-running the
-- migration after the constraints already exist is a no-op.
DO $$
DECLARE
    col_name TEXT;
    cons_name TEXT;
BEGIN
    FOR col_name IN
        SELECT unnest(ARRAY[
            'about_header_text',
            'about_stages_intro_text',
            'about_stage1_text',
            'about_stage2_text',
            'about_stage3_text',
            'about_stage4_text',
            'about_scoring_text',
            'about_payout_text',
            'about_footer_text'
        ])
    LOOP
        cons_name := 'pools_' || col_name || '_length';
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = cons_name
              AND conrelid = 'pools'::regclass
        ) THEN
            EXECUTE format(
                'ALTER TABLE pools ADD CONSTRAINT %I CHECK (length(%I) <= 5000)',
                cons_name, col_name
            );
        END IF;
    END LOOP;
END $$;
