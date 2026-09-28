// Signed maintenance agreement (job_agreements row + its snapshot) -> PDF.
// Renders from the snapshot taken at signing, so a later re-sign/renewal on
// the customer record never changes what this job's contract shows.
import { createDoc, BRAND, PAGE, fmtDateLong, safeFilename } from './common.js';
import { PLANS, TERMS, UNIT_TYPE_LABEL } from '../../../src/lib/agreementTerms.js';

function decodeDataUrl(dataUrl) {
  const m = /^data:(image\/(png|jpe?g));base64,(.+)$/i.exec(String(dataUrl || '').trim());
  if (!m) return null;
  return { kind: m[2].toLowerCase() === 'png' ? 'png' : 'jpg', bytes: Buffer.from(m[3], 'base64') };
}

export function agreementFilename(agreement) {
  const name = agreement?.snapshot?.customer?.name || 'Customer';
  return `GenShield-Maintenance-Agreement-${safeFilename(name, 'Customer')}.pdf`;
}

export async function buildAgreementPdf({ agreement }) {
  const snap = agreement?.snapshot || {};
  const planKey = agreement?.plan || snap.plan?.key;
  const fallbackPlan = PLANS[planKey] || {};
  const plan = {
    name: snap.plan?.name || agreement?.plan_name || fallbackPlan.name || 'Protection Plan',
    billingLabel: snap.plan?.billingLabel || fallbackPlan.billingLabel || '',
    includes: Array.isArray(snap.plan?.includes) ? snap.plan.includes : (fallbackPlan.includes || []),
  };
  const terms = Array.isArray(snap.terms) && snap.terms.length ? snap.terms : TERMS;
  const customer = snap.customer || {};
  const generator = snap.generator || {};
  const signedAt = agreement?.signed_at || agreement?.start_date;

  const L = await createDoc({ title: `Maintenance Agreement - ${customer.name || ''}`.trim(), dateIso: signedAt });
  L.addPage();
  L.brandHeader({ label: 'Maintenance Agreement', sublabel: `Signed ${fmtDateLong(signedAt)}` });
  L.onNewPage = (lay) => {
    lay.page.drawRectangle({ x: 0, y: PAGE.height - 6, width: PAGE.width, height: 6, color: BRAND.charcoal });
    lay.page.drawText(lay.s('Generator Maintenance Agreement (continued)'), { x: PAGE.margin, y: PAGE.height - 30, size: 9, font: lay.bold, color: BRAND.muted });
    lay.y = PAGE.height - 44;
  };

  L.heading('Generator Maintenance Agreement', { size: 16, after: 2 });
  L.paragraph('GenShield LLC', { size: 9.5, color: BRAND.muted, after: 10 });

  L.infoBox([
    ['Customer', customer.name],
    ['Address', customer.address || '-'],
    ['Generator', generator.model || '-'],
    ['Serial No.', generator.serial || '-'],
    ['Unit Type', snap.unit_type || UNIT_TYPE_LABEL],
    ['Plan', plan.name],
    ['Amount', plan.billingLabel || undefined],
    ['Start Date', fmtDateLong(agreement?.start_date)],
    ['Expires', fmtDateLong(agreement?.expiry_date)],
  ], { labelWidth: 90 });

  L.heading('What’s Included', { size: 11.5, color: BRAND.red, after: 4 });
  for (const item of plan.includes) {
    const lines = L.wrap(item, 10, L.contentWidth - 18);
    L.ensure(lines.length * 13 + 2);
    L.drawBullet(PAGE.margin + 5, L.y - 6.5);
    L.paragraph(item, { size: 10, x: PAGE.margin + 16, maxWidth: L.contentWidth - 18, after: 2 });
  }
  L.y -= 8;

  L.heading('Terms & Conditions', { size: 11.5, color: BRAND.red, after: 4 });
  for (const t of terms) {
    L.ensure(40);
    L.paragraph(`${t.n}. ${t.title}`, { size: 9.5, f: L.bold, after: 1 });
    L.paragraph(t.body, { size: 9, color: BRAND.text, lineGap: 2.5, after: 7 });
  }

  // Signature block
  L.ensure(140);
  L.y -= 6;
  L.rule();
  L.y -= 14;
  L.paragraph(`By signing, ${customer.name || 'the customer'} agreed to the terms and conditions above.`, { size: 9, color: BRAND.muted, after: 8 });
  const img = decodeDataUrl(agreement?.signature);
  if (img) {
    try {
      const embedded = img.kind === 'png' ? await L.pdf.embedPng(img.bytes) : await L.pdf.embedJpg(img.bytes);
      const maxW = 240, maxH = 80;
      const scale = Math.min(maxW / embedded.width, maxH / embedded.height, 1);
      const w = embedded.width * scale, h = embedded.height * scale;
      L.page.drawRectangle({ x: PAGE.margin, y: L.y - h - 8, width: w + 16, height: h + 8, borderColor: BRAND.rule, borderWidth: 0.8, color: BRAND.white });
      L.page.drawImage(embedded, { x: PAGE.margin + 8, y: L.y - h - 4, width: w, height: h });
      L.y -= h + 16;
    } catch {
      L.paragraph('[Signature on file]', { size: 10, color: BRAND.muted });
    }
  } else {
    L.paragraph('[Signature on file]', { size: 10, color: BRAND.muted });
  }
  L.paragraph(`Customer signature - ${customer.name || ''}`, { size: 9, f: L.bold, after: 1 });
  L.paragraph(`Signed electronically on ${fmtDateLong(signedAt)}`, { size: 9, color: BRAND.muted });

  L.finalizeFooters();
  return L.save();
}
