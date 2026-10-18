"""Idempotent graph seeding. Safe to run on every start-up."""
from __future__ import annotations

from app.graph.repository import GraphRepository
from app.graph.seed_data import EDGES, MEMORY, MUTABLE_KEYS, NODES


def seed_graph(repo: GraphRepository, reset_mutables: bool = False) -> dict:
    repo.ensure_indexes()
    for n in NODES + MEMORY:
        static = {k: v for k, v in n["props"].items() if k not in MUTABLE_KEYS}
        mutable = {k: v for k, v in n["props"].items() if k in MUTABLE_KEYS}
        repo.seed_node(n["label"], n["id"], static, mutable, reset_mutables)
    for e in EDGES:
        repo.upsert_edge(e["type"], e["id"], e["src"], e["dst"], e["props"])
    counts = repo.counts()
    return {"nodes": sum(counts.values()), "edges": repo.edge_count(), "byLabel": counts}


def is_seeded(repo: GraphRepository) -> bool:
    return repo.counts().get("Incident", 0) > 0


def reset_agent_runs(repo: GraphRepository) -> dict:
    """Delete everything agents created (origin='agent') and restore seed mutable state."""
    repo.delete_agent_generated()
    return seed_graph(repo, reset_mutables=True)
