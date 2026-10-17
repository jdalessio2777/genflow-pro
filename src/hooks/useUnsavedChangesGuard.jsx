import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { useBlocker } from "react-router-dom";

/**
 * Asks before leaving a screen with unsaved edits (Stay / Leave).
 *
 * One data-router blocker for the whole app (a router consults only one
 * blocker), fed by every mounted guard. It covers EVERY way out: the back
 * arrow, the tab bar, links, and the browser / iOS back gesture (popstate) —
 * the router restores the entry and holds the navigation until the user
 * picks (H-12). Sheets opening/closing on the same screen (same URL) are
 * not blocked. Also installs a best-effort beforeunload prompt for reload.
 *
 * Note: the dialog that shows `blocked` must not create its own history
 * entry (pass history={false} to AlertDialog).
 */
const GuardContext = createContext(null);

export function UnsavedChangesProvider({ children }) {
  const dirty = useRef(new Map()); // guard id -> true (insertion order = newest last)
  const [version, setVersion] = useState(0);
  const blocker = useBlocker(useCallback(({ currentLocation, nextLocation }) =>
    dirty.current.size > 0 &&
    (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search),
  []));

  const setDirty = useCallback((id, isDirty) => {
    const had = dirty.current.has(id);
    if (isDirty && !had) dirty.current.set(id, true);
    else if (!isDirty && had) dirty.current.delete(id);
    else return;
    setVersion(v => v + 1);
  }, []);

  // Edits saved/discarded while a navigation is held: let it through.
  useEffect(() => {
    if (dirty.current.size === 0 && blocker.state === "blocked") blocker.proceed();
  }, [version, blocker]);

  const owner = [...dirty.current.keys()].pop() ?? null;
  const value = useMemo(() => ({ blocker, setDirty, owner }), [blocker, setDirty, owner]);
  return <GuardContext.Provider value={value}>{children}</GuardContext.Provider>;
}

export function useUnsavedChangesGuard(when) {
  const ctx = useContext(GuardContext);
  const id = useId();
  const [pendingLocal, setPendingLocal] = useState(null); // () => void | null
  const setDirty = ctx?.setDirty;
  const blocker = ctx?.blocker;
  const isOwner = ctx?.owner === id;

  useEffect(() => {
    if (!setDirty) return undefined;
    setDirty(id, !!when);
    return () => setDirty(id, false);
  }, [when, id, setDirty]);

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

  const routerBlocked = !!when && isOwner && blocker?.state === "blocked";

  // The prompt's own close (onOpenChange false) calls stay() right after a
  // Leave click; it must not cancel the navigation Leave just released.
  const leavingRef = useRef(false);
  const stay = useCallback(() => {
    if (leavingRef.current) return;
    setPendingLocal(null);
    if (blocker?.state === "blocked") blocker.reset();
  }, [blocker]);

  const leave = useCallback(() => {
    const fn = pendingLocal;
    setPendingLocal(null);
    leavingRef.current = true;
    setTimeout(() => { leavingRef.current = false; }, 0);
    if (blocker?.state === "blocked") blocker.proceed();
    else if (fn) fn();
  }, [blocker, pendingLocal]);

  // Guard a local (non-router) action, e.g. switching list modes that would
  // unmount the drafts: runs immediately when clean, else asks first.
  const confirmThen = useCallback((fn) => {
    if (!when) fn();
    else setPendingLocal(() => fn);
  }, [when]);

  return { blocked: routerBlocked || pendingLocal !== null, stay, leave, confirmThen };
}
