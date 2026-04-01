import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
  Activity, Download, ArrowUpDown, ArrowUp, ArrowDown,
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


const SC_PV_FACTOR = 13.57;

function getSupplyChainPV(sc: any, supplierCosts: number | null) {
  if (!sc?.indirectRisk?.expected_loss) return 0;
  const el = sc.indirectRisk.expected_loss;
  if (el.present_value != null) {
    const scaleFactor = supplierCosts ? supplierCosts / 1_000_000_000 : 1;
    return el.present_value * scaleFactor;
  }
  const scaleFactor = supplierCosts ? supplierCosts / 1_000_000 : 1;
  const pvPerUnit = (el.total_annual_loss || 0) * SC_PV_FACTOR;
  return pvPerUnit * scaleFactor;
}

function getCompanyMetrics(company: any) {
  const sc = company.supplyChainRisk;
  const supplyChainPV = getSupplyChainPV(sc, company.supplierCosts);

  const directExposurePV = company.totalGeoRiskPV || 0;
  const totalExposurePV = directExposurePV + supplyChainPV;

  const mgmtTotalScore = company.managementScore?.totalScore ?? null;
  const mgmtScorePct = mgmtTotalScore != null
    ? mgmtTotalScore / 100
    : null;

  const adjustedExposurePV = mgmtScorePct != null
    ? totalExposurePV * (1 - 0.7 * mgmtScorePct)
    : totalExposurePV;

  const ev = company.ev || 0;
  const valuationExposurePct = ev > 0 ? (adjustedExposurePV / ev) * 100 : null;

  return {
    directExposurePV,
    supplyChainPV,
    totalExposurePV,
    mgmtScorePct,
    adjustedExposurePV,
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

type SortKey = "companyName" | "totalAssets" | "ev" | "directPV" | "scPV" | "totalPV" | "mgmt" | "adjustedPV" | "valuation";
type SortDir = "asc" | "desc";

function getSortValue(company: any, metrics: ReturnType<typeof getCompanyMetrics>, key: SortKey): number | string {
  switch (key) {
    case "companyName": return company.companyName.toLowerCase();
    case "totalAssets": return company.totalAssetValue || 0;
    case "ev": return company.ev || 0;
    case "directPV": return metrics.directExposurePV;
    case "scPV": return metrics.supplyChainPV;
    case "totalPV": return metrics.totalExposurePV;
    case "mgmt": return metrics.mgmtScorePct ?? -1;
    case "adjustedPV": return metrics.adjustedExposurePV;
    case "valuation": return metrics.valuationExposurePct ?? -1;
    default: return 0;
  }
}

export default function Dashboard() {
  const { toast } = useToast();
  const [isinInput, setIsinInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFinancials, setShowFinancials] = useState(false);
  const [showIncomplete, setShowIncomplete] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");

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

  const filteredCompanies = useMemo(() => {
    let result = companies.filter((c: any) =>
      c.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.isin.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.sector || "").toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (!showFinancials) {
      result = result.filter((c: any) => (c.sector || "").toLowerCase() !== "financials");
    }

    if (!showIncomplete) {
      result = result.filter((c: any) => c.totalAssetValue > 0 && c.supplierCosts > 0 && c.ev > 0);
    }

    if (sortKey) {
      result = [...result].sort((a, b) => {
        const mA = getCompanyMetrics(a);
        const mB = getCompanyMetrics(b);
        const vA = getSortValue(a, mA, sortKey);
        const vB = getSortValue(b, mB, sortKey);
        if (typeof vA === "string" && typeof vB === "string") {
          return sortDir === "asc" ? vA.localeCompare(vB) : vB.localeCompare(vA);
        }
        const nA = vA as number;
        const nB = vB as number;
        return sortDir === "asc" ? nA - nB : nB - nA;
      });
    }

    return result;
  }, [companies, searchQuery, showFinancials, showIncomplete, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (sortDir === "desc") {
        setSortDir("asc");
      } else {
        setSortKey(null);
        setSortDir("desc");
      }
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortKey !== columnKey) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    if (sortDir === "desc") return <ArrowDown className="h-3 w-3 ml-1" />;
    return <ArrowUp className="h-3 w-3 ml-1" />;
  };


  const totalAssetValue = filteredCompanies.reduce((sum: number, c: any) => sum + (c.totalAssetValue || 0), 0);
  const totalGeoRiskPV = filteredCompanies.reduce((sum: number, c: any) => sum + (c.totalGeoRiskPV || 0), 0);
  const totalSCPV = filteredCompanies.reduce((sum: number, c: any) => {
    const m = getCompanyMetrics(c);
    return sum + m.supplyChainPV;
  }, 0);
  const totalSupplierCosts = filteredCompanies.reduce((sum: number, c: any) => sum + (c.supplierCosts || 0), 0);
  const totalExposure = totalGeoRiskPV + totalSCPV;
  const companiesWithRisks = filteredCompanies.filter((c: any) => c.hasGeoRisks || c.hasSupplyChainRisk);

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

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm font-medium text-muted-foreground">Companies</div>
            <div className="text-2xl font-bold mt-1" data-testid="text-company-count">{filteredCompanies.length}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {companiesWithRisks.length} assessed
            </div>
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
            <div className="text-sm font-medium text-muted-foreground">Direct Risk PV</div>
            <div className="text-2xl font-bold mt-1" data-testid="text-total-geo-risk">{formatCurrency(totalGeoRiskPV)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {totalExposure > 0 ? ((totalGeoRiskPV / totalExposure) * 100).toFixed(0) : 0}% of total
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm font-medium text-muted-foreground">Supply Chain Risk PV</div>
            <div className="text-2xl font-bold mt-1" data-testid="text-total-sc-risk">{formatCurrency(totalSCPV)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {totalExposure > 0 ? ((totalSCPV / totalExposure) * 100).toFixed(0) : 0}% of total
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm font-medium text-muted-foreground">Total Exposure PV</div>
            <div className="text-2xl font-bold mt-1 text-primary" data-testid="text-total-exposure">{formatCurrency(totalExposure)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm font-medium text-muted-foreground">Supplier Costs</div>
            <div className="text-2xl font-bold mt-1" data-testid="text-total-supplier-costs">{formatCurrency(totalSupplierCosts)}</div>
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

      <div className="flex items-center gap-4 flex-wrap">
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
        <div className="flex items-center gap-2">
          <Switch
            id="show-financials"
            checked={showFinancials}
            onCheckedChange={setShowFinancials}
            data-testid="toggle-financials"
          />
          <Label htmlFor="show-financials" className="text-sm cursor-pointer">
            Include Financials
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="show-incomplete"
            checked={showIncomplete}
            onCheckedChange={setShowIncomplete}
            data-testid="toggle-incomplete"
          />
          <Label htmlFor="show-incomplete" className="text-sm cursor-pointer">
            Include Incomplete
          </Label>
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
          <Table data-testid="table-companies" className="table-fixed w-full">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[18%]">
                  <button onClick={() => handleSort("companyName")} className="flex items-center hover:text-foreground" data-testid="sort-company">
                    Company <SortIcon columnKey="companyName" />
                  </button>
                </TableHead>
                <TableHead className="text-right w-[9%]">
                  <button onClick={() => handleSort("totalAssets")} className="flex items-center justify-end w-full hover:text-foreground" data-testid="sort-total-assets">
                    Total Assets <SortIcon columnKey="totalAssets" />
                  </button>
                </TableHead>
                <TableHead className="text-right w-[9%]">
                  <button onClick={() => handleSort("ev")} className="flex items-center justify-end w-full hover:text-foreground" data-testid="sort-ev">
                    EV <SortIcon columnKey="ev" />
                  </button>
                </TableHead>
                <TableHead className="text-right w-[9%]">
                  <button onClick={() => handleSort("directPV")} className="flex items-center justify-end w-full hover:text-foreground" data-testid="sort-direct-pv">
                    Direct PV <SortIcon columnKey="directPV" />
                  </button>
                </TableHead>
                <TableHead className="text-right w-[9%]">
                  <button onClick={() => handleSort("scPV")} className="flex items-center justify-end w-full hover:text-foreground" data-testid="sort-sc-pv">
                    SC PV <SortIcon columnKey="scPV" />
                  </button>
                </TableHead>
                <TableHead className="text-right w-[9%]">
                  <button onClick={() => handleSort("totalPV")} className="flex items-center justify-end w-full hover:text-foreground" data-testid="sort-total-pv">
                    Total PV <SortIcon columnKey="totalPV" />
                  </button>
                </TableHead>
                <TableHead className="text-right w-[7%]">
                  <button onClick={() => handleSort("mgmt")} className="flex items-center justify-end w-full hover:text-foreground" data-testid="sort-mgmt">
                    Mgmt <SortIcon columnKey="mgmt" />
                  </button>
                </TableHead>
                <TableHead className="text-right w-[10%]">
                  <button onClick={() => handleSort("adjustedPV")} className="flex items-center justify-end w-full hover:text-foreground" data-testid="sort-adjusted-pv">
                    Adjusted PV <SortIcon columnKey="adjustedPV" />
                  </button>
                </TableHead>
                <TableHead className="text-right w-[10%]">
                  <button onClick={() => handleSort("valuation")} className="flex items-center justify-end w-full hover:text-foreground" data-testid="sort-valuation">
                    Val. Exp. <SortIcon columnKey="valuation" />
                  </button>
                </TableHead>
                <TableHead className="w-[4%]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCompanies.map((company: any) => {
                const m = getCompanyMetrics(company);
                const hasRisks = company.hasGeoRisks || company.hasSupplyChainRisk;
                return (
                  <TableRow key={company.id} data-testid={`row-company-${company.id}`}>
                    <TableCell className="overflow-hidden">
                      <Link href={`/company/${company.id}`}>
                        <span className="font-semibold text-foreground hover:text-primary cursor-pointer text-sm truncate block" data-testid={`link-company-${company.id}`} title={company.companyName}>
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
                    <TableCell className="text-right font-mono" data-testid={`text-total-assets-${company.id}`}>
                      {company.totalAssetValue ? formatCurrency(company.totalAssetValue) : "---"}
                    </TableCell>
                    <TableCell className="text-right font-mono" data-testid={`text-ev-${company.id}`}>
                      {company.ev ? formatCurrency(company.ev) : "---"}
                    </TableCell>
                    <TableCell className="text-right font-mono" data-testid={`text-direct-exposure-${company.id}`}>
                      {company.hasGeoRisks ? formatCurrency(m.directExposurePV) : "---"}
                    </TableCell>
                    <TableCell className="text-right font-mono" data-testid={`text-sc-risk-${company.id}`}>
                      {company.hasSupplyChainRisk ? formatCurrency(m.supplyChainPV) : "---"}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold" data-testid={`text-total-exposure-${company.id}`}>
                      {hasRisks ? formatCurrency(m.totalExposurePV) : "---"}
                    </TableCell>
                    <TableCell className="text-right font-mono" data-testid={`text-mgmt-score-${company.id}`}>
                      {m.mgmtScorePct != null ? formatPct(m.mgmtScorePct * 100) : "---"}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold" data-testid={`text-adjusted-exposure-${company.id}`}>
                      {hasRisks ? formatCurrency(m.adjustedExposurePV) : "---"}
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
