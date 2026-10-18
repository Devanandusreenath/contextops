import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useEvidence } from "@/services/queries";
import { EmptyState, OfflineBanner, QueryGate } from "@/components/ui-states";
import { DemoNote, PageHeader, Panel } from "@/components/ui-kit";
import { VerificationBadge } from "@/components/dashboard/StatusBadges";
import { cn } from "@/lib/utils";
import type { EvidenceCategory, EvidenceRecord } from "@/types";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/evidence")({
  head: () => pageHead("Evidence & Decisions", "Audit every claim in an investigation report back to its source, relationship and verification state."),
  component: EvidencePage,
});

const CATS: { key: EvidenceCategory; desc: string; bar: string }[] = [
  { key: "Observed fact", desc: "Directly observed in a source record", bar: "bg-primary" },
  { key: "Agent hypothesis", desc: "Inferred by the agent; unconfirmed", bar: "bg-violet" },
  { key: "Proposed action", desc: "Recommended change awaiting approval", bar: "bg-warning" },
  { key: "Tested result", desc: "Outcome of a verification run", bar: "bg-success" },
];

function EvidencePage() {
  const q = useEvidence();
  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader title="Evidence & Decisions" subtitle="Why each claim appears in an investigation report." actions={<DemoNote>Synthetic data · stored in FalkorDB</DemoNote>} />
      <OfflineBanner />
      <QueryGate query={q} label="Loading evidence from FalkorDB…">
        {(all) => (all.length ? <EvidenceView all={all} /> : <EmptyState title="No evidence recorded" hint="Evidence is created by investigations and stored in the graph." />)}
      </QueryGate>
    </div>
  );
}

function EvidenceView({ all }: { all: EvidenceRecord[] }) {
  const [selId, setSel] = useState<string | null>(null);
  const [cat, setCat] = useState<EvidenceCategory | null>(null);
  const rec = all.find((e) => e.id === selId) ?? all.find((e) => e.category === "Tested result") ?? all[0]!;
  const sel = rec.id;

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {CATS.map((c) => (
              <button
                key={c.key}
                onClick={() => setCat(cat === c.key ? null : c.key)}
                aria-pressed={cat === c.key}
                className={cn("panel p-3 text-left transition-colors hover:border-primary/40", cat === c.key && "border-primary/60")}
              >
                <div className={cn("mb-2 h-1 w-8 rounded", c.bar)} />
                <p className="text-sm font-medium">{c.key}</p>
                <p className="text-[11px] text-muted-foreground">{c.desc}</p>
              </button>
            ))}
          </div>
          {CATS.filter((c) => !cat || c.key === cat).map((c) => {
            const items = all.filter((e) => e.category === c.key);
            return (
              <div key={c.key} className="panel overflow-hidden">
                <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
                  <span className={cn("h-2 w-2 rounded-full", c.bar)} />
                  <h2 className="text-sm font-semibold">{c.key}</h2>
                  <span className="text-xs text-muted-foreground">{items.length}</span>
                </div>
                {items.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => setSel(e.id)}
                    className={cn("grid w-full grid-cols-[48px_1fr_auto] items-start gap-3 border-b border-border px-4 py-3 text-left text-sm last:border-0 hover:bg-secondary/50", sel === e.id && "bg-primary/5")}
                  >
                    <span className="font-mono text-xs text-muted-foreground">{e.id}</span>
                    <span>
                      {e.claim}
                      <span className="mt-1 block text-xs text-muted-foreground">{e.source} · <span className="font-mono">{e.incidentId}</span> · {e.timestamp}</span>
                    </span>
                    <VerificationBadge v={e.state} />
                  </button>
                ))}
              </div>
            );
          })}
        </div>
        <Panel title={<span><span className="font-mono text-xs text-muted-foreground">{rec.id}</span> Why this claim appears</span>} className="h-fit xl:sticky xl:top-20">
          <div className="space-y-4 text-sm">
            <p className="font-medium leading-relaxed">{rec.claim}</p>
            <div className="flex gap-2"><VerificationBadge v={rec.state} /></div>
            <dl className="space-y-3 text-xs">
              <div><dt className="text-muted-foreground">Category</dt><dd>{rec.category}</dd></div>
              <div><dt className="text-muted-foreground">Source entity / document</dt><dd>{rec.source}</dd></div>
              <div><dt className="text-muted-foreground">Supporting graph relationship</dt><dd className="font-mono text-primary">{rec.relationship}</dd></div>
              <div><dt className="text-muted-foreground">Related incident</dt><dd className="font-mono">{rec.incidentId}</dd></div>
              <div><dt className="text-muted-foreground">Timestamp</dt><dd className="font-mono">{rec.timestamp}</dd></div>
              {rec.investigationId && <div><dt className="text-muted-foreground">Last investigation</dt><dd className="font-mono">{rec.investigationId}</dd></div>}
            </dl>
            <div className="rounded-md border border-border bg-surface p-3 text-xs leading-relaxed">
              <p className="mb-1 font-medium">Rationale</p>
              <p className="text-muted-foreground">{rec.rationale}</p>
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}
