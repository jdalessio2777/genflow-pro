function fmt(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function fmtTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function fmtJobType(raw) {
  if (!raw) return '—'
  return raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function header() {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0D1014;">
      <tr>
        <td style="padding:28px 40px 24px;">
          <div style="font-family:Arial,sans-serif;font-size:28px;font-weight:700;letter-spacing:2px;color:#C8CDD5;">
            GEN<span style="color:#E03010;">SHIELD</span>
          </div>
          <div style="font-family:Arial,sans-serif;font-size:10px;font-weight:600;letter-spacing:3px;color:#68788C;margin-top:4px;text-transform:uppercase;">
            Standby Generator Service &amp; Repair
          </div>
          <div style="font-family:Arial,sans-serif;font-size:13px;color:#A8B4C4;margin-top:6px;font-style:italic;">
            Your generator protected. Always.
          </div>
        </td>
      </tr>
    </table>`
}

function divider() {
  return `<div style="height:3px;background:linear-gradient(to right,#CC2200,transparent);margin:0 0 28px 0;"></div>`
}

function referralBar() {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff8f0;border:1px solid #f0d0c0;border-radius:8px;margin:24px 0;">
      <tr>
        <td style="padding:18px 24px;">
          <div style="font-family:Arial,sans-serif;font-size:14px;color:#5a2a1a;">
            🛡️ &nbsp;<strong>Know someone who needs generator service?</strong>
          </div>
          <div style="font-family:Arial,sans-serif;font-size:13px;color:#7a4a3a;margin-top:6px;">
            Refer them to GenShield and earn rewards toward your next service.
            <a href="https://genshieldservice.com/rewards" style="color:#CC2200;font-weight:600;">Learn more →</a>
          </div>
        </td>
      </tr>
    </table>`
}

function trustBar() {
  const items = [
    ['🏅', 'Generac Authorized'],
    ['⚡', '8+ Years Experience'],
    ['🚨', '24/7 Emergency Response'],
    ['📋', 'Flat-Rate Repairs'],
  ]
  const cells = items.map(([icon, label]) => `
    <td style="text-align:center;padding:16px 8px;width:25%;">
      <div style="font-size:20px;">${icon}</div>
      <div style="font-family:Arial,sans-serif;font-size:11px;color:#A8B4C4;margin-top:6px;font-weight:600;letter-spacing:0.5px;">${label}</div>
    </td>`).join('')
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0D1014;margin-top:24px;">
      <tr>${cells}</tr>
    </table>`
}

function footer() {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0D1014;">
      <tr>
        <td style="padding:20px 40px;text-align:center;font-family:Arial,sans-serif;font-size:12px;color:#68788C;border-top:1px solid #252E3C;">
          (973) 787-2431 &nbsp;·&nbsp; contact@genshieldservice.com &nbsp;·&nbsp; genshieldservice.com<br>
          <span style="font-size:11px;margin-top:4px;display:inline-block;">Generac Authorized Independent Service Dealer</span>
        </td>
      </tr>
    </table>`
}

export function quoteEmailHTML({ customer, job, lineItems = [], subtotal = 0, discount = 0, total = 0, approveUrl }) {
  const quoteNum = (job.id || '').slice(0, 8).toUpperCase()
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  const generatorInfo = [customer.generator_model, customer.generator_serial].filter(Boolean).join(' · ')

  const lineRows = lineItems.map((item, i) => `
    <tr style="background:${i % 2 === 0 ? '#ffffff' : '#fafafa'};">
      <td style="padding:10px 16px;font-family:Arial,sans-serif;font-size:13px;color:#374151;border-bottom:1px solid #f0f0f0;">${item.description}</td>
      <td style="padding:10px 16px;font-family:Arial,sans-serif;font-size:13px;color:#6b7280;text-align:center;border-bottom:1px solid #f0f0f0;white-space:nowrap;">${item.qty}</td>
      <td style="padding:10px 16px;font-family:Arial,sans-serif;font-size:13px;font-weight:600;text-align:right;border-bottom:1px solid #f0f0f0;white-space:nowrap;">${fmt(item.amount)}</td>
    </tr>`).join('')

  const discountRow = discount > 0 ? `
    <tr>
      <td colspan="2" style="padding:8px 16px;font-family:Arial,sans-serif;font-size:13px;color:#CC2200;">Member Discount</td>
      <td style="padding:8px 16px;font-family:Arial,sans-serif;font-size:13px;color:#CC2200;text-align:right;font-weight:600;">-${fmt(discount)}</td>
    </tr>` : ''

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:16px;background:#f3f4f6;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.1);">

      <tr><td>${header()}</td></tr>

      <tr><td style="padding:32px 40px 0;">
        <p style="font-size:15px;color:#374151;margin:0 0 8px;">Hi ${customer.name},</p>
        <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.7;">
          Thank you for choosing GenShield — we truly appreciate the opportunity to keep your home protected.
          Please review your service quote below and approve when you're ready. We'll get you scheduled right away.
        </p>
        ${divider()}

        <!-- Quote details card -->
        <div style="border-left:4px solid #CC2200;background:#f8f8f8;border-radius:0 8px 8px 0;padding:20px 24px;margin-bottom:24px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:4px 0;font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:1px;width:140px;">Quote #</td>
              <td style="padding:4px 0;font-size:13px;color:#111827;font-weight:600;">${quoteNum}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Date Issued</td>
              <td style="padding:4px 0;font-size:13px;color:#374151;">${today}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Expires</td>
              <td style="padding:4px 0;font-size:13px;color:#CC2200;font-weight:600;">${expires}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Service Type</td>
              <td style="padding:4px 0;font-size:13px;color:#374151;">${fmtJobType(job.job_type)}</td>
            </tr>
            ${generatorInfo ? `<tr>
              <td style="padding:4px 0;font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Generator</td>
              <td style="padding:4px 0;font-size:13px;color:#374151;">${generatorInfo}</td>
            </tr>` : ''}
            ${customer.address ? `<tr>
              <td style="padding:4px 0;font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Service Address</td>
              <td style="padding:4px 0;font-size:13px;color:#374151;">${customer.address}</td>
            </tr>` : ''}
          </table>
        </div>

        <!-- Line items table -->
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:16px;">
          <thead>
            <tr style="background:#0D1014;">
              <th style="padding:11px 16px;font-size:11px;font-weight:600;color:#A8B4C4;text-align:left;text-transform:uppercase;letter-spacing:1px;">Description</th>
              <th style="padding:11px 16px;font-size:11px;font-weight:600;color:#A8B4C4;text-align:center;text-transform:uppercase;letter-spacing:1px;">Qty</th>
              <th style="padding:11px 16px;font-size:11px;font-weight:600;color:#A8B4C4;text-align:right;text-transform:uppercase;letter-spacing:1px;">Amount</th>
            </tr>
          </thead>
          <tbody>${lineRows}</tbody>
        </table>

        <!-- Totals -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f8f8;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:28px;">
          <tr>
            <td colspan="2" style="padding:10px 16px;font-size:13px;color:#6b7280;">Subtotal</td>
            <td style="padding:10px 16px;font-size:13px;text-align:right;color:#374151;">${fmt(subtotal)}</td>
          </tr>
          ${discountRow}
          <tr style="border-top:2px solid #e5e7eb;">
            <td colspan="2" style="padding:14px 16px;font-size:16px;font-weight:700;color:#0D1014;">Total Due</td>
            <td style="padding:14px 16px;font-size:20px;font-weight:700;text-align:right;color:#0D1014;">${fmt(total)}</td>
          </tr>
        </table>

        <!-- CTA -->
        <div style="text-align:center;margin-bottom:8px;">
          <p style="font-size:15px;color:#374151;margin:0 0 16px;">Ready to move forward? One click to approve:</p>
          <a href="${approveUrl}" style="display:inline-block;background:#CC2200;color:#ffffff;font-size:17px;font-weight:700;padding:16px 36px;border-radius:8px;text-decoration:none;letter-spacing:0.5px;">✓ &nbsp;Approve This Quote</a>
          <p style="font-size:13px;color:#9ca3af;margin:16px 0 4px;">Prefer to talk it through?</p>
          <a href="tel:9737872431" style="font-size:15px;font-weight:700;color:#0D1014;text-decoration:none;">📞 Call us at (973) 787-2431</a>
          <p style="font-size:12px;color:#9ca3af;font-style:italic;margin:12px 0 0;">This quote expires in 7 days. Prices are locked in until then.</p>
        </div>

        ${referralBar()}
      </td></tr>

      <tr><td>${trustBar()}</td></tr>
      <tr><td>${footer()}</td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`
}

export function confirmationEmailHTML({ customer, job, techFirstName }) {
  const arrivalTime = job.scheduled_date ? fmtTime(job.scheduled_date) : '—'
  const arrivalEnd = job.scheduled_date
    ? fmtTime(new Date(new Date(job.scheduled_date).getTime() + 2 * 60 * 60 * 1000).toISOString())
    : '—'
  const generatorInfo = [customer.generator_model, customer.generator_serial].filter(Boolean).join(' · ')
  const techName = techFirstName || 'our technician'

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:16px;background:#f3f4f6;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.1);">

      <tr><td>${header()}</td></tr>

      <!-- Confirmation banner -->
      <tr>
        <td style="background:#0f1f12;border-bottom:2px solid #2d5a3d;padding:14px 40px;">
          <div style="font-family:Arial,sans-serif;font-size:15px;font-weight:700;color:#4CAF7A;letter-spacing:1px;text-transform:uppercase;">
            ✓ &nbsp;Your Appointment is Confirmed
          </div>
        </td>
      </tr>

      <tr><td style="padding:32px 40px 0;">
        <p style="font-size:15px;color:#374151;margin:0 0 8px;">Hi ${customer.name},</p>
        <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.7;">
          Great news — your service appointment is confirmed and on our schedule.
          Our certified technician will arrive during the window below.
          You don't need to do anything — just make sure the generator is accessible.
        </p>
        ${divider()}

        <!-- Appointment card -->
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
          <thead>
            <tr style="background:#0D1014;">
              <th colspan="2" style="padding:13px 20px;font-size:13px;font-weight:600;color:#E8ECF2;text-align:left;">📅 &nbsp;Appointment Details</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom:1px solid #f0f0f0;">
              <td style="padding:12px 20px;font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:1px;width:140px;vertical-align:top;">📆 Date &amp; Time</td>
              <td style="padding:12px 20px;font-size:13px;color:#374151;">
                <strong>${fmtDate(job.scheduled_date)}</strong><br>
                <span style="color:#6b7280;font-size:12px;">Arrival window: ${arrivalTime} – ${arrivalEnd}</span>
              </td>
            </tr>
            <tr style="border-bottom:1px solid #f0f0f0;">
              <td style="padding:12px 20px;font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:1px;vertical-align:top;">🔧 Service Type</td>
              <td style="padding:12px 20px;font-size:13px;color:#374151;">
                ${fmtJobType(job.job_type)}
                ${generatorInfo ? `<br><span style="color:#6b7280;font-size:12px;">${generatorInfo}</span>` : ''}
              </td>
            </tr>
            ${customer.address ? `<tr style="border-bottom:1px solid #f0f0f0;">
              <td style="padding:12px 20px;font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:1px;vertical-align:top;">📍 Service Address</td>
              <td style="padding:12px 20px;font-size:13px;color:#374151;">${customer.address}</td>
            </tr>` : ''}
            <tr>
              <td style="padding:12px 20px;font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:1px;vertical-align:top;">👷 Your Technician</td>
              <td style="padding:12px 20px;font-size:13px;color:#374151;">
                <strong>${techName}</strong><br>
                <span style="color:#6b7280;font-size:12px;">Generac Air-Cooled &amp; Liquid-Cooled Certified</span>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- What to Expect -->
        <div style="background:#f9fafb;border-radius:8px;padding:20px 24px;margin-bottom:20px;">
          <p style="font-size:13px;font-weight:700;color:#374151;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.5px;">What to Expect</p>
          ${[
            'Make sure the generator area is accessible before we arrive.',
            'Our technician will introduce themselves and walk you through what they\'re doing.',
            'If we find anything beyond the scope, we\'ll show you before doing any additional work.',
            'We accept cash, check, and all major credit cards at time of service.',
          ].map(text => `
          <p style="font-size:13px;color:#6b7280;margin:0 0 8px;">
            <span style="color:#CC2200;font-weight:700;">→ </span>${text}
          </p>`).join('')}
        </div>

        <p style="font-size:13px;color:#9ca3af;text-align:center;margin:0 0 8px;">
          Need to reschedule? <a href="tel:9737872431" style="color:#374151;font-weight:600;">Call us at (973) 787-2431</a> or reply to this email.
        </p>

        ${referralBar()}
      </td></tr>

      <tr><td>${trustBar()}</td></tr>
      <tr><td>${footer()}</td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`
}

export function completionEmailHTML({ customer, job, parts = [], labor = [], documents = [], includeChecklist = true }) {
  const generatorInfo = [customer.generator_model, customer.generator_serial].filter(Boolean).join(' · ')
  const partsTotal = parts.reduce((s, p) => s + (p.total_price || 0), 0)
  const laborTotal = labor.reduce((s, l) => s + (l.total_price || 0), 0)
  const total = partsTotal + laborTotal

  const laborRows = labor.map((l, i) => `
    <tr style="background:${i % 2 === 0 ? '#ffffff' : '#fafafa'};">
      <td style="padding:9px 16px;font-family:Arial,sans-serif;font-size:13px;color:#374151;border-bottom:1px solid #f0f0f0;">${l.description}</td>
      <td style="padding:9px 16px;font-family:Arial,sans-serif;font-size:13px;font-weight:600;text-align:right;border-bottom:1px solid #f0f0f0;white-space:nowrap;">${fmt(l.total_price)}</td>
    </tr>`).join('')

  const partsRows = parts.filter(p => p.total_price > 0).map((p, i) => `
    <tr style="background:${i % 2 === 0 ? '#ffffff' : '#fafafa'};">
      <td style="padding:9px 16px;font-family:Arial,sans-serif;font-size:13px;color:#374151;border-bottom:1px solid #f0f0f0;">${p.name} ×${p.quantity}</td>
      <td style="padding:9px 16px;font-family:Arial,sans-serif;font-size:13px;font-weight:600;text-align:right;border-bottom:1px solid #f0f0f0;white-space:nowrap;">${fmt(p.total_price)}</td>
    </tr>`).join('')

  const completedDocs = documents.filter(d => d.status === 'completed')
  const checklistSection = (includeChecklist && completedDocs.length > 0) ? `
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
      <p style="font-family:Arial,sans-serif;font-size:12px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 10px;">✓ Service Checklist Completed</p>
      ${completedDocs.map(d => `
        <p style="font-family:Arial,sans-serif;font-size:13px;color:#15803d;margin:0 0 4px;">
          <span style="color:#16a34a;font-weight:700;">✓ </span>${d.template_name || 'Service Document'}
        </p>`).join('')}
    </div>` : ''

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:16px;background:#f3f4f6;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.1);">

      <tr><td>${header()}</td></tr>

      <tr>
        <td style="background:#0f1f12;border-bottom:2px solid #2d5a3d;padding:14px 40px;">
          <div style="font-family:Arial,sans-serif;font-size:15px;font-weight:700;color:#4CAF7A;letter-spacing:1px;text-transform:uppercase;">
            ✓ Service Complete — Your Generator Is Protected
          </div>
        </td>
      </tr>

      <tr><td style="padding:32px 40px 0;">
        <p style="font-size:15px;color:#374151;margin:0 0 8px;">Hi ${customer.name},</p>
        <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.7;">
          Your service has been completed. Our technician has finished the work on your generator and everything is running as it should be.
          Below is a summary of what was done today.
        </p>
        ${divider()}

        <div style="border-left:4px solid #4CAF7A;background:#f8f8f8;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:24px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:4px 0;font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:1px;width:140px;">Service</td>
              <td style="padding:4px 0;font-size:13px;color:#374151;font-weight:600;">${job.title || ''}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Date</td>
              <td style="padding:4px 0;font-size:13px;color:#374151;">${fmtDate(job.completed_date || new Date().toISOString())}</td>
            </tr>
            ${generatorInfo ? `<tr>
              <td style="padding:4px 0;font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Generator</td>
              <td style="padding:4px 0;font-size:13px;color:#374151;">${generatorInfo}</td>
            </tr>` : ''}
            ${customer.address ? `<tr>
              <td style="padding:4px 0;font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Address</td>
              <td style="padding:4px 0;font-size:13px;color:#374151;">${customer.address}</td>
            </tr>` : ''}
          </table>
        </div>

        ${checklistSection}

        ${(laborRows || partsRows) ? `
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:16px;">
          <thead>
            <tr style="background:#0D1014;">
              <th style="padding:11px 16px;font-size:11px;font-weight:600;color:#A8B4C4;text-align:left;text-transform:uppercase;letter-spacing:1px;">Work Performed</th>
              <th style="padding:11px 16px;font-size:11px;font-weight:600;color:#A8B4C4;text-align:right;text-transform:uppercase;letter-spacing:1px;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${laborRows}
            ${partsRows}
          </tbody>
        </table>` : ''}

        ${total > 0 ? `
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f8f8;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:24px;">
          <tr style="border-top:2px solid #e5e7eb;">
            <td style="padding:14px 16px;font-size:16px;font-weight:700;color:#0D1014;">Total</td>
            <td style="padding:14px 16px;font-size:20px;font-weight:700;text-align:right;color:#0D1014;">${fmt(total)}</td>
          </tr>
        </table>` : ''}

        <p style="font-size:14px;color:#6b7280;text-align:center;margin:0 0 24px;line-height:1.7;">
          Thank you for trusting GenShield with your generator.
          If you have any questions or notice anything unexpected, please reach out.
        </p>
        <p style="text-align:center;margin:0 0 8px;">
          <a href="tel:9737872431" style="font-size:15px;font-weight:700;color:#0D1014;text-decoration:none;">📞 (973) 787-2431</a>
        </p>

        ${referralBar()}
      </td></tr>

      <tr><td>${trustBar()}</td></tr>
      <tr><td>${footer()}</td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`
}
