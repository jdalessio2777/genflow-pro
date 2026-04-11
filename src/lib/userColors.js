// Name-based color assignment — consistent across all devices
const NAME_COLORS = {
  jeremy: { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200", dot: "bg-blue-500", hex: "#3b82f6" },
  alex:   { bg: "bg-green-100", text: "text-green-700", border: "border-green-200", dot: "bg-green-500", hex: "#22c55e" },
  derek:  { bg: "bg-red-100", text: "text-red-700", border: "border-red-200", dot: "bg-red-500", hex: "#ef4444" },
  sean:   { bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-200", dot: "bg-purple-500", hex: "#a855f7" },
};

const FALLBACK_PALETTE = [
  { bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-200", dot: "bg-purple-500", hex: "#a855f7" },
  { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-200", dot: "bg-orange-500", hex: "#f97316" },
];

export function getUserColor(emailOrName, displayName = "") {
  const sources = [
    (emailOrName || "").toLowerCase(),
    (displayName || "").toLowerCase(),
  ];

  for (const source of sources) {
    if (!source) continue;
    for (const [name, color] of Object.entries(NAME_COLORS)) {
      if (source.includes(name)) return color;
    }
  }

  // Fallback hash using email
  const str = (emailOrName || "").toLowerCase();
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return FALLBACK_PALETTE[Math.abs(hash) % FALLBACK_PALETTE.length];
}

export function getUserInitials(user) {
  if (!user) return "?";
  const name = user.full_name || user.name || user.email || "";
  const parts = name.split(/[\s@]/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function getUserDisplayName(user) {
  if (!user) return "Unknown";
  return user.full_name || user.name || user.email?.split("@")[0] || "Unknown";
}