from __future__ import annotations

import json
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse

from app import __version__
from app.api.deps import Container, container, graph_service_dep, investigation_service_dep, repo_dep
from app.graph.queries import VISIBLE_LABELS
from app.graph.repository import GraphRepository
from app.graph.seed_data import RELATION_DESCRIPTIONS
from app.models import api as M
from app.services import mappers
from app.services.graph_service import GraphService
from app.services.investigation_service import InvestigationService, decide_mode, ModeUnavailable

router = APIRouter(prefix="/api")
NODE_ID = r"^[A-Za-z0-9][A-Za-z0-9\-_]{0,60}$"


# ------------------------------------------------------------------------------ health
@router.get("/health", tags=["health"])
def health(request: Request):
    s = request.app.state.container.settings
    return {"status": "ok", "service": "contextops-backend", "version": __version__, "env": s.app_env}


@router.get("/health/ready", tags=["health"])
def ready(request: Request):
    c: Container = request.app.state.container
    try:
        c.ensure_connected()
        counts = c.repo.counts()
    except Exception:  # noqa: BLE001
        return JSONResponse(status_code=503, content={"status": "unavailable", "falkordb": False, "seeded": False,
                                                       "detail": "FalkorDB is not reachable"})
    seeded = counts.get("Incident", 0) > 0
    code = 200 if seeded else 503
    return JSONResponse(status_code=code, content={"status": "ready" if seeded else "not_seeded", "falkordb": True, "seeded": seeded,
                                                    "nodes": sum(counts.values()), "edges": c.repo.edge_count()})


def _strip_none(o):
    if isinstance(o, dict):
        return {k: _strip_none(v) for k, v in o.items() if v is not None}
    return o


@router.get("/integrations/status", tags=["health"])
def integrations(request: Request):
    c: Container = request.app.state.container
    s = c.settings
    connected, counts, version = False, {}, None
    try:
        c.ensure_connected()
        connected, counts, version = True, c.repo.counts(), c.client.module_version()
    except Exception:  # noqa: BLE001
        pass
    try:
        requested, effective, fb = decide_mode(s)
        agent_err = None
    except ModeUnavailable as exc:
        requested, effective, fb, agent_err = s.agent_mode, None, None, str(exc)
    return _strip_none({
        "api": {"version": __version__, "env": s.app_env},
        "falkordb": {"connected": connected, "graph": s.falkordb_graph, "host": s.falkordb_host, "port": s.falkordb_port,
                     "moduleVersion": version, "nodeCount": sum(counts.values()) if counts else 0,
                     "edgeCount": c.repo.edge_count() if connected else 0, "seeded": counts.get("Incident", 0) > 0},
        "agent": {"configuredMode": requested, "effectiveMode": effective, "llmConfigured": s.llm_configured,
                  "provider": s.effective_provider if s.llm_configured else None,
                  "model": s.llm_model if s.llm_configured else None, "fallbackReason": fb, "error": agent_err},
        "syntheticData": True,
    })


# ------------------------------------------------------------------------------ graph
@router.get("/graph", response_model=M.GraphResponse, tags=["graph"])
def graph(repo: GraphRepository = Depends(repo_dep)):
    nodes, edges = repo.graph_view()
    return {"nodes": [mappers.graph_node(n) for n in nodes], "edges": [mappers.graph_edge(e) for e in edges]}


@router.get("/graph/overview", response_model=M.OverviewResponse, tags=["graph"])
def graph_overview(svc: GraphService = Depends(graph_service_dep)):
    return svc.overview()


@router.get("/graph/failure-path", response_model=M.PathResponse, tags=["graph"])
def failure_path(incident_id: str = Query("inc-2041", pattern=NODE_ID), source_id: str | None = Query(None, pattern=NODE_ID),
                 svc: GraphService = Depends(graph_service_dep)):
    return svc.failure_path(incident_id, source_id)


@router.get("/graph/demo-path", response_model=M.PathResponse, tags=["graph"])
def demo_path(incident_id: str = Query("inc-2041", pattern=NODE_ID), svc: GraphService = Depends(graph_service_dep)):
    return svc.demo_path(incident_id)


@router.get("/graph/relation-descriptions", tags=["graph"])
def relation_descriptions():
    return RELATION_DESCRIPTIONS


