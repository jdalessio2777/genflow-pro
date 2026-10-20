// node --test scripts/qa/safe-actions.unit.mjs — proves the guard refuses production and non-QA records,
// and that the button is NEVER clicked when it refuses.
import test from 'node:test'; import assert from 'node:assert/strict'; import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
process.env.SAFE_ACTIONS_LOG = path.join(os.tmpdir(), 'safe-actions-test.log');
process.env.SAFE_ACTIONS_SHOTS = path.join(os.tmpdir(), 'safe-actions-test-shots');
const { guardedTap, checkHost, checkRecord, GuardError, attachDialogGuard } = await import('./safe-actions.mjs');
const PREVIEW = 'https://genflow-abc123xyz-jdalessio2777s-projects.vercel.app/jobs/1';
function fakePage(url, { text = 'QA-AUDIT-T Job', stripe = 'test', sendsBlocked = true, fields = [] } = {}) {
  const clicks = [];
  const loc = { first: () => loc, click: async () => { clicks.push(1); }, innerText: async () => 'Save' };
  return { clicks, loc, _sendsBlocked: sendsBlocked, _dialogGuard: true, url: () => url,
    getByText: (t) => ({ count: async () => (text.includes(t) ? 1 : 0) }),
    locator: () => ({ innerText: async () => text }),
    evaluate: async (fn, arg) => (typeof arg === 'string' ? fields.filter(v => v.startsWith(arg)).length : stripe), screenshot: async () => {}, waitForTimeout: async () => {} };
}
for (const u of ['https://genflow-pro.vercel.app/jobs/1', 'https://genflow-pro-jdalessio2777s-projects.vercel.app/', 'https://genflow-pro-git-main-jdalessio2777s-projects.vercel.app/',
  'https://genflow-p8fkcpwg4-jdalessio2777s-projects.vercel.app/', 'https://genflow-ca0gy4mpo-jdalessio2777s-projects.vercel.app/', 'https://genshieldservice.com/', 'http://localhost:5173/']) {
  test('refuses host ' + new URL(u).hostname, async () => {
    const p = fakePage(u);
    await assert.rejects(guardedTap(p, p.loc, { kind: 'save', record: 'QA-AUDIT-T Job' }), GuardError);
    assert.equal(p.clicks.length, 0);
  });
}
test('refuses a non-QA-AUDIT record on a Preview', async () => {
  const p = fakePage(PREVIEW, { text: 'Lingyan Wang' });
  await assert.rejects(guardedTap(p, p.loc, { kind: 'save', record: 'Lingyan Wang' }), /does not start with QA-AUDIT/);
  assert.equal(p.clicks.length, 0);
});
test('refuses a QA-AUDIT name that is not on screen', async () => {
  const p = fakePage(PREVIEW, { text: 'Real Customer' });
  await assert.rejects(guardedTap(p, p.loc, { kind: 'delete', record: 'QA-AUDIT-X' }), /not visible/);
  assert.equal(p.clicks.length, 0);
});
test('refuses send to another recipient', async () => {
  const p = fakePage(PREVIEW, { text: 'QA-AUDIT-T Job someone@example.com' });
  await assert.rejects(guardedTap(p, p.loc, { kind: 'send', record: 'QA-AUDIT-T Job', recipient: 'someone@example.com' }), /recipient/);
  assert.equal(p.clicks.length, 0);
});
test('a full stop after the allowed address is not another recipient', async () => {
  const p = fakePage(PREVIEW, { text: 'QA-AUDIT-T Job Send the summary to jdalessio2777@gmail.com.' });
  await guardedTap(p, p.loc, { kind: 'send', record: 'QA-AUDIT-T Job', recipient: 'jdalessio2777@gmail.com' });
  assert.equal(p.clicks.length, 1);
});
test('still refuses another address followed by a full stop', async () => {
  const p = fakePage(PREVIEW, { text: 'QA-AUDIT-T Job jdalessio2777@gmail.com and someone@example.com.' });
  await assert.rejects(guardedTap(p, p.loc, { kind: 'send', record: 'QA-AUDIT-T Job', recipient: 'jdalessio2777@gmail.com' }), /someone@example\.com(?!\.)/);
  assert.equal(p.clicks.length, 0);
});
test('refuses charge when Stripe is live', async () => {
  const p = fakePage(PREVIEW, { stripe: 'live' });
  await assert.rejects(guardedTap(p, p.loc, { kind: 'charge', record: 'QA-AUDIT-T Job' }), /Stripe mode is live/);
  assert.equal(p.clicks.length, 0);
});
test('allows a QA-AUDIT save on a Preview and logs it', async () => {
  const p = fakePage(PREVIEW);
  const e = await guardedTap(p, p.loc, { kind: 'save', record: 'QA-AUDIT-T Job', item: 'unit' });
  assert.equal(p.clicks.length, 1); assert.equal(e.result, 'tapped');
  assert.match(fs.readFileSync(process.env.SAFE_ACTIONS_LOG, 'utf8'), /"result":"tapped"/);
});
test('checkHost/checkRecord basics', () => {
  assert.throws(() => checkHost('https://genflow-pro.vercel.app'), GuardError);
  assert.ok(checkHost(PREVIEW)); assert.throws(() => checkRecord('Kyle Soden'), GuardError);
  assert.equal(checkRecord('QA-AUDIT-B1 Cust'), 'QA-AUDIT-B1 Cust');
  assert.ok(checkHost('https://genflow-pro.vercel.app/', { mode: 'prod-readonly' }).prod);
});
test('allows a QA-AUDIT name typed in a form field (new customer form)', async () => {
  const p = fakePage(PREVIEW, { text: 'New Customer', fields: ['QA-AUDIT-B4 Pat'] });
  await guardedTap(p, p.loc, { kind: 'create', record: 'QA-AUDIT-B4 Pat', item: 'unit' });
  assert.equal(p.clicks.length, 1);
});
test('refuses when the form field holds a real name', async () => {
  const p = fakePage(PREVIEW, { text: 'New Customer', fields: ['Kyle Soden'] });
  await assert.rejects(guardedTap(p, p.loc, { kind: 'create', record: 'QA-AUDIT-B4 Pat' }), /not visible/);
  assert.equal(p.clicks.length, 0);
});

