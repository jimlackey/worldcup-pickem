import { Resend } from "resend";
import {
  renderEmailBodyHtml,
  type RenderTokens,
} from "./render-email-body";

// ---------------------------------------------------------------------------
// Admin broadcast email sender.
//
// Lives alongside resend.ts (the OTP sender) but is its own file so the
// existing OTP sending path stays untouched — pulled out per the project's
// "surgical, scoped changes" preference.
//
// The Resend SDK is initialized identically: pulls the API key and "from"
// address from the same env vars (RESEND_API_KEY, RESEND_FROM_EMAIL). The
// pool's display name flows into the "From" header so recipients see e.g.
// "World Cup Pick'em <noreply@…>" the same way they see it on OTP emails.
//
// Body rendering:
//   The body is composed of admin freeform text plus widget {{tokens}}.
//   All widgets currently emit raw inline-styled HTML (label/value
//   tables, bulleted lists, and full pick tables). The renderEmailBodyHtml
//   helper handles the escape/no-escape split — see render-email-body.ts
//   for the full pipeline. The token family map (html vs plain) is
//   preserved so a future widget can opt back into plain-text output
//   without changing the substitution layer.
//
// Note on Resend rate limits / plan upgrade:
//   The Resend free tier rate-limits sends per second and per day. When
//   broadcasting to a non-trivial number of players this will hit those
//   limits. The action layer (see admin/email/actions.ts) drips sends
//   sequentially with a small delay, but the practical fix at scale is a
//   paid Resend plan — the user has acknowledged this in their request.
// ---------------------------------------------------------------------------

const resend = new Resend(process.env.RESEND_API_KEY!);
const fromEmail = process.env.RESEND_FROM_EMAIL!;

export interface SendBroadcastEmailParams {
  to: string;
  subject: string;
  /**
   * The admin's body BEFORE token substitution. Token expansion happens
   * inside this function so the HTML / plain-text split is honoured.
   */
  body: string;
  /** Per-recipient widget output values, partitioned by family. */
  tokens: RenderTokens;
  /** Pool name used in the "From" display label. */
  poolName: string;
  /** Admin email — included in the email footer so recipients know who
   *  sent it. Mirrors the "sent by admin" treatment on admin OTP resends. */
  sentByEmail: string;
}

/**
 * Send a single broadcast email through Resend.
 *
 * Returns success/error like the other helpers in resend.ts. The caller
 * is responsible for iterating recipients — we deliberately don't take
 * an array because per-recipient the token expansion is different (the
 * widgets are expanded per recipient).
 */
export async function sendBroadcastEmail(
  params: SendBroadcastEmailParams
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await resend.emails.send({
      from: `World Cup Pick'em <${fromEmail}>`,
      to: [params.to],
      subject: params.subject,
      html: broadcastEmailHtml(params),
      text: broadcastEmailText(params),
    });

    if (error) {
      console.error("[broadcast] Resend error:", error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    console.error("[broadcast] Email send failed:", err);
    return { success: false, error: "Failed to send email" };
  }
}

// ---------------------------------------------------------------------------
// HTML / Text renderers
// ---------------------------------------------------------------------------

const BROADCAST_PARAGRAPH_STYLE =
  "margin:0 0 16px;white-space:pre-wrap;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.5";

function broadcastEmailHtml(params: SendBroadcastEmailParams): string {
  // The renderer handles tokenization + escape correctly: plain-text
  // tokens are inlined then escaped along with the admin's body; HTML
  // tokens are spliced in raw after the escape step.
  const bodyHtml = renderEmailBodyHtml(
    params.body,
    params.tokens,
    BROADCAST_PARAGRAPH_STYLE
  );

  const safePool = escapeHtml(params.poolName);
  const safeAdmin = escapeHtml(params.sentByEmail);

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fafaf9;padding:40px 20px">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e7e5e4;padding:32px">
    <h1 style="font-size:20px;font-weight:700;margin:0 0 4px">World Cup Pick'em</h1>
    <p style="color:#57534e;font-size:14px;margin:0 0 24px">${safePool}</p>

    ${bodyHtml}

    <hr style="border:none;border-top:1px solid #e7e5e4;margin:24px 0 12px"/>
    <p style="color:#78716c;font-size:12px;margin:0">
      Sent by the pool admin (${safeAdmin}).
    </p>
  </div>
</body>
</html>`;
}

function broadcastEmailText(params: SendBroadcastEmailParams): string {
  // For the plaintext fallback (clients that don't render HTML) every
  // widget token is replaced with the same brief notice. We use a
  // per-widget label so a body that includes more than one widget reads
  // sensibly in plaintext clients — each widget's slot still describes
  // what was meant to appear there.
  const HTML_TOKEN_LABELS: Record<string, string> = {
    "standings-summary": "Standings summary",
    "missing-group-picks": "Missing group picks",
    "missing-knockout-picks": "Missing knockout picks",
    "group-phase-picks": "Group phase picks",
    "knockout-round-picks": "Knockout round picks",
  };
  const plainBody = params.body.replace(
    /\{\{([a-zA-Z0-9_-]+)\}\}/g,
    (match, name: string) => {
      if (Object.prototype.hasOwnProperty.call(params.tokens.html, name)) {
        const label = HTML_TOKEN_LABELS[name] ?? name;
        return `[ ${label} — view in an HTML-capable email client ]`;
      }
      if (Object.prototype.hasOwnProperty.call(params.tokens.plain, name)) {
        return params.tokens.plain[name];
      }
      return match;
    }
  );
  return `World Cup Pick'em — ${params.poolName}\n\n${plainBody}\n\n---\nSent by the pool admin (${params.sentByEmail}).`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
