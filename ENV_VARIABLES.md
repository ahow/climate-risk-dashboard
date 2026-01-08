# Environment Variables Reference

This document lists all environment variables required for the Climate Risk Dashboard.

## Required Variables

### Database Configuration

```bash
DATABASE_URL=mysql://username:password@host:port/database
```

**Description**: MySQL database connection string  
**Format**: `mysql://[user]:[password]@[host]:[port]/[database]`  
**Example**: `mysql://admin:password123@db.example.com:3306/climate_risk`  
**Where to get**: Your MySQL hosting provider (JawsDB, PlanetScale, TiDB, AWS RDS)

---

### JWT Authentication

```bash
JWT_SECRET=your-secret-key-here
```

**Description**: Secret key for signing JWT tokens  
**Format**: Random string (minimum 32 characters recommended)  
**Example**: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`  
**How to generate**: 
```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Using OpenSSL
openssl rand -hex 32
```

---

### AWS S3 Configuration

```bash
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_REGION=eu-west-2
AWS_S3_BUCKET=your-bucket-name
```

**Description**: AWS credentials for file storage  
**Where to get**: 
1. Go to AWS IAM Console
2. Create new user with S3 permissions
3. Generate access key
4. Create S3 bucket in your preferred region

**Permissions needed**:
- `s3:PutObject` - Upload files
- `s3:GetObject` - Download files
- `s3:DeleteObject` - Delete files (optional)

---

### Supply Chain Risk API

```bash
SUPPLY_CHAIN_RISK_API_KEY=your-api-key-here
```

**Description**: Authentication key for Supply Chain Risk API  
**API Endpoint**: `https://supply-chain-risk-api-7567b2b7e4c5.herokuapp.com`  
**Where to get**: Contact API provider or use existing key from Manus deployment

---

### Application Configuration

```bash
VITE_APP_TITLE=Climate Risk Dashboard
VITE_APP_LOGO=https://your-logo-url.com/logo.png
```

**Description**: Application branding  
**VITE_APP_TITLE**: Displayed in browser tab and header  
**VITE_APP_LOGO**: URL to logo image (PNG, SVG, or JPG)

---

### Node Environment

```bash
NODE_ENV=production
PORT=3000
```

**Description**: Runtime environment settings  
**NODE_ENV**: Set to `production` for deployment, `development` for local dev  
**PORT**: Server port (automatically set by Heroku, defaults to 3000)

---

## Optional Variables (Manus OAuth)

These variables are only needed if you want to use Manus OAuth authentication. For standalone deployment, you can implement your own authentication or remove the OAuth dependency.

```bash
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://portal.manus.im
VITE_APP_ID=your-app-id
OWNER_OPEN_ID=your-owner-openid
OWNER_NAME=Your Name
```

**Description**: Manus platform OAuth integration  
**Where to get**: Manus platform dashboard (not needed for external deployment)

---

## API Endpoints (Hardcoded)

The following API endpoints are hardcoded in the application source code. You don't need to set environment variables for these, but they are documented here for reference:

### Asset Discovery API

**Endpoint**: `https://corporate-asset-database-api-7a4f3c8d9e2b.herokuapp.com`  
**Purpose**: Fetch asset locations by company ISIN  
**Authentication**: None required  
**Usage**: Called by `server/services/assetDiscoveryApi.ts`

### Geographic Risk API

**Endpoint**: `https://climate-risk-api-v4-7da6992dc867.herokuapp.com`  
**Purpose**: Calculate climate risks for geographic coordinates  
**Authentication**: None required  
**Usage**: Called by `server/services/climateRiskApi.ts`  
**Note**: This is a production Heroku endpoint that stays awake (99%+ uptime)

### Supply Chain Risk API

**Endpoint**: `https://supply-chain-risk-api-7567b2b7e4c5.herokuapp.com`  
**Purpose**: Assess supply chain climate risks by country/sector  
**Authentication**: X-API-Key header (from `SUPPLY_CHAIN_RISK_API_KEY`)  
**Usage**: Called by `server/services/supplyChainApi.ts`

### Risk Management API

**Endpoint**: `https://climate-risk-replit-562361beb142.herokuapp.com`  
**Purpose**: Evaluate company risk management performance  
**Authentication**: None required  
**Usage**: Called by `server/routers/riskManagement.ts`

---

## Setting Environment Variables by Platform

### Heroku

```bash
# Set individual variables
heroku config:set DATABASE_URL=mysql://...
heroku config:set JWT_SECRET=...
heroku config:set AWS_ACCESS_KEY_ID=...

# View all variables
heroku config

# Remove a variable
heroku config:unset VARIABLE_NAME
```

### Vercel

```bash
# Via CLI
vercel env add DATABASE_URL

# Via Dashboard
# Go to: https://vercel.com/your-username/your-project/settings/environment-variables
```

