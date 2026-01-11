/**
 * Supply Chain Risk API Integration
 * Base URL: https://supply-chain-risk-api-7567b2b7e4c5.herokuapp.com
 */

import { getOECDCountryCode, getOECDSectorCode } from "../utils/oecdMappings";
import { retryAsync } from "../utils/retry";

const SUPPLY_CHAIN_API_BASE = "https://supply-chain-risk-api-7567b2b7e4c5.herokuapp.com";
const SUPPLY_CHAIN_API_KEY = "zhSJ0IiDc1lb2qyOHK1rOkN20c4cXGRlNGSB4vhrNYM";

// Raw API response structure
interface RawAPIResponse {
  country: { code: string; name: string };
  sector: { code: string; name: string };
  direct_risk: {
    climate: number;
    modern_slavery: number;
    political: number;
    water_stress: number;
    nature_loss: number;
    expected_loss?: {
      total_annual_loss: number;
      total_annual_loss_pct: number;
      present_value_30yr: number;
      present_value_30yr_pct: number;
      breakdown?: Record<string, any>;
    };
  };
  indirect_risk: Record<string, number>;
  total_risk?: Record<string, number>;
  top_suppliers?: Array<any>;
  [key: string]: any;
}

// Normalized assessment structure for internal use
export interface SupplyChainRiskAssessment {
  country: string;
  country_name: string;
  sector: string;
  sector_name: string;
  direct_risk: {
    climate: number;
    modern_slavery: number;
    political: number;
    water_stress: number;
    nature_loss: number;
    expected_loss?: {
      total_annual_loss: number;
      total_annual_loss_pct: number;
      present_value_30yr: number;
      present_value_30yr_pct: number;
      breakdown?: {
        drought?: { annual_loss: number; annual_loss_pct: number };
        flood?: { annual_loss: number; annual_loss_pct: number };
        heat_stress?: { annual_loss: number; annual_loss_pct: number };
        hurricane?: { annual_loss: number; annual_loss_pct: number };
        extreme_precipitation?: { annual_loss: number; annual_loss_pct: number };
      };
    };
  };
  indirect_risk: {
    climate: number;
    modern_slavery: number;
    political: number;
    water_stress: number;
    nature_loss: number;
  };
  total_risk: {
    climate: number;
    modern_slavery: number;
    political: number;
    water_stress: number;
    nature_loss: number;
  };
  top_suppliers?: Array<{
    country: string;
    country_name: string;
    sector: string;
    sector_name: string;
    coefficient?: number;
    io_coefficient?: number;
    direct_risk?: {
      climate: number;
      modern_slavery: number;
      political: number;
      water_stress: number;
      nature_loss: number;
    };
    risk_contribution?: {
      climate: number;
      modern_slavery: number;
      political: number;
      water_stress: number;
      nature_loss: number;
    };
  }>;
  total_suppliers?: number;
  io_coverage?: number;
  methodology?: {
    direct_risk: string;
    indirect_risk: string;
    tier_weights: string;
    total_risk: string;
  };
  // Computed field for compatibility
  climate_details?: {
    country: string;
    expected_annual_loss: number;
    expected_annual_loss_pct: number;
    present_value_30y: number;
    hazards?: {
      drought: number;
      flood: number;
      heat_stress: number;
      hurricane: number;
      extreme_precipitation: number;
    };
  };
}

/**
 * Fetch supply chain risk assessment for a company
 */
