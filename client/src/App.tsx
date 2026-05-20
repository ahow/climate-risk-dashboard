import { Switch, Route, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { queryClient, getQueryFn } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import CompanyDetail from "@/pages/CompanyDetail";
import CalculationMonitor from "@/pages/CalculationMonitor";
import CompanyList from "@/pages/CompanyList";
import Information from "@/pages/Information";
import Admin from "@/pages/Admin";
import PortfolioAnalysis from "@/pages/PortfolioAnalysis";
import SectorAnalysis from "@/pages/SectorAnalysis";
import Login from "@/pages/Login";
import NotFound from "@/pages/not-found";

export type Me = { role: "admin" | "viewer" } | null;

function AdminRoute({ component: Component, role }: { component: React.ComponentType; role: Me extends null ? never : "admin" | "viewer" | null }) {
  if (role !== "admin") {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground" data-testid="text-forbidden">
        You don't have access to this page. Ask andy.howard@schroders.com for admin access.
      </div>
    );
  }
  return <Component />;
}

function Router() {
  const [location, setLocation] = useLocation();

  const { data, isLoading } = useQuery<Me>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn<Me>({ on401: "returnNull" }),
  });

  const role = (data?.role ?? null) as "admin" | "viewer" | null;

  useEffect(() => {
    if (isLoading) return;
    if (!role && location !== "/login") {
      setLocation("/login");
    } else if (role && location === "/login") {
      setLocation("/");
    }
  }, [role, isLoading, location, setLocation]);

  if (location === "/login") return <Login />;
  if (isLoading || !role) return null;

  return (
    <Layout role={role}>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/portfolio" component={PortfolioAnalysis} />
        <Route path="/sector-analysis" component={SectorAnalysis} />
        <Route path="/admin">{() => <AdminRoute component={Admin} role={role} />}</Route>
        <Route path="/monitor">{() => <AdminRoute component={CalculationMonitor} role={role} />}</Route>
        <Route path="/company/:id" component={CompanyDetail} />
        <Route path="/company-list" component={CompanyList} />
        <Route path="/information" component={Information} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
