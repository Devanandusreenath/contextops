/**
 * DEMO DATA — every value in this module is synthetic and generated
 * deterministically for the TraceGuard AI demo scenario. Nothing here is a real
 * production measurement.
 */
import type {
  AppConfig,
  Dataset,
  EvaluationCase,
  EvaluationRun,
  EvaluatorDef,
  FailureKind,
  RegressionTest,
  TestCase,
  Trace,
  TraceStep,
} from "@/types";

export function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- Evaluators & app configs ---------------- */

export const EVALUATORS: EvaluatorDef[] = [
  { id: "schema_validation", label: "Schema validation", description: "Output must match the response JSON schema, including all required fields." },
  { id: "category_accuracy", label: "Category accuracy", description: "Predicted ticket category must equal the expected category." },
  { id: "faithfulness", label: "Faithfulness", description: "Reply must only state facts present in retrieved knowledge-base documents." },
  { id: "tool_success", label: "Tool success", description: "All tool calls must complete without errors or timeouts." },
];

export const APP_CONFIGS: AppConfig[] = [
  { id: "cfg_gpt41mini", label: "Support agent · gpt-4.1-mini", model: "gpt-4.1-mini", provider: "OpenAI", appVersion: "support-agent@2.4.0" },
  { id: "cfg_sonnet", label: "Support agent · claude-3.5-sonnet", model: "claude-3.5-sonnet", provider: "Anthropic", appVersion: "support-agent@2.4.0" },
  { id: "cfg_llama", label: "Support agent · llama-3.1-70b (self-hosted)", model: "llama-3.1-70b", provider: "Self-hosted", appVersion: "support-agent@2.3.1" },
];

/** USD per 1K tokens (prompt, completion). Self-hosted has no known price. */
const PRICING: Record<string, [number, number] | undefined> = {
  "gpt-4.1-mini": [0.0004, 0.0016],
  "claude-3.5-sonnet": [0.003, 0.015],
  "llama-3.1-70b": undefined,
};

export function priceFor(model: string, prompt: number, completion: number) {
  const p = PRICING[model];
  if (!p) return undefined;
  return (prompt / 1000) * p[0] + (completion / 1000) * p[1];
}

/* ---------------- Datasets ---------------- */

const TICKETS: [string, string, "low" | "medium" | "high"][] = [
  ["My order #48213 arrived with a cracked screen. I need a replacement.", "shipping_damage", "high"],
  ["How do I change the email address on my account?", "account", "low"],
  ["I was charged twice for my subscription this month.", "billing", "high"],
  ["Can I return shoes I bought 20 days ago?", "returns", "medium"],
  ["The app crashes every time I open the settings page.", "technical", "medium"],
  ["Where is my package? Tracking hasn't updated in 6 days.", "shipping_delay", "medium"],
  ["Please cancel my plan before the next renewal.", "billing", "medium"],
  ["I can't log in even after resetting my password.", "account", "high"],
  ["What's your refund policy for digital gift cards?", "returns", "low"],
  ["Your courier left my parcel in the rain and it's soaked.", "shipping_damage", "medium"],
  ["Do you ship to Iceland?", "shipping_delay", "low"],
  ["Someone placed orders on my account that I didn't make.", "account", "high"],
];

function supportCases(): TestCase[] {
  return Array.from({ length: 24 }, (_, i) => {
    const [msg, category, priority] = TICKETS[i % TICKETS.length];
    const id = `case_${String(i + 1).padStart(3, "0")}`;
    const variant = i >= TICKETS.length ? " (follow-up, customer is upset)" : "";
    return {
      id,
      input: { ticket_id: `TCK-${7100 + i}`, channel: i % 3 === 0 ? "email" : "chat", customer_email: `customer${i + 1}@example.com`, message: msg + variant },
      expected: {
        category,
        priority: variant && priority !== "high" ? "high" : priority,
        escalation_level: priority === "high" || variant ? 2 : priority === "medium" ? 1 : 0,
        reply_must_mention: category === "billing" ? ["refund", "billing team"] : category === "returns" ? ["return window"] : ["next steps"],
      },
      tags: [category, priority, ...(variant ? ["follow-up"] : [])],
    };
  });
}

