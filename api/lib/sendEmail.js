const DEFAULT_FROM = 'GenShield <contact@genshieldservice.com>';
const BCC_ADDRESS = 'contact@genshieldservice.com';

// Every customer-facing send gets a BCC copy at BCC_ADDRESS. Pass internal: true
// for sends that already go to a team/internal address (team notifications,
// financial reports) so they don't get a redundant copy of themselves.
export async function sendEmail({ to, subject, html, from = DEFAULT_FROM, attachments, internal = false }) {
  const toList = (Array.isArray(to) ? to : [to]).map(a => a?.toLowerCase());
  const shouldBcc = !internal && !toList.includes(BCC_ADDRESS);

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
      ...(shouldBcc ? { bcc: BCC_ADDRESS } : {}),
      ...(attachments ? { attachments } : {}),
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`Resend error ${resp.status}: ${JSON.stringify(err)}`);
  }

  return resp.json();
}
