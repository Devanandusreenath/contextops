"""Every Cypher statement used by ContextOps lives here, named and parameterised.

Nothing in this module (or anywhere else) executes Cypher supplied by a user or an LLM.
Labels / relationship types that must be interpolated are validated against allow-lists.
Variable-length depth is interpolated only after being clamped to an integer.
"""
from __future__ import annotations

MAX_DEPTH = 6

NODE_LABELS = [
    "Service", "Pipeline", "Dataset", "Incident", "Person", "Team", "Project", "Decision",
    "Document", "Fix", "VerificationTest", "Evidence", "Memory", "AgentTask",
]
REL_TYPES = [
    "DEPENDS_ON", "PRODUCES", "CONSUMES", "AFFECTED_BY", "OWNED_BY", "MEMBER_OF", "RESOLVED_BY",
    "VERIFIED_BY", "SIMILAR_TO", "DOCUMENTS", "DECIDED", "CHANGED_BY", "SUPPORTED_BY",
    "INVALIDATED_BY", "ASSIGNED_TO", "RELATES_TO",
]
# Labels the existing frontend can render (src/types EntityType + Project).
VISIBLE_LABELS = [
    "Service", "Pipeline", "Dataset", "Incident", "Person", "Team", "Project", "Decision",
    "Document", "Fix", "VerificationTest",
]


def clamp_depth(depth: int) -> int:
    return max(1, min(int(depth), MAX_DEPTH))


# ----------------------------------------------------------------------------- reads
Q_GRAPH_NODES = """
MATCH (n) WHERE labels(n)[0] IN $labels
RETURN n, labels(n)[0] AS label
"""

Q_GRAPH_EDGES = """
MATCH (a)-[r]->(b)
WHERE labels(a)[0] IN $labels AND labels(b)[0] IN $labels
RETURN r, a.id AS src, b.id AS dst, type(r) AS rtype
"""

Q_NODE_BY_ID = """
MATCH (n {id: $id}) RETURN n, labels(n)[0] AS label LIMIT 1
"""

Q_NEIGHBORS = """
MATCH (a)-[r]->(b) WHERE a.id = $id OR b.id = $id
RETURN r, a, b, type(r) AS rtype
"""

Q_OVERVIEW_NODES = """
MATCH (n) WHERE n.overview_x IS NOT NULL RETURN n, labels(n)[0] AS label
"""

Q_COUNTS = """
MATCH (n) RETURN labels(n)[0] AS label, count(n) AS c
"""
Q_EDGE_COUNT = "MATCH ()-[r]->() RETURN count(r) AS c"

Q_SCENARIOS = """
MATCH (i:Incident) WHERE i.scenario_id IS NOT NULL RETURN i
"""

Q_INCIDENTS = """
MATCH (i:Incident) RETURN i
"""

# Multi-hop, single-statement dependency chain: what does <id> (transitively) depend on?
def q_dependency_chain(depth: int) -> str:
    d = clamp_depth(depth)
    return f"""
MATCH p = (a {{id: $id}})-[:DEPENDS_ON*1..{d}]->(b)
RETURN [n IN nodes(p) | n.id] AS node_ids, [r IN relationships(p) | r.id] AS rel_ids
"""

# One BFS hop UPSTREAM (what feeds the nodes in $ids?).  Used repeatedly with a bounded depth.
Q_UPSTREAM_HOP = """
MATCH (x)-[r:DEPENDS_ON]->(y) WHERE x.id IN $ids
RETURN x.id AS frm, y.id AS nxt, r.id AS rel, type(r) AS rtype
UNION
MATCH (p)-[r:PRODUCES]->(x) WHERE x.id IN $ids
RETURN x.id AS frm, p.id AS nxt, r.id AS rel, type(r) AS rtype
UNION
MATCH (x)-[r:CONSUMES]->(y) WHERE x.id IN $ids
RETURN x.id AS frm, y.id AS nxt, r.id AS rel, type(r) AS rtype
"""

# One BFS hop DOWNSTREAM (what is exposed to a failure of the nodes in $ids?).
#   X DEPENDS_ON Y   -> failure of Y reaches X
#   Y PRODUCES  D    -> failure of Y reaches D
#   X CONSUMES  Y    -> failure of Y reaches X
Q_IMPACT_HOP = """
MATCH (d)-[r:DEPENDS_ON]->(s) WHERE s.id IN $ids
RETURN s.id AS frm, d.id AS nxt, r.id AS rel, type(r) AS rtype
UNION
MATCH (s)-[r:PRODUCES]->(d) WHERE s.id IN $ids
RETURN s.id AS frm, d.id AS nxt, r.id AS rel, type(r) AS rtype
UNION
MATCH (d)-[r:CONSUMES]->(s) WHERE s.id IN $ids
RETURN s.id AS frm, d.id AS nxt, r.id AS rel, type(r) AS rtype
"""

