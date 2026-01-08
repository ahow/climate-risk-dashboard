/**
 * External API Integration Services
 * Handles communication with Asset Discovery, Geographic Risks, and Risk Management APIs
 */

import { fetchWithRetry } from '../utils/retry';

const ASSET_DISCOVERY_API = "https://climate-risk-asset-api-82e03a276d7d.herokuapp.com/api/trpc";
const GEOGRAPHIC_RISKS_API = "https://climate-risk-country-v4-fdee3b254d49.herokuapp.com";
const RISK_MANAGEMENT_API = "https://climate-risk-replit-562361beb142.herokuapp.com";

export interface AssetData {
  asset_name: string;
  company_name: string;
  isin: string; // 12-digit International Securities Identification Number
  asset_type: string | null;
  location: string;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  geocoding_certainty: number | null;
  coordinate_certainty: number | null;
  estimated_value_usd: number | null;
  value_confidence: number | null;
  description: string | null;
  data_source: string | null;
  ownership_share: number | null;
  notes: string | null;
}

export interface GeographicRiskData {
  asset_value: number;
  expected_annual_loss: number;
  expected_annual_loss_pct: number;
  present_value_30yr: number;
  present_value_30yr_pct: number;
  location: {
    latitude: number;
    longitude: number;
  };
  parameters: {
    building_type: string;
    climate_escalation: number;
    discount_rate: number;
    time_horizon: number;
  };
  risk_breakdown: {
    hurricane: RiskDetail;
    flood: RiskDetail;
    drought: RiskDetail;
    heat_stress: RiskDetail;
    extreme_precipitation: RiskDetail;
  };
}

export interface RiskDetail {
  annual_loss: number;
  annual_loss_pct: number;
  confidence: string;
  details: string;
}

// New API response structure from /api/company/isin/{ISIN}
export interface RiskManagementData {
  company: {
    id: number;
    name: string;
    isin: string;
    sector: string;
    industry?: string;
    country?: string;
    totalScore: number | null;
    analysisStatus: 'idle' | 'processing' | 'completed' | 'failed';
    summary: string | null;
  };
  documents: Array<{
    id: number;
    title: string;
    url: string;
    type: string;
  }>;
  measureScores: Array<{
    measureId: string;
    category: string;
    title: string;
    score: number;
    evidenceSummary: string;
    confidence: 'High' | 'Medium' | 'Low';
    quotes: Array<{
      text: string;
      source: string;
      page?: number;
    }>;
  }>;
}

/**
 * Fetch all assets from the Asset Discovery API
 * Returns all 565 assets with 100% coordinate and value coverage
 */
