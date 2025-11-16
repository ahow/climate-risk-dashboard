import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import CompanyFileUpload from "./pages/CompanyFileUpload";
import CompanyDetails from "./pages/CompanyDetails";
import FileUpload from "./pages/FileUpload";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/upload-companies"} component={CompanyFileUpload} />
      <Route path={"/company/:isin"} component={CompanyDetails} />
      <Route path={"/upload"} component={FileUpload} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

