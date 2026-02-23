const ASSET_API_BASE = "https://corporate-asset-database-251730b20663.herokuapp.com";
const CLIMATE_RISK_API_BASE = "https://climate-risk-api-v6-prob-be68437e49be.herokuapp.com";
const SUPPLY_CHAIN_API_BASE = "https://supply-chain-risk-api-7567b2b7e4c5.herokuapp.com";
const MANAGEMENT_API_BASE = "https://climate-risk-replit-562361beb142.herokuapp.com";

async function fetchWithRetry(url: string, options?: RequestInit, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      if (response.status === 404) return response;
      if (i < retries - 1) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
      }
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
  throw new Error(`Failed after ${retries} retries: ${url}`);
}

export interface AssetLocationResponse {
  isin: string;
  company_name: string;
  sector: string;
  total_estimated_value: number;
  asset_count: number;
  assets: Array<{
    facility_name: string;
    asset_type: string;
    address: string;
    city: string;
    country: string;
    latitude: number;
    longitude: number;
    coordinate_certainty: number;
    estimated_value_usd: number;
    valuation_confidence: number;
    ownership_share: number;
    data_source: string;
  }>;
}

export async function fetchAssetLocations(isin: string): Promise<AssetLocationResponse> {
  const response = await fetchWithRetry(`${ASSET_API_BASE}/api/assets/isin/${isin}`);
  if (!response.ok) {
    if (response.status === 404) {
      return { isin, company_name: "", sector: "", total_estimated_value: 0, asset_count: 0, assets: [] };
    }
    throw new Error(`Asset API error: ${response.status}`);
  }
  return response.json();
}

export interface ClimateRiskResponse {
  expected_annual_loss: number;
  expected_annual_loss_pct: number;
  present_value_30yr: number;
  present_value_30yr_pct: number;
  model_version: string;
  risk_breakdown: {
    hurricane: { annual_loss: number; annual_loss_pct: number };
    flood: { annual_loss: number; annual_loss_pct: number };
    heat_stress: { annual_loss: number; annual_loss_pct: number };
    drought: { annual_loss: number; annual_loss_pct: number };
    extreme_precipitation: { annual_loss: number; annual_loss_pct: number };
  };
}

export async function fetchClimateRisk(
  latitude: number,
  longitude: number,
  assetValue: number
): Promise<ClimateRiskResponse> {
  const response = await fetchWithRetry(`${CLIMATE_RISK_API_BASE}/assess`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ latitude, longitude, asset_value: assetValue }),
  });
  if (!response.ok) {
    throw new Error(`Climate Risk API error: ${response.status}`);
  }
  return response.json();
}

export interface SupplyChainRiskResponse {
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
    expected_loss: {
      total_annual_loss: number;
      total_annual_loss_pct: number;
      present_value_30yr: number;
      risk_breakdown: Record<string, { annual_loss: number; annual_loss_pct: number }>;
    };
  };
  indirect_risk: {
    climate: number;
    modern_slavery: number;
    political: number;
    water_stress: number;
    nature_loss: number;
    expected_loss: {
      total_annual_loss: number;
      total_annual_loss_pct: number;
    };
  };
  total_risk: {
    climate: number;
    modern_slavery: number;
    political: number;
    water_stress: number;
    nature_loss: number;
  };
  top_suppliers: Array<{
    country: string;
    sector: string;
    coefficient: number;
    country_name: string;
    sector_name: string;
    direct_risk: Record<string, number>;
    risk_contribution: Record<string, number>;
    expected_loss_contribution: {
      annual_loss: number;
      present_value_30yr: number;
    };
  }>;
}

export async function fetchSupplyChainRisk(
  countryIso3: string,
  sectorIsic: string
): Promise<SupplyChainRiskResponse> {
  const response = await fetchWithRetry(
    `${SUPPLY_CHAIN_API_BASE}/api/assess?country=${countryIso3}&sector=${sectorIsic}`
  );
  if (!response.ok) {
    throw new Error(`Supply Chain API error: ${response.status}`);
  }
  return response.json();
}

export interface ManagementPerformanceResponse {
  company: {
    id: number;
    name: string;
    isin: string;
    sector: string;
    industry: string;
    country: string;
    analysisStatus: string;
    totalScore: number;
    totalPossible: number;
    summary: string;
    updatedAt: string;
  };
  documents: Array<{
    id: number;
    url: string;
    title: string;
    type: string;
    publicationYear: number;
  }>;
  scores: Record<string, Array<{
    measureId: string;
    title: string;
    score: number;
    evidenceSummary: string;
    coverage: string;
    confidence: string;
    quotes: Array<{ text: string; source: string; page: string }>;
  }>>;
  measureCount: number;
}

export async function fetchManagementPerformance(
  isin: string
): Promise<ManagementPerformanceResponse | null> {
  const response = await fetchWithRetry(`${MANAGEMENT_API_BASE}/api/lookup/${isin}`);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Management API error: ${response.status}`);
  }
  return response.json();
}
