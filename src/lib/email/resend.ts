import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);
const fromEmail = process.env.RESEND_FROM_EMAIL!;

/**
 * Send an OTP login email scoped to a specific pool.
 */
export async function sendOtpEmail(
  to: string,
  code: string,
  poolName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await resend.emails.send({
      from: `World Cup Pick'em <${fromEmail}>`,
      to: [to],
      subject: `${code} — Your login code for ${poolName}`,
      html: otpEmailHtml(code, poolName),
      text: otpEmailText(code, poolName),
    });

    if (error) {
      console.error("Resend error:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error("Email send failed:", err);
    return { success: false, error: "Failed to send email" };
  }
}

/**
 * Send an admin-triggered re-send OTP email.
 */
export async function sendAdminOtpEmail(
  to: string,
  code: string,
  poolName: string,
  adminEmail: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await resend.emails.send({
      from: `World Cup Pick'em <${fromEmail}>`,
      to: [to],
      subject: `${code} — Login code for ${poolName} (sent by admin)`,
      html: otpEmailHtml(code, poolName, adminEmail),
      text: otpEmailText(code, poolName, adminEmail),
    });

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    console.error("Email send failed:", err);
    return { success: false, error: "Failed to send email" };
  }
}

/**
 * Send a super-admin OTP login email. Not scoped to a pool.
 */
