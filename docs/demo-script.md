# Two-minute demo script

Setup (before recording): `docker compose up --build -d`, wait until `http://localhost:8000/api/health/ready` returns `ready`, start the frontend
(`npm run dev` in `frontend`), open the URL it prints. For a clean take: `docker compose exec backend python -m scripts.reset_graph --runs-only --yes`.
Keep `AGENT_MODE=rules` for a fully offline, repeatable demo (or set a key and `auto` to show the LLM selecting tools).

| Time | Do | Say |
|---|---|---|
| 0:00 | **Overview.** Point at the incident banner and the numbered failure path. Top-right badge: *FALKORDB CONNECTED · RULES MODE*. | "A finance pipeline is failing. This path is not drawn by hand. It is computed from FalkorDB relationships: Event Service → Data Normalizer → Finance ETL → Billing → Finance Report. All data is synthetic." |
| 0:15 | **Investigations → Run Investigation.** | "The Investigator Agent picks graph tools one at a time based on what it finds. Mode is shown: deterministic rules, no LLM." |
| 0:30 | Scroll the steps: dependency trace, *Inspect source change* ("logs corroborate the v4.2 rename"), *Find affected systems* (Usage Dataset: exposed but no recorded impact). | "Structural reach is only a candidate list. Impact counts only where the incident record confirms it." |
| 0:45 | **Related incidents.** INC-1873 (same pattern) ranks above INC-2030 (capacity issue). | "It retrieves a precedent. But it doesn't blindly reuse the fix." |
| 1:00 | **Context Drift Guard card** → *requires revalidation*: scope check fails, replay fails, memory M-101 flagged *Needs review*. | "The March fix aliased `customer_ref`. Today's rename is `amount_cents`. The agent replays the old fix on current events, and it fails. It reuses the technique, not the patch." |
| 1:15 | **Verification result.** Open both tests: contract test 12/12 passes; backfill dry-run fails on 3 null-amount records. Show *Read back from FalkorDB*. | "A second agent reads the handoff from the graph and runs deterministic tests. One passes, one fails, so the result is *partially verified* and the fix needs human approval." |
| 1:30 | **View Evidence Path** → graph highlights the path from the actual run. Optionally *Show Cypher trace*. | "Every claim traces to real relationships and the Cypher that produced it." |
| 1:40 | **Cross-session memory.** Reload the browser (or `docker compose restart backend`). Report reloads from history. Open **Agent Memory** → agent-written records. Run again. | "Memory lives in FalkorDB. A new session recalls the earlier outcome: the unresolved backfill failure is carried into the new report." |
| 1:55 | (Optional drift demo) in PowerShell: see README_WINDOWS §Drift demo, then re-run. | "A new release makes yesterday's verified memory stale." |

Tracks: **Track 01** (agents acting on connected data), **Track 02** (shared state between two agents + cross-session memory),
**Track 03** (company brain: services, teams, people, decisions, documents, incidents).

Recording tips: 1080p, browser zoom 90 %, hide bookmarks, keep the Settings page ready to show FalkorDB/agent status. Do not claim LLM use
unless the Execution-mode badge says LLM.
