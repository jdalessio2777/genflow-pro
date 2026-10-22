// Local drafts of long text (Run 8, A4): every multi-line field keeps what was
// typed on THIS phone until it is saved, so a reload, crash or app kill never
// loses it. One key per record and field ("job:<id>:invoice_notes",
// "quote:new:scope_notes"), so drafts never mix records.
// Sign out clears them with every other app key (signOutDevice.js).
const PREFIX = "genflow_draft:";
const EVENT = "genflow-drafts-saved";

const storage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export function draftStorageKey(key) { return PREFIX + key; }

// { text, base, at } | null. `base` = the saved text the draft started from.
export function readDraft(key) {
  if (!key) return null;
  try {
    const raw = storage()?.getItem(PREFIX + key);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d && typeof d.text === "string" ? d : null;
  } catch { return null; }
}

export function writeDraft(key, text, base) {
  if (!key) return;
  try { storage()?.setItem(PREFIX + key, JSON.stringify({ text, base: base ?? "", at: Date.now() })); } catch { /* full / private mode */ }
}

export function clearDraft(key) {
  if (!key) return;
  try { storage()?.removeItem(PREFIX + key); } catch { /* ignore */ }
}

// After a successful save: removes every draft under `keyPrefix` (e.g.
// "job:new:" or `customer:${id}:`) and tells the mounted fields their text is
// now saved (so leaving no longer asks).
export function markDraftsSaved(keyPrefix) {
  const s = storage();
  if (s && keyPrefix) {
    for (let i = s.length - 1; i >= 0; i--) {
      const k = s.key(i);
      if (k && k.startsWith(PREFIX + keyPrefix)) s.removeItem(k);
    }
  }
  try { window.dispatchEvent(new CustomEvent(EVENT, { detail: { keyPrefix } })); } catch { /* ignore */ }
}

export function onDraftsSaved(fn) {
  const h = (e) => fn(e.detail?.keyPrefix || "");
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

// What to do with a stored draft when a field opens with `current` text:
// restore it only when it differs from what is on screen.
export function draftToRestore(draft, current) {
  if (!draft) return null;
  const cur = current ?? "";
  if (draft.text === cur) return null;
  if (!draft.text.trim() && !cur.trim()) return null;
  return draft.text;
}
