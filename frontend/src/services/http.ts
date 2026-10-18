import { API_BASE_URL } from "./config";

export class ApiError extends Error {
  /** "network": the backend could not be reached. "http": it answered with an error status. */
  kind: "network" | "http";
  status: number | null;
  code: string;
  details: unknown;
  constructor(kind: "network" | "http", message: string, opts: { status?: number; code?: string; details?: unknown } = {}) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = opts.status ?? null;
    this.code = opts.code ?? (kind === "network" ? "backend_unreachable" : "http_error");
    this.details = opts.details;
  }
}

export async function request<T>(path: string, init: { method?: "GET" | "POST"; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 60_000);
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: init.method ?? "GET",
      headers: init.body !== undefined ? { "Content-Type": "application/json", Accept: "application/json" } : { Accept: "application/json" },
      body: init.body !== undefined ? JSON.stringify(init.body) : null,
      signal: controller.signal,
    });
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === "AbortError";
    throw new ApiError("network", aborted ? "The backend did not respond in time." : `Cannot reach the backend at ${API_BASE_URL}.`, {
      code: aborted ? "timeout" : "backend_unreachable",
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let code = "http_error";
    let message = `Request failed (${res.status})`;
    let details: unknown;
    try {
      const body = await res.json();
      if (body?.error) {
        code = body.error.code ?? code;
        message = body.error.message ?? message;
        details = body.error.details ?? body.error;
      } else if (typeof body?.detail === "string") {
        message = body.detail;
      }
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError("http", message, { status: res.status, code, details });
  }
  return (await res.json()) as T;
}
