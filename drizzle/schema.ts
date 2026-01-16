import { integer, pgEnum, pgTable, text, timestamp, varchar, jsonb } from "drizzle-orm/pg-core";

/**
 * Enums
 */
export const roleEnum = pgEnum("role", ["user", "admin"]);
export const statusEnum = pgEnum("status", ["running", "completed", "failed", "cancelled", "paused"]);

/**
 * Core user table backing auth flow.
 */
export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Uploaded files table for storing CSV and other files with permanent S3 URLs
 */
export const uploadedFiles = pgTable("uploadedFiles", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  filename: varchar("filename", { length: 255 }).notNull(),
  originalFilename: varchar("originalFilename", { length: 255 }).notNull(),
  fileType: varchar("fileType", { length: 100 }).notNull(),
  fileSize: integer("fileSize").notNull(),
  s3Key: varchar("s3Key", { length: 512 }).notNull(),
  s3Url: varchar("s3Url", { length: 1024 }).notNull(),
  uploadedBy: integer("uploadedBy"), // No foreign key - allows anonymous uploads
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
  description: text("description"),
});

export type UploadedFile = typeof uploadedFiles.$inferSelect;
export type InsertUploadedFile = typeof uploadedFiles.$inferInsert;

/**
 * Companies table - stores the 20 companies from the uploaded list
 */
export const companies = pgTable("companies", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  isin: varchar("isin", { length: 12 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  sector: varchar("sector", { length: 255 }),
  geography: varchar("geography", { length: 255 }),
  tangibleAssets: varchar("tangibleAssets", { length: 50 }),
  enterpriseValue: varchar("enterpriseValue", { length: 50 }),
  supplierCosts: varchar("supplierCosts", { length: 50 }), // Total annual spending on suppliers
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Company = typeof companies.$inferSelect;
export type InsertCompany = typeof companies.$inferInsert;

/**
 * Assets table - stores asset location data from the Asset Discovery API
 */
export const assets = pgTable("assets", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  companyId: integer("companyId").notNull(),
  assetName: varchar("assetName", { length: 500 }).notNull(),
  address: text("address"),
  latitude: varchar("latitude", { length: 50 }),
  longitude: varchar("longitude", { length: 50 }),
  city: varchar("city", { length: 255 }),
  stateProvince: varchar("stateProvince", { length: 255 }),
  country: varchar("country", { length: 255 }),
  assetType: varchar("assetType", { length: 255 }),
  assetSubtype: varchar("assetSubtype", { length: 255 }),
  estimatedValueUsd: varchar("estimatedValueUsd", { length: 50 }),
  ownershipShare: varchar("ownershipShare", { length: 50 }),
  dataSources: text("dataSources"),
  confidenceLevel: varchar("confidenceLevel", { length: 50 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Asset = typeof assets.$inferSelect;
export type InsertAsset = typeof assets.$inferInsert;

/**
 * Geographic risk assessments - stores results from Geographic Risks API
 */
export const geographicRisks = pgTable("geographicRisks", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  assetId: integer("assetId").notNull(),
  latitude: varchar("latitude", { length: 50 }).notNull(),
  longitude: varchar("longitude", { length: 50 }).notNull(),
  assetValue: varchar("assetValue", { length: 50 }).notNull(),
  riskData: jsonb("riskData").notNull(), // Store the full API response
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type GeographicRisk = typeof geographicRisks.$inferSelect;
export type InsertGeographicRisk = typeof geographicRisks.$inferInsert;

/**
 * Risk management assessments - stores results from Risk Management API
 */
export const riskManagementScores = pgTable("riskManagementScores", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  companyId: integer("companyId").notNull(),
  overallScore: integer("overallScore"),
  assessmentData: jsonb("assessmentData").notNull(), // Store the full assessment JSON
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type RiskManagementScore = typeof riskManagementScores.$inferSelect;
export type InsertRiskManagementScore = typeof riskManagementScores.$inferInsert;

/**
 * Supply chain risk assessments - stores results from Supply Chain Risk API
 */
export const supplyChainRisks = pgTable("supplyChainRisks", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  companyId: integer("companyId").notNull(),
  countryCode: varchar("countryCode", { length: 3 }).notNull(), // OECD 3-letter code
  sectorCode: varchar("sectorCode", { length: 20 }).notNull(), // OECD ICIO sector code
  expectedAnnualLossPct: varchar("expectedAnnualLossPct", { length: 50 }), // Percentage from API
  expectedAnnualLoss: varchar("expectedAnnualLoss", { length: 50 }), // supplierCosts × lossPct
  presentValue: varchar("presentValue", { length: 50 }), // 30-year PV at 10% discount
  topSuppliers: jsonb("topSuppliers"), // Top 5 country-sector contributors
  assessmentData: jsonb("assessmentData").notNull(), // Full API response
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type SupplyChainRisk = typeof supplyChainRisks.$inferSelect;
export type InsertSupplyChainRisk = typeof supplyChainRisks.$inferInsert;


/**
 * Progress tracking table - stores state of long-running operations
 * Persists progress to survive server restarts and dyno cycling
 */
export const progressTracking = pgTable("progressTracking", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  operationId: varchar("operationId", { length: 255 }).notNull().unique(),
  operation: varchar("operation", { length: 255 }).notNull(),
  status: statusEnum("status").notNull(),
  current: integer("current").notNull().default(0),
  total: integer("total").notNull(),
  message: text("message"),
  error: text("error"),
  startedAt: timestamp("startedAt").notNull(),
  completedAt: timestamp("completedAt"),
  lastUpdatedAt: timestamp("lastUpdatedAt").defaultNow().notNull(),
});

export type ProgressTracking = typeof progressTracking.$inferSelect;
export type InsertProgressTracking = typeof progressTracking.$inferInsert;
