"""Thin wrapper around the official FalkorDB Python client (``falkordb.FalkorDB``)."""
from __future__ import annotations

import logging
import time

from falkordb import FalkorDB

from app.config import Settings

log = logging.getLogger("contextops.graph")


class GraphUnavailable(RuntimeError):
    """Raised when FalkorDB cannot be reached."""


class GraphClient:
    def __init__(self, settings: Settings, graph_name: str | None = None):
        self.settings = settings
        self.graph_name = graph_name or settings.falkordb_graph
        self._db: FalkorDB | None = None

    def connect(self, retries: int | None = None, delay: float | None = None) -> None:
        """Connect with retry, because the DB container may still be starting."""
        retries = self.settings.falkordb_connect_retries if retries is None else retries
        delay = self.settings.falkordb_connect_delay_seconds if delay is None else delay
        last: Exception | None = None
        for attempt in range(1, max(retries, 1) + 1):
            try:
                pw = self.settings.falkordb_password
                db = FalkorDB(
                    host=self.settings.falkordb_host,
                    port=self.settings.falkordb_port,
                    password=pw.get_secret_value() if pw else None,
                    socket_connect_timeout=5,
                )
                db.connection.ping()
                self._db = db
                log.info("Connected to FalkorDB at %s:%s", self.settings.falkordb_host, self.settings.falkordb_port)
                return
            except Exception as exc:  # noqa: BLE001 - surfaced as GraphUnavailable below
                last = exc
                log.warning("FalkorDB not ready (attempt %s/%s): %s", attempt, retries, exc.__class__.__name__)
                if attempt < retries:
                    time.sleep(delay)
        raise GraphUnavailable(f"Could not connect to FalkorDB: {last.__class__.__name__}")

    @property
    def db(self) -> FalkorDB:
        if self._db is None:
            raise GraphUnavailable("FalkorDB client is not connected")
        return self._db

    @property
    def graph(self):
        return self.db.select_graph(self.graph_name)

    def ping(self) -> bool:
        try:
            return bool(self.db.connection.ping())
        except Exception:  # noqa: BLE001
            return False

    def module_version(self) -> str | None:
        """Return the FalkorDB graph module version (e.g. '4.18.3'), if the server reports it."""
        try:
            for mod in self.db.connection.execute_command("MODULE", "LIST"):
                info = {}
                for k, v in zip(mod[0::2], mod[1::2]):
                    info[k.decode() if isinstance(k, bytes) else k] = v.decode() if isinstance(v, bytes) else v
                if info.get("name") == "graph":
                    v = int(info["ver"])
                    return f"{v // 10000}.{(v // 100) % 100}.{v % 100}"
        except Exception:  # noqa: BLE001
            return None
        return None

    def delete_graph(self) -> None:
        try:
            self.graph.delete()
        except Exception as exc:  # noqa: BLE001 - deleting a missing graph raises
            log.info("delete_graph: %s", exc)
