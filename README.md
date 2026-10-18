# ContextOps

**Know what changed. Understand what broke. Prove what to do next.**

Graph Hacks — *Context for AI Agents*, powered by **FalkorDB**.

**Primary Track:** Track 01 — Agents That Act on Connected Data  
**Additional Tracks:** Track 02 — Agent Memory and Coordination; Track 03 — Company Brain

ContextOps is a graph-powered AI agent platform that investigates operational incidents, traces dependencies, retrieves historical fixes, checks whether previous solutions remain valid, and verifies proposed corrections through deterministic tests.

It uses FalkorDB as its single database and persistent agent memory layer. Multiple agents collaborate through graph-stored state, evidence, investigation handoffs, and verification results.

> **Safety:** All demonstration data is synthetic and fictional. ContextOps never modifies external systems. Every proposed fix requires human approval.

## Table of Contents

1. Overview
2. Problem Statement
3. Features
4. Architecture
5. Agent Workflow
6. Technology Stack
7. Project Structure
8. Prerequisites
9. Windows Installation
10. Environment Configuration
11. Running the Application
12. Using ContextOps
13. FalkorDB and Graph Queries
14. API Reference
15. Testing and Validation
16. Persistent Agent Memory
17. Troubleshooting
18. Security and Limitations
19. Hackathon Track Alignment
20. Demo Guide
21. Future Improvements

## 1. Overview

Modern applications depend on interconnected services, pipelines, datasets, configurations, and teams. When one component changes, the effects can propagate across multiple systems. Investigating such failures requires understanding not only the error message but also the dependencies, historical incidents, previous fixes, and verification evidence.

ContextOps addresses this problem by combining graph-based knowledge with coordinated AI agents.

The project demonstrates a synthetic finance-pipeline failure in which a source schema changes and a downstream normalizer continues expecting an outdated field.

ContextOps investigates the incident, follows dependency relationships, retrieves a historical resolution, checks for context drift, and verifies the proposed correction.

### Core capabilities

- Graph-powered, multi-hop incident investigation.
- Controlled graph-tool selection by an Investigator Agent.
- Persistent shared memory using FalkorDB.
- Historical incident and fix retrieval.
- Context Drift Guard for identifying potentially outdated solutions.
- Verification Agent with deterministic tests.
- Explainable findings supported by graph relationships and evidence.
- Persistent outcomes that can be retrieved across sessions.
- Rules-based operation without an external LLM API.
- Optional LLM-powered tool selection.

## 2. Problem Statement

Traditional incident troubleshooting often requires engineers to manually search logs, documentation, previous tickets, configuration histories, and dependency maps.

This information is frequently fragmented across different tools. A previous fix may be found but reused without checking whether the current environment still matches the conditions under which it was verified.

This creates several challenges:

- Engineers spend time connecting information across systems.
- Root causes are difficult to trace across multiple dependencies.
- Historical fixes can become outdated as schemas and services change.
- AI-generated recommendations may lack verifiable evidence.
- Separate agents may lose context between tasks or sessions.
- A proposed fix may be incorrectly treated as successful without running tests.

ContextOps represents operational knowledge as a connected graph and gives agents controlled access to that knowledge.

The goal is to produce evidence-backed investigations, identify potentially stale knowledge, verify proposed fixes, and preserve outcomes for future investigations.

## 3. Features

### 3.1 Investigator Agent

The Investigator Agent receives an incident description and logs. It selects tools from a predefined allow-list to investigate the failure.

Its capabilities include:

- Resolving relevant graph entities.
- Tracing dependencies between services and datasets.
- Inspecting source changes.
- Finding affected systems.
- Retrieving related incidents and historical resolutions.
- Checking historical memory for validity.
- Finding system owners, decisions, and evidence.

The agent records investigation steps and supporting information so the reasoning process can be inspected.

### 3.2 Context Drift Guard

