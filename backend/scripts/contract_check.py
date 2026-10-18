"""Type-check REAL backend responses against the frontend's TypeScript types (src/types/index.ts).

  python scripts/contract_check.py [API_URL] [FRONTEND_DIR]     (backend must be running and seeded)

Fetches live JSON, writes a temporary .ts file that assigns each response to its declared TS type, runs
`tsc --noEmit` in the frontend, then deletes the temporary file. Requires Node + `npm install` in the frontend.
"""
import json
import subprocess
import sys
from pathlib import Path

import httpx

API = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/") + "/api"
FE = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parents[2] / "frontend"
c = httpx.Client(timeout=120)


def get(p):
    r = c.get(API + p)
    r.raise_for_status()
    return r.json()


scenarios = get("/scenarios")
runs = []
for s in scenarios:
    r = c.post(API + "/investigations/run", json={"scenarioId": s["id"], "description": s["description"], "logs": s["logs"]})
    r.raise_for_status()
    runs.append(r.json())
graph = get("/graph")
items = [
    ("graphNodes", "GraphNode[]", graph["nodes"]), ("graphEdges", "GraphEdge[]", graph["edges"]),
    ("incidents", "Incident[]", get("/incidents")), ("memory", "MemoryRecord[]", get("/memory")),
    ("evidence", "EvidenceRecord[]", get("/evidence")), ("scenarios", "Scenario[]", scenarios),
    ("failure", "PathResult", get("/graph/failure-path")), ("demo", "PathResult", get("/graph/demo-path")),
    ("overview", "OverviewGraph", get("/graph/overview")), ("steps", "InvestigationStep[]", get("/investigation/steps")),
    ("activity", "ActivityItem[]", get("/activity")),
    ("neighbors", "{ edge: GraphEdge; node: GraphNode }[]", get("/graph/nodes/svc-event/neighbors")),
    ("trace", "InvestigationTrace", get(f"/investigations/{runs[0]['investigationId']}/trace")),
    ("list", "InvestigationSummary[]", get("/investigations")), ("integ", "IntegrationStatus", get("/integrations/status")),
] + [(f"run{i}", "InvestigationRun", r) for i, r in enumerate(runs)]
src = ('import type { GraphNode, GraphEdge, Incident, MemoryRecord, EvidenceRecord, Scenario, InvestigationStep, PathResult, '
       'OverviewGraph, ActivityItem, InvestigationRun, InvestigationTrace, InvestigationSummary, IntegrationStatus } from "@/types";\n')
src += "".join(f"const {n}: {t} = {json.dumps(v)};\n" for n, t, v in items)
src += "export const all = [" + ", ".join(n for n, _, _ in items) + "];\n"
tmp = FE / "src" / "__contract_check.ts"
tmp.write_text(src)
try:
    res = subprocess.run("npx tsc --noEmit", cwd=FE, shell=True, capture_output=True, text=True)
finally:
    tmp.unlink(missing_ok=True)
print(res.stdout[:3000] or "TypeScript: all live API responses match src/types/index.ts")
sys.exit(res.returncode)
