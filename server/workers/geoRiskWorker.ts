/**
 * Background worker for calculating geographic risks
 * Runs outside the HTTP request cycle to avoid timeouts
 */

import * as db from '../db';
import * as externalApis from '../services/externalApis';
import { progressTracker } from '../utils/progressTracker';

export async function calculateGeographicRisksBackground(operationId: string) {
  console.log(`[GeoRisk Worker] Starting background calculation with operation ID: ${operationId}`);
  
  try {
    const companies = await db.getAllCompanies();
    console.log(`[GeoRisk Worker] Loaded ${companies.length} companies`);
    let risksCalculated = 0;
    let skipped = 0;
    const errors: string[] = [];
    
    // Count total assets to calculate
    let totalAssets = 0;
    for (const company of companies) {
      const assets = await db.getAssetsByCompanyId(company.id);
      totalAssets += assets.filter(a => a.latitude && a.longitude && a.estimatedValueUsd).length;
    }
    
    console.log(`[GeoRisk Worker] Total assets to process: ${totalAssets}`);
    progressTracker.start(operationId, 'Calculating geographic risks', totalAssets, `Found ${totalAssets} assets to process`);
    let processedAssets = 0;

    // Collect all assets to process
    const assetsToProcess: Array<{ asset: any; company: any }> = [];
    for (const company of companies) {
      const assets = await db.getAssetsByCompanyId(company.id);
      for (const asset of assets) {
        if (asset.latitude && asset.longitude && asset.estimatedValueUsd) {
          // Check if risk already calculated
          const existingRisk = await db.getGeographicRiskByAssetId(asset.id);
          if (!existingRisk) {
            assetsToProcess.push({ asset, company });
          } else {
            skipped++;
          }
        }
      }
    }

    console.log(`[GeoRisk Worker] Processing ${assetsToProcess.length} assets in parallel (concurrency: 10)`);

    // Process assets in parallel batches of 10
    const BATCH_SIZE = 10;
    for (let i = 0; i < assetsToProcess.length; i += BATCH_SIZE) {
      // Check for cancellation
      if (progressTracker.isCancelled(operationId)) {
        console.log(`[GeoRisk Worker] Operation cancelled after ${risksCalculated} assets`);
        progressTracker.fail(operationId, `Cancelled after ${risksCalculated} assets`);
        return {
          success: false,
          risksCalculated,
          skipped,
          errors,
          operationId,
          cancelled: true
        };
      }
      
      // Check for pause
      if (progressTracker.isPaused(operationId)) {
        console.log(`[GeoRisk Worker] Operation paused after ${risksCalculated} assets`);
        progressTracker.pause(operationId);
        return {
          success: true,
          risksCalculated,
          skipped,
          errors,
          operationId,
          paused: true
        };
      }
      
      const batch = assetsToProcess.slice(i, i + BATCH_SIZE);
      
      await Promise.all(batch.map(async ({ asset, company }) => {
        try {
          // Check cancellation before processing each asset
          if (progressTracker.isCancelled(operationId)) {
            return;
          }
          
          const lat = parseFloat(asset.latitude);
          const lon = parseFloat(asset.longitude);
          const value = parseFloat(asset.estimatedValueUsd);
          
          if (!isNaN(lat) && !isNaN(lon) && !isNaN(value) && value > 0) {
            const progressMsg = `Processing ${asset.assetName} (${company.name}) - ${risksCalculated + 1}/${assetsToProcess.length}`;
            progressTracker.update(operationId, processedAssets, progressMsg);
            console.log(`[GeoRisk Worker] ${progressMsg}`);
            
            const riskData = await externalApis.fetchGeographicRisk(lat, lon, value);
            
            await db.insertGeographicRisk({
              assetId: asset.id,
              latitude: lat.toString(),
              longitude: lon.toString(),
              assetValue: value.toString(),
              riskData: riskData as any,
            });
            
            risksCalculated++;
            processedAssets++;
            const completedMsg = `Calculated ${risksCalculated}/${assetsToProcess.length} risks (${Math.round((risksCalculated / assetsToProcess.length) * 100)}%)`;
            progressTracker.update(operationId, processedAssets, completedMsg);
            console.log(`[GeoRisk Worker] ✓ ${asset.assetName}`);
          }
        } catch (error) {
          const errorMsg = `Asset ${asset.assetName} (ID: ${asset.id}): ${error}`;
          console.error(`[GeoRisk Worker] ✗ ${errorMsg}`);
          errors.push(errorMsg);
          processedAssets++; // Count failed assets too
        }
      }));
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`[GeoRisk Worker] Completed: ${risksCalculated} calculated, ${skipped} skipped, ${errors.length} errors`);
    
    if (errors.length > 0) {
      progressTracker.fail(operationId, `Completed with ${errors.length} errors`);
    } else {
      progressTracker.complete(operationId, `Calculated ${risksCalculated} risks, skipped ${skipped}`);
    }

    return {
      success: true,
      risksCalculated,
      skipped,
      errors,
      operationId
    };
  } catch (error) {
    console.error(`[GeoRisk Worker] Fatal error:`, error);
    progressTracker.fail(operationId, `Fatal error: ${error}`);
    throw error;
  }
}
