// SAFETY GUARD for every write action in a real-app test (Run 6).
// Every tap that saves, deletes, cancels, completes, sends, charges, approves or
// records payment goes through guardedTap(). Before the tap it:
//  1. asserts the page host is a Preview (never production or a production alias;
//     the deployed bundle must carry a Stripe pk_test_ key and no pk_live_ key),
//  2. asserts the record named on screen starts with "QA-AUDIT",
//  3. send: recipient shown is jdalessio2777@gmail.com, or no email can send;
//     charge: Stripe test mode, and "Charge via Stripe App" only when intercepted,
//  4. screenshots before and after the tap,
//  5. appends a line to run6/actions.log.
// A thrown GuardError means: STOP that flow, log it, never work around it.
// Modes: mode 'preview' (default) or 'prod-readonly' (production smoke test: only
// the production host, only QA-AUDIT records, no send/charge/payment kinds at
// all, and every write requires the email routes to be blocked in the browser
// context (page._sendsBlocked) so nothing can email from production; see the
// genflow-ship skill).
//
// Tracked copy (scripts/qa/, excluded from deploys by .vercelignore). Run notes
// go to the untracked .qa-scratch/ folder: set QA_RUN_DIR (e.g.
// .qa-scratch/run7) or SAFE_ACTIONS_LOG / SAFE_ACTIONS_SHOTS; the default is
// <repo>/.qa-scratch/current-run. No secrets and no absolute paths in here.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ALLOWED_RECIPIENT = 'jdalessio2777@gmail.com';
export const QA_PREFIX = 'QA-AUDIT';
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..', '..');
export const RUN_DIR = process.env.QA_RUN_DIR ? path.resolve(process.env.QA_RUN_DIR) : path.join(REPO_ROOT, '.qa-scratch', 'current-run');
export const LOG_FILE = process.env.SAFE_ACTIONS_LOG || path.join(RUN_DIR, 'actions.log');
export const SHOTS_ROOT = process.env.SAFE_ACTIONS_SHOTS || path.join(RUN_DIR, 'shots');

// Production hostnames and every known production deployment of genflow-pro.
const PROD_HOSTS = new Set([
  'genflow-pro.vercel.app',
  'genflow-pro-jdalessio2777s-projects.vercel.app',
  'genflow-pro-git-main-jdalessio2777s-projects.vercel.app',
]);
const PROD_DEPLOY_IDS = ['p8fkcpwg4', 'ca0gy4mpo', 'o4trppizt', 'n4tgec5ud', 'khrnhy3v0', 'riksip4zj'];
const PREVIEW_RE = /^genflow-([a-z0-9]{9})-jdalessio2777s-projects\.vercel\.app$/;
const LOCAL_RE = /^(localhost|127\.0\.0\.1)$/;

export const WRITE_KINDS = ['save', 'delete', 'cancel', 'complete', 'send', 'charge', 'approve', 'payment', 'create'];

export class GuardError extends Error { constructor(msg) { super('SAFETY GUARD REFUSED: ' + msg); this.name = 'GuardError'; } }

export function checkHost(urlString, { mode = 'preview', allowLocal = !!process.env.SAFE_ALLOW_LOCAL } = {}) {
  let u; try { u = new URL(urlString); } catch { throw new GuardError(`bad page URL ${urlString}`); }
  const h = u.hostname.toLowerCase();
  if (mode === 'prod-readonly') {
    if (PROD_HOSTS.has(h)) return { host: h, prod: true };
    throw new GuardError(`prod-readonly mode expects the production host, got ${h}`);
  }
  if (PROD_HOSTS.has(h) || /^genflow-pro[.-]/.test(h)) throw new GuardError(`production host ${h}`);
  const m = h.match(PREVIEW_RE);
  if (m) {
    if (PROD_DEPLOY_IDS.includes(m[1])) throw new GuardError(`production deployment ${h}`);
    return { host: h, prod: false };
  }
  if (allowLocal && LOCAL_RE.test(h)) return { host: h, prod: false, local: true };
  throw new GuardError(`host ${h} is not a genflow Preview`);
}

export function checkRecord(name) {
  const s = String(name ?? '').trim();
  if (!s.startsWith(QA_PREFIX)) throw new GuardError(`record "${s.slice(0, 60)}" does not start with ${QA_PREFIX}`);
  return s;
}

// Stripe mode of the deployed bundle (cached per origin). Production carries pk_live_.
const stripeCache = new Map();
export async function stripeModeOf(page) {
  const origin = new URL(page.url()).origin;
  if (stripeCache.has(origin)) return stripeCache.get(origin);
  const mode = await page.evaluate(async () => {
    // Every same-origin JS file the app uses: entry scripts, modulepreloads,
    // chunks already loaded, and every assets/*.js the entry references
    // (route code-splitting puts the Stripe key in a lazily loaded chunk).
    const same = (u) => { try { const x = new URL(u, location.href); return x.origin === location.origin && /\.js(\?|$)/.test(x.pathname) ? x.href : null; } catch { return null; } };
    const queue = [
      ...[...document.querySelectorAll('script[src]')].map(s => s.src),
      ...[...document.querySelectorAll('link[rel="modulepreload"]')].map(l => l.href),
      ...performance.getEntriesByType('resource').map(r => r.name),
    ].map(same).filter(Boolean);
    const seen = new Set(); let test = false, live = false;
    while (queue.length && seen.size < 200) {
      const s = queue.shift(); if (seen.has(s)) continue; seen.add(s);
      let t = ''; try { t = await (await fetch(s)).text(); } catch { continue; }
      if (t.includes('pk_test_')) test = true;
      if (t.includes('pk_live_')) live = true;
      for (const m of t.matchAll(/assets\/[\w.-]+\.js/g)) { const u = same('/' + m[0]); if (u && !seen.has(u)) queue.push(u); }
    }
    return live ? 'live' : test ? 'test' : 'unknown';
  });
  if (mode !== 'unknown') stripeCache.set(origin, mode);
  return mode;
}

