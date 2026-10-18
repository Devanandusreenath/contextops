"""Named, parameterised graph operations. The only place Cypher is executed."""
from __future__ import annotations

import contextvars
import time
from typing import Any

from app.graph import queries as Q
from app.graph.client import GraphClient

_QUERY_LOG: contextvars.ContextVar[list | None] = contextvars.ContextVar("query_log", default=None)


def start_query_recording() -> list[dict]:
    log: list[dict] = []
    _QUERY_LOG.set(log)
    return log


def stop_query_recording() -> None:
    _QUERY_LOG.set(None)


def _clean(props: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in props.items() if v is not None}


def _p(entity) -> dict[str, Any]:
    return dict(entity.properties) if entity is not None else {}


def _node(entity, label: str | None = None) -> dict[str, Any]:
    d = _p(entity)
    d["_label"] = label or (entity.labels[0] if getattr(entity, "labels", None) else None)
    return d


class GraphRepository:
    def __init__(self, client: GraphClient):
        self.client = client

    # ------------------------------------------------------------------ plumbing
    def _run(self, name: str, cypher: str, params: dict | None = None, *, write: bool = False):
        params = params or {}
        t0 = time.perf_counter()
        g = self.client.graph
        res = (g.query if write else g.ro_query)(cypher, params)
        ms = round((time.perf_counter() - t0) * 1000, 2)
        rows = res.result_set
        log = _QUERY_LOG.get()
        if log is not None:
            log.append({
                "name": name, "cypher": " ".join(cypher.split()), "write": write,
                "params": {k: (v if len(str(v)) < 200 else str(v)[:200] + "…") for k, v in params.items()},
                "rowCount": len(rows), "durationMs": ms,
            })
        return rows

    # ------------------------------------------------------------------ setup/status
    def ensure_indexes(self) -> None:
        for stmt in Q.INDEX_STATEMENTS:
            try:
                self.client.graph.query(stmt)
            except Exception as exc:  # noqa: BLE001 - "already indexed" is expected on re-run
                if "already" not in str(exc).lower() and "index" not in str(exc).lower():
                    raise

    def counts(self) -> dict[str, int]:
        try:
            rows = self._run("counts", Q.Q_COUNTS)
            return {r[0]: r[1] for r in rows}
        except Exception:  # noqa: BLE001 - graph may not exist yet
            return {}

    def edge_count(self) -> int:
        try:
            return int(self._run("edge_count", Q.Q_EDGE_COUNT)[0][0])
        except Exception:  # noqa: BLE001
            return 0

    # ------------------------------------------------------------------ graph reads
    def graph_view(self, labels: list[str] | None = None):
        labels = labels or Q.VISIBLE_LABELS
        nodes = [_node(r[0], r[1]) for r in self._run("graph_nodes", Q.Q_GRAPH_NODES, {"labels": labels})]
        edges = [
            {**_p(r[0]), "source": r[1], "target": r[2], "type": r[3]}
            for r in self._run("graph_edges", Q.Q_GRAPH_EDGES, {"labels": labels})
        ]
        return nodes, edges

    def get_node(self, node_id: str) -> dict | None:
        rows = self._run("node_by_id", Q.Q_NODE_BY_ID, {"id": node_id})
        return _node(rows[0][0], rows[0][1]) if rows else None

    def neighbors(self, node_id: str, labels: list[str] | None = None) -> list[dict]:
        labels = labels or Q.VISIBLE_LABELS
        out = []
        for r in self._run("neighbors", Q.Q_NEIGHBORS, {"id": node_id}):
            edge, a, b, rtype = r
            other = b if a.properties.get("id") == node_id else a
            if other.labels[0] not in labels:
                continue
            out.append({"edge": {**_p(edge), "source": a.properties["id"], "target": b.properties["id"], "type": rtype},
                        "node": _node(other)})
        return out

    def overview_nodes(self) -> list[dict]:
        return [_node(r[0], r[1]) for r in self._run("overview_nodes", Q.Q_OVERVIEW_NODES)]

    def incidents(self) -> list[dict]:
        return [_node(r[0], "Incident") for r in self._run("incidents", Q.Q_INCIDENTS)]

    def scenarios(self) -> list[dict]:
        return [_node(r[0], "Incident") for r in self._run("scenarios", Q.Q_SCENARIOS)]

    # ------------------------------------------------------------------ traversal
    def dependency_chain(self, node_id: str, depth: int = 4) -> list[dict]:
        rows = self._run("dependency_chain", Q.q_dependency_chain(depth), {"id": node_id})
        return [{"nodeIds": r[0], "relIds": r[1]} for r in rows]

    def bfs(self, direction: str, start_ids: list[str], max_depth: int = 5, max_nodes: int = 200) -> dict:
        """Bounded breadth-first traversal; each hop is one parameterised Cypher statement."""
        if direction not in ("up", "down"):
            raise ValueError("direction must be 'up' or 'down'")
        q, name = (Q.Q_IMPACT_HOP, "impact_hop") if direction == "down" else (Q.Q_UPSTREAM_HOP, "upstream_hop")
        nodes = {s: {"depth": 0, "parent": None, "via": None, "rtype": None} for s in start_ids}
        edges: dict[str, dict] = {}
        frontier = list(start_ids)
        for d in range(1, Q.clamp_depth(max_depth) + 1):
            if not frontier or len(nodes) >= max_nodes:
                break
            nxt_frontier = []
            for frm, nxt, rel, rtype in self._run(name, q, {"ids": frontier}):
                edges[rel] = {"id": rel, "type": rtype, "from": frm, "to": nxt}
                if nxt not in nodes:
                    nodes[nxt] = {"depth": d, "parent": frm, "via": rel, "rtype": rtype}
                    nxt_frontier.append(nxt)
            frontier = nxt_frontier
        return {"nodes": nodes, "edges": edges}

    @staticmethod
    def path_to(bfs: dict, target: str) -> tuple[list[str], list[str]]:
        """Reconstruct node ids / relationship ids from the BFS parent pointers."""
        if target not in bfs["nodes"]:
            return [], []
        nids, rids, cur = [], [], target
        while cur is not None:
            info = bfs["nodes"][cur]
            nids.append(cur)
            if info["via"]:
                rids.append(info["via"])
            cur = info["parent"]
        return nids[::-1], rids[::-1]

    def confirmed_impact(self, incident_id: str) -> list[dict]:
        return [{"nodeId": r[0], "relId": r[1]}
                for r in self._run("confirmed_impact", Q.Q_CONFIRMED_IMPACT, {"incident_id": incident_id})]

    # ------------------------------------------------------------------ investigation reads
    def entities_by_alias(self, text: str) -> list[dict]:
        out = []
        for n, label, matched in self._run("entities_by_alias", Q.Q_ENTITIES_BY_ALIAS, {"text": text.lower()}):
            d = _node(n, label)
            d["matched"] = matched
            out.append(d)
        return out

    def related_incidents(self, scope_ids: list[str], current: str) -> list[dict]:
        out = []
        for i, shared, fix_id, sim in self._run("related_incidents", Q.Q_RELATED_INCIDENTS,
                                                {"scope": scope_ids, "current": current}):
            out.append({"incident": _node(i, "Incident"), "shared": shared, "fixId": fix_id, "similarLinks": sim})
        return out

    def historical_resolution(self, incident_id: str) -> dict | None:
        rows = self._run("historical_resolution", Q.Q_HISTORICAL_RESOLUTION, {"id": incident_id})
        if not rows or rows[0][0] is None:
            return None
        i, f, tests, docs = rows[0]
        return {"incident": _node(i, "Incident"), "fix": _node(f, "Fix") if f is not None else None,
                "tests": [_node(t, "VerificationTest") for t in tests],
                "documents": [_node(d, "Document") for d in docs]}

    def source_change(self, ids: list[str]) -> list[dict]:
        out: dict[str, dict] = {}
        for s, label, d, p in self._run("source_change", Q.Q_SOURCE_CHANGE, {"ids": ids}):
            rec = out.setdefault(s.properties["id"], {"node": _node(s, label), "documents": [], "changedBy": None})
            if d is not None and d.properties.get("change_json") and d.properties["id"] not in [x["id"] for x in rec["documents"]]:
                rec["documents"].append(_node(d, "Document"))
            if p is not None:
                rec["changedBy"] = _node(p, "Person")
        return list(out.values())

    def owners(self, ids: list[str]) -> list[dict]:
        return [{"nodeId": nid, "owner": _node(o, lbl), "members": [_node(m, "Person") for m in members]}
                for nid, o, lbl, members in self._run("owners", Q.Q_OWNERS, {"ids": ids})]

    def decisions(self, ids: list[str]) -> list[dict]:
        out = []
        for did, name, desc, ref, created, via, nid in self._run("decisions", Q.Q_DECISIONS, {"ids": ids}):
            out.append({"decision": {"id": did, "name": name, "description": desc, "reference": ref,
                                     "created_at": created, "_label": "Decision"},
                        "via": via, "nodeId": nid})
        return out

    def memory_for_nodes(self, ids: list[str]) -> list[dict]:
        return [{**_node(m, "Memory"), "nodeIds": nids} for m, nids in self._run("memory_for_nodes", Q.Q_MEMORY_FOR_NODES, {"ids": ids})]

    def memory_by_key(self, key: str) -> dict | None:
        rows = self._run("memory_by_key", Q.Q_MEMORY_BY_KEY, {"key": key})
        return _node(rows[0][0], "Memory") if rows else None

    def memory_all(self) -> list[dict]:
        return [{**_node(m, "Memory"), "nodeIds": nids} for m, nids in self._run("memory_all", Q.Q_MEMORY_ALL)]

    def memory_one(self, memory_id: str) -> dict | None:
        rows = self._run("memory_one", Q.Q_MEMORY_ONE, {"id": memory_id})
        if not rows:
            return None
        m, nids, inv, sup = rows[0]
        return {**_node(m, "Memory"), "nodeIds": nids, "invalidatedBy": inv, "supportedBy": sup}

    def stale_memory(self) -> list[dict]:
        return [{"memoryId": r[0], "serviceId": r[1], "docId": r[2], "changedAt": r[3], "validFrom": r[4]}
                for r in self._run("stale_memory", Q.Q_STALE_MEMORY)]

    def evidence_all(self) -> list[dict]:
        return [{**_node(e, "Evidence"), "nodeIds": nids} for e, nids in self._run("evidence_all", Q.Q_EVIDENCE_ALL)]

    def evidence_for_incident(self, incident_id: str) -> list[dict]:
        return [{**_node(e, "Evidence"), "nodeIds": nids}
                for e, nids in self._run("evidence_for_incident", Q.Q_EVIDENCE_FOR_INCIDENT, {"incident_id": incident_id})]

    def evidence_for_node(self, node_id: str) -> list[dict]:
        return [_node(r[0], "Evidence") for r in self._run("evidence_for_node", Q.Q_EVIDENCE_FOR_NODE, {"id": node_id})]

    def evidence_path_links(self, incident_id: str) -> list[dict]:
        keys = ["prev_incident", "prev_fix", "fix", "test", "r_similar", "r_prev_fix", "r_fix", "r_test", "r_fix_similar"]
        return [dict(zip(keys, r)) for r in self._run("evidence_path", Q.Q_EVIDENCE_PATH, {"id": incident_id})]

    # ------------------------------------------------------------------ agent state
    def task(self, task_id: str) -> dict | None:
        rows = self._run("task_by_id", Q.Q_TASK_BY_ID, {"id": task_id})
        return _node(rows[0][0], "AgentTask") if rows else None

    def tasks_for_investigation(self, iid: str) -> list[dict]:
        return [_node(r[0], "AgentTask") for r in self._run("tasks_for_investigation", Q.Q_TASKS_FOR_INVESTIGATION, {"iid": iid})]

    def tasks_all(self) -> list[dict]:
        return [_node(r[0], "AgentTask") for r in self._run("tasks_list", Q.Q_TASKS_LIST)]

    def handoff_state(self, verifier_task_id: str) -> dict | None:
        """What the Verification Agent reads from the graph: everything the Investigator wrote."""
        rows = self._run("handoff_state", Q.Q_HANDOFF_STATE, {"verifier_task": verifier_task_id})
        if not rows or rows[0][0] is None:
            return None
        v, inv, approver, i, f, tests, evidence = rows[0]
        return {
            "verifierTask": _node(v, "AgentTask"),
            "investigatorTask": _node(inv, "AgentTask") if inv is not None else None,
            "approver": _node(approver) if approver is not None else None,
            "incident": _node(i, "Incident") if i is not None else None,
            "fix": _node(f, "Fix") if f is not None else None,
            "tests": [_node(t, "VerificationTest") for t in tests],
            "evidence": [_node(e, "Evidence") for e in evidence],
        }

    def fix_for_incident(self, incident_node_id: str) -> dict | None:
        rows = self._run("fix_for_incident", Q.Q_FIX_FOR_INCIDENT, {"id": incident_node_id})
        return _node(rows[0][0], "Fix") if rows else None

    # ------------------------------------------------------------------ writes
    def upsert_node(self, label: str, node_id: str, props: dict) -> None:
        self._run("upsert_node", Q.q_upsert_node(label), {"id": node_id, "props": _clean(props)}, write=True)

    def seed_node(self, label: str, node_id: str, static: dict, mutable: dict, reset_mutables: bool) -> None:
        self._run("seed_node", Q.q_seed_node(label, reset_mutables),
                  {"id": node_id, "static": _clean(static), "mutable": _clean(mutable)}, write=True)

    def upsert_edge(self, rel_type: str, edge_id: str, src: str, dst: str, props: dict | None = None) -> None:
        self._run("upsert_edge", Q.q_upsert_edge(rel_type),
                  {"src": src, "dst": dst, "rid": edge_id, "props": _clean(props or {})}, write=True)

    def set_props(self, node_id: str, props: dict) -> None:
        self._run("set_props", Q.Q_SET_PROPS, {"id": node_id, "props": _clean(props)}, write=True)

    def next_seq(self, label: str) -> int:
        if label not in ("Evidence", "Memory"):
            raise ValueError("seq only for Evidence/Memory")
        rows = self._run("max_seq", Q.Q_MAX_SEQ % label)
        cur = rows[0][0] if rows and rows[0][0] is not None else 0
        return int(cur) + 1

    def delete_agent_generated(self) -> None:
        self._run("delete_agent_generated", Q.Q_DELETE_AGENT_GENERATED, write=True)
