import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { AuditActionType, AuditEntityType } from "./constants";
import type { PoolSession } from "@/types/database";

// ---- Types ----

export interface AuditEventParams {
  /**
   * The pool this event belongs to. Pass `null` for site-wide super-admin
   * events that aren't tied to any single pool (e.g. editing global team
   * metadata). Pool-scoped events should always pass a real pool ID.
   */
  poolId: string | null;

  /** Actor info — pass the session, or provide manually for system events */
  actor:
    | PoolSession
    | { id: string | null; email: string; role: string };

  /** What happened */
  action: AuditActionType;

  /** What type of entity was affected */
  entityType: AuditEntityType;

  /** ID of the affected entity (match ID, pick set ID, etc.) */
  entityId?: string | null;

  /** State before the change (null for creates) */
  oldValue?: Record<string, unknown> | null;

  /** State after the change (null for deletes) */
  newValue?: Record<string, unknown> | null;

  /** Override IP/user-agent if not in a request context (e.g. scripts) */
  ipAddress?: string | null;
  userAgent?: string | null;
}

// ---- Main function ----

/**
 * Write an audit log entry. Call this from any server action or API route
 * after a meaningful state change.
 *
 * This function never throws — audit logging should not break the main flow.
 * Errors are logged to console.
 *
 * For site-wide super-admin events (editing global teams, etc.) pass
 * `poolId: null`. The DB column was made nullable in Migration 009.
 */
export async function logAuditEvent(params: AuditEventParams): Promise<void> {
  try {
    // Resolve actor fields
    const actorId = "participantId" in params.actor
      ? params.actor.participantId
      : params.actor.id;
    const actorEmail = "participantId" in params.actor
      ? params.actor.email
      : params.actor.email;
    const actorRole = "participantId" in params.actor
      ? params.actor.role
      : params.actor.role;

    // Get request metadata if not provided
    let ip = params.ipAddress ?? null;
    let ua = params.userAgent ?? null;

    if (ip === null || ua === null) {
      const meta = await getRequestMeta();
      ip = ip ?? meta.ipAddress;
      ua = ua ?? meta.userAgent;
    }

    const { error } = await supabaseAdmin.from("audit_log").insert({
      pool_id: params.poolId,
      actor_id: actorId,
      actor_email: actorEmail,
      actor_role: actorRole,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId ?? null,
      old_value: params.oldValue ?? null,
      new_value: params.newValue ?? null,
      ip_address: ip,
      user_agent: ua,
    });

    if (error) {
      console.error("[audit] Failed to write audit log:", error.message);
    }
  } catch (err) {
    console.error("[audit] Unexpected error in logAuditEvent:", err);
  }
}

// ---- Convenience wrappers ----

/**
 * Log an audit event for a player action.
 * Shorthand that extracts actor info from the session.
 */
export async function logPlayerAction(
  session: PoolSession,
  action: AuditActionType,
  entityType: AuditEntityType,
  entityId: string | null,
  oldValue?: Record<string, unknown> | null,
  newValue?: Record<string, unknown> | null
): Promise<void> {
  await logAuditEvent({
    poolId: session.poolId,
    actor: session,
    action,
    entityType,
    entityId,
    oldValue,
    newValue,
  });
}

/**
 * Log an audit event for an admin action.
 * Same as logPlayerAction but reads better at call sites.
 */
export async function logAdminAction(
  session: PoolSession,
  action: AuditActionType,
  entityType: AuditEntityType,
  entityId: string | null,
  oldValue?: Record<string, unknown> | null,
  newValue?: Record<string, unknown> | null
): Promise<void> {
  await logAuditEvent({
    poolId: session.poolId,
    actor: session,
    action,
    entityType,
    entityId,
    oldValue,
    newValue,
  });
}

// ---- Request metadata ----

interface RequestMeta {
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Extract IP address and user agent from Next.js request headers.
 * Safe to call from server actions and server components.
 */
async function getRequestMeta(): Promise<RequestMeta> {
  try {
    const headersList = await headers();
    const ipAddress =
      headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headersList.get("x-real-ip") ??
      null;
    const userAgent = headersList.get("user-agent") ?? null;
    return { ipAddress, userAgent };
  } catch {
    // headers() can throw outside of a request context (e.g. in scripts)
    return { ipAddress: null, userAgent: null };
  }
}

/**
 * Exported for cases where callers need the metadata separately
 * (e.g. to pass to logAuditEvent with overrides).
 */
export { getRequestMeta };
