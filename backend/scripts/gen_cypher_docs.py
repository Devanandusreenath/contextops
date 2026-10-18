"""Generate docs/cypher-queries.md from the REAL query constants, running each read query against a
seeded graph so the documented examples are actual results.   python -m scripts.gen_cypher_docs"""
import json
import sys
import textwrap
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import get_settings  # noqa: E402
from app.graph import queries as Q  # noqa: E402
from app.graph.client import GraphClient  # noqa: E402
from app.graph.repository import GraphRepository  # noqa: E402
from app.graph.seed import reset_agent_runs  # noqa: E402
from app.models.api import RunRequest  # noqa: E402
from app.services.investigation_service import InvestigationService  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "docs" / "cypher-queries.md"


def simp(v):
    if hasattr(v, "properties") and hasattr(v, "labels"):
        return {"node": v.labels[0], "id": v.properties.get("id")}
    if hasattr(v, "properties"):
        return {"rel": v.properties.get("id")}
    if isinstance(v, list):
        return [simp(x) for x in v]
    return v


s = get_settings().model_copy(update={"agent_mode": "rules", "falkordb_graph": "contextops_docgen"})
c = GraphClient(s)
c.connect()
c.delete_graph()
repo = GraphRepository(c)
reset_agent_runs(repo)
svc = InvestigationService(repo, s)
sc = next(x for x in repo.scenarios() if x["scenario_id"] == "field-rename")
run = svc.run(RunRequest(scenarioId="field-rename", description=sc["scenario_description"], logs=sc["scenario_logs"]))
VT = f"task-{run.investigation_id}-verifier"
TEXT = "02:14 deploy event-service v4.2; normalizer ERROR KeyError 'amount_cents'; finance-etl failed"

