const ASSET_API_BASE = "https://corporate-asset-database-251730b20663.herokuapp.com";
const CLIMATE_RISK_API_BASE = "https://climate-risk-api-v6-prob-be68437e49be.herokuapp.com";
const SUPPLY_CHAIN_API_BASE = "https://supply-chain-risk-api-7567b2b7e4c5.herokuapp.com";
const MANAGEMENT_API_BASE = "https://climate-risk-replit-562361beb142.herokuapp.com";

const circuitBreakers: Record<string, { failures: number; openUntil: number }> = {};
const CIRCUIT_THRESHOLD = 3;
const CIRCUIT_COOLDOWN_MS = 60000;

function getCircuitKey(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname + u.pathname;
  } catch {
    return url;
  }
}

function isCircuitOpen(key: string): boolean {
  const cb = circuitBreakers[key];
  if (!cb) return false;
  if (cb.failures >= CIRCUIT_THRESHOLD && Date.now() < cb.openUntil) return true;
  if (Date.now() >= cb.openUntil) {
    cb.failures = 0;
    return false;
  }
  return false;
}

function recordFailure(key: string) {
  if (!circuitBreakers[key]) circuitBreakers[key] = { failures: 0, openUntil: 0 };
  circuitBreakers[key].failures++;
  if (circuitBreakers[key].failures >= CIRCUIT_THRESHOLD) {
    circuitBreakers[key].openUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
  }
}

function recordSuccess(key: string) {
  if (circuitBreakers[key]) circuitBreakers[key].failures = 0;
}

async function fetchWithRetry(url: string, options?: RequestInit, retries = 3, timeoutMs = 15000): Promise<Response> {
  const circuitKey = getCircuitKey(url);
  if (isCircuitOpen(circuitKey)) {
    throw new Error(`Circuit breaker open for ${circuitKey} — API appears down, skipping for ${Math.ceil(CIRCUIT_COOLDOWN_MS / 1000)}s`);
  }

  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      if (response.ok) {
        recordSuccess(circuitKey);
        return response;
      }
      if (response.status === 404) return response;
      if (response.status === 503) {
        recordFailure(circuitKey);
        throw new Error(`API returned 503 (unavailable): ${url}`);
      }
      if (i < retries - 1) {
        await new Promise(r => setTimeout(r, 500 * Math.pow(2, i)));
      }
    } catch (error: any) {
      if (error.message?.includes("503")) {
        throw error;
      }
      if (error.name === "AbortError") {
        recordFailure(circuitKey);
        if (i === retries - 1) throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
      } else if (i === retries - 1) {
        recordFailure(circuitKey);
        throw error;
      }
      await new Promise(r => setTimeout(r, 500 * Math.pow(2, i)));
    }
  }
  throw new Error(`Failed after ${retries} retries: ${url}`);
}

interface RawAssetApiResponse {
  isin: string;
  total_assets: number;
  company_name?: string;
  sector?: string;
  total_estimated_value?: number;
  asset_count?: number;
  assets: Array<{
    companyName?: string;
    facilityName?: string;
    facility_name?: string;
    assetType?: string;
    asset_type?: string;
    address?: string;
    city?: string;
    country?: string;
    latitude: number;
    longitude: number;
    coordinateCertainty?: number;
    coordinate_certainty?: number;
    valueUsd?: number;
    estimated_value_usd?: number;
    valuationConfidence?: number;
    valuation_confidence?: number;
    ownershipShare?: number;
    ownership_share?: number;
    sector?: string;
    dataSource?: string;
    data_source?: string;
  }>;
}

export interface AssetLocationResponse {
  isin: string;
  companyName: string;
  sector: string;
  totalEstimatedValue: number;
  assetCount: number;
  assets: Array<{
    facilityName: string;
    assetType: string;
    address: string;
    city: string;
    country: string;
    latitude: number;
    longitude: number;
    coordinateCertainty: number;
    estimatedValueUsd: number;
    valuationConfidence: number;
    ownershipShare: number;
    dataSource: string;
  }>;
}

