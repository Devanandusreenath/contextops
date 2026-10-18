# Architecture

```
┌────────────────────┐   HTTP/JSON (camelCase)   ┌─────────────────────────────────────────────┐
│ Frontend           │ ───────────────────────▶ │ FastAPI  (backend/app)                       │
│ TanStack Start +   │  VITE_API_BASE_URL        │  api/      routes, validation, error handlers │
│ React Query        │ ◀─────────────────────── │  agents/   Investigator, Verifier, tools      │
└────────────────────┘                           │  services/ investigation, drift, mappers      │
                                                 │  graph/    named Cypher + repository + seed   │
                                                 └───────────────┬─────────────────────────────┘
                                                                 │ official FalkorDB client (Cypher)
                                                         ┌───────▼────────┐
                                                         │ FalkorDB graph │  (single source of truth)
                                                         └────────────────┘
        optional LLM (tool calling) — called ONLY from backend, only in AGENT_MODE=llm/auto with a key:
          native Gemini (google-genai SDK; GEMINI_API_KEY / GEMINI_MODEL)  or  any OpenAI-compatible endpoint (OPENAI_*)
```

FalkorDB is the only database. Incidents, fixes, evidence, memory, investigation reports, agent task state and test results all live in
the graph; the Python process is stateless between requests.

## Agents

**Investigator Agent** (`agents/investigator.py`, `planner.py`, `tools.py`, `assessment.py`) accepts description + logs and selects from
an allow-list of 11 tools. Each tool is a thin wrapper over named, parameterised repository queries (`docs/cypher-queries.md`):

`resolve_entities`, `trace_dependency_path`, `inspect_source_change`, `find_affected_systems`, `inspect_related_incidents`,
`retrieve_historical_resolution`, `replay_historical_fix`, `check_memory_validity`, `get_system_owner`, `retrieve_related_decisions`,
`retrieve_evidence`.

* **Rules mode** — a planner chooses the *next* tool from the current state. A schema-error signal in the logs prioritises change
  inspection and precedent retrieval; logs without such a signal localise impact first; tools whose preconditions fail are skipped and the
  skip is recorded as a step (e.g. no corroborated change ⇒ no replay, no fix proposal).
* **LLM mode** — the model sees the same tool schemas and chooses among them. Arguments are validated; unknown tools / bad arguments
  are rejected and reported back to the model (and shown in the trace). The model may supply wording (root-cause sentence, uncertainties) via a
  `finish` call, marked `authoredBy: "llm"`; facts, proposals and all test results remain deterministic.

**Context Drift Guard** (`services/drift.py`, `replay_historical_fix`, `Q_STALE_MEMORY`). For the best-ranked precedent with a recorded fix it
checks failure-pattern match, fix scope vs the fields changed now, the schema version the fix was verified against, a deterministic **replay** of the
historical mapping on current-schema fixtures, and memory freshness; verdict ∈ `applicable | potentially_stale | requires_revalidation | not_applicable`.
Results are persisted: stale memory is flagged `needs_review`, and a *Knowledge conflict* memory is written.

**Verification Agent** (`agents/verifier.py`). Input: an investigation id only. It reads the verifier `AgentTask`, the linked investigator task
(`handoff` edge), the approver (`ASSIGNED_TO`), the incident, the proposed Fix (`proposal_json`), its `VERIFIED_BY` tests and evidence **from FalkorDB**
(`Q_HANDOFF_STATE`), runs each test via the registry (`agents/pipeline_sim.py`) and writes results back (test node properties, *Tested result*
evidence, fix `verification_status`, task status). If the proposal is missing it returns `blocked`; it never asks an LLM whether a fix "looks right".

## Execution modes (never misreported)

`AGENT_MODE=rules|llm|auto`. The response carries `requestedMode`, `executionMode` (actually used), `fallbackReason` and `llmModel` (only when an LLM was used).
`llm` without a key → HTTP 503 `llm_not_configured`; `llm` with a failing provider → HTTP 502 `llm_failed` and a `failed` AgentTask (no report);
`auto` falls back to rules and says why.

## Verification is real

`pipeline_sim.py` implements a small local normalizer: field-map config, `normalize_event`, a schema validator and fixtures. The contract test
asserts the outdated mapping reproduces the incident (`KeyError 'amount_cents'`), that the patched mapping yields the expected records for
new-format and legacy events, precedence, no silent default, and schema validity. The backfill dry-run feeds a batch that contains 3 records with null
amounts; they are genuinely rejected, so that test **fails** and the overall result is `partially_verified`. Assertion counts are computed, never typed in.

## Separation of facts, hypotheses, actions, tests, approval

Evidence categories: *Observed fact*, *Agent hypothesis*, *Proposed action* (state *Requires approval*), *Tested result* (*Test passed/failed*).
Every proposal has `requiresHumanApproval: true` and an approver from the graph (`ASSIGNED_TO`). ContextOps never modifies an external system.

## Security posture (local demo)

No endpoint or tool executes user/LLM Cypher; labels/types are allow-listed; depth is clamped; test keys come from a fixed registry; no shell or
`eval`. Inputs are length-limited (description 4 000, logs 20 000 chars, request body 64 KiB). Errors are structured JSON without stack traces.
CORS allows only configured local origins. Secrets live only in the backend environment (`.env`, never committed); the frontend has none. Docker
publishes FalkorDB and the API on `127.0.0.1` only. **Not production hardened:** no authentication, no rate limiting, FalkorDB has no password by default.
Log text sent to an LLM is untrusted input (prompt-injection surface); mitigations are the allow-list, argument validation and deterministic verification.

## Deviations from `demoData.ts` (deliberate)

* No pre-baked `12/12 passed (simulated)`: `test-contract` and `fix-2041` start *unverified*; results exist only after a real run.
* EV-3/5/6/7 (hypothesis / proposed action / tested results) are produced by agents; only EV-1, EV-2, EV-4 (observed facts) are seeded.
* Dashboard metrics are computed from the graph (8 systems, not the demo's "18").
* Extra nodes/edges listed in `graph-model.md`; `Project` was added to the UI's entity types (with a colour).
* Incident timestamps are synthetic; "updated" is computed relative to now.

## Known limitations

* `POST /api/investigations/run` is synchronous (no streaming progress). Rules mode takes well under a second; LLM mode depends on the provider.
* Only one failure class (field rename) has deterministic tests; other scenarios end `inconclusive` by design.
* Docker Compose and the real OpenAI API could not be exercised in the build environment (see `docs/test-report.md`).