@router.get("/graph/nodes/{node_id}", response_model=M.GraphNode, tags=["graph"])
def graph_node(node_id: str, repo: GraphRepository = Depends(repo_dep)):
    if not re.match(NODE_ID, node_id):
        raise HTTPException(422, "invalid node id")
    n = repo.get_node(node_id)
    if not n or n["_label"] not in VISIBLE_LABELS:
        raise HTTPException(404, f"Node '{node_id}' not found")
    extra = [f"{e['id']}: {e['claim'][:90]}" for e in repo.evidence_for_node(node_id)[:4]]
    return mappers.graph_node(n, extra)


@router.get("/graph/nodes/{node_id}/neighbors", response_model=list[M.Neighbor], tags=["graph"])
def neighbors(node_id: str, repo: GraphRepository = Depends(repo_dep)):
    if not re.match(NODE_ID, node_id):
        raise HTTPException(422, "invalid node id")
    if not repo.get_node(node_id):
        raise HTTPException(404, f"Node '{node_id}' not found")
    return [{"edge": mappers.graph_edge(x["edge"]), "node": mappers.graph_node(x["node"])} for x in repo.neighbors(node_id)]


# ------------------------------------------------------------------------------ lists
@router.get("/incidents", response_model=list[M.Incident], tags=["lists"])
def incidents(repo: GraphRepository = Depends(repo_dep)):
    rows = sorted(repo.incidents(), key=lambda n: n.get("updated_at", ""), reverse=True)
    return [mappers.incident(n) for n in rows if n.get("status") != "Resolved"]


@router.get("/scenarios", response_model=list[M.Scenario], tags=["lists"])
def scenarios(repo: GraphRepository = Depends(repo_dep)):
    return sorted((mappers.scenario(n) for n in repo.scenarios()), key=lambda s: s["id"] != "field-rename")


@router.get("/activity", response_model=list[M.ActivityItem], tags=["lists"])
def activity(inv: InvestigationService = Depends(investigation_service_dep)):
    rid = inv.latest_run_id()
    if not rid:
        return []
    return json.loads(inv._task(rid).get("activity_json", "[]"))


@router.get("/investigation/steps", response_model=list[M.InvestigationStep], tags=["lists"])
def investigation_steps(investigation_id: str | None = Query(None, pattern=r"^inv-[a-f0-9]{8}$"),
                        inv: InvestigationService = Depends(investigation_service_dep)):
    rid = investigation_id or inv.latest_run_id()
    return inv.get_run(rid).steps if rid else []


@router.get("/memory", response_model=list[M.MemoryRecord], tags=["memory"])
def memory(repo: GraphRepository = Depends(repo_dep)):
    return [mappers.memory(m) for m in sorted(repo.memory_all(), key=lambda m: m["seq"])]


@router.get("/memory/{memory_id}", response_model=M.MemoryRecord, tags=["memory"])
def memory_one(memory_id: str, repo: GraphRepository = Depends(repo_dep)):
    if not re.match(r"^M-\d{1,6}$", memory_id):
        raise HTTPException(422, "invalid memory id")
    m = repo.memory_one(memory_id)
    if not m:
        raise HTTPException(404, f"Memory '{memory_id}' not found")
    return mappers.memory(m)


@router.post("/memory/{memory_id}/review", response_model=M.MemoryRecord, tags=["memory"])
def review_memory(memory_id: str, body: M.MemoryReview, repo: GraphRepository = Depends(repo_dep)):
    """Human review of a memory record (e.g. confirm it is still valid, or mark it superseded)."""
    if not re.match(r"^M-\d{1,6}$", memory_id):
        raise HTTPException(422, "invalid memory id")
    m = repo.memory_one(memory_id)
    if not m:
        raise HTTPException(404, f"Memory '{memory_id}' not found")
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    status = {"confirm_valid": "verified" if m.get("verification_status") == "verified" else "valid",
              "needs_review": "needs_review", "superseded": "superseded"}[body.decision]
    props = {"validity_status": status, "review_note": body.note or None, "reviewed_at": now, "updated_at": now}
    if body.decision == "confirm_valid":   # a human re-validation restarts the staleness clock
        props.update(valid_from=now, drift_reason=None)
    repo.set_props(memory_id, {k: v for k, v in props.items() if v is not None})
    if body.decision == "confirm_valid":
        repo.set_props(memory_id, {"drift_reason": ""})
    return mappers.memory(repo.memory_one(memory_id))


@router.get("/evidence", response_model=list[M.EvidenceRecord], tags=["evidence"])
def evidence(incident_id: str | None = Query(None, pattern=r"^INC-\d{1,6}$"), repo: GraphRepository = Depends(repo_dep)):
    rows = repo.evidence_for_incident(incident_id) if incident_id else repo.evidence_all()
    return sorted((mappers.evidence(e) for e in rows), key=lambda e: int(e["id"].split("-")[1]))


