"""Verification Agent. Input: an investigation id ONLY. Everything else is read back from FalkorDB
(the state the Investigator wrote), then deterministic registered tests are executed locally and the
outcome is written back to the graph. No LLM is involved in deciding pass/fail."""
from __future__ import annotations

import json
import time

from app.agents.assessment import now_display, now_iso
from app.agents.pipeline_sim import BASELINE_FIELD_MAP, TEST_REGISTRY, apply_mapping_patch, run_registered_test
from app.graph import repository as R
from app.graph.repository import GraphRepository
from app.services.persistence import upsert_evidence


class VerificationAgent:
    def __init__(self, repo: GraphRepository):
        self.repo = repo

    def verify(self, investigation_id: str, log: list) -> tuple[dict, list[dict]]:
        repo = self.repo
        trace: list[dict] = []
        t0, n0 = time.perf_counter(), len(log)
        vtask_id = f"task-{investigation_id}-verifier"
        hs = repo.handoff_state(vtask_id)
        read_back: dict = {}

        def rec(tool, reason, summary, nodes=()):
            qs = log[n0:] if not trace else []
            trace.append({"index": 1000 + len(trace), "agent": "verifier", "tool": tool, "reason": reason, "arguments": {"investigationId": investigation_id},
                          "resultSummary": summary, "nodeIds": list(nodes), "edgeIds": [],
                          "queries": [{"name": q["name"], "cypher": q["cypher"], "params": q["params"], "write": q["write"],
                                       "rowCount": q["rowCount"], "durationMs": q["durationMs"]} for q in qs],
                          "durationMs": round((time.perf_counter() - t0) * 1000, 1)})

        if hs is None:
            rec("read_handoff_state", "Read the verifier task and linked investigation state from the graph.",
                "No verifier task found in the graph for this investigation.")
            return self._result("blocked", "No verifier task exists in the graph for this investigation.", [], [], read_back), trace
        fix, tests, inv_task = hs["fix"], hs["tests"], hs["investigatorTask"]
        read_back = {
            "verifierTask": hs["verifierTask"]["id"],
            "investigatorTask": inv_task and inv_task["id"],
            "investigatorStatus": inv_task and inv_task.get("status"),
            "incident": hs["incident"] and hs["incident"]["id"],
            "fix": fix and fix["id"],
            "proposalFound": bool(fix and fix.get("proposal_json")),
            "tests": [t["id"] for t in tests],
            "evidenceIds": [e["id"] for e in hs["evidence"]],
            "approver": hs["approver"] and hs["approver"]["name"],
        }
        rec("read_handoff_state", "Read what the Investigator Agent wrote to FalkorDB (task, fix proposal, tests, evidence).",
            f"Read from graph: fix={read_back['fix']}, proposal present={read_back['proposalFound']}, tests={read_back['tests']}, "
            f"evidence={read_back['evidenceIds']}, written by {read_back['investigatorTask']} (status {read_back['investigatorStatus']}).",
            [x for x in [read_back["fix"], *read_back["tests"]] if x])

        if not inv_task or inv_task.get("status") != "completed":
            return self._result("blocked", "The Investigator Agent has not completed; nothing to verify.", [], [], read_back), trace
        if not fix or not fix.get("proposal_json"):
            self._finish_task(vtask_id, "blocked", "No proposed correction found in the graph.")
            return self._result("blocked", "No proposed correction was found in the graph for this investigation.", [], [], read_back), trace

        proposal = json.loads(fix["proposal_json"])
        candidate = apply_mapping_patch(BASELINE_FIELD_MAP, proposal["patch"])
        results, unresolved = [], []
        now = now_iso()
        inc_node = hs["incident"]["id"]
        inc_display = hs["incident"]["name"]
        existing = repo.evidence_for_incident(inc_display)
        ev_ids = []
        for t in sorted(tests, key=lambda x: x["id"]):
            key = t.get("test_key")
            ts = time.perf_counter()
            if key not in TEST_REGISTRY:
                results.append({"testId": t["id"], "name": t["name"], "key": key or "", "result": "not_run", "passed": 0, "total": 0, "assertions": []})
                unresolved.append(f"{t['name']}: no registered deterministic test for key '{key}'.")
                continue
            out = run_registered_test(key, candidate)
            assertions = [a.__dict__ for a in out.assertions]
            results.append({"testId": t["id"], "name": t["name"], "key": key, "result": "passed" if out.ok else "failed",
                            "passed": out.passed, "total": out.total, "assertions": assertions})
            failed = [a for a in assertions if not a["passed"]]
            if len(failed) > 2:
                unresolved.append(f"{t['name']}: {len(failed)} of {out.total} assertions failed (e.g. '{failed[0]['name']}': {failed[0]['detail']})")
            else:
                for a in failed:
                    unresolved.append(f"{t['name']}: {a['name']} - {a['detail']}")
            repo.set_props(t["id"], {"last_result": "passed" if out.ok else "failed", "last_run_at": now, "last_passed": out.passed,
                                     "last_total": out.total, "last_investigation_id": investigation_id,
                                     "verification_status": "verified" if out.ok else "failed", "updated_at": now,
                                     "result_provenance": "executed by ContextOps verification agent (synthetic fixtures)"})
            claim = (f"{t['name']}: {out.passed}/{out.total} assertions passed with the proposed mapping."
                     if out.ok else f"{t['name']}: {out.passed}/{out.total} assertions passed; {len(failed)} failed.")
            eid = upsert_evidence(repo, inc_display, inc_node, dict(
                fingerprint=f"{inc_node}|tested|{t['id']}", category="Tested result", state="Test passed" if out.ok else "Test failed",
                claim=claim, source=f"Deterministic test '{key}'", relationship=f"{fix['id']} -VERIFIED_BY→ {t['id']}",
                rationale=("All assertions held on synthetic fixtures." if out.ok else "; ".join(a["detail"] for a in failed)[:300]),
                node_ids=[fix["id"], t["id"]], observed_at=now, timestamp=now_display(), details_json=json.dumps(assertions),
                confidence_rationale="Executed locally; result is from real assertions, not model judgement."), investigation_id, existing)
            ev_ids.append(eid)
            repo.upsert_edge("SUPPORTED_BY", f"sb-{fix['id']}-{eid}", fix["id"], eid, {"created_at": now, "origin": "agent"})
            trace.append({"index": 1000 + len(trace), "agent": "verifier", "tool": f"run_test:{key}", "reason": "Run registered deterministic test linked to the fix by VERIFIED_BY.",
                          "arguments": {"testId": t["id"]}, "resultSummary": claim, "nodeIds": [t["id"]], "edgeIds": [], "queries": [],
                          "durationMs": round((time.perf_counter() - ts) * 1000, 1)})
        ran = [r for r in results if r["result"] != "not_run"]
        if not ran:
            status = "not_run"
        elif all(r["result"] == "passed" for r in ran) and len(ran) == len(results):
            status = "verified"
        elif any(r["result"] == "passed" for r in ran):
            status = "partially_verified"
        else:
            status = "failed"
        pa, ta = sum(r["passed"] for r in results), sum(r["total"] for r in results)
        summary = {"verified": f"All {len(results)} test(s) passed ({pa}/{ta} assertions).",
                   "partially_verified": f"{sum(r['result']=='passed' for r in results)} of {len(results)} test(s) passed ({pa}/{ta} assertions); the fix is NOT fully verified.",
                   "failed": f"No test passed ({pa}/{ta} assertions).", "not_run": "No registered test could be run."}[status]
        repo.set_props(fix["id"], {"verification_status": {"verified": "verified", "partially_verified": "partial", "failed": "failed", "not_run": "unverified"}[status],
                                   "status": "proposed", "last_verified_at": now, "last_investigation_id": investigation_id, "updated_at": now})
        self._finish_task(vtask_id, "completed", summary, status)
        rec("write_verification_state", "Persist test outcomes, evidence and verification status to the graph.",
            f"{summary} Wrote evidence {ev_ids} and updated {fix['id']}.", [fix["id"], *ev_ids])
        res = self._result(status, summary, results, unresolved, read_back)
        res["evidenceIds"] = ev_ids
        return res, trace

    def _finish_task(self, task_id: str, status: str, summary: str, outcome: str | None = None) -> None:
        self.repo.set_props(task_id, {"status": status, "finished_at": now_iso(), "summary": summary, "outcome": outcome, "updated_at": now_iso()})

    @staticmethod
    def _result(status: str, summary: str, tests: list, unresolved: list, read_back: dict) -> dict:
        return {"status": status, "summary": summary, "tests": tests,
                "passedAssertions": sum(t["passed"] for t in tests), "totalAssertions": sum(t["total"] for t in tests),
                "unresolved": unresolved, "readBack": read_back}