export async function sendSuperAdminOtpEmail(
  to: string,
  code: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await resend.emails.send({
      from: `World Cup Pick'em <${fromEmail}>`,
      to: [to],
      subject: `${code} — Super-admin login code`,
      html: superAdminOtpEmailHtml(code),
      text: superAdminOtpEmailText(code),
    });

    if (error) {
      console.error("Resend error:", error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    console.error("Email send failed:", err);
    return { success: false, error: "Failed to send email" };
  }
}

/**
 * Notify all pool admins that someone has requested access. The email
 * carries the requestor's address, their free-text referral note, and a
 * tokenised "Grant access" link. Sent to every admin at once (the first
 * to click grants).
 */
export async function sendAccessRequestEmail(
  adminEmails: string[],
  opts: {
    poolName: string;
    requestorEmail: string;
    referralText: string;
    grantUrl: string;
  }
): Promise<{ success: boolean; error?: string }> {
  if (adminEmails.length === 0) {
    return { success: false, error: "No pool admins to notify." };
  }
  try {
    const { error } = await resend.emails.send({
      from: `World Cup Pick'em <${fromEmail}>`,
      to: adminEmails,
      subject: `Access request for ${opts.poolName} — ${opts.requestorEmail}`,
      html: accessRequestEmailHtml(opts),
      text: accessRequestEmailText(opts),
    });

    if (error) {
      console.error("Resend error:", error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    console.error("Email send failed:", err);
    return { success: false, error: "Failed to send email" };
  }
}

/**
 * Tell the requestor their access was granted and they can now log in.
 */
export async function sendAccessGrantedEmail(
  to: string,
  opts: { poolName: string; loginUrl: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await resend.emails.send({
      from: `World Cup Pick'em <${fromEmail}>`,
      to: [to],
      subject: `You're in — access granted for ${opts.poolName}`,
      html: accessGrantedEmailHtml(opts),
      text: accessGrantedEmailText(opts),
    });

    if (error) {
      console.error("Resend error:", error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    console.error("Email send failed:", err);
    return { success: false, error: "Failed to send email" };
  }
}

// Minimal HTML escaper for user-supplied values spliced into email HTML
// (requestor email + free-text referral note). Keeps the threat surface
// closed even though only admins read these.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function accessRequestEmailHtml(opts: {
  poolName: string;
  requestorEmail: string;
  referralText: string;
  grantUrl: string;
}): string {
  const referralBlock = opts.referralText.trim()
    ? `<div style="background:#f5f5f4;border-radius:8px;padding:14px 16px;margin:0 0 20px">
         <p style="color:#78716c;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px">Who referred them</p>
         <p style="font-size:14px;margin:0;white-space:pre-wrap;color:#1c1917">${escapeHtml(
           opts.referralText
         )}</p>
       </div>`
    : `<p style="color:#78716c;font-size:13px;margin:0 0 20px">(No referral details provided.)</p>`;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fafaf9;padding:40px 20px">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e7e5e4;padding:32px">
    <h1 style="font-size:20px;font-weight:700;margin:0 0 4px">World Cup Pick'em</h1>
    <p style="color:#57534e;font-size:14px;margin:0 0 24px">${escapeHtml(
      opts.poolName
    )}</p>

    <p style="font-size:15px;margin:0 0 8px">Someone has requested access to your pool:</p>
    <p style="font-size:16px;font-weight:600;margin:0 0 20px;color:#1c1917">${escapeHtml(
      opts.requestorEmail
    )}</p>

    ${referralBlock}

    <a href="${opts.grantUrl}" style="display:block;text-align:center;background:#16a34a;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 16px;border-radius:8px;margin:0 0 16px">
      Grant access
    </a>

    <p style="color:#78716c;font-size:13px;margin:0">
      Clicking "Grant access" adds ${escapeHtml(
        opts.requestorEmail
      )} to this pool's invite list and emails them that they can log in. Any pool admin can approve — the first click is all it takes. If you don't recognise this person, you can safely ignore this email.
    </p>
  </div>
</body>
</html>`;
}

function accessRequestEmailText(opts: {
  poolName: string;
  requestorEmail: string;
  referralText: string;
  grantUrl: string;
}): string {
  const referral = opts.referralText.trim()
    ? `\n\nWho referred them:\n${opts.referralText}`
    : `\n\n(No referral details provided.)`;
  return `World Cup Pick'em — ${opts.poolName}

Someone has requested access to your pool:
${opts.requestorEmail}${referral}

Grant access (adds them to the invite list and notifies them):
${opts.grantUrl}

Any pool admin can approve — the first click is all it takes. If you don't recognise this person, you can safely ignore this email.`;
}

function accessGrantedEmailHtml(opts: {
  poolName: string;
  loginUrl: string;
}): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fafaf9;padding:40px 20px">
  <div style="max-width:440px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e7e5e4;padding:32px">
    <h1 style="font-size:20px;font-weight:700;margin:0 0 4px">World Cup Pick'em</h1>
    <p style="color:#57534e;font-size:14px;margin:0 0 24px">${escapeHtml(
      opts.poolName
    )}</p>

    <p style="font-size:15px;margin:0 0 20px">Good news — a pool admin has approved your request. You can now log in and start making your picks.</p>

    <a href="${opts.loginUrl}" style="display:block;text-align:center;background:#16a34a;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 16px;border-radius:8px;margin:0 0 16px">
      Log in to ${escapeHtml(opts.poolName)}
    </a>

    <p style="color:#78716c;font-size:13px;margin:0">
      Use this same email address when you log in. We'll send you a 6-digit code to confirm it's you.
    </p>
  </div>
</body>
</html>`;
}

function accessGrantedEmailText(opts: {
  poolName: string;
  loginUrl: string;
}): string {
  return `World Cup Pick'em — ${opts.poolName}

Good news — a pool admin has approved your request. You can now log in and start making your picks.

Log in: ${opts.loginUrl}

Use this same email address when you log in. We'll send you a 6-digit code to confirm it's you.`;
}

function otpEmailHtml(
  code: string,
  poolName: string,
  sentBy?: string
): string {
  const sentByLine = sentBy
    ? `<p style="color:#78716c;font-size:13px;margin-top:12px">This code was sent by the pool admin (${sentBy}).</p>`
    : "";

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fafaf9;padding:40px 20px">
  <div style="max-width:440px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e7e5e4;padding:32px">
    <h1 style="font-size:20px;font-weight:700;margin:0 0 4px">World Cup Pick'em</h1>
    <p style="color:#57534e;font-size:14px;margin:0 0 24px">${poolName}</p>

    <p style="font-size:15px;margin:0 0 16px">Here's your login code:</p>

    <div style="background:#f5f5f4;border-radius:8px;padding:16px;text-align:center;margin:0 0 16px">
      <span style="font-family:'JetBrains Mono',monospace;font-size:32px;font-weight:700;letter-spacing:6px;color:#1c1917">${code}</span>
    </div>

    <p style="color:#78716c;font-size:13px;margin:0">
      This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.
    </p>
    ${sentByLine}
  </div>
</body>
</html>`;
}

function otpEmailText(
  code: string,
  poolName: string,
  sentBy?: string
): string {
  const sentByLine = sentBy
    ? `\n\nThis code was sent by the pool admin (${sentBy}).`
    : "";

  return `World Cup Pick'em — ${poolName}\n\nYour login code: ${code}\n\nThis code expires in 10 minutes. If you didn't request this, you can safely ignore this email.${sentByLine}`;
}

function superAdminOtpEmailHtml(code: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fafaf9;padding:40px 20px">
  <div style="max-width:440px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e7e5e4;padding:32px">
    <h1 style="font-size:20px;font-weight:700;margin:0 0 4px">World Cup Pick'em</h1>
    <p style="color:#57534e;font-size:14px;margin:0 0 24px">Super-admin login</p>

    <p style="font-size:15px;margin:0 0 16px">Here's your super-admin login code:</p>

    <div style="background:#f5f5f4;border-radius:8px;padding:16px;text-align:center;margin:0 0 16px">
      <span style="font-family:'JetBrains Mono',monospace;font-size:32px;font-weight:700;letter-spacing:6px;color:#1c1917">${code}</span>
    </div>

    <p style="color:#78716c;font-size:13px;margin:0">
      This code expires in 10 minutes. If you didn't request this, someone may be trying to access the super-admin panel — you can safely ignore this email.
    </p>
  </div>
</body>
</html>`;
}

function superAdminOtpEmailText(code: string): string {
  return `World Cup Pick'em — Super-admin login\n\nYour login code: ${code}\n\nThis code expires in 10 minutes. If you didn't request this, someone may be trying to access the super-admin panel — you can safely ignore this email.`;
}