A historical fix may no longer be applicable after a schema change, dependency update, or configuration modification.

The Context Drift Guard evaluates:

- Whether the current failure matches the historical failure pattern.
- Whether the previous fix covers the fields changed in the current incident.
- Whether the schema version is compatible.
- Whether deterministic replay succeeds against current fixtures.
- Whether the stored memory remains sufficiently current.

Possible outcomes include:

- `applicable`
- `potentially_stale`
- `requires_revalidation`
- `not_applicable`

When a historical resolution appears stale, ContextOps records the conflict and flags the relevant memory for review.

### 3.3 Verification Agent

The Verification Agent receives an investigation identifier and reloads the necessary state from FalkorDB.

It retrieves the investigator handoff, incident, proposed fix, approver, verification tests, and supporting evidence. It then executes deterministic tests through a fixed test registry.

The agent records actual results in the graph.

It does not ask an LLM to decide whether a proposed correction is technically valid.

If the required proposal is missing, verification is blocked rather than fabricated.

### 3.4 Persistent Graph Memory

FalkorDB stores the entities and relationships needed for future investigations, including incidents, fixes, evidence, investigation reports, agent tasks, handoffs, tests, and outcomes.

This enables one agent to write information that another agent can retrieve later. It also allows previous outcomes to remain available after a backend restart.

### 3.5 Explainable Results

ContextOps distinguishes between:

- **Observed facts:** Information supported by the graph or incident inputs.
- **Agent hypotheses:** Possible explanations that require evaluation.
- **Proposed actions:** Suggested corrections requiring human approval.
- **Tested results:** Outcomes produced by actual deterministic checks.

This separation helps users understand what is known, what is suspected, and what has been verified.

### 3.6 Rules and LLM Execution Modes

ContextOps supports three execution modes:

| Mode | Description |
|---|---|
| `rules` | Deterministic planning, graph queries, and verification without an external model API. |
| `llm` | Uses a configured LLM to choose from the approved tool schemas. |
| `auto` | Uses an LLM when available and otherwise falls back to rules mode, reporting the actual execution mode. |

The application validates tool names and arguments. An LLM cannot directly submit arbitrary Cypher through the application's agent tools.

## 4. Architecture

```text
Frontend
TanStack Start + React + TypeScript
                 |
                 | HTTP / JSON
                 v
FastAPI Backend
                 |
       +---------+----------+
       |         |          |
       v         v          v
 Investigator  Drift     Verification
 Agent         Guard    Agent
       |         |          |
       +---------+----------+
                 |
                 v
       Graph Repository
       Named Cypher Queries
                 |
                 v
             FalkorDB
     Persistent Graph and Memory

Optional model provider:
Gemini or OpenAI-compatible API
```

### Frontend

The frontend provides the interface for viewing system status, running investigations, inspecting graph relationships, reviewing agent memory, and examining evidence and decisions.

### Backend

The Python backend uses FastAPI to expose API endpoints. Its responsibilities include request validation, investigation orchestration, graph access, context-drift evaluation, and deterministic verification.

### FalkorDB

FalkorDB is the only application database. It stores connected operational knowledge and agent state.

The backend accesses it through the official FalkorDB Python client and named, parameterized Cypher queries.

### Optional LLM integration

LLM calls originate from the backend. The application supports native Gemini integration and OpenAI-compatible tool-calling APIs.

Rules mode remains available when no model key is configured.

## 5. Agent Workflow

The primary workflow follows these steps:

1. **Receive an incident:** A synthetic finance pipeline fails after a source schema change.
2. **Investigate:** The Investigator Agent selects approved graph tools.
3. **Trace dependencies:** The agent follows relationships between services, datasets, and downstream pipelines.
4. **Retrieve historical context:** Related incidents and their previous fixes are retrieved from FalkorDB.
5. **Check context drift:** The Context Drift Guard evaluates whether the historical fix remains applicable.
6. **Persist the handoff:** Investigation state, evidence, and the proposed correction are stored in FalkorDB.
7. **Verify:** The Verification Agent reloads the handoff and runs deterministic tests.
8. **Record the result:** Test outcomes and verification status are persisted in the graph.
9. **Review:** The user inspects the evidence and approves or rejects the proposed action.

