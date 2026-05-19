import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Layers, Droplets, Sun, Thermometer, Wind, CloudRain, Download } from "lucide-react";
import { Link } from "wouter";

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

function formatPct(v: number | null): string {
  if (v == null || !isFinite(v)) return "—";
  if (Math.abs(v) >= 10) return `${v.toFixed(1)}%`;
  return `${v.toFixed(2)}%`;
}

function formatMoney(v: number | null): string {
  if (v == null || !isFinite(v)) return "—";
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toFixed(0)}`;
}

function csvEscape(v: any): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(filename: string, rows: (string | number | null)[][]) {
  const text = rows.map(r => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function SectorAnalysis() {
  const [sector, setSector] = useState<string>("__all__");
  const [subSector, setSubSector] = useState<string>("__all__");
  const [region, setRegion] = useState<string>("__all__");

  const { data: companies = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/companies"] });

  const fSector = sector === "__all__" ? "" : sector;
  const fSubSector = subSector === "__all__" ? "" : subSector;
  const fRegion = region === "__all__" ? "" : region;

  const { sectorOpts, subSectorOpts, regionOpts } = useMemo(() => {
    const sectors = new Set<string>();
    const regions = new Set<string>();
    const subSectors = new Set<string>();
    for (const c of companies) {
      if (c.sector) sectors.add(c.sector);
      if (c.country) regions.add(c.country);
      if (c.subSector && (!fSector || c.sector === fSector)) subSectors.add(c.subSector);
    }
    return {
      sectorOpts: Array.from(sectors).sort(),
      subSectorOpts: Array.from(subSectors).sort(),
      regionOpts: Array.from(regions).sort(),
    };
  }, [companies, fSector]);

  const filtered = useMemo(() => {
    return companies.filter(c => {
      if (fSector && c.sector !== fSector) return false;
      if (fSubSector && c.subSector !== fSubSector) return false;
      if (fRegion && c.country !== fRegion) return false;
      return true;
    });
  }, [companies, fSector, fSubSector, fRegion]);

  const agg = useMemo(() => {
    const n = filtered.length;
    let totalEV = 0;
    let totalAdjPV = 0;
    let totalDirectPV = 0;
    let totalScPV = 0;
    const hazardSum: Record<string, number> = {};
    for (const h of HAZARDS) hazardSum[h.key] = 0;
    let withEV = 0;
    let valPctSum = 0;

    for (const c of filtered) {
      const m = getMetrics(c);
      totalDirectPV += m.directPV;
      totalScPV += m.scPV;
      totalAdjPV += m.adjPV;
      if (c.ev) {
        totalEV += c.ev;
        if (m.valPct != null) {
          valPctSum += m.valPct;
          withEV++;
        }
      }
      for (const hz of HAZARDS) {
        const direct = c.geoHazardsPV?.[hz.key] || 0;
        const rawSc = c.scHazardsRawPV?.[hz.key] || 0;
        const scSf = c.supplierCosts ? getSaturationScale(c.supplierCosts, c.ev || 0, 1_000_000_000) : 1;
        hazardSum[hz.key] += direct + rawSc * scSf;
      }
    }
    const aggValPct = totalEV > 0 ? (totalAdjPV / totalEV) * 100 : null;
    const avgValPct = withEV > 0 ? valPctSum / withEV : null;
    return {
      n, totalEV, totalAdjPV, totalDirectPV, totalScPV,
      aggValPct, avgValPct,
      hazards: HAZARDS.map(h => ({
        ...h,
        pv: hazardSum[h.key],
        pctOfEV: totalEV > 0 ? (hazardSum[h.key] / totalEV) * 100 : 0,
      })),
    };
  }, [filtered]);

  const handleExport = () => {
    const filterTag = [
      fSector || "all-sectors",
      fSubSector || "all-subsectors",
      fRegion || "all-regions",
    ].join("_").replace(/[^a-z0-9_-]/gi, "");
    const header = [
      "ISIN", "Company", "Sector", "Sub-Sector", "Country",
      "EV (USD)", "Total Asset Value (USD)", "Supplier Costs (USD)",
      "Direct Geo PV (USD)", "Supply Chain PV (USD)",
      "Total Climate PV (USD)", "Mgmt Score (%)", "Adjusted Exposure PV (USD)",
      "Adj Exp / EV (%)",
      "Flood PV (USD)", "Drought PV (USD)", "Heat PV (USD)", "Hurricane PV (USD)", "Precip PV (USD)",
    ];
    const rows: (string | number | null)[][] = [header];
    for (const c of filtered) {
      const m = getMetrics(c);
      const hz: Record<string, number> = {};
      for (const h of HAZARDS) {
        const direct = c.geoHazardsPV?.[h.key] || 0;
        const rawSc = c.scHazardsRawPV?.[h.key] || 0;
        const scSf = c.supplierCosts ? getSaturationScale(c.supplierCosts, c.ev || 0, 1_000_000_000) : 1;
        hz[h.key] = direct + rawSc * scSf;
      }
      rows.push([
        c.isin, c.companyName, c.sector || "", c.subSector || "", c.country || "",
        c.ev ?? "", c.totalAssetValue ?? "", c.supplierCosts ?? "",
        Math.round(m.directPV), Math.round(m.scPV),
        Math.round(m.totalPV), c.managementScore?.totalScore ?? "", Math.round(m.adjPV),
        m.valPct != null ? m.valPct.toFixed(4) : "",
        Math.round(hz.flood), Math.round(hz.drought), Math.round(hz.heatStress),
        Math.round(hz.hurricane), Math.round(hz.extremePrecipitation),
      ]);
    }
    // Summary footer
    rows.push([]);
    rows.push(["AGGREGATE", `n=${agg.n}`, fSector || "All", fSubSector || "All", fRegion || "All",
      Math.round(agg.totalEV), "", "",
      Math.round(agg.totalDirectPV), Math.round(agg.totalScPV),
      Math.round(agg.totalDirectPV + agg.totalScPV), "", Math.round(agg.totalAdjPV),
      agg.aggValPct != null ? agg.aggValPct.toFixed(4) : "",
      ...HAZARDS.map(h => Math.round(agg.hazards.find(x => x.key === h.key)?.pv || 0)),
    ]);
    downloadCsv(`sector-analysis_${filterTag}.csv`, rows);
  };

  return (
    <div className="space-y-6" data-testid="sector-analysis-page">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" data-testid="text-page-title">Sector Analysis</h1>
          <p className="text-sm text-muted-foreground mt-1">Examine climate exposure by sector, sub-sector and region across the full universe</p>
        </div>
        <Button
          onClick={handleExport}
          disabled={!filtered.length}
          variant="outline"
          size="sm"
          data-testid="button-export-csv"
        >
          <Download className="h-4 w-4 mr-1.5" />
          Export CSV ({filtered.length})
        </Button>
      </div>

      <Card>
        <CardContent className="pt-5 pb-5">
          <div className="grid md:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Sector</Label>
              <Select value={sector} onValueChange={(v) => { setSector(v); setSubSector("__all__"); }}>
                <SelectTrigger data-testid="select-sector"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All sectors</SelectItem>
                  {sectorOpts.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Sub-sector</Label>
              <Select value={subSector} onValueChange={setSubSector}>
                <SelectTrigger data-testid="select-subsector"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All sub-sectors</SelectItem>
                  {subSectorOpts.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
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
          {(fSector || fSubSector || fRegion) && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Active filters:</span>
              {fSector && <span className="text-xs px-2 py-0.5 rounded-md bg-primary/15 text-primary">Sector: {fSector}</span>}
              {fSubSector && <span className="text-xs px-2 py-0.5 rounded-md bg-primary/15 text-primary">Sub-sector: {fSubSector}</span>}
              {fRegion && <span className="text-xs px-2 py-0.5 rounded-md bg-primary/15 text-primary">Region: {fRegion}</span>}
              <Button
                variant="ghost" size="sm" className="h-6 text-xs"
                onClick={() => { setSector("__all__"); setSubSector("__all__"); setRegion("__all__"); }}
                data-testid="button-reset-filters"
              >Reset</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4 pb-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Companies</div>
          <div className="text-2xl font-bold font-mono mt-1" data-testid="text-count">{agg.n}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Total EV</div>
          <div className="text-2xl font-bold font-mono mt-1" data-testid="text-total-ev">{formatMoney(agg.totalEV)}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Adjusted Exposure PV</div>
          <div className="text-2xl font-bold font-mono mt-1" data-testid="text-adj-pv">{formatMoney(agg.totalAdjPV)}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Adj Exp / EV (Σ)</div>
          <div className="text-2xl font-bold font-mono text-primary mt-1" data-testid="text-adj-evpct">{formatPct(agg.aggValPct)}</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Layers className="h-4 w-4" />Hazard Exposure (% of EV)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {agg.hazards.map(h => {
              const Icon = h.Icon;
              const max = Math.max(...agg.hazards.map(x => x.pctOfEV), 0.01);
              return (
                <div key={h.key} className="flex items-center gap-2 text-xs" data-testid={`hazard-${h.key}`}>
                  <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="w-20 text-muted-foreground">{h.label}</span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${Math.min(100, (h.pctOfEV / max) * 100)}%` }} />
                  </div>
                  <span className="w-20 text-right font-mono">{formatMoney(h.pv)}</span>
                  <span className="w-16 text-right font-mono font-medium">{formatPct(h.pctOfEV)}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Companies in Filter ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
          ) : (
            <div className="border border-border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Company</TableHead>
                    <TableHead className="text-xs">Sector / Sub-sector</TableHead>
                    <TableHead className="text-xs">Country</TableHead>
                    <TableHead className="text-xs text-right">EV</TableHead>
                    <TableHead className="text-xs text-right">Adj PV</TableHead>
                    <TableHead className="text-xs text-right">Adj/EV</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.slice(0, 200).map(c => {
                    const m = getMetrics(c);
                    return (
                      <TableRow key={c.id} data-testid={`row-company-${c.id}`}>
                        <TableCell className="text-xs">
                          <Link href={`/company/${c.id}`} className="hover:text-primary font-medium">{c.companyName}</Link>
                          <div className="text-[10px] text-muted-foreground">{c.isin}</div>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div>{c.sector || "—"}</div>
                          <div className="text-[10px] text-muted-foreground">{c.subSector || "—"}</div>
                        </TableCell>
                        <TableCell className="text-xs">{c.country || "—"}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{formatMoney(c.ev)}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{formatMoney(m.adjPV)}</TableCell>
                        <TableCell className="text-xs text-right font-mono font-medium">{formatPct(m.valPct)}</TableCell>
                      </TableRow>
                    );
                  })}
                  {filtered.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">No companies match the current filters</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
              {filtered.length > 200 && (
                <div className="text-[11px] text-muted-foreground px-3 py-2 border-t border-border">
                  Showing first 200 of {filtered.length} — export CSV for full list.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
