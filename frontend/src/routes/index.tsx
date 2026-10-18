import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  GitBranch,
  Maximize2,
  Minus,
  Play,
  Plus,
  Route as RouteIcon,
  Server,
} from "lucide-react";
import { Fragment, useRef, useState } from "react";
import { useActivity, useFailurePath, useIncidents, useNodeIndex, useOverview } from "@/services/queries";
import { EmptyState, OfflineBanner, QueryGate } from "@/components/ui-states";
import type { OverviewGraph, PathResult } from "@/types";
import { GraphCanvas, type GraphHandle } from "@/components/graph/GraphCanvas";
import { GraphLegend } from "@/components/graph/GraphLegend";
import { NodeDetails } from "@/components/graph/NodeDetails";
import { Badge, Button, EntityDot, Panel, buttonVariants } from "@/components/ui-kit";
import { SeverityBadge, StatusBadge } from "@/components/dashboard/StatusBadges";
import { useInvestigation } from "@/components/investigation/InvestigationContext";
import { cn } from "@/lib/utils";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/")({
  head: () => pageHead("Engineering Intelligence", "Investigate incidents, understand dependencies, and verify recovery with graph-powered incident intelligence."),
  component: Overview,
});

const metricDefs = [
  { key: "activeIncidents", label: "Active Incidents", icon: AlertTriangle, tone: "text-destructive" },
  { key: "connectedSystems", label: "Connected Systems", icon: Server, tone: "text-primary" },
  { key: "verifiedResolutions", label: "Verified Resolutions", icon: CheckCircle2, tone: "text-success" },
  { key: "knowledgeConflicts", label: "Knowledge Conflicts", icon: GitBranch, tone: "text-warning" },
] as const;

const toneDot = { primary: "bg-primary", violet: "bg-violet", warning: "bg-warning", success: "bg-success", danger: "bg-destructive", muted: "bg-muted-foreground" };

function Overview() {
  const overview = useOverview();
  const failure = useFailurePath();
  return (
    <>
      <OfflineBanner />
      <QueryGate query={overview} label="Loading overview from FalkorDB…">
        {(o) => <QueryGate query={failure}>{(f) => <OverviewView overview={o} failure={f} />}</QueryGate>}
      </QueryGate>
    </>
  );
}