The agents share state through FalkorDB rather than depending exclusively on transient in-memory Python objects.

## 6. Technology Stack

### Backend

- Python 3.11+
- FastAPI
- Uvicorn
- Pydantic v2
- pydantic-settings
- Official FalkorDB Python client
- Google Gen AI SDK for Gemini
- httpx for optional LLM calls
- pytest

### Frontend

- TanStack Start
- TanStack Router
- TanStack Query
- React 19
- TypeScript
- Vite 8
- Tailwind CSS 4
- Vitest
- Testing Library

### Infrastructure and data

- FalkorDB graph database
- Cypher graph queries
- Docker
- Docker Compose
- Synthetic incident and pipeline fixtures

## 7. Project Structure

```text
contextops/
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── .env.example
│
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── agents/
│   │   ├── graph/
│   │   ├── models/
│   │   ├── services/
│   │   └── tests/
│   │
│   ├── scripts/
│   │   ├── seed_graph.py
│   │   ├── reset_graph.py
│   │   ├── smoke_test.py
│   │   ├── contract_check.py
│   │   └── gen_cypher_docs.py
│   │
│   └── requirements*.txt
│
├── docs/
│   ├── architecture.md
│   ├── graph-model.md
│   ├── cypher-queries.md
│   ├── demo-script.md
│   ├── test-report.md
│   └── ai-assistance-disclosure.md
│
├── docker-compose.yml
├── .env.example
└── README.md
```

## 8. Prerequisites

Install the following software before running the project.

### Docker Desktop

Download: https://www.docker.com/products/docker-desktop/

Docker Desktop is required for the recommended setup. Start it and wait until the Docker engine is running.

### Node.js and npm

Download: https://nodejs.org/

Use Node.js 20.19+ or 22.12+, as required by the project's Vite version.

### Git

Download: https://git-scm.com/

Git is needed if you clone the repository.

### Python

Python 3.11 or newer is required only when running the backend or scripts outside Docker. Python 3.12 has been tested.

### Optional LLM API key

A Gemini or OpenAI-compatible API key is needed only for LLM mode. Rules mode works without an external model key.

Verify the installations:

```cmd
docker --version
docker compose version
node --version
npm --version
git --version
python --version
```

## 9. Windows Installation

### Step 1: Clone or extract the repository

If the project is hosted in a public repository:

```cmd
git clone https://github.com/Devanandusreenath/contextops.git
cd contextops
```

Replace the URL if your repository uses a different owner or name.

If you downloaded a ZIP archive, extract it and open CMD or PowerShell in the folder containing `docker-compose.yml`.

Check the project structure:

```cmd
dir
dir frontend
dir backend
```

The root directory should contain the Compose file, environment example, frontend, backend, and documentation folders.

### Step 2: Create environment files

In Windows CMD:

```cmd
copy .env.example .env
copy frontend\.env.example frontend\.env
```

In PowerShell:

```powershell
Copy-Item .env.example .env
Copy-Item frontend/.env.example frontend/.env
```

These files provide the starting configuration for the backend and frontend.

Do not put private API keys in the frontend environment file.

### Step 3: Start the database and backend

From the project root, run:

```cmd
docker compose up --build -d
```

Check the running containers:

```cmd
docker compose ps
```

Follow backend logs:

```cmd
docker compose logs -f backend
```

Press `Ctrl+C` to stop following the logs. The containers will continue running.

The default local services are:

