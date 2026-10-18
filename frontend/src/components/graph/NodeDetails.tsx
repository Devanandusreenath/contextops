import { Link } from "@tanstack/react-router";
import { ArrowRight, MousePointerClick } from "lucide-react";
import { EntityDot, EntityTag } from "@/components/ui-kit";
import { ErrorState, LoadingState } from "@/components/ui-states";
import { useGraph, useNeighbors, useNode, useNodeIndex, useRelationDescriptions } from "@/services/queries";

export function NodeDetails({
  nodeId,
  edgeId,
  onSelectNode,
  showExplorerLink = false,
}: {
  nodeId: string | null;
  edgeId?: string | null;
  onSelectNode: (id: string) => void;
  showExplorerLink?: boolean;
}) {
  const graph = useGraph();
  const index = useNodeIndex();
  const relDesc = useRelationDescriptions();
  const nodeQ = useNode(nodeId);
  const nbQ = useNeighbors(nodeId);

  if (edgeId && !nodeId) {
    const e = graph.data?.edges.find((x) => x.id === edgeId);
    const s = e && index.get(e.source);
    const t = e && index.get(e.target);
    if (e && s && t) {
      return (
        <div className="space-y-3 text-sm">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Relationship</p>
          <p className="font-mono text-base text-primary">{e.type}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{relDesc.data?.[e.type] ?? ""}</p>
          <div className="space-y-2 rounded-md border border-border bg-surface p-3">
            <button className="flex w-full items-center gap-2 text-left hover:text-primary" onClick={() => onSelectNode(s.id)}>
              <EntityDot type={s.type} /> {s.label}
            </button>
            <div className="pl-4 font-mono text-xs text-muted-foreground">—{e.type}→</div>
            <button className="flex w-full items-center gap-2 text-left hover:text-primary" onClick={() => onSelectNode(t.id)}>
              <EntityDot type={t.type} /> {t.label}
            </button>
          </div>
          <p className="font-mono text-[10px] text-muted-foreground">relationship id: {e.id}</p>
        </div>
      );
    }
  }
  if (!nodeId)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
        <MousePointerClick className="h-5 w-5" />
        Select a node or edge to inspect its details.
      </div>
    );
  if (nodeQ.isPending) return <LoadingState label="Loading node…" className="py-6" />;
  if (nodeQ.isError) return <ErrorState error={nodeQ.error} onRetry={() => void nodeQ.refetch()} retrying={nodeQ.isFetching} className="p-4" />;
  const node = nodeQ.data;
  const neighbors = nbQ.data ?? [];
  return (
    <div className="space-y-4 text-sm">
      <div>
        <EntityTag type={node.type} />
        <h3 className="mt-1 text-base font-semibold">{node.label}</h3>
        {node.owner && <p className="text-xs text-muted-foreground">Owner: {node.owner}</p>}
        <p className="font-mono text-[10px] text-muted-foreground">id: {node.id}</p>
      </div>
      <p className="leading-relaxed text-muted-foreground">{node.description}</p>
      <div>
        <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Connected entities ({nbQ.isPending ? "…" : neighbors.length})</p>
        {nbQ.isError ? (
          <p className="text-xs text-destructive">Could not load neighbours. <button className="underline" onClick={() => void nbQ.refetch()}>Retry</button></p>
        ) : (
          <ul className="space-y-1">
            {neighbors.map(({ edge, node: n }) => (
              <li key={edge.id}>
                <button onClick={() => onSelectNode(n.id)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-secondary">
                  <EntityDot type={n.type} />
                  <span className="flex-1 truncate">{n.label}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{edge.source === node.id ? `${edge.type}→` : `←${edge.type}`}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {node.evidence && node.evidence.length > 0 && (
        <div>
          <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Related evidence</p>
          <ul className="space-y-1">
            {node.evidence.map((ev) => (
              <li key={ev} className="rounded border border-border bg-surface px-2 py-1.5 text-xs">{ev}</li>
            ))}
          </ul>
        </div>
      )}
      {showExplorerLink && (
        <Link to="/graph" search={{ focus: node.id }} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
          Open in Graph Explorer <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}
