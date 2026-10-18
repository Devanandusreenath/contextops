"""Synthetic seed data. Mirrors frontend src/data/demoData.ts (ids, directions, layout),
plus supporting records the agents need (verification tests, postmortem, decisions...).

ALL DATA IS FICTIONAL. Deliberate deviations from demoData.ts are listed in docs/architecture.md:
  * no pre-baked "12/12 passed (simulated)" - test results only exist after a real run
  * EV-3 / EV-5 / EV-6 / EV-7 are produced by agents, not seeded
"""
from __future__ import annotations

import json

SEED_SOURCE = "synthetic-seed (frontend demoData.ts)"
T0 = "2026-01-01T00:00:00Z"


def J(obj) -> str:
    return json.dumps(obj, separators=(",", ":"), sort_keys=True)


# Properties that runtime code (agents, humans) may change; seeding only sets them on CREATE.
MUTABLE_KEYS = {
    "status", "validity_status", "verification_status", "drift_reason", "drift_checked_at",
    "previous_validity", "last_run_at", "last_result", "last_passed", "last_total",
    "last_investigation_id", "review_note", "reviewed_at", "proposal_json", "updated_at",
}


def N(id, label, name, desc, x, y, *, type_=None, owner=None, ev=None, aliases=None,
      created=T0, ov=None, verification="verified", **props):
    p = dict(
        name=name, description=desc, x=x, y=y, created_at=created, updated_at=created,
        observed_at=created, valid_from=created, validity_status="current",
        verification_status=verification, source_reference=SEED_SOURCE, origin="seed",
        synthetic=True,
    )
    if owner:
        p["owner"] = owner
    if ev:
        p["evidence_notes"] = ev
    if aliases:
        p["aliases"] = aliases
    if ov:
        p["overview_x"], p["overview_y"] = ov
    p.update(props)
    return dict(id=id, label=label, props=p)


