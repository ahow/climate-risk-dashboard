// PV parameter sensitivity grid (reviewer request F)
//
// Recomputes the universe value-at-exposure (VE %) under a grid of PV
// assumptions — discount rate r ∈ {6,8,10,12}%, growth g ∈ {2,4,6}%,
// horizon T ∈ {20,30,50} years — directly from stored per-asset expected
// annual losses (geo_risks.expected_annual_loss) and supply-chain annual
// losses (supply_chain_risks.indirect_risk->expected_loss.total_annual_loss),
// without re-running the hazard model.
//
// PV formula (matches the deployed model exactly):
//   A(r,g,T) = Σ_{t=1..T} (1+g)^(t-1) / (1+r)^t          (growing annuity)
//   PV = EAL × A(r,g,T)
// Verified against stored values: direct PV/EAL = 15.372 = A(5%, 0%, 30)
// and the app's supply-chain factor 13.57 = A(10%, 4%, 30).
//
// Baseline ("default parameterisation") = the stored PVs themselves
// (direct: r=5%, g=0%, T=30; supply chain: r=10%, g=4%, T=30), with the
// same company-level logic as data_exports/issuer_universe.csv:
// asset-value scaling, supply-chain saturation cap, management adjustment.
//
// Output: data_exports/pv_sensitivity_grid.csv with one row per grid cell:
//   discount_rate, growth_rate, horizon, universe_ve_pct (EV-weighted,
//   canonical universe), median_issuer_ve_pct, rank_correlation_vs_default
//   (Spearman rho of issuer adjusted-VE ranks vs the default parameterisation).
// The canonical universe is FIXED at the default-parameterisation membership
// (excludes Financials, incomplete data, Adj/EV > 100%) so every grid cell
// compares the same issuer set.
//
// Run: node scripts/pv_sensitivity_grid.mjs   (needs HEROKU_API_KEY)

import pg from "pg";
import fs from "fs/promises";

const OUT = "data_exports";
await fs.mkdir(OUT, { recursive: true });

