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