@router.get("/agent-tasks", tags=["agents"])
def agent_tasks(investigation_id: str | None = Query(None, pattern=r"^inv-[a-f0-9]{8}$"), repo: GraphRepository = Depends(repo_dep)):
    rows = repo.tasks_for_investigation(investigation_id) if investigation_id else repo.tasks_all()
    keep = ("id", "role", "status", "investigation_id", "incident_id", "mode", "created_at", "finished_at", "summary", "outcome", "error")
    return sorted(({k: t.get(k) for k in keep} for t in rows), key=lambda t: (t["created_at"] or ""), reverse=True)


# ------------------------------------------------------------------------------ investigations
@router.post("/investigations/run", response_model=M.InvestigationRun, tags=["investigations"])
def run_investigation(body: M.RunRequest, request: Request, inv: InvestigationService = Depends(investigation_service_dep)):
    s = request.app.state.container.settings
    if len(body.description) > s.max_description_chars or len(body.logs) > s.max_logs_chars:
        raise HTTPException(413, "description or logs exceed the configured size limit")
    return inv.run(body)


@router.get("/investigations", response_model=list[M.InvestigationSummary], tags=["investigations"])
def list_investigations(inv: InvestigationService = Depends(investigation_service_dep)):
    return inv.list_runs()


@router.get("/investigations/{investigation_id}", response_model=M.InvestigationRun, tags=["investigations"])
def get_investigation(investigation_id: str, inv: InvestigationService = Depends(investigation_service_dep)):
    if not re.match(r"^inv-[a-f0-9]{8}$", investigation_id):
        raise HTTPException(422, "invalid investigation id")
    return inv.get_run(investigation_id)


@router.get("/investigations/{investigation_id}/trace", response_model=M.InvestigationTrace, tags=["investigations"])
def get_trace(investigation_id: str, inv: InvestigationService = Depends(investigation_service_dep)):
    if not re.match(r"^inv-[a-f0-9]{8}$", investigation_id):
        raise HTTPException(422, "invalid investigation id")
    return inv.get_trace(investigation_id)


@router.post("/investigations/{investigation_id}/verify", response_model=M.InvestigationRun, tags=["investigations"])
def verify_investigation(investigation_id: str, inv: InvestigationService = Depends(investigation_service_dep)):
    """Re-run the Verification Agent. It reads the investigator's state back from FalkorDB."""
    if not re.match(r"^inv-[a-f0-9]{8}$", investigation_id):
        raise HTTPException(422, "invalid investigation id")
    return inv.reverify(investigation_id)


# ------------------------------------------------------------------------------ demo helper
@router.post("/demo/simulate-release", tags=["demo"])
def simulate_release(body: M.SimulateRelease, request: Request, repo: GraphRepository = Depends(repo_dep)):
    """Adds a SYNTHETIC changelog document so the Drift Guard can be demonstrated (disabled in production)."""
    s = request.app.state.container.settings
    if s.app_env == "production":
        raise HTTPException(403, "Disabled when APP_ENV=production")
    svc = repo.get_node(body.service_id)
    if not svc or svc["_label"] != "Service":
        raise HTTPException(404, f"Service '{body.service_id}' not found")
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    doc_id = f"doc-changelog-{body.service_id}-v{body.version.replace('.', '_')}"
    change = {"release": f"v{body.version}", "schema_version": body.version, "effective_at": now, "breaking": True,
              "contract_versioned": False, "event": "billing.charge", "renamed": body.renamed_fields}
    repo.upsert_node("Document", doc_id, dict(
        name=f"{svc['name']} changelog v{body.version}", description="SYNTHETIC release notes created by /api/demo/simulate-release.",
        x=260, y=20, created_at=now, updated_at=now, observed_at=now, valid_from=now, validity_status="current", verification_status="unverified",
        source_reference="demo simulate-release (synthetic)", origin="agent", synthetic=True, effective_at=now, schema_version=body.version,
        release=f"v{body.version}", change_json=json.dumps(change, separators=(",", ":"), sort_keys=True)))
    repo.upsert_edge("DOCUMENTS", f"doc-{doc_id}", doc_id, body.service_id, {"created_at": now, "origin": "agent"})
    repo.set_props(body.service_id, {"schema_version": body.version, "updated_at": now})
    return {"documentId": doc_id, "serviceId": body.service_id, "effectiveAt": now, "syntheticData": True}


# JSON contract: optional fields that are None are OMITTED (the frontend's TS types use `field?: T`, not `T | null`).
for _r in router.routes:
    _r.response_model_exclude_none = True
