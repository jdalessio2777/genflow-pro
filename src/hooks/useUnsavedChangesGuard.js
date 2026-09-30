import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { UNSAFE_NavigationContext } from "react-router-dom";

/**
 * Blocks in-app navigation while `when` is true and asks the user first.
 *
 * The app uses <BrowserRouter> (not a data router), so React Router's
 * useBlocker is unavailable. Instead, while `when` is true we wrap the
 * router's navigator (push / replace / go). Every in-app navigation — <Link>
 * (e.g. MobileNav), navigate(path), navigate(-1) from a header back button —
 * goes through it, so it is held as `pending` until the user picks
 * Stay (cancel) or Leave (proceed). The wrap is removed when `when` turns
 * false or the component unmounts.
 *
 * Also installs a best-effort beforeunload prompt for tab close / reload.
 * Not covered: the browser's own back/forward (popstate) — history pops
 * cannot be cancelled without a data router.
 */
export function useUnsavedChangesGuard(when) {
  const { navigator } = useContext(UNSAFE_NavigationContext);
  const [pending, setPending] = useState(null); // () => void | null
  const bypassRef = useRef(false);

  useEffect(() => {
    if (!when || !navigator) return undefined;
    const orig = { push: navigator.push, replace: navigator.replace, go: navigator.go };
    const wrap = (name) => (...args) => {
      if (bypassRef.current) return orig[name].apply(navigator, args);
      setPending(() => () => orig[name].apply(navigator, args));
    };
    navigator.push = wrap("push");
    navigator.replace = wrap("replace");
    navigator.go = wrap("go");
    return () => {
      navigator.push = orig.push;
      navigator.replace = orig.replace;
      navigator.go = orig.go;
    };
  }, [when, navigator]);

  useEffect(() => {
    if (!when) return undefined;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [when]);

  const stay = useCallback(() => setPending(null), []);
  const leave = useCallback(() => {
    const go = pending;
    setPending(null);
    if (!go) return;
    bypassRef.current = true;
    try { go(); } finally { bypassRef.current = false; }
  }, [pending]);

  // Guard a local (non-router) action, e.g. switching list modes that would
  // unmount the drafts: runs immediately when clean, else asks first.
  const confirmThen = useCallback((fn) => {
    if (!when) fn();
    else setPending(() => fn);
  }, [when]);

  return { blocked: pending !== null, stay, leave, confirmThen };
}
