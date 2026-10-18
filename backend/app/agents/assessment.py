"""Deterministic assessment built from the evidence gathered by tools (both modes use it).
In LLM mode the model's narrative may replace root-cause wording / next action, never the facts."""
from __future__ import annotations

import json
from datetime import datetime, timezone

from app.agents.pipeline_sim import BASELINE_FIELD_MAP
from app.agents.state import InvState
from app.services.drift import evaluate_historical_fix

TARGET_FILE = "normalizer/field_map.yaml (synthetic)"


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def now_display() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")


def find_canonical(event: str, source_field: str) -> str | None:
    for canonical, spec in BASELINE_FIELD_MAP.get(event, {}).items():
        if spec["source"] == source_field:
            return canonical
    return None


def build_proposal(st: InvState) -> dict | None:
    c = st.change
    if not c:
        return None
    for r in c["renamed"]:
        canonical = find_canonical(c.get("event") or "", r["from"])
        if canonical:
            return {"patch": [{"event": c["event"], "canonical": canonical, "source": r["to"], "aliases": [r["from"]]}],
                    "baseline_source": r["from"], "file": TARGET_FILE, "canonical": canonical,
                    "title": "Update normalizer mapping", "from": r["from"], "to": r["to"]}
    return None


def diff_lines(p: dict) -> list[dict]:
    return [
        {"kind": "context", "text": "billing.charge:"},
        {"kind": "context", "text": f"  {p['canonical']}:"},
        {"kind": "remove", "text": f"    source: {p['from']}"},
        {"kind": "add", "text": f"    source: {p['to']}"},
        {"kind": "add", "text": f"    aliases: [{p['from']}]   # keep legacy events working"},
    ]


def assess(st: InvState) -> dict:
    c = st.change
    basis: list[str] = []
    if c:
        fields = ", ".join(f"`{r['from']}`→`{r['to']}`" for r in c["renamed"])
        basis.append(f"Change record {c['docId']} in the graph documents {c['serviceName']} {c['release']} renaming {fields}.")
        basis.append(f"The logs name the same field(s) {c['corroboratedFields']} in errors.")
        if c["minutesBeforeFirstError"] is not None:
            basis.append(f"The change took effect {c['minutesBeforeFirstError']} min before the first error.")
        chain = max(st.chains, key=lambda x: len(x["nodeIds"]), default=None)
        if chain and c["serviceId"] in chain["nodeIds"]:
            basis.append(f"A DEPENDS_ON path of {len(chain['nodeIds']) - 1} hop(s) connects the failing component to {c['serviceName']}.")
        conf = [a for a in st.affected if a["impact"] == "confirmed"]
        if conf:
            basis.append(f"{len(conf)} entities recorded as affected by the incident are reachable downstream of {c['serviceName']}.")
        level = "strong" if len(basis) >= 4 else "moderate" if len(basis) == 3 else "weak"
        comp = next((a["name"] for a in st.anchors if a["id"] != c["serviceId"] and a["label"] == "Service"), "the consumer")
        summary = (f"{c['serviceName']} {c['release']} renamed {fields}; {comp}'s mapping still reads the old field name, "
                   f"so normalization fails and downstream pipelines break.")
        rc = {"summary": summary, "status": "hypothesis", "supportLevel": level, "basis": basis}
    else:
        if st.unlinked_changes:
            u = st.unlinked_changes[0]
            basis.append(f"A recent change exists ({u['docId']}, {u['serviceName']} {u['release']}) but the logs mention none of its changed fields.")
        basis.append("No corroborated cause was found in the graph for the submitted logs.")
        rc = {"summary": "Insufficient evidence to assign a root cause. The graph shows upstream dependencies but no corroborated change.",
              "status": "inconclusive", "supportLevel": "insufficient", "basis": basis}

    proposal = build_proposal(st)
    drift = []
    cand = st.historical
    if cand and cand.get("fix"):
        svc = st.change and next((a for a in st.anchors if a["id"] == st.change["serviceId"]), None)
        svc_props = {"name": st.change["serviceName"] if st.change else "", "schema_version": (st.change or {}).get("serviceSchemaVersion")}
        stale_ids = sorted({s["memoryId"] for s in st.stale if s["memoryId"] in {m["id"] for m in st.memory}})
        hist = {"incident": cand["incident"], "fix": cand["fix"], "tests": cand["tests"]}
        drift.append(evaluate_historical_fix(candidate=st.top_candidate or {}, historical=hist, change=c, service_props=svc_props,
                                             replay=st.replay, stale_memory_ids=stale_ids,
                                             current_category=st.signals["category"] if st.signals["category"] != "unknown" else "unknown"))

    unc = []
    if c:
        unc.append(f"Root cause is a hypothesis backed by {len(basis)} independent graph/log corroborations; it is not proven.")
        if c.get("contractVersioned") is False:
            unc.append(f"The change was not published under a versioned contract (see decision DR-07); other consumers may also break.")
    else:
        unc.append("No deterministic test is registered for this class of failure, so nothing was verified.")
    if drift and drift[0]["verdict"] in ("requires_revalidation", "potentially_stale"):
        unc.append(f"Historical fix {drift[0]['historicalFixId']} is not reusable as-is ({drift[0]['verdict'].replace('_', ' ')}).")
    unc.append("Verification uses synthetic fixtures; production data has not been tested.")
    prior_agent = [m for m in st.memory if m.get("origin") == "agent" and m.get("verification_status") in ("partial", "failed")]
    for m in prior_agent:
        unc.append(f"Carried over from memory {m['id']} (earlier session): {m['summary'][:160]}")
    return {"rootCause": rc, "proposal": proposal, "drift": drift, "uncertainty": unc}


