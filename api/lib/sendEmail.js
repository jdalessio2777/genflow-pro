const DEFAULT_FROM = 'GenShield <contact@genshieldservice.com>';

export async function sendEmail({ to, subject, html, from = DEFAULT_FROM, attachments }) {
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
      ...(attachments ? { attachments } : {}),
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`Resend error ${resp.status}: ${JSON.stringify(err)}`);
  }

  return resp.json();
}
