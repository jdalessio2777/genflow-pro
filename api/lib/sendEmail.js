const DEFAULT_FROM = 'GenShield <office@genshieldservice.com>';
const DEFAULT_REPLY_TO = 'contact@genshieldservice.com';
const BCC_ADDRESSES = ['contact@genshieldservice.com', 'derek.j.sainz@gmail.com'];

// Every customer-facing send gets a BCC copy at each of BCC_ADDRESSES. Pass
// internal: true for sends that already go to a team/internal address (team
// notifications, financial reports) so they don't get a redundant copy of
// themselves. Any address already a direct recipient is skipped so it isn't
// BCC'd on a copy it's already getting directly.
export async function sendEmail({ to, subject, html, from = DEFAULT_FROM, replyTo = DEFAULT_REPLY_TO, attachments, internal = false }) {
  const toList = (Array.isArray(to) ? to : [to]).map(a => a?.toLowerCase());
  const bcc = internal ? [] : BCC_ADDRESSES.filter(addr => !toList.includes(addr));

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
      ...(replyTo ? { reply_to: replyTo } : {}),
      ...(bcc.length ? { bcc } : {}),
      ...(attachments ? { attachments } : {}),
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`Resend error ${resp.status}: ${JSON.stringify(err)}`);
  }

  return resp.json();
}
