import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { fetchAssetLocations } from "./services/externalApis";
import {
  processGeographicRisks,
  processSupplyChainRisk,
  processManagementScore,
  processAllRisks,
  processBulkFromList,
  processMissingCompanies,
} from "./services/operationManager";
import { isinToIso3, sectorToIsic } from "./utils/mappings";
import { z } from "zod";
import multer from "multer";
import * as XLSX from "xlsx";
import { db, pool } from "./db";
import { geoRisks, supplyChainRisks, managementScores } from "@shared/schema";
import { sql } from "drizzle-orm";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get("/api/companies", async (_req, res) => {
    try {
      const client = await pool.connect();
      try {
        const result = await client.query(`
          SELECT
            c.id, c.isin, c.company_name, c.sector, c.country,
            c.total_asset_value, c.asset_count, c.supplier_costs, c.ev,
            COALESCE(g.total_geo_risk, 0) as raw_geo_risk,
            COALESCE(g.total_geo_risk_pv, 0) as raw_geo_risk_pv,
            COALESCE(g.risk_count, 0) as geo_risk_count,
            COALESCE(a.total_api_asset_value, 0) as api_asset_total,
            sc.indirect_risk -> 'expected_loss' as sc_expected_loss,
            sc.indirect_risk -> 'climate' as sc_climate,
            sc.indirect_risk -> 'political' as sc_political,
            sc.indirect_risk -> 'nature_loss' as sc_nature_loss,
            sc.indirect_risk -> 'water_stress' as sc_water_stress,
            ms.total_score as mgmt_total_score,
            ms.total_possible as mgmt_total_possible,
            CASE WHEN sc.company_id IS NOT NULL THEN true ELSE false END as has_sc,
            CASE WHEN ms.company_id IS NOT NULL THEN true ELSE false END as has_mgmt
          FROM companies c
          LEFT JOIN (
            SELECT company_id,
              SUM(expected_annual_loss) as total_geo_risk,
              SUM(present_value_30yr) as total_geo_risk_pv,
              COUNT(*) as risk_count
            FROM geo_risks GROUP BY company_id
          ) g ON g.company_id = c.id
          LEFT JOIN (
            SELECT company_id, SUM(estimated_value_usd) as total_api_asset_value
            FROM assets GROUP BY company_id
          ) a ON a.company_id = c.id
          LEFT JOIN supply_chain_risks sc ON sc.company_id = c.id
          LEFT JOIN management_scores ms ON ms.company_id = c.id
          ORDER BY c.id
        `);

        const enriched = result.rows.map((row: any) => {
          const rawGeoRisk = parseFloat(row.raw_geo_risk) || 0;
          const rawGeoRiskPV = parseFloat(row.raw_geo_risk_pv) || 0;
          const apiAssetTotal = parseFloat(row.api_asset_total) || 0;
          const companyAssetVal = parseFloat(row.total_asset_value) || 0;
          const geoScaleFactor = (apiAssetTotal > 0 && companyAssetVal > 0 && companyAssetVal < apiAssetTotal)
            ? companyAssetVal / apiAssetTotal : 1;

          let supplyChainRisk = null;
          if (row.has_sc) {
            supplyChainRisk = {
              indirectRisk: {
                expected_loss: row.sc_expected_loss,
                climate: row.sc_climate,
                political: row.sc_political,
                nature_loss: row.sc_nature_loss,
                water_stress: row.sc_water_stress,
              }
            };
          }

          return {
            id: row.id,
            isin: row.isin,
            companyName: row.company_name,
            sector: row.sector,
            country: row.country,
            totalAssetValue: companyAssetVal || null,
            assetCount: row.asset_count,
            supplierCosts: parseFloat(row.supplier_costs) || null,
            ev: parseFloat(row.ev) || null,
            totalGeoRisk: rawGeoRisk * geoScaleFactor,
            totalGeoRiskPV: rawGeoRiskPV * geoScaleFactor,
            supplyChainRisk,
            managementScore: row.has_mgmt ? { totalScore: row.mgmt_total_score, totalPossible: row.mgmt_total_possible } : null,
            hasGeoRisks: parseInt(row.geo_risk_count) > 0,
            hasSupplyChainRisk: row.has_sc,
            hasManagementScore: row.has_mgmt,
          };
        });

        console.log(`[companies] Returning ${enriched.length} companies`);
        res.json(enriched);
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error(`[companies] Fatal error loading companies:`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/companies/:id", async (req, res) => {
    try {
      const company = await storage.getCompany(parseInt(req.params.id));
      if (!company) return res.status(404).json({ error: "Company not found" });

      const assetsList = await storage.getAssetsByCompany(company.id);
      const geoRisks = await storage.getGeoRisksByCompany(company.id);
      const scRisk = await storage.getSupplyChainRisk(company.id);
      const mgmtScore = await storage.getManagementScore(company.id);

      const rawTotalGeoRisk = geoRisks.reduce((sum, r) => sum + (r.expectedAnnualLoss || 0), 0);
      const rawTotalGeoRiskPV = geoRisks.reduce((sum, r) => sum + (r.presentValue30yr || 0), 0);

      const apiAssetTotal = assetsList.reduce((sum, a) => sum + (a.estimatedValueUsd || 0), 0);
      const companyAssetVal = company.totalAssetValue || 0;
      const geoScaleFactor = (apiAssetTotal > 0 && companyAssetVal > 0 && companyAssetVal < apiAssetTotal)
        ? companyAssetVal / apiAssetTotal : 1;

      const assetsWithRisks = assetsList.map(asset => {
        const risk = geoRisks.find(r => r.assetId === asset.id);
        const scaledRisk = risk ? {
          ...risk,
          expectedAnnualLoss: (risk.expectedAnnualLoss || 0) * geoScaleFactor,
          presentValue30yr: (risk.presentValue30yr || 0) * geoScaleFactor,
        } : null;
        return { ...asset, geoRisk: scaledRisk };
      });

      res.json({
        ...company,
        assets: assetsWithRisks,
        totalGeoRisk: rawTotalGeoRisk * geoScaleFactor,
        totalGeoRiskPV: rawTotalGeoRiskPV * geoScaleFactor,
        geoRisks: geoRisks.map(r => ({
          ...r,
          expectedAnnualLoss: (r.expectedAnnualLoss || 0) * geoScaleFactor,
          presentValue30yr: (r.presentValue30yr || 0) * geoScaleFactor,
        })),
        supplyChainRisk: scRisk,
        managementScore: mgmtScore,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/companies", async (req, res) => {
    try {
      const schema = z.object({
        isin: z.string().min(12).max(12),
        isicSectorCode: z.string().optional(),
      });
      const { isin, isicSectorCode } = schema.parse(req.body);

      const existing = await storage.getCompanyByIsin(isin.toUpperCase());
      if (existing) {
        return res.status(409).json({ error: "Company already exists", company: existing });
      }

      const assetData = await fetchAssetLocations(isin);

      if (assetData.assetCount === 0 || assetData.assets.length === 0) {
        return res.status(404).json({ error: "No asset data found for this ISIN" });
      }

      const countryIso3 = isinToIso3(isin);
      const detectedSector = assetData.sector;
      const isicCode = isicSectorCode || sectorToIsic(detectedSector);

      const company = await storage.createCompany({
        isin: isin.toUpperCase(),
        companyName: assetData.companyName,
        sector: detectedSector,
        country: assetData.assets[0]?.country || null,
        totalAssetValue: assetData.totalEstimatedValue,
        assetCount: assetData.assetCount,
        isicSectorCode: isicCode,
        countryIso3: countryIso3,
      });

      const validAssets = assetData.assets.filter(a => 
        a.latitude != null && a.longitude != null && 
        !isNaN(a.latitude) && !isNaN(a.longitude)
      );

      for (const asset of validAssets) {
        await storage.createAsset({
          companyId: company.id,
          facilityName: asset.facilityName,
          assetType: asset.assetType,
          address: asset.address,
          city: asset.city,
          country: asset.country,
          latitude: asset.latitude,
          longitude: asset.longitude,
          coordinateCertainty: asset.coordinateCertainty,
          estimatedValueUsd: asset.estimatedValueUsd,
          valuationConfidence: asset.valuationConfidence,
          ownershipShare: asset.ownershipShare,
          dataSource: asset.dataSource,
        });
      }

      res.status(201).json(company);
    } catch (err: any) {
      if (err.name === "ZodError") {
        return res.status(400).json({ error: "Invalid ISIN format" });
      }
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/companies/:id", async (req, res) => {
    try {
      await storage.deleteCompany(parseInt(req.params.id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/companies/:id/calculate/geographic", async (req, res) => {
    try {
      const companyId = parseInt(req.params.id);
      const company = await storage.getCompany(companyId);
      if (!company) return res.status(404).json({ error: "Company not found" });

      const operation = await storage.createOperation({
        type: "geographic_risk",
        companyId,
        status: "pending",
        statusMessage: `Starting geographic risk calculation for ${company.companyName}`,
      });

      processGeographicRisks(operation.id, companyId);
      res.json(operation);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/companies/:id/calculate/supply-chain", async (req, res) => {
    try {
      const companyId = parseInt(req.params.id);
      const company = await storage.getCompany(companyId);
      if (!company) return res.status(404).json({ error: "Company not found" });

      const operation = await storage.createOperation({
        type: "supply_chain_risk",
        companyId,
        status: "pending",
        statusMessage: `Starting supply chain risk calculation for ${company.companyName}`,
      });

      processSupplyChainRisk(operation.id, companyId);
      res.json(operation);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/companies/:id/calculate/management", async (req, res) => {
    try {
      const companyId = parseInt(req.params.id);
      const company = await storage.getCompany(companyId);
      if (!company) return res.status(404).json({ error: "Company not found" });

      const operation = await storage.createOperation({
        type: "management_score",
        companyId,
        status: "pending",
        statusMessage: `Starting management assessment for ${company.companyName}`,
      });

      processManagementScore(operation.id, companyId);
      res.json(operation);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/companies/:id/calculate/all", async (req, res) => {
    try {
      const companyId = parseInt(req.params.id);
      const company = await storage.getCompany(companyId);
      if (!company) return res.status(404).json({ error: "Company not found" });

      const operation = await storage.createOperation({
        type: "full_assessment",
        companyId,
        status: "pending",
        statusMessage: `Starting full risk assessment for ${company.companyName}`,
      });

      processAllRisks(operation.id, companyId);
      res.json(operation);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/operations/:id", async (req, res) => {
    try {
      const op = await storage.getOperation(parseInt(req.params.id));
      if (!op) return res.status(404).json({ error: "Operation not found" });
      const company = op.companyId ? await storage.getCompany(op.companyId) : null;
      res.json({ ...op, companyName: company?.companyName || "Unknown" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/operations", async (_req, res) => {
    try {
      const ops = await storage.getOperations();
      const enriched = await Promise.all(
        ops.map(async (op) => {
          const company = op.companyId ? await storage.getCompany(op.companyId) : null;
          return { ...op, companyName: company?.companyName || "Unknown" };
        })
      );
      res.json(enriched);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/operations/:id/pause", async (req, res) => {
    try {
      const op = await storage.updateOperation(parseInt(req.params.id), { status: "paused" });
      res.json(op);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/operations/:id/resume", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const op = await storage.getOperation(id);
      if (!op) return res.status(404).json({ error: "Operation not found" });

      await storage.updateOperation(id, { status: "running" });

      if (op.type === "geographic_risk" && op.companyId) {
        processGeographicRisks(id, op.companyId);
      } else if (op.type === "supply_chain_risk" && op.companyId) {
        processSupplyChainRisk(id, op.companyId);
      } else if (op.type === "management_score" && op.companyId) {
        processManagementScore(id, op.companyId);
      } else if (op.type === "full_assessment" && op.companyId) {
        processAllRisks(id, op.companyId);
      } else if (op.type === "bulk_processing") {
        const latest = await storage.getLatestCompanyListUpload();
        if (latest) processBulkFromList(id, latest.id);
      } else if (op.type === "process_missing") {
        processMissingCompanies(id);
      }

      res.json(await storage.getOperation(id));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/operations/:id", async (req, res) => {
    try {
      const op = await storage.getOperation(parseInt(req.params.id));
      if (op && (op.status === "running" || op.status === "pending")) {
        await storage.updateOperation(parseInt(req.params.id), {
          status: "cancelled",
          statusMessage: "Cancelled by user",
          completedAt: new Date(),
        });
      } else {
        await storage.deleteOperation(parseInt(req.params.id));
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

  app.post("/api/company-list/upload", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<any>(worksheet);

      if (rows.length === 0) {
        return res.status(400).json({ error: "Spreadsheet is empty" });
      }

      const uploadRecord = await storage.createCompanyListUpload({
        fileName: req.file.originalname,
        rowCount: rows.length,
      });

      const entries = rows.map((row: any) => ({
        uploadId: uploadRecord.id,
        isin: String(row["ISIN"] || "").trim(),
        companyName: String(row["Company"] || row["COMPANY"] || "").trim(),
        level2Sector: row["LEVEL2 SECTOR NAME"] || null,
        level3Sector: row["LEVEL3 SECTOR NAME"] || null,
        level4Sector: row["LEVEL4 SECTOR NAME"] || null,
        level5Sector: row["LEVEL5 SECTOR NAME"] || null,
        geography: row["GEOGRAPHIC DESCR."] || row["GEOGRAPHIC DESCR"] || null,
        totalValue: row["TotalValue"] != null ? Number(row["TotalValue"]) : null,
        ev: row["EV"] != null ? Number(row["EV"]) : null,
        supplierCosts: row["SUPPLIERCOSTS"] != null ? Number(row["SUPPLIERCOSTS"]) : null,
      })).filter((e: any) => e.isin && e.companyName);

      await storage.createCompanyListEntries(entries);

      res.status(201).json({
        id: uploadRecord.id,
        fileName: uploadRecord.fileName,
        rowCount: entries.length,
        uploadedAt: uploadRecord.uploadedAt,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/company-list", async (_req, res) => {
    try {
      const uploads = await storage.getCompanyListUploads();
      res.json(uploads);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/company-list/latest", async (_req, res) => {
    try {
      const latest = await storage.getLatestCompanyListUpload();
      if (!latest) {
        return res.status(404).json({ error: "No company list uploaded yet" });
      }
      const entries = await storage.getCompanyListEntries(latest.id);
      res.json({ upload: latest, entries });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/company-list/download", async (_req, res) => {
    try {
      const latest = await storage.getLatestCompanyListUpload();
      if (!latest) {
        return res.status(404).json({ error: "No company list uploaded yet" });
      }
      const entries = await storage.getCompanyListEntries(latest.id);

      const data = entries.map(e => ({
        "ISIN": e.isin,
        "Company": e.companyName,
        "LEVEL2 SECTOR NAME": e.level2Sector || "",
        "LEVEL3 SECTOR NAME": e.level3Sector || "",
        "LEVEL4 SECTOR NAME": e.level4Sector || "",
        "LEVEL5 SECTOR NAME": e.level5Sector || "",
        "GEOGRAPHIC DESCR.": e.geography || "",
        "TotalValue": e.totalValue || 0,
        "EV": e.ev || 0,
        "SUPPLIERCOSTS": e.supplierCosts || 0,
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename=company-list.xlsx`);
      res.send(buffer);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/company-list/download/csv", async (_req, res) => {
    try {
      const latest = await storage.getLatestCompanyListUpload();
      if (!latest) {
        return res.status(404).json({ error: "No company list uploaded yet" });
      }
      const entries = await storage.getCompanyListEntries(latest.id);

      const headers = ["ISIN", "Company", "LEVEL2 SECTOR NAME", "LEVEL3 SECTOR NAME", "LEVEL4 SECTOR NAME", "LEVEL5 SECTOR NAME", "GEOGRAPHIC DESCR.", "TotalValue", "EV", "SUPPLIERCOSTS"];
      const csvLines = [
        headers.join(","),
        ...entries.map(e => {
          const vals = [
            e.isin, e.companyName, e.level2Sector || "", e.level3Sector || "",
            e.level4Sector || "", e.level5Sector || "", e.geography || "",
            String(e.totalValue || 0), String(e.ev || 0), String(e.supplierCosts || 0),
          ];
          return vals.map(v => v.includes(",") ? `"${v}"` : v).join(",");
        }),
      ];

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=company-list.csv");
      res.send(csvLines.join("\n"));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/clear-risk-data", async (_req, res) => {
    try {
      const ops = await storage.getOperations();
      const running = ops.find(
        (op) => op.status === "running" || op.status === "pending"
      );
      if (running) {
        return res.status(409).json({ error: "Cannot clear data while a processing operation is running" });
      }

      const result = await storage.clearAllRiskData();
      res.json({
        message: "All risk data cleared successfully",
        deleted: result,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/company-list/process-all", async (_req, res) => {
    try {
      const ops = await storage.getOperations();
      const existingBulk = ops.find(
        (op) => op.type === "bulk_processing" && (op.status === "running" || op.status === "pending")
      );
      if (existingBulk) {
        return res.status(409).json({ error: "A bulk processing operation is already running", operation: existingBulk });
      }

      const latest = await storage.getLatestCompanyListUpload();
      if (!latest) {
        return res.status(404).json({ error: "No company list uploaded yet" });
      }

      const entries = await storage.getCompanyListEntries(latest.id);
      if (entries.length === 0) {
        return res.status(400).json({ error: "Company list has no entries" });
      }

      const operation = await storage.createOperation({
        type: "bulk_processing",
        status: "pending",
        statusMessage: `Starting bulk processing of ${entries.length} companies from ${latest.fileName}`,
        totalItems: entries.length,
      });

      processBulkFromList(operation.id, latest.id);
      res.json(operation);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/missing-data-status", async (_req, res) => {
    try {
      const client = await pool.connect();
      try {
        const result = await client.query(`
          SELECT
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE g.company_id IS NULL) as missing_geo,
            COUNT(*) FILTER (WHERE sc.company_id IS NULL) as missing_sc,
            COUNT(*) FILTER (WHERE ms.company_id IS NULL) as missing_mgmt,
            COUNT(*) FILTER (WHERE g.company_id IS NULL OR sc.company_id IS NULL OR ms.company_id IS NULL) as total_incomplete
          FROM companies c
          LEFT JOIN (SELECT DISTINCT company_id FROM geo_risks) g ON g.company_id = c.id
          LEFT JOIN supply_chain_risks sc ON sc.company_id = c.id
          LEFT JOIN management_scores ms ON ms.company_id = c.id
        `);
        const row = result.rows[0];
        res.json({
          totalCompanies: parseInt(row.total),
          totalIncomplete: parseInt(row.total_incomplete),
          missingGeo: parseInt(row.missing_geo),
          missingSC: parseInt(row.missing_sc),
          missingMgmt: parseInt(row.missing_mgmt),
        });
      } finally {
        client.release();
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/process-missing", async (_req, res) => {
    try {
      const ops = await storage.getOperations();
      const existingBulk = ops.find(
        (op) => (op.type === "bulk_processing" || op.type === "process_missing") && (op.status === "running" || op.status === "pending")
      );
      if (existingBulk) {
        return res.status(409).json({ error: "A processing operation is already running", operation: existingBulk });
      }

      const operation = await storage.createOperation({
        type: "process_missing",
        status: "pending",
        statusMessage: "Finding companies with missing data...",
        totalItems: 0,
      });

      processMissingCompanies(operation.id);
      res.json(operation);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/debug/management-status", async (_req, res) => {
    try {
      const { pool } = await import("./db");
      const client = await pool.connect();
      try {
        const tableExists = await client.query(
          `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='management_scores'`
        );
        if (tableExists.rows.length === 0) {
          return res.json({ error: "management_scores table does not exist!", tableExists: false });
        }
        const countResult = await client.query(`SELECT COUNT(*) as count FROM management_scores`);
        const companyCount = await client.query(`SELECT COUNT(*) as count FROM companies`);
        const sampleScores = await client.query(
          `SELECT ms.id, ms.company_id, ms.total_score, ms.total_possible, c.company_name, c.isin
           FROM management_scores ms JOIN companies c ON ms.company_id = c.id LIMIT 5`
        );
        const companiesWithoutScores = await client.query(
          `SELECT c.id, c.company_name, c.isin FROM companies c
           LEFT JOIN management_scores ms ON c.id = ms.company_id
           WHERE ms.id IS NULL LIMIT 10`
        );
        res.json({
          tableExists: true,
          totalCompanies: parseInt(companyCount.rows[0].count),
          managementScoresCount: parseInt(countResult.rows[0].count),
          missingCount: parseInt(companyCount.rows[0].count) - parseInt(countResult.rows[0].count),
          sampleScores: sampleScores.rows,
          companiesWithoutScores: companiesWithoutScores.rows,
        });
      } finally {
        client.release();
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message, stack: err.stack });
    }
  });

  app.post("/api/backfill-management", async (_req, res) => {
    try {
      const client = await pool.connect();
      let missing: Array<{id: number, isin: string, name: string}> = [];
      try {
        const result = await client.query(`
          SELECT c.id, c.isin, c.company_name
          FROM companies c
          LEFT JOIN management_scores ms ON ms.company_id = c.id
          WHERE ms.company_id IS NULL
        `);
        missing = result.rows.map((r: any) => ({ id: r.id, isin: r.isin, name: r.company_name }));
      } finally {
        client.release();
      }
      if (missing.length === 0) {
        return res.json({ message: "All companies already have management scores", backfilled: 0 });
      }

      const operation = await storage.createOperation({
        type: "bulk_processing",
        status: "running",
        statusMessage: `Backfilling management scores for ${missing.length} companies`,
        totalItems: missing.length,
      });

      (async () => {
        let processed = 0;
        let success = 0;
        for (const company of missing) {
          const op = await storage.getOperation(operation.id);
          if (op?.status === "paused") {
            while (true) {
              await new Promise(r => setTimeout(r, 2000));
              const check = await storage.getOperation(operation.id);
              if (check?.status !== "paused") break;
            }
          }
          if (op?.status === "cancelled") break;

          try {
            const { fetchManagementPerformance } = await import("./services/externalApis");
            const mgmtResult = await fetchManagementPerformance(company.isin, company.companyName);
            if (mgmtResult) {
              await storage.deleteManagementScore(company.id);
              await storage.createManagementScore({
                companyId: company.id,
                totalScore: mgmtResult.company.totalScore,
                totalPossible: mgmtResult.company.totalPossible,
                summary: mgmtResult.company.summary,
                analysisStatus: mgmtResult.company.analysisStatus,
                scores: mgmtResult.scores,
                documents: mgmtResult.documents,
              });
              success++;
              console.log(`[backfill] Management score saved for ${company.name} (${company.isin})`);
            } else {
              console.log(`[backfill] No management data for ${company.name} (${company.isin})`);
            }
          } catch (err: any) {
            console.log(`[backfill] Error for ${company.name}: ${err.message}`);
          }
          processed++;
          await storage.updateOperation(operation.id, {
            processedItems: processed,
            statusMessage: `Management backfill: ${processed}/${missing.length} (${success} saved)`,
          });
        }
        await storage.updateOperation(operation.id, {
          status: "completed",
          processedItems: processed,
          statusMessage: `Management backfill complete: ${success}/${missing.length} scores saved`,
          completedAt: new Date(),
        });
      })();

      res.json({ message: `Started backfilling management scores for ${missing.length} companies`, operationId: operation.id, missing: missing.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/company-list/:id", async (req, res) => {
    try {
      await storage.deleteCompanyListUpload(parseInt(req.params.id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/export/csv", async (_req, res) => {
    try {
      const client = await pool.connect();
      try {
        const result = await client.query(`
          SELECT
            c.id, c.isin, c.company_name, c.sector, c.country,
            c.total_asset_value, c.supplier_costs, c.ev, c.asset_count,
            COALESCE(g.total_geo_risk_pv, 0) as raw_geo_risk_pv,
            COALESCE(a.total_api_asset_value, 0) as api_asset_total,
            sc.indirect_risk -> 'expected_loss' as sc_expected_loss,
            ms.total_score as mgmt_total_score,
            ms.total_possible as mgmt_total_possible
          FROM companies c
          LEFT JOIN (
            SELECT company_id, SUM(present_value_30yr) as total_geo_risk_pv
            FROM geo_risks GROUP BY company_id
          ) g ON g.company_id = c.id
          LEFT JOIN (
            SELECT company_id, SUM(estimated_value_usd) as total_api_asset_value
            FROM assets GROUP BY company_id
          ) a ON a.company_id = c.id
          LEFT JOIN supply_chain_risks sc ON sc.company_id = c.id
          LEFT JOIN management_scores ms ON ms.company_id = c.id
          ORDER BY c.id
        `);

        const excludeIncomplete = req.query.excludeIncomplete !== "false";
        const excludeFinancials = req.query.excludeFinancials === "true";
        let filteredRows = result.rows;
        if (excludeIncomplete) {
          filteredRows = filteredRows.filter((row: any) => {
            const av = parseFloat(row.total_asset_value) || 0;
            const sc = parseFloat(row.supplier_costs) || 0;
            const ev = parseFloat(row.ev) || 0;
            return av > 0 && sc > 0 && ev > 0;
          });
        }
        if (excludeFinancials) {
          filteredRows = filteredRows.filter((row: any) =>
            (row.sector || "").toLowerCase() !== "financials"
          );
        }

        const SC_PV_FACTOR = 13.57;
        const rows = filteredRows.map((row: any) => {
          const rawGeoRiskPV = parseFloat(row.raw_geo_risk_pv) || 0;
          const apiAssetTotal = parseFloat(row.api_asset_total) || 0;
          const companyAssetVal = parseFloat(row.total_asset_value) || 0;
          const supplierCosts = parseFloat(row.supplier_costs) || 0;
          const ev = parseFloat(row.ev) || 0;
          const geoScaleFactor = (apiAssetTotal > 0 && companyAssetVal > 0 && companyAssetVal < apiAssetTotal)
            ? companyAssetVal / apiAssetTotal : 1;
          const totalGeoRiskPV = rawGeoRiskPV * geoScaleFactor;

          const scEl = row.sc_expected_loss;
          const scHasNewAPI = scEl?.present_value != null;
          const scSf = supplierCosts
            ? supplierCosts / (scHasNewAPI ? 1_000_000_000 : 1_000_000)
            : 1;
          const scRawPV = scHasNewAPI ? scEl.present_value : (scEl?.total_annual_loss || 0) * SC_PV_FACTOR;
          const scIndirectPV = scRawPV * scSf;
          const totalExposurePV = totalGeoRiskPV + scIndirectPV;
          const mgmtScoreVal = row.mgmt_total_score != null
            ? `${row.mgmt_total_score}%`
            : "N/A";
          const mgmtScorePct = row.mgmt_total_score != null ? row.mgmt_total_score / 100 : null;
          const adjustedExposurePV = mgmtScorePct != null
            ? totalExposurePV * (1 - 0.7 * mgmtScorePct)
            : totalExposurePV;
          const valuationPct = ev > 0
            ? ((adjustedExposurePV / ev) * 100).toFixed(2) + "%"
            : "N/A";

          return {
            "Company Name": row.company_name,
            "ISIN": row.isin,
            "Sector": row.sector || "",
            "Country": row.country || "",
            "Total Asset Value": companyAssetVal || 0,
            "Supplier Costs": supplierCosts || 0,
            "EV": ev || 0,
            "Asset Count": row.asset_count || 0,
            "Geographic Risk PV": totalGeoRiskPV.toFixed(2),
            "Supply Chain Risk PV (Indirect)": scIndirectPV.toFixed(2),
            "Total Exposure PV": totalExposurePV.toFixed(2),
            "Management Score": mgmtScoreVal,
            "Adjusted Exposure PV": adjustedExposurePV.toFixed(2),
            "Valuation Exposure %": valuationPct,
          };
        });

        if (rows.length === 0) {
          return res.status(404).json({ error: "No data to export" });
        }

        const headers = Object.keys(rows[0]);
        const csvLines = [
          headers.join(","),
          ...rows.map((row) =>
            headers.map((h) => {
              const val = String((row as any)[h]);
              return val.includes(",") ? `"${val}"` : val;
            }).join(",")
          ),
        ];

        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", "attachment; filename=climate-risk-export.csv");
        res.send(csvLines.join("\n"));
      } finally {
        client.release();
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/fix-units", async (_req, res) => {
    try {
      const client = await pool.connect();
      try {
        const entriesResult = await client.query(
          `SELECT cle.isin, cle.total_value, cle.ev, cle.supplier_costs
           FROM company_list_entries cle
           WHERE cle.isin IS NOT NULL`
        );
        let updated = 0;
        for (const entry of entriesResult.rows) {
          const tv = entry.total_value;
          const ev = entry.ev;
          const sc = entry.supplier_costs;
          if ((tv == null || isNaN(tv)) && (ev == null || isNaN(ev)) && (sc == null || isNaN(sc))) continue;

          const sets: string[] = [];
          const vals: any[] = [];
          let idx = 1;
          if (tv != null && !isNaN(tv)) { sets.push(`total_asset_value = $${idx++}`); vals.push(tv); }
          if (ev != null && !isNaN(ev)) { sets.push(`ev = $${idx++}`); vals.push(ev); }
          if (sc != null && !isNaN(sc)) { sets.push(`supplier_costs = $${idx++}`); vals.push(sc); }

          if (sets.length > 0) {
            vals.push(entry.isin.toUpperCase());
            const result = await client.query(
              `UPDATE companies SET ${sets.join(', ')} WHERE UPPER(isin) = $${idx}`,
              vals
            );
            if (result.rowCount && result.rowCount > 0) updated++;
          }
        }
        res.json({ success: true, companiesUpdated: updated, entriesScanned: entriesResult.rows.length });
      } finally {
        client.release();
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/diagnostics", async (_req, res) => {
    try {
      const { pool } = await import("./db");
      const client = await pool.connect();
      try {
        const tables = ["companies", "assets", "geo_risks", "supply_chain_risks", "management_scores", "operations", "company_list_uploads", "company_list_entries"];
        const counts: Record<string, number> = {};
        for (const t of tables) {
          try {
            const r = await client.query(`SELECT COUNT(*) as cnt FROM ${t}`);
            counts[t] = parseInt(r.rows[0].cnt);
          } catch {
            counts[t] = -1;
          }
        }

        const companyCols = await client.query(
          `SELECT column_name, data_type FROM information_schema.columns WHERE table_name='companies' ORDER BY ordinal_position`
        );

        const opCols = await client.query(
          `SELECT column_name FROM information_schema.columns WHERE table_name='operations'`
        );
        const opColNames = opCols.rows.map((r: any) => r.column_name);
        const opSelect = ["id", "type", "status", "status_message", "total_items", "processed_items"]
          .filter(c => opColNames.includes(c.replace(/_/g, '_')))
          .join(", ");
        const recentOps = await client.query(
          `SELECT ${opSelect || '*'} FROM operations ORDER BY id DESC LIMIT 5`
        );

        const sampleCompanies = await client.query(
          `SELECT id, isin, company_name FROM companies LIMIT 5`
        );

        res.json({
          tableCounts: counts,
          companyColumns: companyCols.rows.map((r: any) => `${r.column_name} (${r.data_type})`),
          recentOperations: recentOps.rows,
          sampleCompanies: sampleCompanies.rows,
        });
      } finally {
        client.release();
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return httpServer;
}
