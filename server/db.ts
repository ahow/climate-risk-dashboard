import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("localhost") || process.env.DATABASE_URL.includes("127.0.0.1")
    ? false
    : { rejectUnauthorized: false },
});
export const db = drizzle(pool, { schema });

export async function ensureSchemaUpdates() {
  const client = await pool.connect();
  try {
    const tableCheck = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='management_scores'`
    );
    if (tableCheck.rows.length === 0) {
      console.log("[db] Creating management_scores table");
      await client.query(`
        CREATE TABLE management_scores (
          id SERIAL PRIMARY KEY,
          company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
          total_score INTEGER,
          total_possible INTEGER,
          summary TEXT,
          analysis_status TEXT,
          scores JSONB,
          documents JSONB,
          calculated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      console.log("[db] management_scores table created");
    }

    const migrations = [
      {
        check: `SELECT column_name FROM information_schema.columns WHERE table_name='companies' AND column_name='supplier_costs'`,
        apply: `ALTER TABLE companies ADD COLUMN IF NOT EXISTS supplier_costs real`,
      },
      {
        check: `SELECT column_name FROM information_schema.columns WHERE table_name='company_list_entries' AND column_name='supplier_costs'`,
        apply: `ALTER TABLE company_list_entries ADD COLUMN IF NOT EXISTS supplier_costs real`,
      },
      {
        check: `SELECT column_name FROM information_schema.columns WHERE table_name='companies' AND column_name='ev'`,
        apply: `ALTER TABLE companies ADD COLUMN IF NOT EXISTS ev real`,
      },
    ];

    for (const migration of migrations) {
      const result = await client.query(migration.check);
      if (result.rows.length === 0) {
        console.log(`[db] Applying migration: ${migration.apply}`);
        await client.query(migration.apply);
      }
    }
    console.log("[db] Schema updates verified");
  } catch (err: any) {
    console.error("[db] Schema migration error:", err.message);
  } finally {
    client.release();
  }
}
