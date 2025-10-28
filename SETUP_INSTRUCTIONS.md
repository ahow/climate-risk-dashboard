# Climate Risk Dashboard - Setup Instructions

## Overview

This dashboard integrates three external APIs to provide comprehensive climate risk analysis for companies:

1. **Asset Discovery API** - Provides company asset locations and valuations
2. **Geographic Risks API** - Assesses physical climate risks for specific coordinates
3. **Risk Management API** - Evaluates company risk management capabilities

## Current Status

✅ **Completed:**
- Database schema with tables for companies, assets, geographic risks, and risk management scores
- 20 companies loaded from Excel file
- Interactive frontend with company list and detail views
- Backend tRPC procedures for data fetching and calculations
- Overall expected loss calculation: `(Direct Exposure + Indirect Exposure) × (100% - Risk Management Score)`
- Expandable sections for direct exposure and risk management details

⚠️ **Requires Configuration:**
- Asset Discovery API endpoint URL
- Risk Management API endpoint URL
- API authentication (if required)

## API Configuration

### 1. Geographic Risks API
**Status:** ✅ Configured  
**Endpoint:** `https://5000-ie5oom8cn8x48wkgrn5wb-14f4b140.manusvm.computer`  
**Method:** POST `/api/assess`  
**Payload:**
```json
{
  "latitude": 40.7128,
  "longitude": -74.0060,
  "asset_value": 1000000
}
```

### 2. Asset Discovery API
**Status:** ⚠️ Needs URL  
**Expected Endpoints:**
- `GET /api/companies/:isin/assets` - Get all assets for a company

**Expected Response Format:**
```json
[
  {
    "asset_name": "Manufacturing Plant",
    "address": "123 Main St",
    "latitude": 40.7128,
    "longitude": -74.0060,
    "city": "New York",
    "state_province": "NY",
    "country": "United States",
    "asset_type": "Manufacturing",
    "asset_subtype": "Heavy Industry",
    "estimated_value_usd": 50000000,
    "ownership_share": "100%",
    "data_sources": "Public records",
    "confidence_level": "High"
  }
]
```

**Configuration Location:** `server/services/externalApis.ts` (line 9)

### 3. Risk Management API
**Status:** ⚠️ Needs URL  
**Expected Endpoints:**
- `GET /api/assessment/:isin` - Get risk management assessment for a company

**Expected Response Format:**
```json
{
  "company_name": "CSX",
  "assessment_date": "2024-10-26",
  "overall_score": 75,
  "measures": [
    {
      "measure_id": "GOV-001",
      "measure_name": "Board Oversight",
      "category": "Governance",
      "score": 80,
      "confidence": "High",
      "rationale": "Company has dedicated climate committee",
      "evidence": [
        {
          "verbatim_quote": "The Board's Climate Committee meets quarterly...",
          "source_url": "https://example.com/annual-report.pdf",
          "source_page": "15",
          "source_doc_title": "2023 Annual Report"
        }
      ],
      "data_fields": {}
    }
  ]
}
```

**Configuration Location:** `server/services/externalApis.ts` (line 10)

## How to Update API Endpoints

1. Open `server/services/externalApis.ts`
2. Update the constants at the top:
   ```typescript
   const ASSET_DISCOVERY_API = "https://your-asset-api-url.com";
   const RISK_MANAGEMENT_API = "https://your-risk-mgmt-api-url.com";
   ```
3. If authentication is required, add headers to the fetch calls in the respective functions

## Data Flow

### Loading Company Data
1. User clicks "Load 20 Companies" button
2. Frontend calls `trpc.companies.seedCompanies.useMutation()`
3. Backend reads `/home/ubuntu/companies_seed.json` and inserts into database

### Viewing Company Details
1. User clicks on a company card
2. Frontend navigates to `/company/:isin`
3. Backend fetches:
   - Company details from database
   - Assets from database (or Asset Discovery API if not cached)
   - Geographic risks from database (or Geographic Risks API if not cached)
   - Risk management from database (or Risk Management API if not cached)

### Calculating Risk Exposure
1. For each asset, fetch geographic risk assessment
2. Sum expected annual losses across all risk categories
3. Apply risk management mitigation factor
4. Display overall expected loss

## Next Steps

1. **Configure Asset Discovery API:**
   - Obtain the deployed URL from the Asset Discovery project
   - Update `ASSET_DISCOVERY_API` in `server/services/externalApis.ts`
   - Test by clicking on a company in the dashboard

2. **Configure Risk Management API:**
   - Obtain the deployed URL from the Risk Management project
   - Update `RISK_MANAGEMENT_API` in `server/services/externalApis.ts`
   - Test by expanding the Risk Management section

3. **Fetch Data for Companies:**
   - Create a batch process to fetch assets for all 20 companies
   - For each asset with coordinates, fetch geographic risk assessment
   - Fetch risk management assessment for each company
   - Store results in database for quick access

4. **Optional Enhancements:**
   - Add data refresh buttons to re-fetch from APIs
   - Add loading progress indicators for batch operations
   - Add data visualization (charts/graphs) for risk breakdown
   - Export functionality for reports

## Testing

### Test Geographic Risks API
```bash
curl -X POST https://5000-ie5oom8cn8x48wkgrn5wb-14f4b140.manusvm.computer/api/assess \
  -H "Content-Type: application/json" \
  -d '{"latitude": 40.7128, "longitude": -74.0060, "asset_value": 1000000}'
```

### Test Asset Discovery API (once configured)
```bash
curl https://YOUR_ASSET_API_URL/api/companies/US1264081035/assets
```

### Test Risk Management API (once configured)
```bash
curl https://YOUR_RISK_MGMT_API_URL/api/assessment/US1264081035
```

## Database Schema

### companies
- `id` - Primary key
- `isin` - Unique company identifier
- `name` - Company name
- `sector` - Industry sector
- `geography` - Primary geography
- `tangibleAssets` - Total tangible assets value
- `enterpriseValue` - Enterprise value

### assets
- `id` - Primary key
- `companyId` - Foreign key to companies
- `assetName` - Name/description of asset
- `latitude`, `longitude` - Coordinates
- `city`, `stateProvince`, `country` - Location details
- `assetType`, `assetSubtype` - Asset classification
- `estimatedValueUsd` - Asset value
- `ownershipShare` - Ownership percentage
- `confidenceLevel` - Data confidence level

### geographicRisks
- `id` - Primary key
- `assetId` - Foreign key to assets
- `latitude`, `longitude` - Coordinates
- `assetValue` - Asset value at time of assessment
- `riskData` - JSON containing full risk assessment

### riskManagementScores
- `id` - Primary key
- `companyId` - Foreign key to companies
- `overallScore` - Overall management score (0-100)
- `assessmentData` - JSON containing full assessment details

## Support

For questions or issues, refer to the project documentation or contact the development team.

