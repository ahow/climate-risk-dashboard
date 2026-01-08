# Climate Risk Dashboard

A comprehensive web application for analyzing corporate climate risk exposure by aggregating physical climate risks from asset locations, supply chain vulnerabilities, and risk management performance.

![Climate Risk Dashboard](https://img.shields.io/badge/status-production-green) ![Node.js](https://img.shields.io/badge/node-%3E%3D22.0-brightgreen) ![License](https://img.shields.io/badge/license-MIT-blue)

## Overview

The Climate Risk Dashboard provides institutional investors and corporate risk managers with detailed climate risk assessments for publicly traded companies. The platform integrates multiple data sources to calculate:

- **Asset Risk**: Physical climate risks (flood, drought, heat stress, hurricanes, etc.) for corporate asset locations
- **Supply Chain Risk**: Indirect climate exposure through supply chain dependencies by country and sector
- **Management Performance**: Risk management effectiveness scores based on company disclosures
- **Net Expected Loss**: Total climate risk adjusted for management quality

### Key Features

✅ **Interactive Risk Analysis**
- Company-level risk breakdowns with detailed calculations
- Asset-by-asset climate risk assessment
- Supply chain vulnerability analysis by country/sector pairs
- Risk management performance scoring

✅ **Visual Data Exploration**
- Interactive maps showing asset locations with color-coded risk markers
- Clickable markers with detailed hazard breakdowns
- Real-time progress tracking for long-running calculations
- CSV export for further analysis

✅ **Enterprise-Grade Architecture**
- Built on React 19 + TypeScript + Tailwind CSS
- tRPC for type-safe API calls
- MySQL database with Drizzle ORM
- AWS S3 for file storage
- Supports 2,500+ assets across 100+ companies

---

## Demo

**Live Demo**: [Coming Soon]

**Screenshots**:

![Company List View](docs/screenshots/company-list.png)
*Company risk overview with Asset Risk, Supply Chain Risk, and Net Expected Loss*

![Asset Map View](docs/screenshots/asset-map.png)
*Interactive map showing asset locations with color-coded risk levels*

![Risk Breakdown](docs/screenshots/risk-breakdown.png)
*Detailed hazard breakdown by asset with expected annual losses*

---

## Quick Start

### Prerequisites

- Node.js 22.x or higher
- pnpm package manager
- MySQL database (TiDB, PlanetScale, or local MySQL)
- AWS S3 bucket (for file uploads)

### Installation

```bash
# Clone repository
git clone https://github.com/your-username/climate-risk-dashboard.git
cd climate-risk-dashboard

# Install dependencies
pnpm install

# Create environment file
cp .env.example .env
# Edit .env with your credentials (see ENV_VARIABLES.md)

# Initialize database
pnpm db:push

# Start development server
pnpm dev
```

Navigate to `http://localhost:3000` to view the application.

---

## Deployment

### Heroku (Recommended)

```bash
# Create Heroku app
heroku create your-app-name

# Add MySQL database
heroku addons:create jawsdb:kitefin

# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=$(openssl rand -hex 32)
heroku config:set DATABASE_URL=$(heroku config:get JAWSDB_URL)
# ... (see ENV_VARIABLES.md for complete list)

# Deploy
git push heroku main

# Initialize database
curl -X POST https://your-app-name.herokuapp.com/migrate/schema
```

**For detailed deployment instructions**, see:
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Comprehensive deployment guide
- [GITHUB_EXPORT.md](./GITHUB_EXPORT.md) - GitHub export and CI/CD setup
- [ENV_VARIABLES.md](./ENV_VARIABLES.md) - Environment variables reference

---

## Usage

### 1. Upload Company Data

Upload an Excel or CSV file with company information:

**Required columns:**
- `ISIN` - International Securities Identification Number
- `Name` - Company name
- `Sector` - Industry sector
- `Country` - Headquarters country

**Optional columns:**
- `SUPPLIERCOSTS` - Annual supplier costs (for supply chain risk)
- `EV` - Enterprise value (for percentage calculations)

### 2. Load Asset Locations

Click "Load All Assets" to fetch physical asset locations from the Corporate Asset Database API. The system matches companies by ISIN and retrieves:

- Asset addresses and coordinates
- Asset values (scaled and calibrated)
- Asset types and descriptions

**Expected output**: 2,500+ assets across 100 companies

### 3. Calculate Geographic Risks

Click "Calculate Geographic Risks" to assess climate risks for each asset location. The system calls the Climate Risk API for each coordinate to calculate:

- Flood risk
- Drought risk
- Heat stress risk
- Hurricane risk
- Extreme precipitation risk
- Wildfire risk

**Expected time**: 11-12 hours for 2,500+ assets (progress tracked in real-time)

### 4. Fetch Supply Chain Risks

Click "Fetch Supply Chain Risks" to assess indirect climate exposure through supply chains. The system:

- Maps company sectors to OECD industry codes
- Calls Supply Chain Risk API with country/sector pairs
- Calculates expected annual losses based on supplier costs

**Expected time**: 2-3 minutes for 100 companies

### 5. Fetch Risk Management Assessments

Click "Fetch Risk Assessments" to evaluate company risk management performance. The system retrieves:

- Overall risk management scores (0-100%)
- Detailed rationales and evidence
- Verbatim quotes from company disclosures
- Source documents and links

**Expected time**: 5-10 minutes for 100 companies

---

## Architecture

### Tech Stack

**Frontend:**
- React 19 with TypeScript
- Tailwind CSS 4 for styling
- tRPC for type-safe API calls
- Leaflet for interactive maps
- Wouter for routing

**Backend:**
- Node.js with Express
- tRPC for API layer
- Drizzle ORM for database
- MySQL for data storage
- AWS S3 for file uploads

**External APIs:**
- Corporate Asset Database API - Asset locations by ISIN
- Climate Risk API - Geographic climate risk calculations
- Supply Chain Risk API - Supply chain vulnerability assessment
- Risk Management API - Company risk management scoring

### Database Schema

```sql
-- Companies table
CREATE TABLE companies (
  id INT PRIMARY KEY AUTO_INCREMENT,
  isin VARCHAR(12) UNIQUE,
  name VARCHAR(255),
  sector VARCHAR(100),
  country VARCHAR(100),
  ev DECIMAL(20, 2),
  supplierCosts DECIMAL(20, 2)
);

-- Assets table
CREATE TABLE assets (
  id INT PRIMARY KEY AUTO_INCREMENT,
  companyId INT,
  name VARCHAR(255),
  address TEXT,
  latitude DECIMAL(10, 6),
  longitude DECIMAL(10, 6),
  value DECIMAL(20, 2),
  FOREIGN KEY (companyId) REFERENCES companies(id)
);

-- Geographic risks table
CREATE TABLE geographicRisks (
  id INT PRIMARY KEY AUTO_INCREMENT,
  assetId INT,
  riskType VARCHAR(50),
  expectedAnnualLoss DECIMAL(20, 2),
  presentValue30yr DECIMAL(20, 2),
  FOREIGN KEY (assetId) REFERENCES assets(id)
);

-- Supply chain risks table
CREATE TABLE supplyChainRisks (
  id INT PRIMARY KEY AUTO_INCREMENT,
  companyId INT,
  expectedAnnualLoss DECIMAL(20, 2),
  presentValue30yr DECIMAL(20, 2),
  FOREIGN KEY (companyId) REFERENCES companies(id)
);

-- Risk management scores table
CREATE TABLE riskManagementScores (
  id INT PRIMARY KEY AUTO_INCREMENT,
  companyId INT,
  score DECIMAL(5, 2),
  rationale TEXT,
  evidence JSON,
  FOREIGN KEY (companyId) REFERENCES companies(id)
);
```

### Risk Calculation Formula

The dashboard calculates Net Expected Loss using the following formula:

```
Asset Risk = Σ (Expected Annual Loss for all assets)

Supply Chain Risk = Σ (Expected Annual Loss from supply chain)

Total Risk = Asset Risk + Supply Chain Risk

Management Adjustment Factor = Linear interpolation:
  - 100% risk management score → 30% adjustment (70% reduction)
  - 0% risk management score → 100% adjustment (no reduction)

Net Expected Loss = Total Risk × Management Adjustment Factor
```

**Example:**
- Asset Risk: $10M
- Supply Chain Risk: $5M
- Total Risk: $15M
- Management Score: 80%
- Management Adjustment: 44% (linear: 100% → 30%, 0% → 100%)
- Net Expected Loss: $15M × 44% = $6.6M

---

## Project Structure

```
climate-risk-dashboard/
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── pages/         # Page components
│   │   │   ├── Home.tsx           # Main dashboard
│   │   │   ├── CompanyDetails.tsx # Company detail view
│   │   │   └── Rankings.tsx       # Rankings and export
│   │   ├── components/    # Reusable UI components
│   │   │   ├── ui/               # shadcn/ui components
│   │   │   ├── AssetMap.tsx      # Interactive Leaflet map
│   │   │   └── ProgressTracker.tsx # Real-time progress
│   │   ├── lib/           # tRPC client setup
│   │   └── App.tsx        # Main app with routing
│   └── public/            # Static assets
├── server/                # Backend Node.js application
│   ├── _core/             # Core server setup
│   │   ├── index.ts              # Express server
│   │   ├── trpc.ts               # tRPC configuration
│   │   └── context.ts            # Request context
│   ├── routers/           # tRPC routers
│   │   ├── companies.ts          # Company CRUD
│   │   ├── assets.ts             # Asset management
│   │   ├── geographicRisks.ts    # Geographic risk calculation
│   │   ├── supplyChainRisks.ts   # Supply chain assessment
│   │   └── riskManagement.ts     # Risk management scoring
│   ├── services/          # External API integrations
│   │   ├── assetDiscoveryApi.ts
│   │   ├── climateRiskApi.ts
│   │   ├── supplyChainApi.ts
│   │   └── riskManagementApi.ts
│   ├── utils/             # Utility functions
│   │   ├── oecdMappings.ts       # Sector code mappings
│   │   └── progressTracker.ts    # Progress tracking
│   └── db.ts              # Database query helpers
├── drizzle/               # Database schema
│   └── schema.ts          # Table definitions
├── shared/                # Shared types and constants
├── scripts/               # Build scripts
│   └── fix-imports.mjs    # Import path fixer for ES modules
├── docs/                  # Documentation
│   ├── DEPLOYMENT.md      # Deployment guide
│   ├── ENV_VARIABLES.md   # Environment variables
│   └── GITHUB_EXPORT.md   # GitHub export guide
├── Procfile               # Heroku configuration
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
└── README.md              # This file
```

---

## Development

### Available Scripts

```bash
# Development
pnpm dev          # Start dev server with hot reload
pnpm check        # TypeScript type checking
pnpm format       # Format code with Prettier

# Building
pnpm build        # Build for production
pnpm start        # Start production server

# Database
pnpm db:push      # Push schema changes to database

# Testing
pnpm test         # Run tests
```

### Adding New Features

1. **Create feature branch**
   ```bash
   git checkout -b feature/new-feature
   ```

2. **Update database schema** (if needed)
   ```typescript
   // drizzle/schema.ts
   export const newTable = mysqlTable('new_table', {
     id: int('id').autoincrement().primaryKey(),
     // ... columns
   });
   ```

3. **Add tRPC procedures**
   ```typescript
   // server/routers/newFeature.ts
   export const newFeatureRouter = router({
     list: publicProcedure.query(async () => {
       // Implementation
     }),
   });
   ```

4. **Create frontend components**
   ```typescript
   // client/src/pages/NewFeature.tsx
   export default function NewFeature() {
     const { data } = trpc.newFeature.list.useQuery();
     // Implementation
   }
   ```

5. **Test and commit**
   ```bash
   pnpm check
   pnpm build
   git add .
   git commit -m "Add new feature"
   git push origin feature/new-feature
   ```

---

## API Documentation

### tRPC Endpoints

#### Companies

```typescript
// List all companies with risk calculations
trpc.companies.list.useQuery()

// Get company details with assets and risk breakdowns
trpc.companies.getFullDetails.useQuery({ companyId: 1 })

// Upload company list from Excel/CSV
trpc.companies.uploadFile.useMutation()

// Bulk insert companies from parsed data
trpc.companies.bulkInsert.useMutation()
```

#### Assets

```typescript
// Get all assets
trpc.assets.getAll.useQuery()

// Fetch assets from external API for all companies
trpc.assets.fetchAllAssets.useMutation()
```

#### Geographic Risks

```typescript
// Calculate geographic risks for all assets
trpc.geographicRisks.calculateAll.useMutation()

// Get geographic risks for specific asset
trpc.geographicRisks.getByAssetId.useQuery({ assetId: 1 })

// Clear all geographic risks
trpc.geographicRisks.clearAll.useMutation()
```

#### Supply Chain Risks

```typescript
// Fetch supply chain risks for all companies
trpc.supplyChainRisks.fetchAll.useMutation()
```

#### Risk Management

```typescript
// Fetch risk management assessments for all companies
trpc.riskManagement.fetchAll.useMutation()
```

#### Progress Tracking

```typescript
// Get progress for specific operation
trpc.progress.get.useQuery({ operationId: 'calculate-geographic-risks' })

// Get all active operations
trpc.progress.getAll.useQuery()
```

---

## Contributing

Contributions are welcome! Please follow these guidelines:

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **Commit your changes** (`git commit -m 'Add amazing feature'`)
4. **Push to the branch** (`git push origin feature/amazing-feature`)
5. **Open a Pull Request**

### Code Style

- Use TypeScript for all new code
- Follow existing code formatting (Prettier)
- Add JSDoc comments for public functions
- Write tests for new features

### Commit Messages

Follow conventional commits format:

```
feat: Add new risk calculation method
fix: Correct supply chain API integration
docs: Update deployment guide
refactor: Simplify asset loading logic
test: Add tests for geographic risk calculation
```

---

## Troubleshooting

### Common Issues

**Issue: "Database connection failed"**

Solution: Verify `DATABASE_URL` format is correct:
```
mysql://username:password@host:port/database
```

**Issue: "Geographic risk calculation stuck"**

Solution: The Climate Risk API may be hibernating (Heroku free tier). Wait 30-60 seconds for it to wake up. Check server logs for specific errors.

**Issue: "Supply chain risks showing $0"**

Solution: Verify `SUPPLY_CHAIN_RISK_API_KEY` is set correctly and `SUPPLIERCOSTS` column exists in uploaded file.

**Issue: "Build fails with import errors"**

Solution: Run the import fixer script:
```bash
node scripts/fix-imports.mjs
```

For more troubleshooting tips, see [DEPLOYMENT.md](./DEPLOYMENT.md#troubleshooting).

---

## License

MIT License - See [LICENSE](./LICENSE) file for details.

---

## Acknowledgments

- **Climate Risk APIs**: Powered by external climate risk assessment services
- **Asset Data**: Corporate Asset Database API
- **Maps**: OpenStreetMap contributors and Leaflet library
- **UI Components**: shadcn/ui component library
- **Icons**: Lucide React icon library

---

## Contact

For questions, issues, or feature requests, please open an issue on GitHub or contact the maintainers.

**Project Link**: https://github.com/your-username/climate-risk-dashboard

---

## Roadmap

### Planned Features

- [ ] User authentication and role-based access
- [ ] Historical risk tracking and trend analysis
- [ ] Scenario analysis (RCP 2.6, 4.5, 8.5)
- [ ] Portfolio-level risk aggregation
- [ ] PDF report generation
- [ ] Email alerts for high-risk companies
- [ ] API rate limiting and caching
- [ ] Multi-language support
- [ ] Mobile app (React Native)

### Known Limitations

- Geographic risk calculation takes 11-12 hours for 2,500+ assets
- Supply Chain Risk API requires authentication key
- Some companies may have missing asset coordinates (cannot calculate geographic risks)
- Risk Management API may be slow or hibernating (external dependency)

---

## Version History

### v1.0.0 (Current)
- Initial release with core functionality
- Company risk analysis with Asset + Supply Chain + Management
- Interactive maps with color-coded risk markers
- Real-time progress tracking
- CSV export functionality
- Comprehensive deployment documentation

---

**Built with ❤️ for climate-conscious investors and risk managers**