### DigitalOcean App Platform

```bash
# Via Dashboard
# Go to: Apps → Your App → Settings → Environment Variables
```

### AWS Elastic Beanstalk

```bash
# Via CLI
eb setenv DATABASE_URL=mysql://... JWT_SECRET=...

# Via Console
# Go to: Configuration → Software → Environment properties
```

### Docker / Docker Compose

```yaml
# docker-compose.yml
services:
  app:
    environment:
      - DATABASE_URL=mysql://...
      - JWT_SECRET=...
      - AWS_ACCESS_KEY_ID=...
```

---

## Security Best Practices

### 1. Never Commit Secrets

Add to `.gitignore`:
```
.env
.env.local
.env.production
```

### 2. Use Strong Secrets

- **JWT_SECRET**: Minimum 32 characters, randomly generated
- **Database passwords**: Use strong, unique passwords
- **AWS credentials**: Rotate regularly, use IAM roles when possible

### 3. Restrict AWS Permissions

Create an IAM user with minimal permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::your-bucket-name/*"
    }
  ]
}
```

### 4. Enable SSL for Database

Most cloud database providers require SSL connections. Ensure your `DATABASE_URL` supports SSL or configure SSL options in your database client.

### 5. Rotate Credentials Regularly

- Change `JWT_SECRET` every 90 days
- Rotate AWS access keys every 90 days
- Update API keys when compromised

---

## Validation Checklist

Before deploying, verify all required variables are set:

- [ ] `DATABASE_URL` - Database connection string
- [ ] `JWT_SECRET` - JWT signing secret (32+ characters)
- [ ] `AWS_ACCESS_KEY_ID` - AWS access key
- [ ] `AWS_SECRET_ACCESS_KEY` - AWS secret key
- [ ] `AWS_REGION` - AWS region (e.g., `eu-west-2`)
- [ ] `AWS_S3_BUCKET` - S3 bucket name
- [ ] `SUPPLY_CHAIN_RISK_API_KEY` - Supply Chain API key
- [ ] `VITE_APP_TITLE` - Application title
- [ ] `VITE_APP_LOGO` - Logo URL
- [ ] `NODE_ENV=production` - Production environment flag

---

## Testing Environment Variables

### Test Database Connection

```bash
# Using MySQL CLI
mysql -h host -P port -u username -p database

# Using Node.js
node -e "require('mysql2').createConnection(process.env.DATABASE_URL).connect(err => console.log(err || 'Connected!'))"
```

### Test AWS S3 Access

```bash
# Using AWS CLI
aws s3 ls s3://your-bucket-name --region eu-west-2

# Using Node.js
node -e "const AWS = require('@aws-sdk/client-s3'); new AWS.S3Client({region: process.env.AWS_REGION}).send(new AWS.ListBucketsCommand({})).then(console.log)"
```

### Test API Keys

```bash
# Test Supply Chain Risk API
curl -H "X-API-Key: your-api-key" \
  "https://supply-chain-risk-api-7567b2b7e4c5.herokuapp.com/api/v4.1/supply-chain-risk?country=USA&sector=C10T12"
```

---

## Troubleshooting

### "Invalid DATABASE_URL format"

**Cause**: Incorrect connection string format  
**Solution**: Ensure format is `mysql://user:pass@host:port/db`

### "AWS credentials not found"

**Cause**: Missing or incorrect AWS environment variables  
**Solution**: Verify all three variables are set: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`

### "JWT verification failed"

**Cause**: `JWT_SECRET` mismatch or not set  
**Solution**: Ensure `JWT_SECRET` is the same across all deployments

### "Supply Chain API returns 401 Unauthorized"

**Cause**: Missing or invalid `SUPPLY_CHAIN_RISK_API_KEY`  
**Solution**: Verify API key is correct and set in environment variables

---

## Summary

**Minimum Required Variables for Deployment:**

1. `DATABASE_URL` - MySQL connection
2. `JWT_SECRET` - Authentication
3. `AWS_ACCESS_KEY_ID` - File storage
4. `AWS_SECRET_ACCESS_KEY` - File storage
5. `AWS_REGION` - File storage
6. `AWS_S3_BUCKET` - File storage
7. `SUPPLY_CHAIN_RISK_API_KEY` - Supply chain data
8. `NODE_ENV=production` - Runtime mode

**Optional Variables:**

- `VITE_APP_TITLE` - Branding (defaults to "Climate Risk Dashboard")
- `VITE_APP_LOGO` - Branding (defaults to placeholder)
- `PORT` - Server port (auto-set by most platforms)
- Manus OAuth variables (only for Manus platform integration)

---

For more information, see [DEPLOYMENT.md](./DEPLOYMENT.md)
