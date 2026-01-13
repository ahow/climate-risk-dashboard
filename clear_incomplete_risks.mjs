import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { sql } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL;

async function clearIncompleteRisks() {
  const connection = await mysql.createConnection(DATABASE_URL);
  const db = drizzle(connection);
  
  // Count before deletion
  const countBefore = await db.execute(sql`SELECT COUNT(*) as count FROM geographicRisks`);
  console.log(`Geographic risks before deletion: ${countBefore[0][0].count}`);
  
  // Delete all geographic risks
  await db.execute(sql`DELETE FROM geographicRisks`);
  
  // Count after deletion
  const countAfter = await db.execute(sql`SELECT COUNT(*) as count FROM geographicRisks`);
  console.log(`Geographic risks after deletion: ${countAfter[0][0].count}`);
  
  console.log(`\nCleared ${countBefore[0][0].count} incomplete geographic risk records`);
  
  await connection.end();
}

clearIncompleteRisks().catch(console.error);