NODES = [
    # ------------------------------------------------------------------ frontend nodes
    N("svc-gateway", "Service", "API Gateway", "Edge entry point that routes client traffic to internal services.", 80, 120,
      owner="Platform Team", ev=["Routing config v12"], aliases=["api gateway", "gateway"], schema_version="n/a"),
    N("svc-event", "Service", "Event Service",
      "Publishes product usage and billing events. Renamed field `amount_cents` → `amount_minor` in release v4.2.",
      260, 260, owner="Platform Team", ev=["Changelog v4.2 (synthetic)", "Deploy #8812 at 02:14 UTC"],
      aliases=["event-service", "event service"], ov=(90, 80), schema_version="4.2", previous_schema_version="3.9"),
    N("ds-raw-events", "Dataset", "Raw Events Stream", "Append-only stream of events emitted by Event Service.", 450, 140,
      owner="Platform Team", ev=["Schema registry entry"], aliases=["raw events", "raw-events"]),
    N("svc-normalizer", "Service", "Data Normalizer",
      "Maps raw event fields into canonical billing records. Still expects `amount_cents`.", 470, 330,
      owner="Data Engineering", ev=["Normalizer error log: KeyError 'amount_cents'"],
      aliases=["normalizer", "data normalizer"], ov=(330, 80)),
    N("pipe-finance", "Pipeline", "Finance ETL Pipeline", "Nightly batch that aggregates normalized billing records.", 680, 260,
      owner="Data Engineering", ev=["Run #3301 failed at stage 2"],
      aliases=["finance-etl", "finance etl", "finance report pipeline", "finance pipeline"], ov=(570, 80)),
    N("ds-billing", "Dataset", "Billing Dataset", "Canonical billing table consumed by finance reporting.", 870, 330,
      owner="Data Engineering", ev=["0 rows written for 2026-10-14"], aliases=["billing dataset", "billing table"], ov=(810, 80)),
    N("rep-finance", "Dataset", "Finance Report", "Daily revenue report used by finance leadership.", 1060, 260,
      owner="Finance Analytics", ev=["Report marked stale at 06:00 UTC"],
      aliases=["finance-report", "finance report"], ov=(1050, 80), kind="report"),
    N("ds-usage", "Dataset", "Usage Dataset", "Aggregated product usage metrics. Unaffected in this scenario.", 680, 110,
      owner="Data Engineering", aliases=["usage dataset"]),
    N("inc-2041", "Incident", "INC-2041", "Finance report pipeline failed after Event Service release v4.2.", 870, 500,
      ev=["Alert: finance_etl_failed"], ov=(930, 290), created="2026-10-15T02:21:03Z",
      observed_at="2026-10-15T02:20:11Z", updated_at="2026-10-15T02:33:00Z", valid_from="2026-10-15T02:20:11Z",
      verification="unverified", title="Finance report pipeline failure", system="Finance ETL Pipeline",
      severity="SEV2", status="Investigating", category="schema_drift", focus_node_id="inc-2041",
      scenario_id="field-rename", scenario_name="Finance pipeline failure after field rename",
      scenario_description=("A finance reporting pipeline failed after a change to a field in the Event Service. "
                            "The Data Normalizer still expects the old field name, which causes downstream data processing to fail."),
      scenario_logs=("02:14:07 deploy event-service v4.2 rolled out (100%)\n"
                     "02:20:11 normalizer WARN unknown field 'amount_minor' in event billing.charge\n"
                     "02:20:11 normalizer ERROR KeyError: 'amount_cents' at mapping.py:88\n"
                     "02:21:03 finance-etl run #3301 stage=normalize status=FAILED\n"
                     "06:00:00 finance-report freshness check FAILED (last success 2026-10-13)")),
    N("inc-1873", "Incident", "INC-1873",
      "Previous incident (March 2026): schema drift in Event Service broke normalizer mapping.", 470, 540,
      ev=["Postmortem PM-1873 (synthetic)"], ov=(330, 290), created="2026-03-12T08:00:00Z",
      observed_at="2026-03-12T08:00:00Z", updated_at="2026-03-14T10:02:00Z", valid_from="2026-03-12T08:00:00Z",
      title="Schema drift broke normalizer mapping", system="Data Normalizer", severity="SEV2", status="Resolved",
      category="schema_drift", focus_node_id="inc-1873",
      root_cause_summary="Event Service release v3.9 renamed `customer_ref` to `customer_id`; the normalizer mapping was not updated.",
      cause_changes_json=J({"release": "v3.9", "schema_version": "3.9", "event": "billing.charge",
                            "renamed": [{"from": "customer_ref", "to": "customer_id"}]})),
    N("fix-1873", "Fix", "Field alias mapping",
      "Historical fix: added alias mapping in normalizer config for renamed fields.", 260, 600,
      ev=["PR #4410 merged"], ov=(570, 290), created="2026-03-13T09:00:00Z", updated_at="2026-03-14T10:02:00Z",
      mapping_patch_json=J([{"event": "billing.charge", "canonical": "customer_id", "source": "customer_id",
                             "aliases": ["customer_ref"]}]),
      scope_fields_json=J(["customer_ref", "customer_id"]), verified_against_schema_version="3.9", status="merged"),
    N("fix-2041", "Fix", "Update normalizer mapping", "Proposed: map `amount_minor` with fallback alias to `amount_cents`.",
      680, 610, ev=["Proposal details are written by the Investigator Agent; unverified until tests run"],
      verification="unverified", status="proposed", created="2026-10-15T02:32:00Z"),
    N("test-contract", "VerificationTest", "Contract test: billing schema",
      "Replays sample events through patched normalizer and validates billing schema.", 1060, 600,
      ev=["Deterministic test registered as 'contract_billing_schema'; no result until executed"],
      verification="unverified", test_key="contract_billing_schema", last_result="not_run"),
    N("team-platform", "Team", "Platform Team", "Owns Event Service and API Gateway.", 80, 420, ov=(90, 290)),
    N("team-data", "Team", "Data Engineering", "Owns Data Normalizer, Finance ETL and Billing Dataset.", 680, 460),
    N("team-finance", "Team", "Finance Analytics", "Consumes Finance Report for daily revenue reviews.", 1060, 110),
    N("p-maya", "Person", "Maya Chen", "Staff engineer; authored Event Service v4.2 field rename.", 80, 560, owner="Platform Team"),
    N("p-arjun", "Person", "Arjun Rao", "On-call data engineer for INC-2041.", 870, 640, owner="Data Engineering"),
    N("dec-schema", "Decision", "Schema contract versioning",
      "Decision DR-07: breaking field changes require versioned contracts. Not enforced for v4.2.", 260, 460,
      created="2026-04-01T00:00:00Z", reference="DR-07"),
    N("doc-changelog", "Document", "Event Service changelog v4.2",
      "Release notes listing the `amount_cents` rename (synthetic document).", 260, 90,
      created="2026-10-15T02:14:00Z", observed_at="2026-10-15T02:14:00Z", valid_from="2026-10-15T02:14:00Z",
      effective_at="2026-10-15T02:14:00Z", schema_version="4.2", release="v4.2",
      change_json=J({"release": "v4.2", "schema_version": "4.2", "effective_at": "2026-10-15T02:14:00Z",
                     "event": "billing.charge", "breaking": True, "contract_versioned": False,
                     "renamed": [{"from": "amount_cents", "to": "amount_minor"}]})),
    N("doc-runbook", "Document", "Normalizer runbook",
      "Runbook RB-12: how to add field aliases to normalizer config (synthetic document).", 1060, 440,
      created="2025-11-02T00:00:00Z", reference="RB-12"),
    # ------------------------------------------------------------------ supporting nodes
    N("inc-2039", "Incident", "INC-2039", "Intermittent 502 errors from the API Gateway after a routing config change.", -110, 120,
      created="2026-10-15T09:00:00Z", observed_at="2026-10-15T11:02:44Z", updated_at="2026-10-15T11:02:00Z",
      valid_from="2026-10-15T11:02:44Z", verification="unverified",
      title="Elevated 5xx on API Gateway", system="API Gateway", severity="SEV3", status="Mitigated",
      category="routing", focus_node_id="svc-gateway", scenario_id="gateway-5xx",
      scenario_name="API Gateway 5xx spike (limited demo)",
      scenario_description="Clients report intermittent 502 errors from the API Gateway after a routing config change.",
      scenario_logs=("11:02:44 gateway ERROR upstream connect error (event-service)\n"
                     "11:02:45 gateway WARN retry budget exhausted")),
    N("inc-2036", "Incident", "INC-2036", "Usage dataset arrived 40 minutes late.", 870, 110,
      created="2026-10-15T00:00:00Z", updated_at="2026-10-15T00:30:00Z", verification="unverified",
      title="Usage dataset late by 40 min", system="Usage Dataset", severity="SEV3", status="Open",
      category="data_latency", focus_node_id="ds-usage"),
    N("inc-2030", "Incident", "INC-2030", "Data Normalizer hit memory pressure during a large batch.", 470, 440,
      created="2026-10-14T00:00:00Z", updated_at="2026-10-14T05:00:00Z", verification="unverified",
      title="Normalizer memory pressure", system="Data Normalizer", severity="SEV2", status="Investigating",
      category="capacity", focus_node_id="svc-normalizer",
      root_cause_summary="Batch size exceeded the worker memory limit (capacity issue, unrelated to schema)."),
    N("doc-pm-1873", "Document", "Postmortem PM-1873", "Postmortem for INC-1873 (synthetic document).", 470, 660,
      created="2026-03-14T10:00:00Z", reference="PM-1873"),
    N("test-contract-1873", "VerificationTest", "Contract test: alias mapping (INC-1873)",
      "Historical contract test recorded for the March 2026 alias fix (synthetic historical record).", 260, 720,
      created="2026-03-13T12:00:00Z", test_key="historical_alias_contract", last_result="passed",
      result_provenance="synthetic historical record; not executed by ContextOps", last_run_at="2026-03-13T12:00:00Z"),
    N("test-backfill", "VerificationTest", "Backfill dry-run: 2026-10-14 sample",
      "Dry-runs the patched normalizer over the 2026-10-14 sample batch and validates every record.", 1060, 690,
      ev=["Deterministic test registered as 'backfill_dry_run'; no result until executed"],
      verification="unverified", test_key="backfill_dry_run", last_result="not_run"),
    N("proj-billing", "Project", "Billing Reconciliation", "Project to reconcile billing data end to end.", 870, 215,
      owner="Data Engineering"),
    N("dec-ownership", "Decision", "Billing Dataset ownership moved to Data Engineering",
      "Decision DR-09 (2026-06-03): Billing Dataset ownership transferred from Finance Analytics to Data Engineering.",
      870, 420, created="2026-06-03T00:00:00Z", reference="DR-09"),
    # ------------------------------------------------------------------ seeded evidence
    dict(id="EV-1", label="Evidence", props=dict(
        seq=1, fingerprint="inc-2041|fact|rename:amount_cents", claim="Event Service v4.2 deployed at 02:14 UTC renamed `amount_cents`.", category="Observed fact",
        source="Event Service changelog v4.2 (synthetic)", relationship="doc-changelog -DOCUMENTS→ Event Service",
        incident_id="INC-2041", state="Verified", timestamp="2026-10-15 02:14", observed_at="2026-10-15T02:14:00Z",
        rationale="Establishes the change that precedes the first normalizer error by 6 minutes.",
        created_at="2026-10-15T02:14:00Z", updated_at="2026-10-15T02:14:00Z", valid_from="2026-10-15T02:14:00Z",
        validity_status="current", verification_status="verified", source_reference="doc-changelog",
        confidence_rationale="Primary source record (changelog) exists in the graph.", origin="seed", synthetic=True)),
    dict(id="EV-2", label="Evidence", props=dict(
        seq=2, fingerprint="inc-2041|fact|log-keyerror:amount_cents", claim="Data Normalizer raised KeyError 'amount_cents'.", category="Observed fact",
        source="Normalizer error log (synthetic)", relationship="Data Normalizer -DEPENDS_ON→ Event Service",
        incident_id="INC-2041", state="Verified", timestamp="2026-10-15 02:20", observed_at="2026-10-15T02:20:11Z",
        rationale="Directly links the renamed field to the failing component through a dependency edge.",
        created_at="2026-10-15T02:20:11Z", updated_at="2026-10-15T02:20:11Z", valid_from="2026-10-15T02:20:11Z",
        validity_status="current", verification_status="verified", source_reference="normalizer log (synthetic)",
        confidence_rationale="Log line names the exact field that the changelog says was renamed.", origin="seed", synthetic=True)),
    dict(id="EV-4", label="Evidence", props=dict(
        seq=4, fingerprint="inc-1873|fact|alias-fix", claim="INC-1873 was resolved by a field alias mapping.", category="Observed fact",
        source="Postmortem PM-1873 (synthetic)", relationship="INC-1873 -RESOLVED_BY→ Field alias mapping",
        incident_id="INC-1873", state="Verified", timestamp="2026-03-14 10:02", observed_at="2026-03-14T10:02:00Z",
        rationale="Provides precedent for the proposed correction.", created_at="2026-03-14T10:02:00Z",
        updated_at="2026-03-14T10:02:00Z", valid_from="2026-03-14T10:02:00Z", validity_status="current",
        verification_status="verified", source_reference="doc-pm-1873",
        confidence_rationale="Postmortem record; historical.", origin="seed", synthetic=True)),
]