const token = process.env.HEROKU_API_KEY;
const res = await fetch("https://api.heroku.com/apps/climate-risk-unified/config-vars", {
  headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.heroku+json; version=3" },
});
const cfg = await res.json();
const client = new pg.Client({ connectionString: cfg.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
const q = async (sql, p) => (await client.query(sql, p)).rows;

// Growing-annuity PV factor: Σ_{t=1..T} (1+g)^(t-1)/(1+r)^t
function annuityFactor(r, g, T) {
  let f = 0;
  for (let t = 1; t <= T; t++) f += Math.pow(1 + g, t - 1) / Math.pow(1 + r, t);
  return f;
}
const DEFAULT_DIRECT_FACTOR = annuityFactor(0.05, 0.0, 30); // 15.3724…
const DEFAULT_SC_FACTOR = annuityFactor(0.10, 0.04, 30);    // 13.5715…

// Saturation cap for supply-chain exposure (replicates app logic)
function getSaturationScale(supplierCosts, ev, base) {
  const linear = supplierCosts / base;
  if (ev > 0 && supplierCosts / ev > 1) {
    const costToEV = supplierCosts / ev;
    return (ev / base) * (1 - Math.exp(-costToEV));
  }
  return linear;
}

// ---- Pull data ----
const companies = await q(`
  SELECT c.id, c.isin, c.sector, c.total_asset_value, c.supplier_costs, c.ev
  FROM companies c ORDER BY c.id`);
const geo = await q(`
  SELECT company_id, SUM(expected_annual_loss) AS direct_eal
  FROM geo_risks WHERE model_version <> 'FAILED' GROUP BY company_id`);
const apiAssets = await q(`SELECT company_id, SUM(estimated_value_usd) AS api_asset_total FROM assets GROUP BY company_id`);
const sc = await q(`
  SELECT company_id,
         (indirect_risk->'expected_loss'->>'total_annual_loss')::float8 AS sc_eal,
         (indirect_risk->'expected_loss'->>'present_value')::float8 AS sc_pv
  FROM supply_chain_risks`);
const mgmt = await q(`SELECT company_id, total_score, weighted_score FROM management_scores`);

const geoM = new Map(geo.map(r => [r.company_id, Number(r.direct_eal) || 0]));
const apiM = new Map(apiAssets.map(r => [r.company_id, Number(r.api_asset_total) || 0]));
const scM = new Map(sc.map(r => [r.company_id, r]));
const mgmtM = new Map(mgmt.map(r => [r.company_id, r]));

// ---- Per-issuer inputs that do not depend on (r,g,T) ----
const issuers = companies.map(c => {
  const ev = c.ev || 0;
  const apiAssetTotal = apiM.get(c.id) || 0;
  const companyAssetVal = c.total_asset_value || 0;
  const geoScaleFactor = (apiAssetTotal > 0 && companyAssetVal > 0)
    ? companyAssetVal / apiAssetTotal : (apiAssetTotal === 0 ? 0 : 1);
  const directEAL = (geoM.get(c.id) || 0) * geoScaleFactor;
  const s = scM.get(c.id);
  // Same branch the app takes when present_value is stored: saturation base 1e9
  const satFactor = s && c.supplier_costs ? getSaturationScale(c.supplier_costs, ev, 1e9) : (s ? 1 : 0);
  const scEAL = (s?.sc_eal || 0) * satFactor;
  const scPVDefault = (s?.sc_pv || 0) * satFactor; // stored default PV (r=10%, g=4%, T=30)
  const m = mgmtM.get(c.id);
  const mgmtScore = m ? (m.weighted_score ?? m.total_score ?? null) : null;
  const adjFactor = mgmtScore != null ? (1 - 0.7 * mgmtScore / 100) : 1;
  return {
    isin: c.isin, sector: c.sector || "", ev,
    directEAL, scEAL, scPVDefault, adjFactor,
    incomplete: !(c.total_asset_value > 0 && c.supplier_costs > 0 && ev > 0),
  };
});

// ---- Default (baseline) adjusted VE, exactly as the app computes it ----
for (const i of issuers) {
  const defaultPV = i.directEAL * DEFAULT_DIRECT_FACTOR + i.scPVDefault;
  i.defaultAdjVE = i.ev > 0 ? (defaultPV * i.adjFactor / i.ev) * 100 : null;
}
// Canonical universe fixed at default parameterisation
const canon = issuers.filter(i =>
  i.sector.toLowerCase() !== "financials" &&
  !i.incomplete &&
  i.defaultAdjVE != null && i.defaultAdjVE <= 100 &&
  i.ev > 0);

// ---- Helpers ----
function median(a) {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
}
function ranks(a) {
  const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]);
  const r = new Array(a.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}
function spearman(a, b) {
  const ra = ranks(a), rb = ranks(b), n = a.length;
  const ma = ra.reduce((s, v) => s + v, 0) / n, mb = rb.reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2; db += (rb[i] - mb) ** 2;
  }
  return num / Math.sqrt(da * db);
}

// ---- Grid ----
const R = [0.06, 0.08, 0.10, 0.12], G = [0.02, 0.04, 0.06], T = [20, 30, 50];
const baseline = canon.map(i => i.defaultAdjVE);
const gridRows = [];
for (const r of R) for (const g of G) for (const t of T) {
  const A = annuityFactor(r, g, t);
  const ves = canon.map(i => ((i.directEAL + i.scEAL) * A * i.adjFactor / i.ev) * 100);
  const totalEV = canon.reduce((s, i) => s + i.ev, 0);
  const totalAdjPV = canon.reduce((s, i) => s + (i.directEAL + i.scEAL) * A * i.adjFactor, 0);
  gridRows.push({
    discount_rate: r, growth_rate: g, horizon: t,
    universe_ve_pct: (totalAdjPV / totalEV) * 100,
    median_issuer_ve_pct: median(ves),
    rank_correlation_vs_default: spearman(ves, baseline),
  });
}

// ---- CSV ----
const cols = Object.keys(gridRows[0]);
const csv = cols.join(",") + "\n" + gridRows.map(o =>
  cols.map(c => typeof o[c] === "number" && !Number.isInteger(o[c]) ? o[c].toPrecision(6) : o[c]).join(",")
).join("\n") + "\n";
await fs.writeFile(`${OUT}/pv_sensitivity_grid.csv`, csv);

console.log(JSON.stringify({
  n_canonical: canon.length,
  default_direct_factor: DEFAULT_DIRECT_FACTOR,
  default_sc_factor: DEFAULT_SC_FACTOR,
  min_rank_corr: Math.min(...gridRows.map(r => r.rank_correlation_vs_default)),
  universe_ve_range: [Math.min(...gridRows.map(r => r.universe_ve_pct)), Math.max(...gridRows.map(r => r.universe_ve_pct))],
}, null, 1));
await client.end();
