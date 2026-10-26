// Sheets and dialogs get a history entry while open (F-10): a back swipe or
// back press closes the sheet instead of leaving the screen.
//
// Opening pushes an entry with the SAME URL (state.__sheet = token);
// closing from the UI pops it; a POP that removes it closes the sheet. Every
// decision is made in one place (reconcile), after the current tick, so
// dialogs that close and open in the same render, or an action that closes a
// sheet and navigates away, never double-pop. A navigation started while a
// sheet's entry is current replaces that entry (src/router.jsx), so finished
// sheets never leave dead entries behind.
import { useEffect, useRef } from "react";
import { getAppRouter, isNavigating, onSettled } from "@/lib/navigation";

const open = new Map(); // token -> { close, pushed }
let seq = 0;
let scheduled = false;

const currentToken = (router) => router.state.location.state?.__sheet ?? null;

function schedule() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(reconcile, 0);
}

function reconcile() {
  scheduled = false;
  const router = getAppRouter();
  if (!router) return;
  // Re-run once the navigation lands (onSettled), or shortly if it never does.
  if (isNavigating()) { setTimeout(schedule, 250); return; }
  const loc = router.state.location;
  const cur = currentToken(router);
  const tokens = [...open.keys()];
  const top = tokens[tokens.length - 1] ?? null;
  const entry = top ? open.get(top) : null;
  const sheetState = (token) => ({ ...(loc.state || {}), __sheet: token });
  const to = { pathname: loc.pathname, search: loc.search, hash: loc.hash };

  if (cur && !open.has(cur)) {
    // The current entry belongs to a sheet that is closed now.
    if (entry && !entry.pushed) {
      entry.pushed = true;
      router.navigate(to, { replace: true, state: sheetState(top), preventScrollReset: true });
    } else {
      router.navigate(-1);
    }
    return;
  }
  if (entry && !entry.pushed && cur !== top) {
    entry.pushed = true;
    router.navigate(to, { state: sheetState(top), preventScrollReset: true });
  }
}

// After every landed navigation: a POP that took a sheet's entry away closes
// that sheet (and any opened after it).
function afterNavigation() {
  const router = getAppRouter();
  if (!router) return;
  const cur = currentToken(router);
  const tokens = [...open.keys()];
  const curIdx = cur ? tokens.indexOf(cur) : -1;
  tokens.forEach((t, i) => {
    const e = open.get(t);
    if (e?.pushed && i > curIdx) {
      e.pushed = false;
      e.closedByHistory = true;
      e.close();
    }
  });
  schedule();
}
let unsubscribe = null;
function ensureSubscribed() {
  if (!unsubscribe) unsubscribe = onSettled(afterNavigation);
}

/**
 * useSheetHistory(isOpen, close, enabled = true)
 * Gives an open sheet/dialog a history entry. `close` must close it.
 */
export function useSheetHistory(isOpen, close, enabled = true) {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!isOpen || !enabled || typeof window === "undefined") return undefined;
    ensureSubscribed();
    const token = `s${++seq}`;
    open.set(token, { close: () => closeRef.current?.(), pushed: false });
    schedule();
    return () => {
      open.delete(token);
      schedule();
    };
  }, [isOpen, enabled]);
}

/**
 * afterSheetsClose(fn): runs fn once every sheet is closed and its history
 * entry is gone. URL state changed before that (e.g. switching the job tab
 * from a dialog button) would be written onto the sheet's entry and then
 * popped away with it.
 */
export function afterSheetsClose(fn, timeoutMs = 1500) {
  const until = Date.now() + timeoutMs;
  const tick = () => {
    const router = getAppRouter();
    const busy = open.size > 0 || isNavigating() || (router && currentToken(router));
    if (busy && Date.now() < until) setTimeout(tick, 50);
    else fn();
  };
  setTimeout(tick, 0);
}

// For tests only.
export function __sheetDebug() {
  return { open: [...open.entries()].map(([t, e]) => ({ t, pushed: e.pushed })) };
}

/**
 * afterSheetPushed(fn): runs fn once every open sheet has its history entry
 * (the push has landed). Run 9: the full-screen editor locks the page only
 * then — React Router saves the screen's scroll position when the sheet entry
 * is pushed, and a page already locked (position: fixed, scrollY 0) was saved
 * as "top", so closing the editor jumped the page to the top. Returns a
 * cancel function. Without the app router (tests) fn runs at once.
 */
export function afterSheetPushed(fn, timeoutMs = 600) {
  if (!getAppRouter()) { fn(); return () => {}; }
  const until = Date.now() + timeoutMs;
  let t = null; let done = false;
  const tick = () => {
    const pending = [...open.values()].some(e => !e.pushed);
    if ((pending || isNavigating()) && Date.now() < until) { t = setTimeout(tick, 16); return; }
    done = true; fn();
  };
  t = setTimeout(tick, 0);
  return () => { if (!done) clearTimeout(t); };
}
