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
  "panama": "PAN", "hungary": "HUN", "romania": "ROU",
  "jordan": "JOR", "pakistan": "PAK", "bangladesh": "BGD",
  "sri lanka": "LKA", "myanmar": "MMR", "cambodia": "KHM",
  "morocco": "MAR", "tunisia": "TUN", "ghana": "GHA",
  "tanzania": "TZA", "uganda": "UGA", "ethiopia": "ETH",
  "macau": "CHN", "puerto rico": "USA",
  "czech": "CZE", "not specified": "USA",
};

export function countryNameToIso3(country: string | null | undefined): string | null {
  if (!country) return null;
  return COUNTRY_NAME_TO_ISO3[country.toLowerCase().trim()] || null;
}

const ISIN_PREFIX_TO_COUNTRY_NAME: Record<string, string> = {
  US: "United States", GB: "United Kingdom", DE: "Germany", JP: "Japan",
  FR: "France", CN: "China", AU: "Australia", BR: "Brazil", IN: "India",
  CH: "Switzerland", CA: "Canada", KR: "South Korea", IT: "Italy",
  ES: "Spain", NL: "Netherlands", SE: "Sweden", NO: "Norway", DK: "Denmark",
  FI: "Finland", BE: "Belgium", AT: "Austria", IE: "Ireland", PT: "Portugal",
  SG: "Singapore", HK: "Hong Kong", TW: "Taiwan", ZA: "South Africa",
  MX: "Mexico", SA: "Saudi Arabia", AE: "United Arab Emirates", TH: "Thailand",
  MY: "Malaysia", ID: "Indonesia", PH: "Philippines", PL: "Poland",
  CZ: "Czech Republic", GR: "Greece", TR: "Turkey", IL: "Israel",
  CL: "Chile", CO: "Colombia", PE: "Peru", AR: "Argentina", NZ: "New Zealand",
  QA: "Qatar", EG: "Egypt", LU: "Luxembourg", HU: "Hungary", RO: "Romania",
};

const OFFSHORE_ISIN_PREFIXES = new Set(["KY", "BM", "VG", "JE", "GG", "PA"]);

function normalizeCountryName(name: string): string {
  const lower = name.toLowerCase().trim();
  for (const entry of Object.values(ISIN_PREFIX_TO_COUNTRY_NAME)) {
    if (entry.toLowerCase() === lower) return entry;
  }
  return name.trim().replace(/\b\w/g, c => c.toUpperCase());
}

