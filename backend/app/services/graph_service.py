"""Read-side graph logic for the REST API (paths, overview, metrics)."""
from __future__ import annotations

import json

from app.graph.repository import GraphRepository
from app.services import mappers


class GraphService:
    def __init__(self, repo: GraphRepository):
        self.repo = repo

    # ---------------------------------------------------------------- paths
    def failure_path(self, incident_node_id: str = "inc-2041", source: str | None = None) -> dict:
        repo = self.repo
        inc = repo.get_node(incident_node_id)
        if not inc or inc["_label"] != "Incident":
            return {"nodeIds": [], "edgeIds": [], "derivedFrom": []}
        confirmed = repo.confirmed_impact(incident_node_id)
        if not confirmed:
            return {"nodeIds": [], "edgeIds": [], "derivedFrom": ["confirmed_impact"]}
        if not source:
            up = repo.bfs("up", [c["nodeId"] for c in confirmed], 6)
            recs = repo.source_change(list(up["nodes"]))
            docs = [(d["effective_at"], r["node"]["id"]) for r in recs for d in r["documents"]
                    if d.get("effective_at") and d["effective_at"] <= (inc.get("observed_at") or "9999")]
            source = max(docs)[1] if docs else max(up["nodes"], key=lambda k: up["nodes"][k]["depth"])
        bfs = repo.bfs("down", [source], 6)
        pn: dict[str, int] = {}
        pe: list[str] = []
        for c in confirmed:
            nids, rids = repo.path_to(bfs, c["nodeId"])
            for n in nids:
                pn[n] = bfs["nodes"][n]["depth"]
            pe += rids
        nodes = sorted(pn, key=lambda n: (pn[n], n))
        edges = list(dict.fromkeys(pe + [c["relId"] for c in confirmed if c["nodeId"] in pn]))
        return {"nodeIds": nodes + ([incident_node_id] if pn else []), "edgeIds": edges,
                "derivedFrom": ["source_change", "impact_hop", "confirmed_impact"]}

    def demo_path(self, incident_node_id: str = "inc-2041") -> dict:
        p = self.failure_path(incident_node_id)
        nodes, edges = list(p["nodeIds"]), list(p["edgeIds"])
        for l in self.repo.evidence_path_links(incident_node_id):
            nodes += [l[k] for k in ("prev_incident", "prev_fix", "fix", "test") if l[k]]
            edges += [l[k] for k in ("r_similar", "r_prev_fix", "r_fix", "r_test", "r_fix_similar") if l[k]]
        return {"nodeIds": list(dict.fromkeys(nodes)), "edgeIds": list(dict.fromkeys(edges)),
                "derivedFrom": p["derivedFrom"] + ["evidence_path"]}

    # ---------------------------------------------------------------- overview / metrics
    def metrics(self) -> dict:
        repo = self.repo
        counts = repo.counts()
        mem = repo.memory_all()
        incs = repo.incidents()
        return {
            "activeIncidents": sum(1 for i in incs if i.get("status") in ("Open", "Investigating")),
            "connectedSystems": counts.get("Service", 0) + counts.get("Pipeline", 0) + counts.get("Dataset", 0),
            "verifiedResolutions": sum(1 for m in mem if m.get("kind") == "Verified resolution" and m.get("verification_status") == "verified"),
            "knowledgeConflicts": sum(1 for m in mem if m.get("kind") == "Knowledge conflict"),
        }

    def overview(self) -> dict:
        nodes = self.repo.overview_nodes()
        ids = {n["id"] for n in nodes}
        _, edges = self.repo.graph_view()
        return {
            "layout": {n["id"]: {"x": n["overview_x"], "y": n["overview_y"]} for n in nodes},
            "edges": [mappers.graph_edge(e) for e in edges if e["source"] in ids and e["target"] in ids],
            "nodes": [mappers.graph_node({**n, "x": n["overview_x"], "y": n["overview_y"]}) for n in nodes],
            "metrics": self.metrics(),
        }
