"""Deterministic, local, side-effect-free simulation of the synthetic Data Normalizer.

Nothing here touches an external system. Tests are looked up by a fixed key in TEST_REGISTRY;
neither the LLM nor the API can supply code to run.
"""
from __future__ import annotations

import copy
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable

# ---- the (synthetic) production normalizer field map before the fix -------------------
BASELINE_FIELD_MAP: dict[str, dict[str, dict[str, Any]]] = {
    "billing.charge": {
        "charge_id": {"source": "charge_id", "aliases": []},
        "customer_id": {"source": "customer_id", "aliases": ["customer_ref"]},  # INC-1873 fix
        "amount": {"source": "amount_cents", "aliases": []},                    # stale after v4.2
        "currency": {"source": "currency", "aliases": []},
        "occurred_at": {"source": "occurred_at", "aliases": []},
    }
}


class NormalizationError(KeyError):
    """Raised when a required source field is missing (mirrors the KeyError in the incident log)."""


def normalize_event(event: dict, field_map: dict) -> dict:
    spec_map = field_map[event["event"]]
    out = {}
    for canonical, spec in spec_map.items():
        for name in [spec["source"], *spec.get("aliases", [])]:
            if name in event:
                out[canonical] = event[name]
                break
        else:
            raise NormalizationError(spec["source"])
    return out


_ISO = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")


def validate_billing_record(rec: dict) -> list[str]:
    errs = []
    for f in ("charge_id", "customer_id"):
        if not isinstance(rec.get(f), str) or not rec[f]:
            errs.append(f"{f} must be a non-empty string")
    amt = rec.get("amount")
    if isinstance(amt, bool) or not isinstance(amt, int) or amt < 0:
        errs.append(f"amount must be a non-negative integer, got {amt!r}")
    if not isinstance(rec.get("currency"), str) or not re.fullmatch(r"[A-Z]{3}", rec["currency"]):
        errs.append("currency must be a 3-letter ISO code")
    ts = rec.get("occurred_at")
    if not isinstance(ts, str) or not _ISO.match(ts):
        errs.append("occurred_at must be ISO-8601 UTC")
    else:
        datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ")
    return errs


def apply_mapping_patch(field_map: dict, patch: list[dict]) -> dict:
    """patch item: {event, canonical, source, aliases}. The previous source is kept as a fallback alias
    only when listed in `aliases`; the new source takes precedence."""
    new = copy.deepcopy(field_map)
    for item in patch:
        spec = new[item["event"]][item["canonical"]]
        spec["source"] = item["source"]
        spec["aliases"] = list(dict.fromkeys([*item.get("aliases", [])]))
    return new


# ---- synthetic fixtures ----------------------------------------------------------------
def _ev(i, amount_key, amount, cust="cus_%d", cur="USD", day="2026-10-15"):
    return {"event": "billing.charge", "charge_id": f"ch_{i}", "customer_id": cust % i, amount_key: amount,
            "currency": cur, "occurred_at": f"{day}T0{i % 10}:00:00Z"}


EVENTS_V42 = [_ev(1001 + i, "amount_minor", 1000 * (i + 1)) for i in range(5)]
EVENTS_LEGACY = [_ev(900 + i, "amount_cents", 500 * (i + 1), day="2026-10-10") for i in range(3)]
EVENT_BOTH = {**_ev(1100, "amount_minor", 4200), "amount_cents": 1}   # precedence check
EVENT_NEITHER = {k: v for k, v in _ev(1101, "amount_minor", 1).items() if k != "amount_minor"}
BACKFILL_20261014 = (
    [_ev(2000 + i, "amount_minor", 250 * (i + 1), day="2026-10-14") for i in range(5)]
    + [_ev(2005 + i, "amount_minor", None, day="2026-10-14") for i in range(3)]   # upstream sent null amounts
)


def expected_record(ev: dict, amount_key: str) -> dict:
    return {"charge_id": ev["charge_id"], "customer_id": ev["customer_id"], "amount": ev[amount_key],
            "currency": ev["currency"], "occurred_at": ev["occurred_at"]}


# ---- assertion framework -----------------------------------------------------------------
@dataclass
class Assertion:
    name: str
    passed: bool
    detail: str


