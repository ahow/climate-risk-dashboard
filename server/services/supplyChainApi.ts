/**
 * Supply Chain Risk API Integration
 * Base URL: https://supply-chain-risk-api-7567b2b7e4c5.herokuapp.com
 */

import { getOECDCountryCode, getOECDSectorCode } from "../utils/oecdMappings";
import { retryAsync } from "../utils/retry";

const SUPPLY_CHAIN_API_BASE = "https://supply-chain-risk-api-7567b2b7e4c5.herokuapp.com";
const SUPPLY_CHAIN_API_KEY = "zhSJ0IiDc1lb2qyOHK1rOkN20c4cXGRlNGSB4vhrNYM";

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
): Promise<SupplyChainRiskAssessment> {
  const countryCode = getOECDCountryCode(companyGeography);
  const sectorCode = getOECDSectorCode(companySector);

  console.log(`[fetchSupplyChainRisk] Mapping: ${companyGeography} → ${countryCode}, ${companySector} → ${sectorCode}`);

  // REST API endpoint
  const url = `${SUPPLY_CHAIN_API_BASE}/api/assess?country=${countryCode}&sector=${sectorCode}`;

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

  // Handle unsupported country/sector combinations
  if (!response) {
    // Return a default assessment with zero risk for unsupported combinations
    return {
      country: countryCode,
      country_name: companyGeography || countryCode,
      sector: sectorCode,
      sector_name: companySector || sectorCode,
      direct_risk: { climate: 0, modern_slavery: 0, political: 0, water_stress: 0, nature_loss: 0 },
      indirect_risk: { climate: 0, modern_slavery: 0, political: 0, water_stress: 0, nature_loss: 0 },
      total_risk: { climate: 0, modern_slavery: 0, political: 0, water_stress: 0, nature_loss: 0 },
      climate_details: {
        country: countryCode,
        expected_annual_loss: 0,
        expected_annual_loss_pct: 0,
        present_value_30y: 0,
        hazards: {
          drought: 0,
          flood: 0,
          heat_stress: 0,
          hurricane: 0,
          extreme_precipitation: 0,
        },
      },
      top_suppliers: [],
      total_suppliers: 0,
      io_coverage: 0,
    };
  }
  
  // Parse REST API response
  const assessment = response as SupplyChainRiskAssessment;
  
  // Extract expected loss from direct_risk (API v4.1 structure)
  const expectedLoss = assessment.direct_risk.expected_loss;
  
  // Add computed climate_details for backward compatibility
  if (expectedLoss) {
    assessment.climate_details = {
      country: assessment.country,
      expected_annual_loss: expectedLoss.total_annual_loss,
      expected_annual_loss_pct: expectedLoss.total_annual_loss_pct,
      present_value_30y: expectedLoss.present_value_30yr,
      hazards: expectedLoss.breakdown ? {
        drought: expectedLoss.breakdown.drought?.annual_loss || 0,
        flood: expectedLoss.breakdown.flood?.annual_loss || 0,
        heat_stress: expectedLoss.breakdown.heat_stress?.annual_loss || 0,
        hurricane: expectedLoss.breakdown.hurricane?.annual_loss || 0,
        extreme_precipitation: expectedLoss.breakdown.extreme_precipitation?.annual_loss || 0,
      } : undefined,
    };
  } else {
    // Fallback if expected_loss is not available
    assessment.climate_details = {
      country: assessment.country,
      expected_annual_loss: 0,
      expected_annual_loss_pct: 0,
      present_value_30y: 0,
    };
  }
  
  console.log(`[fetchSupplyChainRisk] Success: ${assessment.country_name} - ${assessment.sector_name}, Expected Loss: $${expectedLoss?.total_annual_loss || 0} (${expectedLoss?.total_annual_loss_pct || 0}%)`);

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