function simpleCases(prefix: string, n: number, make: (i: number) => Omit<TestCase, "id">): TestCase[] {
  return Array.from({ length: n }, (_, i) => ({ id: `${prefix}_${String(i + 1).padStart(3, "0")}`, ...make(i) }));
}

const support = supportCases();
const ids = (cs: TestCase[], n?: number) => cs.slice(0, n ?? cs.length).map((c) => c.id);

export const DATASETS: Dataset[] = [
  {
    id: "ds_support_tickets",
    name: "support-tickets",
    description: "Customer-support tickets with expected triage category, priority and escalation level.",
    currentVersion: "v3",
    schemaStatus: "valid",
    schemaIssues: [],
    updatedAt: "2026-10-12T09:14:00Z",
    versions: [
      { version: "v1", createdAt: "2026-08-21T10:00:00Z", note: "Initial 12 hand-labelled tickets.", caseIds: ids(support, 12) },
      { version: "v2", createdAt: "2026-09-18T15:30:00Z", note: "Added follow-up tickets and escalation_level field.", caseIds: ids(support, 20) },
      { version: "v3", createdAt: "2026-10-12T09:14:00Z", note: "Added 4 high-priority follow-ups; escalation_level now required.", caseIds: ids(support) },
    ],
    cases: support,
  },
  {
    id: "ds_refund_qa",
    name: "refund-policy-qa",
    description: "Questions about the refund policy with grounded reference answers.",
    currentVersion: "v2",
    schemaStatus: "warnings",
    schemaIssues: ["2 cases have an empty `reference_doc` field (optional, but recommended)."],
    updatedAt: "2026-10-03T13:40:00Z",
    versions: [
      { version: "v1", createdAt: "2026-09-02T08:00:00Z", note: "Initial set.", caseIds: Array.from({ length: 10 }, (_, i) => `rq_${String(i + 1).padStart(3, "0")}`) },
      { version: "v2", createdAt: "2026-10-03T13:40:00Z", note: "Added gift card and partial refund questions.", caseIds: Array.from({ length: 14 }, (_, i) => `rq_${String(i + 1).padStart(3, "0")}`) },
    ],
    cases: simpleCases("rq", 14, (i) => ({
      input: { question: ["Can I get a refund after 30 days?", "Are gift cards refundable?", "How long do refunds take?", "Can I get a partial refund?"][i % 4] },
      expected: { answer_contains: [["30 days", "store credit"], ["non-refundable"], ["5-10 business days"], ["partial"]][i % 4], reference_doc: i % 7 === 3 ? "" : `policy/refunds#s${(i % 4) + 1}` },
      tags: ["refunds"],
    })),
  },
  {
    id: "ds_sql_gen",
    name: "sql-generation",
    description: "Natural-language analytics questions mapped to expected SQL result shapes.",
    currentVersion: "v1",
    schemaStatus: "invalid",
    schemaIssues: ["Case sql_007: `expected.columns` must be an array, got string.", "Case sql_011: missing required field `expected`."],
    updatedAt: "2026-09-27T11:05:00Z",
    versions: [{ version: "v1", createdAt: "2026-09-27T11:05:00Z", note: "Imported from analytics team.", caseIds: Array.from({ length: 12 }, (_, i) => `sql_${String(i + 1).padStart(3, "0")}`) }],
    cases: simpleCases("sql", 12, (i) => ({
      input: { question: ["Top 5 products by revenue last month", "Weekly active users in Q3", "Average order value by country"][i % 3] },
      expected: { columns: [["product", "revenue"], ["week", "wau"], ["country", "aov"]][i % 3], max_rows: [5, 13, 50][i % 3] },
      tags: ["analytics"],
    })),
  },
  {
    id: "ds_summaries",
    name: "ticket-summaries",
    description: "Long ticket threads with expected summary properties for agent handoff.",
    currentVersion: "v1",
    schemaStatus: "valid",
    schemaIssues: [],
    updatedAt: "2026-09-10T16:22:00Z",
    versions: [{ version: "v1", createdAt: "2026-09-10T16:22:00Z", note: "Initial set.", caseIds: Array.from({ length: 8 }, (_, i) => `sum_${String(i + 1).padStart(3, "0")}`) }],
    cases: simpleCases("sum", 8, (i) => ({
      input: { thread_length: 6 + i, thread_id: `THR-${3300 + i}` },
      expected: { max_words: 80, must_include: ["customer goal", "actions taken"] },
      tags: ["summarization"],
    })),
  },
];

