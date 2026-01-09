import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL || 'mysql://esc8hm494npybgfl:m0zzwrzxxj0mushu@vhw3t8e71xdz9k14.cbetxkdyhwsb.us-east-1.rds.amazonaws.com:3306/tb6loym8j90u3lup';

async function initializeSchema() {
  console.log('Connecting to Heroku database...');
  
  const connection = await mysql.createConnection(DATABASE_URL);
  const db = drizzle(connection);
  
  console.log('Creating tables...');
  
  // Create users table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      openId VARCHAR(64) NOT NULL UNIQUE,
      name TEXT,
      email VARCHAR(320),
      loginMethod VARCHAR(64),
      role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      lastSignedIn TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✓ Users table created');
  
  // Create companies table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS companies (
      id INT AUTO_INCREMENT PRIMARY KEY,
      isin VARCHAR(12) NOT NULL UNIQUE,
      name TEXT NOT NULL,
      sector TEXT,
      country VARCHAR(100),
      supplierCosts DECIMAL(20, 2),
      ev DECIMAL(20, 2),
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  console.log('✓ Companies table created');
  
  // Create assets table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS assets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      companyId INT NOT NULL,
      name TEXT NOT NULL,
      latitude DECIMAL(10, 7) NOT NULL,
      longitude DECIMAL(10, 7) NOT NULL,
      address TEXT,
      city VARCHAR(255),
      country VARCHAR(100),
      assetType VARCHAR(100),
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE CASCADE
    )
  `);
  console.log('✓ Assets table created');
  
  // Create geographicRisks table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS geographicRisks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      assetId INT NOT NULL,
      floodRisk DECIMAL(10, 4),
      wildfireRisk DECIMAL(10, 4),
      heatStressRisk DECIMAL(10, 4),
      extremePrecipRisk DECIMAL(10, 4),
      hurricaneRisk DECIMAL(10, 4),
      droughtRisk DECIMAL(10, 4),
      overallRisk DECIMAL(10, 4),
      calculatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (assetId) REFERENCES assets(id) ON DELETE CASCADE
    )
  `);
  console.log('✓ Geographic risks table created');
  
  // Create supplyChainRisks table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS supplyChainRisks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      companyId INT NOT NULL,
      riskScore DECIMAL(10, 4),
      riskLevel VARCHAR(50),
      details JSON,
      calculatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE CASCADE
    )
  `);
  console.log('✓ Supply chain risks table created');
  
  // Create riskManagement table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS riskManagement (
      id INT AUTO_INCREMENT PRIMARY KEY,
      companyId INT NOT NULL,
      totalScore DECIMAL(10, 4),
      analysisStatus VARCHAR(50),
      details JSON,
      assessedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (companyId) REFERENCES companies(id) ON DELETE CASCADE
    )
  `);
  console.log('✓ Risk management table created');
  
  // Create uploadedFiles table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS uploadedFiles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      originalFilename VARCHAR(255) NOT NULL,
      s3Key VARCHAR(500) NOT NULL,
      s3Url TEXT NOT NULL,
      fileType VARCHAR(100),
      fileSize INT NOT NULL,
      description TEXT,
      uploadedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✓ Uploaded files table created');
  
  await connection.end();
  console.log('\n✅ Database schema initialized successfully!');
}

initializeSchema().catch(console.error);
