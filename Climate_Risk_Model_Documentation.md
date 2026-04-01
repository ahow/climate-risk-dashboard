# Climate Risk Dashboard - Model Documentation

## 1. Introduction

The Climate Risk Dashboard is a quantitative tool that estimates the financial exposure of publicly traded companies to climate-related risks. It integrates data from four external APIs with company financial data to produce a consolidated risk metric for each company.

The model produces three key outputs for each company:

- **Total Exposure PV**: The present value of expected climate-related financial losses over a 30-year horizon, combining direct geographic risk and indirect supply chain risk.
- **Adjusted Exposure PV**: Total exposure reduced by a management quality factor, reflecting the company's ability to mitigate climate risks.
- **Valuation Exposure %**: Adjusted exposure expressed as a percentage of enterprise value, enabling cross-company comparison regardless of size.

---

## 2. Data Inputs

### 2.1 Company Financial Data

Companies are loaded via spreadsheet upload containing the following fields per company:

| Field | Description | Units |
|-------|-------------|-------|
| ISIN | International Securities Identification Number | - |
| Company Name | Legal entity name | - |
| Sector | Industry classification | - |
| Country | Country of domicile | - |
| Total Asset Value | Total reported asset value | USD |
| Enterprise Value (EV) | Market capitalisation + debt - cash | USD |
| Supplier Costs | Total annual spend on suppliers | USD |

All financial values are stored and processed in US dollars with no currency conversion.

### 2.2 External API Data Sources

The model draws on four public APIs (no authentication required):

#### 2.2.1 Asset Locations API
- **Endpoint**: `GET /api/assets/isin/{isin}`
- **Purpose**: Returns the geographic coordinates (latitude, longitude) and estimated value of each physical facility owned by a company.
- **Important**: The API returns synthetic facility-level valuations. The sum of individual facility values frequently exceeds the company's actual total asset value. This is addressed by the geo scaling factor (Section 3.1.2).

#### 2.2.2 Climate Risk API V6
- **Endpoint**: `POST /assess`
- **Inputs**: latitude, longitude, asset_value
- **Purpose**: Returns Expected Annual Loss (EAL) for five climate hazards at a specific geographic location:
  1. Flood
  2. Drought
  3. Heat Stress
  4. Hurricane
  5. Extreme Precipitation
- **Output**: Per-hazard EAL and a 30-year Present Value (PV) incorporating growth and discount rates embedded in the API's probabilistic model.

#### 2.2.3 Supply Chain Risk API
- **Endpoint**: `GET /api/assess?country={ISO3}&sector={ISIC}`
- **Purpose**: Assesses indirect climate exposure through supplier networks based on the company's country of domicile (ISO 3166-1 alpha-3) and industry sector (ISIC Rev. 4 code).
- **Output structure**: Returns both direct and indirect risk components. Each component includes:
  - `total_annual_loss`: Expected annual loss
  - `present_value`: 30-year PV of expected losses
  - `risk_breakdown`: Per-hazard breakdown (flood, drought, heat_stress, hurricane, extreme_precipitation)
- **Scaling**: Values are returned per $1 billion of exposure and must be scaled by the company's actual supplier costs.
- **Note**: Only the indirect risk component is used (see Section 3.2 for rationale).

#### 2.2.4 Management Performance API
- **Endpoint**: `GET /api/lookup/{isin}`
- **Purpose**: Scores each company's climate risk management practices.
- **Output**: 44 individual measures grouped into 9 categories, producing a total score expressed as a percentage (e.g., 27 means 27%).
- **Fallback**: When ISIN lookup fails, a name-matching fallback is attempted to handle cross-listing differences (e.g., a company listed under both GB and AU ISINs).

---

## 3. Calculation Methodology

### 3.1 Direct (Geographic) Risk

#### 3.1.1 Per-Facility Assessment

Each physical facility identified by the Asset Locations API is individually assessed:

1. The facility's coordinates and estimated value are submitted to the Climate Risk API V6.
2. The API returns EAL and PV for each of the five climate hazards.
3. Per-facility total geographic risk PV = sum of PVs across all five hazards.

#### 3.1.2 Geo Scaling Factor

The Asset Locations API allocates synthetic per-facility valuations that frequently sum to significantly more than the company's actual total asset value. To correct for this:

```
apiAssetTotal = SUM(estimated_value_usd) across all facilities for the company
geoScaleFactor = company.totalAssetValue / apiAssetTotal
```

This factor is applied when `apiAssetTotal > company.totalAssetValue` (i.e., the API overestimates). When the API total is less than or equal to the company's reported assets, the scale factor defaults to 1 (no adjustment).

#### 3.1.3 Company-Level Direct Risk PV