def M(seq, kind, title, summary, source, created, updated, validity, *, incident=None, valid_from=None, verification="verified"):
    return dict(id=f"M-{seq}", label="Memory", props=dict(
        seq=seq, kind=kind, title=title, summary=summary, source=source, incident_id=incident or "",
        created_at=created + "T00:00:00Z", updated_at=updated + "T00:00:00Z", observed_at=created + "T00:00:00Z",
        valid_from=valid_from or (created + "T00:00:00Z"), validity_status=validity,
        verification_status=verification, source_reference=source, origin="seed", synthetic=True,
        confidence_rationale="Seeded synthetic record."))


MEMORY = [
    M(101, "Verified resolution", "Field alias mapping resolves schema drift",
      "Adding alias entries to the normalizer field map restored processing within 15 minutes during INC-1873.",
      "Postmortem PM-1873 (synthetic)", "2026-03-12", "2026-03-14", "verified", incident="INC-1873",
      valid_from="2026-03-14T10:02:00Z"),
    M(102, "Observation", "Event Service v4.2 renamed amount field",
      "`amount_cents` was renamed to `amount_minor` in billing.charge events.",
      "Event Service changelog v4.2 (synthetic)", "2026-10-15", "2026-10-15", "valid", incident="INC-2041",
      valid_from="2026-10-15T02:31:00Z", verification="unverified"),
    M(103, "Knowledge conflict", "Normalizer tolerates unknown fields",
      "Runbook states the normalizer ignores unknown fields; logs show it raises KeyError on missing required fields.",
      "Normalizer runbook RB-12 (synthetic)", "2025-11-02", "2026-10-15", "needs_review", incident="INC-2041",
      verification="unverified"),
    M(104, "Decision", "Breaking schema changes require versioned contracts",
      "DR-07 requires a versioned contract for any breaking event field change.",
      "Decision record DR-07 (synthetic)", "2026-04-01", "2026-04-01", "valid"),
    M(105, "Past incident", "INC-1873: schema drift broke normalizer",
      "Normalizer mapping failed after an unannounced field change in Event Service.",
      "Incident tracker (synthetic)", "2026-03-12", "2026-03-14", "verified", incident="INC-1873"),
    M(106, "Observation", "Finance ETL retries mask root cause",
      "Pipeline retries 3x before failing, delaying alerts by ~20 minutes.",
      "Finance ETL run #3301 log (synthetic)", "2026-10-15", "2026-10-15", "valid", incident="INC-2041",
      valid_from="2026-10-15T02:31:00Z", verification="unverified"),
    M(107, "Knowledge conflict", "Billing Dataset owned by Finance Analytics",
      "Older wiki lists Finance Analytics as owner; graph shows Data Engineering since 2026-06.",
      "Team wiki page (synthetic)", "2025-08-20", "2026-06-03", "superseded", verification="unverified"),
]
MEMORY_LINKS = {
    "M-101": ["inc-1873", "fix-1873", "svc-normalizer"],
    "M-102": ["svc-event", "doc-changelog"],
    "M-103": ["doc-runbook", "svc-normalizer"],
    "M-104": ["dec-schema", "team-platform"],
    "M-105": ["inc-1873"],
    "M-106": ["pipe-finance"],
    "M-107": ["ds-billing", "team-data", "team-finance"],
}
EVIDENCE_LINKS = {
    "EV-1": ["doc-changelog", "svc-event"],
    "EV-2": ["svc-normalizer", "svc-event"],
    "EV-4": ["inc-1873", "fix-1873"],
}

