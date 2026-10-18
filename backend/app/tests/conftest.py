"""Test fixtures. Tests that need FalkorDB use TEST_FALKORDB_HOST / TEST_FALKORDB_PORT
(default localhost:6379) and a dedicated graph, never the demo graph. They are SKIPPED if no DB answers."""
from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

from app.api.deps import Container
from app.config import Settings
from app.graph.client import GraphClient, GraphUnavailable
from app.graph.repository import GraphRepository
from app.graph.seed import reset_agent_runs, seed_graph
from app.main import create_app

HOST = os.getenv("TEST_FALKORDB_HOST", "localhost")
PORT = int(os.getenv("TEST_FALKORDB_PORT", "6379"))
GRAPH = os.getenv("TEST_FALKORDB_GRAPH", "contextops_test")


def make_settings(**over) -> Settings:
    base = dict(falkordb_host=HOST, falkordb_port=PORT, falkordb_graph=GRAPH, agent_mode="rules", openai_api_key=None,
                app_env="test", auto_seed=True, falkordb_connect_retries=1, falkordb_connect_delay_seconds=0)
    base.update(over)
    return Settings(_env_file=None, **base)


@pytest.fixture(scope="session")
def db_available():
    try:
        GraphClient(make_settings()).connect(retries=1, delay=0)
    except GraphUnavailable:
        pytest.skip(f"FalkorDB not reachable at {HOST}:{PORT} - start it (docker compose up falkordb) or set TEST_FALKORDB_*")
    return True


@pytest.fixture(scope="session")
def repo(db_available) -> GraphRepository:
    client = GraphClient(make_settings())
    client.connect(retries=1, delay=0)
    r = GraphRepository(client)
    client.delete_graph()
    seed_graph(r)
    return r


@pytest.fixture(autouse=False)
def clean(repo):
    """Remove everything agents created and restore seed-mutable state."""
    reset_agent_runs(repo)
    return repo


@pytest.fixture()
def api(clean):
    app = create_app(make_settings())
    with TestClient(app) as c:
        yield c


def make_api(settings: Settings, chat_client=None) -> TestClient:
    app = create_app(settings, Container(settings, chat_client=chat_client))
    return TestClient(app)


def scenario_payload(api: TestClient, scenario_id="field-rename") -> dict:
    sc = next(s for s in api.get("/api/scenarios").json() if s["id"] == scenario_id)
    return {"scenarioId": sc["id"], "description": sc["description"], "logs": sc["logs"]}
