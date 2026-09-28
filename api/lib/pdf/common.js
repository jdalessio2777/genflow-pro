// Shared pdf-lib layout helpers for GenShield customer PDFs (service
// checklists, maintenance agreements). Pure JS — no headless browser.
//
// Standard fonts (Helvetica) only encode WinAnsi. Anything outside that set
// (✓ ○ emoji, CJK, etc.) would make pdf-lib throw, so every string goes
// through sanitize() and check marks / bullets / circles are DRAWN as vector
// shapes instead of being typed as glyphs.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export const BRAND = {
  charcoal: rgb(0x1a / 255, 0x1a / 255, 0x1c / 255), // #1a1a1c
  red: rgb(0xd3 / 255, 0x2c / 255, 0x2c / 255),      // #D32C2C
  text: rgb(0.13, 0.13, 0.14),
  muted: rgb(0.42, 0.45, 0.5),
  light: rgb(0.96, 0.96, 0.97),
  rule: rgb(0.88, 0.89, 0.91),
  green: rgb(0.086, 0.639, 0.29),
  white: rgb(1, 1, 1),
  headerSub: rgb(0.66, 0.71, 0.77),
};

export const PAGE = { width: 612, height: 792, margin: 48 }; // US Letter

const REPLACEMENTS = {
  '✓': 'Yes', '✔': 'Yes', '✅': 'Yes', '✗': 'No', '✘': 'No',
  '○': '-', '●': '-', '·': '-', '→': '->', '←': '<-',
  '≤': '<=', '≥': '>=', ' ': ' ', ' ': ' ', ' ': ' ',
  '‑': '-', '‒': '-', '−': '-',
};

// Fixed timestamp so the same inputs always produce byte-identical PDFs —
// the Resend Idempotency-Key requires a retry's payload to match exactly.
function stableDate(iso) {
  const d = iso ? new Date(iso) : null;
  return d && !isNaN(d.getTime()) ? d : new Date('2020-01-01T00:00:00.000Z');
}

export async function createDoc({ title, dateIso }) {
  const pdf = await PDFDocument.create({ updateMetadata: false });
  const date = stableDate(dateIso);
  pdf.setTitle(title || 'GenShield', { showInWindowTitleBar: true });
  pdf.setAuthor('GenShield LLC');
  pdf.setCreator('GenFlow Pro');
  pdf.setProducer('GenFlow Pro (pdf-lib)');
  pdf.setCreationDate(date);
  pdf.setModificationDate(date);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const charset = new Set(font.getCharacterSet());
  return new Layout(pdf, font, bold, charset);
}

export function sanitizeFor(charset, value) {
  const str = String(value ?? '').normalize('NFC');
  let out = '';
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    if (ch === '\n' || ch === '\t') { out += ch === '\t' ? ' ' : '\n'; continue; }
    if (charset.has(cp)) { out += ch; continue; }
    if (REPLACEMENTS[ch] !== undefined) { out += REPLACEMENTS[ch]; continue; }
    const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (base && base !== ch && [...base].every(c => charset.has(c.codePointAt(0)))) { out += base; continue; }
    // emoji / unsupported symbol: drop it
  }
  return out.replace(/\r/g, '');
}

export function fmtDateLong(iso, tz = 'America/New_York') {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: tz });
}

export function fmtMoney(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function safeFilename(name, fallback = 'document') {
  const base = String(name || fallback).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 _.-]+/g, '').trim().replace(/\s+/g, '-').slice(0, 80);
  return base || fallback;
}

export class Layout {
  constructor(pdf, font, bold, charset) {
    this.pdf = pdf;
    this.font = font;
    this.bold = bold;
    this.charset = charset;
    this.page = null;
    this.y = 0;
    this.contentWidth = PAGE.width - PAGE.margin * 2;
    this.onNewPage = null; // optional continuation header
  }

  s(text) { return sanitizeFor(this.charset, text); }

  width(text, size, f = this.font) { return f.widthOfTextAtSize(this.s(text), size); }

  addPage() {
    this.page = this.pdf.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - PAGE.margin;
    if (this.onNewPage) this.onNewPage(this);
    return this.page;
  }

  ensure(height) {
    if (!this.page || this.y - height < PAGE.margin + 24) this.addPage();
  }

  // Branded header band: charcoal bar, GEN (white) + SHIELD (red), tagline,
  // and a right-aligned document label.
  brandHeader({ label, sublabel }) {
    const h = 74;
    const top = PAGE.height;
    this.page.drawRectangle({ x: 0, y: top - h, width: PAGE.width, height: h, color: BRAND.charcoal });
    this.page.drawRectangle({ x: 0, y: top - h - 3, width: PAGE.width, height: 3, color: BRAND.red });
    const x = PAGE.margin;
    this.page.drawText('GEN', { x, y: top - 38, size: 22, font: this.bold, color: BRAND.white });
    const genW = this.bold.widthOfTextAtSize('GEN', 22);
    this.page.drawText('SHIELD', { x: x + genW, y: top - 38, size: 22, font: this.bold, color: BRAND.red });
    this.page.drawText('STANDBY GENERATOR SERVICE & REPAIR', { x, y: top - 54, size: 7.5, font: this.bold, color: BRAND.headerSub });
    if (label) {
      const l = this.s(label).toUpperCase();
      const lw = this.bold.widthOfTextAtSize(l, 11);
      this.page.drawText(l, { x: PAGE.width - PAGE.margin - lw, y: top - 34, size: 11, font: this.bold, color: BRAND.red });
    }
    if (sublabel) {
      const sl = this.s(sublabel);
      const sw = this.font.widthOfTextAtSize(sl, 9);
      this.page.drawText(sl, { x: PAGE.width - PAGE.margin - sw, y: top - 50, size: 9, font: this.font, color: BRAND.headerSub });
    }
    this.y = top - h - 3 - 24;
  }

