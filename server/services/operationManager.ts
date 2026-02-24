import { storage } from "../storage";
import {
  fetchAssetLocations,
  fetchClimateRisk,
  fetchSupplyChainRisk,
  fetchManagementPerformance,
} from "./externalApis";
import { isinToIso3, sectorToIsic } from "../utils/mappings";
import { log } from "../index";

const BATCH_SIZE = 10;
const DELAY_MS = 1500;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function recoverOrphanedOperations() {
  try {
    const ops = await storage.getOperations();
    const running = ops.filter(op => op.status === "running");
    for (const op of running) {
      log(`Recovering orphaned operation #${op.id} (${op.type}) - was running since ${op.startedAt}`);
      if (op.type === "bulk_processing") {
        const latest = await storage.getLatestCompanyListUpload();
        if (latest) {
          log(`Resuming bulk processing operation #${op.id}`);
          processBulkFromList(op.id, latest.id);
        } else {
          await storage.updateOperation(op.id, {
            status: "failed",
            statusMessage: "Orphaned: no upload found to resume",
            completedAt: new Date(),
          });
        }
      } else if (op.type === "full_assessment" && op.companyId) {
        processAllRisks(op.id, op.companyId);
      } else if (op.type === "geographic_risk" && op.companyId) {
        processGeographicRisks(op.id, op.companyId);
      } else {
        await storage.updateOperation(op.id, {
          status: "failed",
          statusMessage: "Orphaned: server restarted during processing",
          completedAt: new Date(),
        });
      }
    }
    if (running.length > 0) {
      log(`Recovered ${running.length} orphaned operation(s)`);
    }
  } catch (err: any) {
    log(`Error recovering orphaned operations: ${err.message}`);
  }
}

export async function processGeographicRisks(operationId: number, companyId: number) {
  try {
    const assets = await storage.getAssetsByCompany(companyId);
    if (assets.length === 0) {
      await storage.updateOperation(operationId, {
        status: "completed",
        statusMessage: "No assets to process",
        completedAt: new Date(),
      });
      return;
    }

    await storage.updateOperation(operationId, {
      status: "running",
      totalItems: assets.length,
      processedItems: 0,
      statusMessage: `Processing 0/${assets.length} assets`,
    });

    await storage.deleteGeoRisksByCompany(companyId);

    for (let i = 0; i < assets.length; i++) {
      const operation = await storage.getOperation(operationId);
      if (!operation || operation.status === "paused" || operation.status === "cancelled") {
        return;
      }

      const asset = assets[i];
      try {
        const assetValue = asset.estimatedValueUsd || 1000000;
        const result = await fetchClimateRisk(asset.latitude, asset.longitude, assetValue);

        await storage.createGeoRisk({
          assetId: asset.id,
          companyId: companyId,
          expectedAnnualLoss: result.expected_annual_loss,
          expectedAnnualLossPct: result.expected_annual_loss_pct,
          presentValue30yr: result.present_value_30yr,
          hurricaneLoss: result.risk_breakdown.hurricane?.annual_loss || 0,
          floodLoss: result.risk_breakdown.flood?.annual_loss || 0,
          heatStressLoss: result.risk_breakdown.heat_stress?.annual_loss || 0,
          droughtLoss: result.risk_breakdown.drought?.annual_loss || 0,
          extremePrecipLoss: result.risk_breakdown.extreme_precipitation?.annual_loss || 0,
          modelVersion: result.model_version || "V6",
        });

        log(`Geo risk calculated for asset ${asset.facilityName} (${i + 1}/${assets.length})`);
      } catch (err: any) {
        log(`Error processing asset ${asset.facilityName} (lat:${asset.latitude}, lon:${asset.longitude}): ${err.message}`);
        await storage.createGeoRisk({
          assetId: asset.id,
          companyId: companyId,
          expectedAnnualLoss: 0,
          expectedAnnualLossPct: 0,
          presentValue30yr: 0,
          hurricaneLoss: 0,
          floodLoss: 0,
          heatStressLoss: 0,
          droughtLoss: 0,
          extremePrecipLoss: 0,
          modelVersion: "FAILED",
        });
      }

      await storage.updateOperation(operationId, {
        processedItems: i + 1,
        statusMessage: `Processed ${i + 1}/${assets.length} assets`,
      });

      if (i < assets.length - 1) {
        await sleep(DELAY_MS);
      }
    }

    await storage.updateOperation(operationId, {
      status: "completed",
      statusMessage: `Completed - ${assets.length} assets processed`,
      completedAt: new Date(),
    });
  } catch (err: any) {
    log(`Geographic risk operation failed: ${err.message}`);
    await storage.updateOperation(operationId, {
      status: "failed",
      statusMessage: `Failed: ${err.message}`,
      completedAt: new Date(),
    });
  }
}

