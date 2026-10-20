// Test helper: pull the visible text out of a pdf-lib PDF (standard fonts,
// FlateDecode content streams, hex-string Tj operators). Lines are joined
// with spaces so wrapped sentences can be searched as one string.
import zlib from 'node:zlib'

export function pdfText(bytes) {
  const buf = Buffer.from(bytes)
  const raw = buf.toString('latin1')
  const out = []
  const re = /stream\r?\n/g
  let m
  while ((m = re.exec(raw))) {
    const start = m.index + m[0].length
    const end = raw.indexOf('endstream', start)
    if (end < 0) break
    let body = buf.subarray(start, end)
    try { body = zlib.inflateSync(body) } catch { /* not compressed */ }
    const s = body.toString('latin1')
    for (const t of s.matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)) out.push(Buffer.from(t[1], 'hex').toString('latin1'))
    for (const t of s.matchAll(/\((.*?)\)\s*Tj/g)) out.push(t[1])
    re.lastIndex = end
  }
  return out.join(' ').replace(/\s+/g, ' ')
}