def evidence_drafts(st: InvState, a: dict) -> list[dict]:
    inc = st.incident_node_id
    iname = st.incident["name"]
    out = []
    c = st.change
    if c:
        for r in c["renamed"]:
            out.append(dict(fingerprint=f"{inc}|fact|rename:{r['from']}", category="Observed fact", state="Verified",
                            claim=f"{c['serviceName']} {c['release']} deployed at {c['effectiveAt'][11:16]} UTC renamed `{r['from']}`.",
                            source=f"{c['docName']} (synthetic)", relationship=f"{c['docId']} -DOCUMENTS→ {c['serviceName']}",
                            rationale="Establishes the change that precedes the first error.", node_ids=[c["docId"], c["serviceId"]],
                            observed_at=c["effectiveAt"], timestamp=c["effectiveAt"][:16].replace("T", " "),
                            confidence_rationale="Primary change record exists in the graph and the logs name the same field."))
        for f in st.signals["keyerrors"]:
            if f in {r["from"] for r in c["renamed"]}:
                line = next((l for l in st.logs.splitlines() if f"'{f}'" in l and "KeyError" in l), "")
                comp = next((x for x in st.anchors if any(m in line.lower() for m in x["matched"])), None)
                out.append(dict(fingerprint=f"{inc}|fact|log-keyerror:{f}", category="Observed fact", state="Verified",
                                claim=f"{comp['name'] if comp else 'A component'} raised KeyError '{f}'.", source="Submitted logs",
                                relationship=f"{comp['name'] if comp else 'component'} -DEPENDS_ON→ {c['serviceName']}",
                                rationale="Links the renamed field to the failing component.", node_ids=[x for x in [comp and comp["id"], c["serviceId"]] if x],
                                observed_at=st.incident.get("observed_at"), timestamp=(st.incident.get("observed_at") or now_iso())[:16].replace("T", " "),
                                confidence_rationale="Log names a field that the change record says was renamed (two independent sources)."))
    chain = max(st.chains, key=lambda x: len(x["nodeIds"]), default=None)
    if chain and len(chain["nodeIds"]) > 1:
        nm = lambda i: next((x["name"] for x in st.anchors if x["id"] == i), i)
        out.append(dict(fingerprint=f"{inc}|fact|dep-path:{chain['nodeIds'][0]}:{chain['nodeIds'][-1]}", category="Observed fact", state="Verified",
                        claim=" depends on ".join(nm(i) for i in chain["nodeIds"][:2]) + (f" … → {nm(chain['nodeIds'][-1])}" if len(chain["nodeIds"]) > 2 else "") + " (graph path).",
                        source="FalkorDB relationships", relationship=" → ".join(chain["nodeIds"]) + f" via {chain['relIds']}",
                        rationale="Graph traversal result (variable-length DEPENDS_ON query).", node_ids=chain["nodeIds"],
                        observed_at=now_iso(), timestamp=now_display(), confidence_rationale="Direct query result."))
    if st.historical and st.historical.get("fix"):
        h = st.historical
        out.append(dict(fingerprint=f"{h['incident']['id']}|fact|alias-fix", category="Observed fact", state="Verified",
                        claim=f"{h['incident']['name']} was resolved by {h['fix']['name'].lower()}.",
                        source=(h["documents"][0]["name"] + " (synthetic)") if h["documents"] else "Incident tracker (synthetic)",
                        relationship=f"{h['incident']['name']} -RESOLVED_BY→ {h['fix']['name']}", rationale="Provides precedent for the proposed technique.",
                        node_ids=[h["incident"]["id"], h["fix"]["id"]], observed_at=h["incident"].get("updated_at"),
                        timestamp=(h["incident"].get("updated_at") or now_iso())[:16].replace("T", " "), confidence_rationale="Historical record."))
    rc = a["rootCause"]
    out.append(dict(fingerprint=f"{inc}|hypothesis|root-cause", category="Agent hypothesis", state="Unverified",
                    claim=rc["summary"], source="Investigator Agent", relationship="Graph path + logs",
                    rationale=" ".join(rc["basis"])[:400], node_ids=[x["id"] for x in st.anchors][:6],
                    observed_at=now_iso(), timestamp=now_display(),
                    confidence_rationale=f"Qualitative support: {rc['supportLevel']} ({len(rc['basis'])} corroborations). Not a probability."))
    if st.replay:
        out.append(dict(fingerprint=f"{inc}|tested|replay:{st.replay['fixId']}", category="Tested result",
                        state="Test passed" if st.replay["ok"] else "Test failed",
                        claim=f"Replaying historical fix on current events: {st.replay['passed']}/{st.replay['total']} assertions passed.",
                        source="Deterministic replay (historical_alias_contract)", relationship=f"{st.replay['fixId']} → current schema fixtures",
                        rationale="Shows whether the precedent's patch alone resolves today's failure.", node_ids=[st.replay["fixId"]],
                        observed_at=now_iso(), timestamp=now_display(),
                        details_json=json.dumps(st.replay["assertions"]), confidence_rationale="Executed locally against synthetic fixtures."))
    p = a["proposal"]
    if p:
        out.append(dict(fingerprint=f"{inc}|proposed|mapping", category="Proposed action", state="Requires approval",
                        claim=f"Map `{p['to']}` for `{p['canonical']}` with fallback alias `{p['from']}` in the normalizer.",
                        source="Investigator Agent", relationship="Fix → Data Normalizer", rationale="Human approval required before any change.",
                        node_ids=[], observed_at=now_iso(), timestamp=now_display(),
                        confidence_rationale="Proposal only; becomes verified evidence only after tests run."))
    return out
