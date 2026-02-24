import { eq, desc } from "drizzle-orm";
import { db } from "./db";
import {
  companies, assets, geoRisks, supplyChainRisks, managementScores, operations,
  companyListUploads, companyListEntries,
  type Company, type InsertCompany,
  type Asset, type InsertAsset,
  type GeoRisk, type InsertGeoRisk,
  type SupplyChainRisk, type InsertSupplyChainRisk,
  type ManagementScore, type InsertManagementScore,
  type Operation, type InsertOperation,
  type CompanyListUpload, type InsertCompanyListUpload,
  type CompanyListEntry, type InsertCompanyListEntry,
} from "@shared/schema";

export interface IStorage {
  getCompanies(): Promise<Company[]>;
  getCompany(id: number): Promise<Company | undefined>;
  getCompanyByIsin(isin: string): Promise<Company | undefined>;
  createCompany(data: InsertCompany): Promise<Company>;
  updateCompany(id: number, data: Partial<InsertCompany>): Promise<Company>;
  deleteCompany(id: number): Promise<void>;

  getAssetsByCompany(companyId: number): Promise<Asset[]>;
  createAsset(data: InsertAsset): Promise<Asset>;
  deleteAssetsByCompany(companyId: number): Promise<void>;

  getGeoRisksByCompany(companyId: number): Promise<GeoRisk[]>;
  getGeoRisksByAsset(assetId: number): Promise<GeoRisk[]>;
  createGeoRisk(data: InsertGeoRisk): Promise<GeoRisk>;
  deleteGeoRisksByCompany(companyId: number): Promise<void>;

  getSupplyChainRisk(companyId: number): Promise<SupplyChainRisk | undefined>;
  createSupplyChainRisk(data: InsertSupplyChainRisk): Promise<SupplyChainRisk>;
  deleteSupplyChainRisk(companyId: number): Promise<void>;

  getManagementScore(companyId: number): Promise<ManagementScore | undefined>;
  createManagementScore(data: InsertManagementScore): Promise<ManagementScore>;
  deleteManagementScore(companyId: number): Promise<void>;

  getOperations(): Promise<Operation[]>;
  getOperation(id: number): Promise<Operation | undefined>;
  createOperation(data: InsertOperation): Promise<Operation>;
  updateOperation(id: number, data: Partial<Operation>): Promise<Operation>;
  deleteOperation(id: number): Promise<void>;

  getLatestCompanyListUpload(): Promise<CompanyListUpload | undefined>;
  getCompanyListUploads(): Promise<CompanyListUpload[]>;
  createCompanyListUpload(data: InsertCompanyListUpload): Promise<CompanyListUpload>;
  deleteCompanyListUpload(id: number): Promise<void>;
  getCompanyListEntries(uploadId: number): Promise<CompanyListEntry[]>;
  createCompanyListEntries(entries: InsertCompanyListEntry[]): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getCompanies(): Promise<Company[]> {
    return db.select().from(companies);
  }

  async getCompany(id: number): Promise<Company | undefined> {
    const [company] = await db.select().from(companies).where(eq(companies.id, id));
    return company;
  }

  async getCompanyByIsin(isin: string): Promise<Company | undefined> {
    const [company] = await db.select().from(companies).where(eq(companies.isin, isin.toUpperCase()));
    return company;
  }

  async createCompany(data: InsertCompany): Promise<Company> {
    const [company] = await db.insert(companies).values(data).returning();
    return company;
  }

  async updateCompany(id: number, data: Partial<InsertCompany>): Promise<Company> {
    const [company] = await db.update(companies).set(data).where(eq(companies.id, id)).returning();
    return company;
  }

  async deleteCompany(id: number): Promise<void> {
    await db.delete(companies).where(eq(companies.id, id));
  }

  async getAssetsByCompany(companyId: number): Promise<Asset[]> {
    return db.select().from(assets).where(eq(assets.companyId, companyId));
  }

  async createAsset(data: InsertAsset): Promise<Asset> {
    const [asset] = await db.insert(assets).values(data).returning();
    return asset;
  }

