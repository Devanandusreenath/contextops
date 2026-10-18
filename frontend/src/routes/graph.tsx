import { createFileRoute } from "@tanstack/react-router";
import { Crosshair, Maximize2, Route as RouteIcon, RotateCcw, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDemoPath, useGraph, useRun } from "@/services/queries";
import { OfflineBanner, QueryGate } from "@/components/ui-states";
import { GraphCanvas, type GraphHandle } from "@/components/graph/GraphCanvas";
import { NodeDetails } from "@/components/graph/NodeDetails";
import { Button, DemoNote, EntityDot, Panel, inputClass } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import type { EntityType, GraphEdge, GraphNode, PathResult } from "@/types";
import { pageHead } from "@/lib/seo";

interface GraphSearch {
  focus?: string | undefined;
  path?: boolean | undefined;
  q?: string | undefined;
  inv?: string | undefined;
}

export const Route = createFileRoute("/graph")({
  validateSearch: (s: Record<string, unknown>): GraphSearch => ({
    focus: typeof s["focus"] === "string" ? s["focus"] : undefined,
    path: s["path"] === true || s["path"] === "true" ? true : undefined,
    q: typeof s["q"] === "string" ? s["q"] : undefined,
    inv: typeof s["inv"] === "string" && /^inv-[a-f0-9]{8}$/.test(s["inv"]) ? s["inv"] : undefined,
  }),
  head: () => pageHead("Graph Explorer", "Explore services, datasets, incidents, teams, decisions and fixes in the engineering knowledge graph."),
  component: GraphExplorer,
});

const TYPES: EntityType[] = ["Service", "Dataset", "Pipeline", "Incident", "Person", "Team", "Decision", "Document", "Fix", "Verification Test", "Project"];

function GraphExplorer() {
  const search = Route.useSearch();
  const graph = useGraph();
  const demo = useDemoPath();
  const run = useRun(search.inv);
  return (
    <>
      <OfflineBanner />
      <QueryGate query={graph} label="Loading graph from FalkorDB…">
        {(g) => (
          <QueryGate query={demo} label="Loading evidence path…">
            {(dp) => <GraphExplorerView nodes={g.nodes} edges={g.edges} demoPath={run.data?.evidencePath ?? dp} fromRun={run.data?.investigationId} search={search} />}
          </QueryGate>
        )}
      </QueryGate>
    </>
  );
}

