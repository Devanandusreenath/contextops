import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { DataTable } from "@/components/data-table";
import { DATE_OPTIONS, FilterBar, FilterSelect, SearchInput, uniq, withinDays } from "@/components/filter-bar";
import { ErrorState, LoadingRows, PageHeader, Panel } from "@/components/page-parts";
import { StatusBadge } from "@/components/status-badge";
import { fmtCost, fmtDateTime, fmtDuration, fmtTokens } from "@/lib/format";
import { queries } from "@/services";

const DURATION_OPTIONS = [
  { value: "fast", label: "< 1.5 s" },
  { value: "mid", label: "1.5 – 3 s" },
  { value: "slow", label: "> 3 s" },
];

export function TracesPage() {
  const q = useQuery(queries.traces());
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [op, setOp] = useState("all");
  const [model, setModel] = useState("all");
  const [dur, setDur] = useState("all");
  const [date, setDate] = useState("all");
  const traces = q.data ?? [];
  const newest = traces[0]?.timestamp;
  const rows = traces.filter((t) => {
    const d = t.durationMs;
    return (
      (!search || t.id.includes(search) || (t.errorSummary ?? "").toLowerCase().includes(search.toLowerCase())) &&
      (status === "all" || t.status === status) &&
      (op === "all" || t.operation === op) &&
      (model === "all" || t.model === model) &&
      (dur === "all" || (dur === "fast" ? d < 1500 : dur === "mid" ? d >= 1500 && d <= 3000 : d > 3000)) &&
      withinDays(t.timestamp, newest, date)
    );
  });
  const active = !!search || [status, op, model, dur, date].some((v) => v !== "all");

  return (
    <>
      <PageHeader title="Traces" description="Execution traces from evaluation runs. Sensitive fields are redacted." />
      <Panel bodyClassName="p-0">
        <FilterBar count={rows.length} active={active} onClear={() => { setSearch(""); setStatus("all"); setOp("all"); setModel("all"); setDur("all"); setDate("all"); }}>
          <SearchInput value={search} onChange={setSearch} placeholder="Search trace ID or error" />
          <FilterSelect label="Outcomes" value={status} onChange={setStatus} options={[{ value: "success", label: "Success" }, { value: "error", label: "Error" }]} />
          <FilterSelect label="Operations" value={op} onChange={setOp} options={uniq(traces.map((t) => t.operation))} />
          <FilterSelect label="Models" value={model} onChange={setModel} options={uniq(traces.map((t) => t.model))} />
          <FilterSelect label="Durations" value={dur} onChange={setDur} options={DURATION_OPTIONS} />
          <FilterSelect label="Dates" value={date} onChange={setDate} options={DATE_OPTIONS} />
        </FilterBar>
        {q.isLoading ? <LoadingRows /> : q.isError ? <div className="p-4"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div> : (
          <DataTable
            rows={rows}
            rowKey={(t) => t.id}
            rowLabel={(t) => `Open trace ${t.id}`}
            onRowClick={(t) => navigate({ to: "/traces/$traceId", params: { traceId: t.id } })}
            defaultSort={{ key: "ts", dir: "desc" }}
            columns={[
              { key: "id", header: "Trace ID", cell: (t) => <span className="font-mono text-xs">{t.id}</span>, sortValue: (t) => t.id },
              { key: "op", header: "Operation", cell: (t) => <span className="font-mono text-xs">{t.operation}</span>, sortValue: (t) => t.operation },
              { key: "st", header: "Status", cell: (t) => <StatusBadge status={t.status} />, sortValue: (t) => t.status },
              { key: "dur", header: "Duration", cell: (t) => <span className="text-xs tabular-nums">{fmtDuration(t.durationMs)}</span>, sortValue: (t) => t.durationMs },
              { key: "model", header: "Model", cell: (t) => <span className="text-xs">{t.model}</span>, sortValue: (t) => t.model },
              { key: "tok", header: "Tokens", cell: (t) => <span className="text-xs tabular-nums">{fmtTokens(t.totalTokens)}</span>, sortValue: (t) => t.totalTokens ?? -1 },
              { key: "cost", header: "Est. cost", cell: (t) => <span className="text-xs tabular-nums">{fmtCost(t.costUsd)}</span>, sortValue: (t) => t.costUsd ?? -1 },
              { key: "err", header: "Error", cell: (t) => <span className="line-clamp-1 max-w-[16rem] text-xs text-destructive">{t.errorSummary ?? ""}</span> },
              { key: "ts", header: "Timestamp", cell: (t) => <span className="text-xs whitespace-nowrap text-muted-foreground">{fmtDateTime(t.timestamp)}</span>, sortValue: (t) => t.timestamp },
            ]}
          />
        )}
      </Panel>
    </>
  );
}