export function validateCountryFromIsin(isin: string, country: string | null | undefined): string | null {
  if (!country) return null;
  const prefix = isin.substring(0, 2).toUpperCase();
  const normalized = normalizeCountryName(country);

  if (normalized === "Usa") return "United States";
  if (country.trim() === "USA") return "United States";

  if (OFFSHORE_ISIN_PREFIXES.has(prefix)) return normalized;

  const expectedCountry = ISIN_PREFIX_TO_COUNTRY_NAME[prefix];
  if (!expectedCountry) return normalized;

  if (normalized.toLowerCase() === expectedCountry.toLowerCase()) return expectedCountry;

  console.log(`[country] Corrected country for ${isin}: "${normalized}" -> "${expectedCountry}" (from ISIN prefix)`);
  return expectedCountry;
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
  const fromName = countryNameToIso3(countryName);
  if (fromName && !SC_API_UNSUPPORTED.has(fromName)) {
    return fromName;
  }
  const isinIso3 = countryIso3 || isinToIso3(isin);
  if (isinIso3 && !SC_API_UNSUPPORTED.has(isinIso3)) {
    return isinIso3;
  }
  if (fromName && SC_API_FALLBACK[fromName]) {
    return SC_API_FALLBACK[fromName];
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
  "Automobiles": "C29",
  "Automobiles & Parts": "C29",
  "Aerospace & Defense": "C30",
  "Aerospace and Defense": "C30",
  "Aerospace & Defence": "C30",
  "Aerospace and Defence": "C30",
  "Construction": "F",
  "Construction & Materials": "F",
  "Transportation": "H49",
  "Transportation & Infrastructure": "H49",
  "Transportation/Infrastructure": "H49",
  "Transportation Infrastructure": "H49",
  "Infrastructure/Transportation": "H49",
  "Airlines/Transportation": "H51",
  "Airlines": "H51",
  "Logistics": "H52",
  "Logistics & Transportation": "H52",
  "Insurance": "K65",
  "Banking": "K64",
  "Financial Services": "K64",
  "Financial Technology": "K64",
  "Financial Technology (Fintech)": "K64",
  "Financial Technology (FinTech)": "K64",
  "FinTech": "K64",
  "Financial Data & Analytics": "K66",
  "Media": "J58",
  "Entertainment/Media": "J58",
  "Media & Entertainment": "J58",
  "Entertainment": "J58",
  "Retail": "G47",
  "Food & Beverage": "C10-C12",
  "Food Products": "C10-C12",
  "Agribusiness & Food": "A01",
  "Agriculture": "A01",
  "Agricultural Chemicals": "C20",
  "Conglomerate": "G46",
  "Conglomerate (Diversified)": "G46",
  "Conglomerate/General Trading": "G46",
  "Conglomerate (Holding Companies)": "K64",
  "Conglomerate (Integrated Trading and Investment)": "G46",
  "Conglomerate (Energy, Petrochemicals, Retail, Telecommunications, Digital Services)": "C19",
  "Conglomerate (Financial Services, Manufacturing, Resources, Real Estate, Engineering)": "G46",
  "Consumer Cyclicals": "G47",
  "Consumer Cyclical": "G47",
  "Travel & Leisure": "I",
  "Travel and Leisure": "I",
  "Leisure & Hospitality": "I",
  "Hospitality": "I",
  "Consumer Healthcare": "C21",
  "Healthcare Technology": "C26",
  "Healthcare/Technology": "C26",
  "Transportation and Transportation Infrastructure": "H49",
  "Basic Materials": "B07-B08",
  "Basic Resources": "B07-B08",
  "Basic Resources / Metals & Mining": "B07-B08",
  "Natural Resources and Energy": "B06",
  "Petrochemicals": "C19",
  "Energy and Chemicals": "C19",
  "Energy & Industrials": "B06",
  "Energy Technology": "B06",
  "Industrial Goods & Services": "C28",
  "Consumer Goods": "C22",
  "Consumer Products & Services": "C22",
  "Consumer Services": "N",
  "Business Services": "N",
  "Professional Services": "M",
  "Business Process Outsourcing (BPO) / Professional Services": "M",
  "Information Services": "J58",
  "Infrastructure": "H49",
  "Infrastructure Investment": "H49",
  "Infrastructure/Real Estate": "L68",
  "Infrastructure/Industrials": "H49",
  "Real Estate Investment Trust (REIT) - Communications Infrastructure": "L68",
  "Real Estate Management & Services": "L68",
  "Real Estate and Construction": "F",
  "Personal Care, Drug & Grocery Stores": "G47",
  "Telecommunication Services": "J61",
  "Trading Companies / Industrials": "G46",
  "Manufacturing": "C28",
  "Technology/Industrials": "C26",
  "Financials (Investment Holding)": "K64",
};

const L4_TO_ISIC: Record<string, string> = {
  "Aerospace & Defense": "C30",
  "Aerospace & Defence": "C30",
  "Ind. Transportation": "H49",
  "Construction & Mats": "F",
  "Elec. & Electrical Eq": "C27",
  "General Industrials": "C28",
  "Ind. Engineering": "C28",
  "Ind. Support Services": "N",
  "Travel & Leisure": "I",
  "Waste & Disposal Svs": "N",
  "Alternative Energy": "D35",
  "Automobiles & Parts": "C29",
  "Chemicals": "C20",
  "Hhold Gds & Home Con.": "C22",
  "Ind. Metals & Mining": "C24",
  "Medical Eq. Services": "C26",
  "Tech. Hardware, Equip": "C26",
  "Consumer Svs: Misc.": "N",
  "Oil, Gas and Coal": "B06",
  "Oil Refining & Mkting": "C19",
  "Integrated Oil & Gas": "B06",
  "Oil: Crude Producers": "B06",
  "Renewable Energy Eq.": "D35",
  "Alternative Fuels": "D35",
  "Coal": "B05",
  "Pipelines": "H49",
  "Oil Equipment & Svs": "B06",
  "Offshore Drill & Svs": "B06",
  "Beverages": "C10-C12",
  "Food Producers": "C10-C12",
  "Tobacco": "C10-C12",
  "Drug & Grocery Stores": "G47",
  "Banks": "K64",
  "Inv. Banking & Broker": "K66",
  "Non-life Insurance": "K65",
  "Life Insurance": "K65",
  "Finance & Credit Svs": "K64",
  "Closed End Invest.": "K64",
  "Mortgage REITs": "L68",
  "Real Estate Inv & Svs": "L68",
  "REITs": "L68",
  "Software & Comp. Svs.": "C26",
  "Tech. Hardware, Equip": "C26",
  "Telecom. Equipment": "C26",
  "Telecom. Svs. Prvds.": "J61",
  "Personal Goods": "G47",
  "Retailers": "G47",
  "Consumer Services": "N",
  "Electricity": "D35",
  "Gas, Water & Mul Util": "D35",
  "Health Care Providers": "Q",
  "Industrial Materials": "C24",
  "Leisure Goods": "C22",
  "Media": "J58",
  "Pharm. & Biotech": "C21",
  "Prec. Metals & Mining": "B07-B08",
};

const AUTO_KEYWORDS = [
  "motor", "motors", "automobile", "automotive", "auto ", "autos",
  "car ", "cars ", "vehicle", "bmw", "honda", "nissan", "suzuki",
  "toyota", "hyundai", "kia", "ford", "ferrari", "porsche",
  "mercedes", "volkswagen", "volvo", "mazda", "subaru",
  "mitsubishi motor", "mahindra", "tata motor", "maruti",
  "bajaj auto", "hero moto", "yamaha motor", "yadea",
  "motocorp", "motoren", "otomotiv",
];

const AUTO_PARTS_KEYWORDS = [
  "magna international", "michelin", "fuyao glass", "lkq ",
  "continental ag", "shimano", "tire", "tyre", "bridgestone",
  "denso", "aisin", "tuopu", "auto parts", "autozone",
  "o'reilly auto",
];

const HOTEL_RESTAURANT_KEYWORDS = [
  "hotel", "hotels", "marriott", "hilton", "hyatt", "accor",
  "intercontinental", "whitbread", "mcdonald", "chipotle",
  "darden", "restaurant", "restaurants", "starbucks",
  "yum brands", "domino", "wingstop",
  "minor international", "galaxy entertainment",
  "oriental land", "flutter entertainment",
  "lottery", "gaming", "casino",
];

const HOMEBUILDER_KEYWORDS = [
  "barratt", "redrow", "pultegroup", "nvr, inc", "nvr inc",
  "sekisui house", "lennar", "d.r. horton", "toll brothers",
  "meritage", "homebuilder", "home builder",
];

const APPLIANCE_KEYWORDS = [
  "haier", "midea", "electrolux", "whirlpool", "bsh ",
  "home product center",
];

const ISIC_DESCRIPTIONS: Record<string, string[]> = {
  "A01": ["crop", "animal", "agriculture", "farming", "livestock", "agribusiness", "plantation", "dairy"],
  "A02": ["forestry", "logging", "timber", "wood", "pulp"],
  "A03": ["fishing", "aquaculture", "seafood", "fish"],
  "B05": ["coal", "lignite", "mining coal"],
  "B06": ["oil", "gas", "petroleum", "crude", "drilling", "quarrying", "mining", "energy extraction", "natural gas", "upstream"],
  "B07-B08": ["metal ore", "iron ore", "copper", "gold", "silver", "zinc", "nickel", "rare earth", "bauxite", "mining metal", "mineral", "basic resources", "precious metals"],
  "C10-C12": ["food", "beverage", "tobacco", "brewery", "distillery", "snack", "dairy product", "meat", "bakery", "confectionery", "soft drink", "wine", "beer", "spirits"],
  "C16": ["wood product", "lumber", "sawmill", "plywood", "veneer"],
  "C19": ["petroleum refining", "coke", "petrochemical", "refinery", "bitumen", "fuel"],
  "C20": ["chemical", "fertilizer", "pesticide", "specialty chemical", "industrial gas", "adhesive", "paint", "coating", "agrochemical"],
  "C21": ["pharmaceutical", "biotech", "drug", "medicine", "vaccine", "therapeutic", "health care", "healthcare", "medical", "hospital", "clinic", "diagnostics"],
  "C22": ["rubber", "plastic", "polymer", "packaging", "consumer goods", "household", "appliance small", "consumer product"],
  "C23": ["glass", "ceramic", "cement", "concrete", "brick", "stone", "non-metallic mineral", "building material"],
  "C24": ["steel", "aluminum", "aluminium", "smelting", "basic metal", "iron", "alloy", "foundry", "metallurgy"],
  "C25": ["fabricated metal", "metalwork", "structural metal", "tank", "boiler", "cutlery", "tool"],
  "C26": ["electronic", "semiconductor", "computer", "software", "technology", "it services", "information technology", "tech hardware", "instrument", "optical", "data processing", "cloud computing", "saas"],
  "C27": ["electrical equipment", "battery", "cable", "wiring", "lighting", "electrical component", "motor electric", "generator", "transformer", "appliance"],
  "C28": ["machinery", "industrial equipment", "engine", "turbine", "pump", "compressor", "general industrial", "conglomerate", "diversified industrial"],
  "C29": ["motor vehicle", "automobile", "automotive", "car manufacturer", "truck", "bus", "auto part", "vehicle", "tire", "tyre"],
  "C30": ["aerospace", "defense", "defence", "aircraft", "ship", "shipbuilding", "railway vehicle", "military", "spacecraft", "transport equipment"],
  "D35": ["electricity", "utility", "power generation", "renewable energy", "solar", "wind", "nuclear", "gas distribution", "steam", "alternative energy"],
  "F": ["construction", "building", "civil engineering", "contractor", "real estate development", "homebuilder", "infrastructure construction"],
  "G45": ["motor vehicle trade", "car dealer", "auto dealer", "vehicle sale", "motorcycle sale"],
  "G46": ["wholesale", "trading company", "general trading", "import export", "commodity trading", "distribution"],
  "G47": ["retail", "store", "shop", "supermarket", "grocery", "e-commerce", "online retail", "department store", "consumer discretionary"],
  "H49": ["rail", "railroad", "road transport", "pipeline", "land transport", "freight", "logistics land", "trucking", "port", "transport infrastructure"],
  "H50": ["shipping", "water transport", "maritime", "container ship", "ferry", "marine"],
  "H51": ["airline", "air transport", "aviation", "airport", "air freight", "air cargo"],
  "H52": ["warehouse", "logistics", "supply chain", "freight forwarding", "cargo handling", "storage", "transport support"],
  "H53": ["postal", "courier", "delivery", "express delivery", "parcel", "mail"],
  "I": ["hotel", "restaurant", "accommodation", "food service", "hospitality", "catering", "resort", "gaming", "casino", "travel", "leisure", "entertainment venue"],
  "J58": ["publishing", "media", "entertainment", "broadcast", "game", "content", "music", "film", "information service"],
  "J61": ["telecom", "telecommunication", "mobile network", "internet provider", "broadband", "communication service", "5g", "wireless"],
  "K64": ["bank", "financial service", "lending", "credit", "investment management", "asset management", "fintech", "payment"],
  "K65": ["insurance", "reinsurance", "life insurance", "non-life insurance", "pension", "annuity"],
  "K66": ["brokerage", "securities", "stock exchange", "financial advisory", "fund management", "capital market", "auxiliary financial"],
  "L68": ["real estate", "property", "reit", "property management", "real estate investment"],
  "M": ["professional service", "consulting", "legal", "accounting", "architectural", "engineering service", "scientific", "research", "advisory"],
  "N": ["administrative", "support service", "security service", "cleaning", "temp agency", "staffing", "facility management", "waste", "outsourcing"],
  "O": ["public administration", "government", "defence public", "social security"],
  "P": ["education", "school", "university", "training"],
  "Q": ["health", "social work", "care home", "elderly care", "welfare"],
};

function fuzzyMatchIsic(sector: string): string {
  const inputLower = sector.toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim();
  const tokens = inputLower.split(/\s+/).filter(t => t.length > 2);

  let bestCode = "N";
  let bestScore = 0;

  for (const [code, keywords] of Object.entries(ISIC_DESCRIPTIONS)) {
    let score = 0;
    for (const kw of keywords) {
      const kwParts = kw.split(/\s+/);
      if (kwParts.length > 1) {
        if (inputLower.includes(kw)) {
          score += kwParts.length * 3;
        }
      } else {
        for (const token of tokens) {
          if (token === kw) {
            score += 3;
          } else if (token.length >= 4 && kw.length >= 4 && token.startsWith(kw.slice(0, 4))) {
            score += 1;
          }
        }
      }
    }
    const normalizedScore = keywords.length > 0 ? score / Math.sqrt(keywords.length) : 0;
    if (normalizedScore > bestScore) {
      bestScore = normalizedScore;
      bestCode = code;
    }
  }

  return bestCode;
}

function classifyByCompanyName(name: string): string | null {
  const lower = name.toLowerCase();

  for (const kw of AUTO_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) return "C29";
  }
  for (const kw of AUTO_PARTS_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) return "C29";
  }
  for (const kw of HOTEL_RESTAURANT_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) return "I";
  }
  for (const kw of HOMEBUILDER_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) return "F";
  }
  for (const kw of APPLIANCE_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) return "C27";
  }

  return null;
}

