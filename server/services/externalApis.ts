/**
 * External API Integration Services
 * Handles communication with Asset Discovery, Geographic Risks, and Risk Management APIs
 */

const ASSET_DISCOVERY_API = "https://3000-ibweqg4u19d6b2l6kv5ro-ee585d51.manusvm.computer/api/trpc";
const GEOGRAPHIC_RISKS_API = "https://5000-ie5oom8cn8x48wkgrn5wb-14f4b140.manusvm.computer";
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
  estimated_value_usd: number | null;
  description: string | null;
}

export interface GeographicRiskData {
  latitude: number;
  longitude: number;
  asset_value: number;
  risks: {
    [key: string]: {
      expected_annual_loss: number;
      risk_level: string;
      [key: string]: any;
    };
  };
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
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch assets: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Extract data from tRPC response format: result.data.json
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
    const response = await fetch(`${GEOGRAPHIC_RISKS_API}/api/assess`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        latitude,
        longitude,
        asset_value: assetValue,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch geographic risk: ${response.statusText}`);
    }

    return await response.json();
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
    
    const response = await fetch(`${RISK_MANAGEMENT_API}/assessment/${isin}`);
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
    
    return await response.json();
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
    const response = await fetch(`${ASSET_DISCOVERY_API}/assets.getCompanies`);
    if (!response.ok) {
      throw new Error(`Failed to fetch companies: ${response.statusText}`);
    }
    
    const data = await response.json();
    const result = data?.result?.data?.json;
    
    return result?.companies || [];
  } catch (error) {
    console.error('Error fetching all companies:', error);
    throw error;
  }
}