  // Word-wrap to maxWidth; honours explicit newlines; hard-breaks long words.
  wrap(text, size, maxWidth, f = this.font) {
    const lines = [];
    for (const para of this.s(text).split('\n')) {
      const words = para.split(/\s+/).filter(Boolean);
      if (!words.length) { lines.push(''); continue; }
      let line = '';
      for (let word of words) {
        while (f.widthOfTextAtSize(word, size) > maxWidth) {
          let cut = word.length - 1;
          while (cut > 1 && f.widthOfTextAtSize(word.slice(0, cut), size) > maxWidth) cut--;
          if (line) { lines.push(line); line = ''; }
          lines.push(word.slice(0, cut));
          word = word.slice(cut);
        }
        const candidate = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
        else { lines.push(line); line = word; }
      }
      if (line) lines.push(line);
    }
    return lines;
  }

  paragraph(text, { size = 10, f = this.font, color = BRAND.text, x = PAGE.margin, maxWidth = this.contentWidth, lineGap = 3, after = 6 } = {}) {
    const lh = size + lineGap;
    for (const line of this.wrap(text, size, maxWidth, f)) {
      this.ensure(lh);
      this.page.drawText(line, { x, y: this.y - size, size, font: f, color });
      this.y -= lh;
    }
    this.y -= after;
  }

  heading(text, { size = 15, color = BRAND.charcoal, after = 8 } = {}) {
    this.ensure(size + 10);
    this.paragraph(text, { size, f: this.bold, color, after });
  }

  // Full-width charcoal bar with white label (checklist section headers).
  sectionBar(text) {
    const h = 20;
    this.ensure(h + 30);
    this.page.drawRectangle({ x: PAGE.margin, y: this.y - h, width: this.contentWidth, height: h, color: BRAND.charcoal });
    const lines = this.wrap(String(text).toUpperCase(), 9, this.contentWidth - 16, this.bold);
    this.page.drawText(lines[0] || '', { x: PAGE.margin + 8, y: this.y - 14, size: 9, font: this.bold, color: BRAND.white });
    this.y -= h + 2;
  }

  // Two-column key/value grid in a light box.
  infoBox(rows, { labelWidth = 110 } = {}) {
    const size = 9.5;
    const lh = size + 4;
    const valueWidth = this.contentWidth - labelWidth - 20;
    const prepared = rows.filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '')
      .map(([k, v]) => [k, this.wrap(v, size, valueWidth, this.bold)]);
    const height = prepared.reduce((s, [, ls]) => s + ls.length * lh, 0) + 16;
    this.ensure(height);
    this.page.drawRectangle({ x: PAGE.margin, y: this.y - height, width: this.contentWidth, height, color: BRAND.light });
    this.page.drawRectangle({ x: PAGE.margin, y: this.y - height, width: 3, height, color: BRAND.red });
    let y = this.y - 8;
    for (const [k, ls] of prepared) {
      this.page.drawText(this.s(k).toUpperCase(), { x: PAGE.margin + 12, y: y - size, size: 7.5, font: this.bold, color: BRAND.muted });
      ls.forEach((line, i) => {
        this.page.drawText(line, { x: PAGE.margin + 12 + labelWidth, y: y - size - i * lh, size, font: this.bold, color: BRAND.text });
      });
      y -= ls.length * lh;
    }
    this.y -= height + 14;
  }

  // Vector check mark (never a ✓ glyph).
  drawCheck(x, y, size, color = BRAND.green) {
    const t = Math.max(1.4, size / 7);
    this.page.drawLine({ start: { x, y: y + size * 0.5 }, end: { x: x + size * 0.38, y: y + size * 0.12 }, thickness: t, color });
    this.page.drawLine({ start: { x: x + size * 0.38, y: y + size * 0.12 }, end: { x: x + size, y: y + size * 0.9 }, thickness: t, color });
  }

  // Vector hollow circle (never a ○ glyph).
  drawHollowCircle(cx, cy, r, color = BRAND.muted) {
    this.page.drawCircle({ x: cx, y: cy, size: r, borderColor: color, borderWidth: 1 });
  }

  drawBullet(cx, cy, r = 1.8, color = BRAND.red) {
    this.page.drawCircle({ x: cx, y: cy, size: r, color });
  }

  rule() {
    this.page.drawLine({ start: { x: PAGE.margin, y: this.y }, end: { x: PAGE.width - PAGE.margin, y: this.y }, thickness: 0.6, color: BRAND.rule });
  }

  // Footer on every page: contact line + "Page x of y".
  finalizeFooters(footerText) {
    const pages = this.pdf.getPages();
    const text = this.s(footerText || 'GenShield LLC  |  (973) 787-2431  |  contact@genshieldservice.com  |  genshieldservice.com');
    pages.forEach((p, i) => {
      p.drawLine({ start: { x: PAGE.margin, y: 40 }, end: { x: PAGE.width - PAGE.margin, y: 40 }, thickness: 0.6, color: BRAND.rule });
      p.drawText(text, { x: PAGE.margin, y: 28, size: 7.5, font: this.font, color: BRAND.muted });
      const label = `Page ${i + 1} of ${pages.length}`;
      const w = this.font.widthOfTextAtSize(label, 7.5);
      p.drawText(label, { x: PAGE.width - PAGE.margin - w, y: 28, size: 7.5, font: this.font, color: BRAND.muted });
    });
  }

  async save() {
    return this.pdf.save({ useObjectStreams: false });
  }
}
