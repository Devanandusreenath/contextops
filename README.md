# ContextOps

**Know what changed. Understand what broke. Prove what to do next.**

Graph Hacks — *Context for AI Agents*, powered by **FalkorDB**.
Primary track: **Track 01 — Agents That Act on Connected Data.** Also implemented: **Track 02 — Agent Memory and Coordination**
(two agents share state through the graph; verified outcomes persist across sessions) and **Track 03 — Company Brain**
(services, pipelines, datasets, people, teams, projects, documents, decisions, incidents, fixes and tests in one graph).

ContextOps investigates a failing (synthetic) finance pipeline: an **Investigator Agent** selects allow-listed graph tools, follows multi-hop
dependencies, retrieves a previous incident, and a **Context Drift Guard** tests whether that incident's fix still applies; a **Verification Agent** reads the
handoff back from FalkorDB, runs deterministic tests and records the (real) outcome. FalkorDB is the only database and the agents' working memory.

* Start here: [`README_WINDOWS.md`](README_WINDOWS.md) (Windows, step by step), then [`docs/demo-script.md`](docs/demo-script.md).
* How it works: [`docs/architecture.md`](docs/architecture.md), [`docs/graph-model.md`](docs/graph-model.md), [`docs/cypher-queries.md`](docs/cypher-queries.md).
* What was and was not tested: [`docs/test-report.md`](docs/test-report.md). AI disclosure template: [`docs/ai-assistance-disclosure.md`](docs/ai-assistance-disclosure.md).

## Quick start

```bash
cp .env.example .env && cp frontend/.env.example frontend/.env
docker compose up --build -d            # FalkorDB :6379, FalkorDB Browser :3001, API :8000 (all on 127.0.0.1)
cd frontend && npm install && npm run dev
```
API docs: <http://localhost:8000/docs>. Without an LLM key everything works in deterministic `rules` mode.

## Technologies

Python 3.11+ (3.12 tested), FastAPI, Uvicorn, Pydantic v2 / pydantic-settings, official FalkorDB Python client (1.8.0 tested), httpx (optional LLM calls),
pytest, Docker Compose, FalkorDB; frontend: TanStack Start / Router / Query, React 19, Vite 8, Tailwind 4, Vitest + Testing Library.
Optional: an OpenAI-compatible tool-calling API.

## Layout

```
frontend/   connected UI (original design preserved)      backend/app/{api,agents,graph,models,services,tests}
backend/    FastAPI + agents + graph + tests + scripts    backend/scripts/{seed_graph,reset_graph,smoke_test,contract_check,gen_cypher_docs}.py
docs/       model, queries, architecture, demo, test report
```

All data is synthetic and fictional. ContextOps never modifies an external system; every proposed fix requires human approval.
