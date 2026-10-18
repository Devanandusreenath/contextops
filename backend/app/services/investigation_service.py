"""Orchestrates one investigation: Investigator Agent -> graph handoff -> Verification Agent."""
from __future__ import annotations

import json
import uuid
from collections import OrderedDict

from app.agents import investigator as inv
from app.agents.assessment import assess, evidence_drafts, diff_lines, now_display, now_iso
from app.agents.llm import ChatClient, LLMError, make_chat_client
from app.agents.state import InvState
from app.agents.verifier import VerificationAgent
from app.config import Settings
from app.graph import repository as R
from app.graph.repository import GraphRepository
from app.models.api import InvestigationRun, InvestigationTrace, RunRequest
from app.services import mappers
from app.services.persistence import upsert_evidence, upsert_memory


class NotFound(Exception):
    pass


class ModeUnavailable(Exception):
    pass


class InvestigationFailed(Exception):
    def __init__(self, message: str, investigation_id: str, code: str = "llm_failed"):
        super().__init__(message)
        self.investigation_id, self.code = investigation_id, code


def decide_mode(settings: Settings) -> tuple[str, str, str | None]:
    """(requested, effective, fallback_reason). Never claims LLM without credentials."""
    req = settings.agent_mode
    if req == "rules":
        return req, "rules", None
    if req == "llm":
        if not settings.llm_configured:
            raise ModeUnavailable("AGENT_MODE=llm but no LLM key is configured (set GEMINI_API_KEY or OPENAI_API_KEY), or use AGENT_MODE=rules/auto.")
        return req, "llm", None
    if settings.llm_configured:
        return req, "llm", None
    return req, "rules", "AGENT_MODE=auto and no LLM API key is configured; deterministic rules were used."


