import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Briefcase, Droplets, Sun, Thermometer, Wind, CloudRain, AlertTriangle } from "lucide-react";
import { Link } from "wouter";
import type { Portfolio, PortfolioHolding } from "@shared/schema";

const SC_PV_FACTOR = 13.57;

function getSaturationScale(supplierCosts: number, ev: number, base: number): number {
  const linear = supplierCosts / base;
  if (ev > 0 && supplierCosts / ev > 1) {
    const costToEV = supplierCosts / ev;
    return (ev / base) * (1 - Math.exp(-costToEV));
  }
  return linear;
}

function getSupplyChainPV(sc: any, supplierCosts: number | null, ev?: number | null) {
  if (!sc?.indirectRisk?.expected_loss) return 0;
  const el = sc.indirectRisk.expected_loss;
  if (el.present_value != null) {
    const sf = supplierCosts ? getSaturationScale(supplierCosts, ev || 0, 1_000_000_000) : 1;
    return el.present_value * sf;
  }
  const sf = supplierCosts ? getSaturationScale(supplierCosts, ev || 0, 1_000_000) : 1;
  return (el.total_annual_loss || 0) * SC_PV_FACTOR * sf;
}

function getMetrics(c: any) {
  const scPV = getSupplyChainPV(c.supplyChainRisk, c.supplierCosts, c.ev);
  const directPV = c.totalGeoRiskPV || 0;
  const totalPV = directPV + scPV;
  const mgmtPct = c.managementScore?.totalScore != null ? c.managementScore.totalScore / 100 : null;
  const adjPV = mgmtPct != null ? totalPV * (1 - 0.7 * mgmtPct) : totalPV;
  const valPct = c.ev > 0 ? (adjPV / c.ev) * 100 : null;
  return { directPV, scPV, totalPV, adjPV, valPct };
}

const HAZARDS = [
  { key: "flood", label: "Flood", Icon: Droplets },
  { key: "drought", label: "Drought", Icon: Sun },
  { key: "heatStress", label: "Heat", Icon: Thermometer },
  { key: "hurricane", label: "Hurricane", Icon: Wind },
  { key: "extremePrecipitation", label: "Precip.", Icon: CloudRain },
] as const;

type Side = { portfolio: Portfolio; holdings: PortfolioHolding[] };

function formatPct(v: number | null): string {
  if (v == null || !isFinite(v)) return "—";
  if (Math.abs(v) >= 10) return `${v.toFixed(1)}%`;
  return `${v.toFixed(2)}%`;
}

function aggregate(side: Side | null, companyByIsin: Map<string, any>, filters: { sector: string; region: string }) {
  if (!side) return null;
  const filtered = side.holdings
    .map(h => ({ h, c: companyByIsin.get(h.isin) }))
    .filter(({ c }) => {
      if (!c) return false;
      if (filters.sector && c.sector !== filters.sector) return false;
      if (filters.region && c.country !== filters.region) return false;
      return true;
    });

  const totalWeight = filtered.reduce((s, { h }) => s + h.weight, 0);
  if (totalWeight === 0) return { totalWeight: 0, valPctW: null, hazards: HAZARDS.map(h => ({ ...h, valPct: 0 })), coverage: 0, rows: [] };

  let valPctW = 0;
  const hazardW: Record<string, number> = {};
  for (const h of HAZARDS) hazardW[h.key] = 0;

  for (const { h, c } of filtered) {
    const w = h.weight / totalWeight;
    const m = getMetrics(c);
    if (m.valPct != null) valPctW += w * m.valPct;
    for (const hz of HAZARDS) {
      const direct = c.geoHazardsPV?.[hz.key] || 0;
      const rawSc = c.scHazardsRawPV?.[hz.key] || 0;
      const scSf = c.supplierCosts ? getSaturationScale(c.supplierCosts, c.ev || 0, 1_000_000_000) : 1;
      const hzTotal = direct + rawSc * scSf;
      const hzValPct = c.ev > 0 ? (hzTotal / c.ev) * 100 : 0;
      hazardW[hz.key] += w * hzValPct;
    }
  }

  return {
    totalWeight,
    valPctW,
    hazards: HAZARDS.map(h => ({ ...h, valPct: hazardW[h.key] })),
    coverage: filtered.length,
    rows: filtered.map(({ h, c }) => ({ h, c, m: getMetrics(c) })),
  };
}

