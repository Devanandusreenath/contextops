import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  Brain,
  ChevronRight,
  FileCheck2,
  LayoutDashboard,
  Menu,
  Network,
  Search,
  Server,
  Settings,
  ScanSearch,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useActivity, useIntegrations } from "@/services/queries";
import { OFFLINE_FALLBACK } from "@/services/config";
import { ApiError } from "@/services/http";

const nav = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/investigations", label: "Investigations", icon: ScanSearch },
  { to: "/graph", label: "Graph Explorer", icon: Network },
  { to: "/memory", label: "Agent Memory", icon: Brain },
  { to: "/systems", label: "Systems & Teams", icon: Server },
  { to: "/evidence", label: "Evidence & Decisions", icon: FileCheck2 },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function Logo() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
      <line x1="5" y1="6" x2="12" y2="12" stroke="var(--primary)" strokeWidth="1.5" />
      <line x1="19" y1="7" x2="12" y2="12" stroke="var(--primary)" strokeWidth="1.5" />
      <line x1="12" y1="12" x2="12" y2="19" stroke="var(--violet)" strokeWidth="1.5" />
      <circle cx="5" cy="6" r="2.5" fill="var(--primary)" />
      <circle cx="19" cy="7" r="2.5" fill="var(--primary)" />
      <circle cx="12" cy="19" r="2.5" fill="var(--violet)" />
      <circle cx="12" cy="12" r="3" fill="var(--background)" stroke="var(--primary)" strokeWidth="1.8" />
    </svg>
  );
}

function useOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    const k = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", k);
    };
  }, [open, close]);
  return ref;
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <Logo />
        <span className="text-[15px] font-semibold tracking-tight">
          Context<span className="text-primary">Ops</span>
        </span>
      </div>
      <nav className="flex-1 space-y-0.5 p-2" aria-label="Main">
        {nav.map((n) => {
          const active = n.to === "/" ? path === "/" : path.startsWith(n.to);
          return (
            <Link
              key={n.to}
              to={n.to}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <n.icon className="h-4 w-4" />
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="space-y-3 border-t border-border p-3">
        <div className="rounded-md border border-border bg-surface p-2.5 text-xs">
          <p className="text-muted-foreground">Workspace</p>
          <p className="mt-0.5 font-medium">acme-demo</p>
          <p className="mt-1 text-warning">Synthetic data only</p>
        </div>
        <div className="flex items-center gap-2 px-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet/20 text-xs font-semibold text-violet">DS</div>
          <div className="text-xs">
            <p className="font-medium">Demo User</p>
            <p className="text-muted-foreground">SRE · on-call</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConnectionBadge() {
  const q = useIntegrations(true);
  if (OFFLINE_FALLBACK)
    return <span className="ml-auto rounded border border-warning/40 bg-warning/10 px-2 py-1 font-mono text-[10px] font-semibold tracking-wider text-warning md:ml-0">OFFLINE DEMO DATA</span>;
  let tone = "border-border bg-secondary text-muted-foreground";
  let label = "CHECKING BACKEND…";
  let title = "";
  if (q.isError) {
    const net = q.error instanceof ApiError && q.error.kind === "network";
    tone = "border-destructive/40 bg-destructive/10 text-destructive";
    label = net ? "BACKEND DISCONNECTED" : "BACKEND ERROR";
    title = q.error instanceof Error ? q.error.message : "";
  } else if (q.data) {
    if (!q.data.falkordb.connected) {
      tone = "border-warning/40 bg-warning/10 text-warning";
      label = "FALKORDB OFFLINE";
    } else {
      tone = "border-success/40 bg-success/10 text-success";
      label = `FALKORDB CONNECTED · ${(q.data.agent.effectiveMode ?? "no agent").toUpperCase()} MODE`;
    }
    title = `Graph ${q.data.falkordb.graph}: ${q.data.falkordb.nodeCount} nodes, ${q.data.falkordb.edgeCount} relationships. Data is synthetic.`;
  }
  return (
    <span title={title} className={cn("ml-auto hidden rounded border px-2 py-1 font-mono text-[10px] font-semibold tracking-wider sm:inline md:ml-0", tone)}>
      {label}
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [q, setQ] = useState("");
  const activity = useActivity();
  const notifRef = useOutside(notifOpen, () => setNotifOpen(false));
  const profileRef = useOutside(profileOpen, () => setProfileOpen(false));
  const current = nav.find((n) => (n.to === "/" ? path === "/" : path.startsWith(n.to))) ?? nav[0];

  return (
    <div className="flex min-h-screen w-full">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-border lg:block">
        <Sidebar />
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-background/80" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 border-r border-border">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur lg:px-6">
          <button className="lg:hidden" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="flex min-w-0 items-center gap-1.5 text-sm">
            <span className="hidden text-muted-foreground sm:inline">acme-demo</span>
            <ChevronRight className="hidden h-3.5 w-3.5 text-muted-foreground sm:inline" />
            <span className="truncate font-medium">{current.label}</span>
          </div>
          <form
            className="relative ml-auto hidden w-72 md:block"
            onSubmit={(e) => {
              e.preventDefault();
              navigate({ to: "/graph", search: { q: q || undefined } });
            }}
          >
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search entities in graph…"
              aria-label="Search entities"
              className="h-9 w-full rounded-md border border-input bg-surface pl-8 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </form>
          <ConnectionBadge />
          <div className="relative" ref={notifRef}>
            <button
              aria-label="Notifications"
              aria-expanded={notifOpen}
              onClick={() => setNotifOpen((v) => !v)}
              className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <Bell className="h-4 w-4" />
              {!!activity.data?.length && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" />}
            </button>
            {notifOpen && (
              <div className="panel absolute right-0 top-11 w-80 p-0">
                <p className="border-b border-border px-3 py-2 text-xs font-semibold">Recent agent activity</p>
                {activity.isError && <p className="px-3 py-3 text-xs text-destructive">Could not load activity.</p>}
                {activity.data?.length === 0 && <p className="px-3 py-3 text-xs text-muted-foreground">No investigation has run yet.</p>}
                {activity.data?.map((n) => (
                  <div key={n.id} className="flex gap-3 border-b border-border px-3 py-2.5 text-xs last:border-0">
                    <span className="flex-1"><span className="font-medium">{n.title}</span><span className="block text-muted-foreground">{n.detail}</span></span>
                    <span className="text-muted-foreground">{n.time}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="relative" ref={profileRef}>
            <button
              aria-label="Profile menu"
              aria-expanded={profileOpen}
              onClick={() => setProfileOpen((v) => !v)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-violet/20 text-xs font-semibold text-violet"
            >
              DS
            </button>
            {profileOpen && (
              <div className="panel absolute right-0 top-11 w-52 p-1 text-sm">
                <div className="px-3 py-2">
                  <p className="font-medium">Demo User</p>
                  <p className="text-xs text-muted-foreground">No real account · local demo</p>
                </div>
                <Link to="/settings" onClick={() => setProfileOpen(false)} className="block rounded px-3 py-2 hover:bg-secondary">
                  Settings
                </Link>
                <Link to="/investigations" onClick={() => setProfileOpen(false)} className="block rounded px-3 py-2 hover:bg-secondary">
                  My investigations
                </Link>
              </div>
            )}
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
