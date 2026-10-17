// The one HTML-escaping helper for every generated HTML document (emails,
// printable Service History, invoice/checklist summaries, PDFs built from
// HTML). Plain ESM, no aliases — imported by both src/ and api/.
// Any text a person typed (customer, job, part, invoice, checklist fields, …)
// must pass through escapeHtml before it is interpolated into HTML.

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Escaped multi-line text with line breaks preserved as <br>.
export function multilineHtml(str) {
  return escapeHtml(String(str ?? '').trim()).replace(/\r?\n/g, '<br>')
}

// For <img src>: only inline images (signature pads) or https URLs. Anything
// else (javascript:, data:text/html, …) renders as an empty src.
export function safeImageSrc(src) {
  const s = String(src ?? '').trim()
  if (/^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(s)) return escapeHtml(s)
  if (/^https:\/\/[^\s"'<>]+$/i.test(s)) return escapeHtml(s)
  return ''
}
