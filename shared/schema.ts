import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, real, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  isin: varchar("isin", { length: 12 }).notNull().unique(),
  companyName: text("company_name").notNull(),
  sector: text("sector"),
  industry: text("industry"),
  country: text("country"),
  totalAssetValue: real("total_asset_value"),
  assetCount: integer("asset_count").default(0),
  isicSectorCode: varchar("isic_sector_code", { length: 10 }),
  countryIso3: varchar("country_iso3", { length: 3 }),
  supplierCosts: real("supplier_costs"),
});

export const assets = pgTable("assets", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  facilityName: text("facility_name").notNull(),
  assetType: text("asset_type"),
  address: text("address"),
  city: text("city"),
  country: text("country"),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  coordinateCertainty: integer("coordinate_certainty"),
  estimatedValueUsd: real("estimated_value_usd"),
  valuationConfidence: integer("valuation_confidence"),
  ownershipShare: real("ownership_share"),
  dataSource: text("data_source"),
});

export const geoRisks = pgTable("geo_risks", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  expectedAnnualLoss: real("expected_annual_loss"),
  expectedAnnualLossPct: real("expected_annual_loss_pct"),
  presentValue30yr: real("present_value_30yr"),
  hurricaneLoss: real("hurricane_loss"),
  floodLoss: real("flood_loss"),
  heatStressLoss: real("heat_stress_loss"),
  droughtLoss: real("drought_loss"),
  extremePrecipLoss: real("extreme_precip_loss"),
  modelVersion: text("model_version"),
  calculatedAt: timestamp("calculated_at").defaultNow(),
});

export const supplyChainRisks = pgTable("supply_chain_risks", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  countryCode: varchar("country_code", { length: 3 }),
  countryName: text("country_name"),
  sectorCode: varchar("sector_code", { length: 10 }),
  sectorName: text("sector_name"),
  directRisk: jsonb("direct_risk"),
  indirectRisk: jsonb("indirect_risk"),
  totalRisk: jsonb("total_risk"),
  topSuppliers: jsonb("top_suppliers"),
  directExpectedLoss: real("direct_expected_loss"),
  directExpectedLossPct: real("direct_expected_loss_pct"),
  indirectExpectedLoss: real("indirect_expected_loss"),
  indirectExpectedLossPct: real("indirect_expected_loss_pct"),
  calculatedAt: timestamp("calculated_at").defaultNow(),
});

export const managementScores = pgTable("management_scores", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  totalScore: integer("total_score"),
  totalPossible: integer("total_possible"),
  summary: text("summary"),
  analysisStatus: text("analysis_status"),
  scores: jsonb("scores"),
  documents: jsonb("documents"),
  calculatedAt: timestamp("calculated_at").defaultNow(),
});

export const operations = pgTable("operations", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  totalItems: integer("total_items").default(0),
  processedItems: integer("processed_items").default(0),
  statusMessage: text("status_message"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const companyListUploads = pgTable("company_list_uploads", {
  id: serial("id").primaryKey(),
  fileName: text("file_name").notNull(),
  rowCount: integer("row_count").default(0),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
});

export const companyListEntries = pgTable("company_list_entries", {
  id: serial("id").primaryKey(),
  uploadId: integer("upload_id").notNull().references(() => companyListUploads.id, { onDelete: "cascade" }),
  isin: varchar("isin", { length: 12 }).notNull(),
  companyName: text("company_name").notNull(),
  level2Sector: text("level2_sector"),
  level3Sector: text("level3_sector"),
  level4Sector: text("level4_sector"),
  level5Sector: text("level5_sector"),
  geography: text("geography"),
  totalValue: real("total_value"),
  ev: real("ev"),
  supplierCosts: real("supplier_costs"),
});

export const insertCompanyListUploadSchema = createInsertSchema(companyListUploads).omit({ id: true });
export const insertCompanyListEntrySchema = createInsertSchema(companyListEntries).omit({ id: true });

export type CompanyListUpload = typeof companyListUploads.$inferSelect;
export type InsertCompanyListUpload = z.infer<typeof insertCompanyListUploadSchema>;
export type CompanyListEntry = typeof companyListEntries.$inferSelect;
export type InsertCompanyListEntry = z.infer<typeof insertCompanyListEntrySchema>;

export const insertCompanySchema = createInsertSchema(companies).omit({ id: true });
export const insertAssetSchema = createInsertSchema(assets).omit({ id: true });
export const insertGeoRiskSchema = createInsertSchema(geoRisks).omit({ id: true });
export const insertSupplyChainRiskSchema = createInsertSchema(supplyChainRisks).omit({ id: true });
export const insertManagementScoreSchema = createInsertSchema(managementScores).omit({ id: true });
export const insertOperationSchema = createInsertSchema(operations).omit({ id: true });

export type Company = typeof companies.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Asset = typeof assets.$inferSelect;
export type InsertAsset = z.infer<typeof insertAssetSchema>;
export type GeoRisk = typeof geoRisks.$inferSelect;
export type InsertGeoRisk = z.infer<typeof insertGeoRiskSchema>;
export type SupplyChainRisk = typeof supplyChainRisks.$inferSelect;
export type InsertSupplyChainRisk = z.infer<typeof insertSupplyChainRiskSchema>;
export type ManagementScore = typeof managementScores.$inferSelect;
export type InsertManagementScore = z.infer<typeof insertManagementScoreSchema>;
export type Operation = typeof operations.$inferSelect;
export type InsertOperation = z.infer<typeof insertOperationSchema>;
