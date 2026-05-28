import { Resend } from "resend";

// ---------------------------------------------------------------------------
// "Email My Picks" sender (player-initiated).
//
// A player on the /{slug}/my-picks page can email a snapshot of their own
// picks to their own address. This is deliberately a SEPARATE sender from
// resend-broadcast.ts because the envelope and chrome differ:
//
//   - From:    always "World Cup Pick'em <noreply@jimlackey.com>" (the
//              address comes from RESEND_FROM_EMAIL, same env var the
//              broadcast + OTP senders use, so all mail leaves from one
//              configured address).
//   - No "sent by the pool admin (...)" footer — this isn't an admin
//              broadcast, it's the player mailing themselves.
//   - Fixed subject + body shape supplied by the caller; the body already
//              has its widget HTML spliced in, so this sender does NOT run
//              the token pipeline. It just wraps the prebuilt body HTML in
//              the standard card shell.
//
// Reusing the broadcast sender would have meant either injecting an admin
// footer the player shouldn't see or threading a "suppress footer" flag
// through it — more coupling than a small dedicated function. Per the
// project's surgical-change preference, this stays isolated.
// ---------------------------------------------------------------------------

const resend = new Resend(process.env.RESEND_API_KEY!);
const fromEmail = process.env.RESEND_FROM_EMAIL!;

/**
 * The exact "From" header used for own-picks emails, e.g.
 * "World Cup Pick'em <noreply@jimlackey.com>". Exported so the
 * /my-picks explanatory note can display the SAME address the email
 * actually ships from — the note can't lie about the sender because it
 * reads this value (resolved from RESEND_FROM_EMAIL) rather than a
 * separately-hardcoded string.
 *
 * NOTE: the address comes from RESEND_FROM_EMAIL. For the note to read
 * "noreply@jimlackey.com" as intended, that env var must be set to
 * noreply@jimlackey.com in the deployment (and the domain verified in
 * Resend). The example env ships with onboarding@resend.dev.
 */
export const OWN_PICKS_FROM = `World Cup Pick'em <${fromEmail}>`;

export interface SendOwnPicksEmailParams {
  /** Recipient — always the player's own verified session email. */
  to: string;
  subject: string;
  /**
   * The fully-rendered body HTML, widgets already spliced in. Trusted
   * HTML (built server-side from our own widgets), inserted into the
   * card shell verbatim.
   */
  bodyHtml: string;
  /**
   * Plain-text fallback body for clients that don't render HTML. The
   * widget slots are described in words by the caller.
   */
  bodyText: string;
}

/**
 * Send the player's own-picks email through Resend. Returns the same
 * success/error shape as the other senders in this directory.
 */
export async function sendOwnPicksEmail(
  params: SendOwnPicksEmailParams
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await resend.emails.send({
      from: OWN_PICKS_FROM,
      to: [params.to],
      subject: params.subject,
      html: ownPicksEmailHtml(params.bodyHtml),
      text: params.bodyText,
    });

    if (error) {
      console.error("[own-picks] Resend error:", error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    console.error("[own-picks] Email send failed:", err);
    return { success: false, error: "Failed to send email" };
  }
}

// ---------------------------------------------------------------------------
// HTML shell — mirrors the broadcast card styling for visual consistency,
// minus the admin footer.
// ---------------------------------------------------------------------------

function ownPicksEmailHtml(bodyHtml: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fafaf9;padding:40px 20px">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e7e5e4;padding:32px">
    <h1 style="font-size:20px;font-weight:700;margin:0 0 24px">World Cup Pick'em</h1>

    ${bodyHtml}
  </div>
</body>
</html>`;
}
