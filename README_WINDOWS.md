# ContextOps on Windows 10/11 (PowerShell + VS Code)

Everything below is copy-pasteable PowerShell. Commands assume the project lives in `C:\Dev\ContextOps`.
Nothing is installed automatically: VS Code does **not** install Python, Docker, Node.js or npm for you.

## 0. What you need

| Download | Needed for | Required? |
|---|---|---|
| **Docker Desktop** (WSL 2 backend) <https://www.docker.com/products/docker-desktop/> | FalkorDB + backend containers | **Yes** for the recommended setup (A) |
| **Node.js LTS** <https://nodejs.org> — version **20.19+ or 22.12+** (the project's Vite 8 requires `^20.19 \|\| >=22.12`) | Frontend | **Yes** |
| **VS Code** <https://code.visualstudio.com> | Editing | Recommended |
| **Python 3.11 or newer** (3.12 tested) <https://www.python.org/downloads/> | Only for setup B (manual backend), or to run tests/scripts outside Docker | **Optional**. The backend runs inside Docker in setup A |
| Git | Only if you version the project | Optional |
| Model API key | AI-powered mode only | **Optional**. The demo works without it |

Check versions:
```powershell
docker --version
node --version     # must print v20.19+ or v22.12+
npm --version
python --version   # only if you use setup B
```

## 1. Create the folders and extract the archives

