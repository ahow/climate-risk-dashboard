import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { 
  InsertUser, 
  users, 
  companies, 
  Company, 
  InsertCompany,
  assets,
  Asset,
  InsertAsset,
  geographicRisks,
  GeographicRisk,
  InsertGeographicRisk,
  riskManagementScores,
  RiskManagementScore,
  InsertRiskManagementScore
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ========== Company Queries ==========

export async function getAllCompanies(): Promise<Company[]> {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select().from(companies);
}

export async function getCompanyByIsin(isin: string): Promise<Company | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(companies).where(eq(companies.isin, isin)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function insertCompany(company: InsertCompany): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  await db.insert(companies).values(company);
}

export async function bulkInsertCompanies(companyList: InsertCompany[]): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  for (const company of companyList) {
    await db.insert(companies).values(company).onDuplicateKeyUpdate({
      set: {
        name: company.name,
        sector: company.sector,
        geography: company.geography,
        tangibleAssets: company.tangibleAssets,
        enterpriseValue: company.enterpriseValue,
      }
    });
  }
}

// ========== Asset Queries ==========

export async function getAssetsByCompanyId(companyId: number): Promise<Asset[]> {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select().from(assets).where(eq(assets.companyId, companyId));
}

export async function insertAsset(asset: InsertAsset): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  await db.insert(assets).values(asset);
}

export async function bulkInsertAssets(assetList: InsertAsset[]): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  if (assetList.length === 0) return;
  
  await db.insert(assets).values(assetList);
}

// ========== Geographic Risk Queries ==========

export async function getGeographicRiskByAssetId(assetId: number): Promise<GeographicRisk | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(geographicRisks).where(eq(geographicRisks.assetId, assetId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function insertGeographicRisk(risk: InsertGeographicRisk): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  await db.insert(geographicRisks).values(risk);
}

// ========== Risk Management Queries ==========

export async function getRiskManagementByCompanyId(companyId: number): Promise<RiskManagementScore | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(riskManagementScores).where(eq(riskManagementScores.companyId, companyId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function insertRiskManagement(score: InsertRiskManagementScore): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  await db.insert(riskManagementScores).values(score);
}

