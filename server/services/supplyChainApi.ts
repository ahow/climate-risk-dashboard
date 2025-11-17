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
  climate_details: {
    country: string;
    expected_annual_loss: number;
    expected_annual_loss_pct: number;
    present_value_30y: number;
    hazards: {
      drought: number;
      flood: number;
      heat_stress: number;
      hurricane: number;
      extreme_precipitation: number;
    };
  };
  top_suppliers: Array<{
    country: string;
    country_name: string;
    sector: string;
    sector_name: string;
    io_coefficient: number;
    direct_risk: {
      climate: number;
      modern_slavery: number;
      political: number;
      water_stress: number;
      nature_loss: number;
    };
    risk_contribution: {
      climate: number;
      modern_slavery: number;
      political: number;
      water_stress: number;
      nature_loss: number;
    };
  }>;
  total_suppliers: number;
  io_coverage: number;
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
    } as any;
  }
  
  // Parse REST API response
  const assessment = response as SupplyChainRiskAssessment;
  
  console.log(`[fetchSupplyChainRisk] Success: ${assessment.country_name} - ${assessment.sector_name}, Expected Loss: ${assessment.climate_details.expected_annual_loss_pct}%`);

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