| Service | Address |
|---|---|
| Backend API | http://localhost:8000 |
| API documentation | http://localhost:8000/docs |
| Integration status | http://localhost:8000/api/integrations/status |
| Readiness endpoint | http://localhost:8000/api/health/ready |
| FalkorDB Browser | http://localhost:3001 |
| FalkorDB database | localhost:6379 |

The Compose configuration binds these services to localhost for the local development setup.

### Step 4: Confirm FalkorDB connectivity

Open:

http://localhost:8000/api/integrations/status

The response should report whether FalkorDB is connected, which graph is active, whether the graph has been seeded, and which agent execution mode is configured.

You can also run:

```cmd
curl http://localhost:8000/api/health/ready
```

If the database is not connected, inspect the backend and FalkorDB logs before proceeding.

### Step 5: Start the frontend

Open a second terminal and run:

```cmd
cd frontend
npm install
npm run dev
```

Open the local URL printed by the frontend development server. Depending on the configuration, it may be `http://localhost:8080`.

Keep the terminal running while using the application.

### Step 6: Verify frontend connectivity

Confirm that the interface loads and reports FalkorDB connectivity.

If the frontend cannot reach the backend, check `VITE_API_BASE_URL` and the backend's `CORS_ORIGINS` configuration.

Restart the relevant service after changing environment settings.

## 10. Environment Configuration

The root `.env` file contains backend configuration.

The most relevant variables are:

| Variable | Purpose |
|---|---|
| `APP_ENV` | Application environment |
| `FALKORDB_HOST` | Database host |
| `FALKORDB_PORT` | Database port |
| `FALKORDB_GRAPH` | Graph name, normally `contextops` |
| `FALKORDB_PASSWORD` | Optional database password |
| `AGENT_MODE` | `rules`, `llm`, or `auto` |
| `LLM_PROVIDER` | Provider selection |
| `GEMINI_API_KEY` | Gemini API key |
| `GEMINI_MODEL` | Gemini model identifier |
| `OPENAI_API_KEY` | OpenAI-compatible API key |
| `OPENAI_MODEL` | Model name for the compatible endpoint |
| `OPENAI_BASE_URL` | API endpoint URL |
| `CORS_ORIGINS` | Allowed frontend origins |
| `AUTO_SEED` | Whether to seed the graph automatically |

Use the defaults in `.env.example` unless you need to change them.

### Option A: Rules mode

This is the simplest way to verify the project because it does not require a model API key.

Set:

```dotenv
AGENT_MODE=rules
```

Then recreate the backend:

```cmd
docker compose up -d --force-recreate backend
```

The investigation workflow will still use FalkorDB and deterministic tests.

### Option B: Gemini

Create a Gemini API key through:

https://aistudio.google.com/apikey

Configure the root `.env` file:

```dotenv
AGENT_MODE=auto
LLM_PROVIDER=auto
GEMINI_API_KEY=YOUR_GEMINI_API_KEY
GEMINI_MODEL=gemini-3.1-flash-lite
```

Use a model currently available to your Google AI Studio project. Model availability can change.

After updating the file, recreate the backend:

```cmd
docker compose up -d --force-recreate backend
```

Test the Gemini call from inside the container:

```cmd
docker compose exec backend python -c "import os; from google import genai; c=genai.Client(api_key=os.environ['GEMINI_API_KEY']); r=c.models.generate_content(model=os.environ['GEMINI_MODEL'],contents='Reply with exactly GEMINI_OK'); print(r.text)"
```

If Google returns `401 UNAUTHENTICATED`, verify the API key, project configuration, and environment variable being passed into Docker. The presence of an environment variable does not prove that the key is valid.

Never publish your API key or commit `.env` to GitHub.

### Option C: OpenAI-compatible API

Use this configuration only with an endpoint that supports the required tool-calling behavior:

```dotenv
AGENT_MODE=auto
LLM_PROVIDER=openai
OPENAI_API_KEY=YOUR_PROVIDER_API_KEY
OPENAI_MODEL=YOUR_SUPPORTED_MODEL
OPENAI_BASE_URL=https://api.openai.com/v1
```

