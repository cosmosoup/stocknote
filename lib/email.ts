import { Resend } from "resend";

/** HTMLレポートをメール送信 */
export async function sendReportEmail(
  html: string,
  dateStr: string
): Promise<void> {
  const to = process.env.NOTIFY_EMAIL;
  if (!to) {
    console.warn("NOTIFY_EMAIL not set, skipping email");
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY not set, skipping email");
    return;
  }

  // ビルド時に初期化されないようlazyに生成
  const resend = new Resend(apiKey);

  const { error } = await resend.emails.send({
    from: "Portfolio Report <report@resend.dev>",
    to: [to],
    subject: `📊 Portfolio Daily Report — ${dateStr}`,
    html,
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
}
