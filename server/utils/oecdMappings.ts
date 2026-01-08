/**
 * Mappings between company data and OECD ICIO classifications
 * Used for Supply Chain Risk API integration
 */

import { COMPREHENSIVE_SECTOR_MAPPING, getOECDSectorCode as getComprehensiveSectorCode } from '../services/comprehensiveSectorMapping';

/**
 * Map company country names to OECD 3-letter country codes
 */
export const COUNTRY_TO_OECD: Record<string, string> = {
  // North America
  "UNITED STATES": "USA",
  "USA": "USA",
  "US": "USA",
  "CANADA": "CAN",
  "MEXICO": "MEX",
  
  // Europe
  "FRANCE": "FRA",
  "GERMANY": "DEU",
  "UNITED KINGDOM": "GBR",
  "UK": "GBR",
  "ITALY": "ITA",
  "SPAIN": "ESP",
  "NETHERLANDS": "NLD",
  "BELGIUM": "BEL",
  "SWITZERLAND": "CHE",
  "AUSTRIA": "AUT",
  "SWEDEN": "SWE",
  "NORWAY": "NOR",
  "DENMARK": "DNK",
  "FINLAND": "FIN",
  "POLAND": "POL",
  "CZECH REPUBLIC": "CZE",
  "IRELAND": "IRL",
  "PORTUGAL": "PRT",
  "GREECE": "GRC",
  
  // Asia-Pacific
  "CHINA": "CHN",
  "JAPAN": "JPN",
  "SOUTH KOREA": "KOR",
  "KOREA": "KOR",
  "INDIA": "IND",
  "AUSTRALIA": "AUS",
  "NEW ZEALAND": "NZL",
  "SINGAPORE": "SGP",
  "HONG KONG": "HKG",
  "TAIWAN": "TWN",
  "INDONESIA": "IDN",
  "MALAYSIA": "MYS",
  "THAILAND": "THA",
  "PHILIPPINES": "PHL",
  "VIETNAM": "VNM",
  
  // Other
  "BRAZIL": "BRA",
  "ARGENTINA": "ARG",
  "CHILE": "CHL",
  "COLOMBIA": "COL",
  "SOUTH AFRICA": "ZAF",
  "ISRAEL": "ISR",
  "SAUDI ARABIA": "SAU",
  "TURKEY": "TUR",
  "RUSSIA": "RUS",
};

/**
 * Get OECD country code from company geography
 */
export function getOECDCountryCode(geography: string | null | undefined): string {
  if (!geography) return "USA"; // Default fallback
  
  const normalized = geography.toUpperCase().trim();
  return COUNTRY_TO_OECD[normalized] || "USA";
}

/**
 * Get OECD sector code from company industry
 * Now uses comprehensive MSCI Level 4 industry mapping (219 industries → 45 OECD codes)
 */
export function getOECDSectorCode(industry: string | null | undefined): string {
  if (!industry) return "M"; // Default to Professional, scientific and technical activities
  
  const normalized = industry.trim();
  
  // Try exact match with comprehensive mapping
  const exactMatch = getComprehensiveSectorCode(normalized);
  if (exactMatch) {
    return exactMatch;
  }
  
  // Try case-insensitive match
  const lowerIndustry = normalized.toLowerCase();
  for (const [key, value] of Object.entries(COMPREHENSIVE_SECTOR_MAPPING)) {
    if (key.toLowerCase() === lowerIndustry) {
      return value;
    }
  }
  
  // Try partial match (industry name contains mapping key or vice versa)
  for (const [key, value] of Object.entries(COMPREHENSIVE_SECTOR_MAPPING)) {
    const lowerKey = key.toLowerCase();
    if (lowerIndustry.includes(lowerKey) || lowerKey.includes(lowerIndustry)) {
      return value;
    }
  }
  
  // Default fallback
  console.warn(`No OECD sector mapping found for industry: ${industry}`);
  return "M"; // Professional, scientific and technical activities
}

/**
 * Calculate present value using 10% annual discount rate over 30 years
 * PV = Annual Loss × [(1 - (1 + r)^-n) / r]
 * where r = 0.10, n = 30
 */
export function calculatePresentValue(annualLoss: number): number {
  const discountRate = 0.10;
  const years = 30;
  
  // Present value of annuity formula
  const pvFactor = (1 - Math.pow(1 + discountRate, -years)) / discountRate;
  return annualLoss * pvFactor;
}

/**
 * Calculate net expected loss adjustment factor based on management score
 * 100% score → 30% of total risk (0.30 factor)
 * 0% score → 100% of total risk (1.00 factor)
 * Linear interpolation between these points
 */
export function getManagementAdjustmentFactor(managementScorePct: number): number {
  // Clamp score between 0 and 100
  const score = Math.max(0, Math.min(100, managementScorePct));
  
  // Linear interpolation: factor = 1.0 - (0.7 * score / 100)
  // At score=0: factor = 1.0 (no reduction)
  // At score=100: factor = 0.3 (70% reduction)
  return 1.0 - (0.7 * score / 100);
}
