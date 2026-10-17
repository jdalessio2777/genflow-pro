import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

// Weak-signal safety for saves (H-2). Rules every save path follows:
// - success is shown only after the server confirmed the write;
// - a failed save shows a message that stays until dismissed, with Retry,
//   and the tech's input stays on screen;
// - a button can't fire the same save twice while it's in flight;
// - creates use a client-chosen id, so a retry after a lost response finds
//   the row instead of inserting a duplicate.

export function newRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  // RFC 4122 v4 fallback for very old WebKit
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
    (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16));
}

export function isConnectionError(error) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = String(error?.message || error || "");
  return error?.name === "TypeError" || /Failed to fetch|Load failed|NetworkError|network|timed out|aborted/i.test(msg);
}

export function saveErrorText(error) {
  if (isConnectionError(error)) return "No connection (or the signal dropped).";
  const msg = String(error?.message || "Unknown error").trim();
  return /[.!?]$/.test(msg) ? msg : `${msg}.`;
}

// Persistent error with Retry. `what` names what did NOT happen, e.g.
// "Job not completed". One toast per id, so a repeat replaces it.
export function showSaveError(what, error, retry, { id } = {}) {
  toast.error(what, {
    id: id || `save-error-${what}`,
    description: `${saveErrorText(error)} Nothing you entered was lost — tap Retry when you have signal.`,
    duration: Infinity,
    closeButton: true,
    ...(retry ? { action: { label: "Retry", onClick: () => { retry(); } } } : {}),
  });
}

export function dismissSaveError(what, { id } = {}) {
  toast.dismiss(id || `save-error-${what}`);
}

// Rejects after `ms` so a request stuck on a dead connection can't spin forever.
export function withTimeout(promise, ms = 20000, label = "Request") {
  let t;
  return Promise.race([
    promise.finally(() => clearTimeout(t)),
    new Promise((_, reject) => { t = setTimeout(() => reject(new Error(`${label} timed out`)), ms); }),
  ]);
}

// Insert with a fixed id. If an earlier attempt actually reached the server
// (its response was lost), the retry gets a duplicate-key error; read the
// existing row back instead of creating a second one.
export async function createOnce(entityApi, id, payload) {
  try {
    return await entityApi.create({ ...payload, id });
  } catch (error) {
    if (error?.code === "23505") {
      const rows = await entityApi.filter({ id });
      if (rows?.[0]) return rows[0];
    }
    throw error;
  }
}

// In-flight guard: run(fn) ignores calls while a previous run is pending
// (a ref, so two taps in the same JS task can't both start). `busy` drives
// the button's disabled/spinner state.
export function useSaveGuard() {
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn) => {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    setBusy(true);
    try {
      return await fn();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);
  return { run, busy };
}
