import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { DataTable } from "@/components/data-table";
import { DATE_OPTIONS, FilterBar, FilterSelect, uniq, withinDays } from "@/components/filter-bar";
import { NewEvaluationDialog } from "@/components/new-evaluation-dialog";
import { ErrorState, LoadingRows, PageHeader, Panel } from "@/components/page-parts";
import { PassRate, StatusBadge } from "@/components/status-badge";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtDateTime, fmtDuration } from "@/lib/format";
import { queries } from "@/services";

export function EvaluationsPage() {
  const q = useQuery({ ...queries.runs(), refetchInterval: (s) => (s.state.data?.some((r) => r.status === "running") ? 1500 : false) });
  const navigate = useNavigate();
  const [status, setStatus] = useState("all");
  const [dataset, setDataset] = useState("all");
  const [model, setModel] = useState("all");
  const [date, setDate] = useState("all");
  const runs = q.data ?? [];
  const newest = runs[0]?.createdAt;
  const rows = runs.filter(
    (r) => (status === "all" || r.status === status) && (dataset === "all" || r.datasetName === dataset) && (model === "all" || r.model === model) && withinDays(r.createdAt, newest, date),
  );

  return (
    <>
      <PageHeader
        title="Evaluations"
       
        description="Runs of your application against versioned datasets."
        actions={<NewEvaluationDialog trigger={<Button><Play /> New Evaluation</Button>} />}
      />
      <Panel bodyClassName="p-0">
        <FilterBar count={rows.length} active={[status, dataset, model, date].some((v) => v !== "all")} onClear={() => { setStatus("all"); setDataset("all"); setModel("all"); setDate("all"); }}>
          <FilterSelect label="Statuses" value={status} onChange={setStatus} options={[{ value: "completed", label: "Completed" }, { value: "running", label: "Running" }, { value: "failed", label: "Failed" }]} />
          <FilterSelect label="Datasets" value={dataset} onChange={setDataset} options={uniq(runs.map((r) => r.datasetName))} />
          <FilterSelect label="Models" value={model} onChange={setModel} options={uniq(runs.map((r) => r.model))} />
          <FilterSelect label="Dates" value={date} onChange={setDate} options={DATE_OPTIONS} />
        </FilterBar>
        {q.isLoading ? <LoadingRows /> : q.isError ? <div className="p-4"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div> : (
          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            rowLabel={(r) => `Open run ${r.id}`}
            onRowClick={(r) => navigate({ to: "/evaluations/$runId", params: { runId: r.id } })}
            defaultSort={{ key: "created", dir: "desc" }}
            columns={[
              { key: "id", header: "Run ID", cell: (r) => <span className="font-mono text-xs">{r.id}</span>, sortValue: (r) => r.id },
              { key: "ds", header: "Dataset", cell: (r) => <span className="font-mono text-xs">{r.datasetName} <span className="text-muted-foreground">{r.datasetVersion}</span></span>, sortValue: (r) => r.datasetName },
              { key: "model", header: "Model", cell: (r) => <span className="text-xs">{r.model}<span className="block text-muted-foreground">{r.provider}</span></span>, sortValue: (r) => r.model },
              { key: "app", header: "App version", cell: (r) => <span className="font-mono text-xs">{r.appVersion}</span> },
              { key: "pr", header: "Pass rate", cell: (r) => <PassRate passed={r.passed} total={r.status === "completed" ? r.total : 0} />, sortValue: (r) => (r.total ? r.passed / r.total : 0) },
              { key: "pf", header: "Passed / Failed", cell: (r) => r.status === "completed" ? <span className="tabular-nums text-xs"><span className="text-success">{r.passed}</span> / <span className={r.failed ? "text-destructive" : ""}>{r.failed}</span></span> : <span className="text-muted-foreground">—</span> },
              { key: "dur", header: "Duration", cell: (r) => <span className="tabular-nums text-xs">{r.status === "running" ? "…" : fmtDuration(r.durationMs)}</span>, sortValue: (r) => r.durationMs },
              { key: "created", header: "Created", cell: (r) => <span className="text-xs whitespace-nowrap text-muted-foreground">{fmtDateTime(r.createdAt)}</span>, sortValue: (r) => r.createdAt },
              { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} />, sortValue: (r) => r.status },
            ]}
          />
        )}
      </Panel>
    </>
  );
}
