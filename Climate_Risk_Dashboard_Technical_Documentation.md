# Climate Risk Dashboard: Technical Documentation

**Author:** Manus AI  
**Date:** October 31, 2025  
**Version:** 1.0

## Overview

The Climate Risk Dashboard is a comprehensive platform that assesses physical climate risks across company portfolios by integrating data from multiple external APIs. This document explains the data flow, calculation methodologies, and information generation process that powers the dashboard.

## Data Architecture and Flow

The dashboard operates through a four-stage data pipeline that transforms raw company identifiers into actionable climate risk assessments. Each stage queries specialized external APIs and stores results in a structured database for efficient retrieval and analysis.

### Stage 1: Company Data Initialization

The process begins with a curated list of twenty publicly traded companies, each identified by their International Securities Identification Number (ISIN). The initial dataset includes fundamental company information such as enterprise value (EV), reported tangible assets, sector classification, and geographic headquarters location. This foundational data is stored in the `companies` table and serves as the anchor for all subsequent analysis.

### Stage 2: Asset Discovery

For each company, the system queries the **Asset Discovery API** to identify the geographic locations of physical assets. This API accepts a company ISIN as input and returns a comprehensive list of facilities, offices, manufacturing plants, terminals, and other physical infrastructure. Each asset record includes the asset name, precise geographic coordinates (latitude and longitude), location details (city, country), asset type classification, and an estimated asset value in USD.

The Asset Discovery API leverages multiple data sources to compile asset locations, including corporate disclosures, regulatory filings, satellite imagery analysis, and commercial real estate databases. For the current portfolio of twenty companies, the API identified **641 distinct physical assets** across global locations. These assets are stored in the `assets` table with foreign key relationships to their parent companies.

### Stage 3: Geographic Risk Assessment

Once asset locations are established, the system calculates climate-related risks for each asset using the **Geographic Risks API**. This API accepts geographic coordinates and asset value as inputs and returns detailed risk assessments across six climate hazard categories: flooding, wildfire, heat stress, extreme precipitation, hurricane, and drought.

For each hazard type, the API provides a comprehensive risk profile that includes historical frequency data showing how often the hazard has occurred at that location, severity metrics indicating the typical intensity of events, exposure assessment based on the asset's geographic vulnerability, and expected annual loss calculated as the probability-weighted financial impact. The expected annual loss represents the average amount the asset owner should anticipate losing each year due to that specific climate hazard, accounting for both the likelihood and potential severity of events.

The Geographic Risks API incorporates climate models, historical weather data spanning multiple decades, topographic analysis, proximity to water bodies and vegetation, and forward-looking climate projections under various emissions scenarios. The calculation process respects API rate limits by introducing a one-second delay between requests, resulting in processing times of approximately ten to twelve hours for the full portfolio of 641 assets.

### Stage 4: Risk Management Evaluation

In parallel with geographic risk assessment, the system evaluates each company's climate risk management practices using the **Risk Management API**. This API accepts a company ISIN and returns a structured assessment of the company's preparedness and mitigation strategies across multiple dimensions.

The evaluation framework examines board-level physical risk oversight to determine whether climate risks are discussed at the highest governance levels, management's role in assessing and managing physical risks including dedicated personnel and organizational structures, integration of physical risks into business strategy and capital allocation decisions, scenario analysis and climate modeling capabilities, disclosure practices and transparency in reporting climate-related risks, and specific adaptation and resilience measures implemented to protect assets.

Each dimension receives a numerical score on a scale from zero to five, where zero indicates no evidence of risk management practices and five represents industry-leading comprehensive programs. The API also provides detailed rationales explaining the basis for each score, verbatim evidence quotes extracted from corporate disclosures and reports, and source references with document titles and page numbers. These individual dimension scores are aggregated into an **overall risk management score** expressed as a percentage, which serves as a mitigation factor in the final risk calculations.

## Risk Calculation Methodology

The dashboard synthesizes data from all three APIs to produce company-level risk metrics that inform investment and risk management decisions.

### Direct Exposure Calculation

Direct exposure represents the sum of expected annual losses across all of a company's physical assets. For each asset, the system retrieves the geographic risk assessment and extracts the expected annual loss for each of the six climate hazard categories. These values are summed across all hazard types to produce a total expected annual loss for that asset. The company's total direct exposure is then calculated by aggregating the expected annual losses across all assets owned by that company.

This calculation provides a baseline estimate of the company's financial exposure to physical climate risks before accounting for any risk management or mitigation efforts. The direct exposure figure represents the expected annual cost of climate-related damages if no preventive or adaptive measures were in place.

### Asset Value Calibration

To ensure that risk calculations reflect the actual scale of company operations, the system implements a proportionate allocation methodology. The Asset Discovery API provides estimated values for individual assets, but the sum of these estimates may differ significantly from the company's reported tangible assets as disclosed in financial statements.

The calibration process first calculates the total estimated value of all assets for a given company by summing the individual asset value estimates from the Asset Discovery API. It then computes each asset's share of the total by dividing its estimated value by the company's total estimated asset value, expressed as a percentage. This percentage is then multiplied by the company's reported tangible assets value from financial disclosures to produce a calibrated asset value that maintains proportionate relationships while aligning with known financial data.

Geographic risk calculations use these calibrated values rather than raw API estimates, ensuring that the expected annual losses scale appropriately with the company's actual asset base. This calibration is particularly important for companies where the Asset Discovery API may have incomplete coverage or where estimated values diverge from accounting valuations.

