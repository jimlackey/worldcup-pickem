-- ============================================================================
-- Migration 005: Add is_listed column to pools
-- Allows admins to hide pools from the public pool listing
-- while keeping them accessible via direct URL slug
-- ============================================================================

ALTER TABLE pools ADD COLUMN is_listed BOOLEAN NOT NULL DEFAULT true;
