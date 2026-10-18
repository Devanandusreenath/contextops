import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, ChevronRight, FlaskConical, Loader2, Network, Play, RotateCcw, Search, ShieldAlert, Wrench, XCircle, Info } from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";
import { Badge, Button, EntityDot, PageHeader, Panel, inputClass, buttonVariants, type Tone } from "@/components/ui-kit";
import { VerificationBadge } from "@/components/dashboard/StatusBadges";
import { useInvestigation } from "@/components/investigation/InvestigationContext";
import { EmptyState, ErrorState, LoadingState, OfflineBanner } from "@/components/ui-states";
import { useNodeIndex, useTrace } from "@/services/queries";
import { cn } from "@/lib/utils";
import type { DriftFinding, EvidenceCategory, InvestigationRun, Outcome, VerificationResult } from "@/types";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/investigations")({
  head: () => pageHead("Investigations", "Run an agentic incident investigation over the FalkorDB knowledge graph and review the evidence-backed report."),
  component: Investigations,
});

const outcomeLabel: Record<Outcome, string> = {
  verified: "Verified",
  partially_verified: "Partially verified",
  verification_failed: "Verification failed",
  inconclusive: "Inconclusive",
  awaiting_verification: "Awaiting verification",
};
const outcomeTone: Record<Outcome, Tone> = { verified: "success", partially_verified: "warning", verification_failed: "danger", inconclusive: "neutral", awaiting_verification: "primary" };
const verdictTone: Record<DriftFinding["verdict"], Tone> = { applicable: "success", potentially_stale: "warning", requires_revalidation: "danger", not_applicable: "neutral" };
const impactTone: Record<string, Tone> = { source: "primary", confirmed: "danger", potential: "warning", no_evidence_of_impact: "neutral", upstream: "neutral" };
const impactLabel: Record<string, string> = { source: "change source", confirmed: "confirmed affected", potential: "on propagation path", no_evidence_of_impact: "exposed · no recorded impact", upstream: "upstream" };

