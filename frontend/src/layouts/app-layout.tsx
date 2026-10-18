import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  Check,
  ChevronsUpDown,
  Database,
  FlaskConical,
  LayoutDashboard,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  Sun,
  TestTubes,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { usePreferences } from "@/lib/preferences";
import { cn } from "@/lib/utils";

const NAV: { label: string; to: string; icon: LucideIcon }[] = [
  { label: "Overview", to: "/", icon: LayoutDashboard },
  { label: "Evaluations", to: "/evaluations", icon: FlaskConical },
  { label: "Traces", to: "/traces", icon: Activity },
  { label: "Datasets", to: "/datasets", icon: Database },
  { label: "Regression Tests", to: "/regressions", icon: TestTubes },
  { label: "Settings", to: "/settings", icon: Settings },
];

const WORKSPACES = ["Acme Support ", "Payments Copilot ", "Internal Sandbox "];

function Logo({ collapsed }: { collapsed?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
      <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <ShieldCheck className="size-4" aria-hidden />
      </span>
      {!collapsed && <span className="text-sm font-semibold tracking-tight">TraceGuard AI</span>}
    </Link>
  );
}

function NavList({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav aria-label="Workspace" className="space-y-0.5">
      {!collapsed && <p className="px-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Workspace</p>}
      {NAV.map((item) => {
        const active = item.to === "/" ? path === "/" : path.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none",
              active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
              collapsed && "justify-center",
            )}
          >
            <item.icon className={cn("size-4 shrink-0", active && "text-sidebar-primary")} aria-hidden />
            {!collapsed && item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function WorkspaceSelector({ collapsed }: { collapsed?: boolean }) {
  const { prefs, update } = usePreferences();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={cn("w-full justify-between bg-card", collapsed && "px-0 justify-center")} aria-label="Switch workspace">
          {collapsed ? <ChevronsUpDown className="size-3.5" /> : <><span className="truncate">{prefs.workspace}</span><ChevronsUpDown className="size-3.5 opacity-60" /></>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        {WORKSPACES.map((w) => (
          <DropdownMenuItem key={w} onSelect={() => { update({ workspace: w }); toast(`Switched to ${w}`, { description: "All workspaces share the same data in this preview." }); }}>
            <Check className={cn("size-4", w !== prefs.workspace && "opacity-0")} /> {w}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { prefs, update } = usePreferences();
  const isDark = prefs.theme === "dark";

  return (
    <div className="flex min-h-screen w-full">
      <aside className={cn("sticky top-0 hidden h-screen shrink-0 flex-col border-r bg-sidebar transition-[width] md:flex", collapsed ? "w-14" : "w-60")}>
        <div className={cn("flex h-14 items-center border-b px-3", collapsed && "justify-center")}>
          <Logo collapsed={collapsed} />
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-2">
          <WorkspaceSelector collapsed={collapsed} />
          <NavList collapsed={collapsed} />
        </div>
        <div className="border-t p-2">
          <Button variant="ghost" size="sm" className={cn("w-full text-muted-foreground", collapsed ? "justify-center px-0" : "justify-start")} onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {collapsed ? <PanelLeftOpen /> : <><PanelLeftClose /> Collapse</>}
          </Button>
        </div>
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 bg-sidebar p-3">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="mb-4"><Logo /></div>
          <div className="space-y-4">
            <WorkspaceSelector />
            <NavList onNavigate={() => setMobileOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur md:px-6">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Menu />
          </Button>
          <div className="md:hidden"><Logo /></div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => update({ theme: isDark ? "light" : "dark" })} aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}>
              {isDark ? <Sun /> : <Moon />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label="User menu" className="flex size-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                  DS
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>
                  <div className="text-sm">Workspace Admin</div>
                  <div className="text-xs font-normal text-muted-foreground">engineer@example.com</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link to="/settings">Settings</Link></DropdownMenuItem>
                <DropdownMenuItem onSelect={() => toast("Sign-out is not available yet")}>Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-6">{children}</main>
      </div>
    </div>
  );
}
