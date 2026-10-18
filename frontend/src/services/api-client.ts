/**
 * Centralized API client. When VITE_API_BASE_URL is set, services call the
 * FastAPI backend; otherwise they fall back to in-browser demo data.
 * Never put provider API keys in VITE_* variables — they ship to the browser.
 */
const RAW_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;

export const apiConfig = {
  baseUrl: RAW_BASE ? RAW_BASE.replace(/\/$/, "") : null,
  get mode(): "remote" | "mock" {
    return this.baseUrl ? "remote" : "mock";
  },
};

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  if (!apiConfig.baseUrl) throw new ApiError("API base URL is not configured", 0);
  const res = await fetch(`${apiConfig.baseUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new ApiError(`${res.status} ${res.statusText}`, res.status);
  return (await res.json()) as T;
}

export const isMock = () => apiConfig.mode === "mock";
export const mockDelay = (ms = 220) => new Promise((r) => setTimeout(r, ms));

export async function checkHealth(): Promise<{ ok: boolean; message: string }> {
  if (!apiConfig.baseUrl) return { ok: false, message: "No API base URL configured." };
  try {
    await apiRequest("/health");
    return { ok: true, message: `Connected to ${apiConfig.baseUrl}` };
  } catch (e) {
    return { ok: false, message: `Could not reach ${apiConfig.baseUrl}/health: ${(e as Error).message}` };
  }
}