# Entities that the incident record says were affected (recorded impact, not inference).
Q_CONFIRMED_IMPACT = """
MATCH (s)-[r:AFFECTED_BY]->(i:Incident {id: $incident_id})
RETURN s.id AS node_id, r.id AS rel
"""

Q_ENTITIES_BY_ALIAS = """
MATCH (n)
WHERE n.aliases IS NOT NULL AND any(a IN n.aliases WHERE $text CONTAINS a)
RETURN n, labels(n)[0] AS label,
       [a IN n.aliases WHERE $text CONTAINS a] AS matched
"""

Q_RELATED_INCIDENTS = """
MATCH (s)-[:AFFECTED_BY]->(i:Incident)
WHERE s.id IN $scope AND i.id <> $current
WITH i, collect(DISTINCT s.id) AS shared
OPTIONAL MATCH (i)-[:RESOLVED_BY]->(f:Fix)
OPTIONAL MATCH (i)-[sim:SIMILAR_TO]-(c:Incident {id: $current})
RETURN i, shared, f.id AS fix_id, count(sim) AS similar_links
"""

Q_HISTORICAL_RESOLUTION = """
MATCH (i:Incident {id: $id})
OPTIONAL MATCH (i)-[:RESOLVED_BY]->(f:Fix)
OPTIONAL MATCH (f)-[:VERIFIED_BY]->(t:VerificationTest)
OPTIONAL MATCH (d:Document)-[:DOCUMENTS]->(i)
RETURN i, f, collect(DISTINCT t) AS tests, collect(DISTINCT d) AS docs
"""

Q_SOURCE_CHANGE = """
MATCH (s) WHERE s.id IN $ids
OPTIONAL MATCH (d:Document)-[:DOCUMENTS]->(s)
OPTIONAL MATCH (s)-[:CHANGED_BY]->(p:Person)
RETURN s, labels(s)[0] AS label, d, p
"""

Q_OWNERS = """
MATCH (n)-[:OWNED_BY]->(o) WHERE n.id IN $ids
OPTIONAL MATCH (m:Person)-[:MEMBER_OF]->(o)
RETURN n.id AS node_id, o, labels(o)[0] AS owner_label, collect(DISTINCT m) AS members
"""

Q_DECISIONS = """
MATCH (n)-[:OWNED_BY]->(t:Team)-[:DECIDED]->(d:Decision) WHERE n.id IN $ids
RETURN d.id AS did, d.name AS name, d.description AS description, d.reference AS reference,
       d.created_at AS created_at, 'via owning team ' + t.name AS via, n.id AS node_id
UNION
MATCH (d:Decision)-[:RELATES_TO]->(n) WHERE n.id IN $ids
RETURN d.id AS did, d.name AS name, d.description AS description, d.reference AS reference,
       d.created_at AS created_at, 'direct link' AS via, n.id AS node_id
"""

Q_MEMORY_FOR_NODES = """
MATCH (m:Memory)-[:RELATES_TO]->(n) WHERE n.id IN $ids
WITH DISTINCT m
OPTIONAL MATCH (m)-[:RELATES_TO]->(x)
RETURN m, collect(DISTINCT x.id) AS node_ids
"""

Q_MEMORY_BY_KEY = "MATCH (m:Memory {memory_key: $key}) RETURN m"

Q_MEMORY_ALL = """
MATCH (m:Memory)
OPTIONAL MATCH (m)-[:RELATES_TO]->(x)
RETURN m, collect(DISTINCT x.id) AS node_ids
"""

Q_MEMORY_ONE = """
MATCH (m:Memory {id: $id})
OPTIONAL MATCH (m)-[:RELATES_TO]->(x)
OPTIONAL MATCH (m)-[:INVALIDATED_BY]->(inv)
OPTIONAL MATCH (m)-[:SUPPORTED_BY]->(sup)
RETURN m, collect(DISTINCT x.id) AS node_ids, collect(DISTINCT inv.id) AS invalidated_by,
       collect(DISTINCT sup.id) AS supported_by
"""

# Context-drift query: a Memory is potentially stale when anything it is about (or that
# its subject transitively DEPENDS_ON) has a documented change newer than the memory.
Q_STALE_MEMORY = """
MATCH (m:Memory)-[:RELATES_TO]->(x)
WHERE m.kind IN ['Verified resolution', 'Observation', 'Knowledge conflict']
  AND m.validity_status IN ['valid', 'verified']
MATCH (x)-[:DEPENDS_ON*0..3]->(s:Service)<-[:DOCUMENTS]-(d:Document)
WHERE d.effective_at IS NOT NULL AND d.effective_at > m.valid_from
RETURN DISTINCT m.id AS memory_id, s.id AS service_id, d.id AS doc_id,
       d.effective_at AS changed_at, m.valid_from AS valid_from
"""

