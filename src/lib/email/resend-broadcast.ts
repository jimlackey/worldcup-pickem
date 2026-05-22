import { Resend } from "resend";

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
  /** Plain-text body. We render HTML by wrapping this in <pre>-like CSS
   *  so line breaks, spacing, and the standings-summary widget layout
   *  survive intact in HTML mail clients. */
  bodyText: string;
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
 * an array because per-recipient the body is different (the standings
 * widget is expanded per recipient).
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

function broadcastEmailHtml(params: SendBroadcastEmailParams): string {
  // Escape body text before injection — admins type free-form content and
  // we don't want stray "<" or "&" to break the rendered email or worse,
  // become HTML the recipient interprets.
  const safeBody = escapeHtml(params.bodyText);

  // Two newlines → paragraph break, single newline → <br>. This keeps the
  // standings-summary block (which uses single newlines inside, double
  // between pick sets) visually correct in HTML clients while still
  // honouring paragraph spacing the admin types around it.
  const paragraphs = safeBody
    .split(/\n\n+/)
    .map((p) => `<p style="margin:0 0 16px;white-space:pre-wrap;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.5">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");

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

    ${paragraphs}

    <hr style="border:none;border-top:1px solid #e7e5e4;margin:24px 0 12px"/>
    <p style="color:#78716c;font-size:12px;margin:0">
      Sent by the pool admin (${safeAdmin}).
    </p>
  </div>
</body>
</html>`;
}

function broadcastEmailText(params: SendBroadcastEmailParams): string {
  return `World Cup Pick'em — ${params.poolName}\n\n${params.bodyText}\n\n---\nSent by the pool admin (${params.sentByEmail}).`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