# (id, source, target, type) - ids e1..e28 are the frontend's relationship ids, unchanged.
_E = [
    ("e1", "svc-gateway", "svc-event", "DEPENDS_ON"), ("e2", "svc-event", "ds-raw-events", "PRODUCES"),
    ("e3", "svc-normalizer", "svc-event", "DEPENDS_ON"), ("e4", "svc-normalizer", "ds-raw-events", "CONSUMES"),
    ("e5", "pipe-finance", "svc-normalizer", "DEPENDS_ON"), ("e6", "pipe-finance", "ds-billing", "PRODUCES"),
    ("e7", "rep-finance", "ds-billing", "DEPENDS_ON"), ("e8", "pipe-finance", "ds-usage", "PRODUCES"),
    ("e9", "rep-finance", "inc-2041", "AFFECTED_BY"), ("e10", "ds-billing", "inc-2041", "AFFECTED_BY"),
    ("e11", "svc-normalizer", "inc-1873", "AFFECTED_BY"), ("e12", "inc-1873", "fix-1873", "RESOLVED_BY"),
    ("e13", "inc-2041", "inc-1873", "SIMILAR_TO"), ("e14", "inc-2041", "fix-2041", "RESOLVED_BY"),
    ("e15", "fix-2041", "test-contract", "VERIFIED_BY"), ("e16", "svc-event", "team-platform", "OWNED_BY"),
    ("e17", "svc-gateway", "team-platform", "OWNED_BY"), ("e18", "svc-normalizer", "team-data", "OWNED_BY"),
    ("e19", "pipe-finance", "team-data", "OWNED_BY"), ("e20", "rep-finance", "team-finance", "OWNED_BY"),
    ("e21", "p-maya", "team-platform", "MEMBER_OF"), ("e22", "p-arjun", "team-data", "MEMBER_OF"),
    ("e23", "svc-event", "p-maya", "CHANGED_BY"), ("e24", "team-platform", "dec-schema", "DECIDED"),
    ("e25", "doc-changelog", "svc-event", "DOCUMENTS"), ("e26", "doc-runbook", "svc-normalizer", "DOCUMENTS"),
    ("e27", "fix-2041", "fix-1873", "SIMILAR_TO"), ("e28", "inc-2041", "p-arjun", "OWNED_BY"),
    # supporting relationships (not in demoData.ts)
    ("e29", "doc-pm-1873", "inc-1873", "DOCUMENTS"), ("e30", "fix-1873", "test-contract-1873", "VERIFIED_BY"),
    ("e31", "fix-2041", "test-backfill", "VERIFIED_BY"), ("e32", "svc-gateway", "inc-2039", "AFFECTED_BY"),
    ("e33", "ds-usage", "inc-2036", "AFFECTED_BY"), ("e34", "svc-normalizer", "inc-2030", "AFFECTED_BY"),
    ("e35", "ds-billing", "team-data", "OWNED_BY"), ("e36", "proj-billing", "team-data", "OWNED_BY"),
    ("e37", "pipe-finance", "proj-billing", "RELATES_TO"), ("e38", "team-data", "dec-ownership", "DECIDED"),
    ("e39", "dec-schema", "svc-event", "RELATES_TO"), ("e40", "dec-ownership", "ds-billing", "RELATES_TO"),
    ("e41", "inc-2030", "p-arjun", "OWNED_BY"),
]
EDGES = [dict(id=i, src=s, dst=t, type=ty, props=dict(
    created_at=T0, valid_from=T0, validity_status="current", source_reference=SEED_SOURCE, origin="seed"))
    for i, s, t, ty in _E]

