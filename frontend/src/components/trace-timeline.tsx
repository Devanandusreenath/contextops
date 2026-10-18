import { Bot, Cpu, Database, ShieldCheck, Wrench, AlertCircle } from "lucide-react";
import type { StepType, TraceStep } from "@/types";
import { fmtDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

export const STEP_META: Record<StepType, { icon: typeof Bot; bar: string; text: string; label: string }> = {
  agent: { icon: Bot, bar: "bg-step-agent", text: "text-step-agent", label: "Agent" },
  llm: { icon: Cpu, bar: "bg-step-llm", text: "text-step-llm", label: "Model call" },
  tool: { icon: Wrench, bar: "bg-step-tool", text: "text-step-tool", label: "Tool call" },
  retrieval: { icon: Database, bar: "bg-step-retrieval", text: "text-step-retrieval", label: "Retrieval" },
  validation: { icon: ShieldCheck, bar: "bg-step-validation", text: "text-step-validation", label: "Validation" },
};

function depthOf(step: TraceStep, steps: TraceStep[]): number {
  let d = 0;
  let p = step.parentId;
  while (p) {
    d++;
    p = steps.find((s) => s.id === p)?.parentId ?? null;
  }
  return d;
}

export function TraceTimeline({ steps, totalMs, selectedId, onSelect }: { steps: TraceStep[]; totalMs: number; selectedId: string; onSelect: (id: string) => void }) {
  const ordered = [...steps].sort((a, b) => a.startOffsetMs - b.startOffsetMs);
  return (
    <ol role="listbox" aria-label="Execution timeline" className="divide-y">
      {ordered.map((s) => {
        const meta = STEP_META[s.type];
        const Icon = meta.icon;
        const depth = depthOf(s, steps);
        const selected = s.id === selectedId;
        return (
          <li key={s.id}>
            <button
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => onSelect(s.id)}
              className={cn(
                "grid w-full grid-cols-[minmax(0,1fr)_7rem] items-center gap-3 px-3 py-2 text-left text-sm hover:bg-accent/60 focus-visible:bg-accent focus-visible:outline-none sm:grid-cols-[minmax(0,1fr)_minmax(8rem,40%)]",
                selected && "bg-accent",
              )}
            >
              <span className="flex min-w-0 items-center gap-2" style={{ paddingLeft: depth * 16 }}>
                {depth > 0 && <span className="h-px w-2 shrink-0 bg-border" aria-hidden />}
                <Icon className={cn("size-4 shrink-0", meta.text)} aria-hidden />
                <span className="truncate font-mono text-xs">{s.name}</span>
                {s.status === "error" && <AlertCircle className="size-3.5 shrink-0 text-destructive" aria-label="error" />}
              </span>
              <span className="flex items-center gap-2">
                <span className="relative h-2 flex-1 rounded-sm bg-muted" aria-hidden>
                  <span
                    className={cn("absolute inset-y-0 rounded-sm", s.status === "error" ? "bg-destructive" : meta.bar)}
                    style={{ left: `${(s.startOffsetMs / totalMs) * 100}%`, width: `${Math.max(1, (s.durationMs / totalMs) * 100)}%` }}
                  />
                </span>
                <span className="w-14 text-right text-xs tabular-nums text-muted-foreground">{fmtDuration(s.durationMs)}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
