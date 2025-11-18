/**
 * External API Integration Services
 * Handles communication with Asset Discovery, Geographic Risks, and Risk Management APIs
 */

import { fetchWithRetry } from '../utils/retry';

const ASSET_DISCOVERY_API = "https://3000-ibweqg4u19d6b2l6kv5ro-ee585d51.manusvm.computer/api/trpc";
const GEOGRAPHIC_RISKS_API = "http://167.71.187.110";
const RISK_MANAGEMENT_API = "https://8000-iwnb9mmlojeywebr41d8n-96f6004a.manusvm.computer";

export interface AssetData {
  asset_name: string;
  company_name: string;
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

export interface RiskManagementData {
  summary: {
    company_name: string;
    isin: string;
    assessment_date: string;
    score_percentage: number;
    total_score: number;
    max_possible_score: number;
    average_score: number;
    total_measures: number;
    measures_with_evidence: number;
    evidence_coverage: number;
    total_quotes: number;
    high_confidence_count: number;
    medium_confidence_count: number;
    low_confidence_count: number;
  };
  category_breakdown: any[];
  measures: Array<{
    measure_id: string;
    measure_name: string;
    category: string;
    score: number;
    confidence: string;
    rationale: string;
    evidence: Array<{
      verbatim_quote: string;
      source_url: string;
      source_page: string;
      source_doc_title: string;
    }>;
    data_fields: Record<string, any>;
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
    return result.assets;
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
    
    return result.assets;
  } catch (error) {
    console.error(`Error fetching assets for ${companyName}:`, error);
    throw error;
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
    
    // Use retry logic to handle API hibernation and temporary failures
    const response = await fetchWithRetry(
      `${RISK_MANAGEMENT_API}/assessment/${isin}`,
      undefined,
      {
        maxRetries: 5, // More retries for hibernation wake-up
        initialDelay: 2000, // Start with 2 seconds
        maxDelay: 30000, // Max 30 seconds between retries
      }
    );
    if (!response.ok) {
      // If 404, the company may not be in the assessed list
      if (response.status === 404) {
        console.warn(`No risk management assessment found for ISIN: ${isin}`);
        return {
          summary: {
            company_name: '',
            isin: isin,
            assessment_date: new Date().toISOString(),
            score_percentage: 0,
            total_score: 0,
            max_possible_score: 0,
            average_score: 0,
            total_measures: 0,
            measures_with_evidence: 0,
            evidence_coverage: 0,
            total_quotes: 0,
            high_confidence_count: 0,
            medium_confidence_count: 0,
            low_confidence_count: 0,
          },
          measures: [],
          category_breakdown: [],
        };
      }
      throw new Error(`Failed to fetch risk management: ${response.statusText}`);
    }
    
    return await response.json() as any;
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

