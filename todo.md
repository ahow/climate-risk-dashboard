# Climate Risk Dashboard - TODO

## Database Schema
- [x] Create companies table with ISIN, name, sector, geography, assets, enterprise value
- [x] Create assets table for storing asset locations and values
- [x] Create risk_assessments table for caching API responses
- [x] Create management_scores table for risk management data

## Backend API Integration
- [x] Create service layer for Asset Discovery API integration
- [x] Create service layer for Geographic Risks API integration
- [x] Create service layer for Risk Management API integration
- [x] Implement data aggregation logic for direct exposure calculation
- [x] Implement overall expected loss calculation formula

## tRPC Procedures
- [x] Create procedure to fetch all companies
- [x] Create procedure to fetch company details by ISIN
- [x] Create procedure to calculate direct exposure for a company
- [x] Create procedure to fetch risk management scores
- [x] Create procedure to calculate overall expected losses

## Frontend - Company Selection
- [x] Create company list view with search/filter
- [x] Implement company selection interface
- [x] Display company summary card

## Frontend - Direct Exposure Section
- [x] Create expandable direct exposure section
- [x] Display list of all company assets with locations
- [x] Show expected annual losses by risk type for each asset
- [x] Display total expected loss and present value
- [x] Add coordinate display for each asset

## Frontend - Risk Management Section
- [x] Create expandable risk management section
- [x] Display overall management score
- [x] Show detailed assessment for each measure
- [x] Display score, rationale, verbatim quote, and source for each measure
- [x] Organize by measure categories

## Frontend - Overall Summary
- [x] Display overall expected losses formula result
- [x] Show direct exposure total
- [x] Show risk management score (as percentage)
- [x] Calculate and display final expected loss

## Data Loading & Caching
- [x] Implement loading states for API calls
- [x] Add error handling for failed API requests
- [x] Implement caching strategy for API responses

## UI/UX Polish
- [x] Design responsive layout
- [x] Add loading skeletons
- [x] Implement expandable/collapsible sections
- [ ] Add data visualization (charts/graphs)
- [x] Style tables and data displays

## API Configuration (Next Steps)
- [x] Configure Asset Discovery API endpoint URL
- [x] Configure Risk Management API endpoint URL
- [x] Implement batch data loading for all companies
- [ ] Test asset data fetching for companies
- [ ] Test risk management assessment fetching



## Pending Configuration
- [x] Configure Risk Management API URL
- [x] Update externalApis.ts with both API URLs
- [ ] Test Risk Management API integration
- [ ] Test Asset Discovery API integration



## API Configuration (In Progress)
- [x] Update Asset Discovery API URL and implement tRPC-style requests
- [x] Update Risk Management API URL
- [x] Update data mapping to match actual API response formats
- [x] Add batch fetch procedures for assets and risk management
- [x] Add UI buttons to trigger data loading
- [x] Test asset fetching for all companies (504 assets loaded successfully)
- [x] Test risk management assessment fetching (0 companies - ISIN mismatch)

## Known Issues
- [ ] Asset values are null in Asset Discovery API - need default values or alternative source
- [x] Risk Management API has different ISINs than our company list (resolved - was API hibernation)
- [ ] Geographic risk assessment requires asset values to calculate losses
- [x] Fixed duplicate rows in riskManagementScores table
- [x] Fixed overallScore extraction from API response (now using summary.score_percentage)



## Bug Investigation
- [x] Investigate ISIN mismatch between company list and Risk Management API (was API hibernation, not mismatch)
- [x] Compare ISINs from both sources
- [x] Fix any data mapping issues



## Bug Fixes
- [x] Fix evidence.map error in CompanyDetails.tsx - evidence field is not an array
- [x] Fix overall score extraction from Risk Management API (use summary.score_percentage)
- [x] Update RiskManagementData interface to match actual API response structure



## Asset Discovery API Update
- [x] Review updated Asset Discovery API documentation (improved company coverage)
- [x] Test if current integration still works with updated API (confirmed working)
- [ ] Verify asset data quality and geocoding coverage improvements



## Asset Values Update
- [x] Test updated Asset Discovery API to verify estimated_value_usd is now populated
- [x] Clear existing asset data from database
- [x] Re-fetch all assets with new estimated values
- [x] Verify asset values display correctly in dashboard
- [ ] Test geographic risk calculation with real asset values



## Geographic Risk Calculation Implementation
- [x] Implement Geographic Risks API integration for individual assets
- [x] Create procedure to calculate expected losses for each asset based on coordinates and value
- [x] Store geographic risk data in geographicRisks table
- [x] Update CompanyDetails page to display calculated expected losses by risk type
- [x] Add batch procedure to calculate risks for all assets with coordinates
- [x] Display total expected losses and present value in asset summary
- [x] Update Geographic Risks API URL to http://167.71.187.110
- [x] Fix API endpoint (remove /api/ prefix)
- [x] Update GeographicRiskData interface to match actual API response
- [x] Add Calculate Geographic Risks button to Home page



## Geographic Risks API URL Update
- [x] Update Geographic Risks API URL to http://167.71.187.110
- [x] Test the new API endpoint
- [x] Update externalApis.ts with the new URL



## Geographic Risk Calculation Improvements
- [x] Add logic to skip assets that already have geographic risk data
- [x] Improve error handling so one failed asset doesn't stop entire batch
- [x] Add progress tracking/logging for batch calculations
- [ ] Investigate why calculation stopped after 5 assets (will check logs after next run)



## Direct Exposure Aggregation Fix
- [x] Fix direct exposure calculation to sum expected annual losses from all assets
- [x] Update CompanyDetails page to display aggregated direct exposure
- [x] Calculate overall expected loss using the formula



## Asset API Update - Complete Coverage
- [x] Read updated Asset Discovery API documentation
- [x] Clear existing asset data from database
- [x] Test API to confirm 565 assets with 100% coverage
- [x] Update fetchAllAssets to use /assets.getAll endpoint instead of per-company fetching
- [x] Re-fetch all assets with complete coordinates and values
- [x] Verify 504 assets loaded (565 from API, 61 skipped due to company name mismatch)
- [x] Confirm 100% coordinate and value coverage for loaded assets (504/504)
- [x] Re-run geographic risk calculation for all 504 assets (503/504 = 99.8% complete, 1 error)



## Risk Management API - Check for All 20 Companies
- [ ] Wake up Risk Management API (currently hibernated)
- [ ] Test /companies endpoint to verify all 20 companies are available
- [ ] Re-fetch risk management data if API now has all 20 companies
- [ ] Update dashboard to show risk management scores for all companies



## Risk Management API - All 20 Companies Available
- [x] Confirm Risk Management API is awake with all 20 companies
- [x] Clear existing risk management data
- [x] Re-fetch risk management data for all 20 companies
- [x] Verify 19/20 companies now have risk management scores (BNP PARIBAS missing - API went to sleep during fetch)



## Re-fetch Risk Management Data (API Now Awake)
- [x] Clear existing risk management data
- [x] Re-fetch all 20 companies with API awake
- [x] Verified 19/20 companies have scores (BNP PARIBAS excluded - API hibernation issue)
- [x] Decision: Proceed with 19 companies (95% coverage) for now

