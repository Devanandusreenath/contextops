export type EntityType =
  | "Service"
  | "Dataset"
  | "Pipeline"
  | "Incident"
  | "Person"
  | "Team"
  | "Decision"
  | "Document"
  | "Fix"
  | "Verification Test"
  | "Project";

export interface GraphNode {
  id: string;
  label: string;
  type: EntityType;
  description: string;
  owner?: string;
  evidence?: string[];
  x: number;
  y: number;
}

export type RelationType =
  | "DEPENDS_ON"
  | "PRODUCES"
  | "CONSUMES"
  | "AFFECTED_BY"
  | "OWNED_BY"
  | "RESOLVED_BY"
  | "MEMBER_OF"
  | "DOCUMENTS"
  | "DECIDED"
  | "VERIFIED_BY"
  | "SIMILAR_TO"
  | "CHANGED_BY"
  | "RELATES_TO"
  | "SUPPORTED_BY"
  | "INVALIDATED_BY"
  | "ASSIGNED_TO";

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: RelationType;
}

export type Severity = "SEV1" | "SEV2" | "SEV3";
export type IncidentStatus = "Investigating" | "Mitigated" | "Resolved" | "Open";

export interface Incident {
  id: string;
  nodeId: string;
  title: string;
  system: string;
  severity: Severity;
  status: IncidentStatus;
  updated: string;
}

export type MemoryKind = "Past incident" | "Observation" | "Verified resolution" | "Decision" | "Knowledge conflict";
export type Validity = "Valid" | "Verified" | "Needs review" | "Superseded";

export interface MemoryRecord {
  id: string;
  kind: MemoryKind;
  title: string;
  summary: string;
  source: string;
  incidentId?: string;
  nodeIds: string[];
  created: string;
  updated: string;
  validity: Validity;
  // additive fields provided by the backend
  verificationStatus?: string;
  driftReason?: string;
  origin?: string;
  investigationId?: string;
  recalledFromPriorSession?: boolean;
}

export type EvidenceCategory = "Observed fact" | "Agent hypothesis" | "Proposed action" | "Tested result";
export type VerificationState = "Verified" | "Unverified" | "Proposed" | "Test passed" | "Test failed" | "Requires approval";

export interface EvidenceRecord {
  id: string;
  claim: string;
  category: EvidenceCategory;
  source: string;
  relationship: string;
  incidentId: string;
  state: VerificationState;
  timestamp: string;
  rationale: string;
  nodeIds?: string[];
  investigationId?: string;
}

export type StepStatus = "pending" | "running" | "done";

export interface InvestigationStep {
  id: string;
  title: string;
  detail: string;
  diagnostics?: string[] | undefined;
  nodeIds?: string[] | undefined;
  // additive trace fields
  tool?: string;
  reason?: string;
  durationMs?: number;
  queryNames?: string[];
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  logs: string;
  incidentId?: string;
}

// ---------------------------------------------------------------------------------------------
// Backend-only shapes (mirror backend/app/models/api.py; JSON is camelCase)
// ---------------------------------------------------------------------------------------------
export interface PathResult {
  nodeIds: string[];
  edgeIds: string[];
  derivedFrom?: string[];
}

export interface OverviewMetrics {
  activeIncidents: number;
  connectedSystems: number;
  verifiedResolutions: number;
  knowledgeConflicts: number;
}

export interface OverviewGraph {
  layout: Record<string, { x: number; y: number }>;
  edges: GraphEdge[];
  nodes: GraphNode[];
  metrics: OverviewMetrics;
}

export interface ActivityItem {
  id: string;
  title: string;
  detail: string;
  time: string;
  tone: "primary" | "success" | "warning" | "danger" | "violet" | "muted";
}

export type ExecutionMode = "rules" | "llm";
export type Outcome = "verified" | "partially_verified" | "verification_failed" | "inconclusive" | "awaiting_verification";

