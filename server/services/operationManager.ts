import { storage } from "../storage";
import { pool } from "../db";
import {
  fetchAssetLocations,
  fetchClimateRisk,
  fetchSupplyChainRisk,
  fetchManagementPerformance,
} from "./externalApis";
import { isinToIso3, sectorToIsic, resolveSupplyChainCountry } from "../utils/mappings";
import { log } from "../index";

const BATCH_SIZE = 10;
const DELAY_MS = 500;
const GEO_CONCURRENCY = 3;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function processInBatches<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
    if (i + concurrency < items.length) await sleep(200);
  }
  return results;
}

export async function backfillCompanyFinancials() {
  try {
    const latest = await storage.getLatestCompanyListUpload();
    if (!latest) return;
    const entries = await storage.getCompanyListEntries(latest.id);
    let updated = 0;
    for (const entry of entries) {
      const company = await storage.getCompanyByIsin(entry.isin.toUpperCase());
      if (!company) continue;
      const updates: any = {};
      if (company.ev == null && entry.ev != null && !isNaN(entry.ev)) updates.ev = entry.ev;
      if (company.supplierCosts == null && entry.supplierCosts != null && !isNaN(entry.supplierCosts)) updates.supplierCosts = entry.supplierCosts;
      if (Object.keys(updates).length > 0) {
        await storage.updateCompany(company.id, updates);
        updated++;
      }
    }
    if (updated > 0) {
      log(`Backfilled EV/supplierCosts for ${updated} companies from uploaded list`);
    }
  } catch (err: any) {
    log(`Error backfilling company financials: ${err.message}`);
  }
}

