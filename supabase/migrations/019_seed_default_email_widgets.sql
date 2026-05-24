-- ============================================================================
-- Migration 019: Seed default email widgets
--
-- Companion to Phase 2 of the email widget redesign. Phase 1 (migration
-- 018) introduced the custom_email_widgets table and the in-app editor;
-- Phase 2 replaces the five code-defined built-in widgets
-- (standings-summary, missing-group-picks, missing-knockout-picks,
-- group-phase-picks, knockout-round-picks) with editable templates
-- stored as custom_email_widgets rows.
--
-- This migration:
--   1. Defines seed_default_email_widgets_for_pool(pool_id UUID) — a
--      helper function that inserts five rows into custom_email_widgets
--      with the canonical slugs. ON CONFLICT DO NOTHING so admins who
--      already created a widget with one of those slugs (rare; would
--      have required dropping the reserved-slug check in code) keep
--      their custom version.
--   2. Backfills: calls the helper for every existing pool. Pools that
--      already have one of the seeded slugs keep that row (the helper's
--      ON CONFLICT prevents overwrites).
--   3. Installs an AFTER INSERT trigger on pools that calls the helper
--      whenever a new pool is created, so future pools get the five
--      widgets automatically.
--
-- Idempotency:
--   - The function uses CREATE OR REPLACE — safe to re-run.
--   - The backfill block is wrapped in a DO block; ON CONFLICT DO
--     NOTHING handles existing rows.
--   - The trigger uses DROP IF EXISTS + CREATE — safe to re-run.
--
-- Template parity:
--   The five HTML bodies below produce BYTE-IDENTICAL output to the
--   legacy code-rendered widgets when run through the template engine
--   against the same recipient data. Verified via scratch/parity-check
--   scripts in development. Admins editing these rows after seed are
--   on their own — same as any other custom widget.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper function: insert the five default widgets for one pool.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION seed_default_email_widgets_for_pool(p_pool_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $func$
BEGIN
  -- standings-summary
  INSERT INTO custom_email_widgets (pool_id, slug, label, html_body)
  VALUES (
    p_pool_id,
    'standings-summary',
    'Standings summary',
    $tpl${{#each pickSets}}<p style="font-weight:700;font-size:15px;color:#1c1917;margin:18px 0 4px">{{name}}</p><table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;margin:4px 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px"><tbody><tr><td style="padding:3px 12px 3px 0;color:#57534e;font-size:13px;vertical-align:top;white-space:nowrap">Standing</td><td style="padding:3px 0;color:#1c1917;font-size:14px;vertical-align:top">{{#if rank}}<strong>{{rank}}</strong> <span style="color:#a8a29e">of {{pool.totalPickSets}} ({{totalPoints}} points)</span>{{else}}<span style="color:#a8a29e;font-style:italic">not available</span>{{/if}}</td></tr><tr><td style="padding:3px 12px 3px 0;color:#57534e;font-size:13px;vertical-align:top;white-space:nowrap">Group Phase</td><td style="padding:3px 0;color:#1c1917;font-size:14px;vertical-align:top"><strong>{{groupCorrect}}</strong> <span style="color:#a8a29e">correct ({{groupPoints}} points)</span></td></tr><tr><td style="padding:3px 12px 3px 0;color:#57534e;font-size:13px;vertical-align:top;white-space:nowrap">Knockout Phase</td><td style="padding:3px 0;color:#1c1917;font-size:14px;vertical-align:top">{{#if pool.knockoutPhaseStarted}}<strong>{{knockoutCorrect}}</strong> <span style="color:#a8a29e">correct ({{knockoutPoints}} points)</span>{{else}}<span style="color:#a8a29e;font-style:italic">Not yet started</span>{{/if}}</td></tr></tbody></table>{{/each}}$tpl$
  )
  ON CONFLICT (pool_id, slug) DO NOTHING;

  -- missing-group-picks
  INSERT INTO custom_email_widgets (pool_id, slug, label, html_body)
  VALUES (
    p_pool_id,
    'missing-group-picks',
    'Missing group picks',
    $tpl${{#each pickSets}}<p style="font-weight:700;font-size:15px;color:#1c1917;margin:18px 0 4px">{{name}}</p>{{#if missingGroupMatches.length}}<p style="margin:4px 0 14px;color:#a8a29e;font-size:13px;font-style:italic">Missing picks:</p><ul style="margin:4px 0 14px;padding-left:22px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#1c1917;line-height:1.5">{{#each missingGroupMatches}}<li style="margin:2px 0"><strong>{{home}}</strong> vs <strong>{{away}}</strong></li>{{/each}}</ul>{{else}}<p style="margin:4px 0 14px;color:#a8a29e;font-size:13px;font-style:italic">No missing picks</p>{{/if}}{{/each}}$tpl$
  )
  ON CONFLICT (pool_id, slug) DO NOTHING;

  -- missing-knockout-picks
  INSERT INTO custom_email_widgets (pool_id, slug, label, html_body)
  VALUES (
    p_pool_id,
    'missing-knockout-picks',
    'Missing knockout picks',
    $tpl${{#each pickSets}}<p style="font-weight:700;font-size:15px;color:#1c1917;margin:18px 0 4px">{{name}}</p>{{#if missingKnockoutMatches.length}}<p style="margin:4px 0 14px;color:#a8a29e;font-size:13px;font-style:italic">Missing picks:</p><ul style="margin:4px 0 14px;padding-left:22px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#1c1917;line-height:1.5">{{#each missingKnockoutMatches}}<li style="margin:2px 0"><strong>{{home}}</strong> vs <strong>{{away}}</strong></li>{{/each}}</ul>{{else}}<p style="margin:4px 0 14px;color:#a8a29e;font-size:13px;font-style:italic">No missing picks</p>{{/if}}{{/each}}$tpl$
  )
  ON CONFLICT (pool_id, slug) DO NOTHING;

  -- group-phase-picks
  INSERT INTO custom_email_widgets (pool_id, slug, label, html_body)
  VALUES (
    p_pool_id,
    'group-phase-picks',
    'Group picks (full)',
    $tpl${{#each pickSets}}<p style="font-weight:700;font-size:15px;color:#1c1917;margin:18px 0 4px">{{name}}</p><table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;margin:6px 0 14px;width:100%;max-width:560px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px"><thead><tr><th style="text-align:left;padding:6px 10px;background:#f5f5f4;color:#44403c;font-weight:600;font-size:12px;border-bottom:1px solid #e7e5e4">Match</th><th style="text-align:right;padding:6px 10px;background:#f5f5f4;color:#44403c;font-weight:600;font-size:12px;border-bottom:1px solid #e7e5e4">Pick</th></tr></thead><tbody>{{#each groupPickRows}}<tr><td style="padding:5px 10px;border-bottom:1px solid #f5f5f4;color:#1c1917">{{home}} vs {{away}}</td><td style="padding:5px 10px;border-bottom:1px solid #f5f5f4;color:#1c1917;text-align:right;font-weight:500">{{#if isPicked}}{{pickedLabel}}{{else}}<span style="color:#a8a29e">NOT PICKED</span>{{/if}}</td></tr>{{/each}}</tbody></table>{{/each}}$tpl$
  )
  ON CONFLICT (pool_id, slug) DO NOTHING;

  -- knockout-round-picks
  INSERT INTO custom_email_widgets (pool_id, slug, label, html_body)
  VALUES (
    p_pool_id,
    'knockout-round-picks',
    'Knockout picks (full)',
    $tpl${{#each pickSets}}<p style="font-weight:700;font-size:15px;color:#1c1917;margin:18px 0 4px">{{name}}</p>{{#if knockoutRounds.length}}{{#each knockoutRounds}}<p style="font-weight:600;font-size:13px;color:#57534e;margin:14px 0 0">{{label}}</p><table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;margin:6px 0 14px;width:100%;max-width:560px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px"><thead><tr><th style="text-align:left;padding:6px 10px;background:#f5f5f4;color:#44403c;font-weight:600;font-size:12px;border-bottom:1px solid #e7e5e4">Match</th><th style="text-align:right;padding:6px 10px;background:#f5f5f4;color:#44403c;font-weight:600;font-size:12px;border-bottom:1px solid #e7e5e4">Pick</th></tr></thead><tbody>{{#each matches}}<tr><td style="padding:5px 10px;border-bottom:1px solid #f5f5f4;color:#1c1917">{{home}} vs {{away}}</td><td style="padding:5px 10px;border-bottom:1px solid #f5f5f4;color:#1c1917;text-align:right;font-weight:500">{{#if isPicked}}{{pickedLabel}}{{else}}<span style="color:#a8a29e">NOT PICKED</span>{{/if}}</td></tr>{{/each}}</tbody></table>{{/each}}{{else}}<p style="margin:4px 0 14px;color:#a8a29e;font-size:13px;font-style:italic">No knockout matches are available to pick yet.</p>{{/if}}{{/each}}$tpl$
  )
  ON CONFLICT (pool_id, slug) DO NOTHING;
END;
$func$;

-- ---------------------------------------------------------------------------
-- Backfill: seed every existing pool.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  p RECORD;
BEGIN
  FOR p IN SELECT id FROM pools LOOP
    PERFORM seed_default_email_widgets_for_pool(p.id);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Trigger: seed every new pool on insert.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_seed_default_email_widgets()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $func$
BEGIN
  PERFORM seed_default_email_widgets_for_pool(NEW.id);
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_pools_seed_email_widgets ON pools;
CREATE TRIGGER trg_pools_seed_email_widgets
  AFTER INSERT ON pools
  FOR EACH ROW
  EXECUTE FUNCTION trg_seed_default_email_widgets();
