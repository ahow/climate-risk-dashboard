import { Link, useLocation } from "wouter";
import {
  Home, Briefcase, Layers, Settings, Activity, FileSpreadsheet, BookOpen,
  Moon, Sun, Menu, X, LogOut, ShieldCheck, Eye,
} from "lucide-react";
import { useState, useEffect } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";

type Role = "admin" | "viewer";

const viewerNav = [
  { path: "/", label: "Overview", icon: Home },
  { path: "/portfolio", label: "Portfolio Analysis", icon: Briefcase },
  { path: "/sector-analysis", label: "Sector Analysis", icon: Layers },
  { path: "/company-list", label: "Company List", icon: FileSpreadsheet },
  { path: "/information", label: "Methodology", icon: BookOpen },
];

const adminOnlyNav = [
  { path: "/monitor", label: "Calculations", icon: Activity },
  { path: "/admin", label: "Admin / Upload", icon: Settings },
];

export default function Layout({ children, role }: { children: React.ReactNode; role: Role }) {
  const [location, setLocation] = useLocation();
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem("theme");
    return stored ? stored === "dark" : true;
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  const navItems = role === "admin" ? [...viewerNav, ...adminOnlyNav] : viewerNav;

  const currentLabel =
    navItems.find(n =>
      n.path === "/" ? location === "/" : location.startsWith(n.path)
    )?.label ?? "Overview";

  const handleLogout = async () => {
    try {
      await apiRequest("POST", "/api/auth/logout");
    } finally {
      queryClient.clear();
      setLocation("/login");
    }
  };

  const NavLink = ({ path, label, icon: Icon }: typeof viewerNav[number]) => {
    const active = path === "/" ? location === "/" : location.startsWith(path);
    return (
      <Link href={path}>
        <span
          onClick={() => setSidebarOpen(false)}
          className={`flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-md cursor-pointer transition-colors ${
            active
              ? "bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-primary))]"
              : "text-[hsl(var(--sidebar-foreground))]/85 hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-foreground))]"
          }`}
          data-testid={`nav-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
        >
          <Icon className="h-4 w-4 flex-shrink-0" />
          {label}
        </span>
      </Link>
    );
  };

  return (
    <div className="min-h-screen flex bg-background text-foreground" data-testid="app-layout">
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-[220px] bg-[hsl(var(--sidebar))] border-r border-[hsl(var(--sidebar-border))] flex flex-col transition-transform ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="h-14 flex items-center gap-2 px-4 border-b border-[hsl(var(--sidebar-border))]">
          <svg viewBox="0 0 28 28" className="w-7 h-7" aria-label="Climate Risk logo">
            <rect width="28" height="28" rx="6" fill="hsl(var(--sidebar))" />
            <path d="M7 20 L11 14 L15 17 L19 9 L22 12" stroke="hsl(var(--sidebar-primary))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <circle cx="22" cy="12" r="2" fill="hsl(var(--sidebar-primary))" />
          </svg>
          <span className="text-[hsl(var(--sidebar-foreground))] font-semibold tracking-tight text-[15px]">
            Climate <span className="text-[hsl(var(--sidebar-primary))]">Risk</span>
          </span>
          <button
            className="ml-auto lg:hidden text-[hsl(var(--sidebar-foreground))]"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {viewerNav.map(n => <NavLink key={n.path} {...n} />)}
          {role === "admin" && (
            <>
              <div className="my-2 border-t border-[hsl(var(--sidebar-border))]" />
              {adminOnlyNav.map(n => <NavLink key={n.path} {...n} />)}
            </>
          )}
        </nav>
        <div className="px-3 py-3 border-t border-[hsl(var(--sidebar-border))] space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] text-[hsl(var(--sidebar-foreground))]/70" data-testid="text-role">
            {role === "admin" ? <ShieldCheck className="h-3.5 w-3.5 text-[hsl(var(--sidebar-primary))]" /> : <Eye className="h-3.5 w-3.5" />}
            <span>{role === "admin" ? "Admin" : "Viewer"}</span>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] text-[hsl(var(--sidebar-foreground))]/85 hover:bg-[hsl(var(--sidebar-accent))]"
            data-testid="button-logout"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
          <div className="text-[10px] text-[hsl(var(--sidebar-foreground))]/40 pt-1">Climate Risk · v2.6</div>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 flex items-center gap-3 px-4 border-b border-border bg-card sticky top-0 z-30">
          <button
            className="lg:hidden text-muted-foreground hover:text-foreground"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <span>Climate Risk</span>
            <span className="opacity-50">/</span>
            <span className="text-foreground font-medium" data-testid="text-breadcrumb">{currentLabel}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setDark(!dark)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] text-muted-foreground hover-elevate border border-border"
              data-testid="button-theme-toggle"
            >
              {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              {dark ? "Light" : "Dark"}
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-x-hidden">
          <div className="max-w-[1400px] mx-auto p-4 md:p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
