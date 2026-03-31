# Supply Chain Risk Assessment API - Integration Guide

## Base URL

```
https://supply-chain-risk-api-7567b2b7e4c5.herokuapp.com
```

## Overview

This API quantifies multi-dimensional supply chain risk exposure for any country-sector combination. It integrates 5 risk dimensions with OECD Input-Output economic modeling and a **3-tier supply chain model** to assess both direct operational risk and indirect (upstream supply chain) risk across multiple layers of the supply chain.

The 5 risk dimensions are:
- **Climate** - physical climate hazard exposure
- **Modern Slavery** - forced labour and trafficking risk
- **Political Instability** - governance and political risk
- **Water Stress** - water scarcity and stress exposure
- **Nature Loss** - biodiversity and ecosystem degradation risk

All risk scores are on a scale of **0 to 5**, where 0 = lowest risk and 5 = highest risk.

### Multi-Tier Supply Chain Model

The API traces supply chain exposure through 3 tiers using OECD Input-Output coefficient tables:

| Tier | Description | Weight |
|------|-------------|--------|
| Tier 1 | Direct suppliers — the immediate upstream inputs to the queried country-sector | 50% |
| Tier 2 | Sub-suppliers — suppliers to Tier 1 suppliers, identified by cascading I-O lookups | 35% |
| Tier 3 | Deep supply chain — suppliers to Tier 2 suppliers, one further level deep | 15% |

For each tier, supplier I-O coefficients are normalised within that tier to compute coefficient-weighted risk scores. The overall **indirect risk** is the weighted combination of all three tiers' risk scores. The **total risk** blends 60% direct risk + 40% indirect risk.

Duplicate country-sector pairs across tiers are deduplicated using the maximum coefficient.

## Authentication

No authentication is required. The API is publicly accessible.

## Integration with ISIN-based Systems

The API uses **ISO-3166 country codes** (e.g., USA, GBR, CHN) and **ISIC Rev.4 sector codes** (e.g., B06, C20) as identifiers. To integrate with a system that uses ISINs as the primary company identifier, the consuming application should:

1. Extract the **country of domicile** from the ISIN (first 2 characters map to ISO-2, which should be converted to ISO-3)
2. Map the company's **primary business activity** to an ISIC sector code (e.g., using GICS, ICB, or NACE classification crosswalks)
3. Call the `/api/assess` endpoint with those two parameters

**ISIN country prefix to ISO-3 mapping examples:**

| ISIN Prefix | Country      | ISO-3 Code |
|-------------|-------------|------------|
| US          | United States | USA        |
| GB          | United Kingdom | GBR      |
| DE          | Germany      | DEU        |
| JP          | Japan        | JPN        |
| FR          | France       | FRA        |
| CN          | China        | CHN        |
| AU          | Australia    | AUS        |
| BR          | Brazil       | BRA        |
| IN          | India        | IND        |
| CH          | Switzerland  | CHE        |

For a full list of supported countries, call `GET /api/countries`.

---

## Endpoints

### 1. Health Check

```
GET /api/health
```

**Response:**
```json
{
  "status": "healthy",
  "version": "4.0.0",
  "countries": 85,
  "sectors": 52
}
```

---

### 2. List Countries

```
GET /api/countries
```

Returns all 85 supported countries with ISO-3 codes and regions.

**Response:**
```json
[
  { "code": "AUS", "name": "Australia", "region": "Asia-Pacific" },
  { "code": "GBR", "name": "United Kingdom", "region": "Europe" },
  { "code": "USA", "name": "United States", "region": "Americas" }
]
```

---

### 3. List Sectors

```
GET /api/sectors
```

Returns all 52 supported ISIC Rev.4 sectors with categories.

**Response:**
```json
[
  { "code": "A01", "name": "Crop and animal production", "category": "Agriculture" },
  { "code": "B06", "name": "Mining and quarrying", "category": "Mining" },
  { "code": "C20", "name": "Chemicals and chemical products", "category": "Manufacturing" },
  { "code": "K64", "name": "Financial service activities", "category": "Finance" }
]
```

**Full sector list:**

