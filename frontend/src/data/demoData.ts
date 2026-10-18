import type {
  EvidenceRecord,
  GraphEdge,
  GraphNode,
  Incident,
  InvestigationStep,
  MemoryRecord,
  Scenario,
} from "@/types";

// All records below are fictional demonstration data.

export const nodes: GraphNode[] = [
  { id: "svc-gateway", label: "API Gateway", type: "Service", x: 80, y: 120, owner: "Platform Team", description: "Edge entry point that routes client traffic to internal services.", evidence: ["Routing config v12"] },
  { id: "svc-event", label: "Event Service", type: "Service", x: 260, y: 260, owner: "Platform Team", description: "Publishes product usage and billing events. Renamed field `amount_cents` → `amount_minor` in release v4.2.", evidence: ["Changelog v4.2 (demo)", "Deploy #8812 at 02:14 UTC"] },
  { id: "ds-raw-events", label: "Raw Events Stream", type: "Dataset", x: 450, y: 140, owner: "Platform Team", description: "Append-only stream of events emitted by Event Service.", evidence: ["Schema registry entry"] },
  { id: "svc-normalizer", label: "Data Normalizer", type: "Service", x: 470, y: 330, owner: "Data Engineering", description: "Maps raw event fields into canonical billing records. Still expects `amount_cents`.", evidence: ["Normalizer error log: KeyError 'amount_cents'"] },
  { id: "pipe-finance", label: "Finance ETL Pipeline", type: "Pipeline", x: 680, y: 260, owner: "Data Engineering", description: "Nightly batch that aggregates normalized billing records.", evidence: ["Run #3301 failed at stage 2"] },
  { id: "ds-billing", label: "Billing Dataset", type: "Dataset", x: 870, y: 330, owner: "Data Engineering", description: "Canonical billing table consumed by finance reporting.", evidence: ["0 rows written for 2026-10-14"] },
  { id: "rep-finance", label: "Finance Report", type: "Dataset", x: 1060, y: 260, owner: "Finance Analytics", description: "Daily revenue report used by finance leadership.", evidence: ["Report marked stale at 06:00 UTC"] },
  { id: "ds-usage", label: "Usage Dataset", type: "Dataset", x: 680, y: 110, owner: "Data Engineering", description: "Aggregated product usage metrics. Unaffected in this scenario." },
  { id: "inc-2041", label: "INC-2041", type: "Incident", x: 870, y: 500, description: "Finance report pipeline failed after Event Service release v4.2.", evidence: ["Alert: finance_etl_failed"] },
  { id: "inc-1873", label: "INC-1873", type: "Incident", x: 470, y: 540, description: "Previous incident (March 2026): schema drift in Event Service broke normalizer mapping.", evidence: ["Postmortem PM-1873 (demo)"] },
  { id: "fix-1873", label: "Field alias mapping", type: "Fix", x: 260, y: 600, description: "Historical fix: added alias mapping in normalizer config for renamed fields.", evidence: ["PR #4410 merged"] },
  { id: "fix-2041", label: "Update normalizer mapping", type: "Fix", x: 680, y: 610, description: "Proposed: map `amount_minor` with fallback alias to `amount_cents`.", evidence: ["Generated patch (demo)"] },
  { id: "test-contract", label: "Contract test: billing schema", type: "Verification Test", x: 1060, y: 600, description: "Replays sample events through patched normalizer and validates billing schema.", evidence: ["12/12 assertions passed (simulated)"] },
  { id: "team-platform", label: "Platform Team", type: "Team", x: 80, y: 420, description: "Owns Event Service and API Gateway." },
  { id: "team-data", label: "Data Engineering", type: "Team", x: 680, y: 460, description: "Owns Data Normalizer, Finance ETL and Billing Dataset." },
  { id: "team-finance", label: "Finance Analytics", type: "Team", x: 1060, y: 110, description: "Consumes Finance Report for daily revenue reviews." },
  { id: "p-maya", label: "Maya Chen", type: "Person", x: 80, y: 560, owner: "Platform Team", description: "Staff engineer; authored Event Service v4.2 field rename." },
  { id: "p-arjun", label: "Arjun Rao", type: "Person", x: 870, y: 640, owner: "Data Engineering", description: "On-call data engineer for INC-2041." },
  { id: "dec-schema", label: "Schema contract versioning", type: "Decision", x: 260, y: 460, description: "Decision DR-07: breaking field changes require versioned contracts. Not enforced for v4.2." },
  { id: "doc-changelog", label: "Event Service changelog v4.2", type: "Document", x: 260, y: 90, description: "Release notes listing the `amount_cents` rename (demo document)." },
  { id: "doc-runbook", label: "Normalizer runbook", type: "Document", x: 1060, y: 440, description: "Runbook RB-12: how to add field aliases to normalizer config (demo document)." },
];

