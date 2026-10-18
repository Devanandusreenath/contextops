from app.graph import queries as Q
from app.graph.seed import seed_graph


def test_health(api):
    r = api.get("/api/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_ready_reports_falkordb_and_seed(api):
    r = api.get("/api/health/ready")
    assert r.status_code == 200
    j = r.json()
    assert j["falkordb"] is True and j["seeded"] is True and j["nodes"] >= 39 and j["edges"] >= 68


def test_integration_status_has_no_secrets(api):
    j = api.get("/api/integrations/status").json()
    text = str(j).lower()
    assert j["falkordb"]["connected"] and j["agent"]["effectiveMode"] == "rules" and j["agent"]["llmConfigured"] is False
    assert "api_key" not in text and "sk-" not in text and "password" not in text
    assert None not in j["agent"].values()          # None fields are omitted from the JSON contract


def test_falkordb_connectivity(repo):
    assert repo.client.ping()
    assert repo.counts()["Incident"] == 5


def test_seed_is_idempotent(repo):
    before = (repo.counts(), repo.edge_count())
    seed_graph(repo)
    seed_graph(repo)
    assert (repo.counts(), repo.edge_count()) == before


def test_no_duplicate_ids(repo):
    for label in ("Service", "Incident", "Fix", "Memory"):
        rows = repo._run("dup", f"MATCH (n:{label}) RETURN n.id, count(n) AS c")
        assert all(c == 1 for _, c in rows)


def test_frontend_ids_and_relationship_directions_preserved(repo):
    nodes, edges = repo.graph_view()
    ids = {n["id"] for n in nodes}
    for must in ["svc-event", "svc-normalizer", "pipe-finance", "ds-billing", "rep-finance", "inc-2041", "inc-1873", "fix-1873", "fix-2041"]:
        assert must in ids
    by_id = {e["id"]: e for e in edges}
    for i in range(1, 29):
        assert f"e{i}" in by_id, f"edge e{i} missing"
    assert (by_id["e3"]["source"], by_id["e3"]["target"], by_id["e3"]["type"]) == ("svc-normalizer", "svc-event", "DEPENDS_ON")
    assert (by_id["e6"]["source"], by_id["e6"]["target"], by_id["e6"]["type"]) == ("pipe-finance", "ds-billing", "PRODUCES")
    assert (by_id["e9"]["source"], by_id["e9"]["target"], by_id["e9"]["type"]) == ("rep-finance", "inc-2041", "AFFECTED_BY")


def test_relationship_integrity(repo):
    nodes, edges = repo.graph_view(Q.NODE_LABELS)
    ids = {n["id"] for n in nodes}
    assert all(e["source"] in ids and e["target"] in ids for e in edges)
    assert {e["type"] for e in edges} <= set(Q.REL_TYPES)
    assert len({e["id"] for e in edges}) == len(edges)


def test_all_required_node_types_present(repo):
    assert set(repo.counts()) >= set(Q.NODE_LABELS) - {"AgentTask"}   # AgentTask nodes appear after the first run


def test_temporal_and_provenance_metadata(repo):
    n = repo.get_node("inc-2041")
    for k in ("created_at", "updated_at", "observed_at", "valid_from", "validity_status", "source_reference", "verification_status"):
        assert k in n, k


def test_label_allowlist_blocks_injection():
    import pytest
    with pytest.raises(ValueError):
        Q.q_upsert_node("Service) DETACH DELETE (n")
    with pytest.raises(ValueError):
        Q.q_upsert_edge("DEPENDS_ON]->() DELETE r //")
