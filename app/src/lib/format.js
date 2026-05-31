export const CURRENCY = "₱";

export const fmt = (n) =>
  CURRENCY +
  Number(n || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const ymKey = (d) =>
  d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const PALETTE = [
  "#0f766e", "#2563eb", "#d97706", "#dc2626", "#7c3aed",
  "#059669", "#0891b2", "#db2777", "#9333ea", "#65a30d",
];

// Translucent version of a hex color for soft icon backgrounds.
export function hexA(hex, a) {
  const h = (hex || "#999").replace("#", "");
  const full = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
