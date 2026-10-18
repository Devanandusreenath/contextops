import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Loader2, Play, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DataTable } from "@/components/data-table";
import { FilterBar, FilterSelect, SearchInput, uniq } from "@/components/filter-bar";
import { JsonViewer } from "@/components/json-viewer";
import { ErrorState, KeyValue, LoadingRows, PageHeader, Panel } from "@/components/page-parts";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { fmtDateTime } from "@/lib/format";
import { evaluationService, queries, regressionService, traceService } from "@/services";
import type { RegressionTest, Severity } from "@/types";

export interface RegressionSearch {
  fromTrace?: string;
  step?: string;
  fromRun?: string;
  caseId?: string;
}

const SEV_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const CATEGORIES = ["Schema violation", "Hallucination", "Tool failure", "Misclassification", "Latency", "Other"];

export function RegressionsPage({ search }: { search: RegressionSearch }) {
  const q = useQuery(queries.regressions());
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [category, setCategory] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [result, setResult] = useState("all");
  const [selected, setSelected] = useState<RegressionTest | null>(null);
  const [running, setRunning] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const prefillKey = search.fromTrace || search.fromRun ? JSON.stringify(search) : null;

  useEffect(() => {
    if (prefillKey) setAddOpen(true);
  }, [prefillKey]);

  const tests = q.data ?? [];
  const rows = tests.filter(
    (t) =>
      (!text || `${t.id} ${t.name} ${t.failureDescription}`.toLowerCase().includes(text.toLowerCase())) &&
      (category === "all" || t.category === category) &&
      (severity === "all" || t.severity === severity) &&
      (result === "all" || t.lastResult === result),
  );

  async function run(ids: string[]) {
    setRunning(ids);
    try {
      const res = await regressionService.run(ids);
      await qc.invalidateQueries({ queryKey: ["regressions"] });
      const fails = Object.values(res).filter((r) => r === "fail").length;
      if (fails) toast.error(`${fails} of ${ids.length} regression test(s) failed`);
      else toast.success(`All ${ids.length} regression test(s) passed`);
      setSelected((s) => (s ? { ...s, lastResult: res[s.id] ?? s.lastResult, lastRun: new Date().toISOString() } : s));
    } finally {
      setRunning([]);
    }
  }

  return (
    <>
      <PageHeader
        title="Regression Tests"
       
        description="Reproducible tests created from known failures so they never ship again."
        actions={
          <>
            <Button variant="outline" disabled={!!running.length || !rows.length} onClick={() => run(rows.map((r) => r.id))}>
              {running.length > 1 ? <Loader2 className="animate-spin" /> : <Play />} Run {rows.length === tests.length ? "all" : "filtered"} ({rows.length})
            </Button>
            <Button onClick={() => setAddOpen(true)}><Plus /> Add Regression Test</Button>
          </>
        }
      />
      <Panel bodyClassName="p-0">
        <FilterBar count={rows.length} active={!!text || [category, severity, result].some((v) => v !== "all")} onClear={() => { setText(""); setCategory("all"); setSeverity("all"); setResult("all"); }}>
          <SearchInput value={text} onChange={setText} placeholder="Search tests" />
          <FilterSelect label="Categories" value={category} onChange={setCategory} options={uniq(tests.map((t) => t.category))} />
          <FilterSelect label="Severities" value={severity} onChange={setSeverity} options={["critical", "high", "medium", "low"].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))} />
          <FilterSelect label="Results" value={result} onChange={setResult} options={[{ value: "pass", label: "Pass" }, { value: "fail", label: "Fail" }, { value: "not_run", label: "Not run" }]} />
        </FilterBar>
        {q.isLoading ? <LoadingRows /> : q.isError ? <div className="p-4"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div> : (
          <DataTable
            rows={rows}
            rowKey={(t) => t.id}
            rowLabel={(t) => `Open regression test ${t.id}`}
            onRowClick={setSelected}
            defaultSort={{ key: "sev", dir: "asc" }}
            columns={[
              { key: "id", header: "Test ID", cell: (t) => <span className="font-mono text-xs">{t.id}</span>, sortValue: (t) => t.id },
              { key: "name", header: "Test name", cell: (t) => <span className="font-medium">{t.name}</span>, sortValue: (t) => t.name },
              { key: "cat", header: "Failure category", cell: (t) => <span className="text-xs">{t.category}</span>, sortValue: (t) => t.category },
              { key: "ds", header: "Dataset", cell: (t) => <span className="font-mono text-xs">{t.datasetName}</span> },
              { key: "res", header: "Last result", cell: (t) => running.includes(t.id) ? <StatusBadge status="running" /> : <StatusBadge status={t.lastResult} />, sortValue: (t) => t.lastResult },
              { key: "last", header: "Last run", cell: (t) => <span className="text-xs whitespace-nowrap text-muted-foreground">{t.lastRun ? fmtDateTime(t.lastRun) : "Never"}</span>, sortValue: (t) => t.lastRun ?? "" },
              { key: "sev", header: "Severity", cell: (t) => <StatusBadge status={t.severity} />, sortValue: (t) => SEV_ORDER[t.severity] },
            ]}
          />
        )}
      </Panel>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.name}</SheetTitle>
                <SheetDescription className="font-mono">{selected.id} · {selected.category}</SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-6">
                <div className={`rounded-lg border px-4 py-3 ${selected.lastResult === "fail" ? "border-destructive/30 bg-destructive/5" : selected.lastResult === "pass" ? "border-success/30 bg-success/5" : ""}`} role="status">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm">Last result: <StatusBadge status={running.includes(selected.id) ? "running" : selected.lastResult} /></span>
                    <Button size="sm" disabled={!!running.length} onClick={() => run([selected.id])}>
                      {running.includes(selected.id) ? <Loader2 className="animate-spin" /> : <Play />} Run test
                    </Button>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{selected.lastRun ? `Ran ${fmtDateTime(selected.lastRun)}` : "Not run yet"}</p>
                </div>
                <KeyValue items={[["Severity", <StatusBadge status={selected.severity} />], ["Dataset", <span className="font-mono">{selected.datasetName}</span>], ["Related trace", selected.traceId ? <Link to="/traces/$traceId" params={{ traceId: selected.traceId }} className="font-mono text-primary hover:underline">{selected.traceId}</Link> : "—"]]} />
                <div>
                  <h3 className="mb-1 text-xs font-semibold text-muted-foreground uppercase">Original failure</h3>
                  <p className="text-sm">{selected.failureDescription}</p>
                </div>
                <div>
                  <h3 className="mb-1 text-xs font-semibold text-muted-foreground uppercase">Expected behavior</h3>
                  <p className="text-sm">{selected.expectedBehavior}</p>
                </div>
                <JsonViewer title="Reproducible input" data={selected.input} />
                <JsonViewer title="Actual output (at time of failure)" data={selected.actualOutput} />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <AddRegressionDialog
        key={prefillKey ?? "blank"}
        open={addOpen}
        search={search}
        onOpenChange={(o) => {
          setAddOpen(o);
          if (!o && prefillKey) navigate({ to: "/regressions", search: {}, replace: true });
        }}
      />
    </>
  );
}