/* ---------------- Evaluation runs ---------------- */

type RunSeed = [string, string, string, string, number, string, string?];
// id, datasetId, version, configId, failed, createdAt, status
const RUN_SEEDS: RunSeed[] = [
  ["run_0131", "ds_support_tickets", "v1", "cfg_llama", 4, "2026-10-01T09:12:00Z"],
  ["run_0132", "ds_support_tickets", "v2", "cfg_gpt41mini", 5, "2026-10-02T14:40:00Z"],
  ["run_0133", "ds_refund_qa", "v1", "cfg_gpt41mini", 2, "2026-10-03T10:05:00Z"],
  ["run_0134", "ds_support_tickets", "v2", "cfg_sonnet", 3, "2026-10-05T16:20:00Z"],
  ["run_0135", "ds_sql_gen", "v1", "cfg_sonnet", 12, "2026-10-06T08:55:00Z", "failed"],
  ["run_0136", "ds_support_tickets", "v2", "cfg_gpt41mini", 3, "2026-10-07T11:30:00Z"],
  ["run_0137", "ds_refund_qa", "v2", "cfg_sonnet", 1, "2026-10-08T13:10:00Z"],
  ["run_0138", "ds_summaries", "v1", "cfg_llama", 1, "2026-10-09T09:45:00Z"],
  ["run_0139", "ds_support_tickets", "v2", "cfg_gpt41mini", 2, "2026-10-10T15:00:00Z"],
  ["run_0140", "ds_support_tickets", "v3", "cfg_llama", 4, "2026-10-12T10:20:00Z"],
  ["run_0141", "ds_support_tickets", "v3", "cfg_gpt41mini", 3, "2026-10-13T17:05:00Z"],
  ["run_0142", "ds_support_tickets", "v3", "cfg_gpt41mini", 2, "2026-10-15T14:32:00Z"],
];

export const DEFAULT_EVALUATORS = EVALUATORS.map((e) => e.id);

export function buildRun(seed: RunSeed, previousRunId?: string): EvaluationRun {
  const [id, datasetId, version, configId, failedSeed, createdAt, status] = seed;
  const ds = DATASETS.find((d) => d.id === datasetId)!;
  const cfg = APP_CONFIGS.find((c) => c.id === configId)!;
  const total = ds.versions.find((v) => v.version === version)!.caseIds.length;
  const r = rng(id);
  const failed = status === "failed" ? 0 : failedSeed;
  const avgLatencyMs = Math.round((cfg.model === "llama-3.1-70b" ? 2600 : cfg.model === "claude-3.5-sonnet" ? 2100 : 1500) + r() * 400);
  const tokensPerCase = Math.round(1500 + r() * 300);
  const totalTokens = status === "failed" ? undefined : total * tokensPerCase;
  return {
    id,
    datasetId,
    datasetName: ds.name,
    datasetVersion: version,
    model: cfg.model,
    provider: cfg.provider,
    appVersion: cfg.appVersion,
    status: (status as EvaluationRun["status"]) ?? "completed",
    total,
    passed: status === "failed" ? 0 : total - failed,
    failed,
    durationMs: status === "failed" ? 41000 : Math.round(total * avgLatencyMs * 0.42),
    createdAt,
    avgLatencyMs,
    totalTokens,
    costUsd: totalTokens ? priceFor(cfg.model, totalTokens * 0.82, totalTokens * 0.18) : undefined,
    evaluators: DEFAULT_EVALUATORS,
    previousRunId,
  };
}