export async function fetchAllAssetsFromAPI(): Promise<AssetData[]> {
  try {
    console.log('Fetching all assets from Asset Discovery API...');
    
    const url = `${ASSET_DISCOVERY_API}/assets.getAll`;
    
    // Use retry logic to handle API hibernation (502/504 errors)
    const response = await fetchWithRetry(url, undefined, {
      maxRetries: 5,
      initialDelay: 2000,
      maxDelay: 30000,
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch all assets: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Extract data from tRPC response format: result.data.json
    // @ts-ignore
    const result = data?.result?.data?.json;
    if (!result || !result.assets) {
      console.warn('No assets found in API response');
      return [];
    }
    
    console.log(`Fetched ${result.total_assets} assets (${result.assets_with_coordinates} with coordinates)`);
    
    // Map new API format to our AssetData interface
    // New API v2.0 uses: facility_name, value_usd, address, isin
    // Old API used: asset_name, estimated_value_usd, location
    return result.assets.map((asset: any) => ({
      asset_name: asset.facility_name || asset.asset_name,
      company_name: asset.company_name,
      isin: asset.isin, // 12-digit ISIN for reliable company matching
      asset_type: asset.asset_type,
      location: asset.address || asset.location,
      city: asset.city,
      country: asset.country,
      latitude: asset.latitude,
      longitude: asset.longitude,
      geocoding_certainty: asset.geocoding_certainty,
      coordinate_certainty: asset.coordinate_certainty,
      estimated_value_usd: asset.value_usd || asset.estimated_value_usd,
      value_confidence: asset.value_confidence,
      description: asset.description,
      data_source: asset.data_source,
      ownership_share: asset.ownership_share,
      notes: asset.notes,
    }));
  } catch (error) {
    console.error('Error fetching all assets:', error);
    throw error;
  }
}

/**
 * Fetch assets for a company from the Asset Discovery API
 * Note: This API uses tRPC protocol with URL-encoded JSON input
 */
export async function fetchCompanyAssets(companyName: string): Promise<AssetData[]> {
  try {
    console.log(`Fetching assets for company: ${companyName}`);
    
    // Prepare tRPC input format
    const inputData = {
      json: {
        company_name: companyName
      }
    };
    
    const encodedInput = encodeURIComponent(JSON.stringify(inputData));
    const url = `${ASSET_DISCOVERY_API}/assets.getByCompany?input=${encodedInput}`;
    
    // Use retry logic to handle API hibernation (502/504 errors)
    const response = await fetchWithRetry(url, undefined, {
      maxRetries: 5,
      initialDelay: 2000,
      maxDelay: 30000,
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch assets: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Extract data from tRPC response format: result.data.json
    // @ts-ignore
    const result = data?.result?.data?.json;
    if (!result || !result.assets) {
      console.warn(`No assets found for company: ${companyName}`);
      return [];
    }
    
    // Map new API format to our AssetData interface
    // New API v2.0 uses: facility_name, value_usd, address, isin
    // Old API used: asset_name, estimated_value_usd, location
    return result.assets.map((asset: any) => ({
      asset_name: asset.facility_name || asset.asset_name,
      company_name: asset.company_name,
      isin: asset.isin, // 12-digit ISIN for reliable company matching
      asset_type: asset.asset_type,
      location: asset.address || asset.location,
      city: asset.city,
      country: asset.country,
      latitude: asset.latitude,
      longitude: asset.longitude,
      geocoding_certainty: asset.geocoding_certainty,
      coordinate_certainty: asset.coordinate_certainty,
      estimated_value_usd: asset.value_usd || asset.estimated_value_usd,
      value_confidence: asset.value_confidence,
      description: asset.description,
      data_source: asset.data_source,
      ownership_share: asset.ownership_share,
      notes: asset.notes,
    }));
  } catch (error) {
    console.error(`Error fetching assets for ${companyName}:`, error);
    throw error;
  }
}

/**
 * Check if Climate Risk API is healthy and responsive
 */
export async function checkClimateRiskApiHealth(): Promise<{ healthy: boolean; message: string }> {
  try {
    const response = await fetch(`${GEOGRAPHIC_RISKS_API}/assess`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        latitude: 0,
        longitude: 0,
        asset_value: 1,
      }),
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    if (response.ok) {
      return { healthy: true, message: 'API is responsive' };
    } else if (response.status === 503) {
      return { healthy: false, message: 'API is sleeping or unavailable (503)' };
    } else {
      return { healthy: false, message: `API returned status ${response.status}` };
    }
  } catch (error: any) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return { healthy: false, message: 'API health check timed out (30s)' };
    }
    return { healthy: false, message: `API health check failed: ${error.message}` };
  }
}

/**
 * Fetch geographic risk assessment for a specific location
 */
export async function fetchGeographicRisk(
  latitude: number,
  longitude: number,
  assetValue: number
): Promise<GeographicRiskData> {
  try {
    // Use retry logic to handle API hibernation and temporary failures
    const response = await fetchWithRetry(
      `${GEOGRAPHIC_RISKS_API}/assess`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          latitude,
          longitude,
          asset_value: assetValue,
        }),
      },
      {
        maxRetries: 5,
        initialDelay: 2000,
        maxDelay: 30000,
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch geographic risk: ${response.statusText}`);
    }

    return await response.json() as any;
  } catch (error) {
    console.error(`Error fetching geographic risk for (${latitude}, ${longitude}):`, error);
    throw error;
  }
}

/**
 * Fetch risk management assessment for a company by ISIN
 */
export async function fetchRiskManagement(isin: string): Promise<RiskManagementData> {
  try {
    console.log(`Fetching risk management for ISIN: ${isin}`);
    
    // Use new ISIN-based endpoint: GET /api/company/isin/{ISIN}
    const response = await fetchWithRetry(
      `${RISK_MANAGEMENT_API}/api/company/isin/${isin}`,
      undefined,
      {
        maxRetries: 3,
        initialDelay: 1000,
        maxDelay: 10000,
      }
    );
    
    if (!response.ok) {
      // If 404, company not found in the system
      if (response.status === 404) {
        console.warn(`Company not found for ISIN: ${isin}`);
        // Return empty structure for companies not in the system
        return {
          company: {
            id: 0,
            name: '',
            isin: isin,
            sector: '',
            totalScore: null,
            analysisStatus: 'idle',
            summary: null,
          },
          documents: [],
          measureScores: [],
        };
      }
      throw new Error(`Failed to fetch risk management: ${response.statusText}`);
    }
    
    const data = await response.json() as any;
    
    // Check if response contains error message
    if (data.message) {
      console.warn(`API message for ${isin}: ${data.message}`);
      return {
        company: {
          id: 0,
          name: '',
          isin: isin,
          sector: '',
          totalScore: null,
          analysisStatus: 'idle',
          summary: null,
        },
        documents: [],
        measureScores: [],
      };
    }
    
    return data as RiskManagementData;
  } catch (error) {
    console.error(`Error fetching risk management for ${isin}:`, error);
    throw error;
  }
}

/**
 * Batch fetch geographic risks for multiple assets
 */
export async function batchFetchGeographicRisks(
  assets: Array<{ latitude: number; longitude: number; assetValue: number }>
): Promise<GeographicRiskData[]> {
  try {
    // Make individual requests (can be optimized with batch endpoint if available)
    const promises = assets.map(asset =>
      fetchGeographicRisk(asset.latitude, asset.longitude, asset.assetValue)
    );
    
    return await Promise.all(promises);
  } catch (error) {
    console.error('Error in batch fetch geographic risks:', error);
    throw error;
  }
}

/**
 * Get all companies from Asset Discovery API
 */
export async function fetchAllCompanies(): Promise<Array<{
  company_name: string;
  total_assets: number;
  assets_with_coordinates: number;
  geocoding_percentage: string;
}>> {
  try {
    // Use retry logic to handle API hibernation (502/504 errors)
    const response = await fetchWithRetry(`${ASSET_DISCOVERY_API}/assets.getCompanies`, undefined, {
      maxRetries: 5,
      initialDelay: 2000,
      maxDelay: 30000,
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch companies: ${response.statusText}`);
    }
    
    const data = await response.json();
    // @ts-ignore
    const result = data?.result?.data?.json;
    
    return result?.companies || [];
  } catch (error) {
    console.error('Error fetching all companies:', error);
    throw error;
  }
}

