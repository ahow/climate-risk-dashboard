# GitHub Export and Deployment Guide

This guide explains how to export the Climate Risk Dashboard from Manus to GitHub and deploy it to external hosting platforms.

## Table of Contents

1. [Export from Manus to GitHub](#export-from-manus-to-github)
2. [Quick Start Deployment](#quick-start-deployment)
3. [Local Development Setup](#local-development-setup)
4. [Continuous Deployment](#continuous-deployment)

---

## Export from Manus to GitHub

### Option 1: Using Manus UI (Recommended)

1. **Open Management UI**
   - Click the "Management" icon in the top-right corner of the Manus interface
   - Navigate to **Settings** → **GitHub** in the left sidebar

2. **Create GitHub Repository**
   - Select repository owner (your GitHub username or organization)
   - Enter repository name (e.g., `climate-risk-dashboard`)
   - Choose visibility (Public or Private)
   - Click "Create Repository"

3. **Push Code**
   - Manus will automatically create the repository and push all project files
   - You'll receive a confirmation with the repository URL
   - Example: `https://github.com/your-username/climate-risk-dashboard`

### Option 2: Manual Git Export

If you prefer manual control or the UI option is unavailable:

```bash
# 1. Download project files from Manus
# Use the "Download All Files" button in Management UI → Code panel

# 2. Extract files to local directory
cd ~/Downloads
unzip climate-risk-dashboard.zip
cd climate-risk-dashboard

# 3. Initialize Git repository
git init
git add .
git commit -m "Initial commit: Climate Risk Dashboard from Manus"

# 4. Create GitHub repository
# Go to https://github.com/new and create a new repository

# 5. Push to GitHub
git remote add origin https://github.com/your-username/climate-risk-dashboard.git
git branch -M main
git push -u origin main
```

---

## Quick Start Deployment

Once your code is on GitHub, deploy to your preferred platform:

### Heroku (Recommended)

**Why Heroku?**
- Supports long-running operations (geographic risk calculation takes 11-12 hours)
- Easy database integration (JawsDB MySQL add-on)
- Automatic SSL certificates
- Free tier available (with credit card)

**Deploy Steps:**

```bash
# 1. Install Heroku CLI
brew install heroku/brew/heroku  # macOS
# Or download from: https://devcenter.heroku.com/articles/heroku-cli

# 2. Login to Heroku
heroku login

# 3. Create Heroku app
heroku create your-app-name

# 4. Add MySQL database
heroku addons:create jawsdb:kitefin

# 5. Set environment variables
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=$(openssl rand -hex 32)
heroku config:set AWS_ACCESS_KEY_ID=your-aws-key
heroku config:set AWS_SECRET_ACCESS_KEY=your-aws-secret
heroku config:set AWS_REGION=eu-west-2
heroku config:set AWS_S3_BUCKET=your-bucket-name
heroku config:set SUPPLY_CHAIN_RISK_API_KEY=your-api-key
heroku config:set VITE_APP_TITLE="Climate Risk Dashboard"
heroku config:set VITE_APP_LOGO=https://your-logo-url.com/logo.png

# 6. Copy database URL
heroku config:set DATABASE_URL=$(heroku config:get JAWSDB_URL)

# 7. Deploy from GitHub
git push heroku main

# 8. Initialize database
curl -X POST https://your-app-name.herokuapp.com/migrate/schema

# 9. Open application
heroku open
```

**Estimated time**: 10-15 minutes

---

### Vercel (For Serverless)

**⚠️ Warning**: Vercel has 10-second timeout for serverless functions. Geographic risk calculation (11-12 hours) will not work. Use Heroku instead for full functionality.

If you still want to try Vercel for testing:

```bash
# 1. Install Vercel CLI
npm i -g vercel

# 2. Login to Vercel
vercel login

# 3. Deploy
vercel --prod

# 4. Set environment variables in Vercel dashboard
# Go to: https://vercel.com/your-username/your-project/settings/environment-variables
```

**Limitations on Vercel:**
- ❌ Cannot run long-running operations (geographic risk calculation)
- ❌ Serverless functions timeout after 10 seconds
- ✅ Good for demo/testing purposes only

---

### DigitalOcean App Platform

**Why DigitalOcean?**
- Supports long-running operations
- Managed databases available
- $5/month starter tier
- Easy GitHub integration

**Deploy Steps:**

1. Go to [DigitalOcean App Platform](https://cloud.digitalocean.com/apps)
2. Click "Create App"
3. Connect your GitHub repository
4. Select `climate-risk-dashboard` repository
5. Configure build settings:
   - **Build Command**: `pnpm build`
   - **Run Command**: `node dist/index.js`
6. Add environment variables (see [ENV_VARIABLES.md](./ENV_VARIABLES.md))
7. Add MySQL database (Managed Database or external)
8. Click "Create Resources"

**Estimated time**: 15-20 minutes

---

### Railway

**Why Railway?**
- Simple GitHub integration
- Built-in database provisioning
- Free tier available ($5 credit/month)
- Automatic SSL

**Deploy Steps:**

1. Go to [Railway](https://railway.app)
2. Click "New Project" → "Deploy from GitHub repo"
3. Select `climate-risk-dashboard` repository
4. Railway auto-detects Node.js and runs build
5. Add MySQL database: "New" → "Database" → "MySQL"
6. Set environment variables in Railway dashboard
7. Copy `DATABASE_URL` from MySQL service to app service
8. Deploy automatically triggers

**Estimated time**: 10 minutes

---

## Local Development Setup

After exporting to GitHub, set up local development environment:

### Prerequisites

- **Node.js 22.x** or higher
- **pnpm** package manager
- **MySQL** database (local or remote)

### Setup Steps

```bash
# 1. Clone repository
git clone https://github.com/your-username/climate-risk-dashboard.git
cd climate-risk-dashboard

# 2. Install dependencies
pnpm install

# 3. Create .env file
cp .env.example .env
# Edit .env with your credentials (see ENV_VARIABLES.md)

# 4. Initialize database
# Option A: Using migration endpoint (requires server running)
pnpm dev  # Start dev server in another terminal
curl -X POST http://localhost:3000/migrate/schema

# Option B: Using drizzle-kit
pnpm db:push

# 5. Start development server
pnpm dev

# 6. Open browser
# Navigate to: http://localhost:3000
```

### Development Commands

```bash
# Start dev server (with hot reload)
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Type checking
pnpm check

# Format code
pnpm format

# Run tests
pnpm test

# Database migrations
pnpm db:push
```

---

## Continuous Deployment

Set up automatic deployments when you push to GitHub:

### Heroku + GitHub Integration

```bash
# 1. Connect Heroku app to GitHub
heroku git:remote -a your-app-name

# 2. Enable automatic deploys in Heroku dashboard
# Go to: https://dashboard.heroku.com/apps/your-app-name/deploy/github
# Click "Connect to GitHub"
# Select repository
# Enable "Automatic deploys" from main branch

# 3. Optional: Enable review apps for pull requests
# Go to: https://dashboard.heroku.com/apps/your-app-name/deploy/github
# Click "Enable Review Apps"
```

Now every push to `main` branch automatically deploys to Heroku.

---

### GitHub Actions (Any Platform)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '22'
      
      - name: Install pnpm
        run: npm install -g pnpm
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Build
        run: pnpm build
      
      - name: Deploy to Heroku
        uses: akhileshns/heroku-deploy@v3.12.14
        with:
          heroku_api_key: ${{secrets.HEROKU_API_KEY}}
          heroku_app_name: "your-app-name"
          heroku_email: "your-email@example.com"
```

**Setup:**

1. Get Heroku API key: `heroku auth:token`
2. Add to GitHub Secrets:
   - Go to: Repository → Settings → Secrets → Actions
   - Add `HEROKU_API_KEY` with your token
3. Push to `main` branch to trigger deployment

---

## Project Structure

Understanding the project structure helps with customization:

```
climate-risk-dashboard/
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── pages/         # Page components (Home, CompanyDetails, Rankings)
│   │   ├── components/    # Reusable UI components
│   │   ├── lib/           # tRPC client setup
│   │   └── App.tsx        # Main app component with routing
│   └── public/            # Static assets
├── server/                # Backend Node.js application
│   ├── _core/             # Core server setup (Express, tRPC, OAuth)
│   ├── routers/           # tRPC routers (companies, assets, risks)
│   ├── services/          # External API integrations
│   ├── utils/             # Utility functions (OECD mappings, progress tracker)
│   └── db.ts              # Database query helpers
├── drizzle/               # Database schema and migrations
│   └── schema.ts          # Table definitions
├── shared/                # Shared types and constants
├── scripts/               # Build scripts (fix-imports.mjs)
├── dist/                  # Compiled production code (generated)
├── Procfile               # Heroku deployment configuration
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
├── DEPLOYMENT.md          # Comprehensive deployment guide
├── ENV_VARIABLES.md       # Environment variables reference
└── GITHUB_EXPORT.md       # This file
```

---

## Customization After Export

### Change Branding

```bash
# Update environment variables
heroku config:set VITE_APP_TITLE="Your Company Climate Risk"
heroku config:set VITE_APP_LOGO=https://your-logo.com/logo.png

# Or edit .env locally
VITE_APP_TITLE=Your Company Climate Risk
VITE_APP_LOGO=https://your-logo.com/logo.png
```

### Add Custom Features

```bash
# 1. Create feature branch
git checkout -b feature/new-feature

# 2. Make changes
# Edit files in client/src/ or server/

# 3. Test locally
pnpm dev

# 4. Commit and push
git add .
git commit -m "Add new feature"
git push origin feature/new-feature

# 5. Create pull request on GitHub
# 6. Merge to main → automatic deployment (if CI/CD enabled)
```

### Update Dependencies

```bash
# Check for updates
pnpm outdated

# Update all dependencies
pnpm update

# Update specific package
pnpm update react react-dom

# Test after updates
pnpm build
pnpm test
```

---

## Troubleshooting

### "Build failed on Heroku"

**Check build logs:**
```bash
heroku logs --tail --app your-app-name
```

**Common causes:**
- Missing `heroku-postbuild` script in `package.json`
- Node.js version mismatch
- Missing environment variables during build

**Solution:**
```bash
# Ensure package.json has:
"scripts": {
  "heroku-postbuild": "pnpm build"
}

# Set Node.js version (if needed):
# Add to package.json:
"engines": {
  "node": "22.x"
}
```

### "Database connection failed"

**Check database URL:**
```bash
heroku config:get DATABASE_URL
```

**Solution:**
```bash
# For JawsDB, copy JAWSDB_URL to DATABASE_URL:
heroku config:set DATABASE_URL=$(heroku config:get JAWSDB_URL)
```

### "Application error" after deployment

**Check runtime logs:**
```bash
heroku logs --tail
```

**Common causes:**
- Missing environment variables
- Database not initialized
- Port binding issues

**Solution:**
```bash
# Verify all required env vars are set
heroku config

# Initialize database
curl -X POST https://your-app-name.herokuapp.com/migrate/schema

# Restart app
heroku restart
```

---

## Next Steps

After successful deployment:

1. **Upload Company Data**
   - Navigate to your deployed app
   - Click "Upload Company List"
   - Upload Excel/CSV with company ISINs

2. **Load Asset Data**
   - Click "Load All Assets"
   - Wait for asset locations to be fetched

3. **Calculate Risks**
   - Click "Calculate Geographic Risks" (takes 11-12 hours)
   - Click "Fetch Supply Chain Risks"
   - Click "Fetch Risk Assessments"

4. **Monitor Progress**
   - Progress bars show real-time status
   - Check server logs: `heroku logs --tail`

5. **Share with Team**
   - Add custom domain (optional)
   - Set up user authentication (optional)
   - Configure backups (recommended)

---

## Support Resources

- **Deployment Guide**: [DEPLOYMENT.md](./DEPLOYMENT.md)
- **Environment Variables**: [ENV_VARIABLES.md](./ENV_VARIABLES.md)
- **Heroku Documentation**: https://devcenter.heroku.com/
- **GitHub Actions**: https://docs.github.com/en/actions
- **DigitalOcean Docs**: https://docs.digitalocean.com/products/app-platform/

---

## Summary

**Quickest Path to Deployment:**

1. Export to GitHub using Manus UI (Settings → GitHub)
2. Deploy to Heroku: `heroku create && git push heroku main`
3. Add MySQL: `heroku addons:create jawsdb:kitefin`
4. Set environment variables (see ENV_VARIABLES.md)
5. Initialize database: `curl -X POST https://your-app.herokuapp.com/migrate/schema`
6. Upload company data and start calculations

**Total time**: ~20 minutes (excluding data processing)

---

For detailed deployment instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md)
