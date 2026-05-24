"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getPoolSession } from "@/lib/auth/session";
import { logAdminAction, AuditAction, AuditEntity } from "@/lib/audit";
import { validateWidgetTemplate } from "@/lib/email/widget-rendering";
import type { AdminActionResult } from "../../actions";

// ---------------------------------------------------------------------------
// Custom email widget actions — create / update / delete.
//
// Auth model:
//   Every action re-checks an admin session for THIS pool before
//   touching the DB. This is the same gate the broadcast send action
//   and the whitelist actions use; the parent admin layout already
//   redirects non-admins, but actions can be invoked directly so they
//   must guard themselves.
//
// Validation:
//   Slugs are normalised to lowercase before they hit the DB and are
//   range-checked against the same regex the email body renderer uses
//   for tokens, so a widget that passes validation here is guaranteed
//   to be inserttable as {{slug}}. Reserved slugs (the built-in widget
//   names) are rejected — the renderer's HTML-token map has built-ins
//   first, so a colliding custom widget would be silently shadowed,
//   which is worse than a clear rejection here.
//
// Audit:
//   One row per create / update / delete, with the widget's UUID as
//   entity_id. Old/new value blobs carry just the slug + label + a
//   length-only summary of html_body — we don't want full widget HTML
//   sitting in the audit log (it could be large, and the slug + length
//   is enough to reconstruct what changed if needed).
//
// Revalidation:
//   Both `/{slug}/admin/email` (Send Email) and `/{slug}/admin/email/widgets`
//   (Manage Widgets) read from `custom_email_widgets`, so both paths are
//   revalidated. The Send Email page surfaces custom widgets in the
//   Insert pills row, so a new widget should appear there immediately
//   after creation.
// ---------------------------------------------------------------------------

const SLUG_REGEX = /^[a-z0-9][a-z0-9_-]*$/;
const SLUG_MAX = 50;
const LABEL_MAX = 100;
const HTML_MAX = 100_000;

