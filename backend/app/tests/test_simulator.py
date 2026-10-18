"""Deterministic verification fixtures - no database needed."""
from app.agents.pipeline_sim import (BASELINE_FIELD_MAP, NormalizationError, apply_mapping_patch, normalize_event,
                                     run_registered_test, validate_billing_record, EVENTS_V42)

PATCH = [{"event": "billing.charge", "canonical": "amount", "source": "amount_minor", "aliases": ["amount_cents"]}]


def test_outdated_mapping_fails_on_new_schema():
    try:
        normalize_event(EVENTS_V42[0], BASELINE_FIELD_MAP)
        raise AssertionError("expected failure")
    except NormalizationError as e:
        assert str(e) == "'amount_cents'"


def test_patched_mapping_passes_contract_test():
    out = run_registered_test("contract_billing_schema", apply_mapping_patch(BASELINE_FIELD_MAP, PATCH))
    assert out.ok and out.passed == out.total == 12


def test_contract_test_fails_for_outdated_mapping():
    out = run_registered_test("contract_billing_schema", BASELINE_FIELD_MAP)
    assert not out.ok and out.passed < out.total


def test_backfill_dry_run_genuinely_fails_on_null_amounts():
    out = run_registered_test("backfill_dry_run", apply_mapping_patch(BASELINE_FIELD_MAP, PATCH))
    assert not out.ok
    rejected = [a for a in out.assertions if not a.passed and a.name.startswith("record")]
    assert len(rejected) == 3 and all("None" in a.detail for a in rejected)


def test_wrong_patch_is_detected():
    bad = apply_mapping_patch(BASELINE_FIELD_MAP, [{**PATCH[0], "source": "amount_typo", "aliases": []}])
    assert not run_registered_test("contract_billing_schema", bad).ok


def test_schema_validator():
    assert validate_billing_record({"charge_id": "c", "customer_id": "x", "amount": 5, "currency": "USD", "occurred_at": "2026-10-15T01:00:00Z"}) == []
    assert validate_billing_record({"charge_id": "c", "customer_id": "x", "amount": None, "currency": "usd", "occurred_at": "bad"})


def test_unknown_test_key_rejected():
    import pytest
    with pytest.raises(KeyError):
        run_registered_test("rm -rf /", BASELINE_FIELD_MAP)
