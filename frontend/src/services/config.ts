/** Public runtime configuration. VITE_* values are embedded in the browser bundle: never put secrets here. */
export const API_BASE_URL: string = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(/\/+$/, "");
/** Explicit opt-in only. When false (default) a missing backend produces an error state, never mock data. */
export const OFFLINE_FALLBACK: boolean = import.meta.env.VITE_ENABLE_OFFLINE_FALLBACK === "true";
