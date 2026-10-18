"""DESTRUCTIVE reset helper.

  python -m scripts.reset_graph --runs-only   delete only agent-created data (investigations, evidence, memory) and reseed
  python -m scripts.reset_graph --all         delete the WHOLE graph and reseed

Both ask for confirmation unless --yes is given.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import get_settings  # noqa: E402
from app.graph.client import GraphClient  # noqa: E402
from app.graph.repository import GraphRepository  # noqa: E402
from app.graph.seed import reset_agent_runs, seed_graph  # noqa: E402

p = argparse.ArgumentParser()
g = p.add_mutually_exclusive_group(required=True)
g.add_argument("--runs-only", action="store_true")
g.add_argument("--all", action="store_true")
p.add_argument("--yes", action="store_true", help="skip the confirmation prompt")
a = p.parse_args()

s = get_settings()
what = ("ALL data in graph" if a.all else "all agent-created data (investigations, evidence, memory) in graph")
print(f"WARNING: this will permanently delete {what} '{s.falkordb_graph}' on {s.falkordb_host}:{s.falkordb_port}.")
if not a.yes and input("Type 'reset' to continue: ").strip() != "reset":
    sys.exit("Aborted. Nothing was changed.")
c = GraphClient(s)
c.connect()
repo = GraphRepository(c)
if a.all:
    c.delete_graph()
    print(json.dumps(seed_graph(repo), indent=2))
else:
    print(json.dumps(reset_agent_runs(repo), indent=2))
print("Done.")
