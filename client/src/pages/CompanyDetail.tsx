import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft, Play, Loader2, AlertTriangle, Droplets,
  Flame, Thermometer, CloudRain, Waves, Shield,
  Link2, Building2, MapPin,
} from "lucide-react";

function formatCurrency(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function RiskBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    low: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    high: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    critical: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[level] || colors.low}`}>{level}</span>;
}

function getRiskLevel(score: number, max: number = 5): string {
  const pct = score / max;
  if (pct < 0.25) return "low";
  if (pct < 0.5) return "medium";
  if (pct < 0.75) return "high";
  return "critical";
}

function directRiskPV(scRisk: any): number {
  return (scRisk.directRisk as any)?.expected_loss?.present_value_30yr || 0;
}

export default function CompanyDetail() {
  const { toast } = useToast();
  const [, params] = useRoute("/company/:id");
  const companyId = parseInt(params?.id || "0");

  const { data: company, isLoading } = useQuery<any>({
    queryKey: ["/api/companies", companyId],
    refetchInterval: 10000,
  });

  const calcMutation = useMutation({
    mutationFn: async (type: string) => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/calculate/${type}`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Calculation Started", description: data.statusMessage });
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">Company not found</h2>
        <Link href="/"><span className="text-primary cursor-pointer">Back to Dashboard</span></Link>
      </div>
    );
  }

  const mgmtScore = company.managementScore;
  const scRisk = company.supplyChainRisk;
  const hazardIcons: Record<string, any> = {
    hurricane: Waves,
    flood: Droplets,
    heatStress: Thermometer,
    drought: Flame,
    extremePrecip: CloudRain,
  };

  return (
    <div className="space-y-6" data-testid="company-detail-page">
      <div className="flex items-center gap-4">
        <Link href="/">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold" data-testid="text-company-name">{company.companyName}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-sm text-muted-foreground font-mono">{company.isin}</span>
            {company.sector && <Badge variant="secondary">{company.sector}</Badge>}
            {company.country && <span className="text-sm text-muted-foreground">{company.country}</span>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Total Asset Value</div>
            <div className="text-xl font-bold mt-1" data-testid="text-asset-value">
              {formatCurrency(company.totalAssetValue || 0)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">{company.assetCount} assets</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Geographic Risk (EAL)
            </div>
            <div className="text-xl font-bold mt-1" data-testid="text-total-geo-risk">
              {company.geoRisks?.length > 0 ? formatCurrency(company.totalGeoRisk) : "Not calculated"}
            </div>
            {company.totalGeoRiskPV > 0 && (
              <div className="text-xs text-muted-foreground mt-1">
                30yr PV: {formatCurrency(company.totalGeoRiskPV)}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <Link2 className="h-3 w-3" /> Supply Chain Climate Risk
            </div>
            <div className="text-xl font-bold mt-1" data-testid="text-sc-climate">
              {scRisk ? formatCurrency((scRisk.directExpectedLoss || 0) + (scRisk.indirectExpectedLoss || 0)) : "Not calculated"}
            </div>
            {scRisk && (
              <div className="text-xs text-muted-foreground mt-1">
                EAL (Direct + Indirect)
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <Shield className="h-3 w-3" /> Management Score
            </div>
            <div className="text-xl font-bold mt-1" data-testid="text-mgmt-score">
              {mgmtScore ? `${mgmtScore.totalScore}/${mgmtScore.totalPossible}` : "Not assessed"}
            </div>
            {mgmtScore && (
              <div className="text-xs text-muted-foreground mt-1">
                {((mgmtScore.totalScore / mgmtScore.totalPossible) * 100).toFixed(0)}% coverage
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button
          onClick={() => calcMutation.mutate("all")}
          disabled={calcMutation.isPending}
          data-testid="button-calc-all"
        >
          {calcMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
          Run Full Assessment
        </Button>
        <Button variant="outline" onClick={() => calcMutation.mutate("geographic")} disabled={calcMutation.isPending} data-testid="button-calc-geo">
          Geographic Risk
        </Button>
        <Button variant="outline" onClick={() => calcMutation.mutate("supply-chain")} disabled={calcMutation.isPending} data-testid="button-calc-sc">
          Supply Chain
        </Button>
        <Button variant="outline" onClick={() => calcMutation.mutate("management")} disabled={calcMutation.isPending} data-testid="button-calc-mgmt">
          Management Score
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Asset Risk Breakdown ({company.assets?.length || 0} assets)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {company.assets?.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-assets">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Facility</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Type</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Location</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Value</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">EAL</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Hurricane</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Flood</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Heat</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Drought</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Precip</th>
                  </tr>
                </thead>
                <tbody>
                  {company.assets.map((asset: any) => (
                    <tr key={asset.id} className="border-b border-border/50 hover:bg-muted/50" data-testid={`row-asset-${asset.id}`}>
                      <td className="py-2 px-3 font-medium">{asset.facilityName}</td>
                      <td className="py-2 px-3 text-muted-foreground">{asset.assetType}</td>
                      <td className="py-2 px-3 text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {asset.city}, {asset.country}
                      </td>
                      <td className="py-2 px-3 text-right">{formatCurrency(asset.estimatedValueUsd || 0)}</td>
                      {asset.geoRisk ? (
                        <>
                          <td className="py-2 px-3 text-right font-semibold">{formatCurrency(asset.geoRisk.expectedAnnualLoss || 0)}</td>
                          <td className="py-2 px-3 text-right">{formatCurrency(asset.geoRisk.hurricaneLoss || 0)}</td>
                          <td className="py-2 px-3 text-right">{formatCurrency(asset.geoRisk.floodLoss || 0)}</td>
                          <td className="py-2 px-3 text-right">{formatCurrency(asset.geoRisk.heatStressLoss || 0)}</td>
                          <td className="py-2 px-3 text-right">{formatCurrency(asset.geoRisk.droughtLoss || 0)}</td>
                          <td className="py-2 px-3 text-right">{formatCurrency(asset.geoRisk.extremePrecipLoss || 0)}</td>
                        </>
                      ) : (
                        <td colSpan={6} className="py-2 px-3 text-center text-muted-foreground">Not calculated</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-4">No assets found</p>
          )}
        </CardContent>
      </Card>

      {scRisk && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              Supply Chain Climate Risk Assessment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">
              {scRisk.countryName} / {scRisk.sectorName}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border">
                <CardContent className="pt-4 pb-3">
                  <div className="text-xs text-muted-foreground mb-1">Direct Climate Risk (EAL)</div>
                  <div className="text-lg font-bold" data-testid="text-sc-direct-eal">
                    {formatCurrency(scRisk.directExpectedLoss || 0)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {(scRisk.directExpectedLossPct || 0).toFixed(2)}% per $1M exposure
                  </div>
                </CardContent>
              </Card>
              <Card className="border">
                <CardContent className="pt-4 pb-3">
                  <div className="text-xs text-muted-foreground mb-1">Indirect Climate Risk (EAL)</div>
                  <div className="text-lg font-bold" data-testid="text-sc-indirect-eal">
                    {formatCurrency(scRisk.indirectExpectedLoss || 0)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {(scRisk.indirectExpectedLossPct || 0).toFixed(2)}% per $1M exposure
                  </div>
                </CardContent>
              </Card>
              <Card className="border">
                <CardContent className="pt-4 pb-3">
                  <div className="text-xs text-muted-foreground mb-1">Total Climate Risk (EAL)</div>
                  <div className="text-lg font-bold" data-testid="text-sc-total-eal">
                    {formatCurrency((scRisk.directExpectedLoss || 0) + (scRisk.indirectExpectedLoss || 0))}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {company.supplierCosts ? `Scaled to ${formatCurrency(company.supplierCosts)} supplier exposure` : "Per $1M exposure (no supplier costs data)"}
                  </div>
                </CardContent>
              </Card>
            </div>

            {(() => {
              const directRisk = scRisk.directRisk as any;
              const breakdown = directRisk?.expected_loss?.risk_breakdown;
              if (!breakdown) return null;

              const hazards = [
                { key: "hurricane", label: "Hurricane", icon: Waves },
                { key: "flood", label: "Flood", icon: Droplets },
                { key: "heat_stress", label: "Heat Stress", icon: Thermometer },
                { key: "drought", label: "Drought", icon: Flame },
                { key: "extreme_precipitation", label: "Extreme Precipitation", icon: CloudRain },
              ];

              const scaleFactor = company.supplierCosts ? company.supplierCosts / 1000000 : 1;
              const totalDirectLoss = (directRisk.expected_loss.total_annual_loss || 1) * scaleFactor;

              return (
                <div>
                  <h4 className="text-sm font-medium mb-3">Direct Climate Risk Breakdown by Hazard</h4>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {hazards.map(({ key, label, icon: Icon }) => {
                      const hazardData = breakdown[key];
                      const loss = (hazardData?.annual_loss || 0) * scaleFactor;
                      const pct = totalDirectLoss > 0 ? (loss / totalDirectLoss) * 100 : 0;
                      return (
                        <div key={key} className="text-center p-3 border rounded-md" data-testid={`sc-hazard-${key}`}>
                          <Icon className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                          <div className="text-xs text-muted-foreground mb-1">{label}</div>
                          <div className="text-sm font-bold">{formatCurrency(loss)}</div>
                          <Progress value={pct} className="h-1.5 mt-1" />
                          <div className="text-xs text-muted-foreground mt-1">{pct.toFixed(1)}% of direct</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {directRiskPV(scRisk) > 0 && (
              <div className="border rounded-md p-3">
                <div className="text-xs text-muted-foreground">30-Year Present Value (Direct)</div>
                <div className="text-lg font-bold" data-testid="text-sc-pv30">
                  {formatCurrency(directRiskPV(scRisk) * (company.supplierCosts ? company.supplierCosts / 1000000 : 1))}
                </div>
              </div>
            )}

            {(scRisk.topSuppliers as any[])?.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium mb-2">Top Upstream Suppliers (by Climate Risk Contribution)</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-suppliers">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Country</th>
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Sector</th>
                        <th className="text-right py-2 px-3 font-medium text-muted-foreground">I-O Coefficient</th>
                        <th className="text-right py-2 px-3 font-medium text-muted-foreground">Annual Loss ($)</th>
                        <th className="text-right py-2 px-3 font-medium text-muted-foreground">30yr PV ($)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(scRisk.topSuppliers as any[]).map((supplier: any, idx: number) => {
                        const sf = company.supplierCosts ? company.supplierCosts / 1000000 : 1;
                        return (
                          <tr key={idx} className="border-b border-border/50" data-testid={`row-supplier-${idx}`}>
                            <td className="py-2 px-3">{supplier.country_name}</td>
                            <td className="py-2 px-3 text-muted-foreground">{supplier.sector_name}</td>
                            <td className="py-2 px-3 text-right">{(supplier.coefficient * 100).toFixed(2)}%</td>
                            <td className="py-2 px-3 text-right font-mono">{formatCurrency((supplier.expected_loss_contribution?.annual_loss || 0) * sf)}</td>
                            <td className="py-2 px-3 text-right font-mono">{formatCurrency((supplier.expected_loss_contribution?.present_value_30yr || 0) * sf)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {mgmtScore && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Management Performance ({mgmtScore.totalScore}/{mgmtScore.totalPossible})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {mgmtScore.summary && (
              <p className="text-sm text-muted-foreground" data-testid="text-mgmt-summary">{mgmtScore.summary}</p>
            )}
            {mgmtScore.scores && Object.entries(mgmtScore.scores as Record<string, any[]>).map(([category, measures]) => {
              const categoryScore = measures.reduce((sum: number, m: any) => sum + (m.score || 0), 0);
              const categoryMax = measures.length;
              return (
                <div key={category} data-testid={`mgmt-category-${category.replace(/\s+/g, "-").toLowerCase()}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{category}</span>
                    <span className="text-sm text-muted-foreground">{categoryScore}/{categoryMax}</span>
                  </div>
                  <Progress value={categoryMax > 0 ? (categoryScore / categoryMax) * 100 : 0} className="h-2" />
                  <div className="mt-1 space-y-1">
                    {measures.map((m: any) => (
                      <div key={m.measureId} className="flex items-center gap-2 text-xs text-muted-foreground pl-2">
                        <span className={m.score > 0 ? "text-green-500" : "text-red-400"}>{m.score > 0 ? "✓" : "✗"}</span>
                        <span>{m.title}</span>
                        {m.confidence && <span className="ml-auto opacity-60">{m.confidence}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
