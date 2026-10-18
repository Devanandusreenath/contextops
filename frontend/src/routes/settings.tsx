import { createFileRoute } from "@tanstack/react-router";
import { Bot, Database, PlugZap, RefreshCw } from "lucide-react";
import { Badge, Button, PageHeader, Panel } from "@/components/ui-kit";
import { ErrorState, LoadingState, OfflineBanner } from "@/components/ui-states";
import { API_BASE_URL, OFFLINE_FALLBACK } from "@/services/config";
import { ApiError } from "@/services/http";
import { useIntegrations } from "@/services/queries";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/settings")({
  head: () => pageHead("Settings", "Live connection status and environment information for ContextOps."),
  component: SettingsPage,
});

function Status({ ok, label }: { ok: boolean | null; label: string }) {
  const cls = ok === null ? "bg-muted-foreground" : ok ? "bg-success" : "bg-destructive";
  return (
    <div className="mt-4 flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs">
      <span className={`h-2 w-2 rounded-full ${cls}`} />
      {label}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border pb-2 last:border-0">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right font-mono text-xs">{v}</dd>
    </div>
  );
}

function SettingsPage() {
  const q = useIntegrations();
  const d = q.data;
  const net = q.error instanceof ApiError && q.error.kind === "network";
  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader
        title="Settings"
        subtitle="Live connection status reported by the backend."
        actions={<Button variant="secondary" size="sm" onClick={() => void q.refetch()} disabled={q.isFetching}><RefreshCw className={q.isFetching ? "animate-spin" : ""} /> Refresh</Button>}
      />
      <OfflineBanner />
      {q.isPending && !OFFLINE_FALLBACK && <LoadingState label="Checking backend…" />}
      {q.isError && !OFFLINE_FALLBACK && <ErrorState error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} className="mb-4" />}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="panel p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary"><Database className="h-4 w-4 text-primary" /></div>
            <p className="font-medium">FalkorDB</p>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Graph database for entities, relationships, investigations and agent memory.</p>
          <Status ok={d ? d.falkordb.connected : q.isError ? false : null} label={d ? (d.falkordb.connected ? `Connected · graph "${d.falkordb.graph}"` : "Not connected") : q.isError ? "Unknown (backend unreachable)" : "Checking…"} />
          {d?.falkordb.connected && (
            <p className="mt-2 text-[11px] text-muted-foreground">{d.falkordb.nodeCount} nodes · {d.falkordb.edgeCount} relationships{d.falkordb.moduleVersion ? ` · module ${d.falkordb.moduleVersion}` : ""}{d.falkordb.seeded ? "" : " · NOT SEEDED"}</p>
          )}
        </div>
        <div className="panel p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary"><Bot className="h-4 w-4 text-primary" /></div>
            <p className="font-medium">AI Agent</p>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Investigator + Verification agents. Rules mode needs no API key.</p>
          <Status ok={d ? !!d.agent.effectiveMode : q.isError ? false : null} label={d ? (d.agent.effectiveMode ? `Mode: ${d.agent.effectiveMode}` : "Misconfigured") : q.isError ? "Unknown (backend unreachable)" : "Checking…"} />
          {d && (
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              Configured: {d.agent.configuredMode} · LLM key {d.agent.llmConfigured ? `configured (${d.agent.model})` : "not configured"}
              {d.agent.fallbackReason ? ` · ${d.agent.fallbackReason}` : ""}
              {d.agent.error ? ` · ${d.agent.error}` : ""}
            </p>
          )}
        </div>
        <div className="panel p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary"><PlugZap className="h-4 w-4 text-primary" /></div>
            <p className="font-medium">Application API</p>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Python FastAPI service that brokers graph and agent calls.</p>
          <Status ok={d ? true : q.isError ? false : null} label={d ? `Connected · v${d.api.version}` : q.isError ? (net ? "Disconnected" : "Error") : "Checking…"} />
          <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">{API_BASE_URL}</p>
        </div>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Panel title="Environment">
          <dl className="space-y-2 text-sm">
            <Row k="API base URL" v={API_BASE_URL} />
            <Row k="Backend environment" v={d?.api.env ?? "—"} />
            <Row k="Offline demo fallback" v={OFFLINE_FALLBACK ? "ENABLED" : "disabled"} />
            <Row k="Data" v="Synthetic only" />
            <Row k="Credentials in this browser" v="None" />
          </dl>
        </Panel>
        <Panel title="About this deployment" action={<Badge tone="warning">Synthetic data</Badge>}>
          <p className="text-sm leading-relaxed text-muted-foreground">
            All systems, people, incidents and metrics are fictional. Investigations run on the backend: allow-listed tools query FalkorDB, and the Verification Agent runs deterministic tests on synthetic
            fixtures. API keys and database credentials live only in the backend environment; this app contains no secrets. ContextOps never changes an external system; proposed fixes require human approval.
          </p>
        </Panel>
      </div>
    </div>
  );
}
