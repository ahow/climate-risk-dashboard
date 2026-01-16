#!/usr/bin/env node
/**
 * Standalone PostgreSQL migration script
 * Creates all tables for the Climate Risk Dashboard
 * Usage: node migrate-postgres.mjs
 */

import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL environment variable is not set');
  process.exit(1);
}

console.log('🔌 Connecting to PostgreSQL database...');

const sql = postgres(DATABASE_URL, {
  ssl: 'require',
  max: 1,
});

async function migrate() {
  try {
    console.log('📋 Creating database schema...\n');

    // Create enums
    console.log('Creating enums...');
    await sql`
      DO $$ BEGIN
        CREATE TYPE "public"."role" AS ENUM('user', 'admin');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `;
    
    await sql`
      DO $$ BEGIN
        CREATE TYPE "public"."status" AS ENUM('running', 'completed', 'failed', 'cancelled', 'paused');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `;
    console.log('✅ Enums created\n');

    // Create users table
    console.log('Creating users table...');
    await sql`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        "openId" varchar(64) NOT NULL UNIQUE,
        "name" text,
        "email" varchar(320),
        "loginMethod" varchar(64),
        "role" "role" DEFAULT 'user' NOT NULL,
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL,
        "lastSignedIn" timestamp DEFAULT now() NOT NULL
      );
    `;
    console.log('✅ Users table created\n');

    // Create uploadedFiles table
    console.log('Creating uploadedFiles table...');
    await sql`
      CREATE TABLE IF NOT EXISTS "uploadedFiles" (
        "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        "filename" varchar(255) NOT NULL,
        "originalFilename" varchar(255) NOT NULL,
        "fileType" varchar(100) NOT NULL,
        "fileSize" integer NOT NULL,
        "s3Key" varchar(512) NOT NULL,
        "s3Url" varchar(1024) NOT NULL,
        "uploadedBy" integer,
        "uploadedAt" timestamp DEFAULT now() NOT NULL,
        "description" text
      );
    `;
    console.log('✅ UploadedFiles table created\n');

    // Create companies table
    console.log('Creating companies table...');
    await sql`
      CREATE TABLE IF NOT EXISTS "companies" (
        "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        "isin" varchar(12) NOT NULL UNIQUE,
        "name" varchar(255) NOT NULL,
        "sector" varchar(255),
        "geography" varchar(255),
        "tangibleAssets" varchar(50),
        "enterpriseValue" varchar(50),
        "supplierCosts" varchar(50),
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL
      );
    `;
    console.log('✅ Companies table created\n');

    // Create assets table
    console.log('Creating assets table...');
    await sql`
      CREATE TABLE IF NOT EXISTS "assets" (
        "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        "companyId" integer NOT NULL,
        "assetName" varchar(500) NOT NULL,
        "address" text,
        "latitude" varchar(50),
        "longitude" varchar(50),
        "city" varchar(255),
        "stateProvince" varchar(255),
        "country" varchar(255),
        "assetType" varchar(255),
        "assetSubtype" varchar(255),
        "estimatedValueUsd" varchar(50),
        "ownershipShare" varchar(50),
        "dataSources" text,
        "confidenceLevel" varchar(50),
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL
      );
    `;
    console.log('✅ Assets table created\n');

    // Create geographicRisks table
    console.log('Creating geographicRisks table...');
    await sql`
      CREATE TABLE IF NOT EXISTS "geographicRisks" (
        "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        "assetId" integer NOT NULL,
        "latitude" varchar(50) NOT NULL,
        "longitude" varchar(50) NOT NULL,
        "assetValue" varchar(50) NOT NULL,
        "riskData" jsonb NOT NULL,
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL
      );
    `;
    console.log('✅ GeographicRisks table created\n');

    // Create riskManagementScores table
    console.log('Creating riskManagementScores table...');
    await sql`
      CREATE TABLE IF NOT EXISTS "riskManagementScores" (
        "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        "companyId" integer NOT NULL,
        "overallScore" integer,
        "assessmentData" jsonb NOT NULL,
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL
      );
    `;
    console.log('✅ RiskManagementScores table created\n');

    // Create supplyChainRisks table
    console.log('Creating supplyChainRisks table...');
    await sql`
      CREATE TABLE IF NOT EXISTS "supplyChainRisks" (
        "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        "companyId" integer NOT NULL,
        "countryCode" varchar(3) NOT NULL,
        "sectorCode" varchar(20) NOT NULL,
        "expectedAnnualLossPct" varchar(50),
        "expectedAnnualLoss" varchar(50),
        "presentValue" varchar(50),
        "topSuppliers" jsonb,
        "assessmentData" jsonb NOT NULL,
        "createdAt" timestamp DEFAULT now() NOT NULL,
        "updatedAt" timestamp DEFAULT now() NOT NULL
      );
    `;
    console.log('✅ SupplyChainRisks table created\n');

    // Create progressTracking table
    console.log('Creating progressTracking table...');
    await sql`
      CREATE TABLE IF NOT EXISTS "progressTracking" (
        "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        "operationId" varchar(255) NOT NULL UNIQUE,
        "operation" varchar(255) NOT NULL,
        "status" "status" NOT NULL,
        "current" integer DEFAULT 0 NOT NULL,
        "total" integer NOT NULL,
        "message" text,
        "error" text,
        "startedAt" timestamp NOT NULL,
        "completedAt" timestamp,
        "lastUpdatedAt" timestamp DEFAULT now() NOT NULL
      );
    `;
    console.log('✅ ProgressTracking table created\n');

    // Verify tables
    console.log('📊 Verifying tables...');
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `;
    
    console.log('\n✅ Migration completed successfully!\n');
    console.log('📋 Created tables:');
    tables.forEach(t => console.log(`   - ${t.table_name}`));
    console.log('');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

migrate();
