import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { fetchAssetLocations } from "./services/externalApis";
import {
  processGeographicRisks,
  processSupplyChainRisk,
  processManagementScore,
  processAllRisks,
} from "./services/operationManager";
import { isinToIso3, sectorToIsic } from "./utils/mappings";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get("/api/companies", async (_req, res) => {
    try {
      const companies = await storage.getCompanies();
      const enriched = await Promise.all(
        companies.map(async (company) => {
          const geoRisks = await storage.getGeoRisksByCompany(company.id);
          const scRisk = await storage.getSupplyChainRisk(company.id);
          const mgmtScore = await storage.getManagementScore(company.id);

          const totalGeoRisk = geoRisks.reduce((sum, r) => sum + (r.expectedAnnualLoss || 0), 0);
          const totalGeoRiskPV = geoRisks.reduce((sum, r) => sum + (r.presentValue30yr || 0), 0);

          return {
            ...company,
            totalGeoRisk,
            totalGeoRiskPV,
            supplyChainRisk: scRisk,
            managementScore: mgmtScore,
            hasGeoRisks: geoRisks.length > 0,
            hasSupplyChainRisk: !!scRisk,
            hasManagementScore: !!mgmtScore,
          };
        })
      );
      res.json(enriched);
    } catch (err: any) {
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

      if (assetData.asset_count === 0) {
        return res.status(404).json({ error: "No asset data found for this ISIN" });
      }

      const countryIso3 = isinToIso3(isin);
      const detectedSector = assetData.sector;
      const isicCode = isicSectorCode || sectorToIsic(detectedSector);

      const company = await storage.createCompany({
        isin: isin.toUpperCase(),
        companyName: assetData.company_name,
        sector: detectedSector,
        country: assetData.assets[0]?.country || null,
        totalAssetValue: assetData.total_estimated_value,
        assetCount: assetData.asset_count,
        isicSectorCode: isicCode,
        countryIso3: countryIso3,
      });

      for (const asset of assetData.assets) {
        await storage.createAsset({
          companyId: company.id,
          facilityName: asset.facility_name,
          assetType: asset.asset_type,
          address: asset.address,
          city: asset.city,
          country: asset.country,
          latitude: asset.latitude,
          longitude: asset.longitude,
          coordinateCertainty: asset.coordinate_certainty,
          estimatedValueUsd: asset.estimated_value_usd,
          valuationConfidence: asset.valuation_confidence,
          ownershipShare: asset.ownership_share,
          dataSource: asset.data_source,
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
      }

      res.json(await storage.getOperation(id));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/operations/:id", async (req, res) => {
    try {
      await storage.updateOperation(parseInt(req.params.id), { status: "cancelled" });
      await storage.deleteOperation(parseInt(req.params.id));
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

          const totalGeoRisk = geoRisks.reduce((sum, r) => sum + (r.expectedAnnualLoss || 0), 0);
          const totalScRisk = (scRisk?.directExpectedLoss || 0) + (scRisk?.indirectExpectedLoss || 0);
          const mgmtScoreVal = mgmtScore
            ? `${mgmtScore.totalScore}/${mgmtScore.totalPossible}`
            : "N/A";
          const totalRisk = totalGeoRisk + totalScRisk;

          return {
            "Company Name": company.companyName,
            "ISIN": company.isin,
            "Sector": company.sector || "",
            "Country": company.country || "",
            "Total Asset Value": company.totalAssetValue || 0,
            "Asset Count": company.assetCount || 0,
            "Geographic Risk (EAL)": totalGeoRisk.toFixed(2),
            "Supply Chain Risk (Direct EAL)": (scRisk?.directExpectedLoss || 0).toFixed(2),
            "Supply Chain Risk (Indirect EAL)": (scRisk?.indirectExpectedLoss || 0).toFixed(2),
            "Management Score": mgmtScoreVal,
            "Total Risk": totalRisk.toFixed(2),
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