export function sectorToIsic(
  sector: string | null | undefined,
  l4Sector?: string | null,
  companyName?: string | null,
): string {
  if (l4Sector && l4Sector.trim() !== "NA") {
    const trimmed = l4Sector.trim();
    const l4Match = L4_TO_ISIC[trimmed];
    if (l4Match) return l4Match;
    for (const [key, value] of Object.entries(L4_TO_ISIC)) {
      if (key.toLowerCase() === trimmed.toLowerCase()) return value;
    }
    const l4Fuzzy = fuzzyMatchIsic(trimmed);
    L4_TO_ISIC[trimmed] = l4Fuzzy;
    console.log(`[ISIC] Auto-mapped L4 sector "${trimmed}" -> ${l4Fuzzy} (fuzzy match)`);
    return l4Fuzzy;
  }

  if (!sector) return "M";

  const sectorNorm = sector.toLowerCase().trim();
  if (
    companyName &&
    (sectorNorm.includes("consumer discretionary") || sectorNorm.includes("industrials"))
  ) {
    const nameMatch = classifyByCompanyName(companyName);
    if (nameMatch) return nameMatch;
  }

  const exact = SECTOR_TO_ISIC[sector];
  if (exact) return exact;

  const sectorLower = sector.toLowerCase();
  const sortedKeys = Object.keys(SECTOR_TO_ISIC).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (sectorLower.includes(key.toLowerCase())) {
      return SECTOR_TO_ISIC[key];
    }
  }

  const fuzzyMatch = fuzzyMatchIsic(sector);
  SECTOR_TO_ISIC[sector] = fuzzyMatch;
  console.log(`[ISIC] Auto-mapped sector "${sector}" -> ${fuzzyMatch} (fuzzy match)`);
  return fuzzyMatch;
}
