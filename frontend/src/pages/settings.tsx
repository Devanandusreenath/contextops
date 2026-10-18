import { useQuery } from "@tanstack/react-query";
import { Loader2, PlugZap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader, Panel } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { usePreferences } from "@/lib/preferences";
import { EVALUATORS } from "@/mock-data";
import { queries } from "@/services";
import { checkHealth } from "@/services/api-client";

function Row({ label, hint, children, htmlFor }: { label: string; hint?: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <Label htmlFor={htmlFor}>{label}</Label>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="sm:w-72">{children}</div>
    </div>
  );
}

export function SettingsPage() {
  const { prefs, update, reset } = usePreferences();
  const { data: datasets = [] } = useQuery(queries.datasets());
  const [health, setHealth] = useState<{ ok: boolean; message: string } | null>(null);
  const [checking, setChecking] = useState(false);

  return (
    <>
      <PageHeader title="Settings" description="Preferences are stored in this browser only." actions={<Button variant="outline" onClick={() => { reset(); toast("Preferences reset"); }}>Reset to defaults</Button>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Workspace" bodyClassName="divide-y px-4 py-1">
          <Row label="Workspace name" htmlFor="ws">
            <Input id="ws" value={prefs.workspace} onChange={(e) => update({ workspace: e.target.value })} />
          </Row>
          <Row label="Theme">
            <Select value={prefs.theme} onValueChange={(v) => update({ theme: v as typeof prefs.theme })}>
              <SelectTrigger aria-label="Theme"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="light">Light</SelectItem><SelectItem value="dark">Dark</SelectItem><SelectItem value="system">System</SelectItem></SelectContent>
            </Select>
          </Row>
        </Panel>

        <Panel title="Display" bodyClassName="divide-y px-4 py-1">
          <Row label="Compact tables" hint="Reduce row height in data tables." htmlFor="compact">
            <Switch id="compact" checked={prefs.compactTables} onCheckedChange={(v) => update({ compactTables: v })} />
          </Row>
          <Row label="Mask personal data by default" hint="Emails and phone numbers in traces are masked until revealed. Secrets are always redacted." htmlFor="mask">
            <Switch id="mask" checked={prefs.maskPii} onCheckedChange={(v) => update({ maskPii: v })} />
          </Row>
        </Panel>

        <Panel title="Default evaluation settings" bodyClassName="divide-y px-4 py-1">
          <Row label="Default dataset">
            <Select value={prefs.defaultDatasetId} onValueChange={(v) => update({ defaultDatasetId: v })}>
              <SelectTrigger aria-label="Default dataset"><SelectValue /></SelectTrigger>
              <SelectContent>{datasets.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
            </Select>
          </Row>
          <Row label="Pass-rate target (%)" hint="Used to judge whether a run is healthy." htmlFor="thr">
            <Input id="thr" type="number" min={0} max={100} value={prefs.passThreshold} onChange={(e) => update({ passThreshold: Math.min(100, Math.max(0, Number(e.target.value))) })} />
          </Row>
          <div className="py-3">
            <Label>Default evaluators</Label>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {EVALUATORS.map((e) => (
                <label key={e.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={prefs.defaultEvaluators.includes(e.id)} onCheckedChange={(c) => update({ defaultEvaluators: c ? [...prefs.defaultEvaluators, e.id] : prefs.defaultEvaluators.filter((x) => x !== e.id) })} />
                  {e.label}
                </label>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title="API connection">
          <div className="space-y-3 text-sm">
            <p className="text-xs text-muted-foreground">Model-provider API keys belong on the FastAPI backend. They are never entered or stored in this interface.</p>
            <Button variant="outline" size="sm" disabled={checking} onClick={async () => { setChecking(true); setHealth(await checkHealth()); setChecking(false); }}>
              {checking ? <Loader2 className="animate-spin" /> : <PlugZap />} Test connection
            </Button>
            {health && <p role="status" className={health.ok ? "text-success" : "text-warning"}>{health.message}</p>}
          </div>
        </Panel>
      </div>
    </>
  );
}