// ── prod-readonly mode (genflow-ship production smoke test) ──────────────────
const PROD = 'https://genflow-pro.vercel.app/jobs/1';
test('prod-readonly: refuses a Preview or any other host', () => {
  assert.throws(() => checkHost(PREVIEW, { mode: 'prod-readonly' }), /expects the production host/);
  assert.throws(() => checkHost('https://genshieldservice.com/', { mode: 'prod-readonly' }), GuardError);
});
for (const kind of ['send', 'charge', 'payment']) {
  test(`prod-readonly: refuses kind ${kind} on a QA-AUDIT record`, async () => {
    const p = fakePage(PROD);
    await assert.rejects(guardedTap(p, p.loc, { kind, record: 'QA-AUDIT-T Job', mode: 'prod-readonly', recipient: 'jdalessio2777@gmail.com' }), /never allowed in prod-readonly|no charges/);
    assert.equal(p.clicks.length, 0);
  });
}
test('prod-readonly: refuses a real record', async () => {
  const p = fakePage(PROD, { text: 'Lingyan Wang' });
  await assert.rejects(guardedTap(p, p.loc, { kind: 'save', record: 'Lingyan Wang', mode: 'prod-readonly' }), /does not start with QA-AUDIT/);
  assert.equal(p.clicks.length, 0);
});
test('prod-readonly: refuses any write when the email routes are not blocked', async () => {
  const p = fakePage(PROD, { sendsBlocked: false });
  await assert.rejects(guardedTap(p, p.loc, { kind: 'delete', record: 'QA-AUDIT-T Job', mode: 'prod-readonly' }), /email routes to be blocked/);
  assert.equal(p.clicks.length, 0);
});
test('prod-readonly: allows a QA-AUDIT save on production with emails blocked', async () => {
  const p = fakePage(PROD);
  const e = await guardedTap(p, p.loc, { kind: 'save', record: 'QA-AUDIT-T Job', item: 'unit', mode: 'prod-readonly' });
  assert.equal(p.clicks.length, 1); assert.equal(e.result, 'tapped');
});
test('preview mode (default) still refuses production', async () => {
  const p = fakePage(PROD);
  await assert.rejects(guardedTap(p, p.loc, { kind: 'save', record: 'QA-AUDIT-T Job' }), /production host/);
  assert.equal(p.clicks.length, 0);
});
test('tracked copy: default log/shots live under the untracked .qa-scratch folder', async () => {
  const m = await import('./safe-actions.mjs');
  assert.match(m.RUN_DIR, /\.qa-scratch/);
});

