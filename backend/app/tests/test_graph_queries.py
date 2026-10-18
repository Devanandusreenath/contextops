def test_multi_hop_dependency_discovery(repo):
    chains = repo.dependency_chain("pipe-finance", 4)
    assert max(chains, key=lambda c: len(c["nodeIds"]))["nodeIds"] == ["pipe-finance", "svc-normalizer", "svc-event"]
    down = repo.bfs("down", ["svc-event"], 6)
    assert down["nodes"]["rep-finance"]["depth"] == 4
    nids, rids = repo.path_to(down, "rep-finance")
    assert nids == ["svc-event", "svc-normalizer", "pipe-finance", "ds-billing", "rep-finance"] and rids == ["e3", "e5", "e6", "e7"]


def test_traversal_depth_is_bounded(repo):
    assert "rep-finance" not in repo.bfs("down", ["svc-event"], 2)["nodes"]
    assert max(v["depth"] for v in repo.bfs("down", ["svc-event"], 99)["nodes"].values()) <= 6


def test_failure_path_derived_from_graph(api):
    p = api.get("/api/graph/failure-path").json()
    assert p["nodeIds"] == ["svc-event", "svc-normalizer", "pipe-finance", "ds-billing", "rep-finance", "inc-2041"]
    assert set(p["edgeIds"]) == {"e3", "e5", "e6", "e7", "e9", "e10"}


def test_demo_path_extends_failure_path_with_precedent_fix_and_test(api):
    p = api.get("/api/graph/demo-path").json()
    for n in ("inc-1873", "fix-1873", "fix-2041", "test-contract"):
        assert n in p["nodeIds"]
    assert {"e13", "e12", "e14", "e15", "e27"} <= set(p["edgeIds"])


def test_historical_incident_retrieval_ranks_pattern_match_first(repo):
    cands = repo.related_incidents(["svc-normalizer", "pipe-finance", "svc-event"], "inc-2041")
    assert {c["incident"]["id"] for c in cands} == {"inc-1873", "inc-2030"}
    h = repo.historical_resolution("inc-1873")
    assert h["fix"]["id"] == "fix-1873" and h["tests"][0]["id"] == "test-contract-1873" and h["documents"][0]["id"] == "doc-pm-1873"


def test_owners_and_decisions(repo):
    owners = {o["nodeId"]: o["owner"]["name"] for o in repo.owners(["svc-event", "inc-2041"])}
    assert owners == {"svc-event": "Platform Team", "inc-2041": "Arjun Rao"}
    assert "dec-schema" in {d["decision"]["id"] for d in repo.decisions(["svc-event"])}


def test_stale_memory_detected_via_dependency_change(clean):
    stale = {s["memoryId"] for s in clean.stale_memory()}
    assert "M-101" in stale and "M-105" not in stale and "M-104" not in stale


def test_overview_matches_frontend_layout(api):
    o = api.get("/api/graph/overview").json()
    assert set(o["layout"]) == {"svc-event", "svc-normalizer", "pipe-finance", "ds-billing", "rep-finance", "team-platform", "inc-1873", "fix-1873", "inc-2041"}
    assert {e["id"] for e in o["edges"]} == {"e3", "e5", "e6", "e7", "e9", "e10", "e11", "e12", "e13", "e16"}
    assert set(o["metrics"]) == {"activeIncidents", "connectedSystems", "verifiedResolutions", "knowledgeConflicts"}


def test_neighbors_and_node_endpoints(api):
    n = api.get("/api/graph/nodes/svc-event").json()
    assert n["type"] == "Service" and n["label"] == "Event Service"
    nb = api.get("/api/graph/nodes/svc-event/neighbors").json()
    assert {x["node"]["id"] for x in nb} >= {"svc-gateway", "svc-normalizer", "ds-raw-events", "team-platform", "p-maya", "doc-changelog"}
    assert api.get("/api/graph/nodes/nope").status_code == 404
    assert api.get("/api/graph/nodes/M-101").status_code == 404   # Memory nodes are not exposed as graph entities