export async function fetchSupplyChainRisk(
  companyGeography: string | null | undefined,
  companySector: string | null | undefined
): Promise<SupplyChainRiskAssessment | null> {
  const countryCode = getOECDCountryCode(companyGeography);
  const sectorCode = getOECDSectorCode(companySector);

  console.log(`[fetchSupplyChainRisk] Mapping: ${companyGeography} → ${countryCode}, ${companySector} → ${sectorCode}`);

  // REST API endpoint with skip_climate=true since we'll get climate data from Geographic Risk API
  // This ensures consistency between direct asset risks and supply chain risks
  const url = `${SUPPLY_CHAIN_API_BASE}/api/assess?country=${countryCode}&sector=${sectorCode}&model=oecd&skip_climate=true`;

  const response = await retryAsync(async () => {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "X-API-Key": SUPPLY_CHAIN_API_KEY,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      // 404 means country/sector not supported by API (outside 67 countries, 34 sectors coverage)
      if (res.status === 404) {
        console.log(`[fetchSupplyChainRisk] Country/sector not supported: ${countryCode}/${sectorCode}`);
        return null; // Return null for unsupported combinations
      }
      throw new Error(`Supply Chain API error: ${res.status} ${res.statusText}`);
    }

    return res.json();
  });

  // Check if API returned an error in the JSON response
  // @ts-ignore - response type checking
  if (response && typeof response === 'object' && 'error' in response) {
    console.log(`[fetchSupplyChainRisk] API error: ${(response as any).error}`);
    return null; // Treat as unsupported combination
  }

  // Handle unsupported country/sector combinations or empty responses
  if (!response) {
    console.log(`[fetchSupplyChainRisk] No response data for ${countryCode}/${sectorCode}`);
    return null; // Return null so router skips saving this company
  }
  
  // Parse REST API response and normalize structure
  const rawResponse = response as RawAPIResponse;
  
  // Normalize to expected structure
  const assessment: SupplyChainRiskAssessment = {
    country: rawResponse.country.code,
    country_name: rawResponse.country.name,
    sector: rawResponse.sector.code,
    sector_name: rawResponse.sector.name,
    direct_risk: rawResponse.direct_risk,
    indirect_risk: rawResponse.indirect_risk as any,
    total_risk: rawResponse.total_risk as any || { climate: 0, modern_slavery: 0, political: 0, water_stress: 0, nature_loss: 0 },
    top_suppliers: rawResponse.top_suppliers || [],
    total_suppliers: rawResponse.total_suppliers || 0,
    io_coverage: rawResponse.io_coverage || 0,
  };
  
  // Get climate risk data from Geographic Risk API for consistency with asset-level analysis
  // Use country-level assessment (population-weighted) since we don't have specific coordinates
  let climateRiskData;
  try {
    const { fetchGeographicRiskByCountry } = await import('./externalApis');
    // Use a nominal asset value of $1M for percentage calculations
    climateRiskData = await fetchGeographicRiskByCountry(assessment.country, 1000000);
    
    // Add computed climate_details from Geographic Risk API
    assessment.climate_details = {
      country: assessment.country,
      expected_annual_loss: climateRiskData.expected_annual_loss || 0,
      expected_annual_loss_pct: climateRiskData.expected_annual_loss_pct || 0,
      present_value_30y: climateRiskData.present_value_30yr || 0,
      hazards: climateRiskData.risk_breakdown ? {
        drought: climateRiskData.risk_breakdown.drought?.annual_loss || 0,
        flood: climateRiskData.risk_breakdown.flood?.annual_loss || 0,
        heat_stress: climateRiskData.risk_breakdown.heat_stress?.annual_loss || 0,
        hurricane: climateRiskData.risk_breakdown.hurricane?.annual_loss || 0,
        extreme_precipitation: climateRiskData.risk_breakdown.extreme_precipitation?.annual_loss || 0,
      } : undefined,
    };
    
    console.log(`[fetchSupplyChainRisk] Climate data from Geographic Risk API: ${climateRiskData.expected_annual_loss_pct}%`);
  } catch (error) {
    console.error(`[fetchSupplyChainRisk] Failed to fetch climate data from Geographic Risk API:`, error);
    // Fallback to zero if Geographic Risk API fails
    assessment.climate_details = {
      country: assessment.country,
      expected_annual_loss: 0,
      expected_annual_loss_pct: 0,
      present_value_30y: 0,
    };
  }
  
  console.log(`[fetchSupplyChainRisk] Success: ${assessment.country_name} - ${assessment.sector_name}, Expected Loss: $${assessment.climate_details?.expected_annual_loss || 0} (${assessment.climate_details?.expected_annual_loss_pct || 0}%)`);

  return assessment;
}

/**
 * Calculate supply chain expected loss
 */
export function calculateSupplyChainLoss(
  supplierCosts: number,
  expectedAnnualLossPct: number
): {
  annualLoss: number;
  presentValue: number;
} {
  const annualLoss = supplierCosts * (expectedAnnualLossPct / 100);
  
  // Calculate 30-year present value at 10% discount rate
  const discountRate = 0.10;
  const years = 30;
  const pvFactor = (1 - Math.pow(1 + discountRate, -years)) / discountRate;
  const presentValue = annualLoss * pvFactor;

  return {
    annualLoss,
    presentValue,
  };
}

