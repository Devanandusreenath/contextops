"""LLM-mode tests use a scripted stub chat client. No real model API was called in these tests."""
import json

from app.tests.conftest import make_api, make_settings, scenario_payload


class ScriptedClient:
    def __init__(self, script):
        self.script, self.calls = list(script), 0

    def chat(self, messages, tools):
        self.calls += 1
        return self.script.pop(0)


def call(name, args, i=1):
    return {"role": "assistant", "content": None, "tool_calls": [{"id": f"c{i}", "type": "function",
            "function": {"name": name, "arguments": json.dumps(args)}}]}


class Boom:
    def chat(self, messages, tools):
        from app.agents.llm import LLMError
        raise LLMError("LLM provider returned HTTP 401.")


def settings(**kw):
    return make_settings(openai_api_key="test-key-not-real", **kw)


def test_llm_mode_selects_only_allowlisted_tools(clean):
    client = ScriptedClient([
        call("resolve_entities", {}), call("run_cypher", {"query": "MATCH (n) DETACH DELETE n"}, 2),
        call("trace_dependency_path", {"from_ids": ["x'); DROP"]}, 3), call("trace_dependency_path", {}, 4),
        call("inspect_source_change", {}, 5),
        call("finish", {"root_cause_summary": "LLM says rename", "remaining_uncertainty": ["u1"]}, 6)])
    api = make_api(settings(agent_mode="llm"), client)
    with api:
        j = api.post("/api/investigations/run", json=scenario_payload(api)).json()
    assert j["executionMode"] == "llm" and j["llmModel"] and j["requestedMode"] == "llm"
    details = " | ".join(s["detail"] for s in j["steps"])
    assert "not in the allow-list" in details and "must be a list" in details
    assert j["rootCause"]["authoredBy"] == "llm" and "u1" in j["remainingUncertainty"]
    assert j["verification"]["status"] == "partially_verified"        # verification is still deterministic
    assert repo_nodes_intact(clean)


def repo_nodes_intact(repo):
    return repo.counts().get("Incident") == 5


def test_llm_failure_in_llm_mode_is_not_a_fake_success(clean):
    api = make_api(settings(agent_mode="llm"), Boom())
    with api:
        r = api.post("/api/investigations/run", json=scenario_payload(api))
        assert r.status_code == 502 and r.json()["error"]["code"] == "llm_failed" and "401" in r.json()["error"]["message"]
        assert "test-key-not-real" not in r.text
        tasks = api.get("/api/agent-tasks").json()
        assert tasks[0]["status"] == "failed" and api.get("/api/investigations").json() == []


def test_auto_mode_falls_back_and_says_so(clean):
    api = make_api(settings(agent_mode="auto"), Boom())
    with api:
        j = api.post("/api/investigations/run", json=scenario_payload(api)).json()
    assert j["executionMode"] == "rules" and j["requestedMode"] == "auto" and "LLM request failed" in j["fallbackReason"] and j.get("llmModel") is None


def test_auto_mode_without_key_uses_rules_and_says_so(clean):
    api = make_api(make_settings(agent_mode="auto"))
    with api:
        j = api.post("/api/investigations/run", json=scenario_payload(api)).json()
    assert j["executionMode"] == "rules" and "no LLM API key" in j["fallbackReason"]


def test_llm_mode_without_key_is_an_explicit_error(clean):
    api = make_api(make_settings(agent_mode="llm"))
    with api:
        r = api.post("/api/investigations/run", json=scenario_payload(api))
        assert r.status_code == 503 and r.json()["error"]["code"] == "llm_not_configured"
        assert api.get("/api/integrations/status").json()["agent"].get("effectiveMode") is None
