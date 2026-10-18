"""Graph property dicts -> the JSON shapes the frontend expects (src/types/index.ts)."""
from __future__ import annotations

from datetime import datetime, timezone

TYPE_MAP = {"VerificationTest": "Verification Test"}
VALIDITY = {"valid": "Valid", "verified": "Verified", "needs_review": "Needs review", "superseded": "Superseded"}


def entity_type(label: str) -> str:
    return TYPE_MAP.get(label, label)


def graph_node(n: dict, extra_evidence: list[str] | None = None) -> dict:
    ev = list(n.get("evidence_notes") or []) + (extra_evidence or [])
    return {"id": n["id"], "label": n["name"], "type": entity_type(n["_label"]), "description": n.get("description", ""),
            "owner": n.get("owner"), "evidence": ev or None, "x": float(n.get("x", 0)), "y": float(n.get("y", 0))}


def graph_edge(e: dict) -> dict:
    return {"id": e["id"], "source": e["source"], "target": e["target"], "type": e["type"]}


def humanize(ts: str | None) -> str:
    if not ts:
        return ""
    try:
        dt = datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return ts
    secs = (datetime.now(timezone.utc) - dt).total_seconds()
    if secs < 90:
        return "just now"
    if secs < 3600:
        return f"{int(secs // 60)} min ago"
    if secs < 86400:
        return f"{int(secs // 3600)} h ago"
    if secs < 7 * 86400:
        return f"{int(secs // 86400)} d ago"
    return dt.strftime("%b %d, %Y").replace(" 0", " ")


def incident(n: dict) -> dict:
    return {"id": n["name"], "nodeId": n.get("focus_node_id", n["id"]), "title": n.get("title", n["name"]),
            "system": n.get("system", ""), "severity": n.get("severity", "SEV3"), "status": n.get("status", "Open"),
            "updated": humanize(n.get("updated_at"))}


def scenario(n: dict) -> dict:
    return {"id": n["scenario_id"], "name": n.get("scenario_name", n["scenario_id"]),
            "description": n.get("scenario_description", ""), "logs": n.get("scenario_logs", ""), "incidentId": n["id"]}


def memory(m: dict, *, recalled_for: str | None = None) -> dict:
    return {"id": m["id"], "kind": m.get("kind", "Observation"), "title": m.get("title", ""), "summary": m.get("summary", ""),
            "source": m.get("source", ""), "incidentId": m.get("incident_id") or None, "nodeIds": sorted(m.get("nodeIds", [])),
            "created": (m.get("created_at") or "")[:10], "updated": (m.get("updated_at") or "")[:10],
            "validity": VALIDITY.get(m.get("validity_status", "valid"), "Valid"),
            "verificationStatus": m.get("verification_status"), "driftReason": m.get("drift_reason"),
            "origin": m.get("origin"), "investigationId": m.get("investigation_id"),
            "recalledFromPriorSession": bool(recalled_for and m.get("origin") == "agent" and m.get("investigation_id") != recalled_for)}


def evidence(e: dict) -> dict:
    return {"id": e["id"], "claim": e.get("claim", ""), "category": e.get("category", "Observed fact"), "source": e.get("source", ""),
            "relationship": e.get("relationship", ""), "incidentId": e.get("incident_id", ""), "state": e.get("state", "Unverified"),
            "timestamp": e.get("timestamp", ""), "rationale": e.get("rationale", ""), "nodeIds": sorted(e.get("nodeIds", [])),
            "investigationId": e.get("last_investigation_id") or e.get("investigation_id")}