function logLine(o) {
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  fs.appendFileSync(LOG_FILE, JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n');
}

async function inFieldValues(page, record) {
  if (typeof page.evaluate !== 'function') return 0;
  return page.evaluate((r) => [...document.querySelectorAll('input:not([type=hidden]), textarea')]
    .filter(el => el.offsetParent !== null && String(el.value || '').trim().startsWith(r)).length, record).catch(() => 0);
}

let shotSeq = 0;
async function snap(page, item, name) {
  const dir = path.join(SHOTS_ROOT, item || 'misc'); fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `${String(++shotSeq).padStart(3, '0')}-${name.replace(/[^a-z0-9-]+/gi, '_').slice(0, 60)}.png`);
  await page.screenshot({ path: f }).catch(() => {});
  return f;
}

/**
 * guardedTap(page, locator, opts)
 * opts.kind      one of WRITE_KINDS (required)
 * opts.record    the record name AS READ FROM THE SCREEN (required); must start with QA-AUDIT and be visible
 * opts.item      shots sub-folder (e.g. 'B1')
 * opts.label     human label for the log
 * opts.recipient (send) the recipient shown on screen; must be ALLOWED_RECIPIENT
 * opts.noEmail   (send/complete) true when no email can go out: requires page._sendsBlocked or a "No email" notice
 * opts.stripeAppIntercepted (charge) true when stripedashboard:// is intercepted in this context
 * opts.mode      'preview' | 'prod-readonly'
 */
export async function guardedTap(page, locator, opts = {}) {
  const { kind, record, item = 'misc', label = kind, mode = 'preview' } = opts;
  const url = page.url();
  const entry = { url, record, kind, label };
  try {
    if (!WRITE_KINDS.includes(kind)) throw new GuardError(`unknown kind ${kind}`);
    checkHost(url, { mode });
    checkRecord(record);
    // On screen = in the page text, or typed into a form field (new/edit forms).
    let visible = await page.getByText(record, { exact: false }).count().catch(() => 0);
    if (!visible) visible = await inFieldValues(page, record);
    if (!visible) throw new GuardError(`record "${record}" is not visible on screen`);
    if (mode === 'prod-readonly' && ['send', 'charge', 'payment'].includes(kind)) throw new GuardError(`kind ${kind} is never allowed in prod-readonly mode`);
    if (mode === 'prod-readonly' && !page._sendsBlocked) throw new GuardError('prod-readonly mode requires the email routes to be blocked in this browser context');
    const btnText = ((await locator.first().innerText().catch(() => '')) || '').trim();
    entry.button = btnText.slice(0, 80);
    if (kind === 'send' || (kind === 'complete' && !opts.noEmail)) {
      if (opts.noEmail) {
        if (!page._sendsBlocked) throw new GuardError('noEmail claimed but email routes are not blocked in this context');
      } else {
        if (opts.recipient !== ALLOWED_RECIPIENT) throw new GuardError(`recipient ${opts.recipient} is not ${ALLOWED_RECIPIENT}`);
        const body = await page.locator('body').innerText();
        const others = (body.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || []).map(e => e.replace(/\.+$/, "")).filter(e => e.toLowerCase() !== ALLOWED_RECIPIENT && !/genshieldservice\.com$/i.test(e));
        if (!body.includes(ALLOWED_RECIPIENT)) throw new GuardError('allowed recipient is not shown on screen');
        if (others.length) throw new GuardError(`other email address(es) on screen: ${others.slice(0, 3).join(', ')}`);
      }
    }
    if (kind === 'complete' && opts.noEmail && !page._sendsBlocked) {
      const body = await page.locator('body').innerText();
      if (!/No email on file/i.test(body)) throw new GuardError('complete with noEmail but neither blocked routes nor "No email on file"');
    }
    if (kind === 'charge' || kind === 'payment') {
      if (mode === 'prod-readonly') throw new GuardError('no charges in production');
      const sm = await stripeModeOf(page);
      entry.stripe = sm;
      if (sm !== 'test') throw new GuardError(`Stripe mode is ${sm}, not test`);
      if (/Stripe App/i.test(btnText) && !opts.stripeAppIntercepted) throw new GuardError('"Charge via Stripe App" without an interception');
    }
    entry.before = await snap(page, item, `${label}-before`);
    await locator.first().click();
    await page.waitForTimeout(opts.afterMs ?? 1200);
    entry.after = await snap(page, item, `${label}-after`);
    entry.result = 'tapped';
    logLine(entry);
    return entry;
  } catch (e) {
    entry.result = e instanceof GuardError ? 'REFUSED' : 'ERROR';
    entry.error = e.message.slice(0, 300);
    logLine(entry);
    throw e;
  }
}

// Convenience: assert a page is safe for read-only navigation as well (used by harness open()).
export function assertPreviewBase(base, opts) { return checkHost(base, opts); }