export const RUNS: EvaluationRun[] = RUN_SEEDS.map((s, i) => {
  const prev = RUN_SEEDS.slice(0, i).reverse().find((p) => p[1] === s[1]);
  return buildRun(s, prev?.[0]);
}).reverse();

/* ---------------- Cases & traces ---------------- */

const KIND_EVALUATOR: Record<FailureKind, string> = {
  schema_missing_field: "schema_validation",
  wrong_category: "category_accuracy",
  hallucination: "faithfulness",
  tool_timeout: "tool_success",
};

const FORCED: Record<string, Record<string, FailureKind>> = {
  run_0142: { case_017: "schema_missing_field", case_009: "hallucination" },
  run_0141: { case_017: "schema_missing_field", case_006: "tool_timeout", case_021: "wrong_category" },
};

function failurePlan(run: EvaluationRun, caseIds: string[]): Record<string, FailureKind> {
  if (FORCED[run.id]) return FORCED[run.id];
  const r = rng(run.id + "plan");
  const kinds: FailureKind[] = ["schema_missing_field", "wrong_category", "hallucination", "tool_timeout"];
  const plan: Record<string, FailureKind> = {};
  const pool = [...caseIds];
  for (let i = 0; i < run.failed && pool.length; i++) {
    const idx = Math.floor(r() * pool.length);
    plan[pool.splice(idx, 1)[0]] = kinds[Math.floor(r() * kinds.length)];
  }
  return plan;
}

function actualFor(tc: TestCase, kind?: FailureKind): unknown {
  const exp = tc.expected as Record<string, unknown>;
  if (!("category" in exp)) {
    return kind ? { ...exp, note: "Output did not satisfy expectations" } : exp;
  }
  const reply = `Thanks for reaching out. I've logged your request and our team will follow up with next steps${exp.category === "billing" ? " — the billing team will process any refund" : ""}.`;
  const base = { category: exp.category, priority: exp.priority, escalation_level: exp.escalation_level, reply };
  switch (kind) {
    case "schema_missing_field": {
      const { escalation_level: _omit, ...rest } = base;
      return rest;
    }
    case "wrong_category":
      return { ...base, category: "technical" };
    case "hallucination":
      return { ...base, reply: "Good news — we've issued a full refund of $249.00 to your card, it will arrive within 24 hours." };
    case "tool_timeout":
      return null;
    default:
      return base;
  }
}

const REASONS: Record<FailureKind, string> = {
  schema_missing_field: "SchemaValidationError: 'escalation_level' is a required property",
  wrong_category: "Predicted category 'technical' does not match expected category",
  hallucination: "Reply states a refund amount ($249.00) and timeline not found in any retrieved document",
  tool_timeout: "Tool 'search_knowledge_base' timed out after 5000 ms",
};

const caseCache = new Map<string, EvaluationCase[]>();
const traceCache = new Map<string, Trace>();

export function traceIdFor(runId: string, caseId: string) {
  return `trc_${runId.replace("run_", "")}_${caseId.split("_").pop()}`;
}

