import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { sql } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL;

async function checkGeographicRisks() {
  const connection = await mysql.createConnection(DATABASE_URL);
  const db = drizzle(connection);
  
  // Count total geographic risks
  const countResult = await db.execute(sql`SELECT COUNT(*) as count FROM geographicRisks`);
  const totalRisks = countResult[0][0].count;
  
  // Count total assets
  const assetCountResult = await db.execute(sql`SELECT COUNT(*) as count FROM assets`);
  const totalAssets = assetCountResult[0][0].count;
  
  // Get sample of most recent risks
  const recentRisks = await db.execute(sql`
    SELECT assetId, createdAt 
    FROM geographicRisks 
    ORDER BY createdAt DESC 
    LIMIT 5
  `);
  
  console.log(`\n=== Geographic Risk Calculation Status ===`);
  console.log(`Total Assets: ${totalAssets}`);
  console.log(`Total Geographic Risks Calculated: ${totalRisks}`);
  console.log(`Progress: ${totalRisks}/${totalAssets} (${((totalRisks/totalAssets)*100).toFixed(2)}%)`);
  console.log(`\nMost Recent Risks:`);
  console.log(JSON.stringify(recentRisks[0], null, 2));
  
  await connection.end();
}

checkGeographicRisks().catch(console.error);