export const edges: GraphEdge[] = [
  { id: "e1", source: "svc-gateway", target: "svc-event", type: "DEPENDS_ON" },
  { id: "e2", source: "svc-event", target: "ds-raw-events", type: "PRODUCES" },
  { id: "e3", source: "svc-normalizer", target: "svc-event", type: "DEPENDS_ON" },
  { id: "e4", source: "svc-normalizer", target: "ds-raw-events", type: "CONSUMES" },
  { id: "e5", source: "pipe-finance", target: "svc-normalizer", type: "DEPENDS_ON" },
  { id: "e6", source: "pipe-finance", target: "ds-billing", type: "PRODUCES" },
  { id: "e7", source: "rep-finance", target: "ds-billing", type: "DEPENDS_ON" },
  { id: "e8", source: "pipe-finance", target: "ds-usage", type: "PRODUCES" },
  { id: "e9", source: "rep-finance", target: "inc-2041", type: "AFFECTED_BY" },
  { id: "e10", source: "ds-billing", target: "inc-2041", type: "AFFECTED_BY" },
  { id: "e11", source: "svc-normalizer", target: "inc-1873", type: "AFFECTED_BY" },
  { id: "e12", source: "inc-1873", target: "fix-1873", type: "RESOLVED_BY" },
  { id: "e13", source: "inc-2041", target: "inc-1873", type: "SIMILAR_TO" },
  { id: "e14", source: "inc-2041", target: "fix-2041", type: "RESOLVED_BY" },
  { id: "e15", source: "fix-2041", target: "test-contract", type: "VERIFIED_BY" },
  { id: "e16", source: "svc-event", target: "team-platform", type: "OWNED_BY" },
  { id: "e17", source: "svc-gateway", target: "team-platform", type: "OWNED_BY" },
  { id: "e18", source: "svc-normalizer", target: "team-data", type: "OWNED_BY" },
  { id: "e19", source: "pipe-finance", target: "team-data", type: "OWNED_BY" },
  { id: "e20", source: "rep-finance", target: "team-finance", type: "OWNED_BY" },
  { id: "e21", source: "p-maya", target: "team-platform", type: "MEMBER_OF" },
  { id: "e22", source: "p-arjun", target: "team-data", type: "MEMBER_OF" },
  { id: "e23", source: "svc-event", target: "p-maya", type: "CHANGED_BY" },
  { id: "e24", source: "team-platform", target: "dec-schema", type: "DECIDED" },
  { id: "e25", source: "doc-changelog", target: "svc-event", type: "DOCUMENTS" },
  { id: "e26", source: "doc-runbook", target: "svc-normalizer", type: "DOCUMENTS" },
  { id: "e27", source: "fix-2041", target: "fix-1873", type: "SIMILAR_TO" },
  { id: "e28", source: "inc-2041", target: "p-arjun", type: "OWNED_BY" },
];

/** Shortest evidence path for the demo scenario: change → break → impact → precedent → fix → test */
export const demoPathNodeIds = [
  "svc-event",
  "svc-normalizer",
  "pipe-finance",
  "ds-billing",
  "rep-finance",
  "inc-2041",
  "inc-1873",
  "fix-1873",
  "fix-2041",
  "test-contract",
];
export const demoPathEdgeIds = ["e3", "e5", "e6", "e7", "e9", "e10", "e13", "e12", "e14", "e15", "e27"];

