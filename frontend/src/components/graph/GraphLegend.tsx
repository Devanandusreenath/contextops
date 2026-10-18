import { EntityDot } from "@/components/ui-kit";
import type { EntityType } from "@/types";

export function GraphLegend({ types }: { types: EntityType[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {types.map((t) => (
        <span key={t} className="inline-flex items-center gap-1.5">
          <EntityDot type={t} /> {t}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="h-px w-4 border-t border-dashed border-muted-foreground" /> Similar
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-0.5 w-4 bg-primary" /> Failure path
      </span>
    </div>
  );
}