### Net Expected Loss and Risk-Adjusted Metrics

The final step integrates risk management effectiveness into the loss projections. The system calculates **gross expected loss** as the sum of direct exposure (from geographic risks) and indirect exposure (currently set to zero as supply chain and transition risks are not yet modeled). The risk management score, expressed as a percentage, serves as a mitigation factor under the assumption that stronger risk management practices reduce the likelihood and severity of climate-related losses.

The **net expected loss** is calculated using the formula:

**Net Expected Loss = Gross Expected Loss × (100% - Risk Management Score)**

For example, a company with $1 million in gross expected loss and a risk management score of 55% would have a net expected loss of $450,000, reflecting a 45% residual risk after accounting for mitigation efforts. This net expected loss is then expressed as a percentage of the company's enterprise value to enable cross-company comparisons and portfolio-level risk aggregation.

## Dashboard Display and User Interface

The dashboard presents this multi-layered analysis through an intuitive interface organized around company profiles and portfolio-level summaries.

### Company Detail View

Each company page displays a comprehensive risk profile beginning with an overall expected losses summary card that shows direct exposure, indirect exposure (currently zero), risk management score with mitigation factor, and overall expected loss as both an absolute dollar amount and percentage of enterprise value. The calculation formula is displayed prominently to ensure transparency in how the final figure is derived.

Below the summary, an expandable **Direct Exposure - Asset Details** section presents a sortable table listing all identified assets with their names, locations, coordinates, types, calibrated values, and expected annual losses broken down by hazard category (flood, wildfire, heat stress, extreme precipitation, hurricane, drought). Users can sort by any column to identify the highest-risk assets or filter by location or asset type.

The **Risk Management Assessment** section displays the overall risk management score along with detailed breakdowns for each evaluated dimension. For each measure, the dashboard shows the numerical score, confidence level, and a detailed rationale explaining the assessment basis. Where available, verbatim evidence quotes from corporate disclosures are displayed with source attributions including document titles and page numbers, providing full traceability to primary sources.

### Portfolio-Level Analytics

The home page presents a grid of company cards, each showing the company name, ISIN, headquarters location, sector classification, total tangible assets, enterprise value, and expected loss as a percentage of EV. This layout enables quick identification of the highest-risk companies in the portfolio and facilitates sector-level or geographic comparisons.

### Data Export Functionality

The dashboard includes a CSV export feature that generates a comprehensive dataset for external analysis. The export includes all company-level metrics with expected loss breakdowns by hazard category, enabling users to perform custom analyses, integrate with existing risk management systems, or create additional visualizations in spreadsheet or business intelligence tools.

## Data Quality and Limitations

While the dashboard provides comprehensive risk assessments, users should be aware of several important limitations and data quality considerations.

### Coordinate Accuracy

Some assets returned by the Asset Discovery API contain placeholder coordinates rather than precise locations. In the current dataset, certain assets (particularly those in specific international markets) are assigned coordinates corresponding to the geographic center of the United States (39.8283°N, 98.5795°W in Kansas). These placeholder coordinates indicate that the API could not determine the asset's precise location, and the system correctly flags these assets as "Not assessed" for geographic risks rather than calculating risks for an obviously incorrect location.

### API Data Completeness

The Asset Discovery API may not identify all physical assets owned or operated by a company, particularly for assets that are not publicly disclosed, recently acquired or divested, operated under joint ventures or partnerships, or located in jurisdictions with limited disclosure requirements. Users should interpret the asset counts and exposure figures as representative samples rather than exhaustive inventories.

### Risk Management Scoring

The Risk Management API scores are based on publicly available information including annual reports, sustainability reports, CDP disclosures, and regulatory filings. Companies with limited public disclosure may receive lower scores not because their risk management practices are inadequate, but because the information is not publicly accessible. The confidence levels provided with each score help users assess the reliability of the assessment.

### Evidence Availability

The Risk Management API currently returns null values for evidence quotes and source references for all companies in the dataset. This indicates that while the API provides risk management scores and rationales, the underlying evidence extraction and source attribution functionality is not yet operational. Users should treat the risk management scores as preliminary assessments pending the availability of full source documentation.

## Technical Implementation

The dashboard is built on a modern web application stack with a React frontend, Express backend, and MySQL database. The tRPC framework provides end-to-end type safety between the client and server, ensuring that API responses are correctly typed and validated throughout the application.

External API calls are managed through dedicated service modules that handle authentication, rate limiting, error handling, and response parsing. The system implements exponential backoff and retry logic for transient failures and maintains detailed logs of all API interactions for debugging and audit purposes.

The database schema uses foreign key relationships to maintain referential integrity between companies, assets, geographic risks, and risk management assessments. Indexes on frequently queried fields ensure fast retrieval even as the dataset grows to encompass hundreds of companies and thousands of assets.

## Conclusion

The Climate Risk Dashboard transforms disparate data sources into actionable climate risk intelligence through a systematic pipeline of API integrations, risk calculations, and data synthesis. By combining asset-level geographic risk assessments with company-level risk management evaluations, the dashboard provides a nuanced view of physical climate risk exposure that accounts for both inherent vulnerabilities and mitigation efforts. As climate risks continue to evolve and disclosure requirements expand, this framework provides a scalable foundation for ongoing portfolio-level climate risk monitoring and analysis.