/** Compact layout for the Overview dependency graph (reuses canonical edge ids) */
export const overviewLayout: Record<string, { x: number; y: number }> = {
  "svc-event": { x: 90, y: 80 },
  "svc-normalizer": { x: 330, y: 80 },
  "pipe-finance": { x: 570, y: 80 },
  "ds-billing": { x: 810, y: 80 },
  "rep-finance": { x: 1050, y: 80 },
  "team-platform": { x: 90, y: 290 },
  "inc-1873": { x: 330, y: 290 },
  "fix-1873": { x: 570, y: 290 },
  "inc-2041": { x: 930, y: 290 },
};
const overviewEdgeIds = ["e3", "e5", "e6", "e7", "e10", "e9", "e11", "e12", "e13", "e16"];
export const overviewEdges: GraphEdge[] = overviewEdgeIds.map((id) => edges.find((e) => e.id === id)!);
/** Finance-report failure path, upstream change → downstream impact */
export const failurePathNodeIds = ["svc-event", "svc-normalizer", "pipe-finance", "ds-billing", "rep-finance", "inc-2041"];
export const failurePathEdgeIds = ["e3", "e5", "e6", "e7", "e9", "e10"];

export const relationDescriptions: Record<string, string> = {
  DEPENDS_ON: "Source requires the target to function; failures propagate from target to source.",
  PRODUCES: "Source writes or emits the target dataset.",
  CONSUMES: "Source reads records from the target.",
  AFFECTED_BY: "Source was impacted during the target incident.",
  OWNED_BY: "Target team or person is accountable for the source.",
  RESOLVED_BY: "Incident was (or is proposed to be) fixed by the target.",
  MEMBER_OF: "Person belongs to the target team.",
  DOCUMENTS: "Document describes the target entity.",
  DECIDED: "Team recorded the target decision.",
  VERIFIED_BY: "Fix was validated by the target test.",
  SIMILAR_TO: "Matched by shared entities and failure pattern.",
  CHANGED_BY: "Most recent change was authored by the target.",
};

export const incidents: Incident[] = [
  { id: "INC-2041", nodeId: "inc-2041", title: "Finance report pipeline failure", system: "Finance ETL Pipeline", severity: "SEV2", status: "Investigating", updated: "8 min ago" },
  { id: "INC-2039", nodeId: "svc-gateway", title: "Elevated 5xx on API Gateway", system: "API Gateway", severity: "SEV3", status: "Mitigated", updated: "2 h ago" },
  { id: "INC-2036", nodeId: "ds-usage", title: "Usage dataset late by 40 min", system: "Usage Dataset", severity: "SEV3", status: "Open", updated: "5 h ago" },
  { id: "INC-2030", nodeId: "svc-normalizer", title: "Normalizer memory pressure", system: "Data Normalizer", severity: "SEV2", status: "Investigating", updated: "1 d ago" },
  { id: "INC-1873", nodeId: "inc-1873", title: "Schema drift broke normalizer mapping", system: "Data Normalizer", severity: "SEV2", status: "Resolved", updated: "Mar 12, 2026" },
];

export const activity = [
  { id: "a1", title: "Dependency path discovered", detail: "Event Service → Data Normalizer → Finance ETL → Billing Dataset", time: "02:31", tone: "primary" as const },
  { id: "a2", title: "Previous incident retrieved", detail: "INC-1873 matched on shared entity Data Normalizer", time: "02:31", tone: "violet" as const },
  { id: "a3", title: "Proposed correction generated", detail: "Add `amount_minor` alias in normalizer field map", time: "02:32", tone: "warning" as const },
  { id: "a4", title: "Verification test completed", detail: "Contract test: billing schema — passed (simulated)", time: "02:33", tone: "success" as const },
];

export const scenarios: Scenario[] = [
  {
    id: "field-rename",
    name: "Finance pipeline failure after field rename",
    description:
      "A finance reporting pipeline failed after a change to a field in the Event Service. The Data Normalizer still expects the old field name, which causes downstream data processing to fail.",
    logs: `02:14:07 deploy event-service v4.2 rolled out (100%)
02:20:11 normalizer WARN unknown field 'amount_minor' in event billing.charge
02:20:11 normalizer ERROR KeyError: 'amount_cents' at mapping.py:88
02:21:03 finance-etl run #3301 stage=normalize status=FAILED
06:00:00 finance-report freshness check FAILED (last success 2026-10-13)`,
  },
  {
    id: "gateway-5xx",
    name: "API Gateway 5xx spike (limited demo)",
    description: "Clients report intermittent 502 errors from the API Gateway after a routing config change.",
    logs: `11:02:44 gateway ERROR upstream connect error (event-service)
11:02:45 gateway WARN retry budget exhausted`,
  },
];