For another OpenAI-compatible provider, use its documented API URL and supported model name.

Recreate the backend after changing these values.

## 11. Running the Application

Once the backend and frontend are running:

1. Open the frontend.
2. Visit Overview and confirm that the database connection is healthy.
3. Open Investigations.
4. Start an investigation using the seeded synthetic finance-pipeline incident.
5. Inspect the tool-selection trace and dependency path.
6. Review the historical incident retrieved by the Investigator Agent.
7. Inspect the Context Drift Guard's verdict and explanation.
8. Review the proposed fix and its approval requirement.
9. Run verification.
10. Inspect the deterministic test results.
11. Open Graph Explorer to view connected entities and evidence.
12. Open Agent Memory and Evidence & Decisions to review persistent records.

The exact labels may differ slightly between frontend versions.

### Understanding verification results

The example scenario intentionally distinguishes contract correctness from complete backfill success.

The contract test checks the old mapping's failure and the corrected mapping against current and legacy fixtures. The backfill dry-run contains three records with null amounts that are rejected.

Therefore, the overall result may be `partially_verified`.

This is intentional: ContextOps reports actual outcomes instead of claiming complete success when some records remain unresolved.

## 12. FalkorDB and Graph Queries

Open the FalkorDB Browser:

http://localhost:3001

Use the local database connection:

- Host: `localhost`
- Port: `6379`
- Graph: `contextops`

### Inspect graph relationships

```cypher
MATCH (n)-[r]->(m)
RETURN n, r, m
LIMIT 50
```

### Count graph nodes

```cypher
MATCH (n)
RETURN count(n) AS nodeCount
```

### Count graph relationships

```cypher
MATCH ()-[r]->()
RETURN count(r) AS edgeCount
```

### Inspect incident-related nodes

```cypher
MATCH (n)
WHERE any(label IN labels(n)
  WHERE toLower(label) CONTAINS 'incident')
RETURN n
LIMIT 25
```

For the full graph schema and named queries, read:

- `docs/graph-model.md`
- `docs/cypher-queries.md`

The graph is seeded automatically when `AUTO_SEED=true`. To seed it manually:

```cmd
docker compose exec backend python -m scripts.seed_graph
```

Seeding is designed to be idempotent.

ContextOps does not expose an application tool for executing arbitrary user-supplied or LLM-supplied Cypher. Graph access is controlled through named, parameterized queries.

## 13. API Reference

Open the interactive FastAPI documentation:

http://localhost:8000/docs

Important endpoints include:

| Endpoint | Purpose |
|---|---|
| `GET /api/integrations/status` | Integration and execution-mode status |
| `GET /api/health/ready` | Backend and database readiness |
| `POST /api/investigations/run` | Starts an investigation |
| `POST /api/demo/simulate-release` | Demonstrates a synthetic release/schema change where enabled |

Use Swagger to inspect the exact request bodies and complete list of routes for the version you are running.

The demo release endpoint is disabled in production mode.

## 14. Testing and Validation

### Run the smoke test

```cmd
docker compose exec backend python scripts/smoke_test.py http://localhost:8000
```

If the script is not found at this path, inspect `backend/scripts/` and follow the instructions in `README_WINDOWS.md`.

### Run the contract check

```cmd
docker compose exec backend python scripts/contract_check.py
```

This checks the deterministic pipeline scenario, including the field rename, corrected mapping, fixture behavior, and schema validation.

### Run backend tests

```cmd
docker compose exec backend python -m pytest
```

If the container does not contain development test dependencies, use a local Python virtual environment and the project's development requirements.

### Run frontend checks

From the frontend directory:

```cmd
npm test
npm run lint
npm run build
```

Use the scripts defined in `frontend/package.json` if they differ from these examples.

### Manual backend setup (optional)