function scaleSupplyChainRisk(result: any, supplierCosts: number | null) {
  const scaleFactor = supplierCosts ? supplierCosts / 1000000 : 1;

  const directLossRaw = result.direct_risk.expected_loss?.total_annual_loss || 0;
  const directLossPctRaw = result.direct_risk.expected_loss?.total_annual_loss_pct || 0;
  const indirectLossRaw = result.indirect_risk.expected_loss?.total_annual_loss || 0;
  const indirectLossPctRaw = result.indirect_risk.expected_loss?.total_annual_loss_pct || 0;

  return {
    directExpectedLoss: directLossRaw * scaleFactor,
    directExpectedLossPct: directLossPctRaw,
    indirectExpectedLoss: indirectLossRaw * scaleFactor,
    indirectExpectedLossPct: indirectLossPctRaw,
  };
}

export async function processSupplyChainRisk(operationId: number, companyId: number) {
  try {
    await storage.updateOperation(operationId, {
      status: "running",
      totalItems: 1,
      processedItems: 0,
      statusMessage: "Fetching supply chain risk data...",
    });

    const company = await storage.getCompany(companyId);
    if (!company) {
      throw new Error("Company not found");
    }

    const countryCode = company.countryIso3 || isinToIso3(company.isin) || "USA";
    const sectorCode = company.isicSectorCode || sectorToIsic(company.sector);

    await storage.deleteSupplyChainRisk(companyId);

    const result = await fetchSupplyChainRisk(countryCode, sectorCode);
    const scaled = scaleSupplyChainRisk(result, company.supplierCosts);

    await storage.createSupplyChainRisk({
      companyId,
      countryCode: result.country,
      countryName: result.country_name,
      sectorCode: result.sector,
      sectorName: result.sector_name,
      directRisk: result.direct_risk,
      indirectRisk: result.indirect_risk,
      totalRisk: result.total_risk,
      topSuppliers: result.top_suppliers,
      directExpectedLoss: scaled.directExpectedLoss,
      directExpectedLossPct: scaled.directExpectedLossPct,
      indirectExpectedLoss: scaled.indirectExpectedLoss,
      indirectExpectedLossPct: scaled.indirectExpectedLossPct,
    });

    await storage.updateOperation(operationId, {
      status: "completed",
      processedItems: 1,
      statusMessage: "Supply chain risk assessment complete",
      completedAt: new Date(),
    });
  } catch (err: any) {
    log(`Supply chain risk operation failed: ${err.message}`);
    await storage.updateOperation(operationId, {
      status: "failed",
      statusMessage: `Failed: ${err.message}`,
      completedAt: new Date(),
    });
  }
}

export async function processManagementScore(operationId: number, companyId: number) {
  try {
    await storage.updateOperation(operationId, {
      status: "running",
      totalItems: 1,
      processedItems: 0,
      statusMessage: "Fetching management performance data...",
    });

    const company = await storage.getCompany(companyId);
    if (!company) {
      throw new Error("Company not found");
    }

    await storage.deleteManagementScore(companyId);

    const result = await fetchManagementPerformance(company.isin);

    if (!result) {
      await storage.updateOperation(operationId, {
        status: "completed",
        processedItems: 1,
        statusMessage: "No management data available for this company",
        completedAt: new Date(),
      });
      return;
    }

    await storage.createManagementScore({
      companyId,
      totalScore: result.company.totalScore,
      totalPossible: result.company.totalPossible,
      summary: result.company.summary,
      analysisStatus: result.company.analysisStatus,
      scores: result.scores,
      documents: result.documents,
    });

    await storage.updateOperation(operationId, {
      status: "completed",
      processedItems: 1,
      statusMessage: "Management performance assessment complete",
      completedAt: new Date(),
    });
  } catch (err: any) {
    log(`Management score operation failed: ${err.message}`);
    await storage.updateOperation(operationId, {
      status: "failed",
      statusMessage: `Failed: ${err.message}`,
      completedAt: new Date(),
    });
  }
}