  async deleteAssetsByCompany(companyId: number): Promise<void> {
    await db.delete(assets).where(eq(assets.companyId, companyId));
  }

  async getGeoRisksByCompany(companyId: number): Promise<GeoRisk[]> {
    return db.select().from(geoRisks).where(eq(geoRisks.companyId, companyId));
  }

  async getGeoRisksByAsset(assetId: number): Promise<GeoRisk[]> {
    return db.select().from(geoRisks).where(eq(geoRisks.assetId, assetId));
  }

  async createGeoRisk(data: InsertGeoRisk): Promise<GeoRisk> {
    const [risk] = await db.insert(geoRisks).values(data).returning();
    return risk;
  }

  async deleteGeoRisksByCompany(companyId: number): Promise<void> {
    await db.delete(geoRisks).where(eq(geoRisks.companyId, companyId));
  }

  async getSupplyChainRisk(companyId: number): Promise<SupplyChainRisk | undefined> {
    const [risk] = await db.select().from(supplyChainRisks).where(eq(supplyChainRisks.companyId, companyId));
    return risk;
  }

  async createSupplyChainRisk(data: InsertSupplyChainRisk): Promise<SupplyChainRisk> {
    const [risk] = await db.insert(supplyChainRisks).values(data).returning();
    return risk;
  }

  async deleteSupplyChainRisk(companyId: number): Promise<void> {
    await db.delete(supplyChainRisks).where(eq(supplyChainRisks.companyId, companyId));
  }

  async getManagementScore(companyId: number): Promise<ManagementScore | undefined> {
    const [score] = await db.select().from(managementScores).where(eq(managementScores.companyId, companyId));
    return score;
  }

  async createManagementScore(data: InsertManagementScore): Promise<ManagementScore> {
    const [score] = await db.insert(managementScores).values(data).returning();
    return score;
  }

  async deleteManagementScore(companyId: number): Promise<void> {
    await db.delete(managementScores).where(eq(managementScores.companyId, companyId));
  }

  async getOperations(): Promise<Operation[]> {
    return db.select().from(operations).orderBy(desc(operations.startedAt));
  }

  async getOperation(id: number): Promise<Operation | undefined> {
    const [op] = await db.select().from(operations).where(eq(operations.id, id));
    return op;
  }

  async createOperation(data: InsertOperation): Promise<Operation> {
    const [op] = await db.insert(operations).values(data).returning();
    return op;
  }

  async updateOperation(id: number, data: Partial<Operation>): Promise<Operation> {
    const [op] = await db.update(operations).set(data).where(eq(operations.id, id)).returning();
    return op;
  }

  async deleteOperation(id: number): Promise<void> {
    await db.delete(operations).where(eq(operations.id, id));
  }

  async getLatestCompanyListUpload(): Promise<CompanyListUpload | undefined> {
    const [upload] = await db.select().from(companyListUploads).orderBy(desc(companyListUploads.uploadedAt)).limit(1);
    return upload;
  }

  async getCompanyListUploads(): Promise<CompanyListUpload[]> {
    return db.select().from(companyListUploads).orderBy(desc(companyListUploads.uploadedAt));
  }

  async createCompanyListUpload(data: InsertCompanyListUpload): Promise<CompanyListUpload> {
    const [upload] = await db.insert(companyListUploads).values(data).returning();
    return upload;
  }

  async deleteCompanyListUpload(id: number): Promise<void> {
    await db.delete(companyListUploads).where(eq(companyListUploads.id, id));
  }

  async getCompanyListEntries(uploadId: number): Promise<CompanyListEntry[]> {
    return db.select().from(companyListEntries).where(eq(companyListEntries.uploadId, uploadId));
  }

  async createCompanyListEntries(entries: InsertCompanyListEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const batchSize = 500;
    for (let i = 0; i < entries.length; i += batchSize) {
      await db.insert(companyListEntries).values(entries.slice(i, i + batchSize));
    }
  }
}

export const storage = new DatabaseStorage();
