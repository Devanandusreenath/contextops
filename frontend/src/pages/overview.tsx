import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Activity, AlertTriangle, Clock, Coins, FlaskConical, Hash } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DataTable } from "@/components/data-table";
import { NewEvaluationDialog } from "@/components/new-evaluation-dialog";
import { ErrorState, LoadingRows, MetricCard, PageHeader, Panel } from "@/components/page-parts";
import { PassRate, StatusBadge } from "@/components/status-badge";
import { fmtCost, fmtDate, fmtDateTime, fmtDuration, fmtTokens } from "@/lib/format";
import { queries } from "@/services";

export function OverviewPage() {
  const runsQ = useQuery({ ...queries.runs(), refetchInterval: (q) => (q.state.data?.some((r) => r.status === "running") ? 1500 : false) });
  const tracesQ = useQuery(queries.traces());
  const dsQ = useQuery(queries.datasets());
  const navigate = useNavigate();

  const runs = runsQ.data ?? [];
  const completed = runs.filter((r) => r.status === "completed");
  const latest = completed[0];
  const withTokens = completed.filter((r) => r.totalTokens !== undefined);
  const priced = completed.filter((r) => r.costUsd !== undefined);
  const trend = [...completed].reverse().filter((r) => r.datasetId === "ds_support_tickets").map((r) => ({ id: r.id, date: fmtDate(r.createdAt).replace(/, \d{4}/, ""), passRate: +((r.passed / r.total) * 100).toFixed(1) }));
  const failedTraces = (tracesQ.data ?? []).filter((t) => t.status === "error").slice(0, 5);
  const ds = dsQ.data?.find((d) => d.id === latest?.datasetId);

  return (
    <>
      <PageHeader
        title="Overview"
       
        description="Evaluation health across your workspace. "
        actions={<NewEvaluationDialog />}
      />

      {runsQ.isError ? (
        <ErrorState error={runsQ.error} onRetry={() => runsQ.refetch()} />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <MetricCard label="Evaluation runs" icon={Hash} value={runsQ.isLoading ? "…" : runs.length} hint="All time" />
          <MetricCard label="Latest pass rate" icon={FlaskConical} value={latest ? `${((latest.passed / latest.total) * 100).toFixed(1)}%` : "…"} hint={latest && <span className="font-mono">{latest.id}</span>} tone={latest && latest.passed / latest.total >= 0.9 ? "success" : undefined} />
          <MetricCard label="Failed tests (latest)" icon={AlertTriangle} value={latest?.failed ?? "…"} hint={latest && `of ${latest.total} cases`} tone={latest?.failed ? "danger" : undefined} />
          <MetricCard label="Avg latency" icon={Clock} value={latest ? fmtDuration(latest.avgLatencyMs) : "…"} hint="Per case, latest run" />
          <MetricCard label="Token usage" icon={Activity} value={fmtTokens(withTokens.reduce((a, r) => a + r.totalTokens!, 0))} hint={`${withTokens.length} of ${completed.length} runs report usage`} />
          <MetricCard label="Est. model cost" icon={Coins} value={fmtCost(priced.reduce((a, r) => a + r.costUsd!, 0))} hint="Excludes self-hosted runs" />
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel title="Pass-rate trend · support-tickets" className="lg:col-span-2">
          <div className="h-56" role="img" aria-label="Line chart of pass rate per evaluation run">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ left: -16, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                <YAxis domain={[60, 100]} ticks={[60, 70, 80, 90, 100]} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} unit="%" />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }} formatter={(v) => [`${v}%`, "Pass rate"]} labelFormatter={(_, p) => p?.[0]?.payload.id} />
                <Line type="monotone" dataKey="passRate" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Latest run">
          {latest && ds ? (
            <dl className="space-y-3 text-sm">
              <div><dt className="text-xs text-muted-foreground">Dataset</dt><dd className="font-mono">{ds.name} <span className="text-muted-foreground">{latest.datasetVersion}</span></dd></div>
              <div><dt className="text-xs text-muted-foreground">Current dataset version</dt><dd>{ds.currentVersion} · {ds.versions.at(-1)?.caseIds.length} cases · updated {fmtDate(ds.updatedAt)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Model</dt><dd>{latest.model} <span className="text-muted-foreground">({latest.provider})</span></dd></div>
              <div><dt className="text-xs text-muted-foreground">Ran</dt><dd>{fmtDateTime(latest.createdAt)}</dd></div>
              <Link to="/evaluations/$runId" params={{ runId: latest.id }} className="inline-block text-sm font-medium text-primary hover:underline">Inspect {latest.id} →</Link>
            </dl>
          ) : (
            <LoadingRows rows={4} />
          )}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel title="Recent evaluation runs" bodyClassName="p-0" actions={<Link to="/evaluations" className="text-xs text-primary hover:underline">View all</Link>}>
          {runsQ.isLoading ? <LoadingRows /> : (
            <DataTable
              rows={runs.slice(0, 6)}
              rowKey={(r) => r.id}
              rowLabel={(r) => `Open run ${r.id}`}
              onRowClick={(r) => navigate({ to: "/evaluations/$runId", params: { runId: r.id } })}
              columns={[
                { key: "id", header: "Run", cell: (r) => <span className="font-mono text-xs">{r.id}</span> },
                { key: "ds", header: "Dataset", cell: (r) => <span className="font-mono text-xs">{r.datasetName} {r.datasetVersion}</span> },
                { key: "pr", header: "Pass rate", cell: (r) => <PassRate passed={r.passed} total={r.status === "completed" ? r.total : 0} /> },
                { key: "st", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
              ]}
            />
          )}
        </Panel>
        <Panel title="Recent failed traces" bodyClassName="p-0" actions={<Link to="/traces" className="text-xs text-primary hover:underline">View all</Link>}>
          {tracesQ.isLoading ? <LoadingRows /> : (
            <DataTable
              rows={failedTraces}
              rowKey={(t) => t.id}
              rowLabel={(t) => `Open trace ${t.id}`}
              onRowClick={(t) => navigate({ to: "/traces/$traceId", params: { traceId: t.id } })}
              columns={[
                { key: "id", header: "Trace", cell: (t) => <span className="font-mono text-xs">{t.id}</span> },
                { key: "err", header: "Error", cell: (t) => <span className="line-clamp-1 max-w-xs text-xs text-destructive">{t.errorSummary}</span> },
                { key: "ts", header: "Time", cell: (t) => <span className="text-xs whitespace-nowrap text-muted-foreground">{fmtDateTime(t.timestamp)}</span> },
              ]}
            />
          )}
        </Panel>
      </div>
    </>
  );
}
