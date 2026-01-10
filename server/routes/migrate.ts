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

    // Try to add the column - if it already exists, the error will be caught
    try {
      await db.execute(`
        ALTER TABLE companies 
        ADD COLUMN supplierCosts varchar(50)
      `);
    } catch (err: any) {
      // Ignore "Duplicate column" errors (code 1060)
      if (!err.message?.includes('Duplicate column')) {
        throw err;
      }
    }

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


/**
 * Reset database - DROP and recreate all tables with correct schema
 * WARNING: This will delete ALL data!
 * Access: GET /migrate/reset-database
 */
migrateRouter.get("/reset-database", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Database not available" });
    }

    // Drop all tables in reverse order (to handle foreign keys)
    const tablesToDrop = [
      'uploadedFiles',
      'supplyChainRisks',
      'riskManagementScores',
      'geographicRisks',
      'assets',
      'companies',
      'users'
    ];

    for (const table of tablesToDrop) {
      try {
        await db.execute(`DROP TABLE IF EXISTS ${table}`);
      } catch (err) {
        console.warn(`Could not drop table ${table}:`, err);
      }
    }

    // Recreate all tables with correct schema
    
    // 1. Users table
    await db.execute(`
      CREATE TABLE users (
        id int AUTO_INCREMENT PRIMARY KEY,
        openId varchar(64) NOT NULL UNIQUE,
        name text,
        email varchar(320),
        loginMethod varchar(64),
        role enum('user', 'admin') NOT NULL DEFAULT 'user',
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        lastSignedIn timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // 2. Companies table (with supplierCosts)
    await db.execute(`
      CREATE TABLE companies (
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
    
    // 3. Assets table
    await db.execute(`
      CREATE TABLE assets (
        id int AUTO_INCREMENT PRIMARY KEY,
        companyId int NOT NULL,
        assetName varchar(500),
        address text,
        latitude varchar(50),
        longitude varchar(50),
        city varchar(255),
        stateProvince varchar(255),
        country varchar(255),
        assetType varchar(255),
        assetValue varchar(50),
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    // 4. Geographic risks table
    await db.execute(`
      CREATE TABLE geographicRisks (
        id int AUTO_INCREMENT PRIMARY KEY,
        assetId int NOT NULL,
        latitude varchar(50) NOT NULL,
        longitude varchar(50) NOT NULL,
        assetValue varchar(50) NOT NULL,
        riskData json NOT NULL,
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    // 5. Risk management scores table
    await db.execute(`
      CREATE TABLE riskManagementScores (
        id int AUTO_INCREMENT PRIMARY KEY,
        companyId int NOT NULL,
        overallScore int,
        assessmentData json NOT NULL,
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    // 6. Supply chain risks table
    await db.execute(`
      CREATE TABLE supplyChainRisks (
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
    
    // 7. Uploaded files table (no foreign key)
    await db.execute(`
      CREATE TABLE uploadedFiles (
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
      message: "Database reset successfully - all tables recreated with correct schema",
      tables_created: tablesToDrop.length
    });
  } catch (error: any) {
    console.error("Reset database error:", error);
    res.status(500).json({
      error: "Failed to reset database",
      details: error.message
    });
  }
});
