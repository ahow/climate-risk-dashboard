/**
 * Supply Chain Risk API Integration
 * Base URL: https://supplyrisk-bb4n56uc.manus.space/api/trpc
 */

import { getOECDCountryCode, getOECDSectorCode } from "../utils/oecdMappings";
import { retryAsync } from "../utils/retry";

const SUPPLY_CHAIN_API_BASE = "https://supplyrisk-bb4n56uc.manus.space/api/trpc";

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
  climate_risk_detailed: {
    index_score: number;
    index_level: string;
    expected_annual_loss: number;
    expected_annual_loss_pct: number;
    present_value_30yr: number;
    present_value_30yr_pct: number;
    hazard_breakdown: Record<string, {
      loss: number;
      loss_pct: number;
      confidence: string;
    }>;
    api_available: boolean;
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

  const url = `${SUPPLY_CHAIN_API_BASE}/risk.assess`;
  const payload = {
    json: {
      country: countryCode,
      sector: sectorCode,
    },
  };

  const response = await retryAsync(async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`Supply Chain API error: ${res.status} ${res.statusText}`);
    }

    return res.json();
  });

  // Extract data from tRPC response format
  const assessment = response.result.data.json as SupplyChainRiskAssessment;
  
  console.log(`[fetchSupplyChainRisk] Success: ${assessment.country_name} - ${assessment.sector_name}, Expected Loss: ${assessment.climate_risk_detailed.expected_annual_loss_pct}%`);

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

