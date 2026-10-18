import { queryOptions } from "@tanstack/react-query";
import type {
  Dataset,
  EvaluationCase,
  EvaluationRun,
  NewEvaluationConfig,
  RegressionResult,
  RegressionTest,
  TestCase,
  Trace,
} from "@/types";
import {
  APP_CONFIGS,
  DATASETS,
  REGRESSION_TESTS,
  RUNS,
  allTraces,
  buildRun,
  buildTrace,
  getCasesForRun,
  rng,
} from "@/mock-data";
import { apiRequest, isMock, mockDelay } from "./api-client";

/* In-memory demo store (lost on reload — never persisted). */
const store = {
  runs: [...RUNS],
  regressions: [...REGRESSION_TESTS],
  datasets: DATASETS.map((d) => ({ ...d, cases: [...d.cases] })),
};
let simCounter = 143;

function notFound(what: string): never {
  throw new Error(`${what} not found`);
}

export const evaluationService = {
  async list(): Promise<EvaluationRun[]> {
    if (!isMock()) return apiRequest("/evaluations");
    await mockDelay();
    return [...store.runs];
  },
  async get(id: string): Promise<EvaluationRun> {
    if (!isMock()) return apiRequest(`/evaluations/${id}`);
    await mockDelay(120);
    return store.runs.find((r) => r.id === id) ?? notFound(`Evaluation ${id}`);
  },
  async cases(id: string): Promise<EvaluationCase[]> {
    if (!isMock()) return apiRequest(`/evaluations/${id}/cases`);
    await mockDelay(160);
    const run = store.runs.find((r) => r.id === id) ?? notFound(`Evaluation ${id}`);
    return getCasesForRun(run);
  },
  /** SIMULATION: creates a run that completes after ~5 s in the browser. */
  async create(cfg: NewEvaluationConfig): Promise<EvaluationRun> {
    if (!isMock()) return apiRequest("/evaluations", { method: "POST", body: JSON.stringify(cfg) });
    await mockDelay(400);
    const id = `run_0${simCounter++}`;
    const ds = store.datasets.find((d) => d.id === cfg.datasetId)!;
    const total = ds.versions.find((v) => v.version === cfg.datasetVersion)!.caseIds.length;
    const failed = Math.max(0, Math.round(total * (0.03 + rng(id)() * 0.1)));
    const prev = store.runs.find((r) => r.datasetId === cfg.datasetId);
    const completed = buildRun([id, cfg.datasetId, cfg.datasetVersion, cfg.configId, failed, new Date().toISOString()], prev?.id);
    completed.evaluators = cfg.evaluators;
    completed.simulated = true;
    const running: EvaluationRun = { ...completed, status: "running", passed: 0, failed: 0, durationMs: 0, totalTokens: undefined, costUsd: undefined };
    store.runs.unshift(running);
    setTimeout(() => {
      const i = store.runs.findIndex((r) => r.id === id);
      if (i >= 0) store.runs[i] = completed;
    }, 5000);
    return running;
  },
};

export const traceService = {
  async list(): Promise<Trace[]> {
    if (!isMock()) return apiRequest("/traces");
    await mockDelay();
    return allTraces(store.runs);
  },
  async get(id: string): Promise<Trace> {
    if (!isMock()) return apiRequest(`/traces/${id}`);
    await mockDelay(140);
    const found = allTraces(store.runs).find((t) => t.id === id);
    if (found) return found;
    // Traces for cases of other runs are generated on demand.
    for (const run of store.runs) {
      const c = getCasesForRun(run).find((x) => x.traceId === id);
      if (c) return buildTrace(run, c);
    }
    return notFound(`Trace ${id}`);
  },
};

export const datasetService = {
  async list(): Promise<Dataset[]> {
    if (!isMock()) return apiRequest("/datasets");
    await mockDelay();
    return store.datasets.map((d) => ({ ...d }));
  },
  async get(id: string): Promise<Dataset> {
    if (!isMock()) return apiRequest(`/datasets/${id}`);
    await mockDelay(140);
    const d = store.datasets.find((x) => x.id === id) ?? notFound(`Dataset ${id}`);
    return { ...d, cases: [...d.cases] };
  },
  /** Demo only: updates the in-memory draft, nothing is persisted. */
  async upsertCase(datasetId: string, tc: TestCase): Promise<void> {
    if (!isMock()) return apiRequest(`/datasets/${datasetId}/cases`, { method: "PUT", body: JSON.stringify(tc) });
    await mockDelay(150);
    const d = store.datasets.find((x) => x.id === datasetId)!;
    const i = d.cases.findIndex((c) => c.id === tc.id);
    if (i >= 0) d.cases[i] = tc;
    else d.cases.push(tc);
  },
  async create(name: string, description: string): Promise<Dataset> {
    if (!isMock()) return apiRequest("/datasets", { method: "POST", body: JSON.stringify({ name, description }) });
    await mockDelay(200);
    const now = new Date().toISOString();
    const ds: Dataset = {
      id: `ds_${name.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}_${Date.now() % 10000}`,
      name, description, currentVersion: "v1", schemaStatus: "valid", schemaIssues: [], updatedAt: now,
      versions: [{ version: "v1", createdAt: now, note: "Created in this session.", caseIds: [] }],
      cases: [],
    };
    store.datasets.unshift(ds);
    return ds;
  },
  listAppConfigs: () => APP_CONFIGS,
};

export const regressionService = {
  async list(): Promise<RegressionTest[]> {
    if (!isMock()) return apiRequest("/regression-tests");
    await mockDelay();
    return [...store.regressions];
  },
  async create(t: Omit<RegressionTest, "id" | "lastResult" | "lastRun">): Promise<RegressionTest> {
    if (!isMock()) return apiRequest("/regression-tests", { method: "POST", body: JSON.stringify(t) });
    await mockDelay(250);
    const created: RegressionTest = { ...t, id: `rt_${String(store.regressions.length + 1).padStart(3, "0")}`, lastResult: "not_run" };
    store.regressions.unshift(created);
    return created;
  },
  /** SIMULATION: deterministic mock result; rt_001 still fails until fixed. */
  async run(ids: string[]): Promise<Record<string, RegressionResult>> {
    if (!isMock()) return apiRequest("/regression-tests/run", { method: "POST", body: JSON.stringify({ ids }) });
    await mockDelay(1200);
    const out: Record<string, RegressionResult> = {};
    const now = new Date().toISOString();
    for (const t of store.regressions.filter((x) => ids.includes(x.id))) {
      const res: RegressionResult = t.id === "rt_001" || t.severity === "critical" ? "fail" : "pass";
      t.lastResult = res;
      t.lastRun = now;
      out[t.id] = res;
    }
    return out;
  },
};

export const queries = {
  runs: () => queryOptions({ queryKey: ["runs"], queryFn: evaluationService.list }),
  run: (id: string) => queryOptions({ queryKey: ["runs", id], queryFn: () => evaluationService.get(id) }),
  runCases: (id: string) => queryOptions({ queryKey: ["runs", id, "cases"], queryFn: () => evaluationService.cases(id) }),
  traces: () => queryOptions({ queryKey: ["traces"], queryFn: traceService.list }),
  trace: (id: string) => queryOptions({ queryKey: ["traces", id], queryFn: () => traceService.get(id) }),
  datasets: () => queryOptions({ queryKey: ["datasets"], queryFn: datasetService.list }),
  dataset: (id: string) => queryOptions({ queryKey: ["datasets", id], queryFn: () => datasetService.get(id) }),
  regressions: () => queryOptions({ queryKey: ["regressions"], queryFn: regressionService.list }),
};
