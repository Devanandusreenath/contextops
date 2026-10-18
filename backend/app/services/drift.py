"""Context Drift Guard: decides whether a historical fix still applies to the current incident.
Pure function over graph-derived facts - deterministic, no LLM."""
from __future__ import annotations

import json
from typing import Any


def evaluate_historical_fix(*, candidate: dict, historical: dict, change: dict | None, service_props: dict,
                            replay: dict | None, stale_memory_ids: list[str], current_category: str) -> dict[str, Any]:
    inc = historical["incident"]
    fix = historical.get("fix") or {}
    checks: list[dict] = []

    # 1. Same failure pattern?
    same_cat = inc.get("category") == current_category.rstrip("?")
    checks.append({"name": "failure pattern", "result": "pass" if same_cat else "fail",
                   "detail": f"{inc['name']} category '{inc.get('category')}' vs current signals '{current_category}'."})

    # 2. Does the historical fix scope cover the fields that changed now?
    scope = set(json.loads(fix.get("scope_fields_json", "[]"))) if fix else set()
    cur = set()
    if change:
        for r in change["renamed"]:
            cur |= {r["from"], r["to"]}
    overlap = scope & cur
    if change:
        checks.append({"name": "fix scope vs current change", "result": "pass" if overlap else "fail",
                       "detail": (f"Historical fix covers {sorted(scope)}; current change concerns {sorted(cur)}; "
                                  f"overlap: {sorted(overlap) or 'none'}.")})
    else:
        checks.append({"name": "fix scope vs current change", "result": "warn",
                       "detail": "No corroborated current change to compare against."})

    # 3. Was the fix verified against the schema version that is live now?
    verified_v = fix.get("verified_against_schema_version")
    live_v = service_props.get("schema_version")
    if verified_v and live_v:
        checks.append({"name": "schema version", "result": "pass" if verified_v == live_v else "warn",
                       "detail": f"Fix verified against schema {verified_v}; {service_props.get('name')} now at {live_v}."})

    # 4. Deterministic replay of the historical mapping against current events
    if replay:
        checks.append({"name": "replay historical mapping on current events",
                       "result": "pass" if replay["ok"] else "fail",
                       "detail": f"{replay['passed']}/{replay['total']} assertions passed; "
                                 f"{replay['assertions'][0]['detail'] if replay['assertions'] else ''}"})

    # 5. Stale stored knowledge
    if stale_memory_ids:
        checks.append({"name": "stored memory freshness", "result": "warn",
                       "detail": f"Memory {', '.join(stale_memory_ids)} predates a documented change in a dependency."})

    # 6. Historical verification record
    tests = historical.get("tests", [])
    if tests:
        t = tests[0]
        checks.append({"name": "historical verification", "result": "info",
                       "detail": f"{t['name']}: {t.get('last_result', 'unknown')} "
                                 f"({t.get('result_provenance', 'recorded in graph')})."})

    fails = [c for c in checks if c["result"] == "fail"]
    warns = [c for c in checks if c["result"] == "warn"]
    if not same_cat:
        verdict, summary = "not_applicable", f"{inc['name']} has a different failure pattern; do not reuse its fix."
    elif fails:
        verdict = "requires_revalidation"
        summary = (f"The technique from {fix.get('name', 'the historical fix')} may be reusable, but the patch itself does not "
                   f"cover the current change. Revalidate before reuse.")
    elif warns:
        verdict, summary = "potentially_stale", "Context changed since the fix was verified; revalidate before reuse."
    else:
        verdict, summary = "applicable", "Scope, schema version and replay all match; the historical fix applies."
    return {"historicalIncidentId": inc["name"], "historicalFixId": fix.get("id"), "verdict": verdict,
            "summary": summary, "checks": checks, "staleMemoryIds": stale_memory_ids}
