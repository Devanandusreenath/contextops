import { cva } from "class-variance-authority";
import { CheckCircle2, CircleDashed, Loader2, XCircle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const badge = cva("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap", {
  variants: {
    tone: {
      success: "border-success/25 bg-success/10 text-success",
      danger: "border-destructive/25 bg-destructive/10 text-destructive",
      warning: "border-warning/30 bg-warning/10 text-warning",
      info: "border-info/25 bg-info/10 text-info",
      neutral: "border-border bg-muted text-muted-foreground",
    },
  },
});

type Tone = "success" | "danger" | "warning" | "info" | "neutral";

const MAP: Record<string, { tone: Tone; label: string; icon?: "ok" | "x" | "spin" | "warn" | "dash" }> = {
  completed: { tone: "success", label: "Completed", icon: "ok" },
  success: { tone: "success", label: "Success", icon: "ok" },
  pass: { tone: "success", label: "Pass", icon: "ok" },
  passed: { tone: "success", label: "Passed", icon: "ok" },
  valid: { tone: "success", label: "Valid", icon: "ok" },
  running: { tone: "info", label: "Running", icon: "spin" },
  failed: { tone: "danger", label: "Failed", icon: "x" },
  error: { tone: "danger", label: "Error", icon: "x" },
  fail: { tone: "danger", label: "Fail", icon: "x" },
  invalid: { tone: "danger", label: "Invalid", icon: "x" },
  warnings: { tone: "warning", label: "Warnings", icon: "warn" },
  not_run: { tone: "neutral", label: "Not run", icon: "dash" },
  critical: { tone: "danger", label: "Critical" },
  high: { tone: "warning", label: "High" },
  medium: { tone: "info", label: "Medium" },
  low: { tone: "neutral", label: "Low" },
};

export function StatusBadge({ status, label, className }: { status: string; label?: string; className?: string }) {
  const m = MAP[status] ?? { tone: "neutral" as Tone, label: status };
  const Icon = { ok: CheckCircle2, x: XCircle, spin: Loader2, warn: AlertTriangle, dash: CircleDashed }[m.icon ?? "dash"];
  return (
    <span className={cn(badge({ tone: m.tone }), className)}>
      {m.icon && <Icon className={cn("size-3", m.icon === "spin" && "animate-spin")} aria-hidden />}
      {label ?? m.label}
    </span>
  );
}

export function PassRate({ passed, total }: { passed: number; total: number }) {
  if (!total) return <span className="text-muted-foreground">—</span>;
  const pct = (passed / total) * 100;
  const tone = pct >= 90 ? "bg-success" : pct >= 75 ? "bg-warning" : "bg-destructive";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular-nums">{pct.toFixed(1)}%</span>
    </div>
  );
}
