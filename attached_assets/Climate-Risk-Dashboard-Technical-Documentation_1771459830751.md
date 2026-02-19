# Climate Risk Dashboard - Technical Documentation

## Executive Summary

The Climate Risk Dashboard is a comprehensive web application that quantifies and visualizes climate-related financial risks for publicly traded companies. It integrates three distinct risk assessment methodologies—**direct asset risks**, **supply chain risks**, and **management performance metrics**—to provide a holistic view of corporate climate exposure.

**GitHub Repository**: [https://github.com/ahow/climate-risk-dashboard](https://github.com/ahow/climate-risk-dashboard)

**Live Application**: https://climate-risk-unified-aa97b51f74e7.herokuapp.com/

---

## Table of Contents

1. [Project Objectives](#project-objectives)
2. [Architecture Overview](#architecture-overview)
3. [Technology Stack](#technology-stack)
4. [Data Model](#data-model)
5. [Risk Calculation Models](#risk-calculation-models)
6. [API Integrations](#api-integrations)
7. [Key Features](#key-features)
8. [Deployment Guide](#deployment-guide)
9. [Development Workflow](#development-workflow)
10. [Future Enhancements](#future-enhancements)

---

## Project Objectives

### Primary Goal
Quantify the financial impact of climate change on publicly traded companies by assessing:
1. **Physical risks** to company-owned assets (facilities, infrastructure)
2. **Supply chain vulnerabilities** from climate impacts on suppliers and trading partners
3. **Management preparedness** through climate risk management practices

### Business Value
- **Investors**: Assess climate risk exposure in portfolios
- **Risk Managers**: Identify and prioritize climate vulnerabilities
- **Sustainability Teams**: Benchmark climate management practices
- **Executives**: Understand financial implications of climate scenarios

### Key Metrics
- **Expected Annual Loss (EAL)**: Dollar value of climate-related damages per year
- **Risk Percentage**: EAL as a percentage of company revenue
- **Management Score**: 0-100% assessment of climate preparedness

---

## Architecture Overview

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React 19)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Dashboard   │  │   Company    │  │ Calculation  │      │
│  │    Home      │  │   Detail     │  │   Monitor    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            │
                    tRPC (Type-safe RPC)
                            │
┌─────────────────────────────────────────────────────────────┐
│                   Backend (Express + tRPC)                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Router Layer (routers.ts)               │   │
│  │  • companies  • geoRisks  • supplyChain             │   │
│  │  • riskManagement  • operations                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                            │                                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           Service Layer (services/)                   │   │
│  │  • externalApis.ts  • supplyChainApi.ts              │   │
│  │  • operationManager.ts                               │   │
│  └──────────────────────────────────────────────────────┘   │
│                            │                                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         Database Layer (Drizzle ORM)                  │   │
│  │  • companies  • assets  • geoRisks                   │   │
│  │  • supplyChainRisks  • riskManagement                │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
┌───────▼────────┐  ┌──────▼──────┐  ┌────────▼────────┐
│  Climate Risk  │  │  FactSet    │  │  Risk Mgmt API  │
│  API V7        │  │  Supply     │  │  (Internal)     │
│  (Geographic)  │  │  Chain API  │  │                 │
└────────────────┘  └─────────────┘  └─────────────────┘
```

### Data Flow

1. **Company Ingestion**: FactSet company data → `companies` table
2. **Asset Extraction**: Company locations → `assets` table with coordinates
3. **Risk Calculation** (parallel processing):
   - **Geographic Risks**: Asset coordinates → Climate Risk API → `geoRisks` table
   - **Supply Chain Risks**: Company identifiers → FactSet Supply Chain API → `supplyChainRisks` table
   - **Management Assessment**: Company identifiers → Risk Management API → `riskManagement` table
4. **Aggregation**: Individual risks → Company-level totals → Dashboard display

---

## Technology Stack

### Frontend
- **React 19**: UI framework with concurrent rendering
- **Wouter**: Lightweight client-side routing
- **Tailwind CSS 4**: Utility-first styling with CSS variables
- **shadcn/ui**: Accessible component library
- **Recharts**: Data visualization library
- **tRPC React Query**: Type-safe API client with caching

### Backend
- **Node.js 22**: JavaScript runtime
- **Express 4**: Web server framework
- **tRPC 11**: End-to-end type-safe RPC framework
- **Drizzle ORM**: Type-safe SQL query builder
- **Zod**: Runtime type validation
- **SuperJSON**: Enhanced JSON serialization (preserves Date objects)

### Database
- **PostgreSQL** (Heroku Postgres): Relational database
- **Connection**: Direct via `DATABASE_URL` environment variable

### DevOps
- **pnpm**: Fast, disk-efficient package manager
- **Vite**: Frontend build tool with HMR
- **GitHub**: Version control
- **Heroku**: Cloud hosting platform

### Key Dependencies
```json
{
  "dependencies": {
    "@trpc/server": "^11.0.0",
    "@trpc/react-query": "^11.0.0",
    "drizzle-orm": "latest",
    "express": "^4.18.2",
    "react": "^19.0.0",
    "zod": "^3.22.0"
  }
}
```

**Full stack details**: [package.json](https://github.com/ahow/climate-risk-dashboard/blob/main/package.json)

---

## Data Model

### Entity Relationship Diagram

```
companies (1) ──────< (N) assets
    │                      │
    │                      │
    │                      └──────< (N) geoRisks
    │
    ├──────< (N) supplyChainRisks
    │
    └──────< (1) riskManagement
```

### Core Tables

#### 1. `companies`
Stores company master data from FactSet.

```typescript
{
  id: int (PK, auto-increment)
  factsetEntityId: varchar(64) UNIQUE  // FactSet identifier
  companyName: text
  ticker: varchar(20)
  sector: text                         // FactSet sector classification
  country: varchar(3)                  // ISO 3166-1 alpha-3
  revenue: decimal(20,2)               // Annual revenue in USD
  createdAt: timestamp
  updatedAt: timestamp
}
```

**Source**: [drizzle/schema.ts#L20-L32](https://github.com/ahow/climate-risk-dashboard/blob/main/drizzle/schema.ts#L20-L32)

#### 2. `assets`
Physical locations (facilities, offices, plants) extracted from company data.

```typescript
{
  id: int (PK, auto-increment)
  companyId: int (FK → companies.id)
  name: text                           // "Houston Headquarters"
  location: text                       // "Houston, TX, USA"
  latitude: decimal(10,7)              // 29.7604
  longitude: decimal(10,7)             // -95.3698
  assetType: varchar(50)               // "headquarters", "plant", "office"
  createdAt: timestamp
}
```

**Source**: [drizzle/schema.ts#L34-L45](https://github.com/ahow/climate-risk-dashboard/blob/main/drizzle/schema.ts#L34-L45)

#### 3. `geoRisks`
Climate risk assessments for individual assets.

```typescript
{
  id: int (PK, auto-increment)
  assetId: int (FK → assets.id)
  riskType: varchar(50)                // "hurricane", "flood", "wildfire", etc.
  expectedAnnualLoss: decimal(15,2)    // Dollar value of annual expected loss
  probability: decimal(5,4)            // 0.0000 - 1.0000
  severity: varchar(20)                // "low", "medium", "high", "extreme"
  calculatedAt: timestamp
}
```

**Risk Types**: `hurricane`, `flood`, `wildfire`, `extreme_heat`, `drought`, `extreme_precipitation`, `sea_level_rise`

**Source**: [drizzle/schema.ts#L47-L58](https://github.com/ahow/climate-risk-dashboard/blob/main/drizzle/schema.ts#L47-L58)

#### 4. `supplyChainRisks`
Aggregated supply chain climate exposure by country-sector pairs.

```typescript
{
  id: int (PK, auto-increment)
  companyId: int (FK → companies.id)
  country: varchar(3)                  // ISO 3166-1 alpha-3
  sector: text                         // OECD sector name
  riskPercentage: decimal(5,2)         // % of company's supply chain risk
  expectedAnnualLoss: decimal(15,2)    // Dollar value
  calculatedAt: timestamp
}
```

**Source**: [drizzle/schema.ts#L60-L71](https://github.com/ahow/climate-risk-dashboard/blob/main/drizzle/schema.ts#L60-L71)

#### 5. `riskManagement`
Climate risk management performance assessment.

```typescript
{
  id: int (PK, auto-increment)
  companyId: int (FK → companies.id) UNIQUE
  overallScore: decimal(5,2)           // 0-100%
  assessmentDetails: json              // Detailed scoring breakdown
  calculatedAt: timestamp
}
```

**Source**: [drizzle/schema.ts#L73-L82](https://github.com/ahow/climate-risk-dashboard/blob/main/drizzle/schema.ts#L73-L82)

#### 6. `operations`
Tracks long-running calculation jobs (geographic risk, supply chain risk).

```typescript
{
  id: varchar(255) (PK)                // "geo-risks-1768692736744"
  type: varchar(50)                    // "geographic" | "supply-chain"
  status: varchar(20)                  // "running" | "paused" | "completed" | "failed"
  progress: int                        // 0-100
  totalItems: int
  processedItems: int
  currentBatch: int
  totalBatches: int
  statusMessage: text
  startedAt: timestamp
  completedAt: timestamp (nullable)
  createdAt: timestamp
  updatedAt: timestamp
}
```

**Source**: [drizzle/schema.ts#L84-L100](https://github.com/ahow/climate-risk-dashboard/blob/main/drizzle/schema.ts#L84-L100)

### Database Migrations

Managed via Drizzle Kit:
```bash
pnpm db:push  # Apply schema changes to database
```

---

## Risk Calculation Models

### 1. Geographic Risk Model

**Objective**: Quantify expected annual loss from climate hazards at each company asset location.

#### Data Source
**Climate Risk API V7**: https://climate-risk-api-v6-prob-be68437e49be.herokuapp.com

**API Documentation**: See attached `🎉ClimateRiskAPIV7-SuccessfullyDeployed!.md`

#### Methodology

1. **Asset Geocoding**: Extract latitude/longitude for each company facility
2. **API Request**: For each asset, query Climate Risk API with coordinates
3. **Risk Assessment**: API returns expected annual loss (EAL) for 7 hazard types:
   - Hurricane/Typhoon
   - Flood (riverine + coastal)
   - Wildfire
   - Extreme Heat
   - Drought
   - Extreme Precipitation
   - Sea Level Rise

4. **Data Quality** (V7 improvements):
   - **Hurricane**: Restored 22,000+ North Atlantic records (USA, UK, Canada, Caribbean)
   - **Flood**: 50% more coverage via spatial interpolation
   - **Climate Variables**: Invalid fill values (-99.9°C) now masked

#### Calculation Logic

```typescript
// server/services/externalApis.ts
export async function fetchGeographicRisk(
  latitude: number,
  longitude: number
): Promise<GeographicRiskResponse> {
  const response = await fetch(
    `${GEOGRAPHIC_RISK_API_URL}/assess?lat=${latitude}&lon=${longitude}`
  );
  const data = await response.json();
  
  // Returns:
  // {
  //   hurricane_eal: 12500.50,
  //   flood_eal: 8300.25,
  //   wildfire_eal: 0,
  //   extreme_heat_eal: 4200.00,
  //   drought_eal: 0,
  //   extreme_precip_eal: 1500.75,
  //   sea_level_rise_eal: 0
  // }
  
  return data;
}
```

**Source**: [server/services/externalApis.ts#L10-L25](https://github.com/ahow/climate-risk-dashboard/blob/main/server/services/externalApis.ts#L10-L25)

#### Batch Processing

Geographic risk calculation is computationally intensive (2,527 assets × 7 hazards). The system uses **batch processing** with **pause/resume** capability:

```typescript
// server/services/operationManager.ts
export async function processGeographicRisks(
  operationId: string,
  clearExisting: boolean = false
) {
  const BATCH_SIZE = 50;  // Process 50 assets per batch
  const DELAY_MS = 1000;  // 1 second delay between batches
  
  // Fetch all assets
  const assets = await db.select().from(assetsTable);
  const totalBatches = Math.ceil(assets.length / BATCH_SIZE);
  
  for (let batch = 0; batch < totalBatches; batch++) {
    // Check if operation is paused
    const operation = await getOperation(operationId);
    if (operation.status === 'paused') break;
    
    // Process batch
    const batchAssets = assets.slice(
      batch * BATCH_SIZE,
      (batch + 1) * BATCH_SIZE
    );
    
    for (const asset of batchAssets) {
      const riskData = await fetchGeographicRisk(
        asset.latitude,
        asset.longitude
      );
      
      // Store in geoRisks table
      await insertGeoRisks(asset.id, riskData);
    }
    
    // Update progress
    await updateOperation(operationId, {
      processedItems: (batch + 1) * BATCH_SIZE,
      currentBatch: batch + 1,
      statusMessage: `Processed ${(batch + 1) * BATCH_SIZE}/${assets.length} assets`
    });
    
    // Rate limiting
    await sleep(DELAY_MS);
  }
}
```

**Source**: [server/services/operationManager.ts#L45-L120](https://github.com/ahow/climate-risk-dashboard/blob/main/server/services/operationManager.ts#L45-L120)

#### Aggregation

Company-level geographic risk = sum of all asset risks:

```sql
SELECT 
  c.id,
  c.companyName,
  SUM(gr.expectedAnnualLoss) as totalGeographicRisk
FROM companies c
JOIN assets a ON a.companyId = c.id
JOIN geoRisks gr ON gr.assetId = a.id
GROUP BY c.id, c.companyName
```

---

### 2. Supply Chain Risk Model

**Objective**: Quantify climate risk exposure through supplier and customer relationships.

#### Data Source
**FactSet Supply Chain Relationships API** (via internal proxy)

#### Methodology

1. **Supply Chain Mapping**: For each company, retrieve:
   - **Suppliers**: Companies providing inputs
   - **Customers**: Companies purchasing outputs
   - **Trade Flow**: Estimated value of transactions

2. **Country-Sector Aggregation**: Group trading partners by:
   - Country (ISO 3166-1 alpha-3)
   - Sector (OECD classification)

3. **Climate Risk Lookup**: For each country-sector pair, query climate risk database:
   - **Physical Risk Score**: Climate hazard exposure for that sector in that country
   - **Transition Risk Score**: Policy/technology disruption risk

4. **Weighted Calculation**:
   ```
   Supply Chain Risk = Σ (Trade Value × Climate Risk Score)
   ```

#### OECD Sector Mapping

The system maps FactSet sector codes to OECD Input-Output sectors for standardized risk assessment:

```typescript
// server/utils/oecdMappings.ts
export const FACTSET_TO_OECD_SECTOR: Record<string, string> = {
  "Energy": "Mining and extraction of energy producing products",
  "Materials": "Mining and quarrying of non-energy producing products",
  "Industrials": "Manufacture of machinery and equipment n.e.c.",
  "Consumer Discretionary": "Wholesale and retail trade",
  "Consumer Staples": "Manufacture of food products, beverages and tobacco",
  "Health Care": "Human health and social work activities",
  "Financials": "Financial and insurance activities",
  "Information Technology": "Computer programming, consultancy, and information service activities",
  "Communication Services": "Telecommunications",
  "Utilities": "Electricity, gas, steam and air conditioning supply",
  "Real Estate": "Real estate activities"
};
```

**Source**: [server/utils/oecdMappings.ts#L1-L50](https://github.com/ahow/climate-risk-dashboard/blob/main/server/utils/oecdMappings.ts#L1-L50)

#### Calculation Logic

```typescript
// server/services/supplyChainApi.ts
export async function calculateSupplyChainRisk(
  companyId: number
): Promise<SupplyChainRiskResult[]> {
  // 1. Fetch supply chain relationships
  const relationships = await fetchSupplyChainData(companyId);
  
  // 2. Aggregate by country-sector
  const aggregated = relationships.reduce((acc, rel) => {
    const key = `${rel.country}-${rel.sector}`;
    if (!acc[key]) {
      acc[key] = {
        country: rel.country,
        sector: rel.sector,
        tradeValue: 0,
        partners: []
      };
    }
    acc[key].tradeValue += rel.estimatedValue;
    acc[key].partners.push(rel.partnerName);
    return acc;
  }, {});
  
  // 3. Calculate climate risk for each country-sector
  const results = [];
  for (const [key, data] of Object.entries(aggregated)) {
    const climateRisk = await lookupClimateRisk(
      data.country,
      data.sector
    );
    
    const expectedAnnualLoss = 
      (data.tradeValue * climateRisk.physicalRiskScore) / 1000;
    
    const riskPercentage = 
      (expectedAnnualLoss / companyRevenue) * 100;
    
    results.push({
      country: data.country,
      sector: data.sector,
      expectedAnnualLoss,
      riskPercentage
    });
  }
  
  return results.sort((a, b) => 
    b.expectedAnnualLoss - a.expectedAnnualLoss
  ).slice(0, 5);  // Top 5 contributors
}
```

**Source**: [server/services/supplyChainApi.ts#L30-L95](https://github.com/ahow/climate-risk-dashboard/blob/main/server/services/supplyChainApi.ts#L30-L95)

---

### 3. Risk Management Performance Model

**Objective**: Assess company preparedness for climate risks through management practices.

#### Data Source
**Internal Risk Management API** (proprietary scoring system)

#### Assessment Framework

The model evaluates 8 dimensions of climate risk management:

1. **Governance & Oversight** (15%)
   - Board-level climate responsibility
   - Executive compensation tied to climate metrics
   
2. **Strategy & Planning** (20%)
   - Climate scenario analysis (2°C, 4°C)
   - Long-term decarbonization targets
   
3. **Risk Identification** (15%)
   - Physical risk assessment coverage
   - Supply chain risk mapping
   
4. **Risk Quantification** (15%)
   - Financial impact modeling
   - Probabilistic risk analysis
   
5. **Mitigation & Adaptation** (15%)
   - Asset hardening investments
   - Supplier diversification
   
6. **Disclosure & Transparency** (10%)
   - TCFD alignment
   - CDP Climate Change response
   
7. **Stakeholder Engagement** (5%)
   - Investor communication
   - Community resilience programs
   
8. **Performance Tracking** (5%)
   - KPI monitoring
   - Third-party verification

#### Scoring Logic

```typescript
// Conceptual - actual API is proprietary
export async function assessRiskManagement(
  companyId: number
): Promise<RiskManagementScore> {
  const assessment = await fetchRiskManagementData(companyId);
  
  const scores = {
    governance: calculateGovernanceScore(assessment),
    strategy: calculateStrategyScore(assessment),
    riskId: calculateRiskIdScore(assessment),
    riskQuant: calculateRiskQuantScore(assessment),
    mitigation: calculateMitigationScore(assessment),
    disclosure: calculateDisclosureScore(assessment),
    stakeholder: calculateStakeholderScore(assessment),
    tracking: calculateTrackingScore(assessment)
  };
  
  const overallScore = 
    scores.governance * 0.15 +
    scores.strategy * 0.20 +
    scores.riskId * 0.15 +
    scores.riskQuant * 0.15 +
    scores.mitigation * 0.15 +
    scores.disclosure * 0.10 +
    scores.stakeholder * 0.05 +
    scores.tracking * 0.05;
  
  return {
    overallScore: Math.round(overallScore),
    breakdown: scores,
    assessmentDate: new Date()
  };
}
```

---

## API Integrations

### 1. Climate Risk API V7

**Base URL**: `https://climate-risk-api-v6-prob-be68437e49be.herokuapp.com`

**Endpoint**: `GET /assess`

**Parameters**:
- `lat` (required): Latitude (-90 to 90)
- `lon` (required): Longitude (-180 to 180)

**Response**:
```json
{
  "hurricane_eal": 12500.50,
  "flood_eal": 8300.25,
  "wildfire_eal": 0,
  "extreme_heat_eal": 4200.00,
  "drought_eal": 0,
  "extreme_precip_eal": 1500.75,
  "sea_level_rise_eal": 0,
  "total_eal": 26501.50
}
```

**Rate Limiting**: 1 request/second (enforced client-side)

**Error Handling**:
- 404: No data available for coordinates
- 500: API service error
- Retry logic: 3 attempts with exponential backoff

**Configuration**: [server/services/externalApis.ts#L5](https://github.com/ahow/climate-risk-dashboard/blob/main/server/services/externalApis.ts#L5)

---

### 2. FactSet Supply Chain API

**Base URL**: `https://api.factset.com/supply-chain/v1`

**Authentication**: API key via `FactSet-Api-Key` header

**Endpoint**: `GET /relationships`

**Parameters**:
- `entityId` (required): FactSet entity identifier
- `relationshipType`: `supplier` | `customer` | `both`

**Response**:
```json
{
  "data": [
    {
      "partnerId": "ABC123-S",
      "partnerName": "Acme Suppliers Inc.",
      "country": "USA",
      "sector": "Materials",
      "relationshipType": "supplier",
      "estimatedValue": 15000000
    }
  ]
}
```

**Configuration**: [server/services/supplyChainApi.ts#L8](https://github.com/ahow/climate-risk-dashboard/blob/main/server/services/supplyChainApi.ts#L8)

---

### 3. Risk Management API

**Base URL**: Internal (proprietary)

**Endpoint**: `POST /assess`

**Request**:
```json
{
  "companyId": 123,
  "assessmentType": "climate_risk_management"
}
```

**Response**:
```json
{
  "overallScore": 67,
  "breakdown": {
    "governance": 75,
    "strategy": 80,
    "riskIdentification": 60,
    "riskQuantification": 55,
    "mitigation": 70,
    "disclosure": 65,
    "stakeholder": 50,
    "tracking": 60
  },
  "assessmentDate": "2026-01-17T10:30:00Z"
}
```

---

## Key Features

### 1. Company Dashboard

**Route**: `/`

**Description**: Overview of all companies with aggregated risk metrics.

**Key Components**:
- Company cards with total risk exposure
- Sortable/filterable table
- Quick navigation to detailed views

**Data Loading**:
```typescript
// client/src/pages/Home.tsx
const { data: companies, isLoading } = trpc.companies.list.useQuery();
```

**Source**: [client/src/pages/Home.tsx](https://github.com/ahow/climate-risk-dashboard/blob/main/client/src/pages/Home.tsx)

---

### 2. Company Detail View

**Route**: `/company/:id`

**Description**: Comprehensive risk breakdown for a single company.

**Sections**:
1. **Overview Card**: Total risk, revenue, risk %
2. **Asset Risk Table**: Individual facility risks with map
3. **Supply Chain Risk Table**: Top 5 country-sector contributors
4. **Management Performance**: Detailed scoring breakdown

**Data Loading**:
```typescript
// client/src/pages/CompanyDetail.tsx
const { data: company } = trpc.companies.getById.useQuery({ id });
const { data: assets } = trpc.companies.getAssets.useQuery({ companyId: id });
const { data: geoRisks } = trpc.geoRisks.getByCompany.useQuery({ companyId: id });
const { data: supplyChainRisks } = trpc.supplyChain.getByCompany.useQuery({ companyId: id });
const { data: riskMgmt } = trpc.riskManagement.getByCompany.useQuery({ companyId: id });
```

**Source**: [client/src/pages/CompanyDetail.tsx](https://github.com/ahow/climate-risk-dashboard/blob/main/client/src/pages/CompanyDetail.tsx)

---

### 3. Calculation Monitor

**Route**: `/monitor`

**Description**: Real-time tracking of long-running calculation jobs.

**Features**:
- Progress bars with percentage completion
- Pause/Resume controls
- Delete operation button (trash icon)
- Status messages ("Calculated 1,250/2,527 assets")
- Duration tracking

**Operations Tracked**:
- Geographic risk calculation
- Supply chain risk calculation

**Data Loading**:
```typescript
// client/src/pages/CalculationMonitor.tsx
const { data: operations } = trpc.operations.list.useQuery(undefined, {
  refetchInterval: 5000  // Poll every 5 seconds
});

const pauseMutation = trpc.operations.pause.useMutation();
const resumeMutation = trpc.operations.resume.useMutation();
const deleteMutation = trpc.operations.cancel.useMutation();
```

**Source**: [client/src/pages/CalculationMonitor.tsx](https://github.com/ahow/climate-risk-dashboard/blob/main/client/src/pages/CalculationMonitor.tsx)

---

### 4. CSV Export

**Feature**: Export company risk data to CSV format.

**Endpoint**: `GET /api/trpc/companies.exportCsv`

**CSV Columns**:
- Company Name
- Ticker
- Sector
- Country
- Revenue
- Asset Risk (Total)
- Supply Chain Risk (Total)
- Management Score
- Total Risk
- Risk %

**Implementation**:
```typescript
// server/routers.ts
exportCsv: publicProcedure.query(async () => {
  const companies = await db
    .select()
    .from(companiesTable)
    .leftJoin(geoRisksTable, ...)
    .leftJoin(supplyChainRisksTable, ...)
    .leftJoin(riskManagementTable, ...);
  
  const csv = companies.map(c => ({
    name: c.companyName,
    ticker: c.ticker,
    // ... aggregate risk calculations
  }));
  
  return { data: csv };
})
```

**Source**: [server/routers.ts#L250-L290](https://github.com/ahow/climate-risk-dashboard/blob/main/server/routers.ts#L250-L290)

---

## Deployment Guide

### Prerequisites

1. **Heroku Account**: https://signup.heroku.com/
2. **GitHub Account**: https://github.com/
3. **Heroku CLI** (optional): `brew install heroku/brew/heroku`

### Environment Variables

Required environment variables (set in Heroku dashboard → Settings → Config Vars):

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# API Keys
FACTSET_API_KEY=your_factset_key
RISK_MGMT_API_KEY=your_risk_mgmt_key

# Application
NODE_ENV=production
PORT=3000  # Set automatically by Heroku
```

### Deployment Steps

#### Option 1: GitHub Integration (Recommended)

1. **Fork/Clone Repository**:
   ```bash
   git clone https://github.com/ahow/climate-risk-dashboard.git
   cd climate-risk-dashboard
   ```

2. **Create Heroku App**:
   ```bash
   heroku create your-app-name
   ```

3. **Add PostgreSQL**:
   ```bash
   heroku addons:create heroku-postgresql:essential-0
   ```

4. **Connect GitHub**:
   - Heroku Dashboard → Deploy tab
   - Deployment method: GitHub
   - Search for `climate-risk-dashboard`
   - Enable "Automatic deploys" from `main` branch

5. **Set Environment Variables**:
   ```bash
   heroku config:set FACTSET_API_KEY=your_key
   heroku config:set RISK_MGMT_API_KEY=your_key
   ```

6. **Deploy**:
   ```bash
   git push origin main  # Triggers auto-deploy
   ```

7. **Run Database Migrations**:
   ```bash
   heroku run pnpm db:push
   ```

#### Option 2: Direct Git Push

```bash
heroku git:remote -a your-app-name
git push heroku main
```

### Post-Deployment

1. **Verify Deployment**:
   ```bash
   heroku open
   ```

2. **Check Logs**:
   ```bash
   heroku logs --tail
   ```

3. **Scale Dynos** (if needed):
   ```bash
   heroku ps:scale web=1
   ```

### Troubleshooting

**Issue**: Build fails with "Cannot find module"
**Solution**: Ensure all dependencies are in `dependencies`, not `devDependencies`

**Issue**: Database connection error
**Solution**: Verify `DATABASE_URL` is set and PostgreSQL addon is provisioned

**Issue**: API rate limiting errors
**Solution**: Adjust `DELAY_MS` in `operationManager.ts` to increase delay between requests

---

## Development Workflow

### Local Setup

1. **Clone Repository**:
   ```bash
   git clone https://github.com/ahow/climate-risk-dashboard.git
   cd climate-risk-dashboard
   ```

2. **Install Dependencies**:
   ```bash
   pnpm install
   ```

3. **Set Up Environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your local database credentials
   ```

4. **Start Database** (Docker):
   ```bash
   docker run -d \
     --name climate-risk-db \
     -e POSTGRES_PASSWORD=password \
     -e POSTGRES_DB=climate_risk \
     -p 5432:5432 \
     postgres:15
   ```

5. **Run Migrations**:
   ```bash
   pnpm db:push
   ```

6. **Start Dev Server**:
   ```bash
   pnpm dev
   ```
   - Frontend: http://localhost:3000
   - Backend: http://localhost:3000/api

### Project Structure

```
climate-risk-dashboard/
├── client/                    # Frontend React application
│   ├── src/
│   │   ├── pages/            # Page components
│   │   │   ├── Home.tsx
│   │   │   ├── CompanyDetail.tsx
│   │   │   └── CalculationMonitor.tsx
│   │   ├── components/       # Reusable UI components
│   │   │   └── ui/           # shadcn/ui components
│   │   ├── lib/
│   │   │   └── trpc.ts       # tRPC client setup
│   │   ├── App.tsx           # Route configuration
│   │   └── main.tsx          # React entry point
│   └── index.html
├── server/                    # Backend Express + tRPC
│   ├── routers.ts            # tRPC route definitions
│   ├── db.ts                 # Database query helpers
│   ├── services/             # Business logic
│   │   ├── externalApis.ts   # API integrations
│   │   ├── supplyChainApi.ts
│   │   └── operationManager.ts
│   ├── utils/
│   │   └── oecdMappings.ts   # Sector/country mappings
│   └── _core/                # Framework code (don't modify)
├── drizzle/                   # Database schema & migrations
│   └── schema.ts
├── shared/                    # Shared types & constants
│   └── const.ts
├── package.json
├── tsconfig.json
└── vite.config.ts
```

### Adding a New Feature

Example: Add a new risk type "Tornado Risk"

1. **Update Database Schema**:
   ```typescript
   // drizzle/schema.ts
   export const geoRisks = mysqlTable("geoRisks", {
     // ... existing fields
     tornadoEal: decimal("tornadoEal", { precision: 15, scale: 2 })
   });
   ```

2. **Run Migration**:
   ```bash
   pnpm db:push
   ```

3. **Update API Service**:
   ```typescript
   // server/services/externalApis.ts
   export async function fetchGeographicRisk(lat: number, lon: number) {
     const response = await fetch(`${API_URL}/assess?lat=${lat}&lon=${lon}`);
     const data = await response.json();
     return {
       // ... existing fields
       tornadoEal: data.tornado_eal || 0
     };
   }
   ```

4. **Update Router**:
   ```typescript
   // server/routers.ts
   geoRisks: router({
     getByCompany: publicProcedure
       .input(z.object({ companyId: z.number() }))
       .query(async ({ input }) => {
         // Query now includes tornadoEal
         return await db.select().from(geoRisksTable)
           .where(eq(geoRisksTable.companyId, input.companyId));
       })
   })
   ```

5. **Update Frontend**:
   ```typescript
   // client/src/pages/CompanyDetail.tsx
   <TableRow>
     <TableCell>Tornado</TableCell>
     <TableCell>${formatCurrency(risk.tornadoEal)}</TableCell>
   </TableRow>
   ```

### Testing

**Manual Testing**:
1. Start dev server: `pnpm dev`
2. Navigate to http://localhost:3000
3. Test each page and interaction

**Database Inspection**:
```bash
# Connect to local database
psql -h localhost -U postgres -d climate_risk

# Query companies
SELECT * FROM companies LIMIT 10;

# Check geographic risks
SELECT c.companyName, COUNT(gr.id) as riskCount
FROM companies c
LEFT JOIN assets a ON a.companyId = c.id
LEFT JOIN geoRisks gr ON gr.assetId = a.id
GROUP BY c.id, c.companyName;
```

---

## Future Enhancements

### Planned Features

1. **Scenario Analysis**:
   - Compare risks under 2°C vs 4°C warming scenarios
   - Time-series projections (2030, 2050, 2100)

2. **Portfolio Analysis**:
   - Upload CSV of holdings (ticker, shares)
   - Aggregate portfolio-level climate risk
   - Sector/geography breakdown

3. **Alert System**:
   - Email notifications when company risk exceeds threshold
   - Webhook integration for third-party systems

4. **Enhanced Visualizations**:
   - Interactive maps with asset locations
   - Supply chain network diagrams
   - Risk heatmaps by geography

5. **Historical Tracking**:
   - Store risk assessments over time
   - Trend analysis (improving/worsening)
   - Correlation with stock performance

### Technical Debt

1. **Unit Tests**: Add Jest/Vitest test suite
2. **API Caching**: Implement Redis for API response caching
3. **Error Monitoring**: Integrate Sentry for production error tracking
4. **Performance**: Optimize database queries with indexes
5. **Documentation**: Add JSDoc comments to all functions

---

## Contact & Support

**Project Maintainer**: Andy Howard (ahow)

**GitHub Issues**: https://github.com/ahow/climate-risk-dashboard/issues

**Documentation**: This file + inline code comments

---

## Appendix: Key Code References

### Database Schema
- [drizzle/schema.ts](https://github.com/ahow/climate-risk-dashboard/blob/main/drizzle/schema.ts)

### Backend Routers
- [server/routers.ts](https://github.com/ahow/climate-risk-dashboard/blob/main/server/routers.ts)

### API Integrations
- [server/services/externalApis.ts](https://github.com/ahow/climate-risk-dashboard/blob/main/server/services/externalApis.ts)
- [server/services/supplyChainApi.ts](https://github.com/ahow/climate-risk-dashboard/blob/main/server/services/supplyChainApi.ts)

### Operation Management
- [server/services/operationManager.ts](https://github.com/ahow/climate-risk-dashboard/blob/main/server/services/operationManager.ts)

### Frontend Pages
- [client/src/pages/Home.tsx](https://github.com/ahow/climate-risk-dashboard/blob/main/client/src/pages/Home.tsx)
- [client/src/pages/CompanyDetail.tsx](https://github.com/ahow/climate-risk-dashboard/blob/main/client/src/pages/CompanyDetail.tsx)
- [client/src/pages/CalculationMonitor.tsx](https://github.com/ahow/climate-risk-dashboard/blob/main/client/src/pages/CalculationMonitor.tsx)

### Utilities
- [server/utils/oecdMappings.ts](https://github.com/ahow/climate-risk-dashboard/blob/main/server/utils/oecdMappings.ts)

---

**Document Version**: 1.0  
**Last Updated**: January 17, 2026  
**Author**: Manus AI Assistant
