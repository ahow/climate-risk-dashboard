import { Link, useLocation } from "wouter";
import { BarChart3, Building2, Activity, Download, Moon, Sun, FileSpreadsheet, Info } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [dark, setDark] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("theme") === "dark";
    }
    return false;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  const navItems = [
    { path: "/", label: "Dashboard", icon: BarChart3 },
    { path: "/monitor", label: "Calculations", icon: Activity },
    { path: "/company-list", label: "Company List", icon: FileSpreadsheet },
    { path: "/information", label: "Information", icon: Info },
  ];

  return (
    <div className="min-h-screen bg-background" data-testid="app-layout">
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <Link href="/">
                <span className="text-xl font-semibold text-foreground cursor-pointer flex items-center gap-2" data-testid="link-home">
                  <BarChart3 className="h-6 w-6 text-primary" />
                  Climate Risk Dashboard
                </span>
              </Link>
              <nav className="flex items-center gap-1">
                {navItems.map(({ path, label, icon: Icon }) => (
                  <Link key={path} href={path}>
                    <span
                      className={`px-3 py-2 rounded-md text-sm font-medium cursor-pointer flex items-center gap-2 transition-colors ${
                        location === path
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent"
                      }`}
                      data-testid={`nav-${label.toLowerCase()}`}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </span>
                  </Link>
                ))}
              </nav>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  window.location.href = "/api/export/csv";
                }}
                data-testid="button-export-csv"
              >
                <Download className="h-4 w-4 mr-1" />
                Export CSV
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDark(!dark)}
                data-testid="button-theme-toggle"
              >
                {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </div>
  );
}
