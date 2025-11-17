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



## UI Enhancements - User Requested
- [x] Add risk breakdown by category (flood, wildfire, etc.) to Direct Exposure asset table
- [x] Add verbatim quote and source to each measure in Risk Management Assessment (already implemented)
- [x] Add expected loss as percentage of EV to company summary cards on main page



## Bug Fix - Evidence Display
- [x] Investigate why verbatim quotes and sources are not displaying in Risk Management Assessment
- [x] Fix evidence display to show quotes and sources for each measure



## Asset Value Calibration
- [x] Implement proportionate allocation: calculate each asset as % of total estimated values
- [x] Multiply percentage by reported tangible assets value from companies.xlsx
- [x] Update geographic risk calculation to use calibrated values
- [x] Update all displays to show calibrated values instead of raw estimates
- [x] Recalculate all geographic risks with calibrated values

## CSV Export Functionality
- [x] Add CSV export button to dashboard
- [x] Include fields: ISIN, Name, EV, Direct Exposure, Indirect Exposure, Gross Expected Loss
- [x] Include risk category breakdown: Flood, Wildfire, Heat Stress, Extreme Precip, Hurricane, Drought
- [x] Include Risk Management Score
- [x] Include Net Expected Loss (gross × (100% - management score))
- [x] Include Expected Loss as % of EV

## ABB "Not assessed" Investigation
- [x] Check why some ABB assets show "Not assessed" for geographic risks
- [x] Verify if assets have coordinates
- [x] Check if geographic risk calculation failed or was skipped
- [x] Document root cause (invalid placeholder coordinates)

## Risk Management Rationale Display
- [x] Verify rationale is displaying correctly
- [x] Check if user is seeing different view than screenshots
- [x] Ensure all measures show rationale text



## Data Refresh - Updated Asset Discovery API
- [x] Clear existing assets from database
- [x] Clear existing geographic risks from database
- [x] Fetch updated asset data from Asset Discovery API (641 assets from 20 companies)
- [x] Verify expanded asset count and comprehensive coordinates
- [ ] Calculate geographic risks for all new assets (IN PROGRESS: 208/641 complete - 32%, ~5 hours remaining)
- [ ] Verify dashboard displays updated data correctly



## Technical Documentation
- [x] Create 1-2 page document explaining how dashboard information is generated
- [x] Cover data flow from APIs to dashboard display
- [x] Explain calculation methodologies



## CSV File Upload Feature
- [x] Examine uploaded CSV file format
- [x] Create database schema for uploaded files
- [x] Implement backend file upload endpoint with S3 storage
- [x] Create UI for file upload
- [x] Display list of uploaded files with permanent URLs
- [x] Test file upload functionality

## Heroku Deployment
- [ ] Create Procfile and deployment configuration
- [ ] Set up database configuration for Heroku
- [ ] Deploy application to Heroku using API key
- [ ] Configure environment variables on Heroku
- [ ] Verify deployment and test functionality



## Automated CSV Upload Workflow
- [ ] Support both Excel (.xlsx) and CSV (.csv) file uploads
- [ ] Parse file format (Type/ISIN, NAME, ASSETS, EV columns)
- [ ] Create backend endpoint to process uploaded files
- [ ] Implement company data insertion/update from CSV
- [ ] Create automated pipeline: CSV → Companies → Assets → Geographic Risks → Risk Management
- [ ] Add progress tracking for long-running operations
- [ ] Update file upload UI to show processing status
- [ ] Provide permanent S3 link to uploaded CSV file
- [ ] Test complete workflow with 20Companies.csv
- [ ] Deploy to Heroku
- [ ] Document the automated workflow



## S3 Public File Access Issue
- [x] Investigate why CloudFront URLs are not publicly accessible (Manus storage requires auth)
- [x] Implement public proxy endpoint in application to serve files without auth
- [ ] Deploy to Heroku with public endpoint
- [ ] Test uploaded file URLs from external applications via Heroku
- [ ] Provide Heroku public URL format for file access



## AWS S3 Direct Integration for Heroku
- [x] Install @aws-sdk/client-s3 package
- [x] Modify storage module to support direct AWS S3 access
- [x] Add fallback logic: use Manus storage if available, otherwise use AWS S3
- [x] Configure Heroku environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET, AWS_REGION)
- [x] Test file upload on Heroku with AWS S3
- [x] Verify file uploads to S3 bucket successfully




## Heroku Database Query Error
- [x] Diagnose database query error: "Failed query: select `id`, `companyId`, `assetName` ... where `assets`.`companyId` = ? params: 1"
- [x] Fix database schema mismatch between local and Heroku
- [x] Verify all tables exist on Heroku database (migration endpoint created all tables)
- [x] Retrieved public file URL for uploaded companies file
- [ ] Note: Heroku app still shows error - companies table is empty, need to upload file again through Heroku interface




## File Management UI and Retry Logic Implementation
- [x] Implement automatic retry logic for Risk Management API calls (handle hibernation)
- [x] Add exponential backoff for failed API requests
- [x] Create file management UI component showing uploaded files
- [x] Display public URLs, upload dates, and processing status
- [x] Re-upload 20Companies(2).xlsx through Heroku to populate companies table
- [x] Fix Excel column mapping (Type → ISIN, NAME, LEVEL2 SECTOR NAME, etc.)
- [x] Add error handling to companies.list query to handle missing related data
- [x] Successfully loaded 20 companies into Heroku database
- [x] Verified dashboard displays all 20 companies correctly
- [x] Test public file URL accessibility (File 1 & 2 both accessible)

