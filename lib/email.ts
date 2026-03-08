import nodemailer from "nodemailer";

/** HTMLレポートをGmail SMTPでメール送信 */
export async function sendReportEmail(
  html: string,
  dateStr: string
): Promise<void> {
  const to = process.env.NOTIFY_EMAIL;
  if (!to) {
    console.warn("NOTIFY_EMAIL not set, skipping email");
    return;
  }

  const user = process.env.GMAIL_USER;
  if (!user) {
    console.warn("GMAIL_USER not set, skipping email");
    return;
  }

  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!pass) {
    console.warn("GMAIL_APP_PASSWORD not set, skipping email");
    return;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: `"StockNote" <${user}>`,
    to,
    subject: `📊 Portfolio Daily Report — ${dateStr}`,
    html,
  });
}
