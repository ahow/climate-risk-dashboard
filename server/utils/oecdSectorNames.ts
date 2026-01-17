/**
 * OECD ICIO Sector Code to Full Sector Name Mapping
 * Used to display human-readable sector names in the dashboard
 * Source: OECD ICIO classification system
 */

export const OECD_SECTOR_NAMES: Record<string, string> = {
  // Agriculture, forestry and fishing
  'A': 'Agriculture, forestry and fishing',
  'B01': 'Agriculture, hunting and related service activities',
  'B02': 'Forestry, logging and related service activities',
  'B03': 'Fishing and aquaculture',
  
  // Mining and quarrying
  'B': 'Mining and quarrying',
  'B05': 'Mining of coal and lignite',
  'B06': 'Extraction of crude petroleum and natural gas',
  'B07': 'Mining of metal ores',
  'B08': 'Other mining and quarrying',
  'B09': 'Mining support service activities',
  
  // Manufacturing
  'C': 'Manufacturing',
  'C10T12': 'Food products, beverages and tobacco',
  'C13T15': 'Textiles, wearing apparel, leather and related products',
  'C16': 'Wood and products of wood and cork',
  'C17': 'Paper and paper products',
  'C18': 'Printing and reproduction of recorded media',
  'C19': 'Coke and refined petroleum products',
  'C20': 'Chemicals and chemical products',
  'C21': 'Pharmaceuticals, medicinal chemical and botanical products',
  'C22': 'Rubber and plastics products',
  'C23': 'Other non-metallic mineral products',
  'C24': 'Basic metals',
  'C24A': 'Basic iron and steel',
  'C24B': 'Basic precious and other non-ferrous metals',
  'C25': 'Fabricated metal products',
  'C26': 'Computer, electronic and optical products',
  'C27': 'Electrical equipment',
  'C28': 'Machinery and equipment n.e.c.',
  'C29': 'Motor vehicles, trailers and semi-trailers',
  'C30': 'Other transport equipment',
  'C302T309': 'Other transport equipment (excl. motor vehicles)',
  'C31T32': 'Furniture; other manufacturing',
  'C33': 'Repair and installation of machinery and equipment',
  
  // Utilities
  'D': 'Electricity, gas, steam and air conditioning supply',
  'E': 'Water supply; sewerage, waste management',
  'E36': 'Water collection, treatment and supply',
  'E37T39': 'Sewerage; waste collection, treatment and disposal',
  
  // Construction
  'F': 'Construction',
  
  // Wholesale and retail trade
  'G': 'Wholesale and retail trade',
  'G45': 'Wholesale and retail trade of motor vehicles',
  'G46': 'Wholesale trade, except of motor vehicles',
  'G47': 'Retail trade, except of motor vehicles',
  
  // Transportation and storage
  'H': 'Transportation and storage',
  'H49': 'Land transport and transport via pipelines',
  'H50': 'Water transport',
  'H51': 'Air transport',
  'H52': 'Warehousing and support activities for transportation',
  'H53': 'Postal and courier activities',
  
  // Accommodation and food service
  'I': 'Accommodation and food service activities',
  
  // Information and communication
  'J': 'Information and communication',
  'J58': 'Publishing activities',
  'J59_60': 'Motion picture, video, television programme production',
  'J61': 'Telecommunications',
  'J62_63': 'Computer programming, consultancy and information service',
  
  // Financial and insurance
  'K': 'Financial and insurance activities',
  'K64': 'Financial service activities, except insurance',
  'K65': 'Insurance, reinsurance and pension funding',
  'K66': 'Activities auxiliary to financial services',
  
  // Real estate
  'L': 'Real estate activities',
  'L68': 'Real estate activities',
  
  // Professional, scientific and technical
  'M': 'Professional, scientific and technical activities',
  'M69_70': 'Legal and accounting activities; management consultancy',
  'M71': 'Architectural and engineering activities; technical testing',
  'M72': 'Scientific research and development',
  'M73': 'Advertising and market research',
  'M74_75': 'Other professional, scientific and technical activities',
  
  // Administrative and support services
  'N': 'Administrative and support service activities',
  'N77': 'Rental and leasing activities',
  'N78': 'Employment activities',
  'N79': 'Travel agency, tour operator and other reservation service',
  'N80T82': 'Security and investigation, service and landscape, office admin',
  
  // Public administration
  'O': 'Public administration and defence; compulsory social security',
  
  // Education
  'P': 'Education',
  
  // Human health and social work
  'Q': 'Human health and social work activities',
  'Q86': 'Human health activities',
  'Q87_88': 'Residential care and social work activities',
  
  // Arts, entertainment and recreation
  'R': 'Arts, entertainment and recreation',
  'R90T92': 'Creative, arts and entertainment; libraries, museums',
  'R93': 'Sports activities and amusement and recreation activities',
  
  // Other services
  'S': 'Other service activities',
  'S94': 'Activities of membership organisations',
  'S95': 'Repair of computers and personal and household goods',
  'S96': 'Other personal service activities',
  
  // Households
  'T': 'Activities of households as employers',
  
  // Extraterritorial organizations
  'U': 'Activities of extraterritorial organizations and bodies',
};

/**
 * Get full sector name from OECD sector code
 * Returns the code itself if no mapping is found
 */
export function getOECDSectorName(code: string): string {
  return OECD_SECTOR_NAMES[code] || code;
}