export async function recoverOrphanedOperations() {
  try {
    await backfillCompanyFinancials();

    const ops = await storage.getOperations();
    const running = ops.filter(op => op.status === "running" || op.status === "pending");
    for (const op of running) {
      log(`Found orphaned operation #${op.id} (${op.type}) - was running since ${op.startedAt}, progress: ${op.processedItems}/${op.totalItems}`);

      if (op.type === "bulk_processing") {
        await storage.updateOperation(op.id, {
          status: "failed",
          statusMessage: `Interrupted by server restart at ${op.processedItems}/${op.totalItems} — use "Process All" to resume`,
          completedAt: new Date(),
        });
        log(`Marked orphaned bulk operation #${op.id} as failed (was at ${op.processedItems}/${op.totalItems}). Manual restart required to avoid crash loops.`);
      } else {
        await storage.updateOperation(op.id, {
          status: "failed",
          statusMessage: `Interrupted by server restart at ${op.processedItems}/${op.totalItems}`,
          completedAt: new Date(),
        });
      }
    }
    if (running.length > 0) {
      log(`Processed ${running.length} orphaned operation(s)`);
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
    let processed = 0;

    const failedAssetIds = new Set<number>();

    await processInBatches(assets, GEO_CONCURRENCY, async (asset) => {
      const operation = await storage.getOperation(operationId);
      if (!operation || operation.status === "paused" || operation.status === "cancelled") return;

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
      } catch (err: any) {
        log(`Error processing asset ${asset.facilityName} (lat:${asset.latitude}, lon:${asset.longitude}): ${err.message}`);
        failedAssetIds.add(asset.id);
        await storage.createGeoRisk({
          assetId: asset.id,
          companyId: companyId,
          expectedAnnualLoss: 0, expectedAnnualLossPct: 0, presentValue30yr: 0,
          hurricaneLoss: 0, floodLoss: 0, heatStressLoss: 0, droughtLoss: 0, extremePrecipLoss: 0,
          modelVersion: "FAILED",
        });
      }

      processed++;
      await storage.updateOperation(operationId, {
        processedItems: processed,
        statusMessage: `Processed ${processed}/${assets.length} assets`,
      });
    });

    if (failedAssetIds.size > 0) {
      const failedAssets = assets.filter(a => failedAssetIds.has(a.id));
      log(`Retrying ${failedAssets.length} failed assets after 5s cooldown...`);
      await sleep(5000);

      for (const asset of failedAssets) {
        const operation = await storage.getOperation(operationId);
        if (!operation || operation.status === "paused" || operation.status === "cancelled") break;

        try {
          const assetValue = asset.estimatedValueUsd || 1000000;
          const result = await fetchClimateRisk(asset.latitude, asset.longitude, assetValue);

          await storage.deleteGeoRisk(asset.id);
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
          log(`Retry succeeded for ${asset.facilityName}`);
        } catch (err: any) {
          log(`Retry failed for ${asset.facilityName}: ${err.message}`);
        }
        await sleep(1000);
      }
    }

    const finalGeoRisks = await storage.getGeoRisksByCompany(companyId);
    const stillFailed = finalGeoRisks.filter((r: any) => r.modelVersion === "FAILED").length;

    await storage.updateOperation(operationId, {
      status: "completed",
      statusMessage: `Completed - ${assets.length} assets processed${stillFailed > 0 ? ` (${stillFailed} failed)` : ''}`,
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
  const scaleFactor = supplierCosts ? supplierCosts / 1_000_000_000 : 1;

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

    const countryCode = resolveSupplyChainCountry(company.isin, company.countryIso3, company.country);
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
      supplyChainTiers: result.supply_chain_tiers,
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

    const result = await fetchManagementPerformance(company.isin, company.companyName);

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
    let geoProcessed = 0;

    const geoRiskTask = (async () => {
      await processInBatches(assets, GEO_CONCURRENCY, async (asset) => {
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
        geoProcessed++;
        await storage.updateOperation(operationId, {
          processedItems: geoProcessed,
          statusMessage: `Geographic risk: ${geoProcessed}/${assets.length} assets`,
        });
      });
    })();

    const supplyChainTask = (async () => {
      try {
        const countryCode = resolveSupplyChainCountry(company.isin, company.countryIso3, company.country);
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
          supplyChainTiers: scResult.supply_chain_tiers,
          directExpectedLoss: scaled.directExpectedLoss,
          directExpectedLossPct: scaled.directExpectedLossPct,
          indirectExpectedLoss: scaled.indirectExpectedLoss,
          indirectExpectedLossPct: scaled.indirectExpectedLossPct,
        });
      } catch (err: any) {
        log(`Supply chain risk error: ${err.message}`);
      }
    })();

    const managementTask = (async () => {
      try {
        await storage.deleteManagementScore(companyId);
        const mgmtResult = await fetchManagementPerformance(company.isin, company.companyName);
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
    })();

    await Promise.all([geoRiskTask, supplyChainTask, managementTask]);

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
      const entryTotalValue = (entry.totalValue != null && !isNaN(entry.totalValue)) ? entry.totalValue : null;
      const entryEv = (entry.ev != null && !isNaN(entry.ev)) ? entry.ev : null;
      const entrySupplierCosts = (entry.supplierCosts != null && !isNaN(entry.supplierCosts)) ? entry.supplierCosts : null;

      try {
        let company = await storage.getCompanyByIsin(isin);

        if (company) {
          const existingGeoRisks = await storage.getGeoRisksByCompany(company.id);
          const existingSCRisk = await storage.getSupplyChainRisk(company.id);
          const existingMgmt = await storage.getManagementScore(company.id);
          const companyAssetCount = (await storage.getAssetsByCompany(company.id)).length;
          const hasSuccessfulGeoRisks = existingGeoRisks.length > 0 &&
            existingGeoRisks.length >= companyAssetCount &&
            existingGeoRisks.some((r: any) => r.modelVersion !== "FAILED");

          if (hasSuccessfulGeoRisks && existingSCRisk && existingMgmt) {
            const updates: any = {};
            if (entrySupplierCosts != null) updates.supplierCosts = entrySupplierCosts;
            if (entryEv != null) updates.ev = entryEv;
            if (entryTotalValue != null) updates.totalAssetValue = entryTotalValue;
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

          if (hasSuccessfulGeoRisks && !existingSCRisk) {
            const updates: any = {};
            if (entrySupplierCosts != null) updates.supplierCosts = entrySupplierCosts;
            if (entryEv != null) updates.ev = entryEv;
            if (entryTotalValue != null) updates.totalAssetValue = entryTotalValue;
            if (Object.keys(updates).length > 0) {
              await storage.updateCompany(company.id, updates);
            }
            const fillTasks: Promise<void>[] = [];
            fillTasks.push((async () => {
              try {
                const countryCode = resolveSupplyChainCountry(company.isin, company.countryIso3, company.country);
                const sectorCode = company.isicSectorCode || sectorToIsic(company.sector);
                const scResult = await fetchSupplyChainRisk(countryCode, sectorCode);
                const supplierCostsForCompany = company.supplierCosts || entrySupplierCosts;
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
                  supplyChainTiers: scResult.supply_chain_tiers,
                  directExpectedLoss: scaled.directExpectedLoss,
                  directExpectedLossPct: scaled.directExpectedLossPct,
                  indirectExpectedLoss: scaled.indirectExpectedLoss,
                  indirectExpectedLossPct: scaled.indirectExpectedLossPct,
                });
                log(`Bulk: Backfilled supply chain risk for ${company.companyName}`);
              } catch (err: any) {
                log(`Bulk: Supply chain backfill error for ${company.companyName}: ${err.message}`);
              }
            })());
            if (!existingMgmt) {
              fillTasks.push((async () => {
                try {
                  const mgmtResult = await fetchManagementPerformance(company.isin, company.companyName);
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
                    log(`Bulk: Backfilled management score for ${company.companyName}`);
                  }
                } catch (err: any) {
                  log(`Bulk: Management backfill error for ${company.companyName}: ${err.message}`);
                }
              })());
            }
            await Promise.all(fillTasks);
            processed++;
            await storage.updateOperation(operationId, {
              processedItems: processed,
              statusMessage: `${processed}/${totalSteps}: ${company.companyName} - backfilled missing risk data`,
            });
            await sleep(100);
            continue;
          }

          if (hasSuccessfulGeoRisks && existingSCRisk && !existingMgmt) {
            const updates: any = {};
            if (entrySupplierCosts != null) updates.supplierCosts = entrySupplierCosts;
            if (entryEv != null) updates.ev = entryEv;
            if (entryTotalValue != null) updates.totalAssetValue = entryTotalValue;
            if (Object.keys(updates).length > 0) {
              await storage.updateCompany(company.id, updates);
            }
            try {
              await storage.deleteManagementScore(company.id);
              const mgmtResult = await fetchManagementPerformance(company.isin, company.companyName);
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
                log(`Bulk: Backfilled management score for ${company.companyName}`);
              }
            } catch (err: any) {
              log(`Bulk: Management score backfill error for ${company.companyName}: ${err.message}`);
            }
            processed++;
            await storage.updateOperation(operationId, {
              processedItems: processed,
              statusMessage: `${processed}/${totalSteps}: ${company.companyName} - management score updated`,
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
            totalAssetValue: entryTotalValue || assetData.totalEstimatedValue,
            assetCount: assetData.assetCount,
            isicSectorCode: isicCode,
            countryIso3,
            supplierCosts: entrySupplierCosts,
            ev: entryEv,
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
          if (entrySupplierCosts != null) updates.supplierCosts = entrySupplierCosts;
          if (entryEv != null) updates.ev = entryEv;
          if (entryTotalValue != null) updates.totalAssetValue = entryTotalValue;
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

        const geoRiskTask = (async () => {
          await storage.deleteGeoRisksByCompany(company.id);
          const bulkFailedIds = new Set<number>();
          await processInBatches(companyAssets, GEO_CONCURRENCY, async (asset) => {
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
              bulkFailedIds.add(asset.id);
              await storage.createGeoRisk({
                assetId: asset.id,
                companyId: company.id,
                expectedAnnualLoss: 0, expectedAnnualLossPct: 0, presentValue30yr: 0,
                hurricaneLoss: 0, floodLoss: 0, heatStressLoss: 0, droughtLoss: 0, extremePrecipLoss: 0,
                modelVersion: "FAILED",
              });
            }
          });
          if (bulkFailedIds.size > 0) {
            const failedAssets = companyAssets.filter(a => bulkFailedIds.has(a.id));
            log(`Bulk: Retrying ${failedAssets.length} failed assets for ${company.companyName}...`);
            await sleep(3000);
            for (const asset of failedAssets) {
              try {
                const assetValue = asset.estimatedValueUsd || 1000000;
                const result = await fetchClimateRisk(asset.latitude, asset.longitude, assetValue);
                await storage.deleteGeoRisk(asset.id);
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
                log(`Bulk: Retry succeeded for ${asset.facilityName}`);
              } catch (err: any) {
                log(`Bulk: Retry failed for ${asset.facilityName}: ${err.message}`);
              }
              await sleep(1000);
            }
          }
        })();

        const supplyChainTask = (async () => {
          try {
            const countryCode = resolveSupplyChainCountry(company.isin, company.countryIso3, company.country);
            const sectorCode = company.isicSectorCode || sectorToIsic(company.sector);
            await storage.deleteSupplyChainRisk(company.id);
            const scResult = await fetchSupplyChainRisk(countryCode, sectorCode);
            const supplierCostsForCompany = company.supplierCosts || entrySupplierCosts;
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
              supplyChainTiers: scResult.supply_chain_tiers,
              directExpectedLoss: scaled.directExpectedLoss,
              directExpectedLossPct: scaled.directExpectedLossPct,
              indirectExpectedLoss: scaled.indirectExpectedLoss,
              indirectExpectedLossPct: scaled.indirectExpectedLossPct,
            });
          } catch (err: any) {
            log(`Bulk: Supply chain error for ${company.companyName}: ${err.message}`);
          }
        })();

        const managementTask = (async () => {
          try {
            await storage.deleteManagementScore(company.id);
            const mgmtResult = await fetchManagementPerformance(company.isin, company.companyName);
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
        })();

        await Promise.all([geoRiskTask, supplyChainTask, managementTask]);

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

      await sleep(200);
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

export async function processMissingCompanies(operationId: number) {
  try {
    const client = await pool.connect();
    let missingCompanies: Array<{
      id: number; isin: string; company_name: string; sector: string | null;
      country: string | null; country_iso3: string | null; isic_sector_code: string | null;
      supplier_costs: number | null; total_asset_value: number | null;
      has_geo: boolean; has_sc: boolean; has_mgmt: boolean;
      asset_count_db: string;
    }>;
    try {
      const result = await client.query(`
        SELECT
          c.id, c.isin, c.company_name, c.sector, c.country,
          c.country_iso3, c.isic_sector_code, c.supplier_costs, c.total_asset_value,
          (SELECT COUNT(*) FROM assets WHERE company_id = c.id) as asset_count_db,
          EXISTS(SELECT 1 FROM geo_risks WHERE company_id = c.id) as has_geo,
          EXISTS(SELECT 1 FROM supply_chain_risks WHERE company_id = c.id) as has_sc,
          EXISTS(SELECT 1 FROM management_scores WHERE company_id = c.id) as has_mgmt
        FROM companies c
        WHERE NOT (
          EXISTS(SELECT 1 FROM geo_risks WHERE company_id = c.id)
          AND EXISTS(SELECT 1 FROM supply_chain_risks WHERE company_id = c.id)
          AND EXISTS(SELECT 1 FROM management_scores WHERE company_id = c.id)
        )
        ORDER BY c.id
      `);
      missingCompanies = result.rows;
    } finally {
      client.release();
    }

    if (missingCompanies.length === 0) {
      await storage.updateOperation(operationId, {
        status: "completed",
        statusMessage: "All companies already have complete data",
        totalItems: 0,
        processedItems: 0,
        completedAt: new Date(),
      });
      return;
    }

    const totalSteps = missingCompanies.length;
    await storage.updateOperation(operationId, {
      status: "running",
      totalItems: totalSteps,
      processedItems: 0,
      statusMessage: `Processing 0/${totalSteps} companies with missing data...`,
    });

    let processed = 0;
    let failed = 0;

    for (const row of missingCompanies) {
      const operation = await storage.getOperation(operationId);
      if (!operation || operation.status === "paused" || operation.status === "cancelled") return;

      try {
        const company = await storage.getCompany(row.id);
        if (!company) {
          processed++;
          continue;
        }

        const missingParts: string[] = [];
        if (!row.has_geo) missingParts.push("geo");
        if (!row.has_sc) missingParts.push("SC");
        if (!row.has_mgmt) missingParts.push("mgmt");

        await storage.updateOperation(operationId, {
          statusMessage: `${processed + 1}/${totalSteps}: ${company.companyName} (missing: ${missingParts.join(", ")})`,
        });

        const tasks: Promise<void>[] = [];

        if (!row.has_geo && parseInt(row.asset_count_db) > 0) {
          tasks.push((async () => {
            try {
              const companyAssets = await storage.getAssetsByCompany(company.id);
              await storage.deleteGeoRisksByCompany(company.id);
              const bulkFailedIds = new Set<number>();
              await processInBatches(companyAssets, GEO_CONCURRENCY, async (asset) => {
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
                  log(`Missing: Geo risk error for asset ${asset.facilityName}: ${err.message}`);
                  bulkFailedIds.add(asset.id);
                  await storage.createGeoRisk({
                    assetId: asset.id, companyId: company.id,
                    expectedAnnualLoss: 0, expectedAnnualLossPct: 0, presentValue30yr: 0,
                    hurricaneLoss: 0, floodLoss: 0, heatStressLoss: 0, droughtLoss: 0, extremePrecipLoss: 0,
                    modelVersion: "FAILED",
                  });
                }
              });
              if (bulkFailedIds.size > 0) {
                const failedAssets = companyAssets.filter(a => bulkFailedIds.has(a.id));
                log(`Missing: Retrying ${failedAssets.length} failed assets for ${company.companyName}...`);
                await sleep(3000);
                for (const asset of failedAssets) {
                  try {
                    const assetValue = asset.estimatedValueUsd || 1000000;
                    const result = await fetchClimateRisk(asset.latitude, asset.longitude, assetValue);
                    await storage.deleteGeoRisk(asset.id);
                    await storage.createGeoRisk({
                      assetId: asset.id, companyId: company.id,
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
                    log(`Missing: Retry succeeded for ${asset.facilityName}`);
                  } catch (err: any) {
                    log(`Missing: Retry failed for ${asset.facilityName}: ${err.message}`);
                  }
                  await sleep(1000);
                }
              }
              log(`Missing: Completed geo risks for ${company.companyName}`);
            } catch (err: any) {
              log(`Missing: Geo risk failed for ${company.companyName}: ${err.message}`);
            }
          })());
        }

        if (!row.has_sc) {
          tasks.push((async () => {
            try {
              const countryCode = resolveSupplyChainCountry(company.isin, company.countryIso3, company.country);
              const sectorCode = company.isicSectorCode || sectorToIsic(company.sector);
              const scResult = await fetchSupplyChainRisk(countryCode, sectorCode);
              const scaled = scaleSupplyChainRisk(scResult, company.supplierCosts);
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
                supplyChainTiers: scResult.supply_chain_tiers,
                directExpectedLoss: scaled.directExpectedLoss,
                directExpectedLossPct: scaled.directExpectedLossPct,
                indirectExpectedLoss: scaled.indirectExpectedLoss,
                indirectExpectedLossPct: scaled.indirectExpectedLossPct,
              });
              log(`Missing: Completed supply chain risk for ${company.companyName}`);
            } catch (err: any) {
              log(`Missing: Supply chain error for ${company.companyName}: ${err.message}`);
            }
          })());
        }

        if (!row.has_mgmt) {
          tasks.push((async () => {
            try {
              const mgmtResult = await fetchManagementPerformance(company.isin, company.companyName);
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
                log(`Missing: Completed management score for ${company.companyName}`);
              }
            } catch (err: any) {
              log(`Missing: Management score error for ${company.companyName}: ${err.message}`);
            }
          })());
        }

        await Promise.all(tasks);

        processed++;
        await storage.updateOperation(operationId, {
          processedItems: processed,
          statusMessage: `${processed}/${totalSteps}: Completed ${company.companyName}`,
        });
      } catch (err: any) {
        failed++;
        processed++;
        log(`Missing: Failed to process ${row.company_name} (${row.isin}): ${err.message}`);
        await storage.updateOperation(operationId, {
          processedItems: processed,
          statusMessage: `${processed}/${totalSteps}: Failed ${row.company_name} - ${err.message}`,
        });
      }

      await sleep(200);
    }

    await storage.updateOperation(operationId, {
      status: "completed",
      processedItems: totalSteps,
      statusMessage: `Complete: ${totalSteps - failed} succeeded, ${failed} failed out of ${totalSteps} companies with missing data`,
      completedAt: new Date(),
    });
  } catch (err: any) {
    log(`Process missing companies failed: ${err.message}`);
    await storage.updateOperation(operationId, {
      status: "failed",
      statusMessage: `Failed: ${err.message}`,
      completedAt: new Date(),
    });
  }
}