export default function PortfolioAnalysis() {
  const [aId, setAId] = useState<string>("");
  const [bId, setBId] = useState<string>("");
  const [sector, setSector] = useState<string>("__all__");
  const [region, setRegion] = useState<string>("__all__");

  const { data: portfolios = [] } = useQuery<Portfolio[]>({ queryKey: ["/api/portfolios"] });
  const { data: companies = [] } = useQuery<any[]>({ queryKey: ["/api/companies"] });

  const { data: a } = useQuery<Side>({
    queryKey: ["/api/portfolios", aId],
    enabled: !!aId,
  });
  const { data: b } = useQuery<Side>({
    queryKey: ["/api/portfolios", bId],
    enabled: !!bId,
  });

  const companyByIsin = useMemo(() => {
    const m = new Map<string, any>();
    for (const c of companies) m.set(c.isin, c);
    return m;
  }, [companies]);

  const fSector = sector === "__all__" ? "" : sector;
  const fRegion = region === "__all__" ? "" : region;

  const aggA = useMemo(() => aggregate(a as any, companyByIsin, { sector: fSector, region: fRegion }), [a, companyByIsin, fSector, fRegion]);
  const aggB = useMemo(() => aggregate(b as any, companyByIsin, { sector: fSector, region: fRegion }), [b, companyByIsin, fSector, fRegion]);

  // Build filter options from all holdings of both portfolios (using company data)
  const { sectorOpts, regionOpts } = useMemo(() => {
    const sectors = new Set<string>();
    const regions = new Set<string>();
    const allHoldings = [...(a?.holdings || []), ...(b?.holdings || [])];
    for (const h of allHoldings) {
      const c = companyByIsin.get(h.isin);
      if (c?.sector) sectors.add(c.sector);
      if (c?.country) regions.add(c.country);
    }
    return {
      sectorOpts: Array.from(sectors).sort(),
      regionOpts: Array.from(regions).sort(),
    };
  }, [a, b, companyByIsin]);

  const Side = ({ side, agg, label }: { side: Side | undefined; agg: ReturnType<typeof aggregate>; label: string }) => {
    if (!side) {
      return (
        <Card className="border-dashed">
          <CardContent className="pt-10 pb-10 text-center text-sm text-muted-foreground">
            Select a portfolio for {label}
          </CardContent>
        </Card>
      );
    }
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground font-normal">
            <Briefcase className="h-4 w-4" /> {label}
          </CardTitle>
          <div className="text-base font-semibold text-foreground" data-testid={`text-portfolio-${label.toLowerCase()}-name`}>{side.portfolio.name}</div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Avg Adjusted Exposure / EV</div>
            <div className="text-3xl font-bold text-primary mt-0.5" data-testid={`text-portfolio-${label.toLowerCase()}-valpct`}>
              {formatPct(agg?.valPctW ?? null)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {agg?.coverage ?? 0} of {side.holdings.length} holdings matched
              {agg && agg.totalWeight > 0 && ` · ${(agg.totalWeight).toFixed(1)}% weight covered`}
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Hazard Exposure (% of EV)</div>
            {agg?.hazards.map(h => {
              const Icon = h.Icon;
              const max = Math.max(...(agg?.hazards.map(x => x.valPct) || [1]), 0.01);
              return (
                <div key={h.key} className="flex items-center gap-2 text-xs" data-testid={`hazard-${label.toLowerCase()}-${h.key}`}>
                  <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="w-16 text-muted-foreground">{h.label}</span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${Math.min(100, (h.valPct / max) * 100)}%` }} />
                  </div>
                  <span className="w-14 text-right font-mono font-medium">{formatPct(h.valPct)}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  };

  const delta =
    aggA?.valPctW != null && aggB?.valPctW != null
      ? aggA.valPctW - aggB.valPctW
      : null;

  return (
    <div className="space-y-6" data-testid="portfolio-analysis-page">
      <div>
        <h1 className="text-xl font-semibold tracking-tight" data-testid="text-page-title">Portfolio Analysis</h1>
        <p className="text-sm text-muted-foreground mt-1">Compare two uploaded portfolios across sector and region cuts</p>
      </div>

      {portfolios.length < 2 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="pt-5 pb-5 flex items-center gap-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <span>
              You need at least two uploaded portfolios to compare. <Link href="/admin" className="text-primary underline" data-testid="link-admin">Upload portfolios →</Link>
            </span>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-5 pb-5">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Portfolio A</Label>
              <Select value={aId} onValueChange={setAId}>
                <SelectTrigger data-testid="select-portfolio-a"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {portfolios.map(p => (
                    <SelectItem key={p.id} value={String(p.id)} data-testid={`option-a-${p.id}`}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Portfolio B (comparator)</Label>
              <Select value={bId} onValueChange={setBId}>
                <SelectTrigger data-testid="select-portfolio-b"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {portfolios.map(p => (
                    <SelectItem key={p.id} value={String(p.id)} data-testid={`option-b-${p.id}`}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Sector</Label>
              <Select value={sector} onValueChange={setSector}>
                <SelectTrigger data-testid="select-sector"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All sectors</SelectItem>
                  {sectorOpts.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Region (country)</Label>
              <Select value={region} onValueChange={setRegion}>
                <SelectTrigger data-testid="select-region"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All regions</SelectItem>
                  {regionOpts.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {(fSector || fRegion) && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Active filters:</span>
              {fSector && <span className="text-xs px-2 py-0.5 rounded-md bg-primary/15 text-primary">Sector: {fSector}</span>}
              {fRegion && <span className="text-xs px-2 py-0.5 rounded-md bg-primary/15 text-primary">Region: {fRegion}</span>}
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { setSector("__all__"); setRegion("__all__"); }} data-testid="button-reset-filters">Reset</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {delta != null && (
        <Card>
          <CardContent className="pt-5 pb-5 flex items-center gap-6">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">A vs B Δ (Adj Exp / EV)</div>
              <div
                className="text-3xl font-bold mt-1"
                style={{ color: delta > 0 ? "hsl(var(--risk-high))" : "hsl(var(--risk-low))" }}
                data-testid="text-delta"
              >
                {delta > 0 ? "+" : ""}{delta.toFixed(2)}pp
              </div>
            </div>
            <div className="text-sm text-muted-foreground max-w-md">
              {delta > 0
                ? "Portfolio A carries higher climate-adjusted exposure than B"
                : "Portfolio A carries lower climate-adjusted exposure than B"}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <Side side={a as any} agg={aggA} label="A" />
        <Side side={b as any} agg={aggB} label="B" />
      </div>

      {(aggA?.rows.length || aggB?.rows.length) ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Holdings (filtered)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid lg:grid-cols-2 gap-6">
              {[
                { label: "A", agg: aggA, side: a },
                { label: "B", agg: aggB, side: b },
              ].map(({ label, agg, side }) =>
                side ? (
                  <div key={label}>
                    <div className="text-xs font-medium text-muted-foreground mb-2">Portfolio {label} — {(side as any).portfolio.name}</div>
                    <div className="border border-border rounded-md overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Company</TableHead>
                            <TableHead className="text-xs text-right">Weight</TableHead>
                            <TableHead className="text-xs text-right">Adj/EV</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(agg?.rows || []).slice(0, 50).map(({ h, c, m }) => (
                            <TableRow key={h.id} data-testid={`holding-${label}-${h.id}`}>
                              <TableCell className="text-xs">
                                <Link href={`/company/${c.id}`} className="hover:text-primary">{c.companyName}</Link>
                                <div className="text-[10px] text-muted-foreground">{c.isin} · {c.sector || "—"}</div>
                              </TableCell>
                              <TableCell className="text-xs text-right font-mono">{h.weight.toFixed(2)}%</TableCell>
                              <TableCell className="text-xs text-right font-mono font-medium">{formatPct(m.valPct)}</TableCell>
                            </TableRow>
                          ))}
                          {(agg?.rows || []).length === 0 && (
                            <TableRow><TableCell colSpan={3} className="text-center text-xs text-muted-foreground py-6">No matched holdings</TableCell></TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ) : null
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
