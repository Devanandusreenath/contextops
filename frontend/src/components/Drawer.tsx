import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-background/70 animate-in fade-in" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-border bg-card shadow-2xl animate-in slide-in-from-right">
        <header className="flex items-center justify-between gap-2 border-b border-border px-5 py-4">
          <div className="min-w-0 text-sm font-semibold">{title}</div>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </aside>
    </div>
  );
}
