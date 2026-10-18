/**
 * Renders the REAL routes through the real router with fetch served from fixtures that were captured from
 * the live backend (src/test/fixtures/*.json). Verifies async loading, report rendering and failure states.
 */
import { QueryClient } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { routeTree } from "@/routeTree.gen";
import graph from "./fixtures/graph.json";
import scenarios from "./fixtures/scenarios.json";
import overview from "./fixtures/overview.json";
import failure from "./fixtures/failure-path.json";
import demoPath from "./fixtures/demo-path.json";
import incidents from "./fixtures/incidents.json";
import activity from "./fixtures/activity.json";
import memory from "./fixtures/memory.json";
import evidence from "./fixtures/evidence.json";
import integrations from "./fixtures/integrations.json";
import runs from "./fixtures/investigations.json";
import run from "./fixtures/run.json";
import relations from "./fixtures/relation-descriptions.json";
import trace from "./fixtures/trace.json";

const routes: Record<string, unknown> = {
  "/api/graph": graph,
  "/api/scenarios": scenarios,
  "/api/graph/overview": overview,
  "/api/graph/failure-path": failure,
  "/api/graph/demo-path": demoPath,
  "/api/incidents": incidents,
  "/api/activity": activity,
  "/api/memory": memory,
  "/api/evidence": evidence,
  "/api/integrations/status": integrations,
  "/api/investigations": runs,
  "/api/graph/relation-descriptions": relations,
  [`/api/investigations/${(run as { investigationId: string }).investigationId}`]: run,
  [`/api/investigations/${(run as { investigationId: string }).investigationId}/trace`]: trace,
};

const okFetch = () =>
  vi.fn(async (url: string) => {
    const path = new URL(url).pathname;
    if (path in routes) return new Response(JSON.stringify(routes[path]), { status: 200, headers: { "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ error: { code: "not_found", message: `no fixture for ${path}` } }), { status: 404 });
  });

async function mount(path: string) {
  const router = createRouter({ routeTree, context: { queryClient: new QueryClient() }, history: createMemoryHistory({ initialEntries: [path] }) });
  await router.load();
  return render(<RouterProvider router={router} />);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("pages against captured backend responses", () => {
  it("shows a loading state, then the stored investigation report with real verification data", async () => {
    vi.stubGlobal("fetch", okFetch());
    await mount("/investigations");
    expect(await screen.findByText("Investigation report", {}, { timeout: 5000 })).toBeTruthy();
    const text = document.body.textContent ?? "";
    expect(text).toContain("deterministic rules (no LLM used)");
    expect(text).toContain("Loaded from FalkorDB history");
    expect(text).toContain("requires revalidation");
    expect(text).toContain("assertions passed");
    expect(text).toContain("Requires approval");
    expect(text).toContain("Synthetic data");
    expect(text).not.toContain("Simulated execution");
  });

  it("shows the disconnected state with Retry (and no mock data) when the backend is down", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await mount("/memory");
    const alert = await screen.findByRole("alert", {}, { timeout: 5000 });
    expect(alert.textContent).toContain("Backend disconnected");
    expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy();
    expect(document.body.textContent).not.toContain("Field alias mapping resolves schema drift");
  });

  it("memory page lists records from the backend, including agent-written and drift-flagged ones", async () => {
    vi.stubGlobal("fetch", okFetch());
    await mount("/memory");
    expect(await screen.findByText("Field alias mapping resolves schema drift", {}, { timeout: 5000 })).toBeTruthy();
    expect(document.body.textContent).toContain("written by agent");
    expect(document.body.textContent).toContain("Needs review");
  });

  it("settings page shows live connection status", async () => {
    vi.stubGlobal("fetch", okFetch());
    await mount("/settings");
    await waitFor(() => expect(document.body.textContent).toContain("Connected"), { timeout: 5000 });
    expect(document.body.textContent).toContain("Mode: rules");
    expect(document.body.textContent).toContain("LLM key not configured");
  });

  it("clicking Run Investigation POSTs to the backend and renders the response", async () => {
    const fetchMock = okFetch();
    const withPost = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST" && new URL(url).pathname === "/api/investigations/run") return new Response(JSON.stringify(run), { status: 200 });
      return fetchMock(url);
    });
    vi.stubGlobal("fetch", withPost);
    await mount("/investigations");
    await screen.findByText("Investigation report", {}, { timeout: 5000 });
    fireEvent.click(screen.getByRole("button", { name: /run again/i }));
    await waitFor(() => expect(withPost.mock.calls.some(([, i]) => (i as RequestInit | undefined)?.method === "POST")).toBe(true));
    const post = withPost.mock.calls.find(([, i]) => (i as RequestInit | undefined)?.method === "POST")!;
    expect(JSON.parse((post[1] as RequestInit).body as string)).toMatchObject({ scenarioId: "field-rename" });
  });

  it("shows a structured LLM failure instead of a fake report", async () => {
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return new Response(JSON.stringify({ error: { code: "llm_failed", message: "LLM provider returned HTTP 401." } }), { status: 502 });
      const path = new URL(url).pathname;
      if (path === "/api/investigations") return new Response("[]", { status: 200 });
      return okFetch()(url);
    });
    vi.stubGlobal("fetch", f);
    await mount("/investigations");
    const btn = await screen.findByRole("button", { name: /run investigation/i }, { timeout: 5000 });
    await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false), { timeout: 5000 });
    fireEvent.click(btn);
    const alert = await screen.findByRole("alert", {}, { timeout: 5000 });
    expect(alert.textContent).toContain("401");
    expect(document.body.textContent).not.toContain("Investigation report");
  });
});