export async function processAllRisks(operationId: number, companyId: number) {
  try {
    const company = await storage.getCompany(companyId);
    if (!company) throw new Error("Company not found");

    const assets = await storage.getAssetsByCompany(companyId);
    const totalItems = assets.length + 2;

    await storage.updateOperation(operationId, {
      status: "running",
      totalItems,
      processedItems: 0,
      statusMessage: "Starting full risk assessment...",
    });

    await storage.deleteGeoRisksByCompany(companyId);
    for (let i = 0; i < assets.length; i++) {
      const operation = await storage.getOperation(operationId);
      if (!operation || operation.status === "paused" || operation.status === "cancelled") return;

      const asset = assets[i];
      try {
        const assetValue = asset.estimatedValueUsd || 1000000;
        const result = await fetchClimateRisk(asset.latitude, asset.longitude, assetValue);
        await storage.createGeoRisk({
          assetId: asset.id,
          companyId,
          expectedAnnualLoss: result.expected_annual_loss,
          expectedAnnualLossPct: result.expected_annual_loss_pct,
          presentValue30yr: result.present_value_30yr,
          hurricaneLoss: result.risk_breakdown.hurricane?.annual_loss || 0,
          floodLoss: result.risk_breakdown.flood?.annual_loss || 0,
          heatStressLoss: result.risk_breakdown.heat_stress?.annual_loss || 0,
          droughtLoss: result.risk_breakdown.drought?.annual_loss || 0,
          extremePrecipLoss: result.risk_breakdown.extreme_precipitation?.annual_loss || 0,
          modelVersion: result.model_version || "V6",
        });
      } catch (err: any) {
        log(`Error processing asset ${asset.facilityName} (lat:${asset.latitude}, lon:${asset.longitude}): ${err.message}`);
        await storage.createGeoRisk({
          assetId: asset.id,
          companyId,
          expectedAnnualLoss: 0, expectedAnnualLossPct: 0, presentValue30yr: 0,
          hurricaneLoss: 0, floodLoss: 0, heatStressLoss: 0, droughtLoss: 0, extremePrecipLoss: 0,
          modelVersion: "FAILED",
        });
      }

      await storage.updateOperation(operationId, {
        processedItems: i + 1,
        statusMessage: `Geographic risk: ${i + 1}/${assets.length} assets`,
      });

      if (i < assets.length - 1) await sleep(DELAY_MS);
    }

    await storage.updateOperation(operationId, {
      processedItems: assets.length,
      statusMessage: "Calculating supply chain risk...",
    });

    try {
      const countryCode = company.countryIso3 || isinToIso3(company.isin) || "USA";
      const sectorCode = company.isicSectorCode || sectorToIsic(company.sector);
      await storage.deleteSupplyChainRisk(companyId);
      const scResult = await fetchSupplyChainRisk(countryCode, sectorCode);
      const scaled = scaleSupplyChainRisk(scResult, company.supplierCosts);
      await storage.createSupplyChainRisk({
        companyId,
        countryCode: scResult.country,
        countryName: scResult.country_name,
        sectorCode: scResult.sector,
        sectorName: scResult.sector_name,
        directRisk: scResult.direct_risk,
        indirectRisk: scResult.indirect_risk,
        totalRisk: scResult.total_risk,
        topSuppliers: scResult.top_suppliers,
        directExpectedLoss: scaled.directExpectedLoss,
        directExpectedLossPct: scaled.directExpectedLossPct,
        indirectExpectedLoss: scaled.indirectExpectedLoss,
        indirectExpectedLossPct: scaled.indirectExpectedLossPct,
      });
    } catch (err: any) {
      log(`Supply chain risk error: ${err.message}`);
    }

    await storage.updateOperation(operationId, {
      processedItems: assets.length + 1,
      statusMessage: "Fetching management performance...",
    });

    try {
      await storage.deleteManagementScore(companyId);
      const mgmtResult = await fetchManagementPerformance(company.isin);
      if (mgmtResult) {
        await storage.createManagementScore({
          companyId,
          totalScore: mgmtResult.company.totalScore,
          totalPossible: mgmtResult.company.totalPossible,
          summary: mgmtResult.company.summary,
          analysisStatus: mgmtResult.company.analysisStatus,
          scores: mgmtResult.scores,
          documents: mgmtResult.documents,
        });
      }
    } catch (err: any) {
      log(`Management score error: ${err.message}`);
    }

    await storage.updateOperation(operationId, {
      status: "completed",
      processedItems: totalItems,
      statusMessage: "Full risk assessment complete",
      completedAt: new Date(),
    });
  } catch (err: any) {
    log(`Full risk assessment failed: ${err.message}`);
    await storage.updateOperation(operationId, {
      status: "failed",
      statusMessage: `Failed: ${err.message}`,
      completedAt: new Date(),
    });
  }
}

