import json
import time

from app.api.deps import Container
from app.graph.client import GraphClient
from app.graph.repository import GraphRepository
from app.tests.conftest import make_api, make_settings, scenario_payload


def run(api, scenario="field-rename", **kw):
    r = api.post("/api/investigations/run", json={**scenario_payload(api, scenario), **kw})
    assert r.status_code == 200, r.text
    return r.json()


# ------------------------------------------------------------------ validation
def test_validation_errors_are_structured(api):
    good = scenario_payload(api)
    for bad in ({**good, "description": "short"}, {**good, "logs": ""}, {**good, "scenarioId": "../etc"},
                {**good, "logs": "x" * 20001}, {**good, "logs": "a\x00b"}, {"scenarioId": "field-rename"}):
        r = api.post("/api/investigations/run", json=bad)
        assert r.status_code == 422, bad.keys()
        assert r.json()["error"]["code"] == "validation_error" and "Traceback" not in r.text
    r = api.post("/api/investigations/run", json={**good, "scenarioId": "does-not-exist"})
    assert r.status_code == 404 and r.json()["error"]["code"] == "not_found"


def test_oversized_body_rejected(api):
    r = api.post("/api/investigations/run", content=b"x" * 70_000, headers={"content-type": "application/json"})
    assert r.status_code == 413


# ------------------------------------------------------------------ main flow
def test_field_rename_investigation(api):
    j = run(api)
    assert j["executionMode"] == "rules" and j["requestedMode"] == "rules" and j.get("llmModel") is None
    assert "LLM request failed" not in (j.get("fallbackReason") or "")
    assert j["syntheticData"] is True and j["humanApprovalRequired"] is True
    tools = [s["tool"] for s in j["steps"]]
    assert tools[:2] == ["resolve_entities", "trace_dependency_path"] and "replay_historical_fix" in tools
    assert j["failurePath"]["nodeIds"][0] == "svc-event" and j["failurePath"]["nodeIds"][-1] == "inc-2041"
    assert j["rootCause"]["status"] == "hypothesis" and j["rootCause"]["supportLevel"] in ("strong", "moderate")
    assert "amount_cents" in j["rootCause"]["summary"] and "amount_minor" in j["rootCause"]["summary"]
    assert j["proposedCorrection"]["requiresHumanApproval"] is True
    assert {e["category"] for e in j["evidence"]} == {"Observed fact", "Agent hypothesis", "Proposed action", "Tested result"}
    q = {x["name"] for x in j["graphQueriesUsed"]}
    assert {"dependency_chain", "impact_hop", "upstream_hop", "related_incidents", "historical_resolution", "stale_memory"} <= q
    impacts = {a["nodeId"]: a["impact"] for a in j["affectedNodes"]}
    assert impacts["rep-finance"] == "confirmed" and impacts["ds-usage"] == "no_evidence_of_impact"


def test_verification_is_real_and_not_overclaimed(api):
    j = run(api)
    v = j["verification"]
    assert v["status"] == "partially_verified"      # backfill dry-run really fails on 3 null records
    by_key = {t["key"]: t for t in v["tests"]}
    assert by_key["contract_billing_schema"]["result"] == "passed" and by_key["contract_billing_schema"]["total"] == 12
    assert by_key["backfill_dry_run"]["result"] == "failed" and by_key["backfill_dry_run"]["passed"] < by_key["backfill_dry_run"]["total"]
    assert any("None" in a["detail"] for a in by_key["backfill_dry_run"]["assertions"] if not a["passed"])
    assert j["outcome"] == "partially_verified" and v["unresolved"]
    assert "Do not apply" in j["recommendedNextAction"]
    assert not any(e["state"] == "Verified" and e["category"] == "Tested result" for e in j["evidence"])


def test_test_outcomes_are_recorded_in_graph(api, repo):
    run(api)
    c, b = repo.get_node("test-contract"), repo.get_node("test-backfill")
    assert (c["last_result"], c["last_passed"], c["last_total"]) == ("passed", 12, 12)
    assert b["last_result"] == "failed" and b["last_passed"] < b["last_total"]
    assert repo.get_node("fix-2041")["verification_status"] == "partial"


