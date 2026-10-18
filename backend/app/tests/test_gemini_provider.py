"""Native Gemini provider tests use a FAKE google-genai client; no Google request is made."""
import json
from types import SimpleNamespace

import pytest
from google.genai import types

from app.agents.gemini_client import GeminiChatClient
from app.agents.llm import FINISH_TOOL, LLMError, make_chat_client
from app.agents.tools import TOOLS
from app.tests.conftest import make_api, make_settings, scenario_payload

KEY = "AQ.fake-key-should-never-appear"


def fc(name, **args):
    return types.Part(function_call=types.FunctionCall(name=name, args=args), thought_signature=b"sig")


class FakeModels:
    def __init__(self, script):
        self.script, self.calls = list(script), []

    def generate_content(self, model, contents, config):
        self.calls.append(SimpleNamespace(model=model, contents=contents, config=config))
        nxt = self.script.pop(0)
        if isinstance(nxt, Exception):
            raise nxt
        return SimpleNamespace(candidates=[SimpleNamespace(content=types.Content(role="model", parts=nxt), finish_reason="STOP")])


def fake_sdk(script):
    return SimpleNamespace(models=FakeModels(script))


def gem_settings(**kw):
    return make_settings(gemini_api_key=KEY, llm_provider="gemini", **kw)


def all_tools():
    return [t.schema() for t in TOOLS.values()] + [FINISH_TOOL]


def test_provider_selection_and_names():
    s = make_settings(gemini_api_key=KEY)
    assert s.effective_provider == "gemini" and s.llm_configured and s.llm_model == "gemini-3.1-flash-lite"
    both = make_settings(gemini_api_key=KEY, openai_api_key="sk-x")
    assert both.effective_provider == "openai"                       # explicit OpenAI key wins in auto mode
    assert make_settings(gemini_api_key=KEY, openai_api_key="sk-x", llm_provider="gemini").effective_provider == "gemini"
    assert not make_settings().llm_configured


def test_tool_declarations_are_accepted_by_sdk_types_and_noarg_tools_omit_parameters():
    sdk = fake_sdk([[types.Part(text="done")]])
    GeminiChatClient(gem_settings(), sdk).chat([{"role": "system", "content": "s"}, {"role": "user", "content": "u"}], all_tools())
    decls = sdk.models.calls[0].config.tools[0].function_declarations
    by = {d.name: d for d in decls}
    assert len(decls) == 12 and by["resolve_entities"].parameters_json_schema is None
    assert by["trace_dependency_path"].parameters_json_schema["properties"]["from_ids"]["type"] == "array"
    assert "additionalProperties" not in json.dumps(by["finish"].parameters_json_schema)
    assert sdk.models.calls[0].config.automatic_function_calling.disable is True


def test_function_calls_round_trip_and_thought_signatures_are_preserved():
    sdk = fake_sdk([[fc("resolve_entities")], [fc("finish", root_cause_summary="x")]])
    c = GeminiChatClient(gem_settings(), sdk)
    msgs = [{"role": "system", "content": "s"}, {"role": "user", "content": "u"}]
    a = c.chat(msgs, all_tools())
    call = a["tool_calls"][0]
    assert call["function"]["name"] == "resolve_entities" and a["role"] == "assistant"
    msgs += [a, {"role": "tool", "tool_call_id": call["id"], "content": '{"summary":"ok"}'}]
    b = c.chat(msgs, all_tools())
    assert json.loads(b["tool_calls"][0]["function"]["arguments"]) == {"root_cause_summary": "x"}
    sent = sdk.models.calls[1].contents
    assert [x.role for x in sent] == ["user", "model", "user"]
    assert sent[1].parts[0].thought_signature == b"sig"               # raw model turn re-sent unchanged
    assert sent[2].parts[0].function_response.name == "resolve_entities"


def test_provider_errors_are_summarised_without_leaking_the_key():
    err = Exception(f"boom {KEY}")
    err.code, err.message = 401, "API key not valid"
    with pytest.raises(LLMError) as e:
        GeminiChatClient(gem_settings(), fake_sdk([err])).chat([{"role": "user", "content": "u"}], all_tools())
    assert "401" in str(e.value) and KEY not in str(e.value)


def test_empty_response_is_an_error_not_a_fake_success():
    sdk = SimpleNamespace(models=SimpleNamespace(generate_content=lambda **k: SimpleNamespace(candidates=[])))
    with pytest.raises(LLMError):
        GeminiChatClient(gem_settings(), sdk).chat([{"role": "user", "content": "u"}], all_tools())


def test_factory_returns_gemini_client_when_configured(monkeypatch):
    import app.agents.gemini_client as gc
    monkeypatch.setattr("google.genai.Client", lambda api_key: fake_sdk([]))
    assert isinstance(make_chat_client(make_settings(gemini_api_key=KEY)), gc.GeminiChatClient)


def test_full_investigation_through_gemini_provider(clean):
    script = [[fc("resolve_entities")], [fc("trace_dependency_path")], [fc("inspect_source_change")],
              [fc("find_affected_systems")], [fc("inspect_related_incidents")], [fc("retrieve_historical_resolution")],
              [fc("replay_historical_fix")], [fc("check_memory_validity")],
              [fc("finish", root_cause_summary="Gemini summary", remaining_uncertainty=["u"])]]
    s = gem_settings(agent_mode="llm")
    client = GeminiChatClient(s, fake_sdk(script))
    api = make_api(s, client)
    with api:
        j = api.post("/api/investigations/run", json=scenario_payload(api)).json()
        st = api.get("/api/integrations/status").json()["agent"]
    assert j["executionMode"] == "llm" and j["llmModel"] == "gemini-3.1-flash-lite" and j["rootCause"]["authoredBy"] == "llm"
    assert j["verification"]["status"] == "partially_verified" and j["driftFindings"][0]["verdict"] == "requires_revalidation"
    assert st["provider"] == "gemini" and st["model"] == "gemini-3.1-flash-lite" and KEY not in json.dumps(st)


def test_gemini_failure_in_llm_mode_is_502_without_fake_report(clean):
    err = Exception("x"); err.code, err.message = 401, "invalid"
    s = gem_settings(agent_mode="llm")
    api = make_api(s, GeminiChatClient(s, fake_sdk([err])))
    with api:
        r = api.post("/api/investigations/run", json=scenario_payload(api))
        assert r.status_code == 502 and r.json()["error"]["code"] == "llm_failed" and KEY not in r.text