export const investigationSteps: InvestigationStep[] = [
  { id: "s1", title: "Incident received", detail: "Parsed description and logs; anchored to Finance ETL Pipeline and Finance Report.", diagnostics: ["Signal: finance_etl_failed (run #3301)", "Signal: finance-report freshness check FAILED", "Earliest anomaly: 02:20:11 normalizer KeyError"], nodeIds: ["pipe-finance", "rep-finance"] },
  { id: "s2", title: "Related entities retrieved from the demo graph", detail: "Matched 9 entities across services, datasets, teams and prior incidents.", diagnostics: ["5 on the data path (services, pipeline, datasets)", "2 owning teams · 1 on-call engineer", "1 prior incident sharing an entity"], nodeIds: ["svc-event", "svc-normalizer", "ds-billing", "inc-1873"] },
  { id: "s3", title: "Dependency paths analyzed", detail: "Upstream path: Finance Report → Billing Dataset → Finance ETL → Data Normalizer → Event Service.", diagnostics: ["Path length: 4 hops via DEPENDS_ON / PRODUCES", "Only upstream change in window: Event Service v4.2 (02:14)", "Usage Dataset on same pipeline is unaffected → fault is field-specific"], nodeIds: ["svc-event", "svc-normalizer", "pipe-finance", "ds-billing", "rep-finance"] },
  { id: "s4", title: "Previous incident memory retrieved", detail: "INC-1873 (schema drift) shares Data Normalizer and was resolved by a field alias mapping.", diagnostics: ["Match basis: shared entity Data Normalizer + KeyError pattern", "Memory M-101: Verified resolution", "Conflict flagged: runbook RB-12 (needs review)"], nodeIds: ["inc-1873", "fix-1873"] },
  { id: "s5", title: "Proposed correction prepared", detail: "Map `amount_minor` in normalizer config with fallback to `amount_cents`.", diagnostics: ["Patch scope: 1 config file, 3 lines", "Backwards compatible with pre-v4.2 events", "Status: Proposed · requires Data Engineering approval"], nodeIds: ["fix-2041"] },
  { id: "s6", title: "Verification checks completed", detail: "Contract test replayed 12 sample events: passed. Backfill dry-run: failed on 3 records.", diagnostics: ["Contract test: 12/12 assertions passed", "Backfill dry-run: 3 records with null amount rejected", "Overall: partially verified"], nodeIds: ["test-contract"] },
];

export const memoryRecords: MemoryRecord[] = [
  { id: "M-101", kind: "Verified resolution", title: "Field alias mapping resolves schema drift", summary: "Adding alias entries to the normalizer field map restored processing within 15 minutes during INC-1873.", source: "Postmortem PM-1873 (demo)", incidentId: "INC-1873", nodeIds: ["inc-1873", "fix-1873", "svc-normalizer"], created: "2026-03-12", updated: "2026-03-14", validity: "Verified" },
  { id: "M-102", kind: "Observation", title: "Event Service v4.2 renamed amount field", summary: "`amount_cents` was renamed to `amount_minor` in billing.charge events.", source: "Event Service changelog v4.2 (demo)", incidentId: "INC-2041", nodeIds: ["svc-event", "doc-changelog"], created: "2026-10-15", updated: "2026-10-15", validity: "Valid" },
  { id: "M-103", kind: "Knowledge conflict", title: "Normalizer tolerates unknown fields", summary: "Runbook states the normalizer ignores unknown fields; logs show it raises KeyError on missing required fields.", source: "Normalizer runbook RB-12 (demo)", incidentId: "INC-2041", nodeIds: ["doc-runbook", "svc-normalizer"], created: "2025-11-02", updated: "2026-10-15", validity: "Needs review" },
  { id: "M-104", kind: "Decision", title: "Breaking schema changes require versioned contracts", summary: "DR-07 requires a versioned contract for any breaking event field change.", source: "Decision record DR-07 (demo)", nodeIds: ["dec-schema", "team-platform"], created: "2026-04-01", updated: "2026-04-01", validity: "Valid" },
  { id: "M-105", kind: "Past incident", title: "INC-1873: schema drift broke normalizer", summary: "Normalizer mapping failed after an unannounced field change in Event Service.", source: "Incident tracker (demo)", incidentId: "INC-1873", nodeIds: ["inc-1873"], created: "2026-03-12", updated: "2026-03-14", validity: "Verified" },
  { id: "M-106", kind: "Observation", title: "Finance ETL retries mask root cause", summary: "Pipeline retries 3x before failing, delaying alerts by ~20 minutes.", source: "Finance ETL run #3301 log (demo)", incidentId: "INC-2041", nodeIds: ["pipe-finance"], created: "2026-10-15", updated: "2026-10-15", validity: "Valid" },
  { id: "M-107", kind: "Knowledge conflict", title: "Billing Dataset owned by Finance Analytics", summary: "Older wiki lists Finance Analytics as owner; graph shows Data Engineering since 2026-06.", source: "Team wiki page (demo)", nodeIds: ["ds-billing", "team-data", "team-finance"], created: "2025-08-20", updated: "2026-06-03", validity: "Superseded" },
];