| Code | Name | Category |
|------|------|----------|
| A01 | Crop and animal production | Agriculture |
| A02 | Forestry and logging | Agriculture |
| A03 | Fishing and aquaculture | Agriculture |
| B05 | Mining of coal and lignite | Mining |
| B06 | Mining and quarrying | Mining |
| B07-B08 | Mining of metal ores and other mining | Mining |
| B09 | Mining support service activities | Mining |
| C10-C12 | Food products, beverages and tobacco | Manufacturing |
| C13-C15 | Textiles, wearing apparel and leather | Manufacturing |
| C16 | Wood and products of wood | Manufacturing |
| C17-C18 | Paper products and printing | Manufacturing |
| C19 | Coke and refined petroleum products | Manufacturing |
| C20 | Chemicals and chemical products | Manufacturing |
| C21 | Pharmaceuticals | Manufacturing |
| C22 | Rubber and plastics products | Manufacturing |
| C23 | Other non-metallic mineral products | Manufacturing |
| C24 | Basic metals | Manufacturing |
| C25 | Fabricated metal products | Manufacturing |
| C26 | Computer, electronic and optical products | Manufacturing |
| C27 | Electrical equipment | Manufacturing |
| C28 | Machinery and equipment | Manufacturing |
| C29 | Motor vehicles and trailers | Manufacturing |
| C30 | Other transport equipment | Manufacturing |
| C31-C33 | Furniture and other manufacturing | Manufacturing |
| D35 | Electricity, gas, steam and air conditioning | Utilities |
| E36 | Water collection and treatment | Utilities |
| E37-E39 | Sewerage and waste management | Utilities |
| F | Construction | Construction |
| G45 | Wholesale and retail trade of motor vehicles | Trade |
| G46 | Wholesale trade | Trade |
| G47 | Retail trade | Trade |
| H49 | Land transport and pipelines | Transport |
| H50 | Water transport | Transport |
| H51 | Air transport | Transport |
| H52 | Warehousing and support for transportation | Transport |
| H53 | Postal and courier activities | Transport |
| I | Accommodation and food service | Services |
| J58-J60 | Publishing, audiovisual and broadcasting | ICT |
| J61 | Telecommunications | ICT |
| J62-J63 | IT and other information services | ICT |
| K64 | Financial service activities | Finance |
| K65 | Insurance and pension funding | Finance |
| K66 | Auxiliary financial services | Finance |
| L68 | Real estate activities | Real Estate |
| M | Professional, scientific and technical activities | Professional |
| N | Administrative and support services | Professional |
| O | Public administration and defence | Public |
| P | Education | Public |
| Q | Human health and social work | Public |
| R | Arts, entertainment and recreation | Services |
| S-U | Other service activities | Services |

---

### 4. Risk Assessment (Primary Endpoint)

```
GET /api/assess?country={ISO3_CODE}&sector={ISIC_CODE}
```

**Parameters:**

| Parameter | Type   | Required | Default | Description |
|-----------|--------|----------|---------|-------------|
| country   | string | Yes      | -       | ISO-3166 alpha-3 country code (e.g., USA, GBR, CHN) |
| sector    | string | Yes      | -       | ISIC Rev.4 sector code (e.g., B06, C20, K64) |
| skip_climate | boolean | No  | false   | Set to `true` to skip live climate data (faster response) |
| top_n     | integer | No     | 10      | Number of suppliers per tier (1-20) |
| discount_rate | float | No  | 0.10    | Discount rate for present value calculation (0-1). Default 10% |
| growth_rate   | float | No  | 0.04    | Annual growth rate of expected losses for PV calculation (0-1). Default 4% |
| pv_horizon    | integer | No | 30     | Time horizon in years for PV calculation (1-100). Default 30 years |

**Example Requests:**
```
GET /api/assess?country=USA&sector=C26
GET /api/assess?country=GBR&sector=K64&discount_rate=0.08&growth_rate=0.03&pv_horizon=50
GET /api/assess?country=CHN&sector=C26&skip_climate=true&top_n=5
```

**Response Structure:**

> **Note:** Climate expected loss data is sourced **live** from the Climate Risk API V6 (Probabilistic Model), which uses real scientific datasets (NOAA IBTrACS, WRI Aqueduct, HadEX3). If the Climate API is temporarily unavailable, the system falls back to pre-computed static values. Results are cached for 1 hour per country to optimise response times.
>
> All financial values (annual losses, present values) are expressed in USD per **$1B asset value exposure**.

