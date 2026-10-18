import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Pencil, Plus, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { DataTable } from "@/components/data-table";
import { SearchInput } from "@/components/filter-bar";
import { EmptyState, ErrorState, LoadingRows, PageHeader, Panel } from "@/components/page-parts";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { fmtDateTime } from "@/lib/format";
import { datasetService, queries } from "@/services";
import type { Dataset, TestCase } from "@/types";

interface JsonlIssue {
  line: number;
  message: string;
}

export function parseJsonl(text: string): { cases: TestCase[]; issues: JsonlIssue[] } {
  const cases: TestCase[] = [];
  const issues: JsonlIssue[] = [];
  text.split(/\r?\n/).forEach((raw, i): void => {
    const line = raw.trim();
    if (!line) return;
    try {
      const o = JSON.parse(line);
      if (typeof o !== "object" || o === null || Array.isArray(o)) { issues.push({ line: i + 1, message: "Line must be a JSON object" }); return; }
      if (typeof o.id !== "string" || !o.id) { issues.push({ line: i + 1, message: "Missing required string field `id`" }); return; }
      if (!("input" in o)) { issues.push({ line: i + 1, message: "Missing required field `input`" }); return; }
      if (!("expected" in o)) { issues.push({ line: i + 1, message: "Missing required field `expected`" }); return; }
      if (o.tags !== undefined && !Array.isArray(o.tags)) { issues.push({ line: i + 1, message: "`tags` must be an array" }); return; }
      cases.push({ id: o.id, input: o.input, expected: o.expected, tags: o.tags ?? [] });
    } catch (e) {
      issues.push({ line: i + 1, message: `Invalid JSON: ${(e as Error).message}` });
    }
  });
  return { cases, issues };
}

const preview = (v: unknown) => {
  const o = v as Record<string, unknown>;
  return String(o?.message ?? o?.question ?? JSON.stringify(v));
};

