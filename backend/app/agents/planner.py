"""Rules-mode planner. Chooses the NEXT tool from current state (what is known / missing), so the
tool sequence depends on the evidence: e.g. a schema-error signal prioritises change inspection and
precedent retrieval; other signals localise impact first; tools whose preconditions fail are skipped."""
from __future__ import annotations

from app.agents.state import InvState

SCHEMA_ORDER = ["inspect_source_change", "inspect_related_incidents", "retrieve_historical_resolution",
                "replay_historical_fix", "find_affected_systems", "check_memory_validity", "get_system_owner",
                "retrieve_related_decisions", "retrieve_evidence"]
GENERIC_ORDER = ["find_affected_systems", "inspect_source_change", "inspect_related_incidents", "check_memory_validity",
                 "get_system_owner", "retrieve_evidence"]


def next_action(st: InvState):
    """Return ('call', tool, args, reason) | ('skip', tool, reason) | None when finished."""
    d = st.done
    if "resolve_entities" not in d:
        return ("call", "resolve_entities", {}, "Ground the free-text incident in graph entities before running any relationship query.")
    if not st.anchors:
        return None
    if "trace_dependency_path" not in d:
        return ("call", "trace_dependency_path", {}, f"{len(st.anchors)} systems are named in the logs; follow their dependencies upstream to find what they rely on.")
    schema = st.signals["category"].startswith("schema_drift")
    order = SCHEMA_ORDER if schema else GENERIC_ORDER
    why_order = ("Logs contain schema-type errors (KeyError / unknown field)" if schema
                 else "Logs contain no schema-type error signal")
    for tool in order:
        if tool in d or tool in st.skipped:
            continue
        if tool == "retrieve_historical_resolution":
            if "inspect_related_incidents" not in d:
                continue
            if not st.top_candidate:
                st.skipped[tool] = "No candidate precedent with a recorded resolution and a strong enough match."
                return ("skip", tool, st.skipped[tool])
            return ("call", tool, {"incident_id": st.top_candidate["nodeId"]},
                    f"{st.top_candidate['incidentId']} is the best-ranked precedent with a recorded fix; retrieve its cause, fix, source and test.")
        if tool == "replay_historical_fix":
            if "retrieve_historical_resolution" not in d:
                continue
            if not (st.historical and st.historical.get("fix") and st.change):
                st.skipped[tool] = "Needs a loaded historical fix AND a log-corroborated current change to replay against."
                return ("skip", tool, st.skipped[tool])
            return ("call", tool, {}, "Do not trust the precedent blindly: replay its fix against current-schema fixtures to test whether it still applies.")
        if tool == "inspect_source_change":
            return ("call", tool, {}, f"{why_order}; look for a documented change on the traced services and check whether the logs corroborate it.")
        if tool == "inspect_related_incidents":
            return ("call", tool, {}, f"{why_order}; look for earlier incidents touching the same entities.")
        if tool == "find_affected_systems":
            return ("call", tool, {}, "Quantify blast radius: compare structural exposure with the impact recorded on the incident.")
        if tool == "check_memory_validity":
            return ("call", tool, {}, "Check stored knowledge about these entities for staleness or conflict before relying on it.")
        if tool == "get_system_owner":
            return ("call", tool, {}, "Identify who owns the affected systems and the incident.")
        if tool == "retrieve_related_decisions":
            return ("call", tool, {}, "Look for decision records that constrain the remediation.")
        if tool == "retrieve_evidence":
            return ("call", tool, {}, "Load evidence already recorded for this incident so findings link to existing records.")
    return None
