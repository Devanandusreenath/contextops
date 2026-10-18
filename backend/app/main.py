"""ContextOps FastAPI application."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from redis.exceptions import RedisError

from app import __version__
from app.api.deps import Container
from app.api.routes import router
from app.config import Settings, get_settings
from app.graph.client import GraphUnavailable
from app.graph.seed import seed_graph
from app.services.investigation_service import InvestigationFailed, ModeUnavailable, NotFound

log = logging.getLogger("contextops")
MAX_BODY_BYTES = 64 * 1024


def _err(status: int, code: str, message: str, **extra) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message, **extra}})


def create_app(settings: Settings | None = None, container: Container | None = None) -> FastAPI:
    settings = settings or get_settings()
    container = container or Container(settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        try:
            container.client.connect()
            if settings.auto_seed:
                log.info("Seeding graph (idempotent): %s", seed_graph(container.repo))
        except GraphUnavailable as exc:
            log.error("Starting without FalkorDB: %s", exc)
        yield

    app = FastAPI(title="ContextOps API", version=__version__, lifespan=lifespan,
                  description="Agentic incident investigation backed by FalkorDB. All data is synthetic.")
    app.state.container = container
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list, allow_methods=["GET", "POST"],
                       allow_headers=["Content-Type"], allow_credentials=False)

    @app.middleware("http")
    async def limit_body(request: Request, call_next):
        cl = request.headers.get("content-length")
        if cl and cl.isdigit() and int(cl) > MAX_BODY_BYTES:
            return _err(413, "payload_too_large", f"Request body exceeds {MAX_BODY_BYTES} bytes")
        return await call_next(request)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        details = [{"field": ".".join(str(p) for p in e["loc"] if p != "body"), "message": e["msg"]} for e in exc.errors()]
        return _err(422, "validation_error", "Request validation failed", details=details)

    @app.exception_handler(NotFound)
    async def _nf(_: Request, exc: NotFound):
        return _err(404, "not_found", str(exc))

    @app.exception_handler(ModeUnavailable)
    async def _mode(_: Request, exc: ModeUnavailable):
        return _err(503, "llm_not_configured", str(exc))

    @app.exception_handler(InvestigationFailed)
    async def _inv(_: Request, exc: InvestigationFailed):
        return _err(502, exc.code, str(exc), investigationId=exc.investigation_id, executionMode="llm")

    @app.exception_handler(GraphUnavailable)
    @app.exception_handler(RedisError)
    async def _db(_: Request, exc: Exception):
        return _err(503, "graph_unavailable", "FalkorDB is not reachable. Check that the database container is running.")

    @app.exception_handler(Exception)
    async def _any(_: Request, exc: Exception):
        log.exception("Unhandled error")
        return _err(500, "internal_error", "Unexpected server error. See server logs.")

    app.include_router(router)
    return app


app = create_app()
