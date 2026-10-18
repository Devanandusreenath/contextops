# Test report (what was actually executed)

Environment of the build session: Linux sandbox, Python 3.12.3, Node 22.22.2, `falkordb` Python client **1.8.0**.
**FalkorDB engine used for all tests:** the FalkorDB graph module (v4.18.3) bundled with the `falkordblite` 0.10.0 PyPI package, started as a
normal TCP server (`redis-server --loadmodule falkordb.so`) and accessed through the official client over the network, the same code path as
production. **It is not the `falkordb/falkordb` Docker image** (no Docker in the sandbox).

## Executed and passed

| Check | Result |
|---|---|
| Backend `pytest` against a real FalkorDB (graph `contextops_test`) | **66 passed** |
| Backend `pytest` with FalkorDB unreachable | 19 passed (DB-free), **47 skipped** with an explanatory message (never false passes) |
| Frontend `tsc --noEmit` | 0 errors |
| Frontend `vitest` | **14 passed** (HTTP client 4, connection/loading/empty states 3, page integration 6, original routing 1) |
| Frontend `vite build` | succeeded |
| `scripts/smoke_test.py` against a live uvicorn on a freshly created graph | all 11 checks passed |
| `scripts/contract_check.py`: live API JSON type-checked against the project's `src/types/index.ts` | passed (this caught a real `null` vs optional mismatch, now fixed) |
| Real process restart: API killed and restarted; history, agent memory and cross-session recall retained | passed (state persisted in FalkorDB) |
| `pip install -r requirements.txt` in a clean venv; app imports with runtime-only dependencies | passed |
| Dev server: all 7 routes return HTTP 200 (SSR); CORS preflight from the dev origin | passed |
| `docker-compose.yml` parsed as valid YAML (services, ports, volume, service-name host) | passed (syntax only) |

Backend test files: `test_simulator` (7: deterministic pass/fail fixtures), `test_health_and_seed` (11: health, FalkorDB connectivity, idempotent seed,
no duplicates, preserved frontend ids/directions, relationship integrity, provenance metadata, injection allow-list), `test_graph_queries` (9: multi-hop discovery,
bounded depth, derived failure/demo paths, historical retrieval and ranking, owners/decisions, stale-memory query, overview), `test_investigation` (15: validation,
real verification not over-claimed, results recorded in the graph, agent handoff via FalkorDB, verifier `blocked`, memory across sessions, drift detection, new-release
staleness, memory review, evidence-dependent tool selection, edited logs, history endpoints), `test_llm_mode` (5), `test_schema_and_security` (7: response shapes mirror the
TypeScript interfaces, no arbitrary-query endpoint, CORS, safe errors, 503 when FalkorDB is down).

## NOT executed (be explicit when presenting)

* **Docker:** `docker compose up`, the backend Dockerfile build, the `falkordb/falkordb` image, its healthcheck (`redis-cli ping`), named-volume persistence
  across *container* restarts, and FalkorDB Browser on port 3001 were **not run**. The compose file follows FalkorDB's documented image/ports/data path but is unverified here. The image tag is `latest`; pin a tag you have verified.
* **A real LLM provider.** `AGENT_MODE=llm` was tested only with **scripted stubs** and a **fake `google-genai` client** (tool selection, allow-list rejection, argument validation, message conversion incl. Gemini thought signatures, failure handling, fallback labelling, key never leaked). No OpenAI or Gemini request was made and no model-quality claim is made. Model names (`gpt-4o-mini`, `gemini-3.1-flash-lite`) are placeholders to verify. Google `AQ.` keys were reported by users to return 401 on some Google routes (OpenAI-compatible endpoint); the native Gemini provider mirrors the `google-genai` SDK usage the project owner reported working, but was not run against Google.
* **A real browser.** None was available. UI behaviour is covered by jsdom integration tests rendering the real routes with captured backend responses, plus SSR and build.
  Visual layout of new elements (report sections, badges) has not been eyeballed.
* **Windows.** The PowerShell instructions were written for Windows 10/11 but not executed on Windows.
* `npm ci` rejects the shipped lockfile (it was generated with `--legacy-peer-deps`); `npm install` works with it on a clean directory (tested).
* One pre-existing ESLint error in the original `graph.tsx` (an unused-expression ternary) was left untouched; prettier formatting warnings exist throughout the original code base.

## Test-environment configuration

```
TEST_FALKORDB_HOST=localhost  TEST_FALKORDB_PORT=6379  TEST_FALKORDB_GRAPH=contextops_test   (defaults)
```
Tests use their own graph and never touch the demo graph.