export function getCasesForRun(run: EvaluationRun): EvaluationCase[] {
  if (run.status !== "completed") return [];
  const cached = caseCache.get(run.id);
  if (cached) return cached;
  const ds = DATASETS.find((d) => d.id === run.datasetId)!;
  const version = ds.versions.find((v) => v.version === run.datasetVersion)!;
  const plan = failurePlan(run, version.caseIds);
  const r = rng(run.id + "lat");
  const cases = version.caseIds.map((cid) => {
    const tc = ds.cases.find((c) => c.id === cid)!;
    const kind = plan[cid];
    const isSupport = run.datasetId === "ds_support_tickets";
    return {
      id: `${run.id}:${cid}`,
      runId: run.id,
      caseId: cid,
      input: tc.input,
      expected: tc.expected,
      actual: actualFor(tc, kind),
      passed: !kind,
      failureKind: kind,
      failureReason: kind ? REASONS[kind] : undefined,
      failedEvaluator: kind ? KIND_EVALUATOR[kind] : undefined,
      failedStepId: kind ? (kind === "tool_timeout" ? "s3" : kind === "schema_missing_field" ? "s5" : "s4") : undefined,
      traceId: isSupport ? traceIdFor(run.id, cid) : undefined,
      latencyMs: kind === "tool_timeout" ? 5420 : Math.round(run.avgLatencyMs * (0.7 + r() * 0.6)),
    } satisfies EvaluationCase;
  });
  caseCache.set(run.id, cases);
  return cases;
}

export function evaluatorSummary(run: EvaluationRun, cases: EvaluationCase[]) {
  return EVALUATORS.filter((e) => run.evaluators.includes(e.id)).map((e) => {
    const failed = cases.filter((c) => c.failedEvaluator === e.id).length;
    return { name: e.label, description: e.description, failed, passed: cases.length - failed };
  });
}

const STACK = `Traceback (most recent call last):
  File "support_agent/pipeline.py", line 118, in run
    validated = ResponseSchema.model_validate(raw_output)
  File "pydantic/main.py", line 596, in model_validate
    return cls.__pydantic_validator__.validate_python(obj)
pydantic_core._pydantic_core.ValidationError: 1 validation error for ResponseSchema
escalation_level
  Field required [type=missing, input_value={'category': 'account', 'priority': 'high', ...}, input_type=dict]`;

const TIMEOUT_STACK = `Traceback (most recent call last):
  File "support_agent/tools/kb.py", line 42, in search_knowledge_base
    resp = await client.post("/search", json=payload, timeout=5.0)
  File "httpx/_client.py", line 1574, in post
    raise ReadTimeout("timed out")
httpx.ReadTimeout: timed out after 5000 ms`;