// F5 (Run 7): native dialogs are dismissed unless a guarded tap armed them for its record.
function dialogPage() {
  const handlers = []; const clicks = []; let pending = null;
  const page = { clicks, _sendsBlocked: true, url: () => PREVIEW, on: (ev, fn) => { if (ev === 'dialog') handlers.push(fn); },
    getByText: (t) => ({ count: async () => ('QA-AUDIT-T Job'.includes(t) ? 1 : 0) }), locator: () => ({ innerText: async () => 'QA-AUDIT-T Job' }),
    evaluate: async () => 0, screenshot: async () => {}, waitForTimeout: async () => { if (pending) await pending; } };
  page.fire = (message) => { const d = { message: () => message, type: () => 'confirm', accepted: null, accept: async () => { d.accepted = true; }, dismiss: async () => { d.accepted = false; } };
    pending = Promise.all(handlers.map(h => h(d))); return d; };
  return page;
}
test('a dialog with no guarded tap is dismissed (an unguarded trash tap cannot delete)', async () => {
  const p = attachDialogGuard(dialogPage());
  const d = p.fire('Delete "QA-AUDIT-T Job"?'); await new Promise(r => setTimeout(r, 0));
  assert.equal(d.accepted, false);
});
test('guardedTap refuses on a page without attachDialogGuard', async () => {
  const p = fakePage(PREVIEW); p._dialogGuard = false;
  await assert.rejects(guardedTap(p, p.loc, { kind: 'delete', record: 'QA-AUDIT-T Job' }), /attachDialogGuard/);
  assert.equal(p.clicks.length, 0);
});
test('a guarded tap with dialog:true accepts a dialog naming its QA record, dismisses one naming another record', async () => {
  for (const [msg, want] of [['Delete "QA-AUDIT-T Job"? This cannot be undone.', true], ['Delete "Generac Battery 26R"?', false]]) {
    const p = attachDialogGuard(dialogPage()); let d;
    const loc = { first: () => loc, innerText: async () => '', click: async () => { p.clicks.push(1); d = p.fire(msg); } };
    await guardedTap(p, loc, { kind: 'delete', record: 'QA-AUDIT-T Job', dialog: true });
    assert.equal(d.accepted, want, msg);
  }
});
test('dialogMatch accepts the cash "remove surcharge?" question, only for an armed tap', async () => {
  const p = attachDialogGuard(dialogPage()); let d;
  const loc = { first: () => loc, innerText: async () => 'Cash', click: async () => { d = p.fire('This invoice has a credit card surcharge ($7.30). Remove it? Cash is not a credit card payment.'); } };
  await guardedTap(p, loc, { kind: 'save', record: 'QA-AUDIT-T Job', dialog: true, dialogMatch: /credit card surcharge/ });
  assert.equal(d.accepted, true);
  const late = p.fire('This invoice has a credit card surcharge ($7.30). Remove it?'); await new Promise(r => setTimeout(r, 0));
  assert.equal(late.accepted, false);
});
