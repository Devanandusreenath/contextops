"""Minimal smoke test against a RUNNING backend.   python scripts/smoke_test.py [http://localhost:8000]
Checks: API health, FalkorDB readiness, seed data, graph path, and the main investigation flow."""
import sys

import httpx

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/")
fails = 0


def check(name, cond, detail=""):
    global fails
    print(("PASS" if cond else "FAIL"), "-", name, detail)
    fails += 0 if cond else 1


c = httpx.Client(base_url=BASE, timeout=60)
try:
    h = c.get("/api/health")
except httpx.HTTPError as e:
    sys.exit(f"FAIL - backend not reachable at {BASE}: {e.__class__.__name__}")
check("GET /api/health", h.status_code == 200)
r = c.get("/api/health/ready"); check("GET /api/health/ready (FalkorDB + seed)", r.status_code == 200, r.text[:120])
g = c.get("/api/graph").json(); check("graph has nodes/edges", len(g["nodes"]) >= 25 and len(g["edges"]) >= 35, f"{len(g['nodes'])} nodes, {len(g['edges'])} edges")
check("seed ids present", {"svc-event", "inc-2041", "fix-1873"} <= {n["id"] for n in g["nodes"]})
fp = c.get("/api/graph/failure-path").json(); check("failure path derived from graph", fp["nodeIds"][:1] == ["svc-event"] and fp["nodeIds"][-1] == "inc-2041", str(fp["nodeIds"]))
sc = next(s for s in c.get("/api/scenarios").json() if s["id"] == "field-rename")
run = c.post("/api/investigations/run", json={"scenarioId": sc["id"], "description": sc["description"], "logs": sc["logs"]})
check("POST /api/investigations/run", run.status_code == 200, run.text[:160] if run.status_code != 200 else "")
if run.status_code == 200:
    j = run.json()
    check("execution mode reported", j["executionMode"] in ("rules", "llm"), f"mode={j['executionMode']} fallback={j.get('fallbackReason')}")
    check("steps + queries recorded", len(j["steps"]) >= 6 and len(j["graphQueriesUsed"]) >= 5)
    check("drift verdict present", bool(j["driftFindings"]), j["driftFindings"][0]["verdict"] if j["driftFindings"] else "")
    v = j.get("verification"); check("verification really ran", v is not None and v["totalAssertions"] > 0, f"{v['status']} {v['passedAssertions']}/{v['totalAssertions']}")
    check("trace retrievable", c.get(f"/api/investigations/{j['investigationId']}/trace").status_code == 200)
    check("memory persisted", any(m["origin"] == "agent" for m in c.get("/api/memory").json()))
print("\nRESULT:", "ALL PASSED" if fails == 0 else f"{fails} FAILED")
sys.exit(1 if fails else 0)