export async function processBulkFromList(operationId: number, uploadId: number) {
  try {
    const entries = await storage.getCompanyListEntries(uploadId);
    if (entries.length === 0) {
      await storage.updateOperation(operationId, {
        status: "completed",
        statusMessage: "No companies in uploaded list",
        completedAt: new Date(),
      });
      return;
    }

    const totalSteps = entries.length;
    await storage.updateOperation(operationId, {
      status: "running",
      totalItems: totalSteps,
      processedItems: 0,
      statusMessage: `Processing 0/${totalSteps} companies...`,
    });

    let processed = 0;
    let added = 0;
    let skipped = 0;
    let failed = 0;

    for (const entry of entries) {
      const operation = await storage.getOperation(operationId);
      if (!operation || operation.status === "paused" || operation.status === "cancelled") return;

      const isin = entry.isin.toUpperCase();
      try {
        let company = await storage.getCompanyByIsin(isin);

        if (company) {
          const existingGeoRisks = await storage.getGeoRisksByCompany(company.id);
          const existingSCRisk = await storage.getSupplyChainRisk(company.id);
          if (existingGeoRisks.length > 0 && existingSCRisk) {
            const updates: any = {};
            if (entry.supplierCosts != null && !isNaN(entry.supplierCosts)) updates.supplierCosts = entry.supplierCosts;
            if (entry.ev != null && !isNaN(entry.ev)) updates.ev = entry.ev;
            if (Object.keys(updates).length > 0) {
              await storage.updateCompany(company.id, updates);
            }
            processed++;
            await storage.updateOperation(operationId, {
              processedItems: processed,
              statusMessage: `${processed}/${totalSteps}: ${company.companyName} already processed, skipping`,
            });
            await sleep(100);
            continue;
          }
        }

        if (!company) {
          const assetData = await fetchAssetLocations(isin);
          if (assetData.assetCount === 0 || assetData.assets.length === 0) {
            log(`Bulk: No asset data for ${isin} (${entry.companyName}), skipping`);
            skipped++;
            processed++;
            await storage.updateOperation(operationId, {
              processedItems: processed,
              statusMessage: `${processed}/${totalSteps}: Skipped ${entry.companyName} (no assets)`,
            });
            await sleep(500);
            continue;
          }

          const countryIso3 = isinToIso3(isin);
          const isicCode = sectorToIsic(assetData.sector);

          company = await storage.createCompany({
            isin,
            companyName: assetData.companyName || entry.companyName,
            sector: assetData.sector || entry.level2Sector,
            country: assetData.assets[0]?.country || entry.geography || null,
            totalAssetValue: entry.totalValue || assetData.totalEstimatedValue,
            assetCount: assetData.assetCount,
            isicSectorCode: isicCode,
            countryIso3,
            supplierCosts: entry.supplierCosts,
            ev: entry.ev,
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
          added++;
          log(`Bulk: Added ${company.companyName} (${isin}) with ${validAssets.length} assets`);
        } else {
          const updates: any = {};
          if (entry.supplierCosts != null && !isNaN(entry.supplierCosts)) updates.supplierCosts = entry.supplierCosts;
          if (entry.ev != null && !isNaN(entry.ev)) updates.ev = entry.ev;
          if (Object.keys(updates).length > 0) {
            company = await storage.updateCompany(company.id, updates);
            log(`Bulk: Updated ${company.companyName} (${isin}) with EV=${updates.ev}, supplierCosts=${updates.supplierCosts}`);
          } else {
            log(`Bulk: ${company.companyName} (${isin}) already exists, running risk calculations`);
          }
        }

        await storage.updateOperation(operationId, {
          statusMessage: `${processed + 1}/${totalSteps}: Calculating risks for ${company.companyName}...`,
        });

        const companyAssets = await storage.getAssetsByCompany(company.id);
        await storage.deleteGeoRisksByCompany(company.id);
        for (let i = 0; i < companyAssets.length; i++) {
          const op = await storage.getOperation(operationId);
          if (!op || op.status === "paused" || op.status === "cancelled") return;

          const asset = companyAssets[i];
          try {
            const assetValue = asset.estimatedValueUsd || 1000000;
            const result = await fetchClimateRisk(asset.latitude, asset.longitude, assetValue);
            await storage.createGeoRisk({
              assetId: asset.id,
              companyId: company.id,
              expectedAnnualLoss: result.expected_annual_loss,
              expectedAnnualLossPct: result.expected_annual_loss_pct,
              presentValue30yr: result.present_value_30yr,
              hurricaneLoss: result.risk_breakdown.hurricane?.annual_loss || 0,
              floodLoss: result.risk_breakdown.flood?.annual_loss || 0,
              heatStressLoss: result.risk_breakdown.heat_stress?.annual_loss || 0,
              droughtLoss: result.risk_breakdown.drought?.annual_loss || 0,
              extremePrecipLoss: result.risk_breakdown.extreme_precipitation?.annual_loss || 0,
              modelVersion: result.model_version || "V6",
            });
          } catch (err: any) {
            log(`Bulk: Geo risk error for asset ${asset.facilityName} (lat:${asset.latitude}, lon:${asset.longitude}): ${err.message}`);
            await storage.createGeoRisk({
              assetId: asset.id,
              companyId: company.id,
              expectedAnnualLoss: 0, expectedAnnualLossPct: 0, presentValue30yr: 0,
              hurricaneLoss: 0, floodLoss: 0, heatStressLoss: 0, droughtLoss: 0, extremePrecipLoss: 0,
              modelVersion: "FAILED",
            });
          }
          if (i < companyAssets.length - 1) await sleep(DELAY_MS);
        }

        try {
          const countryCode = company.countryIso3 || isinToIso3(company.isin) || "USA";
          const sectorCode = company.isicSectorCode || sectorToIsic(company.sector);
          await storage.deleteSupplyChainRisk(company.id);
          const scResult = await fetchSupplyChainRisk(countryCode, sectorCode);
          const supplierCostsForCompany = company.supplierCosts || entry.supplierCosts;
          const scaled = scaleSupplyChainRisk(scResult, supplierCostsForCompany);
          await storage.createSupplyChainRisk({
            companyId: company.id,
            countryCode: scResult.country,
            countryName: scResult.country_name,
            sectorCode: scResult.sector,
            sectorName: scResult.sector_name,
            directRisk: scResult.direct_risk,
            indirectRisk: scResult.indirect_risk,
            totalRisk: scResult.total_risk,
            topSuppliers: scResult.top_suppliers,
            directExpectedLoss: scaled.directExpectedLoss,
            directExpectedLossPct: scaled.directExpectedLossPct,
            indirectExpectedLoss: scaled.indirectExpectedLoss,
            indirectExpectedLossPct: scaled.indirectExpectedLossPct,
          });
        } catch (err: any) {
          log(`Bulk: Supply chain error for ${company.companyName}: ${err.message}`);
        }

        try {
          await storage.deleteManagementScore(company.id);
          const mgmtResult = await fetchManagementPerformance(company.isin);
          if (mgmtResult) {
            await storage.createManagementScore({
              companyId: company.id,
              totalScore: mgmtResult.company.totalScore,
              totalPossible: mgmtResult.company.totalPossible,
              summary: mgmtResult.company.summary,
              analysisStatus: mgmtResult.company.analysisStatus,
              scores: mgmtResult.scores,
              documents: mgmtResult.documents,
            });
          }
        } catch (err: any) {
          log(`Bulk: Management score error for ${company.companyName}: ${err.message}`);
        }

        processed++;
        await storage.updateOperation(operationId, {
          processedItems: processed,
          statusMessage: `${processed}/${totalSteps}: Completed ${company.companyName}`,
        });

      } catch (err: any) {
        failed++;
        processed++;
        log(`Bulk: Failed to process ${entry.companyName} (${isin}): ${err.message}`);
        await storage.updateOperation(operationId, {
          processedItems: processed,
          statusMessage: `${processed}/${totalSteps}: Failed ${entry.companyName} - ${err.message}`,
        });
      }

      await sleep(500);
    }

    await storage.updateOperation(operationId, {
      status: "completed",
      processedItems: totalSteps,
      statusMessage: `Bulk processing complete: ${added} added, ${totalSteps - added - skipped - failed} updated, ${skipped} skipped, ${failed} failed`,
      completedAt: new Date(),
    });
  } catch (err: any) {
    log(`Bulk processing failed: ${err.message}`);
    await storage.updateOperation(operationId, {
      status: "failed",
      statusMessage: `Failed: ${err.message}`,
      completedAt: new Date(),
    });
  }
}
