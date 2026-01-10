import { Router } from "express";
import { getDb } from "../db";

export const migrateRouter = Router();

/**
 * Database migration endpoint
 * This endpoint creates the uploadedFiles table if it doesn't exist
 * Access: GET /migrate/schema
 */
migrateRouter.get("/schema", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Database not available" });
    }

    // Create all necessary tables
    
    // 1. Create companies table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS companies (
        id int AUTO_INCREMENT PRIMARY KEY,
        isin varchar(12) NOT NULL UNIQUE,
        name varchar(255) NOT NULL,
        sector varchar(255),
        geography varchar(255),
        tangibleAssets varchar(50),
        enterpriseValue varchar(50),
        supplierCosts varchar(50),
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    // 2. Create assets table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS assets (
        id int AUTO_INCREMENT PRIMARY KEY,
        companyId int NOT NULL,
        assetName varchar(255),
        address text,
        latitude decimal(10, 8),
        longitude decimal(11, 8),
        city varchar(255),
        stateProvince varchar(255),
        country varchar(255),
        assetType varchar(255),
        assetSubtype varchar(255),
        estimatedValueUsd varchar(50),
        ownershipShare varchar(50),
        dataSources text,
        confidenceLevel varchar(50),
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (companyId) REFERENCES companies(id)
      )
    `);
    
    // 3. Create geographicRisks table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS geographicRisks (
        id int AUTO_INCREMENT PRIMARY KEY,
        assetId int NOT NULL,
        expectedAnnualLoss decimal(15, 2),
        presentValue decimal(15, 2),
        riskData json,
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (assetId) REFERENCES assets(id)
      )
    `);
    
    // 4. Create riskManagementScores table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS riskManagementScores (
        id int AUTO_INCREMENT PRIMARY KEY,
        companyId int NOT NULL,
        overallScore int,
        assessmentData json NOT NULL,
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    // 5. Create supplyChainRisks table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS supplyChainRisks (
        id int AUTO_INCREMENT PRIMARY KEY,
        companyId int NOT NULL,
        countryCode varchar(3) NOT NULL,
        sectorCode varchar(20) NOT NULL,
        expectedAnnualLossPct varchar(50),
        expectedAnnualLoss varchar(50),
        presentValue varchar(50),
        topSuppliers json,
        assessmentData json NOT NULL,
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    // 6. Create uploadedFiles table (without foreign key constraint to allow anonymous uploads)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS uploadedFiles (
        id int AUTO_INCREMENT PRIMARY KEY,
        filename varchar(255) NOT NULL,
        originalFilename varchar(255) NOT NULL,
        fileType varchar(100) NOT NULL,
        fileSize int NOT NULL,
        s3Key varchar(512) NOT NULL,
        s3Url varchar(1024) NOT NULL,
        uploadedBy int,
        uploadedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        description text
      )
    `);

    // Get list of uploaded files
    const [files] = await db.execute(
      'SELECT id, filename, originalFilename, s3Url, uploadedAt FROM uploadedFiles ORDER BY uploadedAt DESC LIMIT 10'
    );

    res.json({
      success: true,
      message: "Schema migration completed successfully",
      uploadedFiles: files,
      publicUrlFormat: "https://climate-risk-dash-40e3582ff948.herokuapp.com/public/files/{fileId}"
    });
  } catch (error: any) {
    console.error("Migration error:", error);
    res.status(500).json({
      error: "Migration failed",
      details: error.message
    });
  }
});

/**
 * Add supplierCosts column to companies table for existing Heroku deployments
 * Access: GET /migrate/add-supplier-costs
 */
migrateRouter.get("/add-supplier-costs", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Database not available" });
    }

    // Add supplierCosts column if it doesn't exist
    await db.execute(`
      ALTER TABLE companies 
      ADD COLUMN IF NOT EXISTS supplierCosts varchar(50)
    `);

    res.json({
      success: true,
      message: "supplierCosts column added to companies table successfully"
    });
  } catch (error: any) {
    console.error("Add supplierCosts error:", error);
    res.status(500).json({
      error: "Failed to add supplierCosts column",
      details: error.message
    });
  }
});

/**
 * Fix uploadedFiles table by dropping foreign key constraint
 * Access: GET /migrate/fix-uploaded-files
 */
migrateRouter.get("/fix-uploaded-files", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Database not available" });
    }

    // Create uploadedFiles table without foreign key constraint
    await db.execute(`
      CREATE TABLE IF NOT EXISTS uploadedFiles (
        id int AUTO_INCREMENT PRIMARY KEY,
        filename varchar(255) NOT NULL,
        originalFilename varchar(255) NOT NULL,
        fileType varchar(100) NOT NULL,
        fileSize int NOT NULL,
        s3Key varchar(512) NOT NULL,
        s3Url varchar(1024) NOT NULL,
        uploadedBy int,
        uploadedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        description text
      )
    `);

    res.json({
      success: true,
      message: "uploadedFiles table fixed successfully (foreign key constraint removed)"
    });
  } catch (error: any) {
    console.error("Fix uploadedFiles error:", error);
    res.status(500).json({
      error: "Failed to fix uploadedFiles table",
      details: error.message
    });
  }
});

