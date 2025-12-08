/**
 * Mappings between company data and OECD ICIO classifications
 * Used for Supply Chain Risk API integration
 */

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
 * Map company sector names to OECD ICIO sector codes
 * Based on LEVEL2 SECTOR NAME from the spreadsheet
 */
export const SECTOR_TO_OECD: Record<string, string> = {
  // Primary sectors
  "Agriculture": "A01", // Crop and animal production
  "Mining": "B07", // Mining of metal ores
  "Oil & Gas": "B06", // Extraction of crude petroleum and natural gas
  "Energy": "D", // Electricity, gas, steam and air conditioning
  
  // Manufacturing
  "Industrials": "C28", // Machinery and equipment n.e.c.
  "Consumer Discretion": "C29", // Motor vehicles
  "Consumer Staples": "C10T12", // Food products, beverages and tobacco
  "Health Care": "C21", // Pharmaceuticals
  "Technology": "C26", // Computer, electronic and optical products
  "Materials": "C20", // Chemicals and chemical products
  "Chemicals": "C20", // Chemicals and chemical products
  
  // Services
  "Utilities": "D", // Electricity, gas, steam and air conditioning
  "Telecommunications": "J61", // Telecommunications
  "Financials": "K", // Financial and insurance activities
  "Real Estate": "L", // Real estate activities
  "Consumer Services": "I", // Accommodation and food services
  "Business Services": "M", // Professional, scientific and technical activities
  
  // Default fallback
  "Other": "M", // Professional, scientific and technical activities
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
 * Get OECD sector code from company sector
 */
export function getOECDSectorCode(sector: string | null | undefined): string {
  if (!sector) return "D69T82"; // Default to Other business services
  
  const normalized = sector.trim();
  
  // Try exact match first
  if (SECTOR_TO_OECD[normalized]) {
    return SECTOR_TO_OECD[normalized];
  }
  
  // Try partial match
  for (const [key, value] of Object.entries(SECTOR_TO_OECD)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return value;
    }
  }
  
  // Default fallback
  return "D69T82";
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

