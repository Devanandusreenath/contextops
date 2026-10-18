import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Loader2, TestTubes } from "lucide-react";
import { useState } from "react";
import { DataTable } from "@/components/data-table";
import { JsonViewer } from "@/components/json-viewer";
import { EmptyState, ErrorState, KeyValue, LoadingRows, MetricCard, PageHeader, Panel } from "@/components/page-parts";
import { PassRate, StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtCost, fmtDateTime, fmtDuration, fmtTokens } from "@/lib/format";
import { evaluatorSummary } from "@/mock-data";
import { queries } from "@/services";
import type { EvaluationCase } from "@/types";
import { cn } from "@/lib/utils";

export function EvaluationDetailPage({ runId }: { runId: string }) {
  const runQ = useQuery({ ...queries.run(runId), refetchInterval: (q) => (q.state.data?.status === "running" ? 1000 : false) });
  const run = runQ.data;
  const casesQ = useQuery({ ...queries.runCases(runId), enabled: run?.status === "completed" });
  const prevQ = useQuery({ ...queries.run(run?.previousRunId ?? ""), enabled: !!run?.previousRunId });
  const prevCasesQ = useQuery({ ...queries.runCases(run?.previousRunId ?? ""), enabled: !!run?.previousRunId && prevQ.data?.status === "completed" });
  const [selected, setSelected] = useState<EvaluationCase | null>(null);
  const [onlyFailed, setOnlyFailed] = useState(false);

  if (runQ.isError) return <ErrorState error={runQ.error} onRetry={() => runQ.refetch()} />;
  if (!run) return <LoadingRows rows={8} />;

  const cases = casesQ.data ?? [];
  const failed = cases.filter((c) => !c.passed).sort((a, b) => (a.failureKind === "schema_missing_field" ? -1 : b.failureKind === "schema_missing_field" ? 1 : 0));
  const prev = prevQ.data;
  const prevCases = prevCasesQ.data ?? [];

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Evaluations", to: "/evaluations" }, { label: run.id }]}
        title={<span className="font-mono">{run.id}</span>}
        badge={<StatusBadge status={run.status} />}
        description={<>Created {fmtDateTime(run.createdAt)} · Dataset <span className="font-mono">{run.datasetName} {run.datasetVersion}</span> · {run.model} ({run.provider}) · {run.appVersion}</>}
      />

      {run.status === "running" && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-info/30 bg-info/5 px-4 py-3 text-sm" role="status">
          <Loader2 className="size-4 animate-spin text-info" /> Running {run.total} cases…
        </div>
      )}
      {run.status === "failed" && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm" role="alert">
          Run aborted: dataset schema validation failed before execution (2 invalid cases). <Link to="/datasets/$datasetId" params={{ datasetId: run.datasetId }} className="font-medium text-primary hover:underline">Review dataset</Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <MetricCard label="Pass rate" value={run.status === "completed" ? `${((run.passed / run.total) * 100).toFixed(1)}%` : "—"} hint={prev?.status === "completed" && run.status === "completed" ? delta(run.passed / run.total, prev.passed / prev.total, prev.id) : undefined} />
        <MetricCard label="Passed" value={run.status === "completed" ? run.passed : "—"} tone="success" />
        <MetricCard label="Failed" value={run.status === "completed" ? run.failed : "—"} tone={run.failed ? "danger" : undefined} />
        <MetricCard label="Duration" value={run.status === "running" ? "…" : fmtDuration(run.durationMs)} hint={`avg ${fmtDuration(run.avgLatencyMs)} / case`} />
        <MetricCard label="Tokens" value={fmtTokens(run.totalTokens)} hint={run.totalTokens === undefined ? "Not reported" : undefined} />
        <MetricCard label="Est. cost" value={fmtCost(run.costUsd)} hint={run.costUsd === undefined ? "Pricing unknown" : undefined} />
      </div>

      {run.status === "completed" && (
        <Tabs defaultValue="cases" className="mt-6">
          <TabsList>
            <TabsTrigger value="cases">Cases ({cases.length})</TabsTrigger>
            <TabsTrigger value="failures">Failures ({failed.length})</TabsTrigger>
            <TabsTrigger value="evaluators">Evaluators</TabsTrigger>
            <TabsTrigger value="compare" disabled={!prev}>Compare</TabsTrigger>
          </TabsList>

          <TabsContent value="cases">
            <Panel bodyClassName="p-0" title="Case-by-case results" actions={<Button size="sm" variant="ghost" className="text-xs" onClick={() => setOnlyFailed(!onlyFailed)}>{onlyFailed ? "Show all" : "Only failed"}</Button>}>
              {casesQ.isLoading ? <LoadingRows /> : (
                <DataTable
                  rows={onlyFailed ? failed : cases}
                  rowKey={(c) => c.id}
                  rowLabel={(c) => `Open case ${c.caseId}`}
                  onRowClick={setSelected}
                  columns={[
                    { key: "case", header: "Case", cell: (c) => <span className="font-mono text-xs">{c.caseId}</span>, sortValue: (c) => c.caseId },
                    { key: "input", header: "Input", cell: (c) => <span className="line-clamp-1 max-w-sm text-xs">{String((c.input as Record<string, unknown>).message ?? (c.input as Record<string, unknown>).question ?? JSON.stringify(c.input))}</span> },
                    { key: "res", header: "Result", cell: (c) => <StatusBadge status={c.passed ? "pass" : "fail"} />, sortValue: (c) => (c.passed ? 1 : 0) },
                    { key: "reason", header: "Failure", cell: (c) => <span className="line-clamp-1 max-w-xs text-xs text-destructive">{c.failureReason}</span> },
                    { key: "lat", header: "Latency", cell: (c) => <span className="text-xs tabular-nums">{fmtDuration(c.latencyMs)}</span>, sortValue: (c) => c.latencyMs },
                    { key: "trace", header: "Trace", cell: (c) => c.traceId ? <Link to="/traces/$traceId" params={{ traceId: c.traceId }} onClick={(e) => e.stopPropagation()} className="font-mono text-xs text-primary hover:underline">{c.traceId}</Link> : <span className="text-xs text-muted-foreground">—</span> },
                  ]}
                />
              )}
            </Panel>
          </TabsContent>

          <TabsContent value="failures" className="space-y-4">
            {!failed.length && <Panel><EmptyState title="No failures" description="Every case passed all evaluators." /></Panel>}
            {failed.map((c) => <FailureCard key={c.id} c={c} />)}
          </TabsContent>

          <TabsContent value="evaluators">
            <Panel bodyClassName="p-0">
              <DataTable
                rows={evaluatorSummary(run, cases)}
                rowKey={(e) => e.name}
                columns={[
                  { key: "n", header: "Evaluator", cell: (e) => <span className="font-medium">{e.name}</span> },
                  { key: "d", header: "Checks", cell: (e) => <span className="text-xs text-muted-foreground">{e.description}</span> },
                  { key: "p", header: "Pass rate", cell: (e) => <PassRate passed={e.passed} total={e.passed + e.failed} /> },
                  { key: "f", header: "Failed", cell: (e) => <span className={cn("tabular-nums", e.failed && "text-destructive")}>{e.failed}</span> },
                ]}
              />
            </Panel>
          </TabsContent>

          <TabsContent value="compare">
            {prev && <Comparison current={cases} previous={prevCases} prevId={prev.id} prevStatus={prev.status} />}
          </TabsContent>
        </Tabs>
      )}

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="font-mono">{selected.caseId}</SheetTitle>
                <SheetDescription>{selected.passed ? "Passed all evaluators" : selected.failureReason}</SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-6">
                <JsonViewer title="Input" data={selected.input} />
                <div className="grid gap-3 md:grid-cols-2">
                  <JsonViewer title="Expected" data={selected.expected} />
                  <JsonViewer title="Actual" data={selected.actual} />
                </div>
                <CaseActions c={selected} />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function delta(cur: number, prev: number, prevId: string) {
  const d = (cur - prev) * 100;
  return <span className={d >= 0 ? "text-success" : "text-destructive"}>{d >= 0 ? "+" : ""}{d.toFixed(1)} pts vs {prevId}</span>;
}

function CaseActions({ c }: { c: EvaluationCase }) {
  return (
    <div className="flex flex-wrap gap-2">
      {c.traceId && (
        <Button asChild variant="outline" size="sm">
          <Link to="/traces/$traceId" params={{ traceId: c.traceId }} search={{ step: c.failedStepId }}>Open trace{c.failedStepId ? " at failing step" : ""} <ArrowRight /></Link>
        </Button>
      )}
      {!c.passed && (
        <Button asChild size="sm">
          <Link to="/regressions" search={{ fromRun: c.runId, caseId: c.caseId }}><TestTubes /> Create regression test</Link>
        </Button>
      )}
    </div>
  );
}

function FailureCard({ c }: { c: EvaluationCase }) {
  return (
    <Panel title={<span className="flex items-center gap-2"><span className="font-mono">{c.caseId}</span><StatusBadge status="fail" /><span className="font-normal text-muted-foreground">{c.failedEvaluator}</span></span>}>
      <p className="mb-3 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 font-mono text-xs text-destructive">{c.failureReason}</p>
      <div className="grid gap-3 md:grid-cols-2">
        <JsonViewer title="Expected" data={c.expected} />
        <JsonViewer title="Actual" data={c.actual} />
      </div>
      <div className="mt-3"><CaseActions c={c} /></div>
    </Panel>
  );
}

function Comparison({ current, previous, prevId, prevStatus }: { current: EvaluationCase[]; previous: EvaluationCase[]; prevId: string; prevStatus: string }) {
  if (prevStatus !== "completed" || !previous.length) return <Panel><EmptyState title="Nothing to compare" description={`${prevId} has no case results.`} /></Panel>;
  const prevMap = new Map(previous.map((c) => [c.caseId, c]));
  const rows = current.map((c) => ({ c, p: prevMap.get(c.caseId) }));
  const changed = rows.filter((r) => !r.p || r.p.passed !== r.c.passed);
  const fixed = changed.filter((r) => r.c.passed).length;
  const regressed = changed.filter((r) => !r.c.passed && r.p?.passed).length;
  return (
    <Panel bodyClassName="p-0" title={<>Compared with <Link to="/evaluations/$runId" params={{ runId: prevId }} className="font-mono text-primary hover:underline">{prevId}</Link></>}>
      <div className="flex gap-6 border-b px-4 py-3 text-sm">
        <span><span className="font-semibold text-success">{fixed}</span> fixed</span>
        <span><span className="font-semibold text-destructive">{regressed}</span> regressed</span>
        <span><span className="font-semibold">{rows.length - changed.length}</span> unchanged</span>
      </div>
      <DataTable
        rows={rows}
        rowKey={(r) => r.c.caseId}
        empty={<EmptyState title="No overlapping cases" />}
        columns={[
          { key: "case", header: "Case", cell: (r) => <span className="font-mono text-xs">{r.c.caseId}</span> },
          { key: "prev", header: prevId, cell: (r) => (r.p ? <StatusBadge status={r.p.passed ? "pass" : "fail"} /> : <span className="text-xs text-muted-foreground">new case</span>) },
          { key: "cur", header: "This run", cell: (r) => <StatusBadge status={r.c.passed ? "pass" : "fail"} /> },
          { key: "chg", header: "Change", cell: (r) => !r.p ? "—" : r.p.passed === r.c.passed ? <span className="text-xs text-muted-foreground">unchanged</span> : r.c.passed ? <span className="text-xs font-medium text-success">fixed</span> : <span className="text-xs font-medium text-destructive">regressed</span>, sortValue: (r) => (r.p && r.p.passed !== r.c.passed ? 0 : 1) },
        ]}
      />
    </Panel>
  );
}
