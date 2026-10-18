const dtf = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
const df = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export const fmtDateTime = (iso?: string) => (iso ? `${dtf.format(new Date(iso))} UTC` : "—");
export const fmtDate = (iso?: string) => (iso ? df.format(new Date(iso)) : "—");
export const fmtDuration = (ms?: number) => {
  if (ms === undefined) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)} s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
};
export const fmtPct = (n: number, total: number) => (total ? `${((n / total) * 100).toFixed(1)}%` : "—");
export const fmtTokens = (n?: number) => (n === undefined ? "—" : n >= 10000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString("en-US"));
export const fmtCost = (n?: number) => (n === undefined ? "—" : n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);