@dataclass
class TestOutcome:
    key: str
    assertions: list[Assertion] = field(default_factory=list)

    @property
    def passed(self) -> int:
        return sum(a.passed for a in self.assertions)

    @property
    def total(self) -> int:
        return len(self.assertions)

    @property
    def ok(self) -> bool:
        return self.total > 0 and self.passed == self.total

    def check(self, name: str, cond: bool, detail: str) -> None:
        self.assertions.append(Assertion(name, bool(cond), detail))


def _try(fn):
    try:
        return fn(), None
    except NormalizationError as e:
        return None, f"KeyError: {e}"


def contract_billing_schema(candidate_map: dict) -> TestOutcome:
    t = TestOutcome("contract_billing_schema")
    # 1. reproduction: the outdated mapping must fail on a v4.2 event (proves the test can fail)
    _, err = _try(lambda: normalize_event(EVENTS_V42[0], BASELINE_FIELD_MAP))
    t.check("reproduces incident under outdated mapping", err == "KeyError: 'amount_cents'", f"outdated mapping -> {err}")
    # 2. new-format events normalize to expected records
    outputs = []
    for ev in EVENTS_V42:
        out, err = _try(lambda ev=ev: normalize_event(ev, candidate_map))
        outputs.append(out)
        t.check(f"v4.2 event {ev['charge_id']} normalizes to expected record",
                out == expected_record(ev, "amount_minor"), err or f"got {out}")
    # 3. legacy events still normalize (backward compatibility)
    for ev in EVENTS_LEGACY:
        out, err = _try(lambda ev=ev: normalize_event(ev, candidate_map))
        outputs.append(out)
        t.check(f"legacy event {ev['charge_id']} still normalizes",
                out == expected_record(ev, "amount_cents"), err or f"got {out}")
    # 4. precedence: when both fields exist the new one wins
    out, err = _try(lambda: normalize_event(EVENT_BOTH, candidate_map))
    t.check("new field takes precedence over alias", bool(out) and out["amount"] == 4200, err or f"amount={out and out['amount']}")
    # 5. no silent default: missing amount must still raise
    _, err = _try(lambda: normalize_event(EVENT_NEITHER, candidate_map))
    t.check("missing amount still raises (no silent default)", err is not None, err or "no error raised")
    # 6. schema validation of every produced record
    bad = [(o, validate_billing_record(o)) for o in outputs if o is not None and validate_billing_record(o)]
    t.check("all produced records satisfy billing schema", not bad and all(o is not None for o in outputs),
            f"{len(bad)} invalid record(s)")
    return t


def backfill_dry_run(candidate_map: dict) -> TestOutcome:
    t = TestOutcome("backfill_dry_run")
    rejected = []
    for ev in BACKFILL_20261014:
        out, err = _try(lambda ev=ev: normalize_event(ev, candidate_map))
        errs = [err] if err else validate_billing_record(out)
        if errs:
            rejected.append((ev["charge_id"], errs))
        t.check(f"record {ev['charge_id']} normalizes and validates", not errs, "ok" if not errs else "; ".join(errs))
    t.check("no records rejected in batch", not rejected,
            f"{len(rejected)} of {len(BACKFILL_20261014)} records rejected" if rejected else "all records accepted")
    return t


def historical_alias_contract(candidate_map: dict) -> TestOutcome:
    """Replay of the INC-1873 fix against *current* (v4.2) events (used by the Drift Guard)."""
    t = TestOutcome("historical_alias_contract")
    for ev in EVENTS_V42[:2]:
        out, err = _try(lambda ev=ev: normalize_event(ev, candidate_map))
        t.check(f"historical mapping normalizes current event {ev['charge_id']}",
                out == expected_record(ev, "amount_minor"), err or f"got {out}")
    return t


TEST_REGISTRY: dict[str, Callable[[dict], TestOutcome]] = {
    "contract_billing_schema": contract_billing_schema,
    "backfill_dry_run": backfill_dry_run,
    "historical_alias_contract": historical_alias_contract,
}


def run_registered_test(key: str, candidate_map: dict) -> TestOutcome:
    if key not in TEST_REGISTRY:
        raise KeyError(f"unknown test key: {key}")
    return TEST_REGISTRY[key](candidate_map)
