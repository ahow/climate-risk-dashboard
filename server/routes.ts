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
} from "./services/operationManager";
import { isinToIso3, sectorToIsic } from "./utils/mappings";
import { z } from "zod";
import multer from "multer";
import * as XLSX from "xlsx";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get("/api/companies", async (_req, res) => {
    try {
      const companies = await storage.getCompanies();
      console.log(`[companies] Found ${companies.length} companies in database`);
      const enriched = await Promise.all(
        companies.map(async (company) => {
          try {
            const geoRisks = await storage.getGeoRisksByCompany(company.id);
            const scRisk = await storage.getSupplyChainRisk(company.id);
            const mgmtScore = await storage.getManagementScore(company.id);

            const totalGeoRisk = geoRisks.reduce((sum, r) => sum + (Number(r.expectedAnnualLoss) || 0), 0);
            const totalGeoRiskPV = geoRisks.reduce((sum, r) => sum + (Number(r.presentValue30yr) || 0), 0);

            const mgmtSummary = mgmtScore ? {
              totalScore: mgmtScore.totalScore,
              totalPossible: mgmtScore.totalPossible,
            } : null;

            const scSummary = scRisk ? {
              indirectRisk: scRisk.indirectRisk,
              supplyChainTiers: scRisk.supplyChainTiers,
            } : null;

            return {
              ...company,
              totalGeoRisk,
              totalGeoRiskPV,
              supplyChainRisk: scSummary,
              managementScore: mgmtSummary,
              hasGeoRisks: geoRisks.length > 0,
              hasSupplyChainRisk: !!scRisk,
              hasManagementScore: !!mgmtScore,
            };
          } catch (enrichErr: any) {
            console.error(`[companies] Error enriching company ${company.id} (${company.isin}):`, enrichErr.message);
            return {
              ...company,
              totalGeoRisk: 0,
              totalGeoRiskPV: 0,
              supplyChainRisk: null,
              managementScore: null,
              hasGeoRisks: false,
              hasSupplyChainRisk: false,
              hasManagementScore: false,
            };
          }
        })
      );
      res.json(enriched);
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

      const totalGeoRisk = geoRisks.reduce((sum, r) => sum + (r.expectedAnnualLoss || 0), 0);
      const totalGeoRiskPV = geoRisks.reduce((sum, r) => sum + (r.presentValue30yr || 0), 0);

      const assetsWithRisks = assetsList.map(asset => {
        const risk = geoRisks.find(r => r.assetId === asset.id);
        return { ...asset, geoRisk: risk || null };
      });

      res.json({
        ...company,
        assets: assetsWithRisks,
        totalGeoRisk,
        totalGeoRiskPV,
        geoRisks,
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
      const companies = await storage.getCompanies();
      const missing: Array<{id: number, isin: string, name: string}> = [];
      for (const company of companies) {
        const mgmt = await storage.getManagementScore(company.id);
        if (!mgmt) {
          missing.push({ id: company.id, isin: company.isin, name: company.companyName });
        }
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
      const companies = await storage.getCompanies();
      const rows = await Promise.all(
        companies.map(async (company) => {
          const geoRisks = await storage.getGeoRisksByCompany(company.id);
          const scRisk = await storage.getSupplyChainRisk(company.id);
          const mgmtScore = await storage.getManagementScore(company.id);

          const totalGeoRiskPV = geoRisks.reduce((sum, r) => sum + (r.presentValue30yr || 0), 0);
          const SC_PV_FACTOR = 13.57;
          const scEl = (scRisk?.indirectRisk as any)?.expected_loss;
          const scHasNewAPI = scEl?.present_value != null;
          const scSf = company.supplierCosts
            ? company.supplierCosts / (scHasNewAPI ? 1_000_000_000 : 1_000_000)
            : 1;
          const scRawPV = scHasNewAPI ? scEl.present_value : (scEl?.total_annual_loss || 0) * SC_PV_FACTOR;
          const scIndirectPV = scRawPV * scSf;
          const totalExposurePV = totalGeoRiskPV + scIndirectPV;
          const mgmtScoreVal = mgmtScore
            ? `${mgmtScore.totalScore}%`
            : "N/A";
          const mgmtScorePct = mgmtScore ? mgmtScore.totalScore / 100 : null;
          const adjustedExposurePV = mgmtScorePct != null
            ? totalExposurePV * (1 - 0.7 * mgmtScorePct)
            : totalExposurePV;
          const valuationPct = company.ev && company.ev > 0
            ? ((adjustedExposurePV / company.ev) * 100).toFixed(2) + "%"
            : "N/A";

          return {
            "Company Name": company.companyName,
            "ISIN": company.isin,
            "Sector": company.sector || "",
            "Country": company.country || "",
            "Total Asset Value": company.totalAssetValue || 0,
            "Supplier Costs": company.supplierCosts || 0,
            "EV": company.ev || 0,
            "Asset Count": company.assetCount || 0,
            "Geographic Risk PV": totalGeoRiskPV.toFixed(2),
            "Supply Chain Risk PV (Indirect)": scIndirectPV.toFixed(2),
            "Total Exposure PV": totalExposurePV.toFixed(2),
            "Management Score": mgmtScoreVal,
            "Adjusted Exposure PV": adjustedExposurePV.toFixed(2),
            "Valuation Exposure %": valuationPct,
          };
        })
      );

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
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return httpServer;
}
