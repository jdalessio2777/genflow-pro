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
export function keepFieldVisible(el, { vv = window.visualViewport, topReserve = 0 } = {}) {
  if (!isTextField(el)) return 0;
  const r = el.getBoundingClientRect();
  const top = (vv ? vv.offsetTop : 0) + topReserve;
  const bottom = (vv ? vv.offsetTop + vv.height : window.innerHeight) - 12;
  // Keep the typing point visible: a field that fits shows whole; a taller
  // (grown) text box keeps its bottom — where the caret usually is — in view.
  let dy = 0;
  const fits = r.height <= bottom - top - 8;
  if (r.bottom > bottom) dy = fits ? r.bottom - bottom : r.bottom - bottom;
  else if (r.top < top) dy = fits ? r.top - top - 8 : Math.max(r.bottom - bottom, r.top - top - 8);
  if (dy) window.scrollBy(0, dy);
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
    const update = () => {
      const kb = !!vv && vv.height < window.innerHeight - 120 && isTextField(document.activeElement);
      if (kb) root.setAttribute("data-kb-open", ""); else root.removeAttribute("data-kb-open");
      // Room to scroll a field near the end of a short page above the keyboard.
      root.style.setProperty("--kb-h", kb ? `${Math.round(window.innerHeight - vv.height)}px` : "0px");
      if (kb) requestAnimationFrame(() => keepFieldVisible(document.activeElement, { vv, topReserve: reserve() }));
    };
    let t = null;
    const later = () => { clearTimeout(t); t = setTimeout(update, 60); };
    vv?.addEventListener("resize", later);
    vv?.addEventListener("scroll", later);
    document.addEventListener("focusin", later);
    document.addEventListener("focusout", later);
    return () => {
      clearTimeout(t);
      vv?.removeEventListener("resize", later);
      vv?.removeEventListener("scroll", later);
      document.removeEventListener("focusin", later);
      document.removeEventListener("focusout", later);
      root.removeAttribute("data-kb-open");
      root.style.removeProperty("--kb-h");
    };
  }, []);
}