function OverviewView({ overview, failure }: { overview: OverviewGraph; failure: PathResult }) {
  const navigate = useNavigate();
  const { run, phase } = useInvestigation();
  const graphRef = useRef<GraphHandle>(null);
  const idx = useNodeIndex();
  const incidents = useIncidents();
  const { edges, nodes: graphNodes, metrics } = overview;
  const [selNode, setSelNode] = useState<string | null>("svc-normalizer");
  const [selEdge, setSelEdge] = useState<string | null>(null);
  const [showPath, setShowPath] = useState(true);
  const lead = incidents.data?.find((i) => i.nodeId === failure.nodeIds.at(-1)) ?? incidents.data?.[0];

  const selectNode = (id: string | null) => {
    setSelNode(id);
    setSelEdge(null);
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1.5 font-mono text-[11px] uppercase tracking-wider text-primary">Know what changed · Understand what broke · Prove what to do next</p>
          <h1 className="text-2xl font-semibold tracking-tight">Engineering Intelligence</h1>
          <p className="mt-1 text-sm text-muted-foreground">Investigate incidents, understand dependencies, and verify recovery.</p>
        </div>
        <div className="flex gap-2">
          {phase !== "idle" && (
            <Link to="/investigations" className={buttonVariants({ variant: "secondary" })}>
              {phase === "running" ? "View progress" : "View report"}
            </Link>
          )}
          <Button
            onClick={() => {
              run();
              navigate({ to: "/investigations" });
            }}
          >
            <Play /> Run Demo Investigation
          </Button>
        </div>
      </div>

      {/* Active incident banner */}
      <section className="panel overflow-hidden">
        <div className="flex flex-col gap-4 border-l-2 border-destructive p-4 lg:flex-row lg:items-center">
          <div className="min-w-0 lg:w-80 lg:shrink-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
              </span>
              {lead ? (
                <>
                  <span className="font-mono text-xs text-muted-foreground">{lead.id}</span>
                  <SeverityBadge v={lead.severity} />
                  <StatusBadge v={lead.status} />
                </>
              ) : (
                <span className="text-xs text-muted-foreground">No active incident</span>
              )}
            </div>
            <p className="mt-1.5 font-medium">{lead?.title ?? "—"}</p>
            <p className="text-xs text-muted-foreground">Synthetic incident{lead ? ` · updated ${lead.updated}` : ""}</p>
          </div>
          <div className="min-w-0 flex-1">
            <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">Failure path computed from graph relationships · click to inspect</p>
            {!failure.nodeIds.length && <p className="text-xs text-muted-foreground">No confirmed failure path in the graph.</p>}
            <ol className="flex flex-wrap items-center gap-1">
              {failure.nodeIds.map((id, i) => {
                const n = idx.get(id);
                if (!n) return null;
                return (
                  <Fragment key={id}>
                    {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                    <li>
                      <button
                        onClick={() => {
                          selectNode(id);
                          setShowPath(true);
                        }}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
                          selNode === id ? "border-primary/60 bg-primary/10 text-foreground" : "border-border bg-surface hover:border-primary/40",
                        )}
                      >
                        <span className="font-mono text-[10px] text-primary">{i + 1}</span>
                        <EntityDot type={n.type} />
                        {n.label}
                      </button>
                    </li>
                  </Fragment>
                );
              })}
            </ol>
          </div>
        </div>
      </section>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metricDefs.map((m) => (
          <div key={m.label} className="panel flex items-center gap-3 p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary">
              <m.icon className={`h-4 w-4 ${m.tone}`} />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-semibold leading-none tabular-nums">{metrics[m.key]}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">{m.label}</p>
            </div>
            <span className="ml-auto self-start font-mono text-[9px] uppercase tracking-wider text-muted-foreground/70">live</span>
          </div>
        ))}
      </div>

      {/* Graph + details */}
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <section className="panel flex min-w-0 flex-col overflow-hidden">
          <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
            <h2 className="mr-auto text-sm font-semibold">System dependency graph</h2>
            <Button variant={showPath ? "primary" : "secondary"} size="sm" aria-pressed={showPath} onClick={() => setShowPath((v) => !v)}>
              <RouteIcon /> Failure path
            </Button>
            <div className="flex rounded-md border border-border">
              <button aria-label="Zoom out" className="flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-foreground" onClick={() => graphRef.current?.zoom(1.2)}>
                <Minus className="h-3.5 w-3.5" />
              </button>
              <button aria-label="Zoom in" className="flex h-8 w-8 items-center justify-center border-x border-border text-muted-foreground hover:text-foreground" onClick={() => graphRef.current?.zoom(0.83)}>
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button aria-label="Fit to view" className="flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-foreground" onClick={() => graphRef.current?.fit()}>
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <Link to="/graph" search={{ path: true }} className="inline-flex items-center gap-1 px-1 text-xs text-primary hover:underline">
              Explorer <ArrowRight className="h-3 w-3" />
            </Link>
          </header>
          <div className="graph-grid relative h-[280px] md:h-[340px] xl:h-[400px]">
            <GraphCanvas
              ref={graphRef}
              nodes={graphNodes}
              edges={edges}
              selectedNodeId={selNode}
              selectedEdgeId={selEdge}
              highlightNodeIds={showPath && !selEdge ? failure.nodeIds : undefined}
              highlightEdgeIds={showPath && !selEdge ? failure.edgeIds : undefined}
              pathOrder={showPath ? failure.nodeIds : undefined}
              onSelectNode={selectNode}
              onSelectEdge={(id) => {
                setSelEdge(id);
                setSelNode(null);
              }}
            />
          </div>
          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5">
            <GraphLegend types={["Service", "Pipeline", "Dataset", "Incident", "Team", "Fix"]} />
            <Badge tone="warning">Synthetic data</Badge>
          </footer>
        </section>

        <Panel
          title="Inspector"
          action={selNode && failure.nodeIds.includes(selNode) ? <Badge tone="primary">On failure path · step {failure.nodeIds.indexOf(selNode) + 1}</Badge> : undefined}
          bodyClassName="max-h-[460px] overflow-y-auto"
        >
          <NodeDetails nodeId={selNode} edgeId={selEdge} onSelectNode={selectNode} showExplorerLink />
        </Panel>
      </div>

      {/* Incidents + activity */}
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <IncidentsPanel />
        <ActivityPanel />
      </div>
    </div>
  );
}

function IncidentsPanel() {
  const q = useIncidents();
  return (
    <Panel title="Recent incidents" action={<span className="text-[11px] text-muted-foreground">Synthetic records</span>} bodyClassName="p-0 overflow-x-auto">
      <QueryGate query={q} label="Loading incidents…">
        {(rows) =>
          rows.length === 0 ? (
            <EmptyState title="No incidents" />
          ) : (
            <table className="w-full min-w-[600px] text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-border">
                  {["Incident", "Affected System", "Severity", "Status", "Last Updated"].map((h) => (
                    <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.id} className="border-b border-border last:border-0 hover:bg-secondary/50">
                    <td className="px-4 py-3">
                      <Link to="/graph" search={{ focus: i.nodeId }} className="group flex items-baseline gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{i.id}</span>
                        <span className="group-hover:text-primary">{i.title}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{i.system}</td>
                    <td className="px-4 py-3"><SeverityBadge v={i.severity} /></td>
                    <td className="px-4 py-3"><StatusBadge v={i.status} /></td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{i.updated}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </QueryGate>
    </Panel>
  );
}

function ActivityPanel() {
  const q = useActivity();
  return (
    <Panel title={<span className="flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Investigation activity</span>} action={<Badge tone="primary">Latest run</Badge>}>
      <QueryGate query={q} label="Loading activity…">
        {(items) =>
          items.length === 0 ? (
            <EmptyState title="No investigation has run yet" hint="Run an investigation to see agent activity recorded in the graph." />
          ) : (
            <ol className="relative space-y-4 border-l border-border pl-5">
              {items.map((a) => (
                <li key={a.id} className="relative">
                  <span className={`absolute -left-[25px] top-1.5 h-2 w-2 rounded-full ring-4 ring-card ${toneDot[a.tone]}`} />
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-medium">{a.title}</p>
                    <span className="font-mono text-[11px] text-muted-foreground">{a.time}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{a.detail}</p>
                </li>
              ))}
            </ol>
          )
        }
      </QueryGate>
    </Panel>
  );
}
