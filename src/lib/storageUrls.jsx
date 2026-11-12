// Run 13, Part E: the `uploads` bucket goes private. Rows keep the URL they were saved
// with (…/storage/v1/object/public/uploads/<path>); every screen that SHOWS a file turns
// that into a short-lived signed URL first. Signing needs a staff sign-in (the existing
// staff_select_uploads storage policy), so a link copied out of the app stops working
// within the hour. Works the same while the bucket is still public, so the app can ship
// before the switch.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export const UPLOADS_BUCKET = import.meta.env?.VITE_SUPABASE_STORAGE_BUCKET || "uploads";
export const SIGNED_URL_SECONDS = 60 * 60;
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

// The file's path inside our bucket, from a stored public URL or an old signed URL.
// Anything else (data:, blob:, another site) → null, and is shown as it is.
export function storagePathOf(url, bucket = UPLOADS_BUCKET) {
  const s = String(url || "");
  for (const kind of ["public", "sign", "authenticated"]) {
    const marker = `/storage/v1/object/${kind}/${bucket}/`;
    const i = s.indexOf(marker);
    if (i !== -1) {
      const path = s.slice(i + marker.length).split("?")[0];
      try { return decodeURIComponent(path) || null; } catch { return null; }
    }
  }
  return null;
}

const cache = new Map(); // path → { url, expiresAt } | { promise }

export function clearSignedUrlCache() { cache.clear(); }

// A usable URL for a stored file. Signed URLs are cached until 5 minutes before expiry.
export async function signedUrlFor(url, { client = supabase, now = () => Date.now() } = {}) {
  const path = storagePathOf(url);
  if (!path) return url || null;
  const hit = cache.get(path);
  if (hit?.url && hit.expiresAt - REFRESH_MARGIN_MS > now()) return hit.url;
  if (hit?.promise) return hit.promise;
  const promise = client.storage.from(UPLOADS_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS)
    .then(({ data, error }) => {
      if (error || !data?.signedUrl) { cache.delete(path); return null; }
      cache.set(path, { url: data.signedUrl, expiresAt: now() + SIGNED_URL_SECONDS * 1000 });
      return data.signedUrl;
    })
    .catch(() => { cache.delete(path); return null; });
  cache.set(path, { promise });
  return promise;
}

// React: the signed URL for a stored file (null while it loads or if it can't be signed).
export function useStoredFileUrl(url) {
  const direct = !storagePathOf(url);
  const [signed, setSigned] = useState(direct ? url || null : null);
  useEffect(() => {
    let live = true;
    if (!storagePathOf(url)) { setSigned(url || null); return undefined; }
    setSigned(null);
    signedUrlFor(url).then((u) => { if (live) setSigned(u); });
    return () => { live = false; };
  }, [url]);
  return signed;
}

// <img> for a stored file. Renders a plain grey box until the signed URL is ready.
export function StoredImage({ src, alt = "", className = "", ...rest }) {
  const url = useStoredFileUrl(src);
  if (!url) return <span role="img" aria-label={alt} className={`${className} block bg-muted`} {...rest} />;
  return <img src={url} alt={alt} className={className} {...rest} />;
}

// <a> that opens a stored file in a new tab with a fresh signed URL.
export function StoredFileLink({ href, children, className = "", ...rest }) {
  const url = useStoredFileUrl(href);
  return (
    <a href={url || undefined} target="_blank" rel="noopener noreferrer" className={className} aria-disabled={!url} {...rest}>
      {children}
    </a>
  );
}