export const evidenceRecords: EvidenceRecord[] = [
  { id: "EV-1", claim: "Event Service v4.2 deployed at 02:14 UTC renamed `amount_cents`.", category: "Observed fact", source: "Event Service changelog v4.2 (demo)", relationship: "doc-changelog -DOCUMENTS→ Event Service", incidentId: "INC-2041", state: "Verified", timestamp: "2026-10-15 02:14", rationale: "Establishes the change that precedes the first normalizer error by 6 minutes." },
  { id: "EV-2", claim: "Data Normalizer raised KeyError 'amount_cents'.", category: "Observed fact", source: "Normalizer error log (demo)", relationship: "Data Normalizer -DEPENDS_ON→ Event Service", incidentId: "INC-2041", state: "Verified", timestamp: "2026-10-15 02:20", rationale: "Directly links the renamed field to the failing component through a dependency edge." },
  { id: "EV-3", claim: "Root cause is a field rename not propagated to the normalizer mapping.", category: "Agent hypothesis", source: "Simulated investigation", relationship: "Path: Finance Report → … → Event Service", incidentId: "INC-2041", state: "Unverified", timestamp: "2026-10-15 02:31", rationale: "Supported by EV-1, EV-2 and the similar pattern in INC-1873. Not yet confirmed by an engineer." },
  { id: "EV-4", claim: "INC-1873 was resolved by a field alias mapping.", category: "Observed fact", source: "Postmortem PM-1873 (demo)", relationship: "INC-1873 -RESOLVED_BY→ Field alias mapping", incidentId: "INC-1873", state: "Verified", timestamp: "2026-03-14 10:02", rationale: "Provides precedent for the proposed correction." },
  { id: "EV-5", claim: "Add `amount_minor` alias with fallback to `amount_cents`.", category: "Proposed action", source: "Simulated investigation", relationship: "INC-2041 -RESOLVED_BY→ Update normalizer mapping", incidentId: "INC-2041", state: "Requires approval", timestamp: "2026-10-15 02:32", rationale: "Mirrors the verified fix from INC-1873; requires Data Engineering approval before rollout." },
  { id: "EV-6", claim: "Contract test passed with patched mapping (12/12).", category: "Tested result", source: "Contract test: billing schema", relationship: "Update normalizer mapping -VERIFIED_BY→ Contract test", incidentId: "INC-2041", state: "Test passed", timestamp: "2026-10-15 02:33", rationale: "Shows the patch processes sample events correctly in isolation." },
  { id: "EV-7", claim: "Backfill of 2026-10-14 billing records succeeds.", category: "Tested result", source: "Backfill dry-run (demo)", relationship: "Finance ETL -PRODUCES→ Billing Dataset", incidentId: "INC-2041", state: "Test failed", timestamp: "2026-10-15 02:34", rationale: "Dry-run failed on 3 records with null amounts; remains an open uncertainty in the report." },
];

export const nodeById = (id: string) => nodes.find((n) => n.id === id);
