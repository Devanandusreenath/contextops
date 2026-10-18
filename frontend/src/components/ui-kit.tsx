import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { EntityType } from "@/types";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground border border-border hover:bg-surface-2",
        ghost: "text-muted-foreground hover:bg-secondary hover:text-foreground",
        outline: "border border-border text-foreground hover:bg-secondary",
      },
      size: { sm: "h-8 px-3 text-xs", md: "h-9 px-4", icon: "h-9 w-9" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium border whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "border-border bg-secondary text-muted-foreground",
        primary: "border-primary/30 bg-primary/10 text-primary",
        violet: "border-violet/30 bg-violet/10 text-violet",
        success: "border-success/30 bg-success/10 text-success",
        warning: "border-warning/30 bg-warning/10 text-warning",
        danger: "border-destructive/30 bg-destructive/10 text-destructive",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);
export type Tone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

export function Badge({ tone, children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn(badgeVariants({ tone }), className)}>{children}</span>;
}

export function Panel({ title, action, children, className, bodyClassName }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cn("panel", className)}>
      {title && (
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {action}
        </header>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function DemoNote({ children }: { children: ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-warning/25 bg-warning/5 px-2.5 py-1 text-xs text-warning">
      <span className="h-1.5 w-1.5 rounded-full bg-warning" />
      {children}
    </div>
  );
}

export const entityColorVar: Record<EntityType, string> = {
  Service: "var(--node-service)",
  Dataset: "var(--node-dataset)",
  Pipeline: "var(--node-pipeline)",
  Incident: "var(--node-incident)",
  Person: "var(--node-person)",
  Team: "var(--node-team)",
  Decision: "var(--node-decision)",
  Document: "var(--node-document)",
  Fix: "var(--node-fix)",
  "Verification Test": "var(--node-test)",
  Project: "var(--node-project)",
};

export function EntityDot({ type }: { type: EntityType }) {
  return <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: entityColorVar[type] }} />;
}

export function EntityTag({ type }: { type: EntityType }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <EntityDot type={type} />
      {type}
    </span>
  );
}

export const inputClass =
  "h-9 w-full rounded-md border border-input bg-surface px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";