export function buildTrace(run: EvaluationRun, c: EvaluationCase): Trace {
  const cached = traceCache.get(c.traceId!);
  if (cached) return cached;
  const r = rng(c.traceId!);
  const input = c.input as Record<string, unknown>;
  const actual = c.actual as Record<string, unknown> | null;
  const planMs = Math.round(320 + r() * 180);
  const toolMs = c.failureKind === "tool_timeout" ? 5000 : Math.round(180 + r() * 220);
  const genMs = c.failureKind === "tool_timeout" ? 0 : Math.round(c.latencyMs - planMs - toolMs - 40);
  const p1 = Math.round(420 + r() * 80), c1 = Math.round(30 + r() * 20);
  const p2 = Math.round(1100 + r() * 200), c2 = Math.round(120 + r() * 60);
  const steps: TraceStep[] = [
    {
      id: "s1", parentId: null, name: "support_agent.run", type: "agent", startOffsetMs: 0, durationMs: c.latencyMs,
      status: c.failureKind === "schema_missing_field" || c.failureKind === "tool_timeout" ? "error" : "success",
      input, output: actual,
    },
    {
      id: "s2", parentId: "s1", name: "llm.plan_tool_call", type: "llm", startOffsetMs: 12, durationMs: planMs, status: "success", model: run.model,
      input: { messages: [{ role: "system", content: "You are a support triage agent. Use tools when needed." }, { role: "user", content: input.message }] },
      output: { tool_call: { name: "search_knowledge_base", arguments: { query: String(input.message).slice(0, 48), top_k: 3 } } },
      tokens: { prompt: p1, completion: c1 }, costUsd: priceFor(run.model, p1, c1),
    },
    {
      id: "s3", parentId: "s1", name: "tool.search_knowledge_base", type: "tool", startOffsetMs: planMs + 20, durationMs: toolMs,
      status: c.failureKind === "tool_timeout" ? "error" : "success",
      input: { query: String(input.message).slice(0, 48), top_k: 3, authorization: "Bearer kb_live_9f2c81aa7d", },
      output: c.failureKind === "tool_timeout" ? null : { documents: [{ id: "kb-policy-112", title: "Escalation matrix", score: 0.89 }, { id: "kb-faq-031", title: "Order issues FAQ", score: 0.81 }] },
      error: c.failureKind === "tool_timeout" ? { type: "TimeoutError", message: REASONS.tool_timeout, stack: TIMEOUT_STACK } : undefined,
    },
  ];
  if (c.failureKind !== "tool_timeout") {
    steps.push(
      {
        id: "s4", parentId: "s1", name: "llm.generate_response", type: "llm", startOffsetMs: planMs + toolMs + 26, durationMs: genMs, status: "success", model: run.model,
        input: { messages: "[system, user, tool_result ×2]", response_format: "json_object", temperature: 0.2 },
        output: actual, tokens: { prompt: p2, completion: c2 }, costUsd: priceFor(run.model, p2, c2),
      },
      {
        id: "s5", parentId: "s1", name: "output.schema_validate", type: "validation", startOffsetMs: c.latencyMs - 12, durationMs: 9,
        status: c.failureKind === "schema_missing_field" ? "error" : "success",
        input: { schema: "ResponseSchema@3", required: ["category", "priority", "escalation_level", "reply"] },
        output: c.failureKind === "schema_missing_field" ? { valid: false, missing: ["escalation_level"] } : { valid: true },
        error: c.failureKind === "schema_missing_field" ? { type: "SchemaValidationError", message: REASONS.schema_missing_field, stack: STACK } : undefined,
      },
    );
  }
  const tokenSteps = steps.filter((s) => s.tokens);
  const totalTokens = run.model === "llama-3.1-70b" && r() > 0.5 ? undefined : tokenSteps.reduce((a, s) => a + s.tokens!.prompt + s.tokens!.completion, 0);
  const cost = tokenSteps.reduce<number | undefined>((a, s) => (s.costUsd === undefined ? undefined : (a ?? 0) + s.costUsd), 0);
  const ts = new Date(new Date(run.createdAt).getTime() + Number(c.caseId.split("_").pop()) * 4200).toISOString();
  const errStep = steps.find((s) => s.error);
  const trace: Trace = {
    id: c.traceId!,
    operation: "support_agent.triage_ticket",
    status: errStep ? "error" : "success",
    durationMs: c.latencyMs,
    model: run.model,
    totalTokens,
    costUsd: totalTokens ? cost : undefined,
    errorSummary: errStep?.error?.message,
    timestamp: ts,
    runId: run.id,
    caseId: c.caseId,
    metadata: {
      environment: "staging",
      app_version: run.appVersion,
      provider: run.provider,
      run_id: run.id,
      case_id: c.caseId,
      customer_email: String(input.customer_email ?? ""),
      openai_api_key: "sk-demo-not-a-real-key",
    },
    steps,
  };
  traceCache.set(trace.id, trace);
  return trace;
}

