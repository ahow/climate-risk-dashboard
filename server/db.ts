import { desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { 
  InsertUploadedFile, 
  InsertUser, 
  uploadedFiles, 
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
  InsertRiskManagementScore,
  supplyChainRisks,
  SupplyChainRisk,
  InsertSupplyChainRisk
} from "../drizzle/schema";
import { ENV } from './_core/env';
import { queryCache, CACHE_TTL } from './utils/queryCache';

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
  // Check cache first
  const cached = queryCache.get<Company[]>('companies:all');
  if (cached) {
    return cached;
  }

  const db = await getDb();
  if (!db) return [];
  
  const result = await db.select().from(companies);
  
  // Cache the result
  queryCache.set('companies:all', result, CACHE_TTL.COMPANIES_LIST);
  
  return result;
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
  // Check cache first
  const cacheKey = `assets:company:${companyId}`;
  const cached = queryCache.get<Asset[]>(cacheKey);
  if (cached) {
    return cached;
  }

  const db = await getDb();
  if (!db) return [];
  
  const result = await db.select().from(assets).where(eq(assets.companyId, companyId));
  
  // Cache the result
  queryCache.set(cacheKey, result, CACHE_TTL.ASSETS);
  
  return result;
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
  
  // Prevent duplicates: check if assets with same companyId + assetName already exist
  const companyIds = Array.from(new Set(assetList.map(a => a.companyId)));
  const existingAssets = await db.select().from(assets).where(
    inArray(assets.companyId, companyIds)
  );
  
  const existingKeys = new Set(
    existingAssets.map(a => `${a.companyId}-${a.assetName}`)
  );
  
  const newAssets = assetList.filter(a => 
    !existingKeys.has(`${a.companyId}-${a.assetName}`)
  );
  
  if (newAssets.length === 0) {
    console.log('[Database] All assets already exist, skipping insert');
    return;
  }
  
  console.log(`[Database] Inserting ${newAssets.length} new assets (${assetList.length - newAssets.length} duplicates skipped)`);
  await db.insert(assets).values(newAssets);
}

// ========== Geographic Risk Queries ==========

export async function getGeographicRiskByAssetId(assetId: number): Promise<GeographicRisk | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(geographicRisks).where(eq(geographicRisks.assetId, assetId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllGeographicRisksByAssetId(assetId: number): Promise<GeographicRisk[]> {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select().from(geographicRisks).where(eq(geographicRisks.assetId, assetId));
}

export async function insertGeographicRisk(risk: InsertGeographicRisk): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  await db.insert(geographicRisks).values(risk);
}

export async function bulkInsertGeographicRisks(risks: InsertGeographicRisk[]): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  if (risks.length === 0) return;
  
  // Insert in batches of 100 to avoid query size limits
  const batchSize = 100;
  for (let i = 0; i < risks.length; i += batchSize) {
    const batch = risks.slice(i, i + batchSize);
    await db.insert(geographicRisks).values(batch);
  }
}

export async function getAllGeographicRiskAssetIds(): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  
  const results = await db.select({ assetId: geographicRisks.assetId }).from(geographicRisks);
  return results.map(r => r.assetId);
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

export async function getSupplyChainRiskByCompanyId(companyId: number): Promise<SupplyChainRisk | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(supplyChainRisks).where(eq(supplyChainRisks.companyId, companyId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function insertSupplyChainRisk(risk: InsertSupplyChainRisk): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  await db.insert(supplyChainRisks).values(risk);
}

export async function deleteSupplyChainRiskByCompanyId(companyId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  await db.delete(supplyChainRisks).where(eq(supplyChainRisks.companyId, companyId));
}



// ========== Additional Helper Functions ==========

export async function getCompanyById(id: number): Promise<Company | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAssetById(id: number): Promise<Asset | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function deleteGeographicRiskByAssetId(assetId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  await db.delete(geographicRisks).where(eq(geographicRisks.assetId, assetId));
}




// Uploaded Files
// Get or create a system user for anonymous uploads
async function getSystemUserId(): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Try to find existing system user
  const systemUser = await db.select().from(users).where(eq(users.openId, 'system-anonymous')).limit(1);
  
  if (systemUser.length > 0) {
    return systemUser[0].id;
  }
  
  // Create system user if it doesn't exist
  const result = await db.insert(users).values({
    openId: 'system-anonymous',
    name: 'Anonymous User',
    email: null,
    loginMethod: 'system',
    role: 'user',
  });
  
  return Number((result as any).insertId);
}

export async function createUploadedFile(file: InsertUploadedFile) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Allow truly anonymous uploads - no user lookup required
  const uploadedBy = file.uploadedBy ?? null;
  
  const result = await db.insert(uploadedFiles).values({
    filename: file.filename,
    originalFilename: file.originalFilename,
    fileType: file.fileType,
    fileSize: file.fileSize,
    s3Key: file.s3Key,
    s3Url: file.s3Url,
    uploadedBy,
    description: file.description,
  });
  
  return result;
}

export async function getAllUploadedFiles() {
  const db = await getDb();
  if (!db) return [];
  
  try {
    const result = await db.select().from(uploadedFiles).orderBy(desc(uploadedFiles.uploadedAt));
    return result;
  } catch (error) {
    console.error('[getAllUploadedFiles] Error:', error);
    // Fallback: try without ordering
    try {
      const result = await db.select().from(uploadedFiles);
      // Sort in JavaScript instead
      return result.sort((a, b) => {
        const dateA = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
        const dateB = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
        return dateB - dateA;
      });
    } catch (fallbackError) {
      console.error('[getAllUploadedFiles] Fallback error:', fallbackError);
      return [];
    }
  }
}

export async function getUploadedFileById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(uploadedFiles).where(eq(uploadedFiles.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

