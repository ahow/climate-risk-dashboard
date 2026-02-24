import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Building2, Plus, Trash2, AlertTriangle, Shield, Link2,
  ChevronRight, Loader2, Search,
} from "lucide-react";

function formatCurrency(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export default function Dashboard() {
  const { toast } = useToast();
  const [isinInput, setIsinInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: companies = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/companies"],
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
            <div className="text-sm font-medium text-muted-foreground">Total Geographic EAL</div>
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
        <div className="grid gap-3">
          {filteredCompanies.map((company: any) => (
            <Card key={company.id} className="hover-elevate" data-testid={`card-company-${company.id}`}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="flex-1 min-w-0">
                      <Link href={`/company/${company.id}`}>
                        <span className="text-base font-semibold text-foreground hover:text-primary cursor-pointer flex items-center gap-2" data-testid={`link-company-${company.id}`}>
                          {company.companyName}
                          <ChevronRight className="h-4 w-4" />
                        </span>
                      </Link>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-muted-foreground font-mono" data-testid={`text-isin-${company.id}`}>
                          {company.isin}
                        </span>
                        {company.sector && (
                          <Badge variant="secondary" className="text-xs" data-testid={`badge-sector-${company.id}`}>
                            {company.sector}
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {company.assetCount} assets
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 text-sm">
                      <div className="text-center">
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Geo Risk
                        </div>
                        <div className="font-semibold" data-testid={`text-geo-risk-${company.id}`}>
                          {company.hasGeoRisks ? formatCurrency(company.totalGeoRisk) : "---"}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Link2 className="h-3 w-3" />
                          Supply Chain EAL
                        </div>
                        <div className="font-semibold" data-testid={`text-sc-risk-${company.id}`}>
                          {company.hasSupplyChainRisk
                            ? formatCurrency((company.supplyChainRisk?.directExpectedLoss || 0) + (company.supplyChainRisk?.indirectExpectedLoss || 0))
                            : "---"}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Shield className="h-3 w-3" />
                          Mgmt Score
                        </div>
                        <div className="font-semibold" data-testid={`text-mgmt-score-${company.id}`}>
                          {company.hasManagementScore
                            ? `${company.managementScore?.totalScore}/${company.managementScore?.totalPossible}`
                            : "---"}
                        </div>
                      </div>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Remove ${company.companyName}?`)) {
                        deleteCompanyMutation.mutate(company.id);
                      }
                    }}
                    className="text-muted-foreground hover:text-destructive ml-4"
                    data-testid={`button-delete-${company.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
