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

## Supply Chain Risk Scaling
- Supply Chain API returns expected loss per $1M of exposure
- SUPPLIERCOSTS field in uploaded spreadsheet = company's annual supplier spending in $'000s
- Scale factor = supplierCosts * 1000 / 1,000,000 (actual exposure / $1M)
- All stored supply chain EAL values are scaled to actual supplier exposure
- If no supplier costs data available, falls back to raw per-$1M values (scale factor = 1)

## Key Features
1. **Company Dashboard** (`/`) - Overview with add-by-ISIN, search, risk summary cards
2. **Company Detail** (`/company/:id`) - Full risk breakdown with asset table, supply chain, management scores
3. **Calculation Monitor** (`/monitor`) - Real-time progress tracking with pause/resume/delete
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
server/utils/mappings.ts   - ISIN-to-ISO3 and sector-to-ISIC mappings
client/src/App.tsx          - Routes & app shell
client/src/components/Layout.tsx - Navigation header
client/src/pages/Dashboard.tsx     - Main dashboard
client/src/pages/CompanyDetail.tsx - Company risk details
client/src/pages/CalculationMonitor.tsx - Job monitoring
client/src/pages/CompanyList.tsx       - Company list upload & management
```

## User Preferences
- Dark mode support with toggle
- Database starts empty, companies added via ISIN
- Deployment target: GitHub sync + Heroku (persistent running)
