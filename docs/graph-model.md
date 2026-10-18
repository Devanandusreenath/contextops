# Graph model

FalkorDB graph name: `contextops` (env `FALKORDB_GRAPH`). Every node has a unique string `id`; the ids from the frontend's
`demoData.ts` are preserved (`svc-event`, `svc-normalizer`, `pipe-finance`, `ds-billing`, `rep-finance`, `inc-2041`, `inc-1873`,
`fix-1873`, `fix-2041`, …) and relationship ids `e1`…`e28` are unchanged, with the same direction and meaning.
Seeded size: **39 nodes, 68 relationships** (29 nodes / 41 relationships are visible in the UI; Evidence, Memory and AgentTask
nodes are exposed through their own endpoints).

All data is synthetic.

## Node labels

| Label | UI type | Id convention | Key properties |
|---|---|---|---|
| `Service` | Service | `svc-*` | `name`, `description`, `owner`, `aliases[]` (used to match log text), `schema_version`, `x`,`y` |
| `Pipeline` | Pipeline | `pipe-*` | `name`, `aliases[]` |
| `Dataset` | Dataset | `ds-*`, `rep-*` | `name`, `kind` (reports have `kind="report"`) |
| `Incident` | Incident | `inc-*` | `title`, `system`, `severity`, `status`, `category` (e.g. `schema_drift`, `capacity`), `observed_at`, `focus_node_id`; scenario incidents also carry `scenario_id/name/description/logs`; precedents carry `root_cause_summary`, `cause_changes_json` |
| `Person` | Person | `p-*` | `name`, `owner` (team) |
| `Team` | Team | `team-*` | `name` |
| `Project` | Project | `proj-*` | `name` |
| `Decision` | Decision | `dec-*` | `reference` (e.g. DR-07), `created_at` |
| `Document` | Document | `doc-*` | changelogs carry `effective_at`, `schema_version`, `change_json` (`renamed: [{from,to}]`, `breaking`, `contract_versioned`) |
| `Fix` | Fix | `fix-*` | historical fixes: `mapping_patch_json`, `scope_fields_json`, `verified_against_schema_version`; proposed fixes: `proposal_json`, `verification_status`, `status`, `last_verified_at` |
| `VerificationTest` | Verification Test | `test-*` | `test_key` (key into the allow-listed deterministic test registry), `last_result`, `last_passed`, `last_total`, `last_run_at`, `result_provenance` |
| `Evidence` | (Evidence page) | `EV-<n>` | `claim`, `category` (Observed fact / Agent hypothesis / Proposed action / Tested result), `state`, `source`, `relationship`, `rationale`, `fingerprint`, `details_json` |
| `Memory` | (Memory page) | `M-<n>` | `kind`, `title`, `summary`, `source`, `validity_status`, `verification_status`, `valid_from`, `drift_reason`, `memory_key` |
| `AgentTask` | – | `task-<inv>-investigator` / `-verifier` | `role`, `status`, `investigation_id`, `mode`, `report_json`, `trace_json`, `activity_json` |

## Relationship types (direction: source → target)

| Type | Meaning / typical use |
|---|---|
| `DEPENDS_ON` | `normalizer → event service`. A failure of the target propagates to the source. |
| `PRODUCES` | `pipeline → dataset`, `service → stream`. A failure of the source propagates to the dataset. |
| `CONSUMES` | `normalizer → raw events`. A failure of the target propagates to the source. |
| `AFFECTED_BY` | `finance report → INC-2041`. Recorded impact of an incident (evidence, not inference). |
| `OWNED_BY` | `service → team`, `incident → person` (on-call). |
| `MEMBER_OF` | `person → team`. |
| `RESOLVED_BY` | `incident → fix`. |
| `VERIFIED_BY` | `fix → verification test`. The Verification Agent runs every test linked this way. |
| `SIMILAR_TO` | `INC-2041 → INC-1873`, `fix-2041 → fix-1873` (curated links). |
| `DOCUMENTS` | `document → entity` (changelog → service, postmortem → incident). |
| `DECIDED` | `team → decision`. |
| `CHANGED_BY` | `service → person` (last change author). |
| `SUPPORTED_BY` | `incident/fix/memory → evidence`. |
| `INVALIDATED_BY` | `memory → evidence/decision` that contradicts or supersedes it. |
| `ASSIGNED_TO` | `verifier task → person`; `purpose="human_approval"`. |
| `RELATES_TO` | generic: memory/evidence → entity; `decision → entity`; task → incident (`kind="subject"`), investigator task → verifier task (`kind="handoff"`). |

Relationships e29–e41 and the `r*` ids are supporting links added for this backend (verification tests for both fixes, extra
incidents, project, decision DR-09, ownership of the billing dataset). They are the only deviations from `demoData.ts` edges.

## Temporal metadata and provenance

Every node and relationship carries (where meaningful): `created_at`, `updated_at`, `observed_at`, `valid_from`,
`valid_until` (unset = still valid), `validity_status`, `verification_status`, `source_reference`, `confidence_rationale`, plus
`origin` (`seed` or `agent`) and `synthetic=true`. There is **no numeric confidence score**: `confidence_rationale` is text and
the API reports a qualitative `supportLevel` (strong / moderate / weak / insufficient) with the list of corroborations behind it.
Timestamps are ISO-8601 UTC strings with 1-second resolution (string comparison is used by the drift query).

## Memory validity vs verification

`verification_status` records what was *tested*; `validity_status` records whether the knowledge is still *applicable*:
`valid` / `verified` / `needs_review` / `superseded`. The Drift Guard sets `needs_review` (and keeps `previous_validity` and a
`drift_reason`) when a dependency changed after the memory was validated; a human can re-confirm it with
`POST /api/memory/{id}/review`.

## Indexes

`CREATE INDEX FOR (n:<Label>) ON (n.id)` for every label (created idempotently at seed time). Unlabelled `MATCH (n {id: …})` lookups are
used for cross-label ids; at this graph size that is fine. A production variant would add a shared `:Entity` label.