export function DatasetDetailPage({ datasetId }: { datasetId: string }) {
  const q = useQuery(queries.dataset(datasetId));
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<TestCase | "new" | null>(null);
  const [search, setSearch] = useState("");
  const [importIssues, setImportIssues] = useState<JsonlIssue[] | null>(null);

  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const ds = q.data;
  if (!ds) return <LoadingRows rows={10} />;

  const rows = ds.cases.filter((c) => !search || c.id.includes(search) || JSON.stringify(c).toLowerCase().includes(search.toLowerCase()));

  const save = async (tc: TestCase) => {
    await datasetService.upsertCase(ds.id, tc);
    await qc.invalidateQueries({ queryKey: ["datasets"] });
  };

  const exportJsonl = () => {
    const body = ds.cases.map((c) => JSON.stringify(c)).join("\n");
    const url = URL.createObjectURL(new Blob([body], { type: "application/jsonl" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${ds.name}-${ds.currentVersion}.jsonl`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${ds.cases.length} cases`);
  };

  const onImport = async (file: File) => {
    const { cases, issues } = parseJsonl(await file.text());
    for (const c of cases) await datasetService.upsertCase(ds.id, c);
    await qc.invalidateQueries({ queryKey: ["datasets"] });
    setImportIssues(issues);
    if (cases.length) toast.success(`Imported ${cases.length} valid cases`, { description: issues.length ? `${issues.length} lines rejected` : undefined });
    else toast.error("No valid cases found");
  };

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Datasets", to: "/datasets" }, { label: ds.name }]}
        title={<span className="font-mono">{ds.name}</span>}
        badge={<><StatusBadge status={ds.schemaStatus} /><span className="font-mono text-xs text-muted-foreground">{ds.currentVersion}</span></>}
        description={ds.description}
        actions={
          <>
            <input ref={fileRef} type="file" accept=".jsonl,.ndjson,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ""; }} />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload /> Import JSONL</Button>
            <Button variant="outline" size="sm" onClick={exportJsonl} disabled={!ds.cases.length}><Download /> Export JSONL</Button>
            <Button size="sm" onClick={() => setEditing("new")}><Plus /> Add test case</Button>
          </>
        }
      />

      {importIssues && importIssues.length > 0 && (
        <Panel className="mb-4" title={`JSONL validation — ${importIssues.length} rejected line(s)`} actions={<Button size="sm" variant="ghost" onClick={() => setImportIssues(null)}>Dismiss</Button>}>
          <ul className="space-y-1 font-mono text-xs">
            {importIssues.map((i) => <li key={i.line}><span className="text-muted-foreground">line {i.line}:</span> <span className="text-destructive">{i.message}</span></li>)}
          </ul>
        </Panel>
      )}

      <Tabs defaultValue="cases">
        <TabsList>
          <TabsTrigger value="cases">Test cases ({ds.cases.length})</TabsTrigger>
          <TabsTrigger value="versions">Versions ({ds.versions.length})</TabsTrigger>
          <TabsTrigger value="schema">Schema validation</TabsTrigger>
        </TabsList>
        <TabsContent value="cases">
          <Panel bodyClassName="p-0">
            <div className="border-b px-3 py-2.5"><SearchInput value={search} onChange={setSearch} placeholder="Search cases" /></div>
            <DataTable
              rows={rows}
              rowKey={(c) => c.id}
              rowLabel={(c) => `Edit case ${c.id}`}
              onRowClick={setEditing}
              empty={<EmptyState title={ds.cases.length ? "No matching cases" : "No test cases yet"} description="Add a case or import a JSONL file." action={<Button size="sm" onClick={() => setEditing("new")}><Plus /> Add test case</Button>} />}
              columns={[
                { key: "id", header: "Case ID", cell: (c) => <span className="font-mono text-xs">{c.id}</span>, sortValue: (c) => c.id },
                { key: "in", header: "Input", cell: (c) => <span className="line-clamp-2 max-w-md text-xs">{preview(c.input)}</span> },
                { key: "exp", header: "Expected", cell: (c) => <code className="line-clamp-2 max-w-sm font-mono text-[11px] text-muted-foreground">{JSON.stringify(c.expected)}</code> },
                { key: "tags", header: "Tags", cell: (c) => <div className="flex flex-wrap gap-1">{c.tags.map((t) => <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{t}</span>)}</div> },
                { key: "e", header: "", cell: () => <Pencil className="size-3.5 text-muted-foreground" aria-hidden /> },
              ]}
            />
          </Panel>
        </TabsContent>
        <TabsContent value="versions"><Versions ds={ds} /></TabsContent>
        <TabsContent value="schema">
          <Panel title="Schema validation results">
            <div className="mb-3 flex items-center gap-2 text-sm"><StatusBadge status={ds.schemaStatus} /> Required per case: <code className="font-mono text-xs">id</code>, <code className="font-mono text-xs">input</code>, <code className="font-mono text-xs">expected</code>; optional <code className="font-mono text-xs">tags</code>.</div>
            {ds.schemaIssues.length ? (
              <ul className="space-y-1.5">{ds.schemaIssues.map((s) => <li key={s} className="rounded-md border px-3 py-2 font-mono text-xs">{s}</li>)}</ul>
            ) : <p className="text-sm text-muted-foreground">All {ds.cases.length} cases conform to the dataset schema.</p>}
          </Panel>
        </TabsContent>
      </Tabs>

      <CaseForm
        key={editing === "new" ? "new" : editing?.id ?? "none"}
        initial={editing}
        existingIds={ds.cases.map((c) => c.id)}
        onClose={() => setEditing(null)}
        onSave={async (tc) => { await save(tc); toast.success(`Case ${tc.id} saved`); setEditing(null); }}
      />
    </>
  );
}

function Versions({ ds }: { ds: Dataset }) {
  const [a, setA] = useState(ds.versions.at(-2)?.version ?? ds.versions[0].version);
  const [b, setB] = useState(ds.currentVersion);
  const va = ds.versions.find((v) => v.version === a);
  const vb = ds.versions.find((v) => v.version === b);
  const added = vb?.caseIds.filter((id) => !va?.caseIds.includes(id)) ?? [];
  const removed = va?.caseIds.filter((id) => !vb?.caseIds.includes(id)) ?? [];
  const opts = ds.versions.map((v) => ({ value: v.version, label: v.version }));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Version history" bodyClassName="p-0">
        <ol className="divide-y">
          {[...ds.versions].reverse().map((v) => (
            <li key={v.version} className="flex items-start justify-between gap-4 px-4 py-3">
              <div>
                <div className="flex items-center gap-2"><span className="font-mono text-sm font-medium">{v.version}</span>{v.version === ds.currentVersion && <StatusBadge status="success" label="Current" />}</div>
                <p className="mt-0.5 text-xs text-muted-foreground">{v.note}</p>
              </div>
              <div className="text-right text-xs text-muted-foreground whitespace-nowrap">{v.caseIds.length} cases<br />{fmtDateTime(v.createdAt)}</div>
            </li>
          ))}
        </ol>
      </Panel>
      <Panel title="Compare versions">
        {ds.versions.length < 2 ? <EmptyState title="Only one version" description="Comparison needs at least two versions." /> : (
          <>
            <div className="mb-4 flex items-center gap-2 text-sm">
              <CompareSelect value={a} onChange={setA} options={opts} label="Base version" />
              <span className="text-muted-foreground">→</span>
              <CompareSelect value={b} onChange={setB} options={opts} label="Target version" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><p className="mb-1 text-xs font-medium text-success">+ {added.length} added</p><ul className="space-y-0.5 font-mono text-xs">{added.map((id) => <li key={id}>{id}</li>)}</ul></div>
              <div><p className="mb-1 text-xs font-medium text-destructive">− {removed.length} removed</p><ul className="space-y-0.5 font-mono text-xs">{removed.map((id) => <li key={id}>{id}</li>)}</ul></div>
            </div>
            {vb && <p className="mt-4 text-xs text-muted-foreground">{b} note: {vb.note}</p>}
          </>
        )}
      </Panel>
    </div>
  );
}