Both archives come from the same package. You should have `contextops-backend.zip` and `contextops-frontend-connected.zip`.
```powershell
New-Item -ItemType Directory -Force C:\Dev\ContextOps | Out-Null
# Backend archive -> project root (creates backend\, docs\, docker-compose.yml, .env.example, ...)
Expand-Archive -Path "$HOME\Downloads\contextops-backend.zip" -DestinationPath C:\Dev\ContextOps -Force
# Frontend archive -> the frontend\ folder (package.json must end up directly inside frontend\)
Expand-Archive -Path "$HOME\Downloads\contextops-frontend-connected.zip" -DestinationPath C:\Dev\ContextOps\frontend -Force
cd C:\Dev\ContextOps
code .
```
Expected layout: `frontend\package.json`, `backend\Dockerfile`, `docker-compose.yml`, `.env.example`, `docs\`.
If `frontend\package.json` is missing, the ZIP created a nested folder: move its contents up one level.

## 2. Configure environment files

```powershell
cd C:\Dev\ContextOps
Copy-Item .env.example .env                       # backend / docker settings
Copy-Item frontend\.env.example frontend\.env     # frontend settings (public values only)
```

**Optional LLM key** (backend only, never in `frontend\.env`). Two providers are supported:

*Native Gemini* (recommended if you have a Google AI Studio key, including the new `AQ.` format). Open the root `.env` and set:
```
AGENT_MODE=auto
GEMINI_API_KEY=your-gemini-key
GEMINI_MODEL=gemini-3.1-flash-lite     # check Google's current model names
```
*OpenAI or any OpenAI-compatible endpoint*:
```
AGENT_MODE=auto
OPENAI_API_KEY=sk-...your key...
OPENAI_MODEL=gpt-4o-mini      # check your provider's current model names
```
`LLM_PROVIDER=auto` picks Gemini when only `GEMINI_API_KEY` is set. After editing `.env` run `docker compose up --build -d` (a rebuild is needed once after updating the backend code). Settings in the UI shows the provider and model in use.

* `rules`: deterministic planner, real FalkorDB queries and real tests, **no external API** (works with no key).
* `llm`: an LLM chooses among allow-listed tools. Fails loudly if no key / provider error.
* `auto` (default): LLM if a key is set, otherwise rules. The UI always shows the mode actually used.
* External model APIs **may cost money**. A ChatGPT subscription does **not** by itself give you API access; create an API key in the provider's developer dashboard.

## 3A. Recommended: Docker Compose (database + backend)

1. **Start Docker Desktop** (Start menu → Docker Desktop) and wait until it says *Engine running*.
2. Start everything:
```powershell
cd C:\Dev\ContextOps
docker compose up --build -d
docker compose ps
docker compose logs -f backend       # Ctrl+C to stop following; look for "Seeding graph" and "Application startup complete"
```
3. Confirm FalkorDB is connected and seeded:
```powershell
Invoke-RestMethod http://localhost:8000/api/health/ready
# -> status: ready, falkordb: True, seeded: True, nodes: 39, edges: 68
Invoke-RestMethod http://localhost:8000/api/integrations/status | ConvertTo-Json -Depth 5
```
4. Open **Swagger docs**: <http://localhost:8000/docs>
5. Inspect the graph visually with **FalkorDB Browser**: <http://localhost:3001> (host `localhost`, port `6379`, graph `contextops`; try `MATCH (n)-[r]->(m) RETURN n,r,m LIMIT 50`).

The graph is **seeded automatically on every start** (idempotent: no duplicates). To seed manually:
```powershell
docker compose exec backend python -m scripts.seed_graph
```

## 3B. Alternative: manual backend with a Python virtual environment

Needs Python 3.11+ and a running FalkorDB (start only the database with Docker: `docker compose up -d falkordb`).
```powershell
cd C:\Dev\ContextOps\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1          # if blocked: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
pip install -r requirements-dev.txt
$env:FALKORDB_HOST = "localhost"
uvicorn app.main:app --reload --port 8000
```
(The `.env` file in the project root is also read automatically.)

## 4. Start the frontend (second terminal)

```powershell
cd C:\Dev\ContextOps\frontend
npm install        # first time only. If npm reports a dependency-tree error, run: npm install --legacy-peer-deps
npm run dev
```
Open the **Local** URL the terminal prints (in our test run it was **http://localhost:8080**; the backend allows ports 3000, 5173 and 8080).
Other scripts: `npm run build`, `npm test`, `npm run lint`.

New frontend packages vs the original project: only `@testing-library/dom` (dev dependency; peer requirement of `@testing-library/react` used by the new tests). `package-lock.json` is included. Nothing else was upgraded.

## 5. Run the end-to-end investigation

1. Open **Overview**: the top-right badge should read **FALKORDB CONNECTED · RULES MODE** (or AUTO/LLM) and the failure path appears.
2. **Investigations → Run Investigation**. You will see ordered steps, the *Execution mode* badge, the Context Drift Guard card, the proposed correction and the verification result.
   Expected with the default data: **partially verified** (contract test 12/12 passes; backfill dry-run fails on 3 null-amount records).
3. **Graph Explorer** → *Investigation evidence path* highlights the path computed for the run.
4. **Agent Memory** and **Evidence & Decisions** show the records the agents wrote to FalkorDB.

Command-line equivalent / smoke test (needs Python):
```powershell
cd C:\Dev\ContextOps\backend
python scripts\smoke_test.py http://localhost:8000
# or without local Python:  docker compose exec backend python scripts/smoke_test.py http://localhost:8000
```

## 6. Test persistent memory in a new session

```powershell
docker compose restart backend         # new backend process = new session
# reload the browser: the report reloads from FalkorDB history; Agent Memory still lists agent-written records
docker compose down                    # stops containers, KEEPS the data volume
docker compose up -d                   # data is still there
```
Run the investigation again: the report shows *Memory recalled … recalled from an earlier session* and carries over the unresolved backfill failure.

### Drift demo (optional)
A synthetic new release of the Event Service makes earlier memory stale:
```powershell
$body = @{ serviceId = "svc-event"; version = "4.3"; renamedFields = @(@{ from = "amount_minor"; to = "amount_total_minor" }) } | ConvertTo-Json -Depth 5
Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/demo/simulate-release -ContentType "application/json" -Body $body
```
Re-run the investigation and open **Agent Memory**: the earlier outcome memory is now **Needs review** with a drift reason (disabled when `APP_ENV=production`).

## 7. Reset (destructive. Read the warning)

```powershell
# Delete only agent-created data (investigations, evidence, memory) and reseed. Asks for confirmation:
docker compose exec backend python -m scripts.reset_graph --runs-only
# Delete the WHOLE graph and reseed. Asks for confirmation:
docker compose exec backend python -m scripts.reset_graph --all
# Delete ALL stored database files (volume). Irreversible:
docker compose down -v
```

## 8. Stop safely

```powershell
# frontend terminal: Ctrl+C
docker compose stop        # stop, keep containers and data
docker compose down        # remove containers, keep data volume
docker compose logs --tail 100 backend     # inspect logs
docker compose restart backend
```

## 9. Run the tests

```powershell
docker compose up -d falkordb
cd C:\Dev\ContextOps\backend
.\.venv\Scripts\Activate.ps1       # created in setup 3B
python -m pytest -q                # uses graph "contextops_test"; skips (with a message) if FalkorDB is unreachable
cd ..\frontend; npm test
```

## 10. Troubleshooting

| Symptom | Fix |
|---|---|
| `error during connect` / Docker commands fail | Docker Desktop is not running. Start it and wait for *Engine running*. Enable WSL 2 in Docker Desktop settings. |
| `port is already allocated` / `bind: Only one usage of each socket address` | Another program uses 8000, 6379 or 3001. Find it: `netstat -ano \| findstr :8000`, then `taskkill /PID <pid> /F`, or change the host port in `docker-compose.yml`. A local Redis on 6379 conflicts with FalkorDB. |
| UI shows **Backend disconnected** | Backend not running or wrong `VITE_API_BASE_URL`. Check `docker compose ps`, open <http://localhost:8000/api/health>. After editing `frontend\.env`, restart `npm run dev`. |
| Browser console: **CORS** error | The page's origin is not in `CORS_ORIGINS` (root `.env`). Add it (e.g. `http://localhost:4000`), then `docker compose up -d` to recreate the backend. |
| `ECONNREFUSED` / *connection refused* | The service is not up yet (give the backend ~30 s after `up`), or it crashed: `docker compose logs backend`. |
| `/api/health/ready` returns 503 `not_seeded` | Run `docker compose exec backend python -m scripts.seed_graph`. |
| Settings shows *LLM key not configured* but you set one | Edit the **root** `.env` (not `frontend\.env`), then `docker compose up -d` (a restart alone does not re-read env files). |
| Investigation returns **502 llm_failed** | Bad key, no quota/billing, or wrong `OPENAI_MODEL`. No fake report is produced. Fix the key or set `AGENT_MODE=rules`. |
| Investigation returns **503 llm_not_configured** | `AGENT_MODE=llm` without a key. Use `auto` or `rules`. |
| `npm install` fails with `Cannot read properties of null (reading 'edgesOut')` | Run `npm install --legacy-peer-deps`. |
| PowerShell: `npm.ps1 cannot be loaded` | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| `Activate.ps1` blocked | same command as above |
| Node/Vite error about engine version | Install Node 22 LTS (≥ 22.12) or 20.19+. |
| FalkorDB Browser (3001) cannot connect | In its connection form use host `localhost`, port `6379`; the database port is published on 127.0.0.1 only. |

Security reminders: `.env` is git-ignored. Never commit it; never put a key in `frontend\.env`. FalkorDB and the API are bound to `127.0.0.1` only.