```
Direct Risk PV = SUM(per-facility PV across all hazards) × geoScaleFactor
```

This ensures the geographic risk is proportional to the company's actual asset base, not the API's synthetic allocation.

### 3.2 Indirect (Supply Chain) Risk

#### 3.2.1 Rationale for Using Only Indirect Risk

The Supply Chain Risk API returns both direct and indirect risk components. The model uses **only the indirect component** because:

- Direct climate risk on the company's own physical assets is already captured by the geographic risk assessment (Section 3.1).
- Using the direct component from both the geographic and supply chain APIs would double-count the company's own-asset exposure.
- The indirect component captures the separate risk channel: vulnerability of the company's supplier network to climate disruption.

#### 3.2.2 Supply Chain PV Calculation

The Supply Chain API returns values per $1 billion of exposure:

```
scaleFactor = company.supplierCosts / 1,000,000,000
Supply Chain Risk PV = API.indirect_risk.present_value × scaleFactor
```

If the company has no supplier costs data, the scale factor defaults to 1 (raw per-$1B values are used, which effectively assumes $1B of supplier exposure).

#### 3.2.3 Legacy API Handling

Older versions of the Supply Chain API do not include a `present_value` field. In this case:

```
scaleFactor = company.supplierCosts / 1,000,000  (per $1M for old API)
PV = total_annual_loss × 13.57                    (PV conversion factor)
Supply Chain Risk PV = PV × scaleFactor
```

The PV conversion factor of 13.57 approximates a 30-year present value annuity at the same growth and discount rates used by the new API.

#### 3.2.4 Hazard Breakdown

The supply chain PV can be decomposed into five hazard categories, each scaled by the same factor:
- Flood
- Drought
- Heat Stress
- Hurricane
- Extreme Precipitation

### 3.3 Management Performance Adjustment

#### 3.3.1 Score Interpretation

The Management API returns a `totalScore` field that directly represents a percentage. For example, a `totalScore` of 27 means the company scored 27% of the maximum possible management quality.

The `totalPossible` field (always 26) indicates the number of measures assessed, not a denominator for percentage calculation.

#### 3.3.2 Adjustment Formula

The management score is used as a mitigating factor on total exposure:

```
mgmtScorePct = totalScore / 100
Adjusted Exposure PV = Total Exposure PV × (1 − 0.7 × mgmtScorePct)
```

The 0.7 coefficient means:
- A company with 0% management score receives no mitigation (full exposure).
- A company with 100% management score has its exposure reduced by 70%.
- The remaining 30% represents residual, unmitigatable climate risk.

### 3.4 Final Metrics

#### 3.4.1 Total Exposure PV

```
Total Exposure PV = Direct Risk PV + Supply Chain Risk PV
```

#### 3.4.2 Adjusted Exposure PV

```
Adjusted Exposure PV = Total Exposure PV × (1 − 0.7 × mgmtScorePct)
```

If no management score is available, the adjusted exposure equals the total exposure (no mitigation applied).

#### 3.4.3 Valuation Exposure %

```
Valuation Exposure % = (Adjusted Exposure PV / Enterprise Value) × 100
```

This enables comparison across companies of different sizes. A higher percentage indicates greater climate-related financial risk relative to the company's market valuation.

---

## 4. Data Quality Controls

### 4.1 Incomplete Company Filtering

Companies missing any of the three core financial inputs (total asset value, supplier costs, or enterprise value) are excluded from dashboard totals by default. These companies cannot be properly assessed because:

- Without total asset value, the geo scaling factor cannot be calculated, leading to inflated direct risk figures based on the Asset API's synthetic valuations.
- Without supplier costs, the supply chain risk cannot be scaled to the company's actual exposure.
- Without enterprise value, the valuation exposure percentage cannot be computed.

A toggle allows users to include these companies if desired.

### 4.2 Sector Filtering

Financial sector companies can be excluded via toggle, as their asset structures and risk profiles differ materially from industrial/commercial companies and can distort portfolio-level aggregates.

### 4.3 CSV Export Filtering

The CSV export supports query parameters to match dashboard filtering:
- `excludeIncomplete=true` (default): Excludes companies with missing financial data.
- `excludeIncomplete=false`: Includes all companies.
- `excludeFinancials=true`: Excludes financial sector companies.

---

## 5. Sector and Country Mapping

### 5.1 Country Mapping

Company countries are mapped to ISO 3166-1 alpha-3 codes for the Supply Chain API. The mapping handles common variations in country names and covers all major markets.

### 5.2 Sector Mapping

Company sectors are mapped to ISIC Rev. 4 codes for the Supply Chain API. The mapping aims to find the closest ISIC code for each sector classification:

