import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/lib/preferences";
import { EmptyState } from "./page-parts";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty,
  defaultSort,
  rowLabel,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
  defaultSort?: { key: string; dir: "asc" | "desc" };
  rowLabel?: (row: T) => string;
}) {
  const { prefs } = usePreferences();
  const [sort, setSort] = useState(defaultSort);
  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort?.key);
    if (!col?.sortValue || !sort) return rows;
    const s = [...rows].sort((a, b) => {
      const av = col.sortValue!(a), bv = col.sortValue!(b);
      return av < bv ? -1 : av > bv ? 1 : 0;
    });
    return sort.dir === "desc" ? s.reverse() : s;
  }, [rows, sort, columns]);

  if (!rows.length) return <>{empty ?? <EmptyState title="No results" description="Try adjusting your filters." />}</>;

  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full text-sm", prefs.compactTables && "compact")}>
        <thead>
          <tr className="border-b bg-surface text-left text-xs text-muted-foreground">
            {columns.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th key={c.key} scope="col" className={cn("px-3 py-2 font-medium whitespace-nowrap", c.className)} aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}>
                  {c.sortValue ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      onClick={() => setSort({ key: c.key, dir: active && sort!.dir === "desc" ? "asc" : "desc" })}
                    >
                      {c.header}
                      {active ? sort!.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-40" />}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={rowKey(row)}
              tabIndex={onRowClick ? 0 : undefined}
              aria-label={rowLabel?.(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={onRowClick ? (e) => e.key === "Enter" && onRowClick(row) : undefined}
              className={cn("border-b last:border-0", onRowClick && "cursor-pointer hover:bg-accent/60 focus-visible:bg-accent focus-visible:outline-none")}
            >
              {columns.map((c) => (
                <td key={c.key} className={cn("px-3 py-2.5 align-middle", c.className)}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
