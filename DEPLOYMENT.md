# Climate Risk Dashboard - Deployment Guide

This guide explains how to deploy the Climate Risk Dashboard to external hosting platforms (Heroku, Vercel, or any Node.js hosting service).

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Variables](#environment-variables)
3. [Database Setup](#database-setup)
4. [Deployment Options](#deployment-options)
   - [Heroku Deployment](#heroku-deployment)
   - [Vercel Deployment](#vercel-deployment)
   - [Generic Node.js Hosting](#generic-nodejs-hosting)
5. [Post-Deployment Steps](#post-deployment-steps)
6. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before deploying, ensure you have:

- **Node.js 22.x** or higher
- **pnpm** package manager
- **MySQL database** (TiDB, PlanetScale, or any MySQL-compatible service)
- **AWS S3 bucket** (for file uploads)
- **API keys** for external climate risk APIs

---

## Environment Variables

The application requires the following environment variables. Create a `.env` file or configure them in your hosting platform:

### Required Variables

```bash
# Database Configuration
DATABASE_URL=mysql://username:password@host:port/database

# JWT Authentication
JWT_SECRET=your-secret-key-here

# Application Configuration
VITE_APP_TITLE=Climate Risk Dashboard
VITE_APP_LOGO=https://your-logo-url.com/logo.png

# AWS S3 Configuration (for file uploads)
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_REGION=eu-west-2
AWS_S3_BUCKET=your-bucket-name

# Supply Chain Risk API
SUPPLY_CHAIN_RISK_API_KEY=your-api-key-here

# Node Environment
NODE_ENV=production

# Port (automatically set by most platforms)
PORT=3000
```

### Optional Variables (Manus OAuth - not needed for standalone deployment)

```bash
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://portal.manus.im
VITE_APP_ID=your-app-id
OWNER_OPEN_ID=your-owner-openid
OWNER_NAME=Your Name
```

### API Endpoints (hardcoded in application, can be overridden)

The following APIs are used by the application:

- **Asset Discovery API**: `https://corporate-asset-database-api-7a4f3c8d9e2b.herokuapp.com`
- **Geographic Risk API**: `https://climate-risk-api-v4-7da6992dc867.herokuapp.com`
- **Supply Chain Risk API**: `https://supply-chain-risk-api-7567b2b7e4c5.herokuapp.com`
- **Risk Management API**: `https://climate-risk-replit-562361beb142.herokuapp.com`

---

## Database Setup

### 1. Create MySQL Database

Create a MySQL database on your preferred provider:

- **Heroku**: JawsDB MySQL add-on
- **PlanetScale**: Free tier available
- **TiDB Cloud**: Serverless tier available
- **AWS RDS**: MySQL instance

### 2. Run Database Migrations

After deployment, initialize the database schema:

```bash
# Option 1: Using the migration endpoint (recommended)
curl -X POST https://your-app-url.com/migrate/schema

# Option 2: Using drizzle-kit locally
pnpm db:push
```

The database schema includes the following tables:

- `companies` - Company information with ISINs and supplier costs
- `assets` - Physical asset locations with coordinates and values
- `geographicRisks` - Climate risk data for each asset
- `supplyChainRisks` - Supply chain climate risk assessments
- `riskManagementScores` - Risk management performance scores
- `uploadedFiles` - Uploaded company list files
- `users` - User authentication data

---

## Deployment Options

### Heroku Deployment

#### Step 1: Install Heroku CLI

```bash
# macOS
brew install heroku/brew/heroku

# Windows
# Download from https://devcenter.heroku.com/articles/heroku-cli
```

#### Step 2: Login and Create App

```bash
heroku login
heroku create your-app-name
```

#### Step 3: Add MySQL Database

```bash
# Add JawsDB MySQL add-on
heroku addons:create jawsdb:kitefin

# Get database URL
heroku config:get JAWSDB_URL
```

#### Step 4: Configure Environment Variables

```bash
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=your-secret-key
heroku config:set AWS_ACCESS_KEY_ID=your-aws-key
heroku config:set AWS_SECRET_ACCESS_KEY=your-aws-secret
heroku config:set AWS_REGION=eu-west-2
heroku config:set AWS_S3_BUCKET=your-bucket-name
heroku config:set SUPPLY_CHAIN_RISK_API_KEY=your-api-key
heroku config:set VITE_APP_TITLE="Climate Risk Dashboard"
heroku config:set VITE_APP_LOGO=https://your-logo-url.com/logo.png

# Copy JAWSDB_URL to DATABASE_URL
heroku config:set DATABASE_URL=$(heroku config:get JAWSDB_URL)
```

#### Step 5: Deploy

```bash
# Push to Heroku
git push heroku main

# Or if on a different branch
git push heroku your-branch:main

# Initialize database
curl -X POST https://your-app-name.herokuapp.com/migrate/schema
```

#### Step 6: Open Application

```bash
heroku open
```

---

### Vercel Deployment

**Note**: Vercel is optimized for serverless functions. For this full-stack application with long-running operations, Heroku or a traditional Node.js host is recommended.

#### Step 1: Install Vercel CLI

```bash
npm i -g vercel
```

#### Step 2: Create `vercel.json`

```json
{
  "version": 2,
  "builds": [
    {
      "src": "dist/index.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "dist/index.js"
    }
  ],
  "env": {
    "NODE_ENV": "production"
  }
}
```

#### Step 3: Deploy

```bash
# Build the project
pnpm build

# Deploy to Vercel
vercel --prod

# Set environment variables in Vercel dashboard
# https://vercel.com/your-username/your-project/settings/environment-variables
```

**Limitations on Vercel:**
- Serverless functions have 10-second timeout (geographic risk calculation takes hours)
- Not ideal for long-running background jobs
- Consider using Heroku or traditional hosting instead

---

### Generic Node.js Hosting

For any Node.js hosting platform (DigitalOcean, AWS EC2, Google Cloud Run, etc.):

#### Step 1: Build the Application

```bash
# Install dependencies
pnpm install

# Build frontend and backend
pnpm build
```

#### Step 2: Set Environment Variables

Configure all required environment variables in your hosting platform's dashboard or `.env` file.

#### Step 3: Start the Server

```bash
# Production start command
NODE_ENV=production node dist/index.js
```

#### Step 4: Configure Reverse Proxy (Optional)

If using Nginx or Apache, configure reverse proxy to forward traffic to your Node.js application:

**Nginx Example:**

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## Post-Deployment Steps

### 1. Initialize Database Schema

Visit the migration endpoint to create all database tables:

```bash
curl -X POST https://your-app-url.com/migrate/schema
```

Expected response:
```json
{
  "success": true,
  "message": "Schema migration completed successfully"
}
```

### 2. Upload Company Data

1. Navigate to your deployed application
2. Click "Upload Company List" button
3. Upload an Excel/CSV file with columns:
   - `ISIN` (required)
   - `Name` (required)
   - `Sector` (required)
   - `Country` (required)
   - `SUPPLIERCOSTS` (optional, for supply chain risk)
   - `EV` (optional, enterprise value)

### 3. Fetch Asset Data

Click "Load All Assets" button to fetch asset locations from the Corporate Asset Database API.

### 4. Calculate Geographic Risks

Click "Calculate Geographic Risks" button to start calculating climate risks for all assets.

**Note**: This operation takes approximately **11-12 hours** for 2,500+ assets. Progress is tracked in real-time.

### 5. Fetch Supply Chain Risks

Click "Fetch Supply Chain Risks" button to get supply chain climate risk assessments.

### 6. Fetch Risk Management Assessments

Click "Fetch Risk Assessments" button to load risk management performance scores.

---

## AWS S3 Configuration

### Create S3 Bucket

1. Go to AWS S3 Console
2. Create a new bucket (e.g., `climate-risk-dashboard-files`)
3. Configure bucket policy for public read access:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::your-bucket-name/*"
    }
  ]
}
```

4. Enable CORS:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": []
  }
]
```

5. Create IAM user with S3 access and save credentials

---

## Troubleshooting

### Issue: "Database connection failed"

**Solution**: Verify `DATABASE_URL` is correctly formatted:

```
mysql://username:password@host:port/database
```

For SSL connections (required by some providers), ensure your database client supports SSL.

### Issue: "Geographic risk calculation stuck"

**Causes**:
- Climate Risk API may be hibernating (Heroku free tier)
- Network timeout issues
- Invalid asset coordinates

**Solution**:
- Wait for API to wake up (30-60 seconds)
- Check server logs for specific errors
- Verify assets have valid latitude/longitude coordinates

### Issue: "Supply chain risks showing $0"

**Causes**:
- Invalid OECD sector codes
- Missing `SUPPLIERCOSTS` column in uploaded file
- API authentication failure

**Solution**:
- Verify `SUPPLY_CHAIN_RISK_API_KEY` is set correctly
- Ensure uploaded Excel file has `SUPPLIERCOSTS` column
- Check sector mappings in `server/utils/oecdMappings.ts`

### Issue: "File upload not working"

**Causes**:
- AWS S3 credentials not configured
- Bucket permissions incorrect
- CORS not enabled

**Solution**:
- Verify all AWS environment variables are set
- Check S3 bucket policy allows public read
- Enable CORS on S3 bucket

### Issue: "Build fails on Heroku"

**Causes**:
- Missing dependencies
- TypeScript compilation errors
- Node.js version mismatch

**Solution**:
- Ensure `heroku-postbuild` script runs: `"heroku-postbuild": "pnpm build"`
- Check Heroku build logs: `heroku logs --tail`
- Verify Node.js version in `package.json`: `"engines": { "node": "22.x" }`

---

## Production Checklist

Before going live, verify:

- [ ] All environment variables configured
- [ ] Database schema initialized (`/migrate/schema`)
- [ ] AWS S3 bucket created and configured
- [ ] Company data uploaded successfully
- [ ] Asset locations loaded (should see 2,500+ assets)
- [ ] Geographic risks calculated (may take 11-12 hours)
- [ ] Supply chain risks fetched
- [ ] Risk management assessments loaded
- [ ] Application accessible at production URL
- [ ] SSL certificate configured (automatic on Heroku/Vercel)
- [ ] Error monitoring configured (optional: Sentry, LogRocket)
- [ ] Backup strategy for database (automatic on most platforms)

---

## Architecture Overview

### Tech Stack

- **Frontend**: React 19 + TypeScript + Tailwind CSS
- **Backend**: Node.js + Express + tRPC
- **Database**: MySQL (TiDB/PlanetScale/JawsDB)
- **Storage**: AWS S3
- **Maps**: Leaflet + OpenStreetMap

### Key Features

1. **Company Risk Analysis**
   - Asset Risk (from geographic climate risks)
   - Supply Chain Risk (from OECD sector analysis)
   - Total Risk = Asset Risk + Supply Chain Risk
   - Net Expected Loss = Total Risk × Management Adjustment Factor

2. **Interactive Maps**
   - Color-coded risk markers (green/orange/red)
   - Clickable popups with asset details
   - Hazard breakdown by type

3. **Real-time Progress Tracking**
   - Long-running operations show progress bars
   - Percentage complete updates every second
   - Detailed status messages

4. **CSV Export**
   - Export complete company risk data
   - Includes all risk breakdowns and calculations

### External APIs

The dashboard integrates with four external APIs:

1. **Corporate Asset Database API** - Provides asset locations by ISIN
2. **Climate Risk API** - Calculates geographic climate risks for coordinates
3. **Supply Chain Risk API** - Assesses supply chain climate exposure by country/sector
4. **Risk Management API** - Evaluates company risk management performance

---

## Support

For issues or questions:

1. Check the [Troubleshooting](#troubleshooting) section
2. Review server logs: `heroku logs --tail` (Heroku) or check your platform's log viewer
3. Verify all environment variables are set correctly
4. Ensure external APIs are accessible (check API status pages)

---

## License

MIT License - See LICENSE file for details
