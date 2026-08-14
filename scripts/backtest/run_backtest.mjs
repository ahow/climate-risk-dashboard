// Named-outcome back-test (request D)
//
// Outcome definition: issuer disclosed a physical-climate-event-driven charge, impairment,
// restoration cost, or production loss of >= $100M during 2020-2025 (events seeded in
// backtest_events.csv; amounts approximate, pending verification against filings).
//
// Method: canonical universe (ex-Financials, complete data, Adj/EV <= 100%) split into
// quintiles of adjusted VE % (Q5 = highest exposure). Impairment rate per quintile with
// Wilson 95% CIs. Placebo: same computation on gross VE quintiles.
//
// KNOWN LIMITATION: quintiles use the *current* model outputs — historical model vintages
// are not stored, so this is not strictly "pre-event" exposure. Documented in the README.
//
// Usage: node scripts/backtest/run_backtest.mjs  (requires data_exports/issuer_universe.csv)
import fs from "fs/promises";

function parseCSV(text) {
  const lines = text.trim().split("\n");
  const parse = l => { const o = []; let c = "", q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === "," && !q) { o.push(c); c = ""; } else c += ch; } o.push(c); return o; };
  const cols = parse(lines[0]);
  return lines.slice(1).map(l => Object.fromEntries(parse(l).map((v, i) => [cols[i], v])));
}

const universe = parseCSV(await fs.readFile("data_exports/issuer_universe.csv", "utf8"))
  .filter(r => r.in_canonical_universe === "true")
  .map(r => ({ isin: r.isin, name: r.name, adjVE: parseFloat(r.adjusted_ve_pct), grossVE: parseFloat(r.gross_ve_pct) }))
  .filter(r => isFinite(r.adjVE) && isFinite(r.grossVE));

const events = parseCSV(await fs.readFile("scripts/backtest/backtest_events.csv", "utf8"));
const isinSet = new Set(universe.map(r => r.isin));
const matched = events.filter(e => isinSet.has(e.isin));
const unmatched = events.filter(e => !isinSet.has(e.isin));
console.log(`universe: ${universe.length}, events: ${events.length}, in canonical universe: ${matched.length}`);
if (unmatched.length) console.log("events outside canonical universe (excluded):", unmatched.map(e => `${e.issuer} (${e.isin})`).join("; "));

function wilson(k, n) {
  if (n === 0) return [null, null];
  const z = 1.96, p = k / n, d = 1 + z * z / n;
  const centre = (p + z * z / (2 * n)) / d;
  const half = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

function quintiles(rows, key) {
  const sorted = [...rows].sort((a, b) => a[key] - b[key]);
  const map = new Map();
  sorted.forEach((r, i) => map.set(r.isin, Math.min(5, Math.floor(i / (sorted.length / 5)) + 1)));
  return map;
}

const impairedIsins = new Set(matched.map(e => e.isin));
const impairedByYear = new Map(); // year -> Set(isin)
for (const e of matched) {
  const y = e.event_date.slice(0, 4);
  if (!impairedByYear.has(y)) impairedByYear.set(y, new Set());
  impairedByYear.get(y).add(e.isin);
}

function summarize(qMap, label) {
  const rows = [];
  // pooled (all years)
  for (let q = 1; q <= 5; q++) {
    const members = universe.filter(r => qMap.get(r.isin) === q);
    const k = members.filter(r => impairedIsins.has(r.isin)).length;
    const [lo, hi] = wilson(k, members.length);
    rows.push({ metric: label, year: "2020-2025", quintile: `Q${q}`, n_issuers: members.length, n_impaired: k,
      impairment_rate_pct: +(k / members.length * 100).toFixed(3),
      ci95_low_pct: +(lo * 100).toFixed(3), ci95_high_pct: +(hi * 100).toFixed(3) });
  }
  // per-year
  for (const [y, set] of [...impairedByYear.entries()].sort()) {
    for (let q = 1; q <= 5; q++) {
      const members = universe.filter(r => qMap.get(r.isin) === q);
      const k = members.filter(r => set.has(r.isin)).length;
      const [lo, hi] = wilson(k, members.length);
      rows.push({ metric: label, year: y, quintile: `Q${q}`, n_issuers: members.length, n_impaired: k,
        impairment_rate_pct: +(k / members.length * 100).toFixed(3),
        ci95_low_pct: +(lo * 100).toFixed(3), ci95_high_pct: +(hi * 100).toFixed(3) });
    }
  }
  return rows;
}

const adjRows = summarize(quintiles(universe, "adjVE"), "adjusted_ve");
const grossRows = summarize(quintiles(universe, "grossVE"), "gross_ve_placebo");

const all = [...adjRows, ...grossRows];
const header = Object.keys(all[0]).join(",");
await fs.mkdir("data_exports", { recursive: true });
await fs.writeFile("data_exports/backtest_summary.csv", header + "\n" + all.map(r => Object.values(r).join(",")).join("\n") + "\n");

// event list with quintile assignment
const qAdj = quintiles(universe, "adjVE");
const evOut = events.map(e => ({ ...e, in_canonical_universe: isinSet.has(e.isin), adjusted_ve_quintile: qAdj.get(e.isin) ? `Q${qAdj.get(e.isin)}` : "" }));
const evHeader = Object.keys(evOut[0]).join(",");
const esc = v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v;
await fs.writeFile("data_exports/backtest_events.csv", evHeader + "\n" + evOut.map(r => Object.values(r).map(esc).join(",")).join("\n") + "\n");

// headline lift
const pooled = adjRows.filter(r => r.year === "2020-2025");
const q5 = pooled.find(r => r.quintile === "Q5"), q1 = pooled.find(r => r.quintile === "Q1");
const overall = impairedIsins.size / universe.length * 100;
const pooledG = grossRows.filter(r => r.year === "2020-2025");
console.log(JSON.stringify({
  overall_rate_pct: +overall.toFixed(3),
  adjusted: Object.fromEntries(pooled.map(r => [r.quintile, r.impairment_rate_pct])),
  gross_placebo: Object.fromEntries(pooledG.map(r => [r.quintile, r.impairment_rate_pct])),
  lift_q5_vs_universe: q5 && overall > 0 ? +(q5.impairment_rate_pct / overall).toFixed(2) : null,
  lift_q5_vs_q1: q5 && q1 && q1.impairment_rate_pct > 0 ? +(q5.impairment_rate_pct / q1.impairment_rate_pct).toFixed(2) : "Q1 rate is 0",
}, null, 1));
