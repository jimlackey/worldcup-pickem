-- ============================================================================
-- Migration 010: Add requires_login_to_view to pools
-- ============================================================================
--
-- CONTEXT
-- -------
-- Pool admins want the option to keep player rosters / standings / picks
-- private to the people actually playing in the pool. Pool listing on the
-- public landing page is governed by `is_listed` (Migration 005), but a
-- listed pool's standings and picks are still readable by anyone who
-- guesses or is given the slug.
--
-- This migration adds a per-pool toggle that requires a logged-in session
-- to view ANY of the pool's pages other than the auth/login surface. When
-- enabled, an unauthenticated visitor hitting /{slug}, /{slug}/standings,
-- /{slug}/picks, etc., gets bounced to /{slug}/auth/login.
--
-- DEFAULT
-- -------
-- TRUE — privacy-by-default. Existing real pools that pre-date this
-- migration become login-gated until an admin opts back out from the
-- pool settings page. Demo pools, which exist specifically to be browsed
-- without login, are explicitly set to FALSE in this migration so they
-- continue to work as advertised.
--
-- ENFORCEMENT
-- -----------
-- The actual gate lives in the Next.js pool layout
-- (src/app/[poolSlug]/layout.tsx). RLS is unchanged because writes in this
-- app already go through the service role; the column is a thin policy
-- flag the application reads, not a row-security boundary.
-- ============================================================================

ALTER TABLE pools
    ADD COLUMN requires_login_to_view BOOLEAN NOT NULL DEFAULT TRUE;

-- Demo pools are meant to be explored without an account; flip every
-- existing demo to public so they keep behaving the way the seed script
-- and product copy describe. Note: if the seed-demo script is re-run
-- after this migration, the freshly-inserted demo pools will pick up the
-- column default (TRUE) and become login-gated. Either re-run this UPDATE,
-- toggle them via the admin UI, or add `requires_login_to_view: false`
-- to the createDemoPool() insert in scripts/seed-demo.ts.
UPDATE pools
SET requires_login_to_view = FALSE
WHERE is_demo = TRUE;