CATALOG = [
    ("Graph — nodes", "Q_GRAPH_NODES", Q.Q_GRAPH_NODES, {"labels": Q.VISIBLE_LABELS},
     "Load all entities the UI can render.", "One row per node: the node and its first label."),
    ("Graph — edges", "Q_GRAPH_EDGES", Q.Q_GRAPH_EDGES, {"labels": Q.VISIBLE_LABELS},
     "Load relationships whose two endpoints are both visible; preserves relationship ids and direction.", "One row per relationship with src/dst ids and type."),
    ("Node by id", "Q_NODE_BY_ID", Q.Q_NODE_BY_ID, {"id": "svc-event"}, "Fetch one node.", "At most one row."),
    ("Neighbours", "Q_NEIGHBORS", Q.Q_NEIGHBORS, {"id": "svc-event"}, "All relationships touching a node (either direction).", "One row per relationship with both endpoints."),
    ("Overview nodes", "Q_OVERVIEW_NODES", Q.Q_OVERVIEW_NODES, {}, "Nodes flagged for the dashboard overview layout.", "9 nodes."),
    ("Label counts", "Q_COUNTS", Q.Q_COUNTS, {}, "Readiness/status counts.", "One row per label."),
    ("Scenarios (incident records)", "Q_SCENARIOS", Q.Q_SCENARIOS, {}, "Scenarios are stored on Incident nodes.", "One row per scenario incident."),
    ("Multi-hop dependency chain (variable length)", "q_dependency_chain(4)", Q.q_dependency_chain(4), {"id": "pipe-finance"},
     "Single-statement multi-hop traversal: everything `pipe-finance` transitively DEPENDS_ON. Depth is clamped to 1..6 before interpolation.",
     "One row per path: ordered node ids and relationship ids."),
    ("Upstream hop", "Q_UPSTREAM_HOP", Q.Q_UPSTREAM_HOP, {"ids": ["rep-finance"]},
     "One bounded BFS hop upstream over DEPENDS_ON / PRODUCES (reverse) / CONSUMES. The repository repeats it up to the depth limit.",
     "frm, nxt, rel id, relationship type."),
    ("Impact hop (blast radius)", "Q_IMPACT_HOP", Q.Q_IMPACT_HOP, {"ids": ["svc-event"]},
     "One bounded BFS hop downstream: who is exposed if the given nodes fail (X DEPENDS_ON Y → Y reaches X; Y PRODUCES D → Y reaches D; X CONSUMES Y → Y reaches X).",
     "frm, nxt, rel id, relationship type."),
    ("Recorded impact", "Q_CONFIRMED_IMPACT", Q.Q_CONFIRMED_IMPACT, {"incident_id": "inc-2041"}, "Entities the incident record says were affected (evidence, not inference).", "node id + relationship id."),
    ("Entity resolution", "Q_ENTITIES_BY_ALIAS", Q.Q_ENTITIES_BY_ALIAS, {"text": TEXT}, "Match systems named in free text via their `aliases` property.", "Matched node + matched aliases."),
    ("Related incidents", "Q_RELATED_INCIDENTS", Q.Q_RELATED_INCIDENTS, {"scope": ["svc-normalizer", "pipe-finance", "svc-event"], "current": "inc-2041"},
     "Earlier incidents that AFFECTED entities in scope, with their resolution and any curated SIMILAR_TO link.", "incident, shared entity ids, fix id, similar-link count."),
    ("Historical resolution", "Q_HISTORICAL_RESOLUTION", Q.Q_HISTORICAL_RESOLUTION, {"id": "inc-1873"}, "Cause, fix, verification test(s) and source document(s) of a precedent.", "incident, fix, tests[], documents[]."),
    ("Source change", "Q_SOURCE_CHANGE", Q.Q_SOURCE_CHANGE, {"ids": ["svc-event"]}, "Documented changes (Document -DOCUMENTS→ Service) and the author (CHANGED_BY).", "service, document, person."),
    ("Owners", "Q_OWNERS", Q.Q_OWNERS, {"ids": ["svc-event", "inc-2041"]}, "OWNED_BY targets and team members.", "node id, owner, members[]."),
    ("Decisions", "Q_DECISIONS", Q.Q_DECISIONS, {"ids": ["svc-event", "svc-normalizer"]}, "Decisions linked via the owning team's DECIDED edge or a direct RELATES_TO.", "decision props, how it is linked."),
    ("Memory for nodes", "Q_MEMORY_FOR_NODES", Q.Q_MEMORY_FOR_NODES, {"ids": ["svc-normalizer"]}, "Persistent memory records about these entities.", "memory node + all linked node ids."),
    ("Memory by key", "Q_MEMORY_BY_KEY", Q.Q_MEMORY_BY_KEY, {"key": "inc-2041|outcome"}, "Idempotent upsert lookup for agent-written memory.", "0 or 1 row."),
    ("All memory", "Q_MEMORY_ALL", Q.Q_MEMORY_ALL, {}, "Memory page.", "One row per memory."),
    ("One memory with provenance", "Q_MEMORY_ONE", Q.Q_MEMORY_ONE, {"id": "M-103"}, "Memory plus RELATES_TO / INVALIDATED_BY / SUPPORTED_BY targets.", "memory, node ids, invalidators, supporters."),
    ("Stale memory (Context Drift Guard)", "Q_STALE_MEMORY", Q.Q_STALE_MEMORY, {},
     "A memory is potentially stale when anything it is about, or that its subject transitively DEPENDS_ON (0..3 hops), has a documented change newer than the memory's valid_from.",
     "memory id, changed service, change document, timestamps."),
    ("Evidence for incident", "Q_EVIDENCE_FOR_INCIDENT", Q.Q_EVIDENCE_FOR_INCIDENT, {"incident_id": "INC-2041"}, "Evidence records and the entities they relate to.", "evidence + node ids."),
    ("Evidence for node", "Q_EVIDENCE_FOR_NODE", Q.Q_EVIDENCE_FOR_NODE, {"id": "svc-event"}, "Evidence linked to an entity.", "evidence rows."),
    ("Evidence path", "Q_EVIDENCE_PATH", Q.Q_EVIDENCE_PATH, {"id": "inc-2041"}, "Precedent, fixes and tests connected to an incident; used to highlight the demo path.", "ids of precedent/fix/test and relationship ids."),
    ("Task by id", "Q_TASK_BY_ID", Q.Q_TASK_BY_ID, {"id": f"task-{run.investigation_id}-investigator"}, "Read an AgentTask.", "one row."),
    ("Tasks for an investigation", "Q_TASKS_FOR_INVESTIGATION", Q.Q_TASKS_FOR_INVESTIGATION, {"iid": run.investigation_id}, "Shared agent task state.", "investigator + verifier tasks."),
    ("Handoff state (Verification Agent input)", "Q_HANDOFF_STATE", Q.Q_HANDOFF_STATE, {"verifier_task": VT},
     "Everything the Verification Agent reads from the graph: verifier task, investigator task (handoff edge), approver (ASSIGNED_TO), incident, fix, tests, evidence.",
     "One row: task, investigator task, approver, incident, fix, tests[], evidence[]."),
    ("Fix for incident", "Q_FIX_FOR_INCIDENT", Q.Q_FIX_FOR_INCIDENT, {"id": "inc-2041"}, "Resolve the RESOLVED_BY fix of an incident.", "one row."),
    ("Latest investigation", "Q_LATEST_INVESTIGATION", Q.Q_LATEST_INVESTIGATION, {}, "Most recent investigator task.", "one row."),
]

