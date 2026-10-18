import { createFileRoute, Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/services/api";
import { useMemoryRecords, useNodeIndex } from "@/services/queries";
import { EmptyState, ErrorState, OfflineBanner, QueryGate } from "@/components/ui-states";
import { Badge, Button, DemoNote, EntityDot, PageHeader, inputClass } from "@/components/ui-kit";
import { ValidityBadge } from "@/components/dashboard/StatusBadges";
import { Drawer } from "@/components/Drawer";
import { cn } from "@/lib/utils";
import type { MemoryKind, MemoryRecord, Validity } from "@/types";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/memory")({
  head: () => pageHead("Agent Memory", "Past incidents, observations, verified resolutions, decisions and knowledge conflicts remembered by the agent."),
  component: MemoryPage,
});

const KINDS: (MemoryKind | "All")[] = ["All", "Past incident", "Observation", "Verified resolution", "Decision", "Knowledge conflict"];
const VALIDITY: (Validity | "All")[] = ["All", "Valid", "Verified", "Needs review", "Superseded"];

function MemoryPage() {
  const q = useMemoryRecords();
  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader title="Agent Memory" subtitle="What the agent has learned from past incidents, sources and decisions." actions={<DemoNote>Persistent memory stored in FalkorDB</DemoNote>} />
      <OfflineBanner />
      <QueryGate query={q} label="Loading memory from FalkorDB…">{(all) => <MemoryView all={all} />}</QueryGate>
    </div>
  );
}

function MemoryView({ all }: { all: MemoryRecord[] }) {
  const idx = useNodeIndex();
  const qc = useQueryClient();
  const review = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: "confirm_valid" | "needs_review" | "superseded" }) => api.reviewMemory(id, decision, "Reviewed in UI"),
    onSuccess: (rec) => {
      setOpen(rec);
      void qc.invalidateQueries({ queryKey: ["memory"] });
      void qc.invalidateQueries({ queryKey: ["overview"] });
    },
  });
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number]>("All");
  const [validity, setValidity] = useState<(typeof VALIDITY)[number]>("All");
  const [open, setOpen] = useState<MemoryRecord | null>(null);
  const [trace, setTrace] = useState(false);

  const rows = useMemo(
    () =>
      all.filter(
        (m) =>
          (kind === "All" || m.kind === kind) &&
          (validity === "All" || m.validity === validity) &&
          (!q || `${m.title} ${m.summary} ${m.source} ${m.id}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [all, q, kind, validity],
  );

  return (
    <>
      <div className="panel mb-4 flex flex-wrap items-center gap-3 p-3">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input className={cn(inputClass, "pl-8")} placeholder="Search memory…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search memory" />
        </div>
        <select className={cn(inputClass, "w-auto")} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Filter by kind">
          {KINDS.map((k) => <option key={k}>{k}</option>)}
        </select>
        <select className={cn(inputClass, "w-auto")} value={validity} onChange={(e) => setValidity(e.target.value as typeof validity)} aria-label="Filter by validity">
          {VALIDITY.map((k) => <option key={k}>{k}</option>)}
        </select>
        <span className="ml-auto text-xs text-muted-foreground">{rows.length} of {all.length} records</span>
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b border-border">
              {["Record", "Kind", "Source", "Updated", "Validity", ""].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className="cursor-pointer border-b border-border last:border-0 hover:bg-secondary/50" onClick={() => { setOpen(m); setTrace(false); }}>
                <td className="px-4 py-3">
                  <span className="font-mono text-xs text-muted-foreground">{m.id}</span>
                  <span className="ml-2">{m.title}</span>
                  {m.origin === "agent" && <Badge tone="violet" className="ml-2">written by agent</Badge>}
                </td>
                <td className="px-4 py-3"><Badge tone={m.kind === "Knowledge conflict" ? "warning" : m.kind === "Verified resolution" ? "success" : "neutral"}>{m.kind}</Badge></td>
                <td className="px-4 py-3 text-muted-foreground">{m.source}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{m.updated}</td>
                <td className="px-4 py-3"><ValidityBadge v={m.validity} /></td>
                <td className="px-4 py-3 text-right">
                  <button className="text-xs text-primary hover:underline" onClick={(e) => { e.stopPropagation(); setOpen(m); setTrace(true); }}>View Memory Trace</button>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={6}><EmptyState title={all.length ? "No memory records match these filters." : "No memory records yet"} /></td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Drawer open={!!open} onClose={() => setOpen(null)} title={open && <span><span className="font-mono text-xs text-muted-foreground">{open.id}</span> {open.title}</span>}>
        {open && (
          <div className="space-y-5 text-sm">
            <div className="flex flex-wrap gap-2"><Badge>{open.kind}</Badge><ValidityBadge v={open.validity} /></div>
            <p className="leading-relaxed text-muted-foreground">{open.summary}</p>
            <dl className="grid grid-cols-2 gap-3 text-xs">
              <div><dt className="text-muted-foreground">Created</dt><dd className="font-mono">{open.created}</dd></div>
              <div><dt className="text-muted-foreground">Updated</dt><dd className="font-mono">{open.updated}</dd></div>
              <div className="col-span-2"><dt className="text-muted-foreground">Source reference</dt><dd>{open.source}</dd></div>
            </dl>
            {open.validity === "Needs review" && (
              <p className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
                {open.driftReason || "This claim conflicts with newer observations and should be reviewed before it is reused."}
              </p>
            )}
            {(open.verificationStatus || open.investigationId) && (
              <dl className="grid grid-cols-2 gap-3 text-xs">
                {open.verificationStatus && <div><dt className="text-muted-foreground">Verification status</dt><dd className="font-mono">{open.verificationStatus}</dd></div>}
                {open.investigationId && <div><dt className="text-muted-foreground">Written by investigation</dt><dd className="font-mono">{open.investigationId}</dd></div>}
              </dl>
            )}
            <div>
              <p className="mb-1.5 text-xs uppercase tracking-wider text-muted-foreground">Human review</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" disabled={review.isPending} onClick={() => review.mutate({ id: open.id, decision: "confirm_valid" })}>Confirm still valid</Button>
                <Button size="sm" variant="secondary" disabled={review.isPending} onClick={() => review.mutate({ id: open.id, decision: "needs_review" })}>Needs review</Button>
                <Button size="sm" variant="secondary" disabled={review.isPending} onClick={() => review.mutate({ id: open.id, decision: "superseded" })}>Mark superseded</Button>
              </div>
              {review.isError && <ErrorState error={review.error} className="mt-2 p-3" />}
            </div>
            <Button variant={trace ? "primary" : "secondary"} size="sm" onClick={() => setTrace((v) => !v)}>View Memory Trace</Button>
            {trace && (
              <div className="rounded-md border border-border bg-surface p-3 animate-in fade-in">
                <p className="mb-3 text-xs uppercase tracking-wider text-muted-foreground">Trace</p>
                <ol className="space-y-2 border-l border-border pl-4 text-xs">
                  <li><span className="text-muted-foreground">Source:</span> {open.source}</li>
                  {open.incidentId && <li><span className="text-muted-foreground">Incident:</span> <span className="font-mono">{open.incidentId}</span></li>}
                  {open.nodeIds.map((id) => {
                    const n = idx.get(id);
                    if (!n) return <li key={id} className="font-mono text-muted-foreground">{id}</li>;
                    return (
                      <li key={id}>
                        <Link to="/graph" search={{ focus: id }} className="inline-flex items-center gap-1.5 hover:text-primary">
                          <EntityDot type={n.type} /> {n.label}
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}