function Investigations() {
  const inv = useInvestigation();
  const running = inv.phase === "running";
  const r = inv.result;
  const idx = useNodeIndex();

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Investigations"
        subtitle="Describe an incident. The Investigator Agent selects graph tools, checks whether past fixes still apply, and the Verification Agent runs deterministic tests."
        actions={
          <>
            <Button variant="secondary" onClick={inv.reset} disabled={running || (!r && inv.phase !== "error")}>
              <RotateCcw /> Clear view
            </Button>
            <Button onClick={inv.run} disabled={running || !inv.scenarioId}>
              {running ? <Loader2 className="animate-spin" /> : <Play />} {r ? "Run again" : "Run Investigation"}
            </Button>
          </>
        }
      />
      <OfflineBanner />

      <div className="panel mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <Badge tone={running ? "primary" : inv.phase === "error" ? "danger" : r ? "success" : "neutral"} className={cn(running && "pulse-ring")}>
          {running && <Loader2 className="h-3 w-3 animate-spin" />}
          {r && !running && inv.phase !== "error" && <CheckCircle2 className="h-3 w-3" />}
          {running ? "Running · querying FalkorDB" : inv.phase === "error" ? "Failed" : r ? "Complete" : "Ready"}
        </Badge>
        {r && !running && (
          <>
            <Badge tone={r.executionMode === "llm" ? "violet" : "primary"}>
              Execution mode: {r.executionMode === "llm" ? `LLM tool-calling (${r.llmModel ?? "model"})` : "deterministic rules (no LLM used)"}
            </Badge>
            <Badge tone={outcomeTone[r.outcome]}>{outcomeLabel[r.outcome]}</Badge>
            <span className="font-mono text-xs text-muted-foreground">{r.investigationId} · {r.steps.length} steps · {r.graphQueriesUsed.length} query types</span>
            {inv.restored && <Badge tone="neutral">Loaded from FalkorDB history</Badge>}
          </>
        )}
        <Badge tone="warning" className="ml-auto">Synthetic data</Badge>
      </div>
      {r?.fallbackReason && !running && (
        <p className="mb-4 flex gap-2 rounded-md border border-warning/30 bg-warning/5 p-2.5 text-xs text-warning"><Info className="h-3.5 w-3.5 shrink-0" /> {r.fallbackReason}</p>
      )}
      {inv.phase === "error" && inv.error && (
        <ErrorState error={inv.error} onRetry={inv.run} className="mb-4 max-w-none" />
      )}
      {inv.scenariosError != null && <ErrorState error={inv.scenariosError} className="mb-4 max-w-none" />}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Panel title="Incident input" action={<span className="text-[11px] text-muted-foreground">Editable</span>}>
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Scenario</span>
              <select className={inputClass} value={inv.scenarioId} onChange={(e) => inv.setScenario(e.target.value)} disabled={running || !inv.scenarios.length}>
                {inv.scenarios.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Incident description</span>
              <textarea className={`${inputClass} h-28 resize-y py-2 leading-relaxed`} value={inv.description} onChange={(e) => inv.setDescription(e.target.value)} disabled={running} maxLength={4000} />
            </label>
            <label className="block">
              <span className="mb-1.5 flex items-center justify-between text-xs font-medium text-muted-foreground">
                Sample logs <span className="font-normal">{inv.logs.length}/20000</span>
              </span>
              <textarea
                className={`${inputClass} h-36 resize-y whitespace-pre bg-background py-2 font-mono text-[11px] leading-relaxed`}
                value={inv.logs}
                onChange={(e) => inv.setLogs(e.target.value)}
                disabled={running}
                spellCheck={false}
                maxLength={20000}
              />
            </label>
            <p className="flex gap-2 rounded-md border border-border bg-surface p-2.5 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 shrink-0" /> The scenario selects the incident record in the graph. The text above drives the diagnosis: edit the logs and the agent may reach a different (or inconclusive) result.
            </p>
          </div>
        </Panel>

        <Panel title="Diagnostic steps" bodyClassName="p-0">
          {running && <LoadingState label="Investigator Agent is calling graph tools…" />}
          {!running && !r && <EmptyState title="No investigation yet" hint="Press Run Investigation. Steps appear here exactly as the agent executed them; they depend on the evidence found." />}
          {!running && r && (
            <ol>
              {r.steps.map((s, i) => (
                <li key={s.id} className="relative flex gap-3 border-b border-border px-4 py-3.5 last:border-0">
                  {i < r.steps.length - 1 && <span className="absolute left-[27px] top-9 h-[calc(100%-20px)] w-px bg-success/40" />}
                  <span className="relative z-10 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-card">
                    {s.title.startsWith("Skipped") ? <Info className="h-5 w-5 text-muted-foreground" /> : <CheckCircle2 className="h-5 w-5 text-success" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-medium">{s.title}</p>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{s.tool ?? `step ${i + 1}`}{s.durationMs != null ? ` · ${s.durationMs} ms` : ""}</span>
                    </div>
                    {s.reason && <p className="mt-1 text-[11px] italic text-muted-foreground">Why: {s.reason}</p>}
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{s.detail}</p>
                    {s.diagnostics && (
                      <ul className="mt-2 space-y-1 rounded-md border border-border bg-background/60 px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
                        {s.diagnostics.map((d) => (
                          <li key={d} className="flex gap-2"><span className="text-primary">›</span>{d}</li>
                        ))}
                      </ul>
                    )}
                    {s.nodeIds && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {s.nodeIds.map((id) => {
                          const n = idx.get(id);
                          return n ? (
                            <Link key={id} to="/graph" search={{ focus: id }} className="inline-flex items-center gap-1.5 rounded border border-border bg-surface px-1.5 py-0.5 text-[11px] hover:border-primary/50">
                              <EntityDot type={n.type} /> {n.label}
                            </Link>
                          ) : (
                            <span key={id} className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[11px]">{id}</span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      {r && !running && <Report r={r} />}
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{icon}{title}</h3>
      <div className="text-sm leading-relaxed">{children}</div>
    </div>
  );
}

const catTone: Record<EvidenceCategory, Tone> = { "Observed fact": "primary", "Agent hypothesis": "violet", "Proposed action": "warning", "Tested result": "success" };
const verifTone = (v: VerificationResult["status"]): Tone => (v === "verified" ? "success" : v === "partially_verified" ? "warning" : v === "failed" ? "danger" : "neutral");

function Report({ r }: { r: InvestigationRun }) {
  const inv = useInvestigation();
  const idx = useNodeIndex();
  const [showTrace, setShowTrace] = useState(false);
  const v = r.verification;
  const passedTests = v?.tests.filter((t) => t.result === "passed").length ?? 0;
  const failedTests = v?.tests.filter((t) => t.result === "failed").length ?? 0;

  return (
    <section className="panel mt-4 overflow-hidden animate-in fade-in slide-in-from-bottom-2">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">Investigation report</h2>
            <span className="font-mono text-xs text-muted-foreground">{r.incidentId}</span>
            <Badge tone={outcomeTone[r.outcome]}>{outcomeLabel[r.outcome]}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Generated by the backend from the FalkorDB graph and synthetic fixtures · mode: {r.executionMode === "llm" ? `LLM (${r.llmModel})` : "deterministic rules"} · {r.finishedAt.replace("T", " ").replace("Z", " UTC")}
          </p>
        </div>
        <div className="flex gap-2">
          {r.proposedCorrection && (
            <Button variant="outline" size="sm" onClick={inv.reverify} disabled={inv.reverifying}>
              {inv.reverifying ? <Loader2 className="animate-spin" /> : <FlaskConical />} Re-run verification
            </Button>
          )}
          <Link to="/graph" search={{ inv: r.investigationId }} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Network /> View Evidence Path
          </Link>
        </div>
      </header>

      <div className="grid gap-px bg-border md:grid-cols-3">
        <div className="bg-card p-4">
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground"><Search className="h-3.5 w-3.5" /> Suspected root cause</p>
          <p className="mt-2 text-sm font-medium">{r.rootCause.summary}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone={r.rootCause.status === "hypothesis" ? "violet" : "neutral"}>{r.rootCause.status === "hypothesis" ? "Agent hypothesis" : "Inconclusive"} · {r.rootCause.supportLevel} support</Badge>
            {r.rootCause.authoredBy === "llm" && <Badge tone="violet">wording by LLM</Badge>}
          </div>
        </div>
        <div className="bg-card p-4">
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground"><Wrench className="h-3.5 w-3.5" /> Proposed correction</p>
          {r.proposedCorrection ? (
            <>
              <p className="mt-2 text-sm font-medium">{r.proposedCorrection.summary}</p>
              <div className="mt-2 flex gap-1.5"><Badge tone="warning">Proposed</Badge><Badge tone="warning">Requires approval</Badge></div>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No correction proposed: the evidence did not support one.</p>
          )}
        </div>
        <div className="bg-card p-4">
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground"><FlaskConical className="h-3.5 w-3.5" /> Verification</p>
          {v ? (
            <>
              <p className="mt-2 text-sm font-medium">{v.summary}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge tone={verifTone(v.status)}>{v.status.replace("_", " ")}</Badge>
                <Badge tone="success">{passedTests} test passed</Badge>
                {failedTests > 0 && <Badge tone="danger">{failedTests} failed</Badge>}
                <Badge>{v.passedAssertions}/{v.totalAssertions} assertions</Badge>
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">{r.proposedCorrection ? "Not run yet." : "Nothing to verify; no deterministic test applies."}</p>
          )}
        </div>
      </div>

      <div className="border-y border-border bg-surface px-5 py-3">
        <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">Failure path (computed from graph relationships)</p>
        {r.failurePath.nodeIds.length === 0 && <p className="text-xs text-muted-foreground">No confirmed failure path found.</p>}
        <ol className="flex flex-wrap items-center gap-1">
          {r.failurePath.nodeIds.map((id, i) => {
            const n = idx.get(id);
            return (
              <Fragment key={id}>
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                <li>
                  <Link to="/graph" search={{ focus: id }} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs hover:border-primary/50">
                    {n && <EntityDot type={n.type} />} {n?.label ?? id}
                  </Link>
                </li>
              </Fragment>
            );
          })}
        </ol>
      </div>

      <div className="grid gap-x-8 gap-y-6 p-5 lg:grid-cols-2">
        <div className="space-y-6">
          <Section title="Root cause analysis">
            <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
              {r.rootCause.basis.map((b) => <li key={b}>{b}</li>)}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">Qualitative assessment, not a statistical probability. Not yet confirmed by an engineer.</p>
          </Section>

          <Section title="Affected systems">
            {r.affectedNodes.length === 0 ? <p className="text-xs text-muted-foreground">No systems resolved.</p> : (
              <ul className="space-y-1">
                {r.affectedNodes.map((a) => (
                  <li key={a.nodeId} className="flex items-center justify-between gap-2 text-xs">
                    <Link to="/graph" search={{ focus: a.nodeId }} className="hover:text-primary">{a.label}</Link>
                    <Badge tone={impactTone[a.impact] ?? "neutral"}>{impactLabel[a.impact] ?? a.impact}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Supporting evidence">
            {r.evidence.length === 0 ? <p className="text-xs text-muted-foreground">No evidence records.</p> : (
              <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
                {r.evidence.map((e) => (
                  <li key={e.id} className="flex flex-col gap-1.5 bg-surface px-3 py-2.5 sm:flex-row sm:items-start sm:gap-3">
                    <span className="font-mono text-[11px] text-muted-foreground sm:w-12 sm:shrink-0 sm:pt-0.5">{e.id}</span>
                    <span className="flex-1 text-xs leading-relaxed">{e.claim}</span>
                    <span className="flex shrink-0 flex-wrap gap-1"><Badge tone={catTone[e.category]}>{e.category}</Badge><VerificationBadge v={e.state} /></span>
                  </li>
                ))}
              </ul>
            )}
            <Link to="/evidence" className="mt-2 inline-block text-xs text-primary hover:underline">Open evidence audit →</Link>
          </Section>

          <Section title="Related previous incidents">
            {r.relatedIncidents.length === 0 ? <p className="text-xs text-muted-foreground">No earlier incident shares entities with this investigation.</p> : (
              <div className="space-y-2">
                {r.relatedIncidents.map((ri) => (
                  <div key={ri.incidentId} className="rounded-md border border-border bg-surface p-3">
                    <p className="text-sm font-medium"><span className="font-mono text-xs text-muted-foreground">{ri.incidentId}</span> {ri.title}</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                      {ri.rankBasis.map((b) => <li key={b}>{b}</li>)}
                    </ul>
                    <p className="mt-1 text-[11px] text-muted-foreground">Ranking heuristic: {ri.rankScore} (explainable, not a probability)</p>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Memory recalled from the graph">
            {r.relevantMemory.length === 0 ? <p className="text-xs text-muted-foreground">No stored memory touches these entities.</p> : (
              <ul className="space-y-1.5">
                {r.relevantMemory.map((m) => (
                  <li key={m.id} className="rounded-md border border-border bg-surface px-3 py-2 text-xs">
                    <span className="font-mono text-muted-foreground">{m.id}</span> {m.title}
                    <span className="ml-2 inline-flex gap-1"><Badge tone={m.validity === "Needs review" ? "warning" : m.validity === "Verified" ? "success" : "neutral"}>{m.validity}</Badge>
                      {m.recalledFromPriorSession && <Badge tone="violet">recalled from an earlier session</Badge>}</span>
                    {m.driftReason && <p className="mt-1 text-warning">{m.driftReason}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Context Drift Guard" icon={<ShieldAlert className="h-3.5 w-3.5" />}>
            {r.driftFindings.length === 0 ? <p className="text-xs text-muted-foreground">No historical fix was loaded, so there was nothing to check.</p> : (
              r.driftFindings.map((d) => (
                <div key={d.historicalIncidentId} className="rounded-md border border-border bg-surface p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{d.historicalIncidentId} fix {d.historicalFixId}</p>
                    <Badge tone={verdictTone[d.verdict]}>{d.verdict.replace(/_/g, " ")}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{d.summary}</p>
                  <ul className="mt-2 space-y-1">
                    {d.checks.map((c) => (
                      <li key={c.name} className="flex gap-2 text-xs">
                        {c.result === "pass" ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" /> : c.result === "fail" ? <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" /> : <AlertTriangle className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", c.result === "warn" ? "text-warning" : "text-muted-foreground")} />}
                        <span><span className="font-medium">{c.name}:</span> <span className="text-muted-foreground">{c.detail}</span></span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </Section>

          {r.proposedCorrection && (
            <Section title="Recommended correction">
              <div className="overflow-hidden rounded-md border border-border">
                <div className="flex items-center justify-between border-b border-border bg-surface px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
                  {r.proposedCorrection.file} <Badge tone="warning">Proposed</Badge>
                </div>
                <pre className="overflow-x-auto bg-background py-2 font-mono text-xs leading-relaxed">
                  {r.proposedCorrection.diff.map((l, i) => (
                    <div key={i} className={cn("px-3", l.kind === "remove" && "bg-destructive/10 text-destructive", l.kind === "add" && "bg-success/10 text-success", l.kind === "context" && "text-muted-foreground")}>
                      {l.kind === "remove" ? "- " : l.kind === "add" ? "+ " : "  "}{l.text}
                    </div>
                  ))}
                </pre>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">{r.proposedCorrection.note}{r.proposedCorrection.approver ? ` Approver: ${r.proposedCorrection.approver["name"] ?? ""}.` : ""}</p>
            </Section>
          )}

          <Section title="Verification result">
            {!v ? <p className="text-xs text-muted-foreground">No verification has run.</p> : (
              <div className="space-y-2">
                {v.tests.map((t) => (
                  <details key={t.testId} className={cn("rounded-md border p-3", t.result === "passed" ? "border-success/30 bg-success/5" : t.result === "failed" ? "border-destructive/30 bg-destructive/5" : "border-border bg-surface")}>
                    <summary className="flex cursor-pointer items-start gap-3">
                      {t.result === "passed" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
                      <span className="flex-1">
                        <span className="block text-sm font-medium">{t.name}</span>
                        <span className="block text-xs text-muted-foreground">{t.passed}/{t.total} assertions passed · <span className="font-mono">{t.key}</span></span>
                      </span>
                      <VerificationBadge v={t.result === "passed" ? "Test passed" : "Test failed"} />
                    </summary>
                    <ul className="mt-2 space-y-1 border-t border-border pt-2 font-mono text-[11px]">
                      {t.assertions.map((a, i) => (
                        <li key={i} className={a.passed ? "text-muted-foreground" : "text-destructive"}>{a.passed ? "✓" : "✗"} {a.name}{a.passed ? "" : ` (${a.detail})`}</li>
                      ))}
                    </ul>
                  </details>
                ))}
                <p className="text-[11px] text-muted-foreground">Executed by {v.executedBy} against synthetic fixtures. Read back from FalkorDB: {Object.entries(v.readBack).filter(([, x]) => x != null && x !== "").map(([k, x]) => `${k}=${Array.isArray(x) ? x.join("|") : String(x)}`).join(", ")}.</p>
              </div>
            )}
          </Section>

          <Section title="Remaining uncertainty">
            <ul className="space-y-1.5 text-muted-foreground">
              {r.remainingUncertainty.map((u) => (
                <li key={u} className="flex gap-2 text-sm"><AlertTriangle className="mt-1 h-3.5 w-3.5 shrink-0 text-warning" />{u}</li>
              ))}
            </ul>
          </Section>
          <Section title="Recommended next action">
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">{r.recommendedNextAction}</div>
          </Section>
        </div>
      </div>

      <div className="border-t border-border px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Graph queries used</p>
          {r.graphQueriesUsed.map((q) => <span key={q.name} title={q.purpose}><Badge>{q.name} · {q.rowCount} rows</Badge></span>)}
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setShowTrace((s) => !s)}>{showTrace ? "Hide" : "Show"} Cypher trace</Button>
        </div>
        {showTrace && <TracePanel id={r.investigationId} />}
      </div>
    </section>
  );
}

function TracePanel({ id }: { id: string }) {
  const q = useTrace(id, true);
  if (q.isPending) return <LoadingState label="Loading trace…" className="py-4" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} className="mt-3" />;
  return (
    <ol className="mt-3 max-h-[420px] space-y-3 overflow-y-auto text-xs">
      {q.data.steps.map((s) => (
        <li key={s.index} className="rounded-md border border-border bg-surface p-3">
          <p className="font-medium"><Badge className="mr-1.5">{s.agent}</Badge>{s.tool} <span className="font-mono text-[10px] text-muted-foreground">{s.durationMs} ms</span></p>
          <p className="mt-1 text-muted-foreground">{s.reason}</p>
          {s.queries.map((qq, i) => (
            <pre key={i} className="mt-2 overflow-x-auto rounded bg-background p-2 font-mono text-[10px] leading-relaxed">{qq.cypher}{"\n"}-- params: {JSON.stringify(qq.params)} · {qq.rowCount} rows · {qq.durationMs} ms</pre>
          ))}
        </li>
      ))}
    </ol>
  );
}