# ------------------------------------------------------------------ handoff through the graph
def test_agent_state_handoff_via_falkordb(api, repo):
    j = run(api)
    iid = j["investigationId"]
    tasks = {t["role"]: t for t in api.get(f"/api/agent-tasks?investigationId={iid}").json()}
    assert tasks["investigator"]["status"] == "completed" and tasks["verifier"]["status"] == "completed"
    rb = j["verification"]["readBack"]
    assert rb["investigatorTask"] == f"task-{iid}-investigator" and rb["proposalFound"] is True
    assert rb["fix"] == "fix-2041" and set(rb["tests"]) == {"test-contract", "test-backfill"} and rb["approver"] == "Arjun Rao"
    hs = repo.handoff_state(f"task-{iid}-verifier")
    assert hs["investigatorTask"]["id"] == f"task-{iid}-investigator" and json.loads(hs["fix"]["proposal_json"])["patch"][0]["source"] == "amount_minor"
    trace = api.get(f"/api/investigations/{iid}/trace").json()
    assert any(s["agent"] == "verifier" and s["tool"] == "read_handoff_state" and s["queries"] for s in trace["steps"])
    assert any(s["agent"] == "investigator" and s["queries"] and "MATCH" in s["queries"][0]["cypher"] for s in trace["steps"])


def test_verifier_blocks_without_investigator_proposal(api, repo):
    from app.agents.verifier import VerificationAgent
    j = run(api, autoVerify=False)
    iid = j["investigationId"]
    assert j["outcome"] == "awaiting_verification" and j.get("verification") is None
    repo.set_props("fix-2041", {"proposal_json": ""})        # simulate missing state in the graph
    v, _ = VerificationAgent(repo).verify(iid, [])
    assert v["status"] == "blocked"
    v2, _ = VerificationAgent(repo).verify("inv-00000000", [])
    assert v2["status"] == "blocked"


def test_separate_verify_endpoint(api):
    j = run(api, autoVerify=False)
    r = api.post(f"/api/investigations/{j['investigationId']}/verify")
    assert r.status_code == 200 and r.json()["verification"]["status"] == "partially_verified"
    assert api.get(f"/api/investigations/{j['investigationId']}").json()["outcome"] == "partially_verified"


# ------------------------------------------------------------------ memory persistence + drift
def test_memory_persists_across_sessions(api, repo):
    first = run(api)
    mem_ids_before = {m["id"] for m in api.get("/api/memory").json()}
    # a completely new application instance / graph client = a new session
    s = make_settings()
    api2 = make_api(s)
    with api2:
        persisted = [m for m in api2.get("/api/memory").json() if m["origin"] == "agent"]
        assert any("not fully verified" in m["title"] for m in persisted)
        second = run(api2)
    recalled = [m for m in second["relevantMemory"] if m["recalledFromPriorSession"]]
    assert recalled and any(first["investigationId"] == m["investigationId"] for m in recalled)
    assert any("Carried over from memory" in u for u in second["remainingUncertainty"])
    assert len([m for m in api.get("/api/memory").json() if m["origin"] == "agent"]) == len([m for m in persisted])  # no duplicates on re-run


def test_context_drift_guard_flags_historical_fix(api):
    j = run(api)
    d = j["driftFindings"][0]
    assert d["historicalIncidentId"] == "INC-1873" and d["verdict"] == "requires_revalidation"
    res = {c["name"]: c["result"] for c in d["checks"]}
    assert res["fix scope vs current change"] == "fail" and res["replay historical mapping on current events"] == "fail"
    assert res["schema version"] == "warn" and "M-101" in d["staleMemoryIds"]
    ev = [e for e in j["evidence"] if e["claim"].startswith("Replaying historical fix")]
    assert ev and ev[0]["state"] == "Test failed"
    mem = {m["id"]: m for m in api.get("/api/memory").json()}
    assert mem["M-101"]["validity"] == "Needs review" and "svc-event" in mem["M-101"]["driftReason"]
    assert any(m["kind"] == "Knowledge conflict" and m["origin"] == "agent" for m in mem.values())
    assert any(r["incidentId"] == "INC-2030" and r["rankScore"] < 5 for r in j["relatedIncidents"])  # not blindly reused


