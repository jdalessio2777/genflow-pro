export function formatTime(date, use24h = false) {
  if (!date) return "—";
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: !use24h,
  });
}

export function formatDateTime(date, use24h = false) {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: !use24h,
  });
}

// Converts an absolute instant (Date object or ISO string) into the
// "YYYY-MM-DDTHH:mm" string an <input type="datetime-local"> expects,
// using the browser's LOCAL wall-clock time — the inverse of how that
// input's own value should be read back via `new Date(value).toISOString()`.
// Never format one of these with getUTC*/.toISOString().slice(0,16) — that
// silently shifts the displayed time by the local UTC offset.
export function toDatetimeLocalValue(date) {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