| Sector | ISIC Code | Description |
|--------|-----------|-------------|
| Energy | B06 | Extraction of crude petroleum and natural gas |
| Materials | C24 | Manufacture of basic metals |
| Industrials | C28 | Manufacture of machinery and equipment |
| Consumer Discretionary | C29 | Manufacture of motor vehicles |
| Consumer Staples | C10 | Manufacture of food products |
| Health Care | C21 | Manufacture of pharmaceuticals |
| Information Technology | C26 | Manufacture of electronic components |
| Communication Services | J61 | Telecommunications |
| Utilities | D35 | Electric power generation and distribution |
| Real Estate | L68 | Real estate activities |
| Media & Entertainment | J58 | Publishing activities |

Note: Some mappings are approximations. For example, "Industrials" covers a broad range of sub-sectors (railroads, airlines, defence, etc.) that ideally would map to different ISIC codes (H49 for rail, H51 for air transport, etc.).

---

## 6. Processing Architecture

### 6.1 Batch Processing

Company risk assessments are processed in batches with the following features:

- **Pause/Resume**: Long-running batch operations can be paused and resumed, preserving progress.
- **Concurrency**: API calls are made with controlled concurrency to avoid overwhelming external services.
- **Progress Tracking**: Real-time progress is visible on the Calculation Monitor page.
- **Auto-Recovery**: If the server restarts during processing, orphaned operations are automatically detected and resumed, skipping companies that were already completed.

### 6.2 Processing Steps Per Company

For each company, the following steps are executed in sequence:

1. Fetch asset locations from the Asset Locations API.
2. For each facility, assess geographic risk via the Climate Risk API V6.
3. Assess supply chain risk via the Supply Chain Risk API.
4. Fetch management performance score from the Management Performance API.

### 6.3 Rate Limiting and Reliability

- External API calls include retry logic with exponential backoff.
- Database connection pooling (max 5 connections) manages database load.
- The Supply Chain API caches climate data per country for approximately 1 hour, which can cause ~25% variation in values between calls for the same inputs during cache refresh periods.

---

## 7. Limitations and Caveats

1. **Synthetic Asset Valuations**: The Asset Locations API does not provide actual facility values. Its synthetic allocations are corrected by the geo scaling factor, but the geographic distribution of assets may not perfectly reflect reality.

2. **Sector Mapping Granularity**: The sector-to-ISIC mapping uses broad categories. Sub-sector variation (e.g., railroads vs. airlines within "Industrials") is not captured.

3. **Supply Chain API Variability**: Values can vary approximately 25% between calls for the same inputs due to live climate data caching. Results represent a point-in-time estimate.

4. **Management Score Coverage**: Not all companies have management performance data in the API. Companies without scores receive no mitigation adjustment (conservative approach).

5. **Currency**: All values are in USD. Companies reporting in other currencies may have translation effects not captured by the model.

6. **Climate Scenarios**: The underlying Climate Risk API uses a specific climate scenario and time horizon. The model does not currently support scenario comparison (e.g., RCP 4.5 vs RCP 8.5).

7. **Static Financial Data**: Company financial data (assets, EV, supplier costs) is loaded from a point-in-time spreadsheet and does not update automatically.

8. **30-Year Horizon**: All present values use a 30-year horizon with growth and discount rates embedded in the external APIs. These rates are not user-configurable.

---

## 8. Output Interpretation

### 8.1 Dashboard Summary Cards

| Metric | Description |
|--------|-------------|
| Companies | Count of companies in the filtered view |
| Total Asset Value | Sum of total asset values for filtered companies |
| Direct Risk PV | Sum of geographic risk PVs (with % of total exposure) |
| Supply Chain Risk PV | Sum of supply chain risk PVs (with % of total exposure) |
| Total Exposure PV | Combined direct + supply chain risk PV |
| Supplier Costs | Sum of supplier costs for filtered companies |

### 8.2 Per-Company Table Columns

| Column | Description |
|--------|-------------|
| Total Assets | Company's total reported asset value |
| EV | Enterprise Value |
| Direct PV | Geographic risk present value (scaled) |
| SC PV | Supply chain indirect risk present value (scaled) |
| Total PV | Direct PV + SC PV |
| Mgmt | Management performance score as percentage |
| Adjusted PV | Total PV adjusted by management score |
| Val. Exp. | Adjusted PV as percentage of Enterprise Value |

### 8.3 Company Detail View

The company detail page provides:
- Full breakdown of geographic risk by facility and hazard type.
- Supply chain risk breakdown by hazard category.
- Management performance scores across all 9 categories and 44 measures.
- The complete calculation chain from raw API values to final adjusted exposure.
