"""Investigator Agent: selects allow-listed tools (rules planner or LLM) and records a trace."""
from __future__ import annotations

import json
import time
from typing import Any

from app.agents.llm import FINISH_TOOL, SYSTEM_PROMPT, ChatClient, LLMError, truncate_for_model
from app.agents.planner import next_action
from app.agents.state import InvState
from app.agents.tools import TOOLS, ToolContext, ToolError, execute_tool
from app.graph import repository as R
from app.graph.repository import GraphRepository

TITLES = {
    "resolve_entities": "Interpret incident and match graph entities",
    "trace_dependency_path": "Trace dependency path",
    "inspect_source_change": "Inspect source change",
    "find_affected_systems": "Find affected systems",
    "inspect_related_incidents": "Retrieve related incidents",
    "retrieve_historical_resolution": "Retrieve historical resolution",
    "replay_historical_fix": "Context Drift Guard: replay historical fix",
    "check_memory_validity": "Check memory validity",
    "get_system_owner": "Look up owners",
    "retrieve_related_decisions": "Retrieve related decisions",
    "retrieve_evidence": "Retrieve linked evidence",
}
PURPOSE = {
    "entities_by_alias": "Match systems named in the incident text to graph entities",
    "dependency_chain": "Variable-length DEPENDS_ON chain (multi-hop, single statement)",
    "upstream_hop": "One bounded upstream traversal hop",
    "impact_hop": "One bounded downstream traversal hop (blast radius)",
    "confirmed_impact": "Entities the incident record says were affected",
    "source_change": "Documented changes and authors for services",
    "related_incidents": "Earlier incidents sharing graph entities",
    "historical_resolution": "Cause, fix, test and source documents of a precedent",
    "memory_for_nodes": "Stored memory about the entities",
    "stale_memory": "Memory older than a documented change in a dependency",
    "owners": "Owning teams/people and members",
    "decisions": "Decision records relevant to the entities",
    "evidence_for_incident": "Evidence records linked to the incident",
    "graph_nodes": "Load node properties for display names",
    "graph_edges": "Load relationships for display",
}


class InvestigatorResult:
    def __init__(self, st: InvState):
        self.state = st
        self.steps: list[dict] = []
        self.trace: list[dict] = []
        self.narrative: dict | None = None
        self.queries_start = 0


def _record(res: InvestigatorResult, log: list, n0: int, tool: str, reason: str, args: dict, summary: str,
            node_ids: list, edge_ids: list, ms: float, *, title: str | None = None) -> None:
    qs = log[n0:]
    idx = len(res.steps) + 1
    res.steps.append({
        "id": f"s{idx}", "title": title or TITLES.get(tool, tool), "detail": summary,
        "diagnostics": [f"Cypher `{q['name']}`: {q['rowCount']} row(s) in {q['durationMs']} ms" for q in qs] or None,
        "nodeIds": list(dict.fromkeys(node_ids))[:30] or None, "tool": tool, "reason": reason, "durationMs": round(ms, 1),
        "queryNames": [q["name"] for q in qs] or None,
    })
    res.trace.append({"index": idx, "agent": "drift-guard" if tool == "replay_historical_fix" else "investigator",
                      "tool": tool, "reason": reason, "arguments": args, "resultSummary": summary,
                      "nodeIds": list(dict.fromkeys(node_ids))[:30], "edgeIds": list(dict.fromkeys(edge_ids))[:40],
                      "queries": [{"name": q["name"], "cypher": q["cypher"], "params": q["params"], "write": q["write"],
                                   "rowCount": q["rowCount"], "durationMs": q["durationMs"]} for q in qs],
                      "durationMs": round(ms, 1)})


def _call(res: InvestigatorResult, ctx: ToolContext, log: list, tool: str, args: dict, reason: str) -> str:
    n0, t0 = len(log), time.perf_counter()
    try:
        out = execute_tool(ctx, tool, args)
        summary, nodes, edges = out.summary, out.node_ids, out.edge_ids
        payload = {"summary": out.summary, "data": out.data}
    except ToolError as exc:
        summary, nodes, edges = f"Tool rejected: {exc}", [], []
        payload = {"error": str(exc)}
    ctx.state.done.append(tool)
    _record(res, log, n0, tool, reason, args, summary, nodes, edges, (time.perf_counter() - t0) * 1000)
    return truncate_for_model(payload)


def run_rules(repo: GraphRepository, st: InvState, log: list) -> InvestigatorResult:
    res, ctx = InvestigatorResult(st), ToolContext(repo, st)
    res.ctx = ctx
    for _ in range(20):
        act = next_action(st)
        if act is None:
            break
        if act[0] == "skip":
            _record(res, log, len(log), act[1], act[2], {}, f"Skipped: {act[2]}", [], [], 0, title=f"Skipped {TITLES[act[1]].lower()}")
            continue
        _, tool, args, reason = act
        _call(res, ctx, log, tool, args, reason)
    return res


def run_llm(repo: GraphRepository, st: InvState, log: list, client: ChatClient, max_steps: int) -> InvestigatorResult:
    res, ctx = InvestigatorResult(st), ToolContext(repo, st)
    res.ctx = ctx
    tools = [t.schema() for t in TOOLS.values()] + [FINISH_TOOL]
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": json.dumps({
            "incident": st.incident["name"], "description": st.description,
            "logs": st.logs, "tools": list(TOOLS)})},
    ]
    finished = False
    for _ in range(max_steps):
        msg = client.chat(messages, tools)
        messages.append(msg)
        calls = msg.get("tool_calls") or []
        if not calls:
            break
        for call in calls:
            fn = call.get("function", {})
            name = fn.get("name", "")
            try:
                args = json.loads(fn.get("arguments") or "{}")
            except json.JSONDecodeError:
                args = None
            if name == "finish":
                if isinstance(args, dict):
                    res.narrative = {
                        "root_cause_summary": str(args.get("root_cause_summary", ""))[:600],
                        "recommended_next_action": str(args.get("recommended_next_action", ""))[:400],
                        "remaining_uncertainty": [str(x)[:200] for x in (args.get("remaining_uncertainty") or [])[:5]],
                    }
                messages.append({"role": "tool", "tool_call_id": call.get("id", ""), "content": "ok"})
                finished = True
                continue
            reason = "Selected by the LLM from the allow-listed tools based on prior results."
            content = (_call(res, ctx, log, name, args, reason) if isinstance(args, dict)
                       else json.dumps({"error": "arguments were not valid JSON"}))
            messages.append({"role": "tool", "tool_call_id": call.get("id", ""), "content": content})
        if finished:
            break
    return res