To run FastAPI directly on Windows, start FalkorDB first:

```cmd
docker compose up -d falkordb
```

Then:

```cmd
cd backend
python -m venv .venv
.venv\Scripts\activate
python -m pip install -r requirements-dev.txt
set FALKORDB_HOST=localhost
set FALKORDB_PORT=6379
uvicorn app.main:app --reload --port 8000
```

When running the backend outside Docker, use `localhost` as the database host. Inside Docker Compose, use the service name `falkordb`.

## 15. Persistent Agent Memory

To demonstrate memory across backend restarts:

1. Run an investigation.
2. Inspect its report and agent-written graph records.
3. Restart the backend:

   ```cmd
   docker compose restart backend
   ```

4. Refresh the UI.
5. Inspect investigation history and Agent Memory.
6. Stop the containers without removing the volume:

   ```cmd
   docker compose down
   ```

7. Start them again:

   ```cmd
   docker compose up -d
   ```

8. Run another investigation and inspect whether earlier outcomes are recalled.

The Docker volume preserves FalkorDB data across ordinary restarts and `docker compose down`. Removing the volume deletes the stored graph, including persistent agent memory.

### Optional context-drift demonstration

The project includes a synthetic release simulation for demonstrating how a schema change can make historical memory stale.

Example PowerShell request:

```powershell
$body = @{
  serviceId = "svc-event"
  version = "4.3"
  renamedFields = @(
    @{ from = "amount_minor"; to = "amount_total_minor" }
  )
} | ConvertTo-Json -Depth 5

Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:8000/api/demo/simulate-release `
  -ContentType "application/json" `
  -Body $body
```

Rerun the investigation and inspect Agent Memory for a review flag and drift explanation. Check Swagger for the exact current request schema.

## 16. Stopping and Resetting the Project

### Stop the containers

```cmd
docker compose down
```

This stops the services but keeps the persistent database volume.

### Restart services

```cmd
docker compose restart
```

### Rebuild the backend

```cmd
docker compose up --build -d backend
```

### Reset the database

**Warning:** Removing the database volume deletes persisted incidents, agent tasks, investigation reports, and memory.

First list available volumes:

```cmd
docker compose down
docker volume ls
```

Identify the volume belonging to this project and remove that exact volume:

```cmd
docker volume rm YOUR_CONTEXTOPS_VOLUME_NAME
```

Do not guess the volume name. Confirm it before deletion.

Restart the project afterward to initialize a clean graph.

## 17. Troubleshooting

### Docker cannot connect

Start Docker Desktop and wait until the engine is ready.

```cmd
docker info
docker compose ps
```

### FalkorDB connection fails

Inside Compose, the backend should use:

```dotenv
FALKORDB_HOST=falkordb
FALKORDB_PORT=6379
FALKORDB_GRAPH=contextops
```

Inspect logs:

```cmd
docker compose logs --tail=200 backend
docker compose logs --tail=200 falkordb
```

### Graph is empty

Check `AUTO_SEED` and backend logs. Then, if necessary, run:

```cmd
docker compose exec backend python -m scripts.seed_graph
```

### Gemini returns 401

- Verify the key through Google AI Studio.
- Ensure the root `.env` contains the intended Gemini key.
- Confirm the backend container receives the updated environment.
- Recreate the backend:

  ```cmd
  docker compose up -d --force-recreate backend
  ```

- Retest the API call from inside the container.
- Never share the full key in screenshots or logs.

### LLM mode fails

Set `AGENT_MODE=rules` to test the graph and deterministic workflow without external API calls.

### Frontend cannot connect to the backend

- Verify `http://localhost:8000/api/integrations/status`.
- Check `VITE_API_BASE_URL`.
- Ensure the frontend origin is included in `CORS_ORIGINS`.
- Restart the relevant service after changing environment variables.

### npm dependency errors

Use the Node.js version specified in the prerequisites. If a dependency conflict persists, try:

