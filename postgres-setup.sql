-- PostgreSQL Database Setup for Climate Risk Dashboard
-- Run this script in the Heroku Postgres console

-- Create enums
CREATE TYPE "public"."role" AS ENUM('user', 'admin');
CREATE TYPE "public"."status" AS ENUM('running', 'completed', 'failed', 'cancelled', 'paused');

-- Create users table
CREATE TABLE "users" (
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

-- Create uploadedFiles table
CREATE TABLE "uploadedFiles" (
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

-- Create companies table
CREATE TABLE "companies" (
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

-- Create assets table
CREATE TABLE "assets" (
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

-- Create geographicRisks table
CREATE TABLE "geographicRisks" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "assetId" integer NOT NULL,
  "latitude" varchar(50) NOT NULL,
  "longitude" varchar(50) NOT NULL,
  "assetValue" varchar(50) NOT NULL,
  "riskData" jsonb NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);

-- Create riskManagementScores table
CREATE TABLE "riskManagementScores" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "companyId" integer NOT NULL,
  "overallScore" integer,
  "assessmentData" jsonb NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);

-- Create supplyChainRisks table
CREATE TABLE "supplyChainRisks" (
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

-- Create progressTracking table
CREATE TABLE "progressTracking" (
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

-- Verify tables were created
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
