"""Idempotently seed the synthetic graph.   python -m scripts.seed_graph   (run from backend/)"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import get_settings  # noqa: E402
from app.graph.client import GraphClient  # noqa: E402
from app.graph.repository import GraphRepository  # noqa: E402
from app.graph.seed import seed_graph  # noqa: E402

if __name__ == "__main__":
    s = get_settings()
    c = GraphClient(s)
    c.connect()
    print(json.dumps(seed_graph(GraphRepository(c)), indent=2))
