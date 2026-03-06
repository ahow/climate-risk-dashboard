import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Building2, Plus, Trash2, AlertTriangle, Shield, Link2,
  ChevronRight, Loader2, Search, Pause, Play, Square,
  Activity,
} from "lucide-react";

function formatCurrency(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatPct(value: number): string {
  if (value === 0) return "0%";
  if (value >= 10) return `${value.toFixed(0)}%`;
  if (value >= 1) return `${value.toFixed(1)}%`;
  return `${value.toFixed(2)}%`;
}

function getCompanyMetrics(company: any) {
  const directExposure = company.totalGeoRisk || 0;

  const sc = company.supplyChainRisk;
  const scScaleFactor = company.supplierCosts ? company.supplierCosts / 1000000 : 1;
  const supplyChainEAL = (sc?.indirectRisk?.expected_loss?.total_annual_loss || 0) * scScaleFactor;
  const totalExposure = directExposure + supplyChainEAL;

  const mgmtTotalScore = company.managementScore?.totalScore ?? null;
  const mgmtScorePct = mgmtTotalScore != null
    ? mgmtTotalScore / 100
    : null;

  const adjustedExposure = mgmtScorePct != null
    ? totalExposure * (1 - 0.7 * mgmtScorePct)
    : totalExposure;

  const directExposurePV = company.totalGeoRiskPV || 0;
  const scPV = (sc?.indirectRisk?.expected_loss?.present_value_30yr || 0) * scScaleFactor;
  const totalExposurePV = directExposurePV + scPV;
  const adjustedExposurePV = mgmtScorePct != null
    ? totalExposurePV * (1 - 0.7 * mgmtScorePct)
    : totalExposurePV;

  const ev = company.ev || 0;
  const valuationExposurePct = ev > 0 ? (adjustedExposure / ev) * 100 : null;

  return {
    directExposure,
    supplyChainEAL,
    totalExposure,
    mgmtScorePct,
    adjustedExposure,
    valuationExposurePct,
  };
}

const typeLabels: Record<string, string> = {
  geographic_risk: "Geographic Risk",
  supply_chain_risk: "Supply Chain Risk",
  management_score: "Management Score",
  full_assessment: "Full Assessment",
  bulk_processing: "Bulk Processing",
};

function formatDuration(start: string, end?: string | null): string {
  const startTime = new Date(start).getTime();
  const endTime = end ? new Date(end).getTime() : Date.now();
  const diff = Math.floor((endTime - startTime) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`;
  return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
}

export default function Dashboard() {
  const { toast } = useToast();
  const [isinInput, setIsinInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: companies = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/companies"],
  });

  const { data: operations = [] } = useQuery<any[]>({
    queryKey: ["/api/operations"],
    refetchInterval: 3000,
  });

  const activeOps = operations.filter((op: any) =>
    ["running", "pending", "paused"].includes(op.status)
  );

  const pauseMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/operations/${id}/pause`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/operations"] });
      toast({ title: "Operation Paused" });
    },
    onError: () => {
      toast({ title: "Failed to pause operation", variant: "destructive" });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/operations/${id}/resume`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/operations"] });
      toast({ title: "Operation Resumed" });
    },
    onError: () => {
      toast({ title: "Failed to resume operation", variant: "destructive" });
    },
  });

  const stopMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/operations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/operations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({ title: "Operation Stopped" });
    },
    onError: () => {
      toast({ title: "Failed to stop operation", variant: "destructive" });
    },
  });

  const addCompanyMutation = useMutation({
    mutationFn: async (isin: string) => {
      const res = await apiRequest("POST", "/api/companies", { isin: isin.toUpperCase() });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      setIsinInput("");
      toast({ title: "Company Added", description: `${data.companyName} has been added successfully.` });
    },
    onError: (error: any) => {
      const msg = error.message || "Failed to add company";
      const cleanMsg = msg.includes(":") ? msg.split(":").slice(1).join(":").trim() : msg;
      let description = cleanMsg;
      try {
        const parsed = JSON.parse(cleanMsg);
        description = parsed.error || cleanMsg;
      } catch {}
      toast({ title: "Error", description, variant: "destructive" });
    },
  });

  const deleteCompanyMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/companies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({ title: "Company Removed" });
    },
  });

  const filteredCompanies = companies.filter((c: any) =>
    c.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.isin.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.sector || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalAssetValue = companies.reduce((sum: number, c: any) => sum + (c.totalAssetValue || 0), 0);
  const totalGeoRisk = companies.reduce((sum: number, c: any) => sum + (c.totalGeoRisk || 0), 0);
  const companiesWithRisks = companies.filter((c: any) => c.hasGeoRisks || c.hasSupplyChainRisk);

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" data-testid="text-page-title">
            Climate Risk Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Quantify and visualize climate-related financial risks for publicly traded companies
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm font-medium text-muted-foreground">Companies</div>
            <div className="text-2xl font-bold mt-1" data-testid="text-company-count">{companies.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm font-medium text-muted-foreground">Total Asset Value</div>
            <div className="text-2xl font-bold mt-1" data-testid="text-total-assets">{formatCurrency(totalAssetValue)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm font-medium text-muted-foreground">Total Direct Exposure</div>
            <div className="text-2xl font-bold mt-1" data-testid="text-total-geo-risk">{formatCurrency(totalGeoRisk)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm font-medium text-muted-foreground">Assessed</div>
            <div className="text-2xl font-bold mt-1" data-testid="text-assessed-count">
              {companiesWithRisks.length}/{companies.length}
            </div>
          </CardContent>
        </Card>
      </div>

      {activeOps.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Active Operations ({activeOps.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeOps.map((op: any) => {
              const progress = op.totalItems > 0 ? (op.processedItems / op.totalItems) * 100 : 0;
              return (
                <div key={op.id} className="space-y-2" data-testid={`active-op-${op.id}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant={op.status === "paused" ? "secondary" : "default"} className="text-xs">
                        {op.status === "paused" ? "Paused" : op.status === "running" ? "Running" : "Pending"}
                      </Badge>
                      <span className="text-sm font-medium">{typeLabels[op.type] || op.type}</span>
                      {op.companyName && (
                        <span className="text-sm text-muted-foreground">— {op.companyName}</span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {op.startedAt && formatDuration(op.startedAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {op.status === "running" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => pauseMutation.mutate(op.id)}
                          disabled={pauseMutation.isPending}
                          data-testid={`button-pause-${op.id}`}
                        >
                          <Pause className="h-3 w-3 mr-1" />
                          Pause
                        </Button>
                      )}
                      {op.status === "paused" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => resumeMutation.mutate(op.id)}
                          disabled={resumeMutation.isPending}
                          data-testid={`button-resume-${op.id}`}
                        >
                          <Play className="h-3 w-3 mr-1" />
                          Resume
                        </Button>
                      )}
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          if (confirm("Stop this operation? Progress so far will be kept.")) {
                            stopMutation.mutate(op.id);
                          }
                        }}
                        data-testid={`button-stop-${op.id}`}
                      >
                        <Square className="h-3 w-3 mr-1" />
                        Stop
                      </Button>
                    </div>
                  </div>
                  {op.totalItems > 0 && (
                    <>
                      <Progress value={progress} className="h-2" />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{op.statusMessage}</span>
                        <span>{op.processedItems}/{op.totalItems} ({progress.toFixed(0)}%)</span>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add Company by ISIN</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (isinInput.trim().length === 12) {
                addCompanyMutation.mutate(isinInput.trim());
              }
            }}
            data-testid="form-add-company"
          >
            <Input
              placeholder="Enter 12-character ISIN (e.g., US88160R1014)"
              value={isinInput}
              onChange={(e) => setIsinInput(e.target.value.toUpperCase())}
              maxLength={12}
              className="max-w-md"
              data-testid="input-isin"
            />
            <Button
              type="submit"
              disabled={isinInput.length !== 12 || addCompanyMutation.isPending}
              data-testid="button-add-company"
            >
              {addCompanyMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Plus className="h-4 w-4 mr-1" />
              )}
              Add Company
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search companies..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search"
          />
        </div>
        <span className="text-sm text-muted-foreground">
          {filteredCompanies.length} companies
        </span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12" data-testid="loading-state">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredCompanies.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center" data-testid="empty-state">
            <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No Companies Added</h3>
            <p className="text-muted-foreground">
              Add a company using its ISIN code to start analyzing climate risks.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table data-testid="table-companies">
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px]">Company</TableHead>
                <TableHead className="text-right">Direct Exposure</TableHead>
                <TableHead className="text-right">Supply Chain</TableHead>
                <TableHead className="text-right">Total Exposure</TableHead>
                <TableHead className="text-right">Mgmt Score</TableHead>
                <TableHead className="text-right">Adjusted Exposure</TableHead>
                <TableHead className="text-right">Valuation Exposure</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCompanies.map((company: any) => {
                const m = getCompanyMetrics(company);
                const hasRisks = company.hasGeoRisks || company.hasSupplyChainRisk;
                return (
                  <TableRow key={company.id} data-testid={`row-company-${company.id}`}>
                    <TableCell>
                      <Link href={`/company/${company.id}`}>
                        <span className="font-semibold text-foreground hover:text-primary cursor-pointer" data-testid={`link-company-${company.id}`}>
                          {company.companyName}
                        </span>
                      </Link>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground font-mono" data-testid={`text-isin-${company.id}`}>
                          {company.isin}
                        </span>
                        {company.sector && (
                          <Badge variant="secondary" className="text-xs" data-testid={`badge-sector-${company.id}`}>
                            {company.sector}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono" data-testid={`text-direct-exposure-${company.id}`}>
                      {company.hasGeoRisks ? formatCurrency(m.directExposure) : "---"}
                    </TableCell>
                    <TableCell className="text-right font-mono" data-testid={`text-sc-risk-${company.id}`}>
                      {company.hasSupplyChainRisk ? formatCurrency(m.supplyChainEAL) : "---"}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold" data-testid={`text-total-exposure-${company.id}`}>
                      {hasRisks ? formatCurrency(m.totalExposure) : "---"}
                    </TableCell>
                    <TableCell className="text-right font-mono" data-testid={`text-mgmt-score-${company.id}`}>
                      {m.mgmtScorePct != null ? formatPct(m.mgmtScorePct * 100) : "---"}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold" data-testid={`text-adjusted-exposure-${company.id}`}>
                      {hasRisks ? formatCurrency(m.adjustedExposure) : "---"}
                    </TableCell>
                    <TableCell className="text-right font-mono" data-testid={`text-valuation-exposure-${company.id}`}>
                      {m.valuationExposurePct != null ? formatPct(m.valuationExposurePct) : "---"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm(`Remove ${company.companyName}?`)) {
                            deleteCompanyMutation.mutate(company.id);
                          }
                        }}
                        className="text-muted-foreground hover:text-destructive h-8 w-8"
                        data-testid={`button-delete-${company.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
