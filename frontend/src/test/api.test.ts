import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/services/api";
import { ApiError } from "@/services/http";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("API client", () => {
  it("calls the backend under /api with the configured base URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ nodes: [], edges: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await api.getGraph();
    expect(fetchMock.mock.calls[0]![0]).toBe("http://localhost:8000/api/graph");
  });

  it("does NOT fall back to mock data when the backend is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const err = await api.getGraph().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.kind).toBe("network");
    expect(err.code).toBe("backend_unreachable");
  });

  it("maps structured backend errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: { code: "llm_failed", message: "LLM provider returned HTTP 401." } }, 502)));
    const err = await api.runInvestigation({ scenarioId: "field-rename", description: "x".repeat(20), logs: "log" }).catch((e) => e);
    expect(err.kind).toBe("http");
    expect(err.status).toBe(502);
    expect(err.code).toBe("llm_failed");
    expect(err.message).toContain("401");
  });

  it("POSTs investigation requests as JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ investigationId: "inv-00000000" }));
    vi.stubGlobal("fetch", fetchMock);
    await api.runInvestigation({ scenarioId: "field-rename", description: "d".repeat(12), logs: "l" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://localhost:8000/api/investigations/run");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toMatchObject({ scenarioId: "field-rename" });
  });
});
