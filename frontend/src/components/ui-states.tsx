import type { UseQueryResult } from "@tanstack/react-query";
import { AlertTriangle, Inbox, Loader2, PlugZap, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui-kit";
import { API_BASE_URL, OFFLINE_FALLBACK } from "@/services/config";
import { ApiError } from "@/services/http";
import { cn } from "@/lib/utils";

export function LoadingState({ label = "Loading from FalkorDB…", className }: { label?: string | undefined; className?: string | undefined }) {
  return (
    <div role="status" className={cn("flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground", className)}>
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  );
}

export function ErrorState({ error, onRetry, retrying, className }: { error: unknown; onRetry?: (() => void) | undefined; retrying?: boolean | undefined; className?: string | undefined }) {
  const err = error instanceof ApiError ? error : null;
  const disconnected = err?.kind === "network";
  return (
    <div role="alert" className={cn("mx-auto flex max-w-xl flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center", className)}>
      {disconnected ? <PlugZap className="h-6 w-6 text-destructive" /> : <AlertTriangle className="h-6 w-6 text-destructive" />}
      <div>
        <p className="text-sm font-semibold">{disconnected ? "Backend disconnected" : "Request failed"}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{err?.message ?? (error instanceof Error ? error.message : "Unexpected error")}</p>
        {disconnected && (
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Expected API at <code className="font-mono text-foreground">{API_BASE_URL}</code>. Start it with <code className="font-mono text-foreground">docker compose up -d</code>, check for
            port or CORS problems, then retry. No mock data is shown while disconnected.
          </p>
        )}
        {err && !disconnected && <p className="mt-1 font-mono text-[10px] text-muted-foreground">{err.code}{err.status ? ` · HTTP ${err.status}` : ""}</p>}
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} disabled={retrying}>
          <RefreshCw className={retrying ? "animate-spin" : ""} /> Retry
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ title, hint, className }: { title: string; hint?: ReactNode; className?: string | undefined }) {
  return (
    <div className={cn("flex flex-col items-center gap-1.5 py-10 text-center text-sm text-muted-foreground", className)}>
      <Inbox className="h-5 w-5" />
      <p className="font-medium text-foreground">{title}</p>
      {hint && <p className="max-w-md text-xs leading-relaxed">{hint}</p>}
    </div>
  );
}

/** Renders loading / error(+retry) states for a query and the children once data is available. */
export function QueryGate<T>({ query, label, children, className }: { query: UseQueryResult<T>; label?: string | undefined; children: (data: T) => ReactNode; className?: string | undefined }) {
  if (query.isPending) return <LoadingState label={label} className={className} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} className={className} />;
  return <>{children(query.data)}</>;
}

export function OfflineBanner() {
  if (!OFFLINE_FALLBACK) return null;
  return (
    <div role="note" className="mb-4 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
      OFFLINE DEMO DATA: <code className="font-mono">VITE_ENABLE_OFFLINE_FALLBACK=true</code>. The backend and FalkorDB are NOT being used; investigations are disabled.
    </div>
  );
}