function AddRegressionDialog({ open, onOpenChange, search }: { open: boolean; onOpenChange: (o: boolean) => void; search: RegressionSearch }) {
  const qc = useQueryClient();
  const { data: datasets = [] } = useQuery({ ...queries.datasets(), enabled: open });
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Schema violation");
  const [severity, setSeverity] = useState<Severity>("high");
  const [datasetId, setDatasetId] = useState("ds_support_tickets");
  const [input, setInput] = useState("{}");
  const [expected, setExpected] = useState("");
  const [description, setDescription] = useState("");
  const [traceId, setTraceId] = useState("");
  const [actual, setActual] = useState<unknown>(null);
  const [prefilled, setPrefilled] = useState(false);

  // Prefill from a failing trace or evaluation case.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let tid = search.fromTrace;
        let reason: string | undefined;
        if (search.fromRun && search.caseId) {
          const cases = await evaluationService.cases(search.fromRun);
          const c = cases.find((x) => x.caseId === search.caseId);
          if (c) {
            tid = c.traceId;
            reason = c.failureReason;
            if (cancelled) return;
            setInput(JSON.stringify(c.input, null, 2));
            setActual(c.actual);
            setCategory(c.failureKind === "schema_missing_field" ? "Schema violation" : c.failureKind === "hallucination" ? "Hallucination" : c.failureKind === "tool_timeout" ? "Tool failure" : "Misclassification");
            setExpected(`Output satisfies ${c.failedEvaluator}: ${JSON.stringify(c.expected)}`);
          }
        }
        if (tid) {
          const t = await traceService.get(tid);
          if (cancelled) return;
          const errStep = t.steps.find((s) => s.id === search.step) ?? t.steps.find((s) => s.error);
          setTraceId(t.id);
          if (!search.fromRun) {
            setInput(JSON.stringify(t.steps[0].input, null, 2));
            setActual(t.steps[0].output);
            setCategory(errStep?.type === "validation" ? "Schema violation" : errStep?.type === "tool" ? "Tool failure" : "Other");
            setExpected(errStep?.type === "validation" ? "Response includes all required fields (category, priority, escalation_level, reply)." : "Pipeline completes without errors.");
          }
          setDescription(reason ?? errStep?.error?.message ?? t.errorSummary ?? "");
          setName(`${t.caseId ?? t.id}: ${(reason ?? errStep?.error?.message ?? "failure").split(":")[0]}`);
          setPrefilled(true);
        }
      } catch (e) {
        toast.error("Couldn't prefill from source", { description: (e as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [search.fromTrace, search.fromRun, search.caseId, search.step]);

  let parsedInput: unknown;
  let inputError = "";
  try { parsedInput = JSON.parse(input); } catch { inputError = "Input must be valid JSON."; }
  const valid = name.trim() && expected.trim() && description.trim() && !inputError;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    const ds = datasets.find((d) => d.id === datasetId);
    const created = await regressionService.create({
      name: name.trim(), category, severity, datasetId, datasetName: ds?.name ?? datasetId,
      input: parsedInput, expectedBehavior: expected.trim(), failureDescription: description.trim(), actualOutput: actual, traceId: traceId || undefined,
    });
    await qc.invalidateQueries({ queryKey: ["regressions"] });
    toast.success(`Regression test ${created.id} added`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add regression test</DialogTitle>
          <DialogDescription>{prefilled ? <>Prefilled from <span className="font-mono">{traceId}</span>. Review before saving.</> : "Capture a reproducible failure so it's checked on every run."}</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={submit}>
          <div className="space-y-1.5"><Label htmlFor="rt-name">Test name</Label><Input id="rt-name" value={name} onChange={(e) => setName(e.target.value)} required /></div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}><SelectTrigger aria-label="Category"><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="space-y-1.5">
              <Label>Severity</Label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as Severity)}><SelectTrigger aria-label="Severity"><SelectValue /></SelectTrigger><SelectContent>{(["critical", "high", "medium", "low"] as const).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="space-y-1.5">
              <Label>Dataset</Label>
              <Select value={datasetId} onValueChange={setDatasetId}><SelectTrigger aria-label="Dataset"><SelectValue /></SelectTrigger><SelectContent>{datasets.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select>
            </div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="rt-input">Reproducible input (JSON)</Label><Textarea id="rt-input" rows={5} value={input} onChange={(e) => setInput(e.target.value)} className="font-mono text-xs" aria-invalid={!!inputError} />{inputError && <p className="text-xs text-destructive">{inputError}</p>}</div>
          <div className="space-y-1.5"><Label htmlFor="rt-exp">Expected behavior</Label><Textarea id="rt-exp" rows={2} value={expected} onChange={(e) => setExpected(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="rt-desc">Failure description</Label><Textarea id="rt-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="rt-trace">Related trace ID</Label><Input id="rt-trace" value={traceId} onChange={(e) => setTraceId(e.target.value)} className="font-mono" placeholder="trc_…" /></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!valid}>Add test</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
