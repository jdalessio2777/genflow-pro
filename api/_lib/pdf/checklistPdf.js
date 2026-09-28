// Completed service checklist (job_documents row) -> PDF bytes.
import { createDoc, BRAND, PAGE, fmtDateLong, safeFilename } from './common.js';

function displayValue(field, raw) {
  if (raw === undefined || raw === null || raw === '') return '';
  if (field.type === 'photo') return 'Photo on file';
  if (field.type === 'date') {
    const d = new Date(raw);
    // date inputs store YYYY-MM-DD — format without shifting a day via TZ
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) return fmtDateLong(`${raw}T12:00:00Z`, 'UTC');
    return isNaN(d.getTime()) ? String(raw) : fmtDateLong(raw);
  }
  if (Array.isArray(raw)) return raw.join(', ');
  if (typeof raw === 'object') return JSON.stringify(raw);
  return String(raw);
}

export function checklistFilename(doc) {
  return `${safeFilename(doc?.template_name, 'Service-Checklist')}.pdf`;
}

export async function buildChecklistPdf({ doc, customer, job }) {
  const title = doc?.template_name || 'Service Checklist';
  const L = await createDoc({ title, dateIso: doc?.completed_date || job?.completed_date });
  const completedStr = fmtDateLong(doc?.completed_date || job?.completed_date);

  L.addPage();
  L.brandHeader({ label: 'Service Checklist', sublabel: completedStr });
  L.onNewPage = (lay) => {
    lay.page.drawRectangle({ x: 0, y: PAGE.height - 6, width: PAGE.width, height: 6, color: BRAND.charcoal });
    lay.page.drawText(lay.s(`${title} (continued)`), { x: PAGE.margin, y: PAGE.height - 30, size: 9, font: lay.bold, color: BRAND.muted });
    lay.y = PAGE.height - 44;
  };

  L.heading(title, { size: 16 });
  L.infoBox([
    ['Customer', customer?.name],
    ['Service Address', customer?.address],
    ['Generator', [customer?.generator_model, customer?.generator_serial ? `S/N ${customer.generator_serial}` : ''].filter(Boolean).join('  |  ')],
    ['Service', job?.title],
    ['Completed', completedStr],
  ]);

  const fields = Array.isArray(doc?.field_definitions) ? doc.field_definitions : [];
  const values = doc?.field_values || {};
  const size = 9.5;
  const lh = size + 4;
  const labelW = L.contentWidth * 0.58;
  const valueX = PAGE.margin + labelW + 12;
  const valueW = L.contentWidth - labelW - 20;
  let stripe = 0;

  for (const field of fields) {
    if (field.type === 'section_header') {
      L.y -= 6;
      L.sectionBar(field.label || '');
      stripe = 0;
      continue;
    }
    const raw = values[field.id];
    if (field.type !== 'checkbox' && (raw === undefined || raw === null || raw === '')) continue;

    const labelLines = L.wrap(field.label || '', size, labelW - 8);
    const valueLines = field.type === 'checkbox' ? [''] : L.wrap(displayValue(field, raw), size, valueW, L.bold);
    const rows = Math.max(labelLines.length, valueLines.length);
    const h = rows * lh + 8;
    L.ensure(h);
    if (stripe++ % 2 === 0) {
      L.page.drawRectangle({ x: PAGE.margin, y: L.y - h, width: L.contentWidth, height: h, color: BRAND.light });
    }
    labelLines.forEach((line, i) => {
      L.page.drawText(line, { x: PAGE.margin + 8, y: L.y - 4 - size - i * lh + 1, size, font: L.font, color: BRAND.text });
    });
    if (field.type === 'checkbox') {
      const cy = L.y - 4 - size / 2 - 1;
      if (raw) {
        L.drawCheck(valueX, cy - 5, 10);
        L.page.drawText('Done', { x: valueX + 16, y: cy - 3.5, size: 9, font: L.bold, color: BRAND.green });
      } else {
        L.drawHollowCircle(valueX + 5, cy, 4.5);
        L.page.drawText('Not checked', { x: valueX + 16, y: cy - 3.5, size: 9, font: L.font, color: BRAND.muted });
      }
    } else {
      valueLines.forEach((line, i) => {
        L.page.drawText(line, { x: valueX, y: L.y - 4 - size - i * lh + 1, size, font: L.bold, color: BRAND.text });
      });
    }
    L.y -= h;
  }

  if (!fields.length) L.paragraph('No checklist items recorded.', { color: BRAND.muted });

  L.finalizeFooters();
  return L.save();
}