WRITES = [
    ("Upsert node (template)", Q.q_upsert_node("Service"), "Label is validated against `NODE_LABELS` before interpolation; properties are a bound map."),
    ("Seed node (template)", Q.q_seed_node("Service", False), "Static properties refreshed; runtime-mutable properties only set on CREATE, so restarts never clobber agent state."),
    ("Upsert relationship (template)", Q.q_upsert_edge("DEPENDS_ON"), "Type validated against `REL_TYPES`; MERGE on the relationship `id` makes it idempotent."),
    ("Set properties", Q.Q_SET_PROPS, "Used for test results, fix verification status, memory validity and drift flags."),
    ("Delete agent-generated data", Q.Q_DELETE_AGENT_GENERATED, "Only run by `scripts/reset_graph.py --runs-only` after confirmation."),
]

md = ["# Cypher queries used by ContextOps", "",
      "> Generated by `python -m scripts.gen_cypher_docs` from `backend/app/graph/queries.py`. The example results below were produced by "
      "running each query against a freshly seeded graph after one investigation. Nothing here is hand-written output.", "",
      "All queries are **named, parameterised** and executed only from `GraphRepository`. There is no endpoint or tool that executes user- or "
      "LLM-supplied Cypher. Read queries use `ro_query`. The only values interpolated into query text are labels / relationship types "
      "(validated against allow-lists) and a traversal depth (clamped to an integer 1..6).", ""]
for title, name, cy, params, purpose, expected in CATALOG:
    try:
        rows = c.graph.ro_query(cy, params).result_set
        ex = json.dumps([[simp(x) for x in r] for r in rows[:2]], default=str)
        n = len(rows)
    except Exception as e:  # noqa: BLE001
        ex, n = f"ERROR: {e}", 0
    if len(ex) > 700:
        ex = ex[:700] + " …"
    md += [f"## {title}", f"`{name}`", "", f"**Purpose:** {purpose}  ", f"**Expected result:** {expected}  ",
           f"**Example parameters:** `{json.dumps(params)[:300]}`", "", "```cypher", textwrap.dedent(cy).strip(), "```", "",
           f"**Example result ({n} row(s); first 2 shown):**", "", "```json", ex, "```", ""]
md += ["# Write statements", ""]
for title, cy, note in WRITES:
    md += [f"## {title}", note, "", "```cypher", textwrap.dedent(cy).strip(), "```", ""]
md += ["# Index statements", "", "```cypher", *Q.INDEX_STATEMENTS[:3], "// … one per node label", "```", ""]
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text("\n".join(md))
c.delete_graph()
print("wrote", OUT, len(md), "lines")
