/**
 * Data access layer. Every method is asynchronous and calls the FastAPI + FalkorDB backend.
 *
 * Bundled demo data (src/data/demoData.ts) is used ONLY when VITE_ENABLE_OFFLINE_FALLBACK=true is set
 * explicitly; it is never substituted silently when the backend is unreachable.
 */
import * as demo from "@/data/demoData";
import { OFFLINE_FALLBACK } from "./config";
import { ApiError, request } from "./http";
import type {
  ActivityItem,
  EvidenceRecord,
  GraphEdge,
  GraphNode,
  Incident,
  IntegrationStatus,
  InvestigationRun,
  InvestigationStep,
  InvestigationSummary,
  InvestigationTrace,
  MemoryRecord,
  OverviewGraph,
  PathResult,
  RunRequest,
  Scenario,
} from "@/types";

function offlineOr<T>(offline: () => T, live: () => Promise<T>): Promise<T> {
  return OFFLINE_FALLBACK ? Promise.resolve(offline()) : live();
}

const requiresBackend = (what: string) =>
  Promise.reject(new ApiError("http", `${what} requires the backend and is unavailable in offline demo mode.`, { code: "offline_mode" }));

export const api = {
  getGraph: () =>
    offlineOr<{ nodes: GraphNode[]; edges: GraphEdge[] }>(
      () => ({ nodes: demo.nodes, edges: demo.edges }),
      () => request("/api/graph"),
    ),
  getNode: (id: string) =>
    offlineOr<GraphNode>(
      () => demo.nodeById(id)!,
      () => request(`/api/graph/nodes/${encodeURIComponent(id)}`),
    ),
  getNeighbors: (id: string) =>
    offlineOr<{ edge: GraphEdge; node: GraphNode }[]>(
      () => demo.edges.filter((e) => e.source === id || e.target === id).map((e) => ({ edge: e, node: demo.nodeById(e.source === id ? e.target : e.source)! })),
      () => request(`/api/graph/nodes/${encodeURIComponent(id)}/neighbors`),
    ),
  getIncidents: () => offlineOr<Incident[]>(() => demo.incidents, () => request("/api/incidents")),
  getActivity: () => offlineOr<ActivityItem[]>(() => demo.activity, () => request("/api/activity")),
  getScenarios: () => offlineOr<Scenario[]>(() => demo.scenarios, () => request("/api/scenarios")),
  getInvestigationSteps: () => offlineOr<InvestigationStep[]>(() => [], () => request("/api/investigation/steps")),
  getMemory: () => offlineOr<MemoryRecord[]>(() => demo.memoryRecords, () => request("/api/memory")),
  getEvidence: () => offlineOr<EvidenceRecord[]>(() => demo.evidenceRecords, () => request("/api/evidence")),
  getFailurePath: () =>
    offlineOr<PathResult>(
      () => ({ nodeIds: demo.failurePathNodeIds, edgeIds: demo.failurePathEdgeIds }),
      () => request("/api/graph/failure-path"),
    ),
  getDemoPath: () =>
    offlineOr<PathResult>(
      () => ({ nodeIds: demo.demoPathNodeIds, edgeIds: demo.demoPathEdgeIds }),
      () => request("/api/graph/demo-path"),
    ),
  getOverviewGraph: () =>
    offlineOr<OverviewGraph>(
      () => ({
        layout: demo.overviewLayout,
        edges: demo.overviewEdges,
        nodes: Object.entries(demo.overviewLayout).map(([id, p]) => ({ ...demo.nodeById(id)!, ...p })),
        metrics: { activeIncidents: 3, connectedSystems: 18, verifiedResolutions: 12, knowledgeConflicts: 2 },
      }),
      () => request("/api/graph/overview"),
    ),
  getRelationDescriptions: () =>
    offlineOr<Record<string, string>>(() => demo.relationDescriptions, () => request("/api/graph/relation-descriptions")),
  getIntegrations: () =>
    OFFLINE_FALLBACK
      ? requiresBackend("Integration status")
      : request<IntegrationStatus>("/api/integrations/status", { timeoutMs: 8_000 }),

  // ---- investigations (backend only) -------------------------------------------------------
  runInvestigation: (body: RunRequest): Promise<InvestigationRun> =>
    OFFLINE_FALLBACK ? requiresBackend("Running an investigation") : request("/api/investigations/run", { method: "POST", body, timeoutMs: 120_000 }),
  listInvestigations: (): Promise<InvestigationSummary[]> => (OFFLINE_FALLBACK ? Promise.resolve([]) : request("/api/investigations")),
  getInvestigation: (id: string): Promise<InvestigationRun> =>
    OFFLINE_FALLBACK ? requiresBackend("Loading an investigation") : request(`/api/investigations/${encodeURIComponent(id)}`),
  getTrace: (id: string): Promise<InvestigationTrace> =>
    OFFLINE_FALLBACK ? requiresBackend("Loading a trace") : request(`/api/investigations/${encodeURIComponent(id)}/trace`),
  verifyInvestigation: (id: string): Promise<InvestigationRun> =>
    OFFLINE_FALLBACK ? requiresBackend("Verification") : request(`/api/investigations/${encodeURIComponent(id)}/verify`, { method: "POST" }),
  reviewMemory: (id: string, decision: "confirm_valid" | "needs_review" | "superseded", note = ""): Promise<MemoryRecord> =>
    OFFLINE_FALLBACK ? requiresBackend("Memory review") : request(`/api/memory/${encodeURIComponent(id)}/review`, { method: "POST", body: { decision, note } }),
};
