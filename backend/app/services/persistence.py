"""Write helpers for agent-authored graph state (Evidence, Memory, AgentTask, Fix)."""
from __future__ import annotations

from app.agents.assessment import now_display, now_iso
from app.graph.repository import GraphRepository


def upsert_evidence(repo: GraphRepository, incident_display: str, incident_node: str, draft: dict, inv_id: str,
                    existing: list[dict]) -> str:
    """Create, or refresh by fingerprint (so repeated runs do not pile up duplicates)."""
    now = now_iso()
    hit = next((e for e in existing if e.get("fingerprint") == draft["fingerprint"]), None)
    if hit:
        eid = hit["id"]
        refresh = {"last_investigation_id": inv_id, "updated_at": now}
        if hit.get("origin") == "agent":        # agent-authored evidence reflects the latest run
            refresh.update(claim=draft["claim"], state=draft["state"], rationale=draft["rationale"],
                           timestamp=draft["timestamp"], details_json=draft.get("details_json"),
                           confidence_rationale=draft.get("confidence_rationale"), investigation_id=inv_id)
        repo.set_props(eid, refresh)
    else:
        seq = repo.next_seq("Evidence")
        eid = f"EV-{seq}"
        repo.upsert_node("Evidence", eid, dict(
            seq=seq, fingerprint=draft["fingerprint"], claim=draft["claim"], category=draft["category"], source=draft["source"],
            relationship=draft["relationship"], incident_id=incident_display, state=draft["state"], timestamp=draft["timestamp"],
            rationale=draft["rationale"], details_json=draft.get("details_json"), observed_at=draft.get("observed_at") or now,
            created_at=now, updated_at=now, valid_from=now, validity_status="current",
            verification_status={"Verified": "verified", "Test passed": "passed", "Test failed": "failed"}.get(draft["state"], "unverified"),
            source_reference=draft["source"], confidence_rationale=draft.get("confidence_rationale"),
            origin="agent", synthetic=True, investigation_id=inv_id, last_investigation_id=inv_id))
        for nid in draft.get("node_ids", []):
            repo.upsert_edge("RELATES_TO", f"rel-{eid}-{nid}", eid, nid, {"created_at": now, "origin": "agent"})
        repo.upsert_edge("SUPPORTED_BY", f"sb-{incident_node}-{eid}", incident_node, eid, {"created_at": now, "origin": "agent"})
    return eid


def upsert_memory(repo: GraphRepository, *, key: str, kind: str, title: str, summary: str, source: str, incident_display: str,
                  validity: str, verification: str, node_ids: list[str], inv_id: str, rationale: str,
                  keep_validity_ids: tuple[str, ...] = ()) -> str:
    now = now_iso()
    hit = repo.memory_by_key(key)
    if hit:
        props = dict(summary=summary, title=title, kind=kind, updated_at=now, validity_status=validity,
                     verification_status=verification, last_investigation_id=inv_id, confidence_rationale=rationale)
        if hit["id"] in keep_validity_ids:      # flagged stale by the Drift Guard in this very run: do not auto re-validate
            props.pop("validity_status")
        repo.set_props(hit["id"], props)
        return hit["id"]
    seq = repo.next_seq("Memory")
    mid = f"M-{seq}"
    repo.upsert_node("Memory", mid, dict(
        seq=seq, memory_key=key, kind=kind, title=title, summary=summary, source=source, incident_id=incident_display,
        created_at=now, updated_at=now, observed_at=now, valid_from=now, validity_status=validity, verification_status=verification,
        source_reference=source, confidence_rationale=rationale, origin="agent", synthetic=True, investigation_id=inv_id))
    for nid in node_ids:
        repo.upsert_edge("RELATES_TO", f"rel-{mid}-{nid}", mid, nid, {"created_at": now, "origin": "agent"})
    return mid
