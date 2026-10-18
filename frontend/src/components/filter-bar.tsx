import { Search, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-auto min-w-36 bg-card text-xs" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All {label.toLowerCase()}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="h-8 w-56 bg-card pl-8 text-xs" />
    </div>
  );
}

export function FilterBar({ children, active, onClear, count }: { children: ReactNode; active: boolean; onClear: () => void; count: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5">
      {children}
      {active && (
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onClear}>
          <X /> Clear
        </Button>
      )}
      <span className="ml-auto text-xs text-muted-foreground">{count} results</span>
    </div>
  );
}

export const uniq = (xs: string[]) => [...new Set(xs)].map((v) => ({ value: v, label: v }));

export const DATE_OPTIONS = [
  { value: "1", label: "Last 24 hours" },
  { value: "3", label: "Last 3 days" },
  { value: "7", label: "Last 7 days" },
];

/** Date windows are relative to the newest item so the demo data stays meaningful. */
export function withinDays(iso: string, newestIso: string | undefined, days: string) {
  if (days === "all" || !newestIso) return true;
  return new Date(newestIso).getTime() - new Date(iso).getTime() <= Number(days) * 86400000;
}