```cmd
npm install --legacy-peer-deps
```

Use this as a fallback rather than a substitute for resolving incompatible package versions.

### Verification is partially successful

Inspect each test result. The default backfill dry-run rejects three records with null amounts, so a `partially_verified` result can be expected.

## 18. Security and Limitations

### Security measures

- Synthetic and fictional data only.
- Allow-listed graph tools.
- Validated tool arguments.
- Named, parameterized Cypher queries.
- Bounded graph traversal.
- Fixed registry for deterministic test execution.
- No shell execution or `eval` in agent tools.
- Structured error responses and input-size limits.
- Backend-only API keys.
- Localhost-only port bindings in the default Compose configuration.
- Human approval required for proposed corrections.

### Current limitations

- The project is a hackathon demonstration, not a production-hardened incident-management system.
- Authentication and rate limiting are not included in the local setup.
- FalkorDB has no password configured by default in the local Compose configuration.
- LLM mode depends on provider availability and valid credentials.
- Investigation execution is synchronous, so LLM calls may take longer than rules mode.
- Deterministic verification focuses on the synthetic field-rename scenario. Other scenarios may remain inconclusive.
- No real production finance systems or external deployment tools are modified.
- A successful model response does not establish the correctness of a proposed fix; deterministic tests and human review remain important.

Do not expose the local application directly to the public internet without appropriate authentication, authorization, secret management, monitoring, network restrictions, and a security review.

## 19. Hackathon Track Alignment

### Track 01 — Agents That Act on Connected Data

**Primary track.**

ContextOps uses graph relationships to trace dependencies, retrieve historical incidents, select approved tools, inspect evidence, and investigate potential root causes across multiple hops.

### Track 02 — Agent Memory and Coordination

The Investigator Agent persists its handoff in FalkorDB. The Verification Agent retrieves that handoff, runs tests, and records outcomes. Graph-backed state allows agents to coordinate without relying exclusively on transient process memory.

### Track 03 — Company Brain

ContextOps models services, pipelines, datasets, people, teams, projects, documents, decisions, incidents, fixes, and tests as connected entities. The graph helps agents understand ownership, dependencies, and operational history.

## 20. Demo Guide

A concise two-to-three-minute demonstration can follow this sequence:

1. **Problem:** Introduce the synthetic finance-pipeline failure.
2. **Connected graph:** Show the source service, downstream pipeline, affected dataset, and related historical incident.
3. **Investigation:** Run the Investigator Agent and explain its graph-tool trace.
4. **Context drift:** Show why the historical fix may require revalidation.
5. **Verification:** Run the Verification Agent and display actual deterministic test outcomes.
6. **Persistent memory:** Show the investigation handoff, test records, and memory stored in FalkorDB.
7. **Safety:** Emphasize explainable evidence, human approval, and synthetic data.

For the complete narration and click-by-click sequence, see `docs/demo-script.md`.

## 21. Future Improvements

Potential extensions include:

- Authenticated multi-user workspaces and tenant-isolated graph memory.
- More incident types and deterministic verification fixtures.
- Streaming investigation progress for longer-running requests.
- Better graph-path visualization and evidence-to-conclusion navigation.
- Monitoring for tool selection, query latency, and model usage.
- Production-grade access controls, secret management, and rate limiting.
- Carefully permissioned integrations with ticketing, logs, documentation, and CI/CD systems.

## Additional Documentation

- `README_WINDOWS.md` — Windows setup guide
- `docs/architecture.md` — architecture and agent behavior
- `docs/graph-model.md` — graph entities and relationships
- `docs/cypher-queries.md` — named Cypher queries
- `docs/demo-script.md` — demo walkthrough
- `docs/test-report.md` — test results and limitations
- `docs/ai-assistance-disclosure.md` — AI assistance disclosure template

---

**ContextOps — Know what changed. Understand what broke. Prove what to do next.**
