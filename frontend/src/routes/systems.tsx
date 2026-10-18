import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useGraph, useNeighbors } from "@/services/queries";
import { EmptyState, OfflineBanner, QueryGate } from "@/components/ui-states";
import { EntityDot, EntityTag, PageHeader, Panel, buttonVariants, inputClass } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import type { EntityType, GraphEdge, GraphNode } from "@/types";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/systems")({
  head: () => pageHead("Systems & Teams", "Searchable catalog of services, datasets, pipelines, teams and owners with their relationships."),
  component: SystemsPage,
});

const CATALOG: EntityType[] = ["Service", "Dataset", "Pipeline", "Team", "Person"];

function SystemsPage() {
  const q = useGraph();
  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader title="Systems & Teams" subtitle="Who owns what, what depends on what, and where incidents have landed." />
      <OfflineBanner />
      <QueryGate query={q} label="Loading catalog from FalkorDB…">{(g) => <SystemsView nodes={g.nodes} edges={g.edges} />}</QueryGate>
    </div>
  );
}

function SystemsView({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const [q, setQ] = useState("");
  const [type, setType] = useState<EntityType | "All">("All");
  const [sel, setSel] = useState<string>("svc-normalizer");

  const rows = useMemo(
    () => nodes.filter((n) => CATALOG.includes(n.type) && (type === "All" || n.type === type) && (!q || `${n.label} ${n.description} ${n.owner ?? ""}`.toLowerCase().includes(q.toLowerCase()))),
    [nodes, q, type],
  );
  const node = nodes.find((n) => n.id === sel) ?? nodes[0];
  const nbQ = useNeighbors(node?.id ?? null);
  const nb = nbQ.data ?? [];
  const group = (types: EntityType[]) => nb.filter((x) => types.includes(x.node.type));
  const degree = (id: string) => edges.filter((e) => e.source === id || e.target === id).length;
  if (!node) return <EmptyState title="The graph is empty" hint="Seed the graph (python -m scripts.seed_graph)." />;

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
        <div className="panel overflow-hidden">
          <div className="flex flex-wrap gap-3 border-b border-border p-3">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input className={cn(inputClass, "pl-8")} placeholder="Search systems, teams, owners…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search catalog" />
            </div>
            <select className={cn(inputClass, "w-auto")} value={type} onChange={(e) => setType(e.target.value as EntityType | "All")} aria-label="Filter by type">
              {["All", ...CATALOG].map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  {["Name", "Type", "Owner", "Connections"].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((n) => (
                  <tr
                    key={n.id}
                    tabIndex={0}
                    onClick={() => setSel(n.id)}
                    onKeyDown={(e) => e.key === "Enter" && setSel(n.id)}
                    className={cn("cursor-pointer border-b border-border last:border-0 hover:bg-secondary/50", sel === n.id && "bg-primary/5")}
                  >
                    <td className="px-4 py-3 font-medium">{n.label}</td>
                    <td className="px-4 py-3"><EntityTag type={n.type} /></td>
                    <td className="px-4 py-3 text-muted-foreground">{n.owner ?? "—"}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{degree(n.id)}</td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">No entities match.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <Panel title={node.label} action={<EntityTag type={node.type} />}>
          <div className="space-y-4 text-sm">
            <p className="text-muted-foreground">{node.description}</p>
            <p className="text-xs"><span className="text-muted-foreground">Owner:</span> {node.owner ?? node.label}</p>
            {nbQ.isPending && <p className="text-xs text-muted-foreground">Loading relationships…</p>}
            {nbQ.isError && <p className="text-xs text-destructive">Could not load relationships. <button className="underline" onClick={() => void nbQ.refetch()}>Retry</button></p>}
            {[
              { title: "Connected systems", items: group(["Service", "Dataset", "Pipeline"]) },
              { title: "Teams & people", items: group(["Team", "Person"]) },
              { title: "Related incidents", items: group(["Incident"]) },
              { title: "Relevant decisions & docs", items: group(["Decision", "Document"]) },
            ].map((g) => (
              <div key={g.title}>
                <p className="mb-1.5 text-xs uppercase tracking-wider text-muted-foreground">{g.title}</p>
                {g.items.length ? (
                  <ul className="space-y-1">
                    {g.items.map(({ edge, node: n }) => (
                      <li key={edge.id} className="flex items-center gap-2 text-xs">
                        <EntityDot type={n.type} />
                        <span className="flex-1">{n.label}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">{edge.type}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-xs text-muted-foreground">None recorded</p>}
              </div>
            ))}
            <Link to="/graph" search={{ focus: node.id }} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Show in Graph Explorer <ArrowRight />
            </Link>
          </div>
        </Panel>
      </div>
    </>
  );
}
