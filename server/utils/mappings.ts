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

export const SECTOR_TO_ISIC: Record<string, string> = {
  "Energy": "B06",
  "Materials": "B07-B08",
  "Industrials": "C28",
  "Consumer Discretionary": "G47",
  "Consumer Discretionary (Automotive & Energy)": "C29",
  "Consumer Staples": "C10-C12",
  "Health Care": "C21",
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
  "Insurance": "K65",
  "Banking": "K64",
  "Media": "J58-J60",
  "Retail": "G47",
  "Food & Beverage": "C10-C12",
  "Agriculture": "A01",
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
