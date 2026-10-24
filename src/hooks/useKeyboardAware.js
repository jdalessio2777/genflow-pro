import { useEffect } from "react";

const NON_TEXT = new Set(["checkbox", "radio", "button", "submit", "reset", "file", "range", "color", "image", "hidden"]);
export const isTextField = (el) => !!el && (
  el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable ||
  (el.tagName === "INPUT" && !NON_TEXT.has(el.type))
);

// Keeps the field being typed in visible above the on-screen keyboard.
// iOS shrinks only the VISUAL viewport when the keyboard opens, so fixed bars
// (tab bar, action bar) can sit on top of the field: while the keyboard is up
// they are hidden (html[data-kb-open]), and the focused field is scrolled into
// the visible band below the sticky header if it isn't already.
//
// Run 8 (A1): this runs ONCE per focus / keyboard opening, never in response
// to scrolling or typing. It used to re-run 60 ms after every visual-viewport
// scroll and pin a tall (auto-grown) text box's BOTTOM above the keyboard, so
// every finger scroll was undone and every keystroke in the middle of a long
// Scope of Work fought iOS's own caret scroll (±2,000 px per key). A field
// taller than the visible band is left alone: iOS keeps the caret in view.
export function keepFieldVisible(el, { vv = window.visualViewport, topReserve = 0 } = {}) {
  if (!isTextField(el) || el.closest?.("[data-no-kb-scroll]")) return 0;
  const r = el.getBoundingClientRect();
  const top = (vv ? vv.offsetTop : 0) + topReserve;
  const bottom = (vv ? vv.offsetTop + vv.height : window.innerHeight) - 12;
  if (r.height > bottom - top - 8) return 0;
  let dy = 0;
  if (r.bottom > bottom) dy = r.bottom - bottom;
  else if (r.top < top) dy = r.top - top - 8;
  // Run 9 (C2): one smooth move instead of a jump (instant under reduced motion).
  const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (dy) window.scrollBy({ top: dy, behavior: reduce ? "auto" : "smooth" });
  return dy;
}

export function useKeyboardAware() {
  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;
    const reserve = () => {
      // status bar + whatever sticky header is pinned at the top
      const sat = parseFloat(getComputedStyle(root).getPropertyValue("--sat")) || 0;
      const sticky = [...document.querySelectorAll('header.sticky, [data-sticky-header]')]
        .map(h => h.getBoundingClientRect()).filter(b => b.top <= sat + 1 && b.height < window.innerHeight / 2);
      return Math.max(sat, ...sticky.map(b => b.bottom));
    };
    // The field the keyboard was last revealed for: reveal again only when the
    // keyboard re-opens or focus moves to another field.
    let revealedFor = null;
    let wasOpen = false;
    const update = () => {
      const el = document.activeElement;
      const kb = !!vv && vv.height < window.innerHeight - 120 && isTextField(el);
      if (kb) root.setAttribute("data-kb-open", ""); else root.removeAttribute("data-kb-open");
      // Room to scroll a field near the end of a short page above the keyboard.
      root.style.setProperty("--kb-h", kb ? `${Math.round(window.innerHeight - vv.height)}px` : "0px");
      if (kb && (!wasOpen || revealedFor !== el)) {
        revealedFor = el;
        requestAnimationFrame(() => keepFieldVisible(el, { vv, topReserve: reserve() }));
      }
      if (!kb) revealedFor = null;
      wasOpen = kb;
    };
    let t = null;
    const later = () => { clearTimeout(t); t = setTimeout(update, 60); };
    // No visualViewport "scroll" listener: scrolling must never move the page.
    vv?.addEventListener("resize", later);
    document.addEventListener("focusin", later);
    document.addEventListener("focusout", later);
    return () => {
      clearTimeout(t);
      vv?.removeEventListener("resize", later);
      document.removeEventListener("focusin", later);
      document.removeEventListener("focusout", later);
      root.removeAttribute("data-kb-open");
      root.style.removeProperty("--kb-h");
    };
  }, []);
}