# Evidence/Memory edges (hidden from the default graph view)
_n = 100
for mid, ids in MEMORY_LINKS.items():
    for nid in ids:
        _n += 1
        EDGES.append(dict(id=f"r{_n}", src=mid, dst=nid, type="RELATES_TO",
                          props=dict(created_at=T0, source_reference=SEED_SOURCE, origin="seed")))
for eid, ids in EVIDENCE_LINKS.items():
    for nid in ids:
        _n += 1
        EDGES.append(dict(id=f"r{_n}", src=eid, dst=nid, type="RELATES_TO",
                          props=dict(created_at=T0, source_reference=SEED_SOURCE, origin="seed")))
for i, s, t in [("r300", "inc-2041", "EV-1"), ("r301", "inc-2041", "EV-2"), ("r302", "inc-1873", "EV-4"),
                ("r303", "fix-1873", "EV-4"), ("r304", "M-101", "EV-4")]:
    EDGES.append(dict(id=i, src=s, dst=t, type="SUPPORTED_BY", props=dict(created_at=T0, source_reference=SEED_SOURCE, origin="seed")))
EDGES.append(dict(id="r310", src="M-103", dst="EV-2", type="INVALIDATED_BY",
                  props=dict(created_at=T0, source_reference=SEED_SOURCE, origin="seed",
                             confidence_rationale="Log line shows KeyError on a missing required field.")))