Q_EVIDENCE_FOR_INCIDENT = """
MATCH (e:Evidence) WHERE e.incident_id = $incident_id
OPTIONAL MATCH (e)-[:RELATES_TO]->(x)
RETURN e, collect(DISTINCT x.id) AS node_ids
"""

Q_EVIDENCE_ALL = """
MATCH (e:Evidence)
OPTIONAL MATCH (e)-[:RELATES_TO]->(x)
RETURN e, collect(DISTINCT x.id) AS node_ids
"""

Q_EVIDENCE_FOR_NODE = """
MATCH (e:Evidence)-[:RELATES_TO]->(n {id: $id}) RETURN e
"""

Q_EVIDENCE_PATH = """
MATCH (i:Incident {id: $id})
OPTIONAL MATCH (i)-[r1:SIMILAR_TO]->(pi:Incident)
OPTIONAL MATCH (pi)-[r2:RESOLVED_BY]->(pf:Fix)
OPTIONAL MATCH (i)-[r3:RESOLVED_BY]->(f:Fix)
OPTIONAL MATCH (f)-[r4:VERIFIED_BY]->(t:VerificationTest)
OPTIONAL MATCH (f)-[r5:SIMILAR_TO]->(pf)
RETURN pi.id AS prev_incident, pf.id AS prev_fix, f.id AS fix, t.id AS test,
       r1.id AS r_similar, r2.id AS r_prev_fix, r3.id AS r_fix, r4.id AS r_test, r5.id AS r_fix_similar
"""

# --- shared agent state -------------------------------------------------------------
Q_TASK_BY_ID = "MATCH (t:AgentTask {id: $id}) RETURN t"
Q_TASKS_FOR_INVESTIGATION = """
MATCH (t:AgentTask {investigation_id: $iid}) RETURN t
"""
Q_TASKS_LIST = "MATCH (t:AgentTask) RETURN t"
Q_HANDOFF_STATE = """
MATCH (v:AgentTask {id: $verifier_task})
OPTIONAL MATCH (inv:AgentTask)-[h:RELATES_TO {kind: 'handoff'}]->(v)
OPTIONAL MATCH (v)-[:ASSIGNED_TO]->(approver)
OPTIONAL MATCH (v)-[:RELATES_TO {kind: 'subject'}]->(i:Incident)
OPTIONAL MATCH (i)-[:RESOLVED_BY]->(f:Fix)
OPTIONAL MATCH (f)-[:VERIFIED_BY]->(t:VerificationTest)
OPTIONAL MATCH (f)-[:SUPPORTED_BY]->(e:Evidence)
RETURN v, inv, approver, i, f, collect(DISTINCT t) AS tests, collect(DISTINCT e) AS evidence
"""
Q_MAX_SEQ = "MATCH (n:%s) RETURN max(n.seq) AS m"
Q_LATEST_INVESTIGATION = """
MATCH (t:AgentTask {role: 'investigator'}) RETURN t ORDER BY t.created_at DESC LIMIT 1
"""

# ----------------------------------------------------------------------------- writes
def q_upsert_node(label: str) -> str:
    if label not in NODE_LABELS:
        raise ValueError(f"label not allowed: {label}")
    return f"MERGE (n:{label} {{id: $id}}) SET n += $props RETURN n.id AS id"


def q_create_node_if_absent(label: str) -> str:
    if label not in NODE_LABELS:
        raise ValueError(f"label not allowed: {label}")
    return f"MERGE (n:{label} {{id: $id}}) ON CREATE SET n += $props RETURN n.id AS id"


def q_upsert_edge(rel_type: str) -> str:
    if rel_type not in REL_TYPES:
        raise ValueError(f"relationship type not allowed: {rel_type}")
    return (
        "MATCH (a {id: $src}), (b {id: $dst}) "
        f"MERGE (a)-[r:{rel_type} {{id: $rid}}]->(b) SET r += $props RETURN r.id AS id"
    )


Q_SET_PROPS = "MATCH (n {id: $id}) SET n += $props RETURN n.id AS id"
Q_DELETE_AGENT_GENERATED = "MATCH (n) WHERE n.origin = 'agent' DETACH DELETE n"

INDEX_STATEMENTS = [f"CREATE INDEX FOR (n:{l}) ON (n.id)" for l in NODE_LABELS]


def q_seed_node(label: str, reset_mutables: bool) -> str:
    """Idempotent seed: static props always refreshed, runtime-mutable props only on CREATE
    (unless an explicit reset was requested)."""
    if label not in NODE_LABELS:
        raise ValueError(f"label not allowed: {label}")
    if reset_mutables:
        return f"MERGE (n:{label} {{id: $id}}) SET n += $static, n += $mutable RETURN n.id AS id"
    return f"MERGE (n:{label} {{id: $id}}) ON CREATE SET n += $mutable SET n += $static RETURN n.id AS id"

Q_FIX_FOR_INCIDENT = "MATCH (i:Incident {id: $id})-[:RESOLVED_BY]->(f:Fix) RETURN f"
