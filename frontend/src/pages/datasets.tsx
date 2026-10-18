import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DataTable } from "@/components/data-table";
import { ErrorState, LoadingRows, PageHeader, Panel } from "@/components/page-parts";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fmtDateTime } from "@/lib/format";
import { datasetService, queries } from "@/services";

export function DatasetsPage() {
  const q = useQuery(queries.datasets());
  const navigate = useNavigate();
  return (
    <>
      <PageHeader title="Datasets" description="Versioned test-case collections used by evaluations." actions={<CreateDatasetDialog />} />
      <Panel bodyClassName="p-0">
        {q.isLoading ? <LoadingRows /> : q.isError ? <div className="p-4"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div> : (
          <DataTable
            rows={q.data ?? []}
            rowKey={(d) => d.id}
            rowLabel={(d) => `Open dataset ${d.name}`}
            onRowClick={(d) => navigate({ to: "/datasets/$datasetId", params: { datasetId: d.id } })}
            columns={[
              { key: "name", header: "Dataset", cell: (d) => <div><div className="font-mono text-sm font-medium">{d.name}</div><div className="line-clamp-1 max-w-md text-xs text-muted-foreground">{d.description}</div></div>, sortValue: (d) => d.name },
              { key: "cases", header: "Test cases", cell: (d) => <span className="tabular-nums">{d.versions.find((v) => v.version === d.currentVersion)?.caseIds.length ?? d.cases.length}</span>, sortValue: (d) => d.cases.length },
              { key: "ver", header: "Version", cell: (d) => <span className="font-mono text-xs">{d.currentVersion}</span> },
              { key: "schema", header: "Schema", cell: (d) => <StatusBadge status={d.schemaStatus} />, sortValue: (d) => d.schemaStatus },
              { key: "upd", header: "Last updated", cell: (d) => <span className="text-xs text-muted-foreground">{fmtDateTime(d.updatedAt)}</span>, sortValue: (d) => d.updatedAt },
              { key: "act", header: "", cell: () => <span className="text-xs font-medium text-primary">View details →</span>, className: "text-right" },
            ]}
          />
        )}
      </Panel>
    </>
  );
}

function CreateDatasetDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const valid = /^[a-z0-9][a-z0-9-]{2,40}$/.test(name);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus /> Create dataset</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create dataset</DialogTitle>
          <DialogDescription>Datasets group the test cases your evaluations run against.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!valid) return;
            const ds = await datasetService.create(name, desc);
            await qc.invalidateQueries({ queryKey: ["datasets"] });
            toast.success(`Dataset ${ds.name} created`);
            setOpen(false);
            navigate({ to: "/datasets/$datasetId", params: { datasetId: ds.id } });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="ds-name">Name</Label>
            <Input id="ds-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. onboarding-questions" aria-invalid={!!name && !valid} />
            {name && !valid && <p className="text-xs text-destructive">Use 3–40 lowercase letters, digits and dashes.</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ds-desc">Description</Label>
            <Textarea id="ds-desc" value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={!valid}>Create</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