function CompareSelect(props: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label: string }) {
  // FilterSelect adds an "All" option; versions need a strict choice.
  return (
    <select aria-label={props.label} value={props.value} onChange={(e) => props.onChange(e.target.value)} className="h-8 rounded-md border bg-card px-2 font-mono text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
      {props.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function CaseForm({ initial, existingIds, onClose, onSave }: { initial: TestCase | "new" | null; existingIds: string[]; onClose: () => void; onSave: (tc: TestCase) => void }) {
  const isNew = initial === "new";
  const tc = initial && initial !== "new" ? initial : null;
  const [id, setId] = useState(tc?.id ?? "");
  const [input, setInput] = useState(tc ? JSON.stringify(tc.input, null, 2) : '{\n  "message": ""\n}');
  const [expected, setExpected] = useState(tc ? JSON.stringify(tc.expected, null, 2) : '{\n  "category": ""\n}');
  const [tags, setTags] = useState(tc?.tags.join(", ") ?? "");
  const errors: string[] = [];
  if (!id.trim()) errors.push("Case ID is required.");
  if (isNew && existingIds.includes(id.trim())) errors.push("Case ID already exists.");
  const parse = (s: string, label: string) => { try { return JSON.parse(s); } catch { errors.push(`${label} must be valid JSON.`); } };
  const pi = parse(input, "Input");
  const pe = parse(expected, "Expected");

  return (
    <Dialog open={!!initial} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? "Add test case" : `Edit ${tc?.id}`}</DialogTitle>
          <DialogDescription>Test cases are validated against the dataset schema on save.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!errors.length) onSave({ id: id.trim(), input: pi, expected: pe, tags: tags.split(",").map((t) => t.trim()).filter(Boolean) }); }}>
          <div className="space-y-1.5"><Label htmlFor="cid">Case ID</Label><Input id="cid" value={id} disabled={!isNew} onChange={(e) => setId(e.target.value)} className="font-mono" /></div>
          <div className="space-y-1.5"><Label htmlFor="cin">Input (JSON)</Label><Textarea id="cin" rows={4} value={input} onChange={(e) => setInput(e.target.value)} className="font-mono text-xs" /></div>
          <div className="space-y-1.5"><Label htmlFor="cexp">Expected output / properties (JSON)</Label><Textarea id="cexp" rows={4} value={expected} onChange={(e) => setExpected(e.target.value)} className="font-mono text-xs" /></div>
          <div className="space-y-1.5"><Label htmlFor="ctags">Tags (comma separated)</Label><Input id="ctags" value={tags} onChange={(e) => setTags(e.target.value)} /></div>
          {errors.length > 0 && <ul className="space-y-0.5 text-xs text-destructive" role="alert">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={errors.length > 0}>Save case</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