```json
{
  "country": "USA",
  "country_name": "United States",
  "sector": "C26",
  "sector_name": "Computer, electronic and optical products",

  "direct_risk": {
    "climate": 2.74,
    "modern_slavery": 2.22,
    "political": 2.18,
    "water_stress": 2.76,
    "nature_loss": 2.61,
    "expected_loss": {
      "total_annual_loss": 100886200,
      "total_annual_loss_pct": 10.09,
      "present_value": 1368900603,
      "discount_rate": 0.10,
      "growth_rate": 0.04,
      "pv_horizon": 30,
      "risk_breakdown": {
        "hurricane": { "annual_loss": 5234120, "annual_loss_pct": 0.52, "present_value": 71020516 },
        "flood": { "annual_loss": 42135670, "annual_loss_pct": 4.21, "present_value": 571728780 },
        "heat_stress": { "annual_loss": 30234450, "annual_loss_pct": 3.02, "present_value": 410243986 },
        "drought": { "annual_loss": 20234890, "annual_loss_pct": 2.02, "present_value": 274562360 },
        "extreme_precipitation": { "annual_loss": 3047070, "annual_loss_pct": 0.30, "present_value": 41344961 }
      }
    }
  },

  "indirect_risk": {
    "climate": 2.97,
    "modern_slavery": 2.46,
    "political": 2.29,
    "water_stress": 3.11,
    "nature_loss": 2.84,
    "expected_loss": {
      "total_annual_loss": 100121400,
      "total_annual_loss_pct": 10.01,
      "present_value": 1358524816,
      "discount_rate": 0.10,
      "growth_rate": 0.04,
      "pv_horizon": 30,
      "risk_breakdown": {
        "hurricane": { "annual_loss": 5012300, "annual_loss_pct": 0.50, "present_value": 67988944 },
        "flood": { "annual_loss": 41234560, "annual_loss_pct": 4.12, "present_value": 559509120 },
        "heat_stress": { "annual_loss": 29456780, "annual_loss_pct": 2.95, "present_value": 399689416 },
        "drought": { "annual_loss": 19876540, "annual_loss_pct": 1.99, "present_value": 269701024 },
        "extreme_precipitation": { "annual_loss": 4541220, "annual_loss_pct": 0.45, "present_value": 61636312 }
      }
    }
  },

  "total_risk": {
    "climate": 2.83,
    "modern_slavery": 2.32,
    "political": 2.22,
    "water_stress": 2.90,
    "nature_loss": 2.70
  },

  "supply_chain_tiers": [
    {
      "tier": 1,
      "weight": 0.50,
      "supplier_count": 10,
      "risk": {
        "climate": 3.02,
        "modern_slavery": 2.48,
        "political": 2.38,
        "water_stress": 3.20,
        "nature_loss": 2.87
      },
      "expected_loss": {
        "total_annual_loss": 91127860,
        "total_annual_loss_pct": 9.11,
        "present_value": 1236382640,
        "discount_rate": 0.10,
        "growth_rate": 0.04,
        "pv_horizon": 30,
        "risk_breakdown": {
          "hurricane": { "annual_loss": 4523100, "annual_loss_pct": 0.45, "present_value": 61390356 },
          "flood": { "annual_loss": 38234560, "annual_loss_pct": 3.82, "present_value": 518775936 },
          "heat_stress": { "annual_loss": 27456780, "annual_loss_pct": 2.75, "present_value": 372557932 },
          "drought": { "annual_loss": 16234560, "annual_loss_pct": 1.62, "present_value": 220268464 },
          "extreme_precipitation": { "annual_loss": 4678860, "annual_loss_pct": 0.47, "present_value": 63503952 }
        }
      },
      "suppliers": [
        {
          "country": "CHN",
          "sector": "C26",
          "coefficient": 0.0685,
          "country_name": "China",
          "sector_name": "Computer, electronic and optical products",
          "tier": 1,
          "direct_risk": {
            "climate": 3.12,
            "modern_slavery": 3.85,
            "political": 3.42,
            "water_stress": 3.95,
            "nature_loss": 3.78
          },
          "risk_contribution": {
            "climate": 0.9415,
            "modern_slavery": 1.1614,
            "political": 1.0317,
            "water_stress": 1.1916,
            "nature_loss": 1.1403
          },
          "expected_loss_contribution": {
            "annual_loss": 10226550,
            "present_value": 138758321
          }
        }
      ]
    },
    {
      "tier": 2,
      "weight": 0.35,
      "supplier_count": 16,
      "risk": { "...risk scores..." },
      "expected_loss": { "...tier loss..." },
      "suppliers": ["...suppliers array..."]
    },
    {
      "tier": 3,
      "weight": 0.15,
      "supplier_count": 20,
      "risk": { "...risk scores..." },
      "expected_loss": { "...tier loss..." },
      "suppliers": ["...suppliers array..."]
    }
  ],

  "top_suppliers": [
    "...flat list of all suppliers across all tiers, each with a 'tier' field..."
  ]
}
```

