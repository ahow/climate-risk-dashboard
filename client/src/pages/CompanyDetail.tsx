import { Fragment, useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft, Play, Loader2, AlertTriangle, Shield,
  Link2, Building2, MapPin, ChevronDown, ChevronRight,
  Globe,
} from "lucide-react";
import { WORLD_PATHS } from "@/lib/worldMapPaths";

function formatCurrency(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function AssetMap({ assets }: { assets: any[] }) {
  const [hoveredAsset, setHoveredAsset] = useState<number | null>(null);

  const validAssets = useMemo(() =>
    assets.filter((a: any) => a.latitude != null && a.longitude != null),
    [assets]
  );

  const maxValue = useMemo(() =>
    Math.max(...validAssets.map((a: any) => a.estimatedValueUsd || 1), 1),
    [validAssets]
  );

  const W = 800;
  const H = 400;
  const PAD = 10;

  function project(lon: number, lat: number): [number, number] {
    const x = PAD + ((lon + 180) / 360) * (W - 2 * PAD);
    const y = PAD + ((90 - lat) / 180) * (H - 2 * PAD);
    return [x, y];
  }

  function dotRadius(value: number): number {
    const minR = 4;
    const maxR = 20;
    const ratio = Math.sqrt((value || 1) / maxValue);
    return minR + ratio * (maxR - minR);
  }

  return (
    <div className="relative" data-testid="asset-map">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto rounded-lg bg-sky-50 dark:bg-slate-800/50"
        style={{ maxHeight: "350px" }}
      >
        <rect width={W} height={H} rx="8" className="fill-sky-50 dark:fill-slate-800/50" />

        {WORLD_PATHS.map((d, i) => (
          <path
            key={i}
            d={d}
            className="fill-slate-200 dark:fill-slate-600 stroke-slate-300 dark:stroke-slate-500"
            strokeWidth="0.5"
          />
        ))}

        {validAssets.map((asset: any, idx: number) => {
          const [cx, cy] = project(asset.longitude, asset.latitude);
          const r = dotRadius(asset.estimatedValueUsd || 0);
          const isHovered = hoveredAsset === asset.id;
          const eal = asset.geoRisk?.expectedAnnualLoss || 0;
          const hasRisk = asset.geoRisk && asset.geoRisk.modelVersion !== "FAILED";
          const riskPct = hasRisk && (asset.estimatedValueUsd || 0) > 0
            ? (eal / asset.estimatedValueUsd * 100)
            : 0;
          const fillColor = !hasRisk ? "rgb(148,163,184)"
            : riskPct > 1 ? "rgb(239,68,68)"
            : riskPct > 0.3 ? "rgb(245,158,11)"
            : "rgb(34,197,94)";

          return (
            <g
              key={asset.id || idx}
              onMouseEnter={() => setHoveredAsset(asset.id)}
              onMouseLeave={() => setHoveredAsset(null)}
              className="cursor-pointer"
              data-testid={`map-dot-${asset.id}`}
            >
              <circle
                cx={cx}
                cy={cy}
                r={isHovered ? r * 1.3 : r}
                fill={fillColor}
                fillOpacity={isHovered ? 0.9 : 0.6}
                stroke={isHovered ? "white" : fillColor}
                strokeWidth={isHovered ? 2 : 1}
                strokeOpacity={0.8}
                style={{ transition: "all 0.15s ease" }}
              />
              {isHovered && (
                <g>
                  <rect
                    x={cx + r + 8}
                    y={cy - 32}
                    width={Math.max(160, (asset.facilityName || "").length * 7 + 20)}
                    height={52}
                    rx={6}
                    className="fill-slate-900 dark:fill-slate-100"
                    fillOpacity={0.92}
                  />
                  <text x={cx + r + 16} y={cy - 14} className="fill-white dark:fill-slate-900" fontSize="11" fontWeight="600">
                    {asset.facilityName || "Unknown"}
                  </text>
                  <text x={cx + r + 16} y={cy} className="fill-slate-300 dark:fill-slate-500" fontSize="10">
                    Value: {formatCurrency(asset.estimatedValueUsd || 0)}
                  </text>
                  <text x={cx + r + 16} y={cy + 14} className="fill-slate-300 dark:fill-slate-500" fontSize="10">
                    {hasRisk ? `EAL: ${formatCurrency(eal)}` : "Risk: Not calculated"}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>

      <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground px-1">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-green-500"></span> Low risk</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-amber-500"></span> Medium risk</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-red-500"></span> High risk</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-slate-400"></span> Not assessed</span>
        </div>
        <span>Dot size = estimated asset value</span>
      </div>
    </div>
  );
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

function indirectRiskPV(scRisk: any): number {
  return (scRisk.indirectRisk as any)?.expected_loss?.present_value || 0;
}

function CollapsibleSection({
  icon: Icon,
  title,
  summary,
  defaultOpen = false,
  alwaysVisibleContent,
  children,
  testId,
}: {
  icon: any;
  title: string;
  summary: string;
  defaultOpen?: boolean;
  alwaysVisibleContent?: any;
  children: any;
  testId: string;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <Card data-testid={testId}>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setIsOpen(!isOpen)}
        data-testid={`${testId}-header`}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Icon className="h-4 w-4" />
            {title}
          </CardTitle>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{summary}</span>
            {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>
      </CardHeader>
      {alwaysVisibleContent && <CardContent className="pt-0">{alwaysVisibleContent}</CardContent>}
      {isOpen && <CardContent>{children}</CardContent>}
    </Card>
  );
}

function ManagementSummaryRow({ scores }: { scores: Record<string, any[]> }) {
  const categories = Object.entries(scores);
  return (
    <div className="flex gap-1.5 overflow-x-auto" data-testid="mgmt-summary-row">
      {categories.map(([category, measures]) => {
        const categoryScore = measures.reduce((sum: number, m: any) => sum + (m.score || 0), 0);
        const categoryMax = measures.length;
        const pct = categoryMax > 0 ? (categoryScore / categoryMax) * 100 : 0;
        const color = pct >= 75 ? "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300"
          : pct >= 40 ? "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"
          : "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300";
        return (
          <div
            key={category}
            className={`rounded-md px-2 py-1.5 text-xs font-medium flex-1 min-w-0 ${color}`}
            data-testid={`mgmt-badge-${category.replace(/\s+/g, "-").toLowerCase()}`}
          >
            <div className="truncate">{category}</div>
            <div className="text-sm font-semibold mt-0.5">{categoryScore}/{categoryMax}</div>
          </div>
        );
      })}
    </div>
  );
}

function ManagementSection({ mgmtScore }: { mgmtScore: any }) {
  const scorePct = mgmtScore.totalScore != null ? mgmtScore.totalScore.toString() : "0";

  return (
    <CollapsibleSection
      icon={Shield}
      title={`Management Performance (${mgmtScore.totalScore}%)`}
      summary={`${scorePct}%`}
      testId="section-management"
      alwaysVisibleContent={
        mgmtScore.scores ? <ManagementSummaryRow scores={mgmtScore.scores} /> : null
      }
    >
      <div className="space-y-4">
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
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-xs border-collapse" data-testid={`mgmt-table-${category.replace(/\s+/g, "-").toLowerCase()}`}>
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left font-medium text-muted-foreground py-1.5 px-2 w-[30%]">Question</th>
                      <th className="text-left font-medium text-muted-foreground py-1.5 px-2 w-[35%]">Verbatim Quote</th>
                      <th className="text-left font-medium text-muted-foreground py-1.5 px-2 w-[20%]">Source</th>
                      <th className="text-center font-medium text-muted-foreground py-1.5 px-2 w-[8%]">Confidence</th>
                      <th className="text-center font-medium text-muted-foreground py-1.5 px-2 w-[7%]">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {measures.map((m: any, mi: number) => {
                      const firstQuote = m.quotes && m.quotes.length > 0 ? m.quotes[0] : null;
                      const extraQuotes = m.quotes && m.quotes.length > 1 ? m.quotes.slice(1) : [];
                      return (
                        <Fragment key={m.measureId}>
                          <tr
                            className={`border-b border-border/50 align-top hover:bg-muted/30 ${mi % 2 === 0 ? "" : "bg-muted/10"}`}
                            data-testid={`mgmt-measure-${m.measureId}`}
                          >
                            <td className="py-2 px-2">
                              <div className="font-medium text-foreground/90 mb-0.5">{m.title}</div>
                              <div className="text-muted-foreground leading-relaxed">{m.question || `Does the company demonstrate ${m.title.toLowerCase()}?`}</div>
                            </td>
                            <td className="py-2 px-2">
                              {firstQuote ? (
                                <div>
                                  <span className="italic text-muted-foreground leading-relaxed">"{firstQuote.text}"</span>
                                  {extraQuotes.length > 0 && (
                                    <div className="mt-1.5 text-[10px] text-muted-foreground/60">+{extraQuotes.length} more quote{extraQuotes.length > 1 ? "s" : ""}</div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground/50 italic">No quote available</span>
                              )}
                            </td>
                            <td className="py-2 px-2 text-muted-foreground">
                              {firstQuote ? (
                                <span>{firstQuote.source}{firstQuote.page ? ` (p. ${firstQuote.page})` : ""}</span>
                              ) : (
                                <span className="text-muted-foreground/50">—</span>
                              )}
                            </td>
                            <td className="py-2 px-2 text-center">
                              {m.confidence && (
                                <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded ${
                                  m.confidence === "High"
                                    ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                                    : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                                }`}>
                                  {m.confidence}
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-2 text-center">
                              <span className={`font-semibold ${m.score > 0 ? "text-green-600 dark:text-green-400" : "text-red-400 dark:text-red-400"}`}>
                                {m.score > 0 ? "✓" : "✗"}
                              </span>
                            </td>
                          </tr>
                          {extraQuotes.map((q: any, qi: number) => (
                            <tr key={`${m.measureId}-xq-${qi}`} className={`border-b border-border/30 align-top ${mi % 2 === 0 ? "" : "bg-muted/10"}`} data-testid={`mgmt-quote-${m.measureId}-${qi + 1}`}>
                              <td className="py-1 px-2"></td>
                              <td className="py-1 px-2">
                                <span className="italic text-muted-foreground/80 leading-relaxed text-[11px]">"{q.text}"</span>
                              </td>
                              <td className="py-1 px-2 text-muted-foreground/80 text-[11px]">
                                {q.source}{q.page ? ` (p. ${q.page})` : ""}
                              </td>
                              <td className="py-1 px-2"></td>
                              <td className="py-1 px-2"></td>
                            </tr>
                          ))}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </CollapsibleSection>
  );
}

const SC_PV_FACTOR = 13.57;

function getSaturationScale(supplierCosts: number, ev: number, base: number): number {
  const linear = supplierCosts / base;
  if (ev > 0 && supplierCosts / ev > 1) {
    const costToEV = supplierCosts / ev;
    return (ev / base) * (1 - Math.exp(-costToEV));
  }
  return linear;
}

function SupplyChainSummary({ scRisk, company }: { scRisk: any; company: any }) {
  const indirectRisk = scRisk.indirectRisk as any;
  const tiers = (scRisk.supplyChainTiers || []) as any[];

  const el = indirectRisk?.expected_loss;
  const hasNewAPI = el?.present_value != null;
  const base = hasNewAPI ? 1_000_000_000 : 1_000_000;
  const effectiveScale = company.supplierCosts ? getSaturationScale(company.supplierCosts, company.ev || 0, base) : 1;
  const rawPV = hasNewAPI ? el.present_value : (el?.total_annual_loss || 0) * SC_PV_FACTOR;
  const indirectPV = rawPV * effectiveScale;

  const hazardBreakdown = indirectRisk?.expected_loss?.risk_breakdown;
  const hazardLabels: Record<string, string> = {
    flood: "Flood",
    drought: "Drought",
    heat_stress: "Heat Stress",
    hurricane: "Hurricane",
    extreme_precipitation: "Extreme Precip.",
  };

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        {scRisk.countryName} / {scRisk.sectorName}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border">
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground mb-1">Indirect Supply Chain Risk (PV)</div>
            <div className="text-lg font-bold" data-testid="text-sc-indirect-pv">
              {formatCurrency(indirectPV)}
            </div>
            <div className="text-xs text-muted-foreground">
              Present value of expected loss
            </div>
          </CardContent>
        </Card>
        <Card className="border">
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground mb-1">Supplier Costs / Scaling</div>
            <div className="text-lg font-bold" data-testid="text-sc-supplier-costs">
              {company.supplierCosts ? formatCurrency(company.supplierCosts) : "N/A"}
            </div>
            <div className="text-xs text-muted-foreground">
              {company.supplierCosts ? `Scale factor: ${effectiveScale.toFixed(6)}x (per $1B)` : "Per $1B exposure (no supplier costs data)"}
            </div>
          </CardContent>
        </Card>
      </div>

      {hazardBreakdown && (
        <div>
          <h4 className="text-sm font-medium mb-3">PV by Hazard</h4>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {Object.entries(hazardLabels).map(([key, label]) => {
              const hb = hazardBreakdown[key];
              const hazardRawPV = hasNewAPI ? (hb?.present_value || 0) : (hb?.annual_loss || 0) * SC_PV_FACTOR;
              const hazardPV = hazardRawPV * effectiveScale;
              return (
                <div key={key} className="text-center p-3 border rounded-md" data-testid={`sc-hazard-${key}`}>
                  <div className="text-xs text-muted-foreground mb-1">{label}</div>
                  <div className="text-sm font-bold">{formatCurrency(hazardPV)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tiers.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-3">Supply Chain Tiers</h4>
          <div className="space-y-2">
            {tiers.map((tier: any, index: number) => {
              const tierEl = tier.expected_loss;
              const tierRawPV = hasNewAPI ? (tierEl?.present_value || 0) : (tierEl?.total_annual_loss || 0) * SC_PV_FACTOR;
              const tierPV = tierRawPV * effectiveScale;
              return (
                <div key={index} className="flex items-center justify-between p-3 border rounded-md" data-testid={`sc-tier-${index}`}>
                  <div>
                    <div className="text-sm font-medium">{tier.tier_name || `Tier ${index + 1}`}</div>
                    {tier.description && (
                      <div className="text-xs text-muted-foreground">{tier.description}</div>
                    )}
                  </div>
                  <div className="text-sm font-bold">{formatCurrency(tierPV)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
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

  const totalGeoPV = company.totalGeoRiskPV > 0 ? formatCurrency(company.totalGeoRiskPV) : "Not calculated";
  const scEl = scRisk?.indirectRisk?.expected_loss;
  const scHasNewAPI = scEl?.present_value != null;
  const scBase = scHasNewAPI ? 1_000_000_000 : 1_000_000;
  const scScaleFactor = company.supplierCosts
    ? getSaturationScale(company.supplierCosts, company.ev || 0, scBase)
    : 1;
  const scRawPV = scHasNewAPI ? scEl.present_value : (scEl?.total_annual_loss || 0) * SC_PV_FACTOR;
  const scIndirectPV = scRisk ? scRawPV * scScaleFactor : 0;
  const totalScPV = scRisk ? formatCurrency(scIndirectPV) : "Not calculated";
  const mgmtSummaryScore = mgmtScore ? `${mgmtScore.totalScore}%` : "Not assessed";

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

      {company.warnings && company.warnings.length > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-sm" data-testid="data-quality-warnings">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Data quality: {company.warnings.join(' · ')}</span>
        </div>
      )}

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
              <AlertTriangle className="h-3 w-3" /> Geographic Risk (PV)
            </div>
            <div className="text-xl font-bold mt-1" data-testid="text-total-geo-risk">
              {totalGeoPV}
            </div>
            {company.totalGeoRisk > 0 && (
              <div className="text-xs text-muted-foreground mt-1">
                EAL: {formatCurrency(company.totalGeoRisk)}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <Link2 className="h-3 w-3" /> Supply Chain Risk (PV)
            </div>
            <div className="text-xl font-bold mt-1" data-testid="text-sc-climate">
              {totalScPV}
            </div>
            {scRisk && (
              <div className="text-xs text-muted-foreground mt-1">
                Indirect risk present value
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
              {mgmtSummaryScore}
            </div>
            {mgmtScore && (
              <div className="text-xs text-muted-foreground mt-1">
                {mgmtScore.totalScore}% coverage
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

      <CollapsibleSection
        icon={Building2}
        title={`Asset Risk Breakdown (${company.assets?.length || 0} assets)`}
        summary={`PV: ${totalGeoPV}`}
        testId="section-assets"
        alwaysVisibleContent={
          company.assets?.length > 0 ? (
            <AssetMap assets={company.assets} />
          ) : (
            <p className="text-muted-foreground text-center py-4">No assets found</p>
          )
        }
      >
        {company.assets?.length > 0 && (
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
                      asset.geoRisk.modelVersion === "FAILED" ? (
                        <td colSpan={6} className="py-2 px-3 text-center text-muted-foreground">API unavailable for this location</td>
                      ) : (
                        <>
                          <td className="py-2 px-3 text-right font-semibold">{formatCurrency(asset.geoRisk.expectedAnnualLoss || 0)}</td>
                          <td className="py-2 px-3 text-right">{formatCurrency(asset.geoRisk.hurricaneLoss || 0)}</td>
                          <td className="py-2 px-3 text-right">{formatCurrency(asset.geoRisk.floodLoss || 0)}</td>
                          <td className="py-2 px-3 text-right">{formatCurrency(asset.geoRisk.heatStressLoss || 0)}</td>
                          <td className="py-2 px-3 text-right">{formatCurrency(asset.geoRisk.droughtLoss || 0)}</td>
                          <td className="py-2 px-3 text-right">{formatCurrency(asset.geoRisk.extremePrecipLoss || 0)}</td>
                        </>
                      )
                    ) : (
                      <td colSpan={6} className="py-2 px-3 text-center text-muted-foreground">Not calculated</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>

      {scRisk && (
        <CollapsibleSection
          icon={Link2}
          title="Supply Chain Climate Risk Assessment"
          summary={`PV: ${totalScPV}`}
          testId="section-supply-chain"
          alwaysVisibleContent={<SupplyChainSummary scRisk={scRisk} company={company} />}
        >
          {(scRisk.topSuppliers as any[])?.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Top Upstream Suppliers (by Climate Risk Contribution)</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="table-suppliers">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">Country</th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">Sector</th>
                      <th className="text-right py-2 px-3 font-medium text-muted-foreground">I-O Coefficient</th>
                      <th className="text-right py-2 px-3 font-medium text-muted-foreground">PV ($)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(scRisk.topSuppliers as any[]).map((supplier: any, idx: number) => {
                      const supplierElc = supplier.expected_loss_contribution;
                      const supplierHasNewAPI = supplierElc?.present_value != null;
                      const supplierBase = supplierHasNewAPI ? 1_000_000_000 : 1_000_000;
                      const sf = company.supplierCosts
                        ? getSaturationScale(company.supplierCosts, company.ev || 0, supplierBase)
                        : 1;
                      const supplierRawPV = supplierHasNewAPI ? supplierElc.present_value : (supplierElc?.annual_loss || 0) * SC_PV_FACTOR;
                      return (
                        <tr key={idx} className="border-b border-border/50" data-testid={`row-supplier-${idx}`}>
                          <td className="py-2 px-3">{supplier.country_name}</td>
                          <td className="py-2 px-3 text-muted-foreground">{supplier.sector_name}</td>
                          <td className="py-2 px-3 text-right">{(supplier.coefficient * 100).toFixed(2)}%</td>
                          <td className="py-2 px-3 text-right font-mono">{formatCurrency(supplierRawPV * sf)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CollapsibleSection>
      )}

      {mgmtScore && (
        <ManagementSection mgmtScore={mgmtScore} />
      )}
    </div>
  );
}
