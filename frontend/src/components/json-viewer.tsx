import { ChevronDown, ChevronRight, Copy, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { usePreferences } from "@/lib/preferences";
import { cn } from "@/lib/utils";

const SECRET_KEY = /(api[_-]?key|secret|password|authorization|access[_-]?token|bearer)/i;
const PII_KEY = /(email|phone|address)/i;

function maskString(v: string) {
  const at = v.indexOf("@");
  return at > 0 ? `${v[0]}•••${v.slice(at)}` : `${v.slice(0, 1)}•••`;
}

/** Secrets are always redacted; PII is masked unless the user reveals it. */
export function redact(value: unknown, revealPii: boolean, key = ""): unknown {
  if (key && SECRET_KEY.test(key)) return "[REDACTED]";
  if (key && PII_KEY.test(key) && !revealPii && typeof value === "string") return maskString(value);
  if (Array.isArray(value)) return value.map((v) => redact(v, revealPii));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v, revealPii, k)]));
  return value;
}

function Node({ name, value, depth }: { name?: string; value: unknown; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  const label = name !== undefined && <span className="text-json-key">"{name}"</span>;
  const isObj = value !== null && typeof value === "object";
  if (!isObj) {
    const cls = value === null || value === undefined ? "text-json-null" : typeof value === "string" ? (value === "[REDACTED]" ? "text-destructive" : "text-json-string") : typeof value === "number" ? "text-json-number" : "text-json-boolean";
    return (
      <div className="pl-4">
        {label}
        {label && ": "}
        <span className={cls}>{typeof value === "string" ? `"${value}"` : String(value ?? null)}</span>
      </div>
    );
  }
  const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v] as const) : Object.entries(value as object);
  const [o, c] = Array.isArray(value) ? ["[", "]"] : ["{", "}"];
  return (
    <div className={depth ? "pl-4" : ""}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="-ml-4 inline-flex items-center rounded hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        <span>
          {label}
          {label && ": "}
          {o}
          {!open && <span className="text-muted-foreground"> {entries.length} {Array.isArray(value) ? "items" : "keys"} {c}</span>}
        </span>
      </button>
      {open && (
        <>
          {entries.map(([k, v]) => (
            <Node key={k} name={Array.isArray(value) ? undefined : k} value={v} depth={depth + 1} />
          ))}
          <div>{c}</div>
        </>
      )}
    </div>
  );
}

export function JsonViewer({ data, title, className }: { data: unknown; title?: string; className?: string }) {
  const { prefs } = usePreferences();
  const [reveal, setReveal] = useState(!prefs.maskPii);
  const safe = redact(data, reveal);
  return (
    <div className={cn("overflow-hidden rounded-md border bg-surface", className)}>
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <span className="text-xs font-medium text-muted-foreground">{title ?? "JSON"}</span>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setReveal(!reveal)} aria-label={reveal ? "Mask personal data" : "Reveal personal data"}>
            {reveal ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
            {reveal ? "Mask PII" : "Reveal PII"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => {
              navigator.clipboard.writeText(JSON.stringify(safe, null, 2));
              toast.success("JSON copied (secrets redacted)");
            }}
          >
            <Copy className="size-3" /> Copy
          </Button>
        </div>
      </div>
      <div className="max-h-80 overflow-auto p-3 pl-6 font-mono text-xs leading-relaxed">
        <Node value={safe} depth={0} />
      </div>
    </div>
  );
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        navigator.clipboard.writeText(value);
        toast.success(`${label} copied`);
      }}
    >
      <Copy className="size-3.5" /> {label}
    </Button>
  );
}
