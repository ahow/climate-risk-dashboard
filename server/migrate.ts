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

async function migrate() {
  const client = await pool.connect();
  try {
    console.log("Connected to database. Creating missing tables...");

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

    console.log("\nAll tables created successfully!");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