/** Standalone production-like traces not tied to an evaluation run. */
function standaloneTraces(): Trace[] {
  const ops = ["support_agent.triage_ticket", "support_agent.summarize_thread", "refund_bot.answer"];
  return Array.from({ length: 8 }, (_, i) => {
    const r = rng("std" + i);
    const model = APP_CONFIGS[i % 3].model;
    const dur = Math.round(900 + r() * 2200);
    const err = i === 2 || i === 5;
    const p = Math.round(600 + r() * 800), cpl = Math.round(80 + r() * 120);
    const steps: TraceStep[] = [
      { id: "s1", parentId: null, name: ops[i % 3], type: "agent", startOffsetMs: 0, durationMs: dur, status: err ? "error" : "success", input: { request_id: `req_${9100 + i}` }, output: err ? null : { ok: true } },
      { id: "s2", parentId: "s1", name: "retrieval.vector_search", type: "retrieval", startOffsetMs: 10, durationMs: 140, status: "success", input: { index: "kb-v7", top_k: 4 }, output: { hits: 4 } },
      {
        id: "s3", parentId: "s1", name: "llm.generate", type: "llm", startOffsetMs: 160, durationMs: dur - 170, status: err ? "error" : "success", model,
        input: { temperature: 0.3 }, output: err ? null : { text: "…" }, tokens: { prompt: p, completion: cpl }, costUsd: priceFor(model, p, cpl),
        error: err ? { type: "RateLimitError", message: "429 Too Many Requests: rate limit reached for requests", stack: "openai.RateLimitError: Error code: 429" } : undefined,
      },
    ];
    return {
      id: `trc_live_${String(i + 1).padStart(2, "0")}`,
      operation: ops[i % 3],
      status: err ? "error" : "success",
      durationMs: dur,
      model,
      totalTokens: p + cpl,
      costUsd: priceFor(model, p, cpl),
      errorSummary: err ? "429 Too Many Requests: rate limit reached for requests" : undefined,
      timestamp: `2026-10-${String(14 + (i % 2)).padStart(2, "0")}T${String(8 + i).padStart(2, "0")}:1${i}:00Z`,
      metadata: { environment: "production", request_id: `req_${9100 + i}` },
      steps,
    };
  });
}

export function allTraces(runs: EvaluationRun[]): Trace[] {
  const out: Trace[] = [];
  for (const run of runs.filter((r) => r.id === "run_0142" || r.id === "run_0141")) {
    for (const c of getCasesForRun(run)) if (c.traceId) out.push(buildTrace(run, c));
  }
  out.push(...standaloneTraces());
  return out.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/* ---------------- Regression tests ---------------- */

export const REGRESSION_TESTS: RegressionTest[] = [
  {
    id: "rt_001", name: "Escalation level present for account takeover", category: "Schema violation", datasetId: "ds_support_tickets", datasetName: "support-tickets",
    severity: "critical", lastResult: "fail", lastRun: "2026-10-15T14:40:00Z",
    input: support[11].input, expectedBehavior: "Response JSON includes escalation_level = 2 for suspected account takeover.",
    actualOutput: { category: "account", priority: "high", reply: "…" }, failureDescription: "Model omitted escalation_level; downstream router dropped the ticket.", traceId: "trc_0141_017",
  },
  {
    id: "rt_002", name: "No invented refund amounts", category: "Hallucination", datasetId: "ds_support_tickets", datasetName: "support-tickets",
    severity: "high", lastResult: "pass", lastRun: "2026-10-15T14:40:00Z",
    input: support[8].input, expectedBehavior: "Reply must not state refund amounts or timelines absent from retrieved policy docs.",
    actualOutput: { reply: "Gift cards are non-refundable; our team can help with store credit." }, failureDescription: "Agent promised a $249 refund within 24h.",
  },
  {
    id: "rt_003", name: "KB search timeout is retried", category: "Tool failure", datasetId: "ds_support_tickets", datasetName: "support-tickets",
    severity: "medium", lastResult: "pass", lastRun: "2026-10-14T09:02:00Z",
    input: support[5].input, expectedBehavior: "Agent retries search_knowledge_base once and responds within 8 s.",
    actualOutput: { category: "shipping_delay", escalation_level: 1 }, failureDescription: "Single timeout aborted the whole pipeline.", traceId: "trc_0141_006",
  },
  {
    id: "rt_004", name: "Damaged parcels are not classified as technical", category: "Misclassification", datasetId: "ds_support_tickets", datasetName: "support-tickets",
    severity: "low", lastResult: "not_run",
    input: support[9].input, expectedBehavior: "category = shipping_damage", actualOutput: { category: "technical" }, failureDescription: "Category confusion on water damage tickets.", traceId: "trc_0141_021",
  },
];