export async function fetchAssetLocations(isin: string): Promise<AssetLocationResponse> {
  const response = await fetchWithRetry(`${ASSET_API_BASE}/api/assets/isin/${isin}`);
  if (!response.ok) {
    if (response.status === 404) {
      return { isin, companyName: "", sector: "", totalEstimatedValue: 0, assetCount: 0, assets: [] };
    }
    throw new Error(`Asset API error: ${response.status}`);
  }
  const raw: RawAssetApiResponse = await response.json();

  const firstAsset = raw.assets?.[0];
  const companyName = raw.company_name || firstAsset?.companyName || "Unknown Company";
  const sector = raw.sector || firstAsset?.sector || "";
  const assetCount = raw.asset_count || raw.total_assets || raw.assets?.length || 0;

  const normalizedAssets = (raw.assets || []).map(a => ({
    facilityName: a.facilityName || a.facility_name || "Unknown Facility",
    assetType: a.assetType || a.asset_type || "Unknown",
    address: a.address || "",
    city: a.city || "",
    country: a.country || "",
    latitude: a.latitude,
    longitude: a.longitude,
    coordinateCertainty: a.coordinateCertainty ?? a.coordinate_certainty ?? 0,
    estimatedValueUsd: a.valueUsd || a.estimated_value_usd || 0,
    valuationConfidence: a.valuationConfidence ?? a.valuation_confidence ?? 0,
    ownershipShare: a.ownershipShare ?? a.ownership_share ?? 100,
    dataSource: a.dataSource || a.data_source || "API",
  }));

  const totalEstimatedValue = raw.total_estimated_value
    ? raw.total_estimated_value
    : normalizedAssets.reduce((sum, a) => sum + a.estimatedValueUsd, 0);

  return {
    isin: raw.isin,
    companyName,
    sector,
    totalEstimatedValue,
    assetCount,
    assets: normalizedAssets,
  };
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
      present_value: number;
      discount_rate: number;
      growth_rate: number;
      pv_horizon: number;
      risk_breakdown: Record<string, { annual_loss: number; annual_loss_pct: number; present_value: number }>;
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
      present_value: number;
      discount_rate: number;
      growth_rate: number;
      pv_horizon: number;
      risk_breakdown: Record<string, { annual_loss: number; annual_loss_pct: number; present_value: number }>;
    };
  };
  total_risk: {
    climate: number;
    modern_slavery: number;
    political: number;
    water_stress: number;
    nature_loss: number;
  };
  supply_chain_tiers: Array<{
    tier: number;
    weight: number;
    supplier_count: number;
    risk: Record<string, number>;
    expected_loss: {
      total_annual_loss: number;
      total_annual_loss_pct: number;
      present_value: number;
      discount_rate: number;
      growth_rate: number;
      pv_horizon: number;
      risk_breakdown: Record<string, { annual_loss: number; annual_loss_pct: number; present_value: number }>;
    };
    suppliers: Array<{
      country: string;
      sector: string;
      coefficient: number;
      country_name: string;
      sector_name: string;
      tier: number;
      direct_risk: Record<string, number>;
      risk_contribution: Record<string, number>;
      expected_loss_contribution: {
        annual_loss: number;
        present_value: number;
      };
    }>;
  }>;
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
      present_value: number;
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
    downloadedAt?: string;
  }>;
  scores: Record<string, Array<{
    measureId: string;
    title: string;
    score: number;
    evidenceSummary: string;
    coverage: string | null;
    confidence: string;
    quotes: Array<{ text: string; source: string; page: string }>;
  }>>;
  measureCount?: number;
  analysisResults?: any[];
}

interface BulkManagementResponse {
  generatedAt: string;
  totalCompanies: number;
  companies: ManagementPerformanceResponse[];
}

let cachedBulkData: BulkManagementResponse | null = null;
let cacheTimestamp: number = 0;
let bulkFailedUntil: number = 0;
const CACHE_TTL_MS = 30 * 60 * 1000;
const BULK_FAIL_COOLDOWN_MS = 10 * 60 * 1000;

async function fetchBulkManagementData(): Promise<BulkManagementResponse> {
  const now = Date.now();
  if (cachedBulkData && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedBulkData;
  }

  if (now < bulkFailedUntil) {
    throw new Error("Bulk export recently failed, skipping for cooldown period");
  }

  try {
    const response = await fetchWithRetry(
      `${MANAGEMENT_API_BASE}/api/export/json`,
      undefined,
      1,
      30000
    );
    if (!response.ok) {
      throw new Error(`Management bulk API error: ${response.status}`);
    }
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const text = await response.text();
      if (text.includes("<!DOCTYPE") || text.includes("<html")) {
        throw new Error("Management API returned HTML instead of JSON - API may be unavailable");
      }
      throw new Error(`Management API returned unexpected content-type: ${contentType}`);
    }
    cachedBulkData = await response.json() as BulkManagementResponse;
    cacheTimestamp = now;
    return cachedBulkData;
  } catch (err) {
    bulkFailedUntil = Date.now() + BULK_FAIL_COOLDOWN_MS;
    throw err;
  }
}

async function fetchManagementIndividual(
  isin: string
): Promise<ManagementPerformanceResponse | null> {
  const response = await fetchWithRetry(
    `${MANAGEMENT_API_BASE}/api/lookup/${isin}`,
    undefined,
    3,
    30000
  );
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`Management lookup API error: ${response.status}`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return null;
  const data = await response.json() as ManagementPerformanceResponse;
  if (!data?.company) return null;
  return data;
}

export async function fetchManagementPerformance(
  isin: string,
  companyName?: string
): Promise<ManagementPerformanceResponse | null> {
  try {
    const bulkData = await fetchBulkManagementData();
    const match = bulkData.companies.find(
      c => c.company.isin.toUpperCase() === isin.toUpperCase()
    );
    if (match) return match;

    if (companyName) {
      const normalizedName = companyName.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const nameMatch = bulkData.companies.find(c => {
        const apiName = c.company.name.toUpperCase().replace(/[^A-Z0-9]/g, '');
        return apiName === normalizedName || apiName.includes(normalizedName) || normalizedName.includes(apiName);
      });
      if (nameMatch) {
        console.log(`[mgmt] Found ${companyName} by name match (API ISIN: ${nameMatch.company.isin}, our ISIN: ${isin})`);
        return nameMatch;
      }
    }
  } catch (err: any) {
    console.log(`[mgmt] Bulk export failed, falling back to individual lookup for ${isin}: ${err.message}`);
  }
  try {
    return await fetchManagementIndividual(isin);
  } catch (err: any) {
    console.log(`[mgmt] Individual lookup also failed for ${isin}: ${err.message}`);
    return null;
  }
}