EDGES.append(dict(id="r311", src="M-107", dst="dec-ownership", type="INVALIDATED_BY",
                  props=dict(created_at=T0, source_reference=SEED_SOURCE, origin="seed",
                             confidence_rationale="Decision DR-09 transferred ownership in 2026-06.")))

RELATION_DESCRIPTIONS = {
    "DEPENDS_ON": "Source requires the target to function; failures propagate from target to source.",
    "PRODUCES": "Source writes or emits the target dataset.",
    "CONSUMES": "Source reads records from the target.",
    "AFFECTED_BY": "Source was impacted during the target incident.",
    "OWNED_BY": "Target team or person is accountable for the source.",
    "RESOLVED_BY": "Incident was (or is proposed to be) fixed by the target.",
    "MEMBER_OF": "Person belongs to the target team.",
    "DOCUMENTS": "Document describes the target entity.",
    "DECIDED": "Team recorded the target decision.",
    "VERIFIED_BY": "Fix was validated by the target test.",
    "SIMILAR_TO": "Matched by shared entities and failure pattern.",
    "CHANGED_BY": "Most recent change was authored by the target.",
    "RELATES_TO": "Generic association between the source and the target.",
    "SUPPORTED_BY": "Source is backed by the target evidence record.",
    "INVALIDATED_BY": "Source claim was contradicted or superseded by the target.",
    "ASSIGNED_TO": "Source task is assigned to the target person or team.",
}