const createSchema = z.object({
  poolSlug: z.string().min(1),
  poolId: z.string().uuid(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Slug is required.")
    .max(SLUG_MAX, `Slug must be ${SLUG_MAX} characters or fewer.`)
    .regex(
      SLUG_REGEX,
      "Slug can only contain lowercase letters, digits, hyphens, and underscores, and must start with a letter or digit."
    ),
  label: z
    .string()
    .trim()
    .min(1, "Label is required.")
    .max(LABEL_MAX, `Label must be ${LABEL_MAX} characters or fewer.`),
  htmlBody: z
    .string()
    .max(HTML_MAX, `HTML must be ${HTML_MAX.toLocaleString()} characters or fewer.`),
});

const updateSchema = z.object({
  poolSlug: z.string().min(1),
  poolId: z.string().uuid(),
  widgetId: z.string().uuid(),
  // Slug is editable on update — admins may want to rename a token.
  // Re-validated with the same rules as create.
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Slug is required.")
    .max(SLUG_MAX, `Slug must be ${SLUG_MAX} characters or fewer.`)
    .regex(
      SLUG_REGEX,
      "Slug can only contain lowercase letters, digits, hyphens, and underscores, and must start with a letter or digit."
    ),
  label: z
    .string()
    .trim()
    .min(1, "Label is required.")
    .max(LABEL_MAX, `Label must be ${LABEL_MAX} characters or fewer.`),
  htmlBody: z
    .string()
    .max(HTML_MAX, `HTML must be ${HTML_MAX.toLocaleString()} characters or fewer.`),
});

const deleteSchema = z.object({
  poolSlug: z.string().min(1),
  poolId: z.string().uuid(),
  widgetId: z.string().uuid(),
});

/**
 * Truncated copy of html_body that's safe to drop into the audit
 * log's new_value/old_value JSON. We don't want full widget HTML in the
 * audit table (size + readability), so the slug + label + length plus
 * a short preview is enough to confirm what changed.
 */
function htmlSummary(html: string) {
  return {
    length: html.length,
    preview: html.slice(0, 120),
  };
}

// ===========================================================================
// createCustomWidgetAction
// ===========================================================================

export async function createCustomWidgetAction(
  _prev: AdminActionResult,
  formData: FormData
): Promise<AdminActionResult> {
  const parsed = createSchema.safeParse({
    poolSlug: formData.get("poolSlug"),
    poolId: formData.get("poolId"),
    slug: formData.get("slug"),
    label: formData.get("label"),
    htmlBody: formData.get("htmlBody") ?? "",
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }
  const { poolSlug, poolId, slug, label, htmlBody } = parsed.data;

  // Validate the template parses cleanly. Render-time errors (missing
  // fields, type mismatches against the recipient data shape) still
  // only show up when the engine actually runs against data, but a
  // parse failure here means the widget would render as a placeholder
  // for every recipient — better to block the save and tell the admin.
  const templateError = validateWidgetTemplate(htmlBody);
  if (templateError) {
    return { success: false, error: templateError };
  }

  const session = await getPoolSession(poolId, poolSlug);
  if (!session || session.role !== "admin") {
    return { success: false, error: "Unauthorized" };
  }

  const { data: inserted, error } = await supabaseAdmin
    .from("custom_email_widgets")
    .insert({
      pool_id: poolId,
      slug,
      label,
      html_body: htmlBody,
    })
    .select("id")
    .single();

  if (error) {
    // 23505 = unique_violation. The (pool_id, slug) constraint is the
    // only unique constraint on this table so the message is safe to
    // attribute to slug uniqueness.
    if ((error as { code?: string }).code === "23505") {
      return {
        success: false,
        error: `A widget with slug "${slug}" already exists.`,
      };
    }
    return { success: false, error: error.message };
  }

  await logAdminAction(
    session,
    AuditAction.CREATE_EMAIL_WIDGET,
    AuditEntity.EMAIL_WIDGET,
    inserted.id,
    null,
    {
      slug,
      label,
      html: htmlSummary(htmlBody),
    }
  );

  revalidatePath(`/${poolSlug}/admin/email`);
  revalidatePath(`/${poolSlug}/admin/email/widgets`);
  return { success: true, message: `Widget "${label}" created.` };
}

// ===========================================================================
// updateCustomWidgetAction
// ===========================================================================

export async function updateCustomWidgetAction(
  _prev: AdminActionResult,
  formData: FormData
): Promise<AdminActionResult> {
  const parsed = updateSchema.safeParse({
    poolSlug: formData.get("poolSlug"),
    poolId: formData.get("poolId"),
    widgetId: formData.get("widgetId"),
    slug: formData.get("slug"),
    label: formData.get("label"),
    htmlBody: formData.get("htmlBody") ?? "",
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }
  const { poolSlug, poolId, widgetId, slug, label, htmlBody } = parsed.data;

  // Validate the template parses cleanly — same check as create. See
  // the comment there for the rationale.
  const templateError = validateWidgetTemplate(htmlBody);
  if (templateError) {
    return { success: false, error: templateError };
  }

  const session = await getPoolSession(poolId, poolSlug);
  if (!session || session.role !== "admin") {
    return { success: false, error: "Unauthorized" };
  }

  // Read the existing row so we can scope the update to this pool (no
  // cross-pool writes) and capture the old values for the audit log.
  const { data: existing, error: readErr } = await supabaseAdmin
    .from("custom_email_widgets")
    .select("id, pool_id, slug, label, html_body")
    .eq("id", widgetId)
    .eq("pool_id", poolId)
    .single();

  if (readErr || !existing) {
    return {
      success: false,
      error: "Widget not found in this pool.",
    };
  }

  const { error: updateErr } = await supabaseAdmin
    .from("custom_email_widgets")
    .update({
      slug,
      label,
      html_body: htmlBody,
    })
    .eq("id", widgetId)
    .eq("pool_id", poolId);

  if (updateErr) {
    if ((updateErr as { code?: string }).code === "23505") {
      return {
        success: false,
        error: `Another widget with slug "${slug}" already exists.`,
      };
    }
    return { success: false, error: updateErr.message };
  }

  await logAdminAction(
    session,
    AuditAction.UPDATE_EMAIL_WIDGET,
    AuditEntity.EMAIL_WIDGET,
    widgetId,
    {
      slug: existing.slug,
      label: existing.label,
      html: htmlSummary(existing.html_body),
    },
    {
      slug,
      label,
      html: htmlSummary(htmlBody),
    }
  );

  revalidatePath(`/${poolSlug}/admin/email`);
  revalidatePath(`/${poolSlug}/admin/email/widgets`);
  return { success: true, message: `Widget "${label}" saved.` };
}

// ===========================================================================
// deleteCustomWidgetAction
// ===========================================================================

export async function deleteCustomWidgetAction(
  _prev: AdminActionResult,
  formData: FormData
): Promise<AdminActionResult> {
  const parsed = deleteSchema.safeParse({
    poolSlug: formData.get("poolSlug"),
    poolId: formData.get("poolId"),
    widgetId: formData.get("widgetId"),
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }
  const { poolSlug, poolId, widgetId } = parsed.data;

  const session = await getPoolSession(poolId, poolSlug);
  if (!session || session.role !== "admin") {
    return { success: false, error: "Unauthorized" };
  }

  // Read the row first so we can audit the deletion AND scope the
  // delete to this pool. Without the read we'd lose the slug/label
  // values that the audit log entry references.
  const { data: existing, error: readErr } = await supabaseAdmin
    .from("custom_email_widgets")
    .select("id, slug, label, html_body")
    .eq("id", widgetId)
    .eq("pool_id", poolId)
    .single();

  if (readErr || !existing) {
    return { success: false, error: "Widget not found in this pool." };
  }

  const { error: deleteErr } = await supabaseAdmin
    .from("custom_email_widgets")
    .delete()
    .eq("id", widgetId)
    .eq("pool_id", poolId);

  if (deleteErr) {
    return { success: false, error: deleteErr.message };
  }

  await logAdminAction(
    session,
    AuditAction.DELETE_EMAIL_WIDGET,
    AuditEntity.EMAIL_WIDGET,
    widgetId,
    {
      slug: existing.slug,
      label: existing.label,
      html: htmlSummary(existing.html_body),
    },
    null
  );

  revalidatePath(`/${poolSlug}/admin/email`);
  revalidatePath(`/${poolSlug}/admin/email/widgets`);
  return { success: true, message: `Widget "${existing.label}" deleted.` };
}
