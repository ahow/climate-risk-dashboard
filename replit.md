# Climate Risk Dashboard

## Overview
A full-stack web application that quantifies and visualizes climate-related financial risks for publicly traded companies. Database starts empty; users add companies by ISIN code.

## Architecture
- **Frontend**: React + Vite + TanStack Query + Tailwind CSS + shadcn/ui
- **Backend**: Express.js + Drizzle ORM
- **Database**: PostgreSQL (Replit-managed)
- **Routing**: wouter (frontend), Express routes (backend)

## External APIs (all public, no auth required)
1. **Asset Locations API**: `https://corporate-asset-database-251730b20663.herokuapp.com`
   - `GET /api/assets/isin/{isin}` - Fetch company assets by ISIN
2. **Climate Risk API V6**: `https://climate-risk-api-v6-prob-be68437e49be.herokuapp.com`
   - `POST /assess` - Geographic risk assessment (lat, lon, asset_value)
3. **Supply Chain Risk API**: `https://supply-chain-risk-api-7567b2b7e4c5.herokuapp.com`
   - `GET /api/assess?country={ISO3}&sector={ISIC}` - Multi-dimensional supply chain risk
4. **Management Performance API**: `https://climate-risk-replit-562361beb142.herokuapp.com`
   - `GET /api/lookup/{isin}` - Management performance scores (44 measures, 9 categories)

## Database Schema
- `companies` - Company info with ISIN, sector, country, asset value, supplier_costs ($'000s from uploaded list)
- `assets` - Physical facilities with coordinates and valuations
- `geo_risks` - Per-asset climate hazard Expected Annual Loss (5 hazards)
- `supply_chain_risks` - Country-sector risk assessment with expected loss scaled by supplier costs
- `management_scores` - Management performance scoring (9 categories, 44 measures)
- `operations` - Batch processing job tracking with pause/resume
- `company_list_uploads` - Metadata for uploaded company spreadsheets
- `company_list_entries` - Individual company rows from uploaded spreadsheets

## Unit Handling
- All financial values (spreadsheet uploads, Asset API, internal storage) are in actual US dollars — no unit conversions
- Spreadsheet columns TotalValue, EV, SUPPLIERCOSTS are stored as-is in both `company_list_entries` and `companies`
- Asset API `estimated_value_usd` values are stored as-is
- `POST /api/fix-units` endpoint: syncs company financial values (totalAssetValue, ev, supplierCosts) from the latest spreadsheet entries

## Geographic Risk Scaling
- Asset API allocates synthetic per-facility values that can sum to much more than the company's actual total
- Server-side geo scaling: `geoScaleFactor = company.totalAssetValue / SUM(asset.estimatedValueUsd)` when API total exceeds company total
- Applied in `/api/companies` (batch), `/api/companies/:id` (detail), and `/api/export/csv`
- This ensures geo risk PV is proportional to the company's actual asset value, not the API's synthetic allocation

## Supply Chain Risk Scaling
- Supply Chain API returns expected loss per $1B of exposure
- Only **indirect risk** is used from the Supply Chain API (direct climate risk is captured by Geographic Risk on actual assets)
- Primary metric: `present_value` (PV) from the API, not `total_annual_loss`
- **New API** (has `present_value` field): values are per $1B exposure → scale factor = supplierCosts / 1,000,000,000
- **Old API** (no `present_value` field): values are per $1M exposure → scale factor = supplierCosts / 1,000,000; PV estimated as total_annual_loss × 13.57
- Hazard breakdown PVs available: flood, drought, heat_stress, hurricane, extreme_precipitation
- `supplyChainTiers` JSONB column stores tier-level PV breakdowns
- If no supplier costs data available, falls back to raw per-$1B values (scale factor = 1)
- Dashboard and CompanyDetail display PV-based values throughout

## ISIC Sector Code Classification
- Three-tier classification: L4 sub-sector (from spreadsheet) → company name keywords → sector name mapping
- `sectorToIsic(sector, l4Sector?, companyName?)` resolves the best ISIC code
- **L4 sub-sector mapping**: Uses spreadsheet L4 fields (Industrials, Energy, Financials have L4 data)
- **Company name keyword matching**: For Consumer Discretionary and Industrials without L4 data:
  - Auto manufacturers/parts → C29 (Motor vehicles)
  - Hotels/restaurants/gaming → I (Accommodation & food)
  - Homebuilders → F (Construction)
  - Home appliances → C27 (Electrical equipment)
- **Direct sector name mapping**: 70+ sector name → ISIC code mappings, sorted by specificity (longest match first)
- ISIC code is recalculated and updated on the company record during "Process All" bulk reprocessing
- Valid SC API ISIC codes: A01-A03, B05-B06, B07-B08, C10-C12, C16, C19-C30, D35, F, G45-G47, H49-H53, I, J58, J61, K64-K66, L68, M, N, O, P, Q

## Management Score Display
- The Management API `totalScore` field IS the percentage (e.g. 27 means 27%), not a raw score to divide
- `totalPossible` is always 26 (number of measures assessed)
- Display `totalScore` directly as the percentage
- For Adjusted Exposure calculation: `mgmtScorePct = totalScore / 100`
- Name-matching fallback used when ISIN not found in Management API (e.g. Rio Tinto GB→AU, EQT SE→US)

## Key Features
1. **Company Dashboard** (`/`) - Overview with add-by-ISIN, search, risk summary cards
2. **Company Detail** (`/company/:id`) - Full risk breakdown with asset table, supply chain, management scores
3. **Calculation Monitor** (`/monitor`) - Real-time progress tracking with pause/resume/delete; "Process Missing" button for incomplete companies only; "Process All" button for full reprocessing
4. **Company List** (`/company-list`) - Upload Excel spreadsheets, permanent download URLs for sharing
5. **CSV Export** - Download all company risk data as CSV

## File Structure
```
shared/schema.ts           - Database schema & types
server/db.ts               - Database connection
server/storage.ts          - Storage interface (CRUD)
server/routes.ts           - API routes
server/services/externalApis.ts    - External API integrations
server/services/operationManager.ts - Batch processing engine
server/utils/mappings.ts   - ISIN-to-ISO3, sector-to-ISIC, and company name classification
client/src/App.tsx          - Routes & app shell
client/src/components/Layout.tsx - Navigation header
client/src/pages/Dashboard.tsx     - Main dashboard
client/src/pages/CompanyDetail.tsx - Company risk details
client/src/pages/CalculationMonitor.tsx - Job monitoring
client/src/pages/CompanyList.tsx       - Company list upload & management
client/src/pages/Information.tsx       - Model methodology & documentation
Climate_Risk_Model_Documentation.md   - Detailed model documentation
```

## User Preferences
- Dark mode support with toggle
- Database starts empty, companies added via ISIN
- Deployment target: GitHub sync + Heroku (persistent running)
