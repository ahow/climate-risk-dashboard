/**
 * Optimized background worker for calculating geographic risks
 * Features:
 * - Database-backed progress tracking (survives restarts)
 * - Balanced parallelism (20 concurrent requests)
 * - Extended timeout (60s to allow hibernating API to wake up)
 * - Batch delays (500ms between batches to respect rate limits)
 * - Bulk checking for existing risks
 * - Automatic resume from last checkpoint
 * - Request timeout and retry logic
 */

import * as db from '../db';
import * as externalApis from '../services/externalApis';
import { persistentProgressTracker } from '../utils/persistentProgressTracker';

const BATCH_SIZE = 5; // Reduced concurrency to avoid overwhelming API
const REQUEST_TIMEOUT = 90000; // 90 second timeout for hibernating API wake-up
const MAX_RETRIES = 3; // Retry failed requests up to 3 times
const BATCH_DELAY = 1000; // 1 second delay between batches for rate limiting

export async function calculateGeographicRisksOptimized(operationId: string) {
  console.log(`[OptimizedGeoRisk] Starting calculation with operation ID: ${operationId}`);
  
  try {
    const companies = await db.getAllCompanies();
    console.log(`[OptimizedGeoRisk] Loaded ${companies.length} companies`);
    let risksCalculated = 0;
    let skipped = 0;
    const errors: string[] = [];
    
    // Collect all assets to process
    const allAssets: Array<{ asset: any; company: any }> = [];
    for (const company of companies) {
      const assets = await db.getAssetsByCompanyId(company.id);
      for (const asset of assets) {
        if (asset.latitude && asset.longitude && asset.estimatedValueUsd) {
          allAssets.push({ asset, company });
        }
      }
    }
    
    console.log(`[OptimizedGeoRisk] Found ${allAssets.length} total assets with coordinates and values`);
    
    // OPTIMIZATION: Bulk check for existing risks (single query instead of N queries)
    const existingRiskAssetIds = await db.getAllGeographicRiskAssetIds();
    const existingSet = new Set(existingRiskAssetIds);
    console.log(`[OptimizedGeoRisk] Found ${existingRiskAssetIds.length} existing risks`);
    
    // Filter out assets that already have risks
    const assetsToProcess = allAssets.filter(({ asset }) => !existingSet.has(asset.id));
    skipped = allAssets.length - assetsToProcess.length;
    
    console.log(`[OptimizedGeoRisk] Processing ${assetsToProcess.length} new assets (${skipped} already calculated)`);
    
    // Start progress tracking
    await persistentProgressTracker.start(
      operationId,
      'Calculating geographic risks',
      assetsToProcess.length,
      `Found ${assetsToProcess.length} assets to process`
    );
    
    let processedAssets = 0;
    const risksToInsert: any[] = []; // Collect risks for batch insertion
    
    // Process assets in parallel batches of 50
    for (let i = 0; i < assetsToProcess.length; i += BATCH_SIZE) {
      // Check for cancellation
      if (persistentProgressTracker.isCancelled(operationId)) {
        console.log(`[OptimizedGeoRisk] Operation cancelled after ${risksCalculated} assets`);
        await persistentProgressTracker.fail(operationId, `Cancelled after ${risksCalculated} assets`);
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
      if (persistentProgressTracker.isPaused(operationId)) {
        console.log(`[OptimizedGeoRisk] Operation paused after ${risksCalculated} assets`);
        await persistentProgressTracker.pause(operationId);
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
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(assetsToProcess.length / BATCH_SIZE);
      
      console.log(`[OptimizedGeoRisk] Processing batch ${batchNumber}/${totalBatches} (${batch.length} assets)`);
      
      // Process batch in parallel with timeout and retry
      await Promise.all(batch.map(async ({ asset, company }) => {
        try {
          // Check cancellation before processing each asset
          if (persistentProgressTracker.isCancelled(operationId)) {
            return;
          }
          
          const lat = parseFloat(asset.latitude);
          const lon = parseFloat(asset.longitude);
          const value = parseFloat(asset.estimatedValueUsd);
          
          if (!isNaN(lat) && !isNaN(lon) && !isNaN(value) && value > 0) {
            // Fetch risk data with timeout and retry
            const riskData = await fetchWithRetry(lat, lon, value, MAX_RETRIES);
            
            // Only insert if we have valid risk data
            if (riskData && typeof riskData === 'object') {
              // Collect risk for batch insertion
              risksToInsert.push({
                assetId: asset.id,
                latitude: lat.toString(),
                longitude: lon.toString(),
                assetValue: value.toString(),
                riskData: riskData as any,
              });
            } else {
              console.warn(`[OptimizedGeoRisk] Skipping asset ${asset.id} - no valid risk data returned`);
            }
            
            risksCalculated++;
            processedAssets++;
          }
        } catch (error) {
          const errorMsg = `Asset ${asset.assetName} (ID: ${asset.id}): ${error}`;
          console.error(`[OptimizedGeoRisk] ✗ ${errorMsg}`);
          errors.push(errorMsg);
          processedAssets++; // Count failed assets too
        }
      }));
      
      // Insert collected risks in batch every 100 items
      if (risksToInsert.length >= 100) {
        await db.bulkInsertGeographicRisks(risksToInsert.splice(0, 100));
      }
      
      // Update progress (throttled to database every 5 seconds)
      const completedMsg = `Calculated ${risksCalculated}/${assetsToProcess.length} risks (${Math.round((risksCalculated / assetsToProcess.length) * 100)}%) - Batch ${batchNumber}/${totalBatches}`;
      await persistentProgressTracker.update(operationId, processedAssets, completedMsg);
      
      // Force database update every 10 batches (checkpoint)
      if (batchNumber % 10 === 0) {
        await persistentProgressTracker.forceUpdate(operationId, processedAssets, completedMsg);
        console.log(`[OptimizedGeoRisk] Checkpoint: ${completedMsg}`);
      }
      
      // Add delay between batches to respect API rate limits
      if (i + BATCH_SIZE < assetsToProcess.length) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      }
    }
    
    // Insert any remaining risks
    if (risksToInsert.length > 0) {
      await db.bulkInsertGeographicRisks(risksToInsert);
    }

    console.log(`[OptimizedGeoRisk] Completed: ${risksCalculated} calculated, ${skipped} skipped, ${errors.length} errors`);
    
    if (errors.length > 0) {
      await persistentProgressTracker.fail(operationId, `Completed with ${errors.length} errors`);
    } else {
      await persistentProgressTracker.complete(operationId, `Calculated ${risksCalculated} risks, skipped ${skipped}`);
    }

    return {
      success: true,
      risksCalculated,
      skipped,
      errors,
      operationId
    };
  } catch (error) {
    console.error(`[OptimizedGeoRisk] Fatal error:`, error);
    await persistentProgressTracker.fail(operationId, `Fatal error: ${error}`);
    throw error;
  }
}

/**
 * Fetch geographic risk with timeout and retry logic
 */
async function fetchWithRetry(lat: number, lon: number, value: number, retriesLeft: number): Promise<any> {
  try {
    // Create timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), REQUEST_TIMEOUT);
    });
    
    // Race between API call and timeout
    const riskData = await Promise.race([
      externalApis.fetchGeographicRisk(lat, lon, value),
      timeoutPromise
    ]);
    
    return riskData;
  } catch (error) {
    if (retriesLeft > 0) {
      console.log(`[OptimizedGeoRisk] Retrying... (${retriesLeft} retries left)`);
      // Wait 1 second before retry
      await new Promise(resolve => setTimeout(resolve, 1000));
      return fetchWithRetry(lat, lon, value, retriesLeft - 1);
    }
    throw error;
  }
}
