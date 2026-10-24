// Page push / back motion, iPhone-style (Run 9, C2).
//
// Pushing a screen slides it in from the right over the old one (which eases
// 30 % to the left); going back slides the top screen out to the right. Done
// with the View Transitions API (Safari 18+): the browser animates SNAPSHOTS
// of the old and new screen, so the real page never carries a transform —
// scrolling, the first touch after a navigation and scroll restoration are
// untouched (Feel Phase 3 dropped a wrapper transform for exactly that).
// React Router starts the transition for navigations made with
// { viewTransition: true } (src/router.jsx adds it to screen pushes) and for
// the matching back navigation; this module only picks the direction.
// - iOS's own edge swipe already animated (popstate.hasUAVisualTransition):
//   the transition is skipped, never played twice.
// - Tab switches, sheets and same-screen URL changes don't slide.
// - Reduced motion, or no View Transitions support: no slide (the page just
//   appears, as before).
let pending = null; // { dir, at }
const TTL = 1000;

export function setNavDirection(dir) { pending = { dir, at: Date.now() }; }
function takeDirection() {
  const p = pending; pending = null;
  return p && Date.now() - p.at < TTL ? p.dir : "push";
}

export const pageMotionSupported = (doc = typeof document !== "undefined" ? document : null) =>
  !!doc && typeof doc.startViewTransition === "function";

let installed = false;
export function installPageMotion(win = typeof window !== "undefined" ? window : null) {
  if (installed || !win || !pageMotionSupported(win.document)) return false;
  installed = true;
  const doc = win.document;
  const root = doc.documentElement;
  root.setAttribute("data-vt", "");
  const reduce = win.matchMedia?.("(prefers-reduced-motion: reduce)");
  const start = doc.startViewTransition.bind(doc);
  doc.startViewTransition = (update) => {
    const dir = takeDirection();
    const t = start(update);
    if (dir === "none" || reduce?.matches) { try { t.skipTransition(); } catch { /* ignore */ } return t; }
    root.setAttribute("data-nav", dir);
    t.finished.finally(() => { if (root.getAttribute("data-nav") === dir) root.removeAttribute("data-nav"); }).catch(() => {});
    return t;
  };
  // Browser/OS back: the iOS edge swipe has already shown its own slide.
  win.addEventListener("popstate", (e) => {
    if (e.hasUAVisualTransition) setNavDirection("none");
    else if (!pending || Date.now() - pending.at >= TTL) setNavDirection("back");
  }, true);
  return true;
}

export const __resetPageMotion = () => { pending = null; installed = false; };