**Response Field Definitions:**

| Field | Description |
|-------|-------------|
| `direct_risk` | Risk scores for the country where the company operates directly |
| `direct_risk.expected_loss` | Financial loss estimates from physical climate hazards per $1B asset exposure |
| `direct_risk.expected_loss.total_annual_loss` | Total expected annual loss in USD per $1B exposure |
| `direct_risk.expected_loss.total_annual_loss_pct` | Annual loss as percentage of exposure |
| `direct_risk.expected_loss.present_value` | Present value of growing expected losses over the specified horizon (USD) |
| `direct_risk.expected_loss.discount_rate` | Discount rate used for PV calculation (as provided or default 0.10) |
| `direct_risk.expected_loss.growth_rate` | Annual loss growth rate used for PV calculation (as provided or default 0.04) |
| `direct_risk.expected_loss.pv_horizon` | Time horizon in years for PV calculation (as provided or default 30) |
| `direct_risk.expected_loss.risk_breakdown` | Loss decomposed by hazard type, each with `annual_loss`, `annual_loss_pct`, and `present_value` |
| `indirect_risk` | Weighted average risk from upstream supply chain across all 3 tiers |
| `indirect_risk.expected_loss` | Aggregated expected loss from all upstream suppliers (tier-weighted), with per-hazard breakdown and present values |
| `total_risk` | Blended score: 60% direct + 40% indirect |
| `supply_chain_tiers` | Array of 3 tier objects with per-tier risk, expected loss, and supplier detail |
| `supply_chain_tiers[].tier` | Tier number (1, 2, or 3) |
| `supply_chain_tiers[].weight` | Weight applied to this tier (0.50, 0.35, or 0.15) |
| `supply_chain_tiers[].supplier_count` | Number of distinct suppliers in this tier |
| `supply_chain_tiers[].risk` | Coefficient-weighted average risk scores for this tier |
| `supply_chain_tiers[].expected_loss` | Aggregated expected loss across suppliers in this tier, with per-hazard breakdown and present values |
| `supply_chain_tiers[].suppliers` | Array of supplier objects in this tier |
| `top_suppliers` | Flat list of all suppliers across all 3 tiers |
| `top_suppliers[].tier` | Which tier this supplier belongs to (1, 2, or 3) |
| `top_suppliers[].coefficient` | OECD I-O coefficient (share of inputs from this supplier) |
| `top_suppliers[].direct_risk` | The supplier's own country-level risk scores |
| `top_suppliers[].risk_contribution` | Risk contributed by this supplier (coefficient-weighted within its tier) |
| `top_suppliers[].expected_loss_contribution` | Financial loss attributed to this supplier (`annual_loss` and `present_value`) |

### Present Value Calculation

The `present_value` field represents the present value of a growing stream of expected losses over a specified time horizon. This accounts for the fact that climate-related losses are expected to increase over time due to climate change.

**Formula (Growing Annuity):**

```
PV = L / (r - g) × [1 - ((1 + g) / (1 + r))^T]
```

Where:
- `L` = current annual expected loss (USD)
- `r` = discount rate (default 0.10 = 10%)
- `g` = annual growth rate of losses (default 0.04 = 4%)
- `T` = time horizon in years (default 30)

**Interpretation:**
- The annual loss `L` is assumed to grow at rate `g` per year (reflecting increasing climate risk)
- Future losses are discounted at rate `r` to their present value
- The result represents the total economic cost of climate risk exposure over the time horizon, in today's dollars
- This is computed for each individual hazard type (hurricane, flood, heat stress, drought, extreme precipitation) as well as the total

**Example with defaults (10% discount, 4% growth, 30 years):**

For a country with $100M annual expected loss:
```
PV = $100M / (0.10 - 0.04) × [1 - (1.04 / 1.10)^30]
   = $100M / 0.06 × [1 - 0.8143]
   = $100M × 16.667 × 0.8143 ≈ $1,357M
```

**Customising PV parameters:**