export interface AffectedNode {
  nodeId: string;
  label: string;
  type: string;
  impact: "source" | "confirmed" | "potential" | "no_evidence_of_impact" | "upstream";
  depth?: number;
}
export interface DriftCheck { name: string; result: "pass" | "fail" | "warn" | "info"; detail: string }
export interface DriftFinding {
  historicalIncidentId: string;
  historicalFixId?: string;
  verdict: "applicable" | "potentially_stale" | "requires_revalidation" | "not_applicable";
  summary: string;
  checks: DriftCheck[];
  staleMemoryIds: string[];
}
export interface RelatedIncident {
  incidentId: string;
  nodeId: string;
  title: string;
  category?: string;
  sharedEntities: string[];
  rankBasis: string[];
  rankScore: number;
  hasRecordedFix: boolean;
}
export interface AssertionResult { name: string; passed: boolean; detail: string }
export interface TestResult {
  testId: string;
  name: string;
  key: string;
  result: "passed" | "failed" | "not_run";
  passed: number;
  total: number;
  assertions: AssertionResult[];
}
export interface VerificationResult {
  status: "verified" | "partially_verified" | "failed" | "not_run" | "blocked" | "not_applicable";
  summary: string;
  tests: TestResult[];
  passedAssertions: number;
  totalAssertions: number;
  unresolved: string[];
  readBack: Record<string, unknown>;
  executedBy: string;
}
export interface DiffLine { kind: "context" | "remove" | "add"; text: string }
export interface ProposedCorrection {
  fixId: string;
  title: string;
  file: string;
  summary: string;
  diff: DiffLine[];
  status: "proposed";
  requiresHumanApproval: boolean;
  approver?: Record<string, string>;
  note: string;
}
export interface RootCause {
  summary: string;
  status: "hypothesis" | "inconclusive";
  supportLevel: "strong" | "moderate" | "weak" | "insufficient";
  basis: string[];
  supportingEvidenceIds: string[];
  authoredBy: "rules" | "llm";
}
export interface QueryUse { name: string; purpose: string; rowCount: number; durationMs: number }

export interface InvestigationRun {
  investigationId: string;
  scenarioId: string;
  incidentId: string;
  status: "completed" | "failed";
  outcome: Outcome;
  requestedMode: string;
  executionMode: ExecutionMode;
  fallbackReason?: string;
  llmModel?: string;
  syntheticData: boolean;
  startedAt: string;
  finishedAt: string;
  steps: InvestigationStep[];
  graphQueriesUsed: QueryUse[];
  evidence: EvidenceRecord[];
  affectedNodes: AffectedNode[];
  relatedIncidents: RelatedIncident[];
  relevantMemory: MemoryRecord[];
  driftFindings: DriftFinding[];
  rootCause: RootCause;
  proposedCorrection?: ProposedCorrection;
  verification?: VerificationResult;
  remainingUncertainty: string[];
  recommendedNextAction: string;
  failurePath: PathResult;
  evidencePath: PathResult;
  humanApprovalRequired: boolean;
}

export interface TraceQuery { name: string; cypher: string; params: Record<string, unknown>; write: boolean; rowCount: number; durationMs: number }
export interface TraceStep {
  index: number;
  agent: "investigator" | "verifier" | "drift-guard";
  tool: string;
  reason: string;
  arguments: Record<string, unknown>;
  resultSummary: string;
  nodeIds: string[];
  edgeIds: string[];
  queries: TraceQuery[];
  durationMs: number;
}
export interface InvestigationTrace { investigationId: string; executionMode: string; steps: TraceStep[] }
export interface InvestigationSummary {
  investigationId: string;
  scenarioId: string;
  incidentId: string;
  outcome: string;
  executionMode: string;
  startedAt: string;
  finishedAt: string;
}

export interface IntegrationStatus {
  api: { version: string; env: string };
  falkordb: { connected: boolean; graph: string; host: string; port: number; moduleVersion?: string; nodeCount: number; edgeCount: number; seeded: boolean };
  agent: { configuredMode: string; effectiveMode?: string; llmConfigured: boolean; model?: string; fallbackReason?: string; error?: string };
  syntheticData: boolean;
}

export interface RunRequest { scenarioId: string; description: string; logs: string; autoVerify?: boolean }
