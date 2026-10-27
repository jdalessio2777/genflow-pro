import { useEffect } from "react";

// Swipe down to close a bottom sheet, like iPhone (Run 9, C2).
// The sheet follows the finger when the drag starts on the grabber, or
// anywhere once its scroller is at the top and the finger moves down.
// Let go past a quarter of its height (or flick) and it slides away from
// where it is; otherwise it springs back. Only the sheet moves (transform),
// never the page. Touch drags only; a mouse can drag the grabber.
// [data-no-sheet-drag] opts a region out (signature pads, horizontal strips).
// sheet: the sheet element itself (from a callback ref, so this runs once it
// is mounted); the others are refs.
// grabberOnly: only a drag that starts on the grabber/header moves the sheet
// (the full-screen editor, whose text scrolls on its own).
export function useSheetDrag({ sheet, scrollRef, grabberRef, overlayRef, onClose, enabled = true, grabberOnly = false }) {
  useEffect(() => {
    if (!enabled || !sheet) return undefined;
    let start = null; // { y, x, t, onGrabber }
    let dy = 0;
    let dragging = false;

    const setY = (y, animate) => {
      sheet.style.transition = animate ? "transform var(--dur-sheet-in) var(--ease-spring)" : "none";
      sheet.style.transform = y ? `translate3d(0, ${y}px, 0)` : "";
      const ov = overlayRef?.current;
      if (ov) {
        ov.style.transition = animate ? "opacity var(--dur-sheet-in) var(--ease-ios)" : "none";
        ov.style.opacity = y ? String(Math.max(0, 1 - y / Math.max(sheet.offsetHeight, 1))) : "";
      }
    };
    const begin = (x, y, target) => {
      if (target?.closest?.("[data-no-sheet-drag]")) { start = null; return; }
      // Anything between the finger and the sheet that is scrolled down (the
      // sheet body, or a list inside it) scrolls first; the sheet moves only
      // once everything under the finger is at its top.
      let scrolled = false;
      for (let el = target; el && el !== sheet; el = el.parentElement) {
        if (el.scrollTop > 0 && el.scrollHeight > el.clientHeight) { scrolled = true; break; }
      }
      start = { x, y, t: performance.now(), onGrabber: !!grabberRef?.current?.contains(target), scrolled };
      dy = 0; dragging = false;
    };
    const move = (x, y, e) => {
      if (!start) return;
      const d = y - start.y;
      if (!dragging) {
        const atTop = !start.scrolled && (scrollRef?.current?.scrollTop ?? 0) <= 0;
        if (d > 6 && Math.abs(x - start.x) < d && (start.onGrabber || (atTop && !grabberOnly))) {
          dragging = true;
          start.y = y; start.t = performance.now();
          document.activeElement?.blur?.(); // the keyboard goes down with the sheet
        } else if (Math.abs(d) > 6 || Math.abs(x - start.x) > 6) {
          if (!start.onGrabber) start = null; // a normal scroll: leave it alone
          return;
        } else return;
      }
      e?.cancelable && e.preventDefault();
      dy = Math.max(0, y - start.y);
      setY(dy, false);
    };
    const end = () => {
      if (!start) return;
      const wasDragging = dragging;
      const v = dy / Math.max(performance.now() - start.t, 1); // px/ms
      start = null; dragging = false;
      if (!wasDragging) return;
      if (dy > Math.min(140, sheet.offsetHeight * 0.25) || (v > 0.5 && dy > 20)) {
        // Slide away from here: the closing animation starts at --sheet-drag.
        sheet.style.setProperty("--sheet-drag", `${dy}px`);
        sheet.style.transition = "none";
        sheet.style.transform = "";
        const ov = overlayRef?.current;
        if (ov) { ov.style.transition = ""; ov.style.opacity = ""; }
        onClose?.();
        // A close the caller refused (e.g. saving): spring back.
        setTimeout(() => {
          if (sheet.isConnected && sheet.getAttribute("data-state") === "open") {
            sheet.style.removeProperty("--sheet-drag");
            sheet.style.transform = `translate3d(0, ${dy}px, 0)`;
            requestAnimationFrame(() => setY(0, true));
          }
        }, 60);
      } else {
        setY(0, true);
      }
    };

    const ts = (e) => { if (e.touches.length === 1) begin(e.touches[0].clientX, e.touches[0].clientY, e.target); else start = null; };
    const tm = (e) => { if (e.touches.length === 1) move(e.touches[0].clientX, e.touches[0].clientY, e); };
    const te = () => end();
    const pd = (e) => {
      if (e.pointerType !== "mouse" || !grabberRef?.current?.contains(e.target)) return;
      begin(e.clientX, e.clientY, e.target);
      const pm = (ev) => move(ev.clientX, ev.clientY, ev);
      const pu = () => { end(); window.removeEventListener("pointermove", pm); window.removeEventListener("pointerup", pu); };
      window.addEventListener("pointermove", pm);
      window.addEventListener("pointerup", pu);
    };
    sheet.addEventListener("touchstart", ts, { passive: true });
    sheet.addEventListener("touchmove", tm, { passive: false });
    sheet.addEventListener("touchend", te);
    sheet.addEventListener("touchcancel", te);
    sheet.addEventListener("pointerdown", pd);
    return () => {
      sheet.removeEventListener("touchstart", ts);
      sheet.removeEventListener("touchmove", tm);
      sheet.removeEventListener("touchend", te);
      sheet.removeEventListener("touchcancel", te);
      sheet.removeEventListener("pointerdown", pd);
    };
  }, [sheet, scrollRef, grabberRef, overlayRef, onClose, enabled, grabberOnly]);
}