To use a lower discount rate (e.g., 5%) with higher growth (6%) over 50 years:
```
GET /api/assess?country=USA&sector=C26&discount_rate=0.05&growth_rate=0.06&pv_horizon=50
```

> **Note:** If `discount_rate` equals `growth_rate`, the formula degenerates to `PV = L × T / (1 + r)` (a finite annuity at constant real terms).

### How Indirect Risk is Calculated

1. For each tier, supplier coefficients are normalised (summed to 1.0 within the tier)
2. Each supplier's risk scores are multiplied by their normalised coefficient
3. The tier-level risk is the sum of all coefficient-weighted supplier risks
4. The overall indirect risk = (Tier 1 risk × 0.50) + (Tier 2 risk × 0.35) + (Tier 3 risk × 0.15)
5. Total risk = (Direct risk × 0.60) + (Indirect risk × 0.40)

---

## Integration Examples

### Python

```python
import requests

BASE_URL = "https://supply-chain-risk-api-7567b2b7e4c5.herokuapp.com"

def get_risk_assessment(country_iso3: str, sector_isic: str,
                        discount_rate: float = 0.10,
                        growth_rate: float = 0.04,
                        pv_horizon: int = 30) -> dict:
    response = requests.get(
        f"{BASE_URL}/api/assess",
        params={
            "country": country_iso3,
            "sector": sector_isic,
            "discount_rate": discount_rate,
            "growth_rate": growth_rate,
            "pv_horizon": pv_horizon,
        }
    )
    response.raise_for_status()
    return response.json()

# Example: Assess electronics supply chain risk for a US company
result = get_risk_assessment("USA", "C26")

# Overall risk
print(f"Total climate risk: {result['total_risk']['climate']}")

# Financial impact
el = result['direct_risk']['expected_loss']
print(f"Annual expected loss: ${el['total_annual_loss']:,.0f}")
print(f"Present value ({el['pv_horizon']}yr, {el['discount_rate']*100:.0f}% discount, "
      f"{el['growth_rate']*100:.0f}% growth): ${el['present_value']:,.0f}")

# Per-hazard breakdown with PV
for hazard, data in el['risk_breakdown'].items():
    print(f"  {hazard}: annual ${data['annual_loss']:,.0f}, PV ${data['present_value']:,.0f}")

# Supply chain tier breakdown
for tier in result['supply_chain_tiers']:
    avg_risk = sum(tier['risk'].values()) / 5
    print(f"Tier {tier['tier']} ({tier['weight']*100:.0f}% weight): "
          f"{tier['supplier_count']} suppliers, avg risk {avg_risk:.2f}")
    if tier['expected_loss']:
        print(f"  Expected annual loss: ${tier['expected_loss']['total_annual_loss']:,.0f}")

# Custom PV parameters (e.g., for ESG reporting with lower discount rate)
result_custom = get_risk_assessment("USA", "C26", discount_rate=0.05, growth_rate=0.03, pv_horizon=50)
el_custom = result_custom['direct_risk']['expected_loss']
print(f"50yr PV at 5% discount: ${el_custom['present_value']:,.0f}")
```

### JavaScript / TypeScript

```javascript
const BASE_URL = "https://supply-chain-risk-api-7567b2b7e4c5.herokuapp.com";

async function getRiskAssessment(country, sector, options = {}) {
  const params = new URLSearchParams({
    country,
    sector,
    ...(options.discount_rate && { discount_rate: options.discount_rate }),
    ...(options.growth_rate && { growth_rate: options.growth_rate }),
    ...(options.pv_horizon && { pv_horizon: options.pv_horizon }),
  });
  const response = await fetch(`${BASE_URL}/api/assess?${params}`);
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}

// Example: Assess with custom PV parameters
const result = await getRiskAssessment("USA", "C26", {
  discount_rate: 0.08,
  growth_rate: 0.05,
  pv_horizon: 40,
});

// Financial impact
const el = result.direct_risk.expected_loss;
console.log(`Annual loss: $${el.total_annual_loss.toLocaleString()}`);
console.log(`Present value (${el.pv_horizon}yr): $${el.present_value.toLocaleString()}`);

// Per-hazard PV breakdown
for (const [hazard, data] of Object.entries(el.risk_breakdown)) {
  console.log(`  ${hazard}: annual $${data.annual_loss.toLocaleString()}, PV $${data.present_value.toLocaleString()}`);
}

// Tier-level breakdown
for (const tier of result.supply_chain_tiers) {
  console.log(`Tier ${tier.tier} (${tier.weight * 100}% weight):`);
  console.log(`  Suppliers: ${tier.supplier_count}`);
  if (tier.expected_loss) {
    console.log(`  Expected annual loss: $${tier.expected_loss.total_annual_loss.toLocaleString()}`);
  }
}
```

