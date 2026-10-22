import { isZeroDollarInvoice, invoiceTotalCents } from './utils/invoiceTotals.js'
import { partChargeTotal } from './utils/jobFinancials.js'
import { SURCHARGE_DEFAULTS, surchargeLabel } from './utils/surcharge.js'
// Escaping lives in one shared module (also used by the printable Service
// History and api/); re-exported here for existing imports.
import { escapeHtml, multilineHtml, safeImageSrc } from './utils/escapeHtml.js'
import { formatEstimate, estimateMinutes } from './jobDuration.js'
import { SERVICE_TYPES } from './jobTypes.js'
export { escapeHtml, multilineHtml, safeImageSrc }

// Customer copy never prints a "—" placeholder, "undefined", "null", "NaN" or
// "$NaN": a row whose value is missing is hidden (label and value), see
// docs/customer-copy-audit.md.

// Totals only: a missing component of a stored total counts as 0, exactly as
// invoiceTotalCents() does, so the printed Total always matches the sum.
function fmt(n) {
  const v = Number(n || 0)
  return '$' + (Number.isFinite(v) ? v : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// One line item's money: blank when the amount is unknown — never an
// invented "$0.00" (and never "$NaN") that hides a real missing price.
function fmtLine(n) {
  if (n === null || n === undefined || String(n).trim() === '') return ''
  const v = Number(n)
  return Number.isFinite(v) ? fmt(v) : ''
}

// Rate column: the stored unit price, else total / quantity when both are
// known (legacy flat-rate rows), else blank.
function lineRate(item) {
  const r = fmtLine(item?.unit_price)
  if (r) return r
  if (item?.total == null || item?.quantity == null) return ''
  const total = Number(item.total), qty = Number(item.quantity)
  return Number.isFinite(total) && Number.isFinite(qty) && qty > 0 ? fmt(total / qty) : ''
}

// Quantity cell: escaped, and blank instead of a dash / "null" placeholder.
function fmtQty(q) {
  const s = String(q ?? '').trim()
  if (!s || /^[-—–]+$/.test(s) || /^(undefined|null|NaN)$/i.test(s)) return ''
  return escapeHtml(s)
}

function validDate(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d
}

// '' when missing/invalid — callers hide the row (never "—" / "Invalid Date").
function fmtDate(iso) {
  const d = validDate(iso)
  return d ? d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : ''
}

function fmtTime(iso, use24h = false) {
  const d = validDate(iso)
  return d ? d.toLocaleTimeString('en-US', { hour: use24h ? '2-digit' : 'numeric', minute: '2-digit', hour12: !use24h }) : ''
}

// Customer-facing "Service Type": only a real service type — never the legacy
// "quote" value, an unknown or an empty one. '' means: hide the row.
export function fmtJobType(raw) {
  if (!SERVICE_TYPES.some(x => x.value === raw)) return ''
  return escapeHtml(String(raw).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))
}

// "Hi {name}," — never "Hi ,".
function greetingName(customer) {
  return String(customer?.name ?? '').trim() || 'there'
}

// B3: the job as the customer sees it — its title and the customer-facing
// description (jobs.customer_description). Never internal text (jobs.notes /
// generator_notes / quote notes / customer notes). '' when the job has
// neither, or there is no job (standalone invoice).
export function jobDetailsHTML(job) {
  const title = String(job?.title ?? '').trim()
  const desc = String(job?.customer_description ?? '').trim()
  if (!title && !desc) return ''
  return `<div data-job-details="1" style="background:#f8f9fa;border-radius:8px;padding:12px;margin-bottom:16px;">${title ? `<p style="font-size:10px;font-weight:bold;color:#888;margin:0 0 5px 0;">JOB</p><p style="font-size:13px;font-weight:bold;color:#1a1a1a;margin:0;">${escapeHtml(title)}</p>` : ''}${desc ? `<p style="font-size:10px;font-weight:bold;color:#888;margin:${title ? '10px' : '0'} 0 5px 0;">DESCRIPTION OF WORK</p><p style="font-size:13px;color:#333;margin:0;">${multilineHtml(desc)}</p>` : ''}</div>`
}

// One label per payment method for every customer copy and the invoice screen.
export function fmtPaymentMethod(method) {
  const labels = { cash: 'Cash', check: 'Check', zelle: 'Zelle', venmo: 'Venmo', stripe: 'Card', stripe_app: 'Card (Stripe App)', other: 'Other', no_charge: 'No charge' }
  if (!method) return ''
  return labels[method] || (method.charAt(0).toUpperCase() + method.slice(1))
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

// Totals come from computeQuoteTotals (same rules as invoices): line amounts
// already carry any member price; `tax` is NJ sales tax; `total` is the real
// amount due (H-3). memberSavings is informational only (not subtracted).
export function quoteEmailHTML({ customer, job, lineItems = [], subtotal = 0, tax = 0, memberSavings = 0, total = 0, approveUrl, scopeNotes }) {
  customer = customer || {}
  job = job || {}
  const quoteNum = escapeHtml(String(job.id || '').slice(0, 8).toUpperCase())
  const serviceType = fmtJobType(job.job_type)
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  const generatorInfo = escapeHtml([customer.generator_model, customer.generator_serial].filter(Boolean).join(' · '))

  const lineRows = lineItems.map((item, i) => `
    <tr style="background:${i % 2 === 0 ? '#ffffff' : '#fafafa'};">
      <td style="padding:10px 16px;font-family:Arial,sans-serif;font-size:13px;color:#374151;border-bottom:1px solid #f0f0f0;">${escapeHtml(item.description)}</td>
      <td style="padding:10px 16px;font-family:Arial,sans-serif;font-size:13px;color:#6b7280;text-align:center;border-bottom:1px solid #f0f0f0;white-space:nowrap;">${fmtQty(item.qty)}</td>
      <td style="padding:10px 16px;font-family:Arial,sans-serif;font-size:13px;font-weight:600;text-align:right;border-bottom:1px solid #f0f0f0;white-space:nowrap;">${fmtLine(item.amount)}</td>
    </tr>`).join('')

  const taxRow = tax > 0 ? `
    <tr>
      <td colspan="2" style="padding:8px 16px;font-family:Arial,sans-serif;font-size:13px;color:#6b7280;">NJ Sales Tax (6.625%)</td>
      <td style="padding:8px 16px;font-family:Arial,sans-serif;font-size:13px;text-align:right;color:#374151;">${fmt(tax)}</td>
    </tr>` : ''
  const savingsRow = memberSavings > 0 ? `
    <tr>
      <td colspan="3" style="padding:0 16px 8px;font-family:Arial,sans-serif;font-size:12px;color:#CC2200;">Includes your member savings of ${fmt(memberSavings)}</td>
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
        <p style="font-size:15px;color:#374151;margin:0 0 8px;">Hi ${escapeHtml(greetingName(customer))},</p>
        <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.7;">
          Thank you for choosing GenShield — we truly appreciate the opportunity to keep your home protected.
          ${approveUrl
            ? `Please review your service quote below and approve when you're ready. We'll get you scheduled right away.`
            : `Please review your service quote below. We'll be in touch shortly to go over the details and get you scheduled.`}
        </p>
        ${divider()}

        <!-- Quote details card -->
        <div style="border-left:4px solid #CC2200;background:#f8f8f8;border-radius:0 8px 8px 0;padding:20px 24px;margin-bottom:24px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${quoteNum ? `<tr>
              <td style="padding:4px 0;font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:1px;width:140px;">Quote #</td>
              <td style="padding:4px 0;font-size:13px;color:#111827;font-weight:600;">${quoteNum}</td>
            </tr>` : ''}
            <tr>
              <td style="padding:4px 0;font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:1px;width:140px;">Date Issued</td>
              <td style="padding:4px 0;font-size:13px;color:#374151;">${today}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Expires</td>
              <td style="padding:4px 0;font-size:13px;color:#CC2200;font-weight:600;">${expires}</td>
            </tr>
            ${serviceType ? `<tr>
              <td style="padding:4px 0;font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Service Type</td>
              <td style="padding:4px 0;font-size:13px;color:#374151;">${serviceType}</td>
            </tr>` : ''}
            ${generatorInfo ? `<tr>
              <td style="padding:4px 0;font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Generator</td>
              <td style="padding:4px 0;font-size:13px;color:#374151;">${generatorInfo}</td>
            </tr>` : ''}
            ${customer.address ? `<tr>
              <td style="padding:4px 0;font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Service Address</td>
              <td style="padding:4px 0;font-size:13px;color:#374151;">${escapeHtml(customer.address)}</td>
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
          ${savingsRow}
          ${taxRow}
          <tr style="border-top:2px solid #e5e7eb;">
            <td colspan="2" style="padding:14px 16px;font-size:16px;font-weight:700;color:#0D1014;">Total Due</td>
            <td style="padding:14px 16px;font-size:20px;font-weight:700;text-align:right;color:#0D1014;">${fmt(total)}</td>
          </tr>
        </table>

        ${scopeNotes ? `
        <!-- Scope of work -->
        <div style="background:#f8f8f8;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
          <p style="font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;">Scope of Work</p>
          <p style="font-size:13px;color:#374151;line-height:1.6;margin:0;">${multilineHtml(scopeNotes)}</p>
        </div>` : ''}

        <!-- CTA -->
        <div style="text-align:center;margin-bottom:8px;">
          ${approveUrl ? `
          <p style="font-size:15px;color:#374151;margin:0 0 16px;">Ready to move forward? One click to approve:</p>
          <a href="${escapeHtml(approveUrl)}" style="display:inline-block;background:#CC2200;color:#ffffff;font-size:17px;font-weight:700;padding:16px 36px;border-radius:8px;text-decoration:none;letter-spacing:0.5px;">✓ &nbsp;Approve This Quote</a>
          <p style="font-size:13px;color:#9ca3af;margin:16px 0 4px;">Prefer to talk it through?</p>
          <a href="tel:9737872431" style="font-size:15px;font-weight:700;color:#0D1014;text-decoration:none;">📞 Call us at (973) 787-2431</a>
          <p style="font-size:12px;color:#9ca3af;font-style:italic;margin:12px 0 0;">This quote expires in 7 days. Prices are locked in until then.</p>
          ` : `
          <p style="font-size:15px;color:#374151;margin:0 0 8px;">We'll follow up with you shortly to confirm the details.</p>
          <p style="font-size:13px;color:#9ca3af;margin:0 0 16px;">Have questions in the meantime?</p>
          <a href="tel:9737872431" style="display:inline-block;background:#CC2200;color:#ffffff;font-size:16px;font-weight:700;padding:14px 32px;border-radius:8px;text-decoration:none;letter-spacing:0.5px;">📞 &nbsp;Call us at (973) 787-2431</a>
          <p style="font-size:12px;color:#9ca3af;font-style:italic;margin:16px 0 0;">This quote expires in 7 days. Prices are locked in until then.</p>
          `}
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

export function confirmationEmailHTML({ customer, job, techFirstName, use24h = false }) {
  customer = customer || {}
  job = job || {}
  const visitDate = fmtDate(job.scheduled_date)
  const arrivalTime = fmtTime(job.scheduled_date, use24h)
  const serviceType = fmtJobType(job.job_type)
  const generatorInfo = escapeHtml([customer.generator_model, customer.generator_serial].filter(Boolean).join(' · '))
  const techName = String(techFirstName ?? '').trim() || 'our technician'
  const estimateLine = `<span style="color:#6b7280;font-size:12px;" data-estimate="1">Estimated time on site: ${escapeHtml(formatEstimate(estimateMinutes(job)))}.</span>`
  // Service Type row only for a real service type; the generator line moves
  // to its own row when there is no service type to sit under.
  const serviceRow = serviceType
    ? `<tr style="border-bottom:1px solid #f0f0f0;">
              <td style="padding:12px 20px;font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:1px;vertical-align:top;">🔧 Service Type</td>
              <td style="padding:12px 20px;font-size:13px;color:#374151;">
                ${serviceType}
                ${generatorInfo ? `<br><span style="color:#6b7280;font-size:12px;">${generatorInfo}</span>` : ''}
              </td>
            </tr>`
    : generatorInfo
      ? `<tr style="border-bottom:1px solid #f0f0f0;">
              <td style="padding:12px 20px;font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:1px;vertical-align:top;">🔧 Generator</td>
              <td style="padding:12px 20px;font-size:13px;color:#374151;">${generatorInfo}</td>
            </tr>`
      : ''
  const customerDescription = job.customer_description?.trim()
    ? `<!-- About Your Service -->
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
          <tr style="background:#0D1014;">
            <td style="padding:13px 20px;font-size:13px;font-weight:600;color:#E8ECF2;text-align:left;">📝 &nbsp;About Your Service</td>
          </tr>
          <tr>
            <td style="padding:14px 20px;font-size:13px;color:#374151;line-height:1.7;">${multilineHtml(job.customer_description)}</td>
          </tr>
        </table>`
    : ''

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
        <p style="font-size:15px;color:#374151;margin:0 0 8px;">Hi ${escapeHtml(greetingName(customer))},</p>
        <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.7;">
          Great news — your service appointment is confirmed and on our schedule.
          Our certified technician will arrive at the time below.
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
              <td style="padding:12px 20px;font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:1px;width:140px;vertical-align:top;">${visitDate ? '📆 Date &amp; Time' : '⏱ Time on Site'}</td>
              <td style="padding:12px 20px;font-size:13px;color:#374151;">
                ${visitDate ? `<strong>${visitDate}</strong><br>` : ''}
                ${arrivalTime ? `<span style="color:#6b7280;font-size:12px;">Arrival time: ${arrivalTime}</span><br>` : ''}
                ${estimateLine}
              </td>
            </tr>
            ${serviceRow}
            ${customer.address ? `<tr style="border-bottom:1px solid #f0f0f0;">
              <td style="padding:12px 20px;font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:1px;vertical-align:top;">📍 Service Address</td>
              <td style="padding:12px 20px;font-size:13px;color:#374151;">${escapeHtml(customer.address)}</td>
            </tr>` : ''}
            <tr>
              <td style="padding:12px 20px;font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:1px;vertical-align:top;">👷 Your Technician</td>
              <td style="padding:12px 20px;font-size:13px;color:#374151;">
                <strong>${escapeHtml(techName)}</strong><br>
                <span style="color:#6b7280;font-size:12px;">Generac Air-Cooled &amp; Liquid-Cooled Certified</span>
              </td>
            </tr>
          </tbody>
        </table>

        ${customerDescription}

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
  customer = customer || {}
  job = job || {}
  const generatorInfo = escapeHtml([customer.generator_model, customer.generator_serial].filter(Boolean).join(' · '))
  const jobTitle = String(job.title ?? '').trim()
  const jobDesc = String(job.customer_description ?? '').trim()
  const completedOn = fmtDate(job.completed_date || new Date().toISOString())
  const partsTotal = parts.reduce((s, p) => s + partChargeTotal(p), 0)
  const laborTotal = labor.reduce((s, l) => s + (l.total_price || 0), 0)
  const total = partsTotal + laborTotal

  const laborRows = labor.map((l, i) => `
    <tr style="background:${i % 2 === 0 ? '#ffffff' : '#fafafa'};">
      <td style="padding:9px 16px;font-family:Arial,sans-serif;font-size:13px;color:#374151;border-bottom:1px solid #f0f0f0;">${escapeHtml(l.description)}</td>
      <td style="padding:9px 16px;font-family:Arial,sans-serif;font-size:13px;font-weight:600;text-align:right;border-bottom:1px solid #f0f0f0;white-space:nowrap;">${fmtLine(l.total_price)}</td>
    </tr>`).join('')

  const partsRows = parts.filter(p => partChargeTotal(p) > 0).map((p, i) => {
    const qty = fmtQty(p.quantity)
    return `
    <tr style="background:${i % 2 === 0 ? '#ffffff' : '#fafafa'};">
      <td style="padding:9px 16px;font-family:Arial,sans-serif;font-size:13px;color:#374151;border-bottom:1px solid #f0f0f0;">${escapeHtml(p.name)}${qty ? ` ×${qty}` : ''}</td>
      <td style="padding:9px 16px;font-family:Arial,sans-serif;font-size:13px;font-weight:600;text-align:right;border-bottom:1px solid #f0f0f0;white-space:nowrap;">${fmtLine(p.total_price)}</td>
    </tr>`
  }).join('')

  const completedDocs = documents.filter(d => d.status === 'completed')
  const checklistSection = (includeChecklist && completedDocs.length > 0) ? `
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
      <p style="font-family:Arial,sans-serif;font-size:12px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 10px;">✓ Service Checklist Completed</p>
      ${completedDocs.map(d => `
        <p style="font-family:Arial,sans-serif;font-size:13px;color:#15803d;margin:0 0 4px;">
          <span style="color:#16a34a;font-weight:700;">✓ </span>${escapeHtml(d.template_name || 'Service Document')}
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
        <p style="font-size:15px;color:#374151;margin:0 0 8px;">Hi ${escapeHtml(greetingName(customer))},</p>
        <p style="font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.7;">
          Your service has been completed. Our technician has finished the work on your generator and everything is running as it should be.
          Below is a summary of what was done today.
        </p>
        ${divider()}

        <div style="border-left:4px solid #4CAF7A;background:#f8f8f8;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:24px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${jobTitle ? `<tr>
              <td style="padding:4px 0;font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:1px;width:140px;">Job</td>
              <td style="padding:4px 0;font-size:13px;color:#374151;font-weight:600;">${escapeHtml(jobTitle)}</td>
            </tr>` : ''}
            ${jobDesc ? `<tr>
              <td style="padding:4px 0;font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:1px;width:140px;vertical-align:top;">Description of Work</td>
              <td style="padding:4px 0;font-size:13px;color:#374151;">${multilineHtml(jobDesc)}</td>
            </tr>` : ''}
            ${completedOn ? `<tr>
              <td style="padding:4px 0;font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:1px;width:140px;">Date</td>
              <td style="padding:4px 0;font-size:13px;color:#374151;">${completedOn}</td>
            </tr>` : ''}
            ${generatorInfo ? `<tr>
              <td style="padding:4px 0;font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Generator</td>
              <td style="padding:4px 0;font-size:13px;color:#374151;">${generatorInfo}</td>
            </tr>` : ''}
            ${customer.address ? `<tr>
              <td style="padding:4px 0;font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Address</td>
              <td style="padding:4px 0;font-size:13px;color:#374151;">${escapeHtml(customer.address)}</td>
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

// Shared by InvoicePDF.jsx's "send invoice / checklists" screen and JobDetail.jsx's
// job-completion screen — one implementation for the same email-body building blocks
// so the two entry points can never drift out of sync.
// Customer-facing "Service Summary" (the textarea on the job ->
// jobs.invoice_notes, snapshotted to invoices.notes) rendered as the
// SERVICE SUMMARY block in every customer invoice/receipt email. Escaped,
// newlines kept; omitted entirely when empty or whitespace-only, so an
// invoice without a summary renders byte-identically.
export function serviceNotesHTML(notes) {
  if (!String(notes ?? '').trim()) return ""
  return `<div style="background:#f8f9fa;border-radius:8px;padding:12px;margin-bottom:16px;"><p style="font-size:10px;font-weight:bold;color:#888;margin:0 0 5px 0;">SERVICE SUMMARY</p><p style="font-size:13px;color:#333;margin:0;">${multilineHtml(notes)}</p></div>`
}

export function invoiceSummaryHTML({ invoice, customer, job = null, surchargeConfig = SURCHARGE_DEFAULTS }) {
  // $0.00 invoices (exact, integer cents — see isZeroDollarInvoice) get their
  // own rendering with no paid/unpaid/payment-due language. Every invoice
  // > $0 (and every negative-total invoice) falls through to the original
  // rendering below, which is intentionally left byte-for-byte unchanged
  // (guarded by src/test/invoiceSummary.test.js golden fixtures).
  if (isZeroDollarInvoice(invoice)) return zeroDollarInvoiceSummaryHTML({ invoice, customer, job });

  const lineItemsHTML = (invoice.line_items || []).map((item, i) => `
    <tr style="background:${i % 2 === 0 ? "#f8f9fa" : "white"};">
      <td style="padding:9px 12px;font-size:13px;">${escapeHtml(item.description)}</td>
      <td style="padding:9px 12px;font-size:13px;text-align:center;">${fmtQty(item.quantity)}</td>
      <td style="padding:9px 12px;font-size:13px;text-align:right;">${lineRate(item)}</td>
      <td style="padding:9px 12px;font-size:13px;text-align:right;font-weight:600;">${fmtLine(item.total)}</td>
    </tr>`).join("");

  const signatureHTML = invoice.customer_signature
    ? `<div style="margin-top:20px;border-top:1px solid #ddd;padding-top:14px;">
         <p style="font-size:11px;color:#888;margin:0 0 8px 0;">CUSTOMER SIGNATURE</p>
         <img src="${safeImageSrc(invoice.customer_signature)}" style="max-height:56px;border:1px solid #eee;border-radius:6px;padding:4px;" />
       </div>`
    : "";

  // Item 1c: the email states plainly whether it is PAID (and how), UNPAID
  // (and how much), or partly paid (paid so far + balance due).
  const totalCents = invoiceTotalCents(invoice)
  const isPartial = !invoice.paid_date && invoice.status === "partial" && Number(invoice.amount_paid) > 0
  const paidSoFar = isPartial ? Math.round(Number(invoice.amount_paid) * 100) / 100 : 0
  const amountDue = Math.max(0, totalCents / 100 - paidSoFar)
  const paymentLine = invoice.paid_date
    ? `PAID${fmtDate(invoice.paid_date) ? ` — ${fmtDate(invoice.paid_date)}` : ""}${invoice.payment_method ? ` (${escapeHtml(fmtPaymentMethod(invoice.payment_method))}${invoice.payment_reference ? ` #${escapeHtml(invoice.payment_reference)}` : ""})` : ""}`
    : totalCents < 0 ? "PAYMENT DUE" // credit invoice: original wording
    : isPartial ? `PARTIALLY PAID — ${fmt(amountDue)} DUE` : `UNPAID — ${fmt(amountDue)} DUE`;

  return `<div>
    <div style="background:#0D1014;color:white;padding:22px 24px;border-radius:8px;margin-bottom:20px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="vertical-align:top;">
            <h1 style="font-size:20px;font-weight:bold;margin:0 0 3px 0;letter-spacing:1px;">GEN<span style="color:#E03010;">SHIELD</span></h1>
            <p style="font-size:12px;color:#A8B4C4;margin:0;">Professional Generator Service &amp; Maintenance</p>
          </td>
          <td style="vertical-align:top;text-align:right;">
            <p style="font-size:16px;font-weight:bold;color:#CC2200;margin:0;">INVOICE</p>
            ${String(invoice.invoice_number ?? "").trim() ? `<p style="font-size:12px;margin:3px 0 0 0;">${escapeHtml(invoice.invoice_number)}</p>` : ""}
            ${fmtDate(invoice.created_date) ? `<p style="font-size:11px;color:#A8B4C4;margin:2px 0 0 0;">${fmtDate(invoice.created_date)}</p>` : ""}
          </td>
        </tr>
      </table>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      <tr>
        <td style="width:50%;vertical-align:top;padding:0 8px 0 0;">
          <div style="background:#f8f9fa;border-radius:8px;padding:14px;">
            <p style="font-size:10px;font-weight:bold;color:#888;letter-spacing:0.5px;margin:0 0 6px 0;">BILL TO</p>
            ${String(customer?.name || invoice.customer_name || "").trim() ? `<p style="font-size:13px;font-weight:bold;margin:0 0 3px 0;">${escapeHtml(customer?.name || invoice.customer_name)}</p>` : ""}
            ${customer?.address ? `<p style="font-size:12px;color:#555;margin:0 0 2px 0;">${escapeHtml(customer.address)}</p>` : ""}
            ${customer?.phone ? `<p style="font-size:12px;color:#555;margin:0;">${escapeHtml(customer.phone)}</p>` : ""}
          </div>
        </td>
        <td style="width:50%;vertical-align:top;padding:0 0 0 8px;">
          <div style="background:#f8f9fa;border-radius:8px;padding:14px;">
            <p style="font-size:10px;font-weight:bold;color:#888;letter-spacing:0.5px;margin:0 0 6px 0;">${customer?.generator_model || customer?.generator_serial ? "GENERATOR" : "PAYMENT"}</p>
            ${customer?.generator_model ? `<p style="font-size:13px;font-weight:600;margin:0 0 3px 0;">${escapeHtml(customer.generator_model)}</p>` : ""}
            ${customer?.generator_serial ? `<p style="font-size:12px;color:#555;margin:0 0 6px 0;">S/N: ${escapeHtml(customer.generator_serial)}</p>` : ""}
            <p style="font-size:12px;font-weight:bold;margin:0;color:${invoice.paid_date ? "#16a34a" : "#d97706"};">
              ${paymentLine}
            </p>
          </div>
        </td>
      </tr>
    </table>${jobDetailsHTML(job)}
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      <thead>
        <tr style="background:#0D1014;color:white;">
          <th style="padding:9px 12px;text-align:left;font-size:12px;">Description</th>
          <th style="padding:9px 12px;text-align:center;font-size:12px;">Qty</th>
          <th style="padding:9px 12px;text-align:right;font-size:12px;">Rate</th>
          <th style="padding:9px 12px;text-align:right;font-size:12px;">Amount</th>
        </tr>
      </thead>
      <tbody>${lineItemsHTML}</tbody>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      <tr>
        <td></td>
        <td style="width:220px;min-width:220px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:5px 0;font-size:13px;border-bottom:1px solid #eee;color:#555;">Parts</td>
              <td style="padding:5px 0;font-size:13px;border-bottom:1px solid #eee;text-align:right;">${fmt(invoice.parts_total)}</td>
            </tr>
            <tr>
              <td style="padding:5px 0;font-size:13px;border-bottom:1px solid #eee;color:#555;">Labor</td>
              <td style="padding:5px 0;font-size:13px;border-bottom:1px solid #eee;text-align:right;">${fmt(invoice.labor_total)}</td>
            </tr>
            <tr>
              <td style="padding:5px 0;font-size:13px;border-bottom:1px solid #eee;color:#555;">Subtotal</td>
              <td style="padding:5px 0;font-size:13px;border-bottom:1px solid #eee;text-align:right;">${fmt((invoice.parts_total || 0) + (invoice.labor_total || 0))}</td>
            </tr>
            ${invoice.tax_amount > 0 ? `<tr>
              <td style="padding:5px 0;font-size:13px;border-bottom:1px solid #eee;color:#555;">NJ Sales Tax (6.625%)</td>
              <td style="padding:5px 0;font-size:13px;border-bottom:1px solid #eee;text-align:right;">${fmt(invoice.tax_amount)}</td>
            </tr>` : ''}
            ${invoice.surcharge_amount > 0 ? `<tr>
              <td style="padding:5px 0;font-size:13px;border-bottom:1px solid #eee;color:#555;">${surchargeLabel()}</td>
              <td style="padding:5px 0;font-size:13px;border-bottom:1px solid #eee;text-align:right;">${fmt(invoice.surcharge_amount)}</td>
            </tr>` : ''}
            <tr>
              <td style="padding:9px 0 0;font-size:15px;font-weight:bold;border-top:2px solid #0D1014;">Total</td>
              <td style="padding:9px 0 0;font-size:15px;font-weight:bold;border-top:2px solid #0D1014;text-align:right;color:#0D1014;">${fmt((invoice.parts_total || 0) + (invoice.labor_total || 0) + (invoice.tax_amount || 0) + (invoice.surcharge_amount || 0))}</td>
            </tr>${isPartial ? `
            <tr>
              <td style="padding:5px 0;font-size:13px;color:#555;">Paid so far</td>
              <td style="padding:5px 0;font-size:13px;text-align:right;">−${fmt(paidSoFar)}</td>
            </tr>
            <tr>
              <td style="padding:5px 0;font-size:14px;font-weight:bold;color:#b45309;">Balance due</td>
              <td style="padding:5px 0;font-size:14px;font-weight:bold;text-align:right;color:#b45309;">${fmt(amountDue)}</td>
            </tr>` : ''}
          </table>
        </td>
      </tr>
    </table>
    ${serviceNotesHTML(invoice.notes)}
    ${invoice.paid_date ? `
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px;margin-bottom:16px;">
      <p style="font-size:11px;font-weight:bold;color:#166534;margin:0 0 4px 0;">✓ PAID — THANK YOU!</p>
      <p style="font-size:12px;color:#15803d;margin:0;">${[fmtDate(invoice.paid_date), invoice.payment_method ? escapeHtml(fmtPaymentMethod(invoice.payment_method)) : ""].filter(Boolean).join(" · ")}${invoice.payment_reference ? ` #${escapeHtml(invoice.payment_reference)}` : ""}</p>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      <tr>
        <td align="center" style="padding:4px 0 0;">
          <p style="font-size:13px;font-weight:bold;color:#0D1014;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.5px;">How did we do?</p>
          <table cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td align="center" bgcolor="#CC2200" style="border-radius:6px;background:#CC2200;">
                <a href="https://g.page/r/CTZ_-W7KWjXzEAE/review" target="_blank" style="display:inline-block;padding:12px 28px;font-family:Arial,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:6px;">★ Leave us a Google Review</a>
              </td>
            </tr>
          </table>
          <p style="font-size:12px;color:#6b7280;margin:14px 0 0;">Know someone who needs generator service? <a href="https://genshieldservice.com/rewards" style="color:#CC2200;font-weight:600;text-decoration:none;">Earn rewards →</a></p>
        </td>
      </tr>
    </table>` : `
    ${totalCents < 0 ? `<div style="background:#f4f5f7;border:1px solid #dde1e7;border-radius:8px;padding:12px;margin-bottom:16px;">
      <p style="font-size:11px;font-weight:bold;color:#3f4753;margin:0 0 4px 0;">PAYMENT DUE</p>
      <p style="font-size:12px;color:#5b6472;margin:0;">Cash · Check (payable to GenShield) · Zelle · Venmo · Card</p>
    </div>` : `<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:12px;margin-bottom:16px;">
      <p style="font-size:12px;font-weight:bold;color:#92400e;margin:0 0 4px 0;">${isPartial ? `BALANCE DUE: ${fmt(amountDue)}` : `UNPAID — AMOUNT DUE: ${fmt(amountDue)}`}</p>
      ${isPartial ? `<p style="font-size:12px;color:#92400e;margin:0 0 4px 0;">Paid so far: ${fmt(paidSoFar)}</p>` : ""}
      <p style="font-size:12px;color:#5b6472;margin:0;">Cash · Check (payable to GenShield) · Zelle · Venmo · Card</p>
    </div>`}`}
    ${signatureHTML}
  </div>`;
}

// A checklist answer as customer text: '' (row hidden) when empty or not
// printable; same rules as the checklist PDF (api/_lib/pdf/checklistPdf.js).
function checklistValueText(field, raw) {
  if (raw === undefined || raw === null) return "";
  if (field.type === "photo") return String(raw).trim() ? "Photo on file" : "";
  if (Array.isArray(raw)) return raw.filter(v => v !== null && v !== undefined && String(v).trim() !== "").join(", ");
  if (typeof raw === "object") return "";
  const s = String(raw).trim();
  return /^(undefined|null|NaN)$/i.test(s) ? "" : s;
}

export function checklistSummaryHTML(doc) {
  const fields = doc?.field_definitions || [];
  const values = doc?.field_values || {};
  let rows = "";
  let pendingHeader = "";
  fields.forEach(field => {
    if (field.type === "section_header") {
      // Printed only when a row under it prints (and never as an empty bar).
      pendingHeader = String(field.label ?? "").trim()
        ? `<tr><td colspan="2" style="background:#0D1014;color:white;font-weight:bold;font-size:11px;padding:7px 10px;letter-spacing:0.5px;">${escapeHtml(field.label)}</td></tr>`
        : "";
      return;
    }
    let row = "";
    if (field.type === "checkbox") {
      const checked = values[field.id];
      row = `<tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:6px 10px;font-size:12px;color:#333;">${escapeHtml(field.label)}</td><td style="padding:6px 10px;text-align:center;font-size:13px;color:${checked ? "#16a34a" : "#9ca3af"};">${checked ? "✓" : "○"}</td></tr>`;
    } else {
      const text = checklistValueText(field, values[field.id]);
      if (text) row = `<tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:6px 10px;font-size:12px;color:#555;">${escapeHtml(field.label)}</td><td style="padding:6px 10px;font-size:12px;font-weight:600;">${multilineHtml(text)}</td></tr>`;
    }
    if (row) { rows += pendingHeader + row; pendingHeader = ""; }
  });
  return `<div style="margin-top:28px;border-top:3px solid #CC2200;padding-top:20px;">
    <h2 style="color:#0D1014;font-size:15px;margin:0 0 12px 0;font-family:Arial,sans-serif;">${escapeHtml(String(doc?.template_name ?? "").trim() || "Service Checklist")}</h2>
    <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;">${rows}</table>
  </div>`;
}

// Wraps invoiceSummaryHTML/checklistSummaryHTML sections (in any combination) into
// one send-ready email body, separated by a thin divider between sections.
export function combineEmailSections(bodyParts) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:Arial,sans-serif;color:#1a1a1a;background:white;padding:28px;max-width:700px;margin:0 auto;}</style></head><body>${bodyParts.join('<div style="height:1px;background:#e5e7eb;margin:28px 0;"></div>')}<div style="margin-top:28px;text-align:center;border-top:1px solid #eee;padding-top:14px;"><p style="font-size:11px;color:#aaa;">GenShield · Thank you for your business</p></div></body></html>`;
}

// $0.00 invoice: same invoice layout (header, bill-to, generator, line items,
// totals, notes, signature) but no PAID / PAYMENT DUE line or box anywhere.
// Line items flagged no_charge (charge_for_part:false parts) show "No charge".
function zeroDollarInvoiceSummaryHTML({ invoice, customer, job = null }) {
  const lineItemsHTML = (invoice.line_items || []).map((item, i) => `
    <tr style="background:${i % 2 === 0 ? "#f8f9fa" : "white"};">
      <td style="padding:9px 12px;font-size:13px;">${escapeHtml(item.description)}</td>
      <td style="padding:9px 12px;font-size:13px;text-align:center;">${fmtQty(item.quantity)}</td>
      <td style="padding:9px 12px;font-size:13px;text-align:right;">${item.no_charge ? "" : lineRate(item)}</td>
      <td style="padding:9px 12px;font-size:13px;text-align:right;font-weight:600;">${item.no_charge ? "No charge" : fmtLine(item.total)}</td>
    </tr>`).join("");

  const emptyRow = `<tr><td colspan="4" style="padding:9px 12px;font-size:13px;color:#6b7280;">Service visit — no billable items</td></tr>`;

  const signatureHTML = invoice.customer_signature
    ? `<div style="margin-top:20px;border-top:1px solid #ddd;padding-top:14px;">
         <p style="font-size:11px;color:#888;margin:0 0 8px 0;">CUSTOMER SIGNATURE</p>
         <img src="${safeImageSrc(invoice.customer_signature)}" style="max-height:56px;border:1px solid #eee;border-radius:6px;padding:4px;" />
       </div>`
    : "";

  return `<div>
    <div style="background:#0D1014;color:white;padding:22px 24px;border-radius:8px;margin-bottom:20px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="vertical-align:top;">
            <h1 style="font-size:20px;font-weight:bold;margin:0 0 3px 0;letter-spacing:1px;">GEN<span style="color:#E03010;">SHIELD</span></h1>
            <p style="font-size:12px;color:#A8B4C4;margin:0;">Professional Generator Service &amp; Maintenance</p>
          </td>
          <td style="vertical-align:top;text-align:right;">
            <p style="font-size:16px;font-weight:bold;color:#CC2200;margin:0;">INVOICE</p>
            ${String(invoice.invoice_number ?? "").trim() ? `<p style="font-size:12px;margin:3px 0 0 0;">${escapeHtml(invoice.invoice_number)}</p>` : ""}
            ${fmtDate(invoice.created_date) ? `<p style="font-size:11px;color:#A8B4C4;margin:2px 0 0 0;">${fmtDate(invoice.created_date)}</p>` : ""}
          </td>
        </tr>
      </table>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      <tr>
        <td style="width:50%;vertical-align:top;padding:0 8px 0 0;">
          <div style="background:#f8f9fa;border-radius:8px;padding:14px;">
            <p style="font-size:10px;font-weight:bold;color:#888;letter-spacing:0.5px;margin:0 0 6px 0;">BILL TO</p>
            ${String(customer?.name || invoice.customer_name || "").trim() ? `<p style="font-size:13px;font-weight:bold;margin:0 0 3px 0;">${escapeHtml(customer?.name || invoice.customer_name)}</p>` : ""}
            ${customer?.address ? `<p style="font-size:12px;color:#555;margin:0 0 2px 0;">${escapeHtml(customer.address)}</p>` : ""}
            ${customer?.phone ? `<p style="font-size:12px;color:#555;margin:0;">${escapeHtml(customer.phone)}</p>` : ""}
          </div>
        </td>
        <td style="width:50%;vertical-align:top;padding:0 0 0 8px;">
          ${customer?.generator_model || customer?.generator_serial ? `<div style="background:#f8f9fa;border-radius:8px;padding:14px;">
            <p style="font-size:10px;font-weight:bold;color:#888;letter-spacing:0.5px;margin:0 0 6px 0;">GENERATOR</p>
            ${customer?.generator_model ? `<p style="font-size:13px;font-weight:600;margin:0 0 3px 0;">${escapeHtml(customer.generator_model)}</p>` : ""}
            ${customer?.generator_serial ? `<p style="font-size:12px;color:#555;margin:0;">S/N: ${escapeHtml(customer.generator_serial)}</p>` : ""}
          </div>` : ""}
        </td>
      </tr>
    </table>${jobDetailsHTML(job)}
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      <thead>
        <tr style="background:#0D1014;color:white;">
          <th style="padding:9px 12px;text-align:left;font-size:12px;">Description</th>
          <th style="padding:9px 12px;text-align:center;font-size:12px;">Qty</th>
          <th style="padding:9px 12px;text-align:right;font-size:12px;">Rate</th>
          <th style="padding:9px 12px;text-align:right;font-size:12px;">Amount</th>
        </tr>
      </thead>
      <tbody>${lineItemsHTML || emptyRow}</tbody>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      <tr>
        <td></td>
        <td style="width:220px;min-width:220px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:5px 0;font-size:13px;border-bottom:1px solid #eee;color:#555;">Parts</td>
              <td style="padding:5px 0;font-size:13px;border-bottom:1px solid #eee;text-align:right;">${fmt(invoice.parts_total)}</td>
            </tr>
            <tr>
              <td style="padding:5px 0;font-size:13px;border-bottom:1px solid #eee;color:#555;">Labor</td>
              <td style="padding:5px 0;font-size:13px;border-bottom:1px solid #eee;text-align:right;">${fmt(invoice.labor_total)}</td>
            </tr>
            <tr>
              <td style="padding:9px 0 0;font-size:15px;font-weight:bold;border-top:2px solid #0D1014;">Total</td>
              <td style="padding:9px 0 0;font-size:15px;font-weight:bold;border-top:2px solid #0D1014;text-align:right;color:#0D1014;">${fmt(0)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    ${serviceNotesHTML(invoice.notes)}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      <tr>
        <td align="center" style="padding:4px 0 0;">
          <p style="font-size:13px;font-weight:bold;color:#0D1014;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.5px;">How did we do?</p>
          <table cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td align="center" bgcolor="#CC2200" style="border-radius:6px;background:#CC2200;">
                <a href="https://g.page/r/CTZ_-W7KWjXzEAE/review" target="_blank" style="display:inline-block;padding:12px 28px;font-family:Arial,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:6px;">★ Leave us a Google Review</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    ${signatureHTML}
  </div>`;
}

// Item 1d: the short "Payment received" receipt for a payment recorded after
// the job's completion email went out. No line items (the customer already
// has the invoice): amount, method, what's still due, the Service Summary
// (if one was typed) and the signature if one was collected (incl. one
// collected after completion).
export function paymentReceiptHTML({ invoice, customer, job = null }) {
  const first = String(customer?.name || "").trim().split(/\s+/)[0] || "there"
  const totalCents = invoiceTotalCents(invoice)
  const paidInFull = invoice.status === "paid" || (!!invoice.paid_date && invoice.status !== "partial")
  const paid = paidInFull ? totalCents / 100 : Math.round(Number(invoice.amount_paid || 0) * 100) / 100
  const balance = paidInFull ? 0 : Math.max(0, totalCents / 100 - paid)
  const row = (label, value, strong = false) => `<tr>
      <td style="padding:6px 0;font-size:13px;color:#555;border-bottom:1px solid #eee;${strong ? "font-weight:bold;color:#0D1014;" : ""}">${label}</td>
      <td style="padding:6px 0;font-size:13px;text-align:right;border-bottom:1px solid #eee;${strong ? "font-weight:bold;color:#0D1014;" : ""}">${value}</td>
    </tr>`
  // No method recorded -> the row is hidden (never "—").
  const method = invoice.payment_method ? `${escapeHtml(fmtPaymentMethod(invoice.payment_method))}${invoice.payment_reference ? ` #${escapeHtml(invoice.payment_reference)}` : ""}` : ""
  const paidOn = paidInFull ? fmtDate(invoice.paid_date) : ""
  const invoiceNumber = String(invoice.invoice_number ?? "").trim()
  const signatureHTML = invoice.customer_signature
    ? `<div style="margin-top:16px;border-top:1px solid #ddd;padding-top:12px;">
         <p style="font-size:11px;color:#888;margin:0 0 8px 0;">CUSTOMER SIGNATURE</p>
         <img src="${safeImageSrc(invoice.customer_signature)}" style="max-height:56px;border:1px solid #eee;border-radius:6px;padding:4px;" />
       </div>`
    : ""
  return `<div>
    <p style="font-size:14px;color:#1a1a1a;margin:0 0 6px 0;">Hi ${escapeHtml(first)},</p>
    <p style="font-size:13px;color:#444;margin:0 0 18px 0;">We received your payment — thank you!</p>
    <div style="background:#0D1014;color:white;padding:16px 20px;border-radius:8px;margin-bottom:16px;">
      <p style="font-size:16px;font-weight:bold;margin:0;letter-spacing:1px;">GEN<span style="color:#E03010;">SHIELD</span> <span style="font-size:12px;font-weight:normal;color:#A8B4C4;letter-spacing:0;">· Payment received</span></p>
      ${invoiceNumber ? `<p style="font-size:12px;color:#A8B4C4;margin:4px 0 0 0;">Invoice ${escapeHtml(invoiceNumber)}</p>` : ""}
    </div>${jobDetailsHTML(job)}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      ${row("Invoice total", fmt(totalCents / 100))}
      ${invoice.surcharge_amount > 0 ? row(surchargeLabel(), fmt(invoice.surcharge_amount)) : ""}
      ${method ? row("Payment method", method) : ""}
      ${paidOn ? row("Date", paidOn) : ""}
      ${row(paidInFull ? "Paid" : "Paid so far", fmt(paid), true)}
      ${paidInFull ? row("Balance", "Paid in full ✓", true) : row("Balance due", fmt(balance), true)}
    </table>
    ${serviceNotesHTML(invoice.notes)}
    ${signatureHTML}
  </div>`
}

// Short greeting + "what's attached" line placed above the inline invoice in
// the single job-completion email (and the pay-later receipt).
export function jobSummaryIntroHTML({ customer, kind = "completion", attachmentLabels = [] }) {
  const first = String(customer?.name || "").trim().split(/\s+/)[0] || "there";
  const lead = kind === "receipt"
    ? "We received your payment — thank you! Your paid invoice is below."
    : "Thank you for choosing GenShield. Here is the summary of your service.";
  const attached = attachmentLabels.length
    ? `<p style="font-size:13px;color:#555;margin:8px 0 0 0;">Attached (PDF): ${attachmentLabels.map(escapeHtml).join(", ")}.</p>`
    : "";
  return `<div style="margin-bottom:20px;">
    <p style="font-size:14px;color:#1a1a1a;margin:0 0 6px 0;">Hi ${escapeHtml(first)},</p>
    <p style="font-size:13px;color:#444;margin:0;">${lead}</p>
    ${attached}
  </div>`;
}

// The one customer email sent at job completion / payment: greeting +
// attachment line + invoice inline. PDFs ride as attachments, not in the body.
// `job` (optional) adds the job title + customer-facing description (B3); a
// job with no invoice still shows them and its Service Summary.
export function jobSummaryEmailHTML({ invoice, customer, job = null, kind = "completion", attachmentLabels = [], surchargeConfig = SURCHARGE_DEFAULTS }) {
  if (kind === "receipt" && invoice) return combineEmailSections([paymentReceiptHTML({ invoice, customer, job })]);
  const intro = jobSummaryIntroHTML({ customer, kind, attachmentLabels });
  const body = invoice
    ? invoiceSummaryHTML({ invoice, customer, job, surchargeConfig })
    : jobDetailsHTML(job) + serviceNotesHTML(job?.invoice_notes);
  return combineEmailSections([intro + body]);
}

// "Your Protection Plan is Active" welcome email (MembershipAgreement.jsx,
// sent when the agreement is signed outside a job). Start / expiry rows are
// hidden when the date is unknown; never "Hi ,".
export function membershipWelcomeEmailHTML({ customer, planName, includes = [], start, expiry, discountPct }) {
  const longDate = (v) => { const d = validDate(v); return d ? d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "" }
  const startStr = longDate(start)
  const expiryStr = longDate(expiry)
  const plan = String(planName ?? "").trim()
  const items = (includes || []).filter(i => String(i ?? "").trim())
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <div style="background:#0D1014;padding:22px 24px;border-radius:8px 8px 0 0;">
              <h1 style="color:white;margin:0;font-size:18px;">GEN<span style="color:#E03010;">SHIELD</span></h1>
              <p style="color:#A8B4C4;margin:3px 0 0 0;font-size:12px;">Protection Plan Active</p>
            </div>
            <div style="background:#f8f9fa;padding:22px 24px;border-radius:0 0 8px 8px;">
              <p style="font-size:14px;color:#1a1a1a;">Hi ${escapeHtml(greetingName(customer))},</p>
              <p style="font-size:13px;color:#444;margin-top:8px;">Thank you for signing up for the <strong>${escapeHtml(plan || "GenShield Protection Plan")}</strong>. Your agreement is now active.</p>
              <div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin:14px 0;">
                ${plan ? `<p style="margin:0 0 6px 0;font-size:13px;"><strong>Plan:</strong> ${escapeHtml(plan)}</p>` : ""}
                ${startStr ? `<p style="margin:0 0 6px 0;font-size:13px;"><strong>Start Date:</strong> ${startStr}</p>` : ""}
                ${expiryStr ? `<p style="margin:0 0 6px 0;font-size:13px;"><strong>Expiration:</strong> ${expiryStr}</p>` : ""}
                <p style="margin:0 0 8px 0;font-size:13px;"><strong>Generator:</strong> ${escapeHtml(customer?.generator_model || "Your generator")}${customer?.generator_serial ? ` (S/N: ${escapeHtml(customer.generator_serial)})` : ""}</p>
                ${items.length ? `<p style="margin:0 0 4px 0;font-size:13px;font-weight:bold;">What's included:</p>
                <ul style="margin:0;padding-left:18px;font-size:13px;color:#444;">${items.map(i => `<li style="margin-bottom:3px;">${escapeHtml(i)}</li>`).join("")}</ul>` : ""}
              </div>
              ${discountPct ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:11px;margin-bottom:14px;">
                <p style="margin:0;font-size:13px;color:#166534;">✓ Your ${escapeHtml(discountPct)} member discount will be automatically applied to all qualifying services.</p>
              </div>` : ""}
              <p style="font-size:13px;color:#444;">Your first 30 minutes of diagnostic labor are free on service calls during normal business hours, during the agreement term (not on emergency or after-hours calls).</p>
              <p style="font-size:12px;color:#666;margin-top:16px;">Thank you for choosing GenShield.</p>
            </div>
          </div>`
}
