"""Allow-listed diagnostic tools. Each is a thin, validated wrapper over named repository queries
(or the deterministic simulator). Neither the rules planner nor an LLM can run anything else."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any, Callable

from app.agents.pipeline_sim import BASELINE_FIELD_MAP, apply_mapping_patch, run_registered_test
from app.agents.state import ID_RE, InvState, parse_iso
from app.graph.repository import GraphRepository


class ToolError(ValueError):
    """Invalid tool arguments (reported back to the planner/LLM, never raised to the user)."""


@dataclass
class ToolResult:
    summary: str
    data: dict[str, Any] = field(default_factory=dict)
    node_ids: list[str] = field(default_factory=list)
    edge_ids: list[str] = field(default_factory=list)


@dataclass
class ToolContext:
    repo: GraphRepository
    state: InvState
    _nodes: dict[str, dict] | None = None

    @property
    def nodes(self) -> dict[str, dict]:
        if self._nodes is None:
            self._nodes = {n["id"]: n for n in self.repo.graph_view()[0]}
        return self._nodes

    def name(self, nid: str) -> str:
        return self.nodes.get(nid, {}).get("name", nid)


def _ids(args: dict, key: str, default: list[str]) -> list[str]:
    val = args.get(key)
    if val is None:
        return default
    if not isinstance(val, list) or len(val) > 12 or not all(isinstance(v, str) and ID_RE.match(v) for v in val):
        raise ToolError(f"'{key}' must be a list of at most 12 node ids")
    return val


def _depth(args: dict, default: int = 5) -> int:
    d = args.get("depth", default)
    if not isinstance(d, int) or not 1 <= d <= 6:
        raise ToolError("'depth' must be an integer between 1 and 6")
    return d


# ------------------------------------------------------------------------------ tools
def resolve_entities(ctx: ToolContext, args: dict) -> ToolResult:
    st = ctx.state
    rows = ctx.repo.entities_by_alias(st.text)
    rows.sort(key=lambda r: min(st.text.lower().find(m) for m in r["matched"]))
    st.anchors = [{"id": r["id"], "name": r["name"], "label": r["_label"], "matched": r["matched"]} for r in rows]
    names = ", ".join(f"{a['name']} (matched '{a['matched'][0]}')" for a in st.anchors) or "none"
    return ToolResult(f"Matched {len(st.anchors)} graph entities from the description/logs: {names}.",
                      {"anchors": st.anchors}, [a["id"] for a in st.anchors])


def trace_dependency_path(ctx: ToolContext, args: dict) -> ToolResult:
    st = ctx.state
    ids = _ids(args, "from_ids", [a["id"] for a in st.anchors])
    depth = _depth(args)
    st.chains = [c for i in ids for c in ctx.repo.dependency_chain(i, depth)]
    bfs = ctx.repo.bfs("up", ids, depth)
    st.upstream = bfs
    st.upstream_ids = list(bfs["nodes"].keys())
    best = max(st.chains, key=lambda c: len(c["nodeIds"]), default=None)
    chain_txt = " → ".join(ctx.name(n) for n in best["nodeIds"]) if best else "no DEPENDS_ON chain"
    return ToolResult(
        f"Traced upstream from {len(ids)} entities ({len(bfs['nodes'])} nodes within {depth} hops). "
        f"Longest DEPENDS_ON chain: {chain_txt}.",
        {"chains": st.chains, "upstream": {k: v["depth"] for k, v in bfs["nodes"].items()}},
        st.upstream_ids, list(bfs["edges"].keys()))


def inspect_source_change(ctx: ToolContext, args: dict) -> ToolResult:
    st = ctx.state
    ids = _ids(args, "service_ids", st.upstream_ids or [a["id"] for a in st.anchors])
    recs = ctx.repo.source_change(ids)
    first_err = None
    obs = parse_iso(st.incident.get("observed_at"))
    if obs and st.signals["first_error_hms"]:
        h, m, s = map(int, st.signals["first_error_hms"].split(":"))
        first_err = obs.replace(hour=h, minute=m, second=s)
    elif obs:
        first_err = obs
    st.changes, st.unlinked_changes, st.change = [], [], None
    for rec in recs:
        for doc in rec["documents"]:
            cj = json.loads(doc["change_json"])
            eff = parse_iso(cj.get("effective_at"))
            fields = {f for r in cj.get("renamed", []) for f in (r["from"], r["to"])}
            corroborated = sorted(f for f in fields if re.search(rf"\b{re.escape(f)}\b", st.text))
            minutes = round((first_err - eff).total_seconds() / 60) if (first_err and eff) else None
            change = {"event": cj.get("event"), "docId": doc["id"], "docName": doc["name"], "serviceId": rec["node"]["id"],
                      "serviceName": rec["node"]["name"], "release": cj.get("release"), "effectiveAt": cj.get("effective_at"),
                      "renamed": cj.get("renamed", []), "breaking": cj.get("breaking"),
                      "contractVersioned": cj.get("contract_versioned"), "corroboratedFields": corroborated,
                      "minutesBeforeFirstError": minutes, "changedBy": (rec["changedBy"] or {}).get("name"),
                      "serviceSchemaVersion": rec["node"].get("schema_version")}
            st.changes.append(change)
            recent = minutes is not None and 0 <= minutes <= 1440
            if corroborated and recent:
                if st.change is None:
                    st.change = change
            else:
                st.unlinked_changes.append(change)
    if st.change:
        c = st.change
        summ = (f"{c['serviceName']} {c['release']} (doc {c['docId']}) renamed "
                + ", ".join(f"`{r['from']}`→`{r['to']}`" for r in c["renamed"])
                + f"; logs mention {c['corroboratedFields']}; change precedes first error by {c['minutesBeforeFirstError']} min.")
    elif st.unlinked_changes:
        c = st.unlinked_changes[0]
        summ = (f"Found change {c['docId']} ({c['serviceName']} {c['release']}) but the logs name none of its changed fields; "
                f"causal link NOT established.")
    else:
        summ = "No documented change found on the traced services."
    return ToolResult(summ, {"changes": st.changes, "linked": st.change},
                      [c["serviceId"] for c in st.changes], [])


def find_affected_systems(ctx: ToolContext, args: dict) -> ToolResult:
    st = ctx.state
    repo = ctx.repo
    if args.get("source_id"):
        src = _ids({"x": [args["source_id"]]}, "x", [])[0]
    elif st.change:
        src = st.change["serviceId"]
    elif st.chains:
        src = max(st.chains, key=lambda c: len(c["nodeIds"]))["nodeIds"][-1]
    else:
        src = st.anchors[0]["id"]
    st.source_service_id = src
    bfs = repo.bfs("down", [src], _depth(args, 6))
    st.impact = bfs
    st.confirmed = repo.confirmed_impact(st.incident_node_id)
    conf_ids = {c["nodeId"] for c in st.confirmed}
    path_nodes: dict[str, int] = {}
    path_edges: list[str] = []
    for cid in conf_ids:
        nids, rids = repo.path_to(bfs, cid)
        for n in nids:
            path_nodes[n] = bfs["nodes"][n]["depth"]
        path_edges += rids
    ordered = sorted(path_nodes, key=lambda n: (path_nodes[n], n))
    st.failure_nodes = ordered + ([st.incident_node_id] if conf_ids else [])
    st.failure_edges = list(dict.fromkeys(path_edges + [c["relId"] for c in st.confirmed if c["nodeId"] in path_nodes]))
    affected = []
    for nid, info in sorted(bfs["nodes"].items(), key=lambda kv: kv[1]["depth"]):
        n = ctx.nodes.get(nid, {})
        impact = ("source" if nid == src else "confirmed" if nid in conf_ids else
                  "potential" if nid in path_nodes else "no_evidence_of_impact")
        affected.append({"nodeId": nid, "label": n.get("name", nid), "type": n.get("_label", ""), "impact": impact, "depth": info["depth"]})
    for cid in conf_ids - set(bfs["nodes"]):
        n = ctx.nodes.get(cid, {})
        affected.append({"nodeId": cid, "label": n.get("name", cid), "type": n.get("_label", ""), "impact": "confirmed", "depth": None})
    st.affected = affected
    quiet = [a["label"] for a in affected if a["impact"] == "no_evidence_of_impact"]
    return ToolResult(
        f"From {ctx.name(src)}: {len(bfs['nodes']) - 1} entities structurally exposed within 6 hops; "
        f"{len(conf_ids)} confirmed affected by the incident record; exposed but no recorded impact: {', '.join(quiet) or 'none'}.",
        {"source": src, "affected": affected}, st.failure_nodes, st.failure_edges)


CATEGORY_LABEL = {"schema_drift": "schema drift", "capacity": "capacity", "routing": "routing", "data_latency": "data latency"}


def inspect_related_incidents(ctx: ToolContext, args: dict) -> ToolResult:
    st = ctx.state
    scope = _ids(args, "node_ids", st.scope_ids or [a["id"] for a in st.anchors])
    guess = st.signals["category"].rstrip("?")
    out = []
    for r in ctx.repo.related_incidents(scope, st.incident_node_id):
        inc = r["incident"]
        basis, score = [], 0
        k = min(len(r["shared"]), 3)
        score += 2 * k
        basis.append(f"shares {len(r['shared'])} entit{'y' if len(r['shared']) == 1 else 'ies'} with this investigation: "
                     + ", ".join(ctx.name(s) for s in r["shared"]))
        if guess != "unknown" and inc.get("category") == guess:
            score += 3
            basis.append(f"same failure pattern ({CATEGORY_LABEL.get(guess, guess)})")
        elif guess != "unknown":
            basis.append(f"different failure pattern ({inc.get('category')} ≠ {guess})")
        if r["fixId"]:
            score += 2
            basis.append("has a recorded resolution")
        if r["similarLinks"]:
            score += 2
            basis.append("already linked by a SIMILAR_TO relationship in the graph")
        out.append({"incidentId": inc["name"], "nodeId": inc["id"], "title": inc.get("title", inc["name"]),
                    "category": inc.get("category"), "shared": r["shared"], "basis": basis, "score": score,
                    "fixId": r["fixId"], "hasFix": bool(r["fixId"]), "similarLinks": r["similarLinks"]})
    out.sort(key=lambda c: -c["score"])
    st.related = out
    txt = "; ".join(f"{c['incidentId']} (rank {c['score']}: {c['basis'][1] if len(c['basis']) > 1 else c['basis'][0]})" for c in out)
    return ToolResult(f"{len(out)} candidate precedent(s) by shared graph entities. " + (txt or "None."),
                      {"candidates": out}, [c["nodeId"] for c in out])


def retrieve_historical_resolution(ctx: ToolContext, args: dict) -> ToolResult:
    st = ctx.state
    iid = args.get("incident_id") or (st.top_candidate or {}).get("nodeId")
    if not iid or not ID_RE.match(str(iid)):
        raise ToolError("no candidate incident to retrieve a resolution for")
    h = ctx.repo.historical_resolution(iid)
    if not h:
        return ToolResult(f"No incident {iid} in the graph.")
    st.historical = h
    fix = h["fix"]
    ids = [h["incident"]["id"]] + ([fix["id"]] if fix else []) + [t["id"] for t in h["tests"]] + [d["id"] for d in h["documents"]]
    return ToolResult(
        f"{h['incident']['name']}: cause = {h['incident'].get('root_cause_summary', 'n/a')} Fix = "
        f"{fix['name'] if fix else 'none recorded'}; verification test(s) = {[t['name'] for t in h['tests']] or 'none'}; "
        f"source document(s) = {[d['name'] for d in h['documents']] or 'none'}.",
        {"historical": {"incident": h["incident"]["id"], "fix": fix and fix["id"]}}, ids)


def replay_historical_fix(ctx: ToolContext, args: dict) -> ToolResult:
    st = ctx.state
    fix = (st.historical or {}).get("fix")
    if not fix or not fix.get("mapping_patch_json"):
        raise ToolError("no historical fix with a machine-readable mapping patch is loaded")
    cand = apply_mapping_patch(BASELINE_FIELD_MAP, json.loads(fix["mapping_patch_json"]))
    out = run_registered_test("historical_alias_contract", cand)
    st.replay = {"fixId": fix["id"], "ok": out.ok, "passed": out.passed, "total": out.total,
                 "assertions": [a.__dict__ for a in out.assertions]}
    return ToolResult(
        f"Replayed {fix['name']} against current-schema fixtures: {out.passed}/{out.total} assertions passed"
        + ("." if out.ok else f" - {out.assertions[0].detail}."), {"replay": st.replay}, [fix["id"]])


def check_memory_validity(ctx: ToolContext, args: dict) -> ToolResult:
    st = ctx.state
    ids = _ids(args, "node_ids", st.scope_ids or [a["id"] for a in st.anchors])
    st.memory = ctx.repo.memory_for_nodes(ids)
    st.stale = ctx.repo.stale_memory()
    stale_ids = {s["memoryId"] for s in st.stale}
    relevant_stale = sorted(m["id"] for m in st.memory if m["id"] in stale_ids)
    prior = [m["id"] for m in st.memory if m.get("origin") == "agent"]
    flagged = [m["id"] for m in st.memory if m.get("validity_status") == "needs_review"]
    return ToolResult(
        f"{len(st.memory)} memory record(s) touch these entities; potentially stale (a dependency changed after the memory "
        f"was validated): {relevant_stale or 'none'}; already flagged needs-review: {flagged or 'none'}; "
        f"recalled from earlier agent sessions: {prior or 'none'}.",
        {"memory": [m["id"] for m in st.memory], "stale": relevant_stale}, [], [])


def get_system_owner(ctx: ToolContext, args: dict) -> ToolResult:
    st = ctx.state
    ids = _ids(args, "node_ids", [a["id"] for a in st.anchors] + [st.incident_node_id])
    st.owners = ctx.repo.owners(ids)
    txt = "; ".join(f"{ctx.name(o['nodeId'])} → {o['owner']['name']}" for o in st.owners)
    return ToolResult(f"Owners: {txt or 'none recorded'}.", {"owners": [(o["nodeId"], o["owner"]["id"]) for o in st.owners]},
                      [o["owner"]["id"] for o in st.owners])


def retrieve_related_decisions(ctx: ToolContext, args: dict) -> ToolResult:
    st = ctx.state
    ids = _ids(args, "node_ids", st.scope_ids or [a["id"] for a in st.anchors])
    st.decisions = ctx.repo.decisions(ids)
    seen = {}
    for d in st.decisions:
        seen.setdefault(d["decision"]["id"], d)
    return ToolResult("Decisions: " + ("; ".join(f"{d['decision'].get('reference', '')} {d['decision']['name']} ({d['via']})"
                                                for d in seen.values()) or "none."),
                      {"decisions": list(seen)}, list(seen))


def retrieve_evidence(ctx: ToolContext, args: dict) -> ToolResult:
    st = ctx.state
    st.prior_evidence = ctx.repo.evidence_for_incident(st.incident["name"])
    return ToolResult(f"{len(st.prior_evidence)} evidence record(s) already linked to {st.incident['name']}: "
                      f"{[e['id'] for e in st.prior_evidence]}.", {"evidence": [e["id"] for e in st.prior_evidence]})


# ------------------------------------------------------------------------------ registry
@dataclass
class ToolSpec:
    name: str
    description: str
    fn: Callable[[ToolContext, dict], ToolResult]
    properties: dict[str, Any] = field(default_factory=dict)

    def schema(self) -> dict:
        return {"type": "function", "function": {"name": self.name, "description": self.description,
                "parameters": {"type": "object", "properties": self.properties, "additionalProperties": False}}}


_IDS = {"type": "array", "items": {"type": "string"}, "maxItems": 12}
_DEPTH = {"type": "integer", "minimum": 1, "maximum": 6}
TOOLS: dict[str, ToolSpec] = {t.name: t for t in [
    ToolSpec("resolve_entities", "Match systems named in the description/logs to graph entities. Call first.", resolve_entities),
    ToolSpec("trace_dependency_path", "Trace upstream dependencies (DEPENDS_ON/PRODUCES/CONSUMES) from entities.", trace_dependency_path,
             {"from_ids": _IDS, "depth": _DEPTH}),
    ToolSpec("inspect_source_change", "Look up documented changes (changelogs) on traced services and check whether the logs corroborate them.",
             inspect_source_change, {"service_ids": _IDS}),
    ToolSpec("find_affected_systems", "Find systems structurally exposed downstream of a source and compare with the incident's recorded impact.",
             find_affected_systems, {"source_id": {"type": "string"}, "depth": _DEPTH}),
    ToolSpec("inspect_related_incidents", "Retrieve previous incidents that share graph entities and rank them by explainable criteria.",
             inspect_related_incidents, {"node_ids": _IDS}),
    ToolSpec("retrieve_historical_resolution", "Retrieve a previous incident's cause, fix, verification test and source documents.",
             retrieve_historical_resolution, {"incident_id": {"type": "string"}}),
    ToolSpec("replay_historical_fix", "Deterministically replay the loaded historical fix against current-schema fixtures (context drift check).",
             replay_historical_fix),
    ToolSpec("check_memory_validity", "Retrieve stored memory about these entities and detect stale or superseded context.",
             check_memory_validity, {"node_ids": _IDS}),
    ToolSpec("get_system_owner", "Look up the owning teams/people for entities.", get_system_owner, {"node_ids": _IDS}),
    ToolSpec("retrieve_related_decisions", "Retrieve decision records relevant to entities.", retrieve_related_decisions, {"node_ids": _IDS}),
    ToolSpec("retrieve_evidence", "Retrieve evidence records already linked to this incident.", retrieve_evidence),
]}


def execute_tool(ctx: ToolContext, name: str, args: dict) -> ToolResult:
    if name not in TOOLS:
        raise ToolError(f"tool '{name}' is not in the allow-list")
    if not isinstance(args, dict):
        raise ToolError("arguments must be an object")
    unknown = set(args) - set(TOOLS[name].properties)
    if unknown:
        raise ToolError(f"unexpected arguments: {sorted(unknown)}")
    return TOOLS[name].fn(ctx, args)
