import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { TestTubes } from "lucide-react";
import { CopyButton, JsonViewer } from "@/components/json-viewer";
import { ErrorState, KeyValue, LoadingRows, PageHeader, Panel } from "@/components/page-parts";
import { StatusBadge } from "@/components/status-badge";
import { STEP_META, TraceTimeline } from "@/components/trace-timeline";
import { Button } from "@/components/ui/button";
import { fmtCost, fmtDateTime, fmtDuration, fmtTokens } from "@/lib/format";
import { queries } from "@/services";

export function TraceDetailPage({ traceId, stepId }: { traceId: string; stepId?: string }) {
  const q = useQuery(queries.trace(traceId));
  const navigate = useNavigate();
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const t = q.data;
  if (!t) return <LoadingRows rows={10} />;

  const firstError = t.steps.find((s) => s.error);
  const selectedId = stepId ?? firstError?.id ?? t.steps[0].id;
  const step = t.steps.find((s) => s.id === selectedId) ?? t.steps[0];
  const parent = t.steps.find((s) => s.id === step.parentId);
  const children = t.steps.filter((s) => s.parentId === step.id);
  const meta = STEP_META[step.type];

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Traces", to: "/traces" }, { label: t.id }]}
        title={<span className="font-mono">{t.id}</span>}
        badge={<StatusBadge status={t.status} />}
        description={<span className="font-mono text-xs">{t.operation}</span>}
        actions={
          <>
            <CopyButton value={t.id} label="Copy trace ID" />
            {t.errorSummary && <CopyButton value={t.errorSummary} label="Copy error" />}
            {t.status === "error" && (
              <Button asChild size="sm">
                <Link to="/regressions" search={{ fromTrace: t.id, step: firstError?.id }}><TestTubes /> Create regression test</Link>
              </Button>
            )}
          </>
        }
      />

      {t.errorSummary && (
        <div role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <span className="font-medium text-destructive">{firstError?.error?.type}</span> in <button type="button" className="font-mono text-primary hover:underline" onClick={() => navigate({ to: ".", search: { step: firstError?.id } })}>{firstError?.name}</button>: {t.errorSummary}
        </div>
      )}

      <Panel className="mb-4">
        <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
          <KeyValue items={[["Started", fmtDateTime(t.timestamp)], ["Duration", fmtDuration(t.durationMs)]]} />
          <KeyValue items={[["Model", t.model], ["Steps", t.steps.length]]} />
          <KeyValue items={[["Tokens", fmtTokens(t.totalTokens)], ["Est. cost", fmtCost(t.costUsd)]]} />
          <KeyValue
            items={[
              ["Run", t.runId ? <Link to="/evaluations/$runId" params={{ runId: t.runId }} className="font-mono text-primary hover:underline">{t.runId}</Link> : "—"],
              ["Case", <span className="font-mono">{t.caseId ?? "—"}</span>],
            ]}
          />
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <Panel title="Execution timeline" bodyClassName="p-0" className="self-start">
          <TraceTimeline steps={t.steps} totalMs={t.durationMs} selectedId={step.id} onSelect={(id) => navigate({ to: ".", search: { step: id }, replace: true })} />
          <div className="border-t p-3">
            <JsonViewer title="Trace metadata" data={t.metadata} />
          </div>
        </Panel>

        <Panel
          title={<span className="flex items-center gap-2"><meta.icon className={`size-4 ${meta.text}`} /><span className="font-mono">{step.name}</span><StatusBadge status={step.status} /></span>}
          actions={<span className="text-xs text-muted-foreground">{meta.label}</span>}
        >
          <div className="space-y-4">
            <KeyValue
              items={[
                ["Step ID", <span className="font-mono">{step.id}</span>],
                ["Start", `+${fmtDuration(step.startOffsetMs)}`],
                ["Duration", fmtDuration(step.durationMs)],
                ["Parent", parent ? <button type="button" className="font-mono text-primary hover:underline" onClick={() => navigate({ to: ".", search: { step: parent.id } })}>{parent.name}</button> : "— (root)"],
                ["Children", children.length ? children.map((c) => c.name).join(", ") : "—"],
                ...(step.model ? [["Model", step.model] as [string, string]] : []),
                ...(step.tokens ? [["Tokens", `${step.tokens.prompt} prompt · ${step.tokens.completion} completion`] as [string, string]] : []),
                ...(step.tokens ? [["Est. cost", fmtCost(step.costUsd)] as [string, string]] : []),
              ]}
            />
            {step.error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5">
                <div className="flex items-center justify-between border-b border-destructive/20 px-3 py-1.5">
                  <span className="text-xs font-semibold text-destructive">{step.error.type}</span>
                  <CopyButton value={`${step.error.message}\n\n${step.error.stack ?? ""}`} label="Copy error" />
                </div>
                <p className="px-3 pt-2 text-sm">{step.error.message}</p>
                {step.error.stack && <pre className="overflow-x-auto p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">{step.error.stack}</pre>}
              </div>
            )}
            <JsonViewer title="Input" data={step.input} />
            <JsonViewer title="Output" data={step.output} />
          </div>
        </Panel>
      </div>
    </>
  );
}
