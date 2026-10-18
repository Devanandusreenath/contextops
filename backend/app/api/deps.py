from __future__ import annotations

from fastapi import Request

from app.config import Settings
from app.graph.client import GraphClient, GraphUnavailable
from app.graph.repository import GraphRepository
from app.services.graph_service import GraphService
from app.services.investigation_service import InvestigationService


class Container:
    def __init__(self, settings: Settings, client: GraphClient | None = None, chat_client=None):
        self.settings = settings
        self.client = client or GraphClient(settings)
        self.repo = GraphRepository(self.client)
        self.chat_client = chat_client

    def ensure_connected(self) -> None:
        if self.client._db is None or not self.client.ping():
            self.client.connect(retries=1, delay=0)


def container(request: Request) -> Container:
    c: Container = request.app.state.container
    try:
        c.ensure_connected()
    except GraphUnavailable:
        raise
    return c


def repo_dep(request: Request) -> GraphRepository:
    return container(request).repo


def graph_service_dep(request: Request) -> GraphService:
    return GraphService(container(request).repo)


def investigation_service_dep(request: Request) -> InvestigationService:
    c = container(request)
    return InvestigationService(c.repo, c.settings, c.chat_client)