class InvestigationService:
    def __init__(self, repo: GraphRepository, settings: Settings, chat_client: ChatClient | None = None):
        self.repo, self.settings = repo, settings
        self._chat_client = chat_client

    # ------------------------------------------------------------------ run
    def run(self, req: RunRequest) -> InvestigationRun:
        repo, settings = self.repo, self.settings
        requested, effective, fallback = decide_mode(settings)
        scen = next((s for s in repo.scenarios() if s["scenario_id"] == req.scenario_id), None)
        if not scen:
            raise NotFound(f"Unknown scenario '{req.scenario_id}'")
        inv_id = "inv-" + uuid.uuid4().hex[:8]
        started = now_iso()
        log = R.start_query_recording()
        try:
            st = InvState(incident_node_id=scen["id"], incident=scen, description=req.description, logs=req.logs)
            llm_model = None
            try:
                if effective == "llm":
                    client = self._chat_client or make_chat_client(settings)
                    res = inv.run_llm(repo, st, log, client, settings.llm_max_steps)
                    llm_model = settings.llm_model
                else:
                    res = inv.run_rules(repo, st, log)
            except LLMError as exc:
                if requested == "auto":      # documented fallback; labelled in the response
                    fallback = f"LLM request failed ({exc}); deterministic rules were used instead."
                    effective, llm_model = "rules", None
                    log.clear()
                    st = InvState(incident_node_id=scen["id"], incident=scen, description=req.description, logs=req.logs)
                    res = inv.run_rules(repo, st, log)
                else:
                    self._write_failed_task(inv_id, scen, started, str(exc), requested)
                    raise InvestigationFailed(str(exc), inv_id) from None

            a = assess(st)
            if res.narrative and res.narrative.get("root_cause_summary"):
                a["rootCause"]["summary"] = res.narrative["root_cause_summary"]
                a["rootCause"]["authoredBy"] = "llm"
                a["uncertainty"] += res.narrative.get("remaining_uncertainty", [])
            run = self._persist_and_verify(req, inv_id, started, scen, st, res, a, log, requested, effective, fallback, llm_model)
        finally:
            R.stop_query_recording()
        return run

    # ------------------------------------------------------------------ persistence of investigator output
    def _persist_and_verify(self, req, inv_id, started, scen, st: InvState, res, a, log, requested, effective, fallback, llm_model):
        repo = self.repo
        inc_node, inc_name = scen["id"], scen["name"]
        existing = repo.evidence_for_incident(inc_name)
        ev_ids = [upsert_evidence(repo, inc_name, inc_node, d, inv_id, existing) for d in evidence_drafts(st, a)]
        ev_ids = list(OrderedDict.fromkeys(ev_ids))

        approver = next((o["owner"] for o in st.owners if o["nodeId"] == inc_node and o["owner"]["_label"] == "Person"), None)
        proposal, fix_id = a["proposal"], None
        if proposal:
            fix_id = self._write_fix(inc_node, inc_name, inv_id, proposal, ev_ids)
        base = f"task-{inv_id}"
        now = now_iso()
        repo.upsert_node("AgentTask", f"{base}-investigator", dict(
            investigation_id=inv_id, role="investigator", status="completed", incident_id=inc_name, mode=effective, requested_mode=requested,
            created_at=started, updated_at=now, finished_at=now, observed_at=now, valid_from=now, validity_status="current",
            verification_status="unverified", source_reference="investigator agent", origin="agent", synthetic=True,
            name=f"Investigator task {inv_id}", summary=a["rootCause"]["summary"][:500]))
        repo.upsert_node("AgentTask", f"{base}-verifier", dict(
            investigation_id=inv_id, role="verifier", status="pending" if proposal else "not_applicable", incident_id=inc_name,
            created_at=now, updated_at=now, observed_at=now, valid_from=now, validity_status="current", verification_status="unverified",
            source_reference="verification agent", origin="agent", synthetic=True, name=f"Verifier task {inv_id}",
            summary="Waiting for verification." if proposal else "No proposed correction to verify."))
        for kind, task in (("subject", "investigator"), ("subject", "verifier")):
            repo.upsert_edge("RELATES_TO", f"rel-{base}-{task}-subject", f"{base}-{task}", inc_node, {"kind": kind, "created_at": now, "origin": "agent"})
        repo.upsert_edge("RELATES_TO", f"rel-{base}-handoff", f"{base}-investigator", f"{base}-verifier", {"kind": "handoff", "created_at": now, "origin": "agent"})
        if approver:
            repo.upsert_edge("ASSIGNED_TO", f"as-{base}-verifier", f"{base}-verifier", approver["id"], {"purpose": "human_approval", "created_at": now, "origin": "agent"})

        # --- Context drift guard writes (flag stale memory, record the conflict) -----------------------------
        stale_flagged = self._flag_stale_memory(st, now)
        drift_mem = None
        if a["drift"] and a["drift"][0]["verdict"] in ("requires_revalidation", "potentially_stale") and st.historical:
            d0 = a["drift"][0]
            fails = [c["detail"] for c in d0["checks"] if c["result"] == "fail"][:2]
            drift_mem = upsert_memory(
                repo, key=f"{inc_node}|drift|{d0['historicalFixId']}", kind="Knowledge conflict",
                title=f"Historical fix {st.historical['fix']['name']} cannot be reused as-is", summary=d0["summary"] + " " + " ".join(fails),
                source=f"Context Drift Guard ({inv_id})", incident_display=inc_name, validity="needs_review", verification="unverified",
                node_ids=[st.historical["incident"]["id"], st.historical["fix"]["id"]] + ([st.change["serviceId"]] if st.change else []),
                inv_id=inv_id, rationale="Deterministic checks: scope, schema version, replay, memory freshness.")

        verification, vtrace = None, []
        if proposal and req.auto_verify:
            verification, vtrace = VerificationAgent(repo).verify(inv_id, log)
        outcome = self._outcome(proposal, verification)
        if verification and verification["status"] in ("verified", "partially_verified", "failed"):
            self._write_outcome_memory(st, inc_node, inc_name, fix_id, inv_id, verification, tuple(stale_flagged))

        steps = res.steps
        queries_used = self._aggregate_queries(log)
        run = self._assemble(inv_id, req, scen, st, res, a, steps, queries_used, requested, effective, fallback, llm_model, started,
                             ev_ids, proposal, fix_id, approver, verification, outcome, stale_flagged)
        trace = res.trace + vtrace
        repo.set_props(f"{base}-investigator", dict(
            report_json=run.model_dump_json(by_alias=True), trace_json=json.dumps(trace), outcome=outcome,
            base_uncertainty_json=json.dumps(a["uncertainty"]), activity_json=json.dumps(self._activity(run)), updated_at=now_iso()))
        return run

    def _write_fix(self, inc_node, inc_name, inv_id, p, ev_ids) -> str:
        repo, now = self.repo, now_iso()
        h = repo.historical_resolution(inc_node)
        fix = h and h["fix"]
        if not fix:
            fix_id = f"fix-{inc_node.removeprefix('inc-')}"
            repo.upsert_node("Fix", fix_id, dict(name=p["title"], description=f"Proposed: map `{p['to']}` with fallback alias `{p['from']}`.",
                             x=680, y=610, created_at=now, observed_at=now, valid_from=now, validity_status="current",
                             verification_status="unverified", source_reference="investigator agent", origin="agent", synthetic=True, status="proposed"))
            repo.upsert_edge("RESOLVED_BY", f"rb-{inc_node}-{fix_id}", inc_node, fix_id, {"created_at": now, "origin": "agent"})
        else:
            fix_id = fix["id"]
        if not (h and h["tests"]):
            for tid in ("test-contract", "test-backfill"):
                repo.upsert_edge("VERIFIED_BY", f"vb-{fix_id}-{tid}", fix_id, tid, {"created_at": now, "origin": "agent"})
        repo.set_props(fix_id, dict(proposal_json=json.dumps(p), proposed_by_investigation=inv_id, status="proposed", updated_at=now,
                                    last_investigation_id=inv_id))
        for eid in ev_ids:
            repo.upsert_edge("SUPPORTED_BY", f"sb-{fix_id}-{eid}", fix_id, eid, {"created_at": now, "origin": "agent"})
        return fix_id

    def _flag_stale_memory(self, st: InvState, now: str) -> list[str]:
        mine = {m["id"]: m for m in st.memory}
        flagged = []
        for s in st.stale:
            m = mine.get(s["memoryId"])
            if not m or m.get("validity_status") not in ("valid", "verified"):
                continue
            self.repo.set_props(m["id"], dict(
                previous_validity=m.get("validity_status"), validity_status="needs_review", drift_checked_at=now, updated_at=now,
                drift_reason=(f"Dependency {s['serviceId']} changed ({s['docId']}, effective {s['changedAt']}) after this memory was "
                              f"validated ({s['validFrom']}).")))
            m["validity_status"] = "needs_review"      # keep this run's snapshot consistent with the graph
            m["drift_reason"] = (f"Dependency {s['serviceId']} changed ({s['docId']}) after this memory was validated.")
            flagged.append(m["id"])
        return flagged

    def _write_outcome_memory(self, st, inc_node, inc_name, fix_id, inv_id, v, keep: tuple[str, ...] = ()) -> None:
        status = v["status"]
        kind = "Verified resolution" if status == "verified" else "Observation"
        ver = {"verified": "verified", "partially_verified": "partial", "failed": "failed"}[status]
        title = (f"Proposed fix for {inc_name} verified" if status == "verified"
                 else f"Proposed fix for {inc_name} not fully verified" if status == "partially_verified"
                 else f"Proposed fix for {inc_name} failed verification")
        unresolved = ("; ".join(v["unresolved"][:3]))[:300]
        summary = v["summary"] + (f" Unresolved: {unresolved}" if unresolved else "") + " Synthetic fixtures only; human approval required."
        upsert_memory(self.repo, key=f"{inc_node}|outcome", kind=kind, title=title, summary=summary, source=f"Verification Agent ({inv_id})",
                      incident_display=inc_name, validity="verified" if status == "verified" else "valid", verification=ver,
                      node_ids=[inc_node, fix_id] + ([st.change["serviceId"]] if st.change else []), inv_id=inv_id,
                      rationale="Outcome of deterministic tests executed by the Verification Agent.", keep_validity_ids=keep)

    # ------------------------------------------------------------------ report assembly
    @staticmethod
    def _outcome(proposal, v) -> str:
        if not proposal:
            return "inconclusive"
        if not v or v["status"] in ("blocked", "not_run"):
            return "awaiting_verification"
        return {"verified": "verified", "partially_verified": "partially_verified", "failed": "verification_failed"}[v["status"]]

    @staticmethod
    def _aggregate_queries(log) -> list[dict]:
        agg: dict[str, dict] = {}
        for q in log:
            if q["write"]:
                continue
            e = agg.setdefault(q["name"], {"name": q["name"], "purpose": inv.PURPOSE.get(q["name"], q["name"]), "rowCount": 0, "durationMs": 0.0})
            e["rowCount"] += q["rowCount"]
            e["durationMs"] = round(e["durationMs"] + q["durationMs"], 2)
        return list(agg.values())

    def _assemble(self, inv_id, req, scen, st, res, a, steps, queries_used, requested, effective, fallback, llm_model, started,
                  ev_ids, proposal, fix_id, approver, verification, outcome, stale_flagged) -> InvestigationRun:
        repo = self.repo
        ctx = res.ctx
        evid = [mappers.evidence(e) for e in repo.evidence_for_incident(scen["name"])
                if e["id"] in ev_ids or e.get("last_investigation_id") == inv_id]
        evid.sort(key=lambda e: int(e["id"].split("-")[1]))
        affected = [x for x in st.affected]
        have = {x["nodeId"] for x in affected}
        for nid in st.upstream_ids:
            if nid not in have:
                n = ctx.nodes.get(nid, {})
                affected.append({"nodeId": nid, "label": n.get("name", nid), "type": n.get("_label", ""), "impact": "upstream", "depth": None})
        related = [{"incidentId": c["incidentId"], "nodeId": c["nodeId"], "title": c["title"], "category": c["category"],
                    "sharedEntities": [ctx.name(s) for s in c["shared"]], "rankBasis": c["basis"], "rankScore": c["score"],
                    "hasRecordedFix": c["hasFix"]} for c in st.related]
        memory = [mappers.memory(m, recalled_for=inv_id) for m in st.memory]
        approver_d = {"id": approver["id"], "name": approver["name"]} if approver else None
        correction = None
        if proposal:
            correction = {"fixId": fix_id, "title": proposal["title"], "file": proposal["file"],
                          "summary": f"Map `{proposal['to']}` as the source of `{proposal['canonical']}`, keeping `{proposal['from']}` as a fallback alias.",
                          "diff": diff_lines(proposal), "approver": approver_d}
        uncertainty = list(a["uncertainty"])
        if verification and verification["unresolved"]:
            uncertainty.append("Unresolved after verification: " + "; ".join(verification["unresolved"][:3]) +
                               (f" (+{len(verification['unresolved']) - 3} more)" if len(verification["unresolved"]) > 3 else ""))
        nxt = self._next_action(outcome, verification, approver_d, st)
        evidence_ids_path = repo.evidence_path_links(scen["id"]) if st.change else []
        ev_nodes, ev_edges = self._evidence_path(st, evidence_ids_path)
        run = InvestigationRun.model_validate({
            "investigationId": inv_id, "scenarioId": req.scenario_id, "incidentId": scen["name"], "status": "completed", "outcome": outcome,
            "requestedMode": requested, "executionMode": effective, "fallbackReason": fallback, "llmModel": llm_model,
            "startedAt": started, "finishedAt": now_iso(), "steps": steps, "graphQueriesUsed": queries_used, "evidence": evid,
            "affectedNodes": affected, "relatedIncidents": related, "relevantMemory": memory, "driftFindings": a["drift"],
            "rootCause": {**a["rootCause"], "supportingEvidenceIds": [e["id"] for e in evid if e["category"] in ("Observed fact",)]},
            "proposedCorrection": correction,
            "verification": verification and {**verification, "readBack": verification["readBack"]},
            "remainingUncertainty": uncertainty, "recommendedNextAction": nxt,
            "failurePath": {"nodeIds": st.failure_nodes, "edgeIds": st.failure_edges, "derivedFrom": ["impact_hop", "confirmed_impact"]},
            "evidencePath": {"nodeIds": ev_nodes, "edgeIds": ev_edges, "derivedFrom": ["evidence_path"]},
        })
        return run

    @staticmethod
    def _evidence_path(st: InvState, links: list[dict]) -> tuple[list[str], list[str]]:
        nodes, edges = list(st.failure_nodes), list(st.failure_edges)
        for l in links:
            for k in ("prev_incident", "prev_fix", "fix", "test"):
                if l[k]:
                    nodes.append(l[k])
            edges += [l[k] for k in ("r_similar", "r_prev_fix", "r_fix", "r_test", "r_fix_similar") if l[k]]
        return list(dict.fromkeys(nodes)), list(dict.fromkeys(edges))

    @staticmethod
    def _next_action(outcome, v, approver, st) -> str:
        who = approver["name"] if approver else "the on-call owner"
        owner = next((o["owner"]["name"] for o in st.owners if st.change and o["nodeId"] == st.change["serviceId"]), None)
        if outcome == "verified":
            return f"Request approval from {who} before applying the mapping change to the normalizer. ContextOps does not modify external systems."
        if outcome == "partially_verified":
            failed = [t["name"] for t in v["tests"] if t["result"] == "failed"]
            return (f"Do not apply yet. Resolve the failing test(s) ({', '.join(failed)}) first"
                    + (f"; ask {owner} why upstream emits invalid values" if owner else "") + f". Then re-run verification; approval from {who} is required either way.")
        if outcome == "verification_failed":
            return "The proposed mapping failed verification. Revise the proposal; do not apply it."
        if outcome == "awaiting_verification":
            return "Run verification (POST /api/investigations/{id}/verify) before any approval decision."
        return "Evidence is insufficient to propose a fix. Gather more diagnostics (e.g. upstream service logs) and re-run; no verified action exists."

    @staticmethod
    def _activity(run: InvestigationRun) -> list[dict]:
        t = run.finished_at[11:16]
        out = []
        if run.failure_path.node_ids:
            out.append({"id": f"{run.investigation_id}-a1", "title": "Dependency path discovered", "detail": f"{len(run.failure_path.node_ids)} entities on the failure path for {run.incident_id}", "time": t, "tone": "primary"})
        if run.related_incidents:
            out.append({"id": f"{run.investigation_id}-a2", "title": "Previous incident retrieved", "detail": f"{run.related_incidents[0].incident_id} ranked best by shared graph entities", "time": t, "tone": "violet"})
        for d in run.drift_findings:
            out.append({"id": f"{run.investigation_id}-a3", "title": "Context drift check", "detail": f"{d.historical_incident_id}: {d.verdict.replace('_', ' ')}", "time": t, "tone": "warning"})
        if run.proposed_correction:
            out.append({"id": f"{run.investigation_id}-a4", "title": "Correction proposed", "detail": "Requires human approval", "time": t, "tone": "warning"})
        if run.verification:
            v = run.verification
            out.append({"id": f"{run.investigation_id}-a5", "title": f"Verification: {v.status.replace('_', ' ')}", "detail": f"{v.passed_assertions}/{v.total_assertions} assertions passed",
                        "time": t, "tone": {"verified": "success", "partially_verified": "warning", "failed": "danger"}.get(v.status, "muted")})
        return out

    # ------------------------------------------------------------------ reads / re-verify
    def _task(self, inv_id: str) -> dict:
        t = self.repo.task(f"task-{inv_id}-investigator")
        if not t:
            raise NotFound(f"Investigation '{inv_id}' not found")
        return t

    def get_run(self, inv_id: str) -> InvestigationRun:
        t = self._task(inv_id)
        if not t.get("report_json"):
            raise NotFound(f"Investigation '{inv_id}' has no stored report (status: {t.get('status')})")
        return InvestigationRun.model_validate_json(t["report_json"])

    def get_trace(self, inv_id: str) -> InvestigationTrace:
        t = self._task(inv_id)
        run = self.get_run(inv_id)
        return InvestigationTrace.model_validate({"investigationId": inv_id, "executionMode": run.execution_mode,
                                                  "steps": json.loads(t.get("trace_json", "[]"))})

    def list_runs(self) -> list[dict]:
        out = []
        for t in self.repo.tasks_all():
            if t.get("role") == "investigator" and t.get("status") == "completed" and t.get("report_json"):
                out.append({"investigationId": t["investigation_id"], "scenarioId": json.loads(t["report_json"])["scenarioId"],
                            "incidentId": t.get("incident_id", ""), "outcome": t.get("outcome", ""), "executionMode": t.get("mode", ""),
                            "startedAt": t.get("created_at", ""), "finishedAt": t.get("finished_at", "")})
        return sorted(out, key=lambda r: r["startedAt"], reverse=True)

    def latest_run_id(self) -> str | None:
        rows = self.list_runs()
        return rows[0]["investigationId"] if rows else None

    def reverify(self, inv_id: str) -> InvestigationRun:
        t = self._task(inv_id)
        run = self.get_run(inv_id)
        if not run.proposed_correction:
            raise NotFound("This investigation produced no proposed correction to verify")
        log = R.start_query_recording()
        try:
            v, vtrace = VerificationAgent(self.repo).verify(inv_id, log)
        finally:
            R.stop_query_recording()
        base = json.loads(t.get("base_uncertainty_json", "[]"))
        unc = list(base)
        if v["unresolved"]:
            unc.append("Unresolved after verification: " + "; ".join(v["unresolved"][:3]))
        approver = run.proposed_correction.approver
        outcome = self._outcome(True, v)
        data = json.loads(run.model_dump_json(by_alias=True))
        data.update({"verification": v, "outcome": outcome, "remainingUncertainty": unc, "finishedAt": now_iso()})
        evidence = [mappers.evidence(e) for e in self.repo.evidence_for_incident(run.incident_id)
                    if e["id"] in {x.id for x in run.evidence} or e.get("last_investigation_id") == inv_id]
        data["evidence"] = sorted(evidence, key=lambda e: int(e["id"].split("-")[1]))
        data["recommendedNextAction"] = self._next_action(outcome, v, approver, InvState(incident_node_id="", incident={}, description="", logs=""))
        new = InvestigationRun.model_validate(data)
        old_trace = [s for s in json.loads(t.get("trace_json", "[]")) if s["agent"] != "verifier"]
        self.repo.set_props(t["id"], dict(report_json=new.model_dump_json(by_alias=True), trace_json=json.dumps(old_trace + vtrace),
                                          outcome=outcome, activity_json=json.dumps(self._activity(new)), updated_at=now_iso()))
        return new

    def _write_failed_task(self, inv_id, scen, started, message, requested):
        now = now_iso()
        self.repo.upsert_node("AgentTask", f"task-{inv_id}-investigator", dict(
            investigation_id=inv_id, role="investigator", status="failed", incident_id=scen["name"], mode="llm", requested_mode=requested,
            created_at=started, updated_at=now, finished_at=now, error=message[:300], origin="agent", synthetic=True,
            name=f"Investigator task {inv_id}", valid_from=now, validity_status="current", verification_status="unverified",
            source_reference="investigator agent", observed_at=now))