def test_new_release_makes_verified_memory_stale(api):
    run(api)
    before = {m["id"]: m for m in api.get("/api/memory").json()}
    outcome = next(m for m in before.values() if m["origin"] == "agent" and m["title"].startswith("Proposed fix"))
    assert outcome["validity"] in ("Valid", "Verified") and not outcome.get("driftReason")
    time.sleep(1.2)   # timestamps have 1 s resolution; a release must be strictly newer than the memory
    r = api.post("/api/demo/simulate-release", json={"serviceId": "svc-event", "version": "4.3",
                                                     "renamedFields": [{"from": "amount_minor", "to": "amount_total_minor"}]})
    assert r.status_code == 200
    j = run(api)
    assert outcome["id"] in [m["id"] for m in j["relevantMemory"]]
    after = {m["id"]: m for m in api.get("/api/memory").json()}
    assert after[outcome["id"]]["validity"] == "Needs review"
    assert "v4_3" in after[outcome["id"]]["driftReason"] or "doc-changelog" in after[outcome["id"]]["driftReason"]
    # a human can re-validate it explicitly
    ok = api.post(f"/api/memory/{outcome['id']}/review", json={"decision": "confirm_valid", "note": "re-checked"}).json()
    assert ok["validity"] in ("Valid", "Verified")


def test_memory_review_endpoint(api):
    r = api.post("/api/memory/M-103/review", json={"decision": "superseded", "note": "runbook updated"})
    assert r.status_code == 200 and r.json()["validity"] == "Superseded"
    assert api.post("/api/memory/M-103/review", json={"decision": "bad"}).status_code == 422
    assert api.post("/api/memory/M-9999/review", json={"decision": "needs_review"}).status_code == 404


# ------------------------------------------------------------------ adaptive tool selection
def test_tool_selection_depends_on_evidence(api):
    a = [s["tool"] for s in run(api)["steps"]]
    g = run(api, "gateway-5xx")
    b = [s["tool"] for s in g["steps"]]
    assert a != b and "replay_historical_fix" not in b
    assert g["outcome"] == "inconclusive" and g["rootCause"]["status"] == "inconclusive"
    assert g.get("proposedCorrection") is None and g.get("verification") is None
    assert "causal link NOT established" in " ".join(s["detail"] for s in g["steps"])
    assert not any(e["category"] == "Tested result" for e in g["evidence"])


def test_edited_logs_change_the_path(api):
    p = scenario_payload(api)
    p["logs"] = "02:21:03 finance-etl run #3301 stage=normalize status=FAILED\n02:20:11 normalizer ERROR something else broke"
    j = api.post("/api/investigations/run", json=p).json()
    assert j.get("proposedCorrection") is None and j["outcome"] == "inconclusive"   # no schema evidence in the logs -> no fabricated fix


def test_list_get_and_steps_endpoints(api):
    j = run(api)
    iid = j["investigationId"]
    assert api.get("/api/investigations").json()[0]["investigationId"] == iid
    assert api.get(f"/api/investigations/{iid}").json()["investigationId"] == iid
    assert api.get("/api/investigations/inv-00000000").status_code == 404
    assert api.get("/api/investigations/bad id").status_code in (404, 422)
    assert len(api.get("/api/investigation/steps").json()) == len(j["steps"])
    assert len(api.get("/api/activity").json()) >= 3
    ev = api.get("/api/evidence").json()
    assert {e["id"] for e in ev} >= {"EV-1", "EV-2", "EV-4"} and len({e["id"] for e in ev}) == len(ev)
