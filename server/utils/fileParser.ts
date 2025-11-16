import { read, utils } from 'xlsx';

export interface CompanyData {
  isin: string;
  name: string;
  sector?: string;
  industry?: string;
  country?: string;
  tangibleAssets: number;
  enterpriseValue: number;
}

/**
 * Parse Excel or CSV file and extract company data
 * Supports both .xlsx and .csv formats
 */
export async function parseCompanyFile(fileBuffer: Buffer, filename: string): Promise<CompanyData[]> {
  try {
    // Read the file using xlsx library (supports both Excel and CSV)
    const workbook = read(fileBuffer, { type: 'buffer' });
    
    // Get the first sheet
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON
    const rows = utils.sheet_to_json<any>(worksheet, { header: 1 });
    
    if (rows.length < 2) {
      throw new Error('File must contain at least a header row and one data row');
    }
    
    // Get header row
    const headers = rows[0] as string[];
    
    // Find column indices
    const isinCol = headers.findIndex(h => 
      h && (h.toLowerCase() === 'type' || h.toLowerCase() === 'isin')
    );
    const nameCol = headers.findIndex(h => 
      h && (h.toLowerCase() === 'name' || h.toLowerCase().includes('company'))
    );
    const assetsCol = headers.findIndex(h => 
      h && (h.toLowerCase() === 'assets' || h.toLowerCase().includes('tangible'))
    );
    const evCol = headers.findIndex(h => 
      h && (h.toLowerCase() === 'ev' || h.toLowerCase().includes('enterprise'))
    );
    const countryCol = headers.findIndex(h => 
      h && (h.toLowerCase().includes('geographic') || h.toLowerCase().includes('country'))
    );
    const sectorCol = headers.findIndex(h => 
      h && (h.toLowerCase().includes('sector') || h.toLowerCase().includes('level2'))
    );
    const industryCol = headers.findIndex(h => 
      h && (h.toLowerCase().includes('level4') || h.toLowerCase().includes('industry'))
    );
    
    if (isinCol === -1 || nameCol === -1 || assetsCol === -1 || evCol === -1) {
      throw new Error('Required columns not found. File must contain: ISIN/Type, Name, Assets, EV');
    }
    
    // Parse data rows
    const companies: CompanyData[] = [];
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] as any[];
      
      if (!row || row.length === 0) continue;
      
      const isin = row[isinCol]?.toString().trim();
      const name = row[nameCol]?.toString().trim();
      const assets = parseFloat(row[assetsCol]?.toString() || '0');
      const ev = parseFloat(row[evCol]?.toString() || '0');
      
      if (!isin || !name) continue;
      
      companies.push({
        isin,
        name,
        sector: sectorCol !== -1 ? row[sectorCol]?.toString().trim() : undefined,
        industry: industryCol !== -1 ? row[industryCol]?.toString().trim() : undefined,
        country: countryCol !== -1 ? row[countryCol]?.toString().trim() : undefined,
        tangibleAssets: assets,
        enterpriseValue: ev,
      });
    }
    
    if (companies.length === 0) {
      throw new Error('No valid company data found in file');
    }
    
    return companies;
  } catch (error) {
    console.error('[FileParser] Error parsing file:', error);
    throw new Error(`Failed to parse file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

