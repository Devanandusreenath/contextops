"""API schemas. Field names serialise as camelCase to match the frontend's TypeScript types
(src/types/index.ts). Extra fields beyond those types are additive."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel


class Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


EntityType = Literal["Service", "Dataset", "Pipeline", "Incident", "Person", "Team", "Decision", "Document",
                     "Fix", "Verification Test", "Project"]


# ------------------------------------------------------------------- graph (TS: GraphNode/GraphEdge)
class GraphNode(Camel):
    id: str
    label: str
    type: EntityType
    description: str
    owner: str | None = None
    evidence: list[str] | None = None
    x: float
    y: float


class GraphEdge(Camel):
    id: str
    source: str
    target: str
    type: str


class GraphResponse(Camel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    synthetic_data: bool = True


class Neighbor(Camel):
    edge: GraphEdge
    node: GraphNode


class PathResponse(Camel):
    node_ids: list[str]
    edge_ids: list[str]
    derived_from: list[str] = Field(default_factory=list, description="Names of the Cypher queries that produced the path")


class OverviewMetrics(Camel):
    active_incidents: int
    connected_systems: int
    verified_resolutions: int
    knowledge_conflicts: int


class XY(Camel):
    x: float
    y: float


class OverviewResponse(Camel):
    layout: dict[str, XY]
    edges: list[GraphEdge]
    nodes: list[GraphNode]
    metrics: OverviewMetrics


# ------------------------------------------------------------------- dashboard lists
class Incident(Camel):
    id: str
    node_id: str
    title: str
    system: str
    severity: str
    status: str
    updated: str


class ActivityItem(Camel):
    id: str
    title: str
    detail: str
    time: str
    tone: Literal["primary", "success", "warning", "danger", "violet", "muted"] = "primary"


class Scenario(Camel):
    id: str
    name: str
    description: str
    logs: str
    incident_id: str | None = None


class MemoryRecord(Camel):
    id: str
    kind: str
    title: str
    summary: str
    source: str
    incident_id: str | None = None
    node_ids: list[str]
    created: str
    updated: str
    validity: Literal["Valid", "Verified", "Needs review", "Superseded"]
    # additive
    verification_status: str | None = None
    drift_reason: str | None = None
    origin: str | None = None
    investigation_id: str | None = None
    recalled_from_prior_session: bool = False


class EvidenceRecord(Camel):
    id: str
    claim: str
    category: Literal["Observed fact", "Agent hypothesis", "Proposed action", "Tested result"]
    source: str
    relationship: str
    incident_id: str
    state: Literal["Verified", "Unverified", "Proposed", "Test passed", "Test failed", "Requires approval"]
    timestamp: str
    rationale: str
    # additive
    node_ids: list[str] = Field(default_factory=list)
    investigation_id: str | None = None


class InvestigationStep(Camel):
    id: str
    title: str
    detail: str
    diagnostics: list[str] | None = None
    node_ids: list[str] | None = None
    # additive (trace detail)
    tool: str | None = None
    reason: str | None = None
    duration_ms: float | None = None
    query_names: list[str] | None = None


# ------------------------------------------------------------------- investigation
class RunRequest(Camel):
    scenario_id: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9][a-z0-9\-_]*$")
    description: str = Field(min_length=10, max_length=4000)
    logs: str = Field(min_length=1, max_length=20000)
    auto_verify: bool = True

    @field_validator("description", "logs")
    @classmethod
    def _no_nul(cls, v: str) -> str:
        if "\x00" in v:
            raise ValueError("must not contain NUL characters")
        return v


class AffectedNode(Camel):
    node_id: str
    label: str
    type: str
    impact: Literal["source", "confirmed", "potential", "no_evidence_of_impact", "upstream"]
    depth: int | None = None


class QueryUse(Camel):
    name: str
    purpose: str
    row_count: int
    duration_ms: float


class RootCause(Camel):
    summary: str
    status: Literal["hypothesis", "inconclusive"]
    support_level: Literal["strong", "moderate", "weak", "insufficient"]
    basis: list[str]
    supporting_evidence_ids: list[str] = Field(default_factory=list)
    authored_by: Literal["rules", "llm"] = "rules"


class DiffLine(Camel):
    kind: Literal["context", "remove", "add"]
    text: str


class ProposedCorrection(Camel):
    fix_id: str
    title: str
    file: str
    summary: str
    diff: list[DiffLine]
    status: Literal["proposed"] = "proposed"
    requires_human_approval: bool = True
    approver: dict[str, str] | None = None
    note: str = "ContextOps never modifies external systems; this change is for human review."


class DriftCheck(Camel):
    name: str
    result: Literal["pass", "fail", "warn", "info"]
    detail: str


class DriftFinding(Camel):
    historical_incident_id: str
    historical_fix_id: str | None
    verdict: Literal["applicable", "potentially_stale", "requires_revalidation", "not_applicable"]
    summary: str
    checks: list[DriftCheck]
    stale_memory_ids: list[str] = Field(default_factory=list)


class RelatedIncident(Camel):
    incident_id: str
    node_id: str
    title: str
    category: str | None
    shared_entities: list[str]
    rank_basis: list[str]
    rank_score: int
    has_recorded_fix: bool


class AssertionResult(Camel):
    name: str
    passed: bool
    detail: str


class TestResult(Camel):
    test_id: str
    name: str
    key: str
    result: Literal["passed", "failed", "not_run"]
    passed: int
    total: int
    assertions: list[AssertionResult]


class VerificationResult(Camel):
    status: Literal["verified", "partially_verified", "failed", "not_run", "blocked", "not_applicable"]
    summary: str
    tests: list[TestResult]
    passed_assertions: int
    total_assertions: int
    unresolved: list[str]
    read_back: dict[str, Any] = Field(default_factory=dict, description="What the Verification Agent read from FalkorDB")
    executed_by: str = "verification-agent (deterministic)"


class InvestigationRun(Camel):
    investigation_id: str
    scenario_id: str
    incident_id: str
    status: Literal["completed", "failed"]
    outcome: Literal["verified", "partially_verified", "verification_failed", "inconclusive", "awaiting_verification"]
    requested_mode: str
    execution_mode: Literal["rules", "llm"]
    fallback_reason: str | None = None
    llm_model: str | None = None
    synthetic_data: bool = True
    started_at: str
    finished_at: str
    steps: list[InvestigationStep]
    graph_queries_used: list[QueryUse]
    evidence: list[EvidenceRecord]
    affected_nodes: list[AffectedNode]
    related_incidents: list[RelatedIncident]
    relevant_memory: list[MemoryRecord]
    drift_findings: list[DriftFinding]
    root_cause: RootCause
    proposed_correction: ProposedCorrection | None
    verification: VerificationResult | None
    remaining_uncertainty: list[str]
    recommended_next_action: str
    failure_path: PathResponse
    evidence_path: PathResponse
    human_approval_required: bool = True


class InvestigationSummary(Camel):
    investigation_id: str
    scenario_id: str
    incident_id: str
    outcome: str
    execution_mode: str
    started_at: str
    finished_at: str


class TraceQuery(Camel):
    name: str
    cypher: str
    params: dict[str, Any]
    write: bool
    row_count: int
    duration_ms: float


class TraceStep(Camel):
    index: int
    agent: Literal["investigator", "verifier", "drift-guard"]
    tool: str
    reason: str
    arguments: dict[str, Any]
    result_summary: str
    node_ids: list[str]
    edge_ids: list[str]
    queries: list[TraceQuery]
    duration_ms: float


class InvestigationTrace(Camel):
    investigation_id: str
    execution_mode: str
    steps: list[TraceStep]


class MemoryReview(Camel):
    decision: Literal["confirm_valid", "needs_review", "superseded"]
    note: str = Field(default="", max_length=500)


class SimulateRelease(Camel):
    service_id: str = Field(pattern=r"^[a-z0-9][a-z0-9\-_]{0,40}$")
    version: str = Field(pattern=r"^[0-9]{1,3}(\.[0-9]{1,3}){0,2}$")
    renamed_fields: list[dict[str, str]] = Field(min_length=1, max_length=5)

    @field_validator("renamed_fields")
    @classmethod
    def _fields(cls, v):
        import re
        for item in v:
            if set(item) != {"from", "to"} or not all(re.fullmatch(r"[a-z_][a-z0-9_]{0,40}", s) for s in item.values()):
                raise ValueError("each item must be {from, to} with snake_case names")
        return v