function GraphExplorerView({ nodes, edges, demoPath, fromRun, search }: { nodes: GraphNode[]; edges: GraphEdge[]; demoPath: PathResult; fromRun?: string | undefined; search: GraphSearch }) {
  const graphRef = useRef<GraphHandle>(null);
  const [q, setQ] = useState(search.q ?? "");
  const [types, setTypes] = useState<Set<EntityType>>(new Set(TYPES));
  const [sel, setSel] = useState<string | null>(search.focus ?? null);
  const [selEdge, setSelEdge] = useState<string | null>(null);
  const [showPath, setShowPath] = useState(!!search.path || !!search.inv);
  const [highlightRels, setHighlightRels] = useState(true);

  useEffect(() => {
    setSel(search.focus ?? null);
    setShowPath(!!search.path || !!search.inv);
    setQ(search.q ?? "");
    if (search.focus) setTimeout(() => graphRef.current?.focus(search.focus!), 0);
  }, [search.focus, search.path, search.q, search.inv]);

  const visibleNodes = useMemo(() => nodes.filter((n) => types.has(n.type)), [nodes, types]);
  const visibleIds = new Set(visibleNodes.map((n) => n.id));
  const visibleEdges = edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target));
  const matches = q.trim() ? visibleNodes.filter((n) => n.label.toLowerCase().includes(q.toLowerCase()) || n.type.toLowerCase().includes(q.toLowerCase())) : [];

  const hlNodes = showPath ? demoPath.nodeIds : matches.length ? matches.map((n) => n.id) : !highlightRels ? (sel ? [sel] : undefined) : undefined;
  const hlEdges = showPath ? demoPath.edgeIds : !highlightRels && sel ? ["__none"] : undefined;

  const toggleType = (t: EntityType) =>
    setTypes((prev) => {
      const n = new Set(prev);
      n.has(t) ? n.delete(t) : n.add(t);
      return n;
    });

  const resetAll = () => {
    setSel(null);
    setSelEdge(null);
    setShowPath(false);
    setQ("");
    setTypes(new Set(TYPES));
    graphRef.current?.fit();
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Graph Explorer</h1>
          <p className="mt-1 text-sm text-muted-foreground">Engineering knowledge graph: {nodes.length} entities, {edges.length} relationships.</p>
        </div>
        <DemoNote>Synthetic data · live from FalkorDB</DemoNote>
      </div>

      <div className="panel flex flex-wrap items-center gap-2 p-3">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            className={cn(inputClass, "pl-8")}
            placeholder="Search nodes…"
            value={q}
            aria-label="Search nodes"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && matches[0]) {
                setSel(matches[0].id);
                graphRef.current?.focus(matches[0].id);
              }
            }}
          />
        </div>
        <Button variant={showPath ? "primary" : "secondary"} size="sm" onClick={() => setShowPath((v) => !v)} aria-pressed={showPath}>
          <RouteIcon /> {fromRun ? "Investigation evidence path" : "Demo dependency path"}
        </Button>
        <Button variant={highlightRels ? "outline" : "ghost"} size="sm" onClick={() => setHighlightRels((v) => !v)} aria-pressed={highlightRels}>
          Highlight relationships: {highlightRels ? "on" : "off"}
        </Button>
        <Button variant="secondary" size="sm" disabled={!sel} onClick={() => sel && graphRef.current?.focus(sel)}>
          <Crosshair /> Focus selected
        </Button>
        <Button variant="secondary" size="sm" onClick={() => graphRef.current?.fit()}>
          <Maximize2 /> Fit to view
        </Button>
        <Button variant="ghost" size="sm" onClick={resetAll}>
          <RotateCcw /> Reset
        </Button>
        {q && <span className="text-xs text-muted-foreground">{matches.length} match{matches.length === 1 ? "" : "es"} · Enter to select</span>}
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by entity type">
        {TYPES.map((t) => (
          <button
            key={t}
            onClick={() => toggleType(t)}
            aria-pressed={types.has(t)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
              types.has(t) ? "border-border bg-secondary text-foreground" : "border-transparent text-muted-foreground/60 line-through",
            )}
          >
            <EntityDot type={t} /> {t}
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="panel graph-grid relative h-[640px] overflow-hidden">
          <GraphCanvas
            ref={graphRef}
            nodes={visibleNodes}
            edges={visibleEdges}
            selectedNodeId={sel}
            selectedEdgeId={selEdge}
            highlightNodeIds={hlNodes}
            highlightEdgeIds={hlEdges}
            onSelectNode={(id) => {
              setSel(id);
              setSelEdge(null);
            }}
            onSelectEdge={(id) => {
              setSelEdge(id);
              setSel(null);
            }}
            ariaLabel="Engineering knowledge graph"
          />
          {showPath && (
            <div className="panel absolute left-3 top-3 max-w-sm p-3 text-xs">
              <p className="font-semibold text-primary">{fromRun ? `Evidence path · ${fromRun}` : "Evidence path · INC-2041"}</p>
              <p className="mt-1 text-muted-foreground">Path computed from FalkorDB relationships ({demoPath.nodeIds.length} entities, {demoPath.edgeIds.length} relationships){demoPath.derivedFrom?.length ? ` via ${demoPath.derivedFrom.join(", ")}` : ""}.</p>
              {!demoPath.nodeIds.length && <p className="mt-1 text-muted-foreground">This investigation found no evidence path.</p>}
            </div>
          )}
          <p className="absolute bottom-3 right-3 text-[11px] text-muted-foreground">Drag to pan · scroll to zoom · Tab + Enter to select</p>
        </div>
        <Panel title="Details" bodyClassName="max-h-[600px] overflow-y-auto">
          <NodeDetails nodeId={sel} edgeId={selEdge} onSelectNode={(id) => { setSel(id); setSelEdge(null); }} />
        </Panel>
      </div>
    </div>
  );
}
