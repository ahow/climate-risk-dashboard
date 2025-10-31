/**
 * Asset Value Calibration Logic
 * 
 * This module implements proportionate allocation of asset values:
 * 1. Calculate each asset as % of total estimated values for the company
 * 2. Multiply percentage by reported tangible assets value
 * 3. Use calibrated value for risk calculations
 */

import * as db from "./db";
import * as externalApis from "./services/externalApis";

export interface CalibratedAsset {
  assetId: number;
  estimatedValue: number;
  percentageOfTotal: number;
  calibratedValue: number;
}

/**
 * Calculate calibrated values for all assets of a company
 */
export async function calculateCalibratedValues(companyId: number): Promise<CalibratedAsset[]> {
  const company = await db.getCompanyById(companyId);
  if (!company) {
    throw new Error(`Company not found: ${companyId}`);
  }

  const assets = await db.getAssetsByCompanyId(companyId);
  
  // Calculate total estimated value for all assets
  let totalEstimatedValue = 0;
  const assetValues: Array<{ id: number; estimatedValue: number }> = [];
  
  for (const asset of assets) {
    const estimatedValue = parseFloat(asset.estimatedValueUsd || '0');
    if (estimatedValue > 0) {
      totalEstimatedValue += estimatedValue;
      assetValues.push({ id: asset.id, estimatedValue });
    }
  }

  // Get reported tangible assets value
  const reportedTangibleAssets = parseFloat(company.tangibleAssets || '0');
  
  if (totalEstimatedValue === 0 || reportedTangibleAssets === 0) {
    console.warn(`Cannot calibrate assets for ${company.name}: totalEstimated=${totalEstimatedValue}, reported=${reportedTangibleAssets}`);
    return [];
  }

  // Calculate calibrated values
  const calibratedAssets: CalibratedAsset[] = assetValues.map(({ id, estimatedValue }) => {
    const percentageOfTotal = estimatedValue / totalEstimatedValue;
    const calibratedValue = percentageOfTotal * reportedTangibleAssets;
    
    return {
      assetId: id,
      estimatedValue,
      percentageOfTotal,
      calibratedValue,
    };
  });

  return calibratedAssets;
}

/**
 * Recalculate geographic risks for all assets using calibrated values
 */
export async function recalculateGeographicRisksWithCalibration(): Promise<{
  success: boolean;
  risksRecalculated: number;
  skipped: number;
  errors: string[];
}> {
  const companies = await db.getAllCompanies();
  let risksRecalculated = 0;
  let skipped = 0;
  const errors: string[] = [];

  console.log(`[Calibration] Starting recalculation for ${companies.length} companies`);

  for (const company of companies) {
    try {
      console.log(`[Calibration] Processing ${company.name}...`);
      
      // Get calibrated values for this company
      const calibratedAssets = await calculateCalibratedValues(company.id);
      
      if (calibratedAssets.length === 0) {
        console.warn(`[Calibration] No calibrated assets for ${company.name}`);
        continue;
      }

      // Recalculate geographic risks using calibrated values
      for (const calibrated of calibratedAssets) {
        try {
          const asset = await db.getAssetById(calibrated.assetId);
          if (!asset) continue;

          // Only recalculate if asset has valid coordinates
          if (asset.latitude && asset.longitude) {
            const lat = parseFloat(asset.latitude);
            const lon = parseFloat(asset.longitude);
            
            if (!isNaN(lat) && !isNaN(lon)) {
              console.log(`[Calibration] Recalculating ${asset.assetName}: $${calibrated.estimatedValue.toFixed(0)} → $${calibrated.calibratedValue.toFixed(0)} (${(calibrated.percentageOfTotal * 100).toFixed(1)}%)`);
              
              // Delete existing risk data
              await db.deleteGeographicRiskByAssetId(calibrated.assetId);
              
              // Fetch new risk data with calibrated value
              const riskData = await externalApis.fetchGeographicRisk(
                lat,
                lon,
                calibrated.calibratedValue
              );
              
              // Store new risk data
              await db.insertGeographicRisk({
                assetId: calibrated.assetId,
                latitude: lat.toString(),
                longitude: lon.toString(),
                assetValue: calibrated.calibratedValue.toString(),
                riskData: riskData as any,
              });
              
              risksRecalculated++;
              console.log(`[Calibration] ✓ Recalculated (${risksRecalculated} total)`);
              
              // Add delay to avoid overwhelming the API
              await new Promise(resolve => setTimeout(resolve, 1000));
            } else {
              skipped++;
            }
          } else {
            skipped++;
          }
        } catch (error) {
          const errorMsg = `Asset ${calibrated.assetId}: ${error}`;
          console.error(`[Calibration] ✗ ${errorMsg}`);
          errors.push(errorMsg);
        }
      }
    } catch (error) {
      const errorMsg = `Company ${company.name}: ${error}`;
      console.error(`[Calibration] ✗ ${errorMsg}`);
      errors.push(errorMsg);
    }
  }

  console.log(`[Calibration] Completed: ${risksRecalculated} recalculated, ${skipped} skipped, ${errors.length} errors`);

  return {
    success: true,
    risksRecalculated,
    skipped,
    errors,
  };
}

