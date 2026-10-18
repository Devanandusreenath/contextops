"""Frontend response-schema compatibility (mirrors src/types/index.ts) and basic security checks."""
from app.tests.conftest import make_api, make_settings, scenario_payload

ENTITY = {"Service", "Dataset", "Pipeline", "Incident", "Person", "Team", "Decision", "Document", "Fix", "Verification Test", "Project"}
SEV = {"SEV1", "SEV2", "SEV3"}
STATUS = {"Investigating", "Mitigated", "Resolved", "Open"}
MKIND = {"Past incident", "Observation", "Verified resolution", "Decision", "Knowledge conflict"}
VALID = {"Valid", "Verified", "Needs review", "Superseded"}
ECAT = {"Observed fact", "Agent hypothesis", "Proposed action", "Tested result"}
ESTATE = {"Verified", "Unverified", "Proposed", "Test passed", "Test failed", "Requires approval"}


def keys(d, required, optional=()):
    assert set(required) <= set(d), f"missing {set(required) - set(d)}"


def test_graph_matches_GraphNode_GraphEdge(api):
    j = api.get("/api/graph").json()
    for n in j["nodes"]:
        keys(n, ["id", "label", "type", "description", "x", "y"])
        assert n["type"] in ENTITY and isinstance(n["x"], (int, float)) and isinstance(n["y"], (int, float))
        assert n.get("evidence") is None or all(isinstance(e, str) for e in n["evidence"])
    ids = {n["id"] for n in j["nodes"]}
    for e in j["edges"]:
        keys(e, ["id", "source", "target", "type"])
        assert e["source"] in ids and e["target"] in ids                    # no dangling edges in the default view
    assert not any(n["id"].startswith(("EV-", "M-", "task-")) for n in j["nodes"])


def test_incident_memory_evidence_scenario_shapes(api):
    for i in api.get("/api/incidents").json():
        keys(i, ["id", "nodeId", "title", "system", "severity", "status", "updated"]); assert i["severity"] in SEV and i["status"] in STATUS
    for m in api.get("/api/memory").json():
        keys(m, ["id", "kind", "title", "summary", "source", "nodeIds", "created", "updated", "validity"])
        assert m["kind"] in MKIND and m["validity"] in VALID and isinstance(m["nodeIds"], list)
    for e in api.get("/api/evidence").json():
        keys(e, ["id", "claim", "category", "source", "relationship", "incidentId", "state", "timestamp", "rationale"])
        assert e["category"] in ECAT and e["state"] in ESTATE
    for s in api.get("/api/scenarios").json():
        keys(s, ["id", "name", "description", "logs"])
    p = api.get("/api/graph/failure-path").json(); keys(p, ["nodeIds", "edgeIds"])
    o = api.get("/api/graph/overview").json(); keys(o, ["layout", "edges"])
    assert all({"x", "y"} <= set(v) for v in o["layout"].values())


def test_step_and_run_shapes_after_investigation(api):
    j = api.post("/api/investigations/run", json=scenario_payload(api)).json()
    for s in j["steps"]:
        keys(s, ["id", "title", "detail"]); assert s.get("diagnostics") is None or isinstance(s["diagnostics"], list)
    for e in j["evidence"]:
        assert e["category"] in ECAT and e["state"] in ESTATE
    for m in j["relevantMemory"]:
        assert m["kind"] in MKIND and m["validity"] in VALID
    for k in ["investigationId", "executionMode", "steps", "graphQueriesUsed", "evidence", "affectedNodes", "relevantMemory", "rootCause",
              "proposedCorrection", "verification", "remainingUncertainty", "recommendedNextAction", "failurePath", "evidencePath"]:
        assert k in j


def test_no_arbitrary_query_endpoint(api):
    paths = [p.lower() for p in api.get("/openapi.json").json()["paths"]]
    assert len(paths) >= 20
    assert not any("cypher" in p or p.endswith("/query") or "/exec" in p for p in paths)
    assert api.post("/api/graph/query", json={"query": "MATCH (n) RETURN n"}).status_code in (404, 405)


def test_cors_allows_local_frontend_only(api):
    ok = api.get("/api/health", headers={"Origin": "http://localhost:3000"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:3000"
    bad = api.get("/api/health", headers={"Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in bad.headers


def test_errors_do_not_leak_internals(api):
    r = api.get("/api/graph/nodes/..%2F..%2Fetc")
    assert r.status_code in (404, 422) and "Traceback" not in r.text


def test_db_unavailable_returns_503_not_stacktrace():
    s = make_settings(falkordb_port=1, auto_seed=False)
    with make_api(s) as c:
        assert c.get("/api/health").status_code == 200
        assert c.get("/api/health/ready").status_code == 503
        r = c.get("/api/graph")
        assert r.status_code == 503 and r.json()["error"]["code"] == "graph_unavailable"
        assert c.get("/api/integrations/status").json()["falkordb"]["connected"] is False
