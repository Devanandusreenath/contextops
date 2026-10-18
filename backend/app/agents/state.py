"""Shared, in-process investigation state (the *working* memory of one run).
Durable shared state is written to FalkorDB (AgentTask / Evidence / Memory / Fix nodes)."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

ID_RE = re.compile(r"^[a-z0-9][a-z0-9\-_]{0,60}$", re.I)


def parse_iso(ts: str | None) -> datetime | None:
    if not ts:
        return None
    try:
        return datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def extract_signals(text: str) -> dict[str, Any]:
    """Cheap, deterministic parsing of the submitted description/logs."""
    keyerrors = re.findall(r"KeyError:?\s*'([A-Za-z0-9_]+)'", text)
    unknown = re.findall(r"unknown field\s*'([A-Za-z0-9_]+)'", text, flags=re.I)
    missing = re.findall(r"missing (?:required )?(?:field|column)\s*'([A-Za-z0-9_]+)'", text, flags=re.I)
    schema_words = bool(re.search(r"schema|field|mapping|rename", text, flags=re.I))
    schema_signal = bool(keyerrors or unknown or missing)
    times = re.findall(r"(?m)^\s*(\d{2}):(\d{2}):(\d{2})\s+.*?(?:ERROR|WARN|FAILED|failed)", text)
    first_error = min(times) if times else None
    return {
        "keyerrors": keyerrors, "unknown_fields": unknown, "missing_fields": missing,
        "fields_in_logs": sorted(set(keyerrors + unknown + missing)),
        "category": "schema_drift" if schema_signal else ("schema_drift?" if schema_words else "unknown"),
        "first_error_hms": ":".join(first_error) if first_error else None,
    }


@dataclass
class InvState:
    incident_node_id: str
    incident: dict
    description: str
    logs: str
    text: str = ""
    signals: dict = field(default_factory=dict)
    anchors: list[dict] = field(default_factory=list)
    upstream: dict | None = None
    chains: list[dict] = field(default_factory=list)
    upstream_ids: list[str] = field(default_factory=list)
    changes: list[dict] = field(default_factory=list)       # all changes found on upstream services
    change: dict | None = None                               # change corroborated by the logs
    unlinked_changes: list[dict] = field(default_factory=list)
    source_service_id: str | None = None
    impact: dict | None = None
    confirmed: list[dict] = field(default_factory=list)
    affected: list[dict] = field(default_factory=list)
    failure_nodes: list[str] = field(default_factory=list)
    failure_edges: list[str] = field(default_factory=list)
    related: list[dict] = field(default_factory=list)
    historical: dict | None = None
    replay: dict | None = None
    memory: list[dict] = field(default_factory=list)
    stale: list[dict] = field(default_factory=list)
    owners: list[dict] = field(default_factory=list)
    decisions: list[dict] = field(default_factory=list)
    prior_evidence: list[dict] = field(default_factory=list)
    done: list[str] = field(default_factory=list)
    skipped: dict[str, str] = field(default_factory=dict)

    def __post_init__(self):
        self.text = f"{self.description}\n{self.logs}"
        self.signals = extract_signals(self.text)

    @property
    def scope_ids(self) -> list[str]:
        ids = [a["id"] for a in self.anchors] + self.upstream_ids + self.failure_nodes
        return list(dict.fromkeys(ids))

    @property
    def top_candidate(self) -> dict | None:
        return next((c for c in self.related if c["fixId"] and c["score"] >= 5), None)
