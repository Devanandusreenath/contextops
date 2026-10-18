"""Native Gemini provider (official `google-genai` SDK), adapted to the same chat interface as the
OpenAI-compatible client, so the Investigator loop is provider-agnostic.

The model may only call the allow-listed tools; arguments are still validated by application code.
Raw model turns are kept so Gemini 3 "thought signatures" are sent back unchanged."""
from __future__ import annotations

import json
import uuid
from typing import Any

from app.agents.llm import LLMError
from app.config import Settings

_STRIP = {"additionalProperties", "maxLength", "minLength", "maxItems", "minItems", "minimum", "maximum"}


def _clean_schema(node: Any) -> Any:
    """Keep to the JSON-Schema subset Gemini accepts; limits are enforced by our own validation."""
    if isinstance(node, dict):
        return {k: _clean_schema(v) for k, v in node.items() if k not in _STRIP}
    if isinstance(node, list):
        return [_clean_schema(v) for v in node]
    return node


class GeminiChatClient:
    def __init__(self, settings: Settings, sdk_client: Any = None):
        self.s = settings
        if sdk_client is None:
            try:
                from google import genai
            except ImportError:
                raise LLMError("The 'google-genai' package is not installed in the backend image. Rebuild with: docker compose up --build -d") from None
            sdk_client = genai.Client(api_key=settings.llm_key)
        self._client = sdk_client
        self._raw: dict[str, Any] = {}      # message _gid -> raw model Content (keeps thought signatures)
        self._names: dict[str, str] = {}    # tool_call id -> function name

    def chat(self, messages: list[dict], tools: list[dict]) -> dict:
        from google.genai import types

        system, contents, pending = None, [], []

        def flush():
            if pending:
                contents.append(types.Content(role="user", parts=list(pending)))
                pending.clear()

        for m in messages:
            role = m["role"]
            if role == "system":
                system = m["content"]
            elif role == "user":
                flush()
                contents.append(types.Content(role="user", parts=[types.Part(text=m["content"])]))
            elif role == "assistant":
                flush()
                raw = self._raw.get(m.get("_gid", ""))
                if raw is None:
                    parts = [types.Part(text=m["content"])] if m.get("content") else []
                    for tc in m.get("tool_calls") or []:
                        parts.append(types.Part(function_call=types.FunctionCall(
                            name=tc["function"]["name"], args=json.loads(tc["function"].get("arguments") or "{}"))))
                    raw = types.Content(role="model", parts=parts)
                contents.append(raw)
            elif role == "tool":
                name = self._names.get(m.get("tool_call_id", ""), "unknown")
                pending.append(types.Part.from_function_response(name=name, response={"result": m.get("content", "")}))
        flush()

        decls = []
        for t in tools:
            fn = t["function"]
            params = _clean_schema(fn.get("parameters") or {})
            kw: dict[str, Any] = {"name": fn["name"], "description": fn.get("description", "")}
            if params.get("properties"):      # no-argument tools must omit parameters
                kw["parameters_json_schema"] = params
            decls.append(types.FunctionDeclaration(**kw))
        config = types.GenerateContentConfig(
            system_instruction=system, tools=[types.Tool(function_declarations=decls)], temperature=0,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True))
        try:
            resp = self._client.models.generate_content(model=self.s.llm_model, contents=contents, config=config)
        except LLMError:
            raise
        except Exception as exc:  # noqa: BLE001 - never leak key/stack; summarise the provider error
            code = getattr(exc, "code", None) or getattr(exc, "status_code", None)
            detail = str(getattr(exc, "message", "") or "")[:200]
            status = f"HTTP {code}" if code else exc.__class__.__name__
            raise LLMError(f"LLM provider returned {status}. {detail}".strip()) from None

        cand = resp.candidates[0] if getattr(resp, "candidates", None) else None
        if cand is None or cand.content is None or not cand.content.parts:
            raise LLMError(f"Gemini returned no content (finish reason: {getattr(cand, 'finish_reason', 'unknown')}).")
        gid, text, calls = uuid.uuid4().hex, [], []
        for part in cand.content.parts:
            fc = getattr(part, "function_call", None)
            if fc:
                cid = f"call_{uuid.uuid4().hex[:8]}"
                self._names[cid] = fc.name
                calls.append({"id": cid, "type": "function", "function": {"name": fc.name, "arguments": json.dumps(dict(fc.args or {}))}})
            elif getattr(part, "text", None) and not getattr(part, "thought", False):
                text.append(part.text)
        self._raw[gid] = cand.content
        return {"role": "assistant", "content": "".join(text) or None, "tool_calls": calls or None, "_gid": gid}
