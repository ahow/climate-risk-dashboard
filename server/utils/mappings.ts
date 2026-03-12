export const ISIN_PREFIX_TO_ISO3: Record<string, string> = {
  US: "USA", GB: "GBR", DE: "DEU", JP: "JPN", FR: "FRA",
  CN: "CHN", AU: "AUS", BR: "BRA", IN: "IND", CH: "CHE",
  CA: "CAN", KR: "KOR", IT: "ITA", ES: "ESP", NL: "NLD",
  SE: "SWE", NO: "NOR", DK: "DNK", FI: "FIN", BE: "BEL",
  AT: "AUT", IE: "IRL", PT: "PRT", SG: "SGP", HK: "HKG",
  TW: "TWN", ZA: "ZAF", MX: "MEX", RU: "RUS", SA: "SAU",
  AE: "ARE", TH: "THA", MY: "MYS", ID: "IDN", PH: "PHL",
  VN: "VNM", PL: "POL", CZ: "CZE", GR: "GRC", TR: "TUR",
  IL: "ISR", CL: "CHL", CO: "COL", PE: "PER", AR: "ARG",
  NZ: "NZL", QA: "QAT", KW: "KWT", BH: "BHR", EG: "EGY",
  NG: "NGA", KE: "KEN", LU: "LUX", JE: "JEY", GG: "GGY",
  BM: "BMU", KY: "CYM", VG: "VGB", PA: "PAN",
};

export function isinToIso3(isin: string): string | null {
  const prefix = isin.substring(0, 2).toUpperCase();
  return ISIN_PREFIX_TO_ISO3[prefix] || null;
}

const COUNTRY_NAME_TO_ISO3: Record<string, string> = {
  "united states": "USA", "usa": "USA", "us": "USA",
  "united kingdom": "GBR", "uk": "GBR",
  "germany": "DEU", "japan": "JPN", "france": "FRA",
  "china": "CHN", "australia": "AUS", "brazil": "BRA",
  "india": "IND", "switzerland": "CHE", "canada": "CAN",
  "south korea": "KOR", "korea": "KOR",
  "italy": "ITA", "spain": "ESP", "netherlands": "NLD",
  "sweden": "SWE", "norway": "NOR", "denmark": "DNK",
  "finland": "FIN", "belgium": "BEL", "austria": "AUT",
  "ireland": "IRL", "portugal": "PRT", "singapore": "SGP",
  "hong kong": "CHN", "taiwan": "TWN",
  "south africa": "ZAF", "mexico": "MEX", "russia": "RUS",
  "saudi arabia": "SAU", "uae": "ARE", "united arab emirates": "ARE",
  "thailand": "THA", "malaysia": "MYS", "indonesia": "IDN",
  "philippines": "PHL", "vietnam": "VNM",
  "poland": "POL", "czech republic": "CZE", "czechia": "CZE",
  "greece": "GRC", "turkey": "TUR", "türkiye": "TUR",
  "israel": "ISR", "chile": "CHL", "colombia": "COL",
  "peru": "PER", "argentina": "ARG", "new zealand": "NZL",
  "qatar": "QAT", "kuwait": "KWT", "bahrain": "BHR",
  "egypt": "EGY", "nigeria": "NGA", "kenya": "KEN",
  "luxembourg": "LUX", "bermuda": "USA", "cayman islands": "USA",
  "panama": "PAN",
};

export function countryNameToIso3(country: string | null | undefined): string | null {
  if (!country) return null;
  return COUNTRY_NAME_TO_ISO3[country.toLowerCase().trim()] || null;
}

const SC_API_UNSUPPORTED: Set<string> = new Set(["BMU", "CYM", "HKG", "KWT", "VGB", "JEY", "GGY", "BHR"]);

const SC_API_FALLBACK: Record<string, string> = {
  HKG: "CHN",
  BMU: "USA",
  CYM: "USA",
  VGB: "GBR",
  JEY: "GBR",
  GGY: "GBR",
  KWT: "SAU",
  BHR: "SAU",
};

export function resolveSupplyChainCountry(
  isin: string,
  countryIso3: string | null | undefined,
  countryName: string | null | undefined
): string {
  const isinIso3 = countryIso3 || isinToIso3(isin);
  if (isinIso3 && !SC_API_UNSUPPORTED.has(isinIso3)) {
    return isinIso3;
  }
  const fromName = countryNameToIso3(countryName);
  if (fromName && !SC_API_UNSUPPORTED.has(fromName)) {
    return fromName;
  }
  if (isinIso3 && SC_API_FALLBACK[isinIso3]) {
    return SC_API_FALLBACK[isinIso3];
  }
  return "USA";
}

export const SECTOR_TO_ISIC: Record<string, string> = {
  "Energy": "B06",
  "Materials": "B07-B08",
  "Industrials": "C28",
  "Consumer Discretionary": "G47",
  "Consumer Discretionary (Automotive & Energy)": "C29",
  "Consumer Staples": "C10-C12",
  "Health Care": "C21",
  "Healthcare": "C21",
  "Financials": "K64",
  "Information Technology": "C26",
  "Technology": "C26",
  "Communication Services": "J61",
  "Telecommunications": "J61",
  "Utilities": "D35",
  "Real Estate": "L68",
  "Mining": "B06",
  "Oil & Gas": "B06",
  "Chemicals": "C20",
  "Pharmaceuticals": "C21",
  "Automotive": "C29",
  "Aerospace & Defense": "C30",
  "Construction": "F",
  "Transportation": "H49",
  "Transportation & Infrastructure": "H49",
  "Insurance": "K65",
  "Banking": "K64",
  "Media": "J58-J60",
  "Entertainment/Media": "J58-J60",
  "Retail": "G47",
  "Food & Beverage": "C10-C12",
  "Agriculture": "A01",
  "Conglomerate": "G47",
  "Consumer Cyclicals": "G47",
  "Travel & Leisure": "I55",
};

export function sectorToIsic(sector: string | null | undefined): string {
  if (!sector) return "M";
  for (const [key, value] of Object.entries(SECTOR_TO_ISIC)) {
    if (sector.toLowerCase().includes(key.toLowerCase())) {
      return value;
    }
  }
  return "M";
}