### ISIN-to-Assessment Workflow (Python)

```python
import pycountry

def isin_to_iso3(isin: str) -> str:
    iso2 = isin[:2]
    country = pycountry.countries.get(alpha_2=iso2)
    return country.alpha_3 if country else None

# Example: Apple Inc. (ISIN: US0378331005)
isin = "US0378331005"
country_code = isin_to_iso3(isin)  # Returns "USA"
sector_code = "C26"  # Computer, electronic and optical products

assessment = get_risk_assessment(country_code, sector_code)

# Financial summary
el = assessment['direct_risk']['expected_loss']
print(f"Annual expected loss: ${el['total_annual_loss']:,.0f}")
print(f"Present value of losses: ${el['present_value']:,.0f}")
print(f"  (discount_rate={el['discount_rate']}, growth_rate={el['growth_rate']}, horizon={el['pv_horizon']}yr)")

# Supply chain tiers
for tier in assessment['supply_chain_tiers']:
    print(f"Tier {tier['tier']}: {tier['supplier_count']} suppliers")
    for supplier in tier['suppliers']:
        loss_info = ""
        if supplier.get('expected_loss_contribution'):
            loss_info = f", PV ${supplier['expected_loss_contribution']['present_value']:,.0f}"
        print(f"  {supplier['country_name']} / {supplier['sector_name']} "
              f"(coeff: {supplier['coefficient']:.4f}{loss_info})")
```

---

## Error Handling

| Status Code | Meaning |
|-------------|---------|
| 200 | Success |
| 400 | Invalid country or sector code |
| 404 | Endpoint not found |
| 500 | Server error |

**Error response format:**
```json
{
  "error": "Invalid country code: XYZ"
}
```

---

## Climate Risk Data Source

The `expected_loss` fields in the response are sourced **live** from the [Climate Risk API V6 (Probabilistic Model)](https://climate-risk-api-v6-prob-be68437e49be.herokuapp.com), which calculates Expected Annual Loss (EAL) per $1B of exposure using real scientific datasets:

| Data Source | Coverage | Description |
|-------------|----------|-------------|
| NOAA IBTrACS | 131,076 hurricane records (2004-2024) | Global tropical cyclone basin data |
| WRI Aqueduct | 7,473 flood grid points, 7 return periods | Global flood risk modeling |
| HadEX3 | Temperature + precipitation extremes | Global land, 2.5 deg grid (GEV/Gamma distributions) |

**How it works:**
1. When a risk assessment is requested, the supply chain API calls the Climate Risk API's country endpoint with `asset_value = $1,000,000,000`
2. The Climate API evaluates a 9-point weighted grid across the country (center 25%, cardinals 10% each, diagonals 9% each)
3. Results are cached for 1 hour per country to reduce response times on subsequent requests
4. If the Climate API is temporarily unavailable (e.g., cold start, maintenance), the system falls back to pre-computed static values

**Response time impact:** The first request for a given country takes 20-30 seconds (Climate API processing time). Subsequent requests within the 1-hour cache window return in <100ms. Use `skip_climate=true` to bypass climate data entirely for faster responses.

---

## Rate Limits

No rate limits are currently enforced. Note that the first request for each country may take 20-30 seconds due to the live Climate Risk API call. For bulk assessments, results are cached for 1 hour, so subsequent requests for the same country will be fast.

## Availability

The API runs on a Heroku Basic dyno and is available 24/7 with no scheduled downtime or sleep periods. The Climate Risk API V6 also runs on Heroku (Standard-2X dyno) and is available 24/7.

## Coverage

- **85 countries** across all major economic regions
- **52 sectors** based on ISIC Rev.4 classification
- **5 risk dimensions** per country
- **3-tier supply chain model** with I-O coefficient cascading (Tier 1: 50%, Tier 2: 35%, Tier 3: 15%)
- **OECD I-O coefficients** for upstream supply chain modeling
- **Live climate data** from NOAA, WRI Aqueduct, and HadEX3 via Climate Risk API V6
