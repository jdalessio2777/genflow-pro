import { quoteEmailHTML, confirmationEmailHTML } from '@/lib/emailTemplates'

async function buildRaw(to, subject, html, fromHeader) {
  const lines = [
    fromHeader ? `From: ${fromHeader}` : null,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=utf-8`,
    ``,
    html,
  ].filter(l => l !== null)

  const message = lines.join('\r\n')
  const bytes = new TextEncoder().encode(message)
  const binary = Array.from(bytes).map(b => String.fromCharCode(b)).join('')
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function postToGmail(raw, accessToken) {
  const res = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const e = new Error(`Gmail ${res.status}: ${err.error?.message || 'send failed'}`)
    e.status = res.status
    throw e
  }
}

export async function sendRawEmail({ to, subject, html, accessToken }) {
  try {
    const raw = await buildRaw(to, subject, html, 'GenShield Generator Service <contact@genshieldservice.com>')
    await postToGmail(raw, accessToken)
  } catch (e) {
    if (e.status === 401) {
      throw new Error('Google token expired — sign out and sign back in to refresh your connection')
    }
    if (e.status === 403) {
      console.warn('[Gmail] Send As not authorized for contact@genshieldservice.com — sending from default account')
      const raw = await buildRaw(to, subject, html, null)
      await postToGmail(raw, accessToken)
    } else {
      throw e
    }
  }
}

export async function sendQuoteEmail({ customer, job, lineItems, subtotal, discount, total, accessToken }) {
  const approveUrl = `https://genshieldservice.com/approve?job=${job.id}`
  const html = quoteEmailHTML({ customer, job, lineItems, subtotal, discount, total, approveUrl })
  return sendRawEmail({
    to: customer.email,
    subject: `Your Service Quote — GenShield Generator Service`,
    html,
    accessToken,
  })
}

export async function sendConfirmationEmail({ customer, job, techFirstName, accessToken }) {
  const html = confirmationEmailHTML({ customer, job, techFirstName })
  return sendRawEmail({
    to: customer.email,
    subject: `Appointment Confirmed — GenShield Generator Service`,
    html,
    accessToken,
  })
}
