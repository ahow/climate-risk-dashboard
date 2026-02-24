import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1")
    ? false
    : { rejectUnauthorized: false },
});

async function addColumnIfNotExists(client: any, table: string, column: string, type: string) {
  const result = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
    [table, column]
  );
  if (result.rows.length === 0) {
    await client.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    console.log(`  + Added column ${column} to ${table}`);
    return true;
  }
  return false;
}

async function migrate() {
  const client = await pool.connect();
  try {
    console.log("Connected to database. Creating/updating tables...\n");

    await client.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id SERIAL PRIMARY KEY,
        isin VARCHAR(12) NOT NULL UNIQUE,
        company_name TEXT NOT NULL,
        sector TEXT,
        industry TEXT,
        country TEXT,
        total_asset_value REAL,
        asset_count INTEGER DEFAULT 0,
        isic_sector_code VARCHAR(10),
        country_iso3 VARCHAR(3)
      );
    `);
    await addColumnIfNotExists(client, "companies", "company_name", "TEXT");
    await addColumnIfNotExists(client, "companies", "sector", "TEXT");
    await addColumnIfNotExists(client, "companies", "industry", "TEXT");
    await addColumnIfNotExists(client, "companies", "country", "TEXT");
    await addColumnIfNotExists(client, "companies", "total_asset_value", "REAL");
    await addColumnIfNotExists(client, "companies", "asset_count", "INTEGER DEFAULT 0");
    await addColumnIfNotExists(client, "companies", "isic_sector_code", "VARCHAR(10)");
    await addColumnIfNotExists(client, "companies", "country_iso3", "VARCHAR(3)");
    console.log("✓ companies table ready");

    await client.query(`
      CREATE TABLE IF NOT EXISTS assets (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        facility_name TEXT NOT NULL,
        asset_type TEXT,
        address TEXT,
        city TEXT,
        country TEXT,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        coordinate_certainty INTEGER,
        estimated_value_usd REAL,
        valuation_confidence INTEGER,
        ownership_share REAL,
        data_source TEXT
      );
    `);
    await addColumnIfNotExists(client, "assets", "facility_name", "TEXT");
    await addColumnIfNotExists(client, "assets", "asset_type", "TEXT");
    await addColumnIfNotExists(client, "assets", "address", "TEXT");
    await addColumnIfNotExists(client, "assets", "city", "TEXT");
    await addColumnIfNotExists(client, "assets", "country", "TEXT");
    await addColumnIfNotExists(client, "assets", "coordinate_certainty", "INTEGER");
    await addColumnIfNotExists(client, "assets", "estimated_value_usd", "REAL");
    await addColumnIfNotExists(client, "assets", "valuation_confidence", "INTEGER");
    await addColumnIfNotExists(client, "assets", "ownership_share", "REAL");
    await addColumnIfNotExists(client, "assets", "data_source", "TEXT");
    console.log("✓ assets table ready");

    await client.query(`
      CREATE TABLE IF NOT EXISTS geo_risks (
        id SERIAL PRIMARY KEY,
        asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        expected_annual_loss REAL,
        expected_annual_loss_pct REAL,
        present_value_30yr REAL,
        hurricane_loss REAL,
        flood_loss REAL,
        heat_stress_loss REAL,
        drought_loss REAL,
        extreme_precip_loss REAL,
        model_version TEXT,
        calculated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await addColumnIfNotExists(client, "geo_risks", "expected_annual_loss", "REAL");
    await addColumnIfNotExists(client, "geo_risks", "expected_annual_loss_pct", "REAL");
    await addColumnIfNotExists(client, "geo_risks", "present_value_30yr", "REAL");
    await addColumnIfNotExists(client, "geo_risks", "hurricane_loss", "REAL");
    await addColumnIfNotExists(client, "geo_risks", "flood_loss", "REAL");
    await addColumnIfNotExists(client, "geo_risks", "heat_stress_loss", "REAL");
    await addColumnIfNotExists(client, "geo_risks", "drought_loss", "REAL");
    await addColumnIfNotExists(client, "geo_risks", "extreme_precip_loss", "REAL");
    await addColumnIfNotExists(client, "geo_risks", "model_version", "TEXT");
    await addColumnIfNotExists(client, "geo_risks", "calculated_at", "TIMESTAMP DEFAULT NOW()");
    console.log("✓ geo_risks table ready");

    await client.query(`
      CREATE TABLE IF NOT EXISTS supply_chain_risks (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        country_code VARCHAR(3),
        country_name TEXT,
        sector_code VARCHAR(10),
        sector_name TEXT,
        direct_risk JSONB,
        indirect_risk JSONB,
        total_risk JSONB,
        top_suppliers JSONB,
        direct_expected_loss REAL,
        direct_expected_loss_pct REAL,
        indirect_expected_loss REAL,
        indirect_expected_loss_pct REAL,
        calculated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await addColumnIfNotExists(client, "supply_chain_risks", "country_code", "VARCHAR(3)");
    await addColumnIfNotExists(client, "supply_chain_risks", "country_name", "TEXT");
    await addColumnIfNotExists(client, "supply_chain_risks", "sector_code", "VARCHAR(10)");
    await addColumnIfNotExists(client, "supply_chain_risks", "sector_name", "TEXT");
    await addColumnIfNotExists(client, "supply_chain_risks", "direct_risk", "JSONB");
    await addColumnIfNotExists(client, "supply_chain_risks", "indirect_risk", "JSONB");
    await addColumnIfNotExists(client, "supply_chain_risks", "total_risk", "JSONB");
    await addColumnIfNotExists(client, "supply_chain_risks", "top_suppliers", "JSONB");
    await addColumnIfNotExists(client, "supply_chain_risks", "direct_expected_loss", "REAL");
    await addColumnIfNotExists(client, "supply_chain_risks", "direct_expected_loss_pct", "REAL");
    await addColumnIfNotExists(client, "supply_chain_risks", "indirect_expected_loss", "REAL");
    await addColumnIfNotExists(client, "supply_chain_risks", "indirect_expected_loss_pct", "REAL");
    await addColumnIfNotExists(client, "supply_chain_risks", "calculated_at", "TIMESTAMP DEFAULT NOW()");
    console.log("✓ supply_chain_risks table ready");

    await client.query(`
      CREATE TABLE IF NOT EXISTS management_scores (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        total_score INTEGER,
        total_possible INTEGER,
        summary TEXT,
        analysis_status TEXT,
        scores JSONB,
        documents JSONB,
        calculated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await addColumnIfNotExists(client, "management_scores", "total_score", "INTEGER");
    await addColumnIfNotExists(client, "management_scores", "total_possible", "INTEGER");
    await addColumnIfNotExists(client, "management_scores", "summary", "TEXT");
    await addColumnIfNotExists(client, "management_scores", "analysis_status", "TEXT");
    await addColumnIfNotExists(client, "management_scores", "scores", "JSONB");
    await addColumnIfNotExists(client, "management_scores", "documents", "JSONB");
    await addColumnIfNotExists(client, "management_scores", "calculated_at", "TIMESTAMP DEFAULT NOW()");
    console.log("✓ management_scores table ready");

    await client.query(`
      CREATE TABLE IF NOT EXISTS operations (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL,
        company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'pending',
        total_items INTEGER DEFAULT 0,
        processed_items INTEGER DEFAULT 0,
        status_message TEXT,
        started_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP
      );
    `);
    await addColumnIfNotExists(client, "operations", "total_items", "INTEGER DEFAULT 0");
    await addColumnIfNotExists(client, "operations", "processed_items", "INTEGER DEFAULT 0");
    await addColumnIfNotExists(client, "operations", "status_message", "TEXT");
    await addColumnIfNotExists(client, "operations", "started_at", "TIMESTAMP DEFAULT NOW()");
    await addColumnIfNotExists(client, "operations", "completed_at", "TIMESTAMP");
    console.log("✓ operations table ready");

    await client.query(`
      CREATE TABLE IF NOT EXISTS company_list_uploads (
        id SERIAL PRIMARY KEY,
        file_name TEXT NOT NULL,
        row_count INTEGER DEFAULT 0,
        uploaded_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("✓ company_list_uploads table ready");

    await client.query(`
      CREATE TABLE IF NOT EXISTS company_list_entries (
        id SERIAL PRIMARY KEY,
        upload_id INTEGER NOT NULL REFERENCES company_list_uploads(id) ON DELETE CASCADE,
        isin VARCHAR(12) NOT NULL,
        company_name TEXT NOT NULL,
        level2_sector TEXT,
        level3_sector TEXT,
        level4_sector TEXT,
        level5_sector TEXT,
        geography TEXT,
        total_value REAL,
        ev REAL,
        supplier_costs REAL
      );
    `);
    console.log("✓ company_list_entries table ready");

    console.log("\nAll tables created/updated successfully!");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
