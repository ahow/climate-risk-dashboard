import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import * as externalApis from "./services/externalApis";
import { TRPCError } from "@trpc/server";
import { companies, assets, geographicRisks, riskManagementScores, uploadedFiles } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { storagePut } from "./storage";
import { getDb } from "./db";

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  companies: router({
    /**
     * Get all companies with new analysis structure:
     * Asset Risk + Supply Chain Risk → Total Risk → Management Score → Net Expected Loss
     */
    list: publicProcedure.query(async () => {
      try {
        console.log('[companies.list] Starting query...');
        const companies = await db.getAllCompanies();
        console.log(`[companies.list] Found ${companies.length} companies`);
        
        const { getManagementAdjustmentFactor, calculatePresentValue } = await import('./utils/oecdMappings');
        
        // Calculate comprehensive risk metrics for each company
        const companiesWithRisk = await Promise.all(
          companies.map(async (company) => {
            try {
              // 1. ASSET RISK: Calculate from geographic risks
              const assets = await db.getAssetsByCompanyId(company.id);
              let assetRiskAnnual = 0;
              let assetRiskPV = 0;

              for (const asset of assets) {
                // Get ALL geographic risks for this asset (multiple hazard types per asset)
                const geoRisks = await db.getAllGeographicRisksByAssetId(asset.id);
                for (const geoRisk of geoRisks) {
                  if (geoRisk && geoRisk.riskData) {
                    const riskData = geoRisk.riskData as any;
                    assetRiskAnnual += riskData.expected_annual_loss || 0;
                    assetRiskPV += riskData.present_value_30yr || 0;
                  }
                }
              }

              // 2. SUPPLY CHAIN RISK: Get from supply chain risk table
              const supplyChainRisk = await db.getSupplyChainRiskByCompanyId(company.id);
              const supplyChainRiskAnnual = parseFloat(supplyChainRisk?.expectedAnnualLoss || '0');
              const supplyChainRiskPV = parseFloat(supplyChainRisk?.presentValue || '0');

              // 3. TOTAL RISK: Sum of asset risk and supply chain risk
              const totalRiskAnnual = assetRiskAnnual + supplyChainRiskAnnual;
              const totalRiskPV = assetRiskPV + supplyChainRiskPV;

              // 4. MANAGEMENT SCORE: Convert to percentage (0-100%)
              const riskManagement = await db.getRiskManagementByCompanyId(company.id);
              const managementScoreRaw = riskManagement?.overallScore || 0;
              // Assuming max score is 100 points, convert to percentage
              const managementScorePct = managementScoreRaw; // Already 0-100

              // 5. NET EXPECTED LOSS: Apply management adjustment
              // 100% score → 30% of total risk, 0% score → 100% of total risk
              const adjustmentFactor = getManagementAdjustmentFactor(managementScorePct);
              const netExpectedLossAnnual = totalRiskAnnual * adjustmentFactor;
              const netExpectedLossPV = totalRiskPV * adjustmentFactor;
              
              // Calculate as percentage of EV
              const enterpriseValue = parseFloat(company.enterpriseValue || '0');
              const netLossPercentageOfEV = enterpriseValue > 0 
                ? (netExpectedLossPV / enterpriseValue) * 100 
                : 0;

              return {
                ...company,
                // Asset Risk
                assetRiskAnnual,
                assetRiskPV,
                assetCount: assets.length,
                // Supply Chain Risk
                supplyChainRiskAnnual,
                supplyChainRiskPV,
                supplyChainRiskPct: parseFloat(supplyChainRisk?.expectedAnnualLossPct || '0'),
                // Total Risk
                totalRiskAnnual,
                totalRiskPV,
                // Management
                managementScorePct,
                adjustmentFactor,
                // Net Expected Loss (PRIMARY METRIC)
                netExpectedLossAnnual,
                netExpectedLossPV,
                netLossPercentageOfEV,
              };
            } catch (error) {
              console.error(`[companies.list] Error processing company ${company.name}:`, error);
              // Return company with zero risk if calculation fails
              return {
                ...company,
                assetRiskAnnual: 0,
                assetRiskPV: 0,
                assetCount: 0,
                supplyChainRiskAnnual: 0,
                supplyChainRiskPV: 0,
                supplyChainRiskPct: 0,
                totalRiskAnnual: 0,
                totalRiskPV: 0,
                managementScorePct: 0,
                adjustmentFactor: 1.0,
                netExpectedLossAnnual: 0,
                netExpectedLossPV: 0,
                netLossPercentageOfEV: 0,
              };
            }
          })
        );
        
        console.log(`[companies.list] Returning ${companiesWithRisk.length} companies with risk data`);
        return companiesWithRisk;
      } catch (error) {
        console.error('[companies.list] Fatal error:', error);
        throw error;
      }
    }),

    /**
     * Get a single company by ISIN
     */
    getByIsin: publicProcedure
      .input(z.object({ isin: z.string() }))
      .query(async ({ input }) => {
        const company = await db.getCompanyByIsin(input.isin);
        return company;
      }),

    /**
     * Get company with all related data:
     * (i) assets with losses
     * (ii) top 5 supply chain contributors
     * (iii) management measures with scores, rationale, quotes, sources
     */
    getFullDetails: publicProcedure
      .input(z.object({ isin: z.string() }))
      .query(async ({ input }) => {
        const company = await db.getCompanyByIsin(input.isin);
        if (!company) {
          throw new Error(`Company not found: ${input.isin}`);
        }

        // (i) Assets with their expected losses
        const assets = await db.getAssetsByCompanyId(company.id);
        const assetsWithRisks = await Promise.all(
          assets.map(async (asset) => {
            const geoRisk = await db.getGeographicRiskByAssetId(asset.id);
            const riskData = geoRisk?.riskData as any;
            
            return {
              id: asset.id,
              name: asset.assetName,
              latitude: asset.latitude,
              longitude: asset.longitude,
              city: asset.city,
              country: asset.country,
              estimatedValue: asset.estimatedValueUsd,
              expectedAnnualLoss: riskData?.expected_annual_loss || 0,
              presentValue30yr: riskData?.present_value_30yr || 0,
              hazardBreakdown: riskData?.hazard_breakdown || {},
            };
          })
        );

        // (ii) Top 5 supply chain contributors (country-sector)
        const supplyChainRisk = await db.getSupplyChainRiskByCompanyId(company.id);
        const topSuppliers = (supplyChainRisk?.topSuppliers as any[]) || [];
        const top5Suppliers = topSuppliers.slice(0, 5).map(supplier => ({
          country: supplier.country_name,
          sector: supplier.sector_name,
          ioCoefficient: supplier.io_coefficient,
          climateRisk: supplier.direct_risk?.climate || 0,
          riskContribution: supplier.risk_contribution?.climate || 0,
        }));

        // (iii) Management performance measures
        const riskManagement = await db.getRiskManagementByCompanyId(company.id);
        const assessmentData = riskManagement?.assessmentData as any;
        // New API structure uses measureScores array
        const measureScores = assessmentData?.measureScores || assessmentData?.measures || [];
        const managementMeasures = measureScores.map((measure: any) => ({
          measure: measure.title || measure.measure || measure.category,
          score: measure.score || 0,
          rationale: measure.evidenceSummary || measure.rationale || measure.explanation || '',
          verbatimQuote: measure.quotes?.[0]?.text || measure.verbatim_quote || measure.quote || '',
          source: measure.quotes?.[0]?.source || measure.source || measure.document || '',
        }));

        return {
          company,
          assets: assetsWithRisks,
          topSupplyChainContributors: top5Suppliers,
          managementMeasures,
          riskManagement,
        };
      }),

    /**
     * Calculate direct exposure for a company
     * This aggregates expected losses from all assets
     */
    calculateDirectExposure: publicProcedure
      .input(z.object({ isin: z.string() }))
      .query(async ({ input }) => {
        const company = await db.getCompanyByIsin(input.isin);
        if (!company) {
          throw new Error(`Company not found: ${input.isin}`);
        }

        const assets = await db.getAssetsByCompanyId(company.id);
        
        let totalExpectedLoss = 0;
        const riskBreakdown: Record<string, number> = {};

        for (const asset of assets) {
          const geoRisk = await db.getGeographicRiskByAssetId(asset.id);
          if (geoRisk && geoRisk.riskData) {
            const risks = (geoRisk.riskData as any).risks || {};
            
            for (const [riskType, riskData] of Object.entries(risks)) {
              const expectedLoss = (riskData as any).expected_annual_loss || 0;
              totalExpectedLoss += expectedLoss;
              
              if (!riskBreakdown[riskType]) {
                riskBreakdown[riskType] = 0;
              }
              riskBreakdown[riskType] += expectedLoss;
            }
          }
        }

        return {
          totalExpectedLoss,
          riskBreakdown,
          assetCount: assets.length,
        };
      }),

    /**
     * Calculate overall expected losses
     * Formula: (direct exposure + indirect exposure) x (100% - risk management score)
     * Note: indirect exposure is currently set to 0 as per user requirements
     */
    calculateOverallLoss: publicProcedure
      .input(z.object({ isin: z.string() }))
      .query(async ({ input }) => {
        const company = await db.getCompanyByIsin(input.isin);
        if (!company) {
          throw new Error(`Company not found: ${input.isin}`);
        }

        // Get direct exposure
        const assets = await db.getAssetsByCompanyId(company.id);
        let directExposure = 0;

        for (const asset of assets) {
          const geoRisk = await db.getGeographicRiskByAssetId(asset.id);
          if (geoRisk && geoRisk.riskData) {
            // Use the total expected_annual_loss from the root level
            const riskData = geoRisk.riskData as any;
            directExposure += riskData.expected_annual_loss || 0;
          }
        }

        // Get risk management score (0-100)
        const riskManagement = await db.getRiskManagementByCompanyId(company.id);
        const managementScore = riskManagement?.overallScore || 0;
        const managementFactor = (100 - managementScore) / 100;

        // Indirect exposure is 0 for now
        const indirectExposure = 0;

        // Calculate overall expected loss
        const overallExpectedLoss = (directExposure + indirectExposure) * managementFactor;

        return {
          directExposure,
          indirectExposure,
          managementScore,
          managementFactor,
          overallExpectedLoss,
          tangibleAssets: company.tangibleAssets,
          enterpriseValue: company.enterpriseValue,
        };
      }),

    /**
     * Seed companies from the uploaded Excel file
     * Fetches the most recent uploaded Excel file from S3 and processes it
     */
    /**
     * Seed companies from a URL to an Excel file
     */
    seedCompaniesFromUrl: publicProcedure
      .input(z.object({ url: z.string().url() }))
      .mutation(async ({ input }) => {
        try {
          console.log('[seedCompaniesFromUrl] Starting with URL:', input.url);
          
          // Clear all existing company data before re-seeding
          console.log('[seedCompaniesFromUrl] Clearing existing company data...');
          const database = await getDb();
          if (database) {
            try {
              const { geographicRisks, riskManagementScores, supplyChainRisks } = await import('../drizzle/schema');
              const { sql } = await import('drizzle-orm');
              
              // Delete child tables first
              await database.delete(geographicRisks).where(sql`1=1`);
              await database.delete(supplyChainRisks).where(sql`1=1`);
              await database.delete(riskManagementScores).where(sql`1=1`);
              await database.delete(assets).where(sql`1=1`);
              // Delete parent table last
              await database.delete(companies).where(sql`1=1`);
              console.log('[seedCompaniesFromUrl] Cleared all existing data');
            } catch (error) {
              console.error('[seedCompaniesFromUrl] Error clearing data:', error);
              // Continue anyway - tables might be empty
            }
          }
          
          // Fetch file from URL
          console.log(`[seedCompaniesFromUrl] Fetching from URL: ${input.url}`);
          const response = await fetch(input.url);
          if (!response.ok) {
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Failed to fetch file from URL: ${response.status}` });
          }
          
          const buffer = Buffer.from(await response.arrayBuffer());
          console.log(`[seedCompaniesFromUrl] Downloaded ${buffer.length} bytes`);
          
          // Parse Excel file
          const XLSX = await import('xlsx');
          const workbook = XLSX.read(buffer, { type: 'buffer' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const data = XLSX.utils.sheet_to_json(worksheet);
          console.log(`[seedCompaniesFromUrl] Parsed ${data.length} rows from Excel`);
          
          // Transform data to match companies schema
          const companiesData = data.map((row: any) => ({
            isin: String(row.ISIN || row.isin || ''),
            name: String(row.NAME || row.Name || row.name || ''),
            sector: String(row['LEVEL4 SECTOR NAME'] || row.Sector || row.sector || ''),
            country: String(row['GEOGRAPHIC DESCR.'] || row.Country || row.country || ''),
            enterpriseValue: String(row.EV || row['Enterprise Value'] || row.enterpriseValue || row['Enterprise Value (M)'] || '0'),
            supplierCosts: String(row.SUPPLIERCOSTS || row['Supplier Costs'] || row.supplierCosts || '0'),
          }));
          console.log(`[seedCompaniesFromUrl] Transformed ${companiesData.length} companies`);
          console.log(`[seedCompaniesFromUrl] First company:`, companiesData[0]);
          
          await db.bulkInsertCompanies(companiesData);
          console.log(`[seedCompaniesFromUrl] Successfully inserted ${companiesData.length} companies`);
          
          return {
            success: true,
            count: companiesData.length,
            source: 'url',
            url: input.url,
          };
        } catch (error) {
          console.error('[seedCompaniesFromUrl] Error:', error);
          throw error;
        }
      }),

    seedCompanies: publicProcedure.mutation(async () => {
      try {
        console.log('[seedCompanies] Starting...');
        
        // Clear all existing company data before re-seeding
        console.log('[seedCompanies] Clearing existing company data...');
        const database = await getDb();
        if (database) {
          try {
            // Delete in correct order due to foreign key constraints
            // Use .where() with a condition that's always true to avoid syntax errors
            const { supplyChainRisks } = await import('../drizzle/schema');
            const { sql } = await import('drizzle-orm');
            
            // Delete child tables first
            await database.delete(geographicRisks).where(sql`1=1`);
            await database.delete(supplyChainRisks).where(sql`1=1`);
            await database.delete(riskManagementScores).where(sql`1=1`);
            await database.delete(assets).where(sql`1=1`);
            // Delete parent table last
            await database.delete(companies).where(sql`1=1`);
            console.log('[seedCompanies] Cleared all existing data');
          } catch (error) {
            console.error('[seedCompanies] Error clearing data:', error);
            // Continue anyway - tables might be empty
          }
        }
        
        const files = await db.getAllUploadedFiles();
        console.log(`[seedCompanies] Found ${files?.length || 0} uploaded files`);
        
        if (!files || files.length === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'No files uploaded yet' });
        }
        
        // Get the most recent Excel file
        const excelFile = files.find(f => 
          f.fileType.includes('spreadsheet') || 
          f.filename.endsWith('.xlsx') || 
          f.filename.endsWith('.xls')
        );
        console.log(`[seedCompanies] Excel file found: ${excelFile?.filename}`);
        
        if (!excelFile) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'No Excel file found in uploads' });
        }
        
        // Fetch file from S3
        console.log(`[seedCompanies] Fetching from S3: ${excelFile.s3Url}`);
        const response = await fetch(excelFile.s3Url);
        if (!response.ok) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Failed to fetch file from S3: ${response.status}` });
        }
        
        const buffer = Buffer.from(await response.arrayBuffer());
        console.log(`[seedCompanies] Downloaded ${buffer.length} bytes`);
        
        // Parse Excel file
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);
        console.log(`[seedCompanies] Parsed ${data.length} rows from Excel`);
        
        // Transform data to match companies schema
        // Excel columns: Type, NAME, LEVEL2 SECTOR NAME, LEVEL3 SECTOR NAME, LEVEL4 SECTOR NAME, LEVEL5 SECTOR NAME, GEOGRAPHIC DESCR., ASSETS, EV, SUPPLIERCOSTS
        const companiesData = data.map((row: any) => ({
          isin: row.Type || row.ISIN || row.isin,
          name: row.NAME || row.Name || row.name || row['Company Name'],
          sector: row['LEVEL2 SECTOR NAME'] || row['LEVEL3 SECTOR NAME'] || row.Sector || row.sector,
          geography: row['GEOGRAPHIC DESCR.'] || row.Geography || row.geography || row.Country,
          tangibleAssets: String(row.ASSETS || row['Tangible Assets'] || row.tangibleAssets || row['Tangible Assets (M)'] || '0'),
          enterpriseValue: String(row.EV || row['Enterprise Value'] || row.enterpriseValue || row['Enterprise Value (M)'] || '0'),
          supplierCosts: String(row.SUPPLIERCOSTS || row['Supplier Costs'] || row.supplierCosts || '0'),
        }));
        console.log(`[seedCompanies] Transformed ${companiesData.length} companies`);
        console.log(`[seedCompanies] First company:`, companiesData[0]);
        
        await db.bulkInsertCompanies(companiesData);
        console.log(`[seedCompanies] Successfully inserted ${companiesData.length} companies`);
        
        return {
          success: true,
          count: companiesData.length,
          filename: excelFile.filename,
        };
      } catch (error) {
        console.error('[seedCompanies] Error:', error);
        throw error;
      }
    }),

    /**
     * Fetch all assets from Asset Discovery API (565 assets with 100% coverage)
     */
    fetchAllAssets: publicProcedure.mutation(async () => {
      const { progressTracker } = await import('./utils/progressTracker');
      const operationId = `fetch-assets-${Date.now()}`;
      
      try {
        progressTracker.start(operationId, 'Fetching Assets', 100, 'Starting asset fetch...');
        
        // Fetch all assets at once from the API
        progressTracker.update(operationId, 10, 'Fetching assets from API...');
        const allAssets = await externalApis.fetchAllAssetsFromAPI();
        
        if (allAssets.length === 0) {
          return {
            success: false,
            totalAssetsFetched: 0,
            message: 'No assets returned from API',
          };
        }

        // Get all companies to map assets to company IDs using ISIN (more reliable than name matching)
        progressTracker.update(operationId, 30, `Received ${allAssets.length} assets from API`);
        const companies = await db.getAllCompanies();
        // Create map using ISIN as key for reliable matching
        const companyMapByISIN = new Map(companies.map(c => [c.isin, c.id]));
        // Fallback map using name for companies without ISIN
        const companyMapByName = new Map(companies.map(c => [c.name, c.id]));

        let totalAssetsFetched = 0;
        let skipped = 0;
        const errors: string[] = [];

        // Group assets by company and insert
        const assetsByCompany = new Map<number, any[]>();
        
        for (const asset of allAssets) {
          // Try matching by ISIN first (most reliable), fallback to name
          let companyId = asset.isin ? companyMapByISIN.get(asset.isin) : undefined;
          if (!companyId) {
            companyId = companyMapByName.get(asset.company_name);
          }
          
          if (!companyId) {
            skipped++;
            console.warn(`Skipping asset "${asset.asset_name}" - company not found (ISIN: ${asset.isin}, Name: ${asset.company_name})`);
            continue; // Skip assets for companies not in our database
          }

          if (!assetsByCompany.has(companyId)) {
            assetsByCompany.set(companyId, []);
          }

          assetsByCompany.get(companyId)!.push({
            companyId,
            assetName: asset.asset_name,
            address: asset.location,
            latitude: asset.latitude?.toString() || null,
            longitude: asset.longitude?.toString() || null,
            city: asset.city,
            stateProvince: null,
            country: asset.country,
            assetType: asset.asset_type,
            assetSubtype: null,
            estimatedValueUsd: asset.estimated_value_usd?.toString() || null,
            ownershipShare: null,
            dataSources: asset.data_source || 'Asset Discovery API',
            confidenceLevel: asset.coordinate_certainty?.toString() || null,
          });
        }

        // Bulk insert assets for each company
        progressTracker.update(operationId, 50, `Inserting ${assetsByCompany.size} companies' assets...`);
        const totalCompanies = assetsByCompany.size;
        let processedCompanies = 0;
        
        for (const [companyId, assets] of Array.from(assetsByCompany.entries())) {
          processedCompanies++;
          const progress = 50 + Math.floor((processedCompanies / totalCompanies) * 40);
          try {
            await db.bulkInsertAssets(assets);
            totalAssetsFetched += assets.length;
            progressTracker.update(operationId, progress, `Inserted ${totalAssetsFetched} assets (${processedCompanies}/${totalCompanies} companies)`);
          } catch (error) {
            const errorMsg = `Failed to insert assets for company ID ${companyId}: ${error}`;
            console.error(errorMsg);
            errors.push(errorMsg);
          }
        }

        progressTracker.complete(operationId, `Successfully loaded ${totalAssetsFetched} assets from ${assetsByCompany.size} companies`);
        
        return {
          success: true,
          totalAssetsFetched,
          totalAssetsFromAPI: allAssets.length,
          skipped,
          companiesProcessed: assetsByCompany.size,
          errors,
          operationId,
        };
      } catch (error) {
        console.error('Error in fetchAllAssets:', error);
        progressTracker.fail(operationId, error instanceof Error ? error.message : 'Unknown error');
        return {
          success: false,
          totalAssetsFetched: 0,
          message: `Failed to fetch assets: ${error}`,
          operationId,
        };
      }
    }),

    /**
     * Fetch risk management assessments for all companies
     */
    fetchAllRiskManagement: publicProcedure.mutation(async () => {
      const { progressTracker } = await import('./utils/progressTracker');
      const operationId = `risk-mgmt-${Date.now()}`;
      progressTracker.start(operationId, 'Fetching Risk Management Data', 0, 'Starting...');

      try {
        const companies = await db.getAllCompanies();
        let assessmentsFetched = 0;
        const errors: string[] = [];
        const totalCompanies = companies.length;

        for (let i = 0; i < companies.length; i++) {
          const company = companies[i];
          const progress = Math.floor(((i + 1) / totalCompanies) * 100);
          
          try {
            progressTracker.update(
              operationId, 
              progress, 
              `Fetching ${company.name} (${i + 1}/${totalCompanies})`
            );
            
            const managementData = await externalApis.fetchRiskManagement(company.isin);
            
            if (managementData.company && managementData.company.analysisStatus === 'completed' && managementData.company.totalScore !== null) {
              await db.insertRiskManagement({
                companyId: company.id,
                overallScore: managementData.company.totalScore,
                assessmentData: managementData as any,
              });
              assessmentsFetched++;
            } else {
              console.log(`[fetchRiskManagement] ${company.name} status: ${managementData.company?.analysisStatus || 'unknown'}`);
            }
          } catch (error) {
            const errorMsg = `${company.name}: ${error}`;
            console.error(errorMsg);
            errors.push(errorMsg);
          }
        }

        progressTracker.complete(
          operationId, 
          `Successfully fetched ${assessmentsFetched}/${totalCompanies} risk management assessments`
        );
        
        return { 
          success: true, 
          assessmentsFetched, 
          companiesProcessed: companies.length,
          errors,
          operationId,
        };
      } catch (error) {
        console.error('Error in fetchAllRiskManagement:', error);
        progressTracker.fail(operationId, error instanceof Error ? error.message : 'Unknown error');
        return {
          success: false,
          assessmentsFetched: 0,
          companiesProcessed: 0,
          errors: [error instanceof Error ? error.message : 'Unknown error'],
          operationId,
        };
      }
    }),

    /**
     * Fetch supply chain risks for all companies from Supply Chain Risk API
     */
    fetchSupplyChainRisks: publicProcedure.mutation(async () => {
      const companies = await db.getAllCompanies();
      const { fetchSupplyChainRisk, calculateSupplyChainLoss } = await import('./services/supplyChainApi');
      
      let risksFetched = 0;
      const errors: string[] = [];

      for (const company of companies) {
        try {
          console.log(`[fetchSupplyChainRisks] Processing ${company.name}...`);
          
          // Fetch supply chain risk assessment from API
          const assessment = await fetchSupplyChainRisk(company.geography, company.sector);
          
          // Skip if API returned error or no data available
          if (!assessment) {
            console.log(`[fetchSupplyChainRisks] ${company.name}: No data available, skipping`);
            continue;
          }
          
          // Calculate expected losses
          const supplierCosts = parseFloat(company.supplierCosts || '0');
          const expectedAnnualLossPct = assessment.climate_details?.expected_annual_loss_pct || 0;
          const { annualLoss, presentValue } = calculateSupplyChainLoss(supplierCosts, expectedAnnualLossPct);
          
          // Extract top 5 suppliers
          const topSuppliers = (assessment.top_suppliers || []).slice(0, 5);
          
          // Delete existing supply chain risk data for this company
          await db.deleteSupplyChainRiskByCompanyId(company.id);
          
          // Insert new supply chain risk data
          await db.insertSupplyChainRisk({
            companyId: company.id,
            countryCode: assessment.country,
            sectorCode: assessment.sector,
            expectedAnnualLossPct: expectedAnnualLossPct.toString(),
            expectedAnnualLoss: annualLoss.toString(),
            presentValue: presentValue.toString(),
            topSuppliers: topSuppliers,
            assessmentData: assessment,
          });
          
          console.log(`[fetchSupplyChainRisks] ${company.name}: Annual Loss = $${annualLoss.toFixed(2)} (${expectedAnnualLossPct}%)`);
          risksFetched++;
        } catch (error) {
          console.error(`[fetchSupplyChainRisks] Error for ${company.name}:`, error);
          errors.push(`${company.name}: ${error}`);
        }
      }

      return {
        success: true,
        risksFetched,
        companiesProcessed: companies.length,
        errors,
      };
    }),
  }),

  assets: router({
    /**
     * Get assets for a company
     */
    getByCompany: publicProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input }) => {
        const assets = await db.getAssetsByCompanyId(input.companyId);
        return assets;
      }),

    /**
     * Fetch and store assets from external API
     */
    fetchAndStore: publicProcedure
      .input(z.object({ isin: z.string() }))
      .mutation(async ({ input }) => {
        const company = await db.getCompanyByIsin(input.isin);
        if (!company) {
          throw new Error(`Company not found: ${input.isin}`);
        }

        // Fetch assets from external API using company name
        const assetData = await externalApis.fetchCompanyAssets(company.name);
        
        // Transform and insert into database
        const assetsToInsert = assetData.map(asset => ({
          companyId: company.id,
          assetName: asset.asset_name,
          address: asset.location,
          latitude: asset.latitude?.toString() || null,
          longitude: asset.longitude?.toString() || null,
          city: asset.city,
          stateProvince: null, // Not provided by Asset Discovery API
          country: asset.country,
          assetType: asset.asset_type,
          assetSubtype: null, // Not provided by Asset Discovery API
          estimatedValueUsd: asset.estimated_value_usd?.toString() || null,
          ownershipShare: null, // Not provided by Asset Discovery API
          dataSources: asset.description || 'Asset Discovery API',
          confidenceLevel: asset.geocoding_certainty?.toString() || null,
        }));

        await db.bulkInsertAssets(assetsToInsert);

        return { success: true, count: assetsToInsert.length };
      }),
  }),

  risks: router({
    /**
     * Fetch and store geographic risk for an asset
     */
    fetchGeographicRisk: publicProcedure
      .input(z.object({
        assetId: z.number(),
        latitude: z.number(),
        longitude: z.number(),
        assetValue: z.number(),
      }))
      .mutation(async ({ input }) => {
        const riskData = await externalApis.fetchGeographicRisk(
          input.latitude,
          input.longitude,
          input.assetValue
        );

        await db.insertGeographicRisk({
          assetId: input.assetId,
          latitude: input.latitude.toString(),
          longitude: input.longitude.toString(),
          assetValue: input.assetValue.toString(),
          riskData: riskData as any,
        });

        return { success: true };
      }),

    /**
     * Fetch and store risk management assessment
     */
    fetchRiskManagement: publicProcedure
      .input(z.object({ isin: z.string() }))
      .mutation(async ({ input }) => {
        const company = await db.getCompanyByIsin(input.isin);
        if (!company) {
          throw new Error(`Company not found: ${input.isin}`);
        }

        const managementData = await externalApis.fetchRiskManagement(input.isin);

        // Only save if analysis is completed
        if (managementData.company && managementData.company.analysisStatus === 'completed' && managementData.company.totalScore !== null) {
          await db.insertRiskManagement({
            companyId: company.id,
            overallScore: managementData.company.totalScore,
            assessmentData: managementData as any,
          });
          return { success: true, status: 'completed' };
        } else {
          return { 
            success: false, 
            status: managementData.company?.analysisStatus || 'unknown',
            message: `Analysis not completed for ${input.isin}` 
          };
        }
      }),

    /**
     * Clear all geographic risks (useful when recalculating with corrected values)
     */
    clearAllGeographicRisks: publicProcedure.mutation(async () => {  
      const database = await getDb();
      if (!database) {
        throw new Error('Database not available');
      }
      
      await database.delete(geographicRisks);
      console.log('[Geographic Risks] Cleared all geographic risks from database');
      
      return { success: true, message: 'All geographic risks cleared' };
    }),

    /**
     * Calculate geographic risks for all assets with coordinates
     */
    calculateAllGeographicRisks: publicProcedure.mutation(async () => {
      console.log('[Geographic Risks] ========== MUTATION CALLED ==========');
      const { progressTracker } = await import('./utils/progressTracker');
      const operationId = `geo-risks-${Date.now()}`;
      console.log(`[Geographic Risks] Operation ID: ${operationId}`);
      
      // Health check temporarily disabled for faster startup
      // The retry logic will handle any API issues during calculation
      // console.log('[Geographic Risks] Checking Climate Risk API health...');
      // const healthCheck = await externalApis.checkClimateRiskApiHealth();
      // 
      // if (!healthCheck.healthy) {
      //   const errorMsg = `Climate Risk API is not available: ${healthCheck.message}. Please wake up the API and try again.`;
      //   console.error(`[Geographic Risks] ${errorMsg}`);
      //   throw new Error(errorMsg);
      // }
      // 
      // console.log('[Geographic Risks] API health check passed');
      
      const companies = await db.getAllCompanies();
      console.log(`[Geographic Risks] Loaded ${companies.length} companies`);
      let risksCalculated = 0;
      let skipped = 0;
      const errors: string[] = [];
      
      // Count total assets to calculate
      let totalAssets = 0;
      for (const company of companies) {
        const assets = await db.getAssetsByCompanyId(company.id);
        totalAssets += assets.filter(a => a.latitude && a.longitude && a.estimatedValueUsd).length;
      }
      
      console.log(`[Geographic Risks] Total assets to process: ${totalAssets}`);
      progressTracker.start(operationId, 'Calculating geographic risks', totalAssets, `Found ${totalAssets} assets to process`);
      console.log(`[Geographic Risks] Progress tracker started`);
      let processedAssets = 0;

      console.log(`[Geographic Risks] Starting calculation for ${companies.length} companies`);

      // Collect all assets to process
      const assetsToProcess: Array<{ asset: any; company: any }> = [];
      for (const company of companies) {
        const assets = await db.getAssetsByCompanyId(company.id);
        for (const asset of assets) {
          if (asset.latitude && asset.longitude && asset.estimatedValueUsd) {
            // Check if risk already calculated
            const existingRisk = await db.getGeographicRiskByAssetId(asset.id);
            if (!existingRisk) {
              assetsToProcess.push({ asset, company });
            } else {
              skipped++;
            }
          }
        }
      }

      console.log(`[Geographic Risks] Processing ${assetsToProcess.length} assets in parallel (concurrency: 10)`);

      // Process assets in parallel batches of 10
      const BATCH_SIZE = 10;
      for (let i = 0; i < assetsToProcess.length; i += BATCH_SIZE) {
        // Check for cancellation
        if (progressTracker.isCancelled(operationId)) {
          console.log(`[Geographic Risks] Operation cancelled after ${risksCalculated} assets`);
          return {
            success: false,
            risksCalculated,
            skipped,
            errors,
            operationId,
            cancelled: true
          };
        }
        
        const batch = assetsToProcess.slice(i, i + BATCH_SIZE);
        
        await Promise.all(batch.map(async ({ asset, company }) => {
          try {
            // Check cancellation before processing each asset
            if (progressTracker.isCancelled(operationId)) {
              return;
            }
            
            const lat = parseFloat(asset.latitude);
            const lon = parseFloat(asset.longitude);
            const value = parseFloat(asset.estimatedValueUsd);
            
            if (!isNaN(lat) && !isNaN(lon) && !isNaN(value) && value > 0) {
              const progressMsg = `Processing ${asset.assetName} (${company.name}) - ${risksCalculated + 1}/${assetsToProcess.length}`;
              progressTracker.update(operationId, processedAssets, progressMsg);
              console.log(`[Geographic Risks] ${progressMsg}`);
              
              const riskData = await externalApis.fetchGeographicRisk(lat, lon, value);
              
              await db.insertGeographicRisk({
                assetId: asset.id,
                latitude: lat.toString(),
                longitude: lon.toString(),
                assetValue: value.toString(),
                riskData: riskData as any,
              });
              
              risksCalculated++;
              processedAssets++;
              const completedMsg = `Calculated ${risksCalculated}/${assetsToProcess.length} risks (${Math.round((risksCalculated / assetsToProcess.length) * 100)}%)`;
              progressTracker.update(operationId, processedAssets, completedMsg);
              console.log(`[Geographic Risks] ✓ ${asset.assetName}`);
            }
          } catch (error) {
            const errorMsg = `Asset ${asset.assetName} (ID: ${asset.id}): ${error}`;
            console.error(`[Geographic Risks] ✗ ${errorMsg}`);
            errors.push(errorMsg);
            processedAssets++; // Count failed assets too
          }
        }));
        
        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log(`[Geographic Risks] Completed: ${risksCalculated} calculated, ${skipped} skipped, ${errors.length} errors`);
      
      if (errors.length > 0) {
        progressTracker.fail(operationId, `Completed with ${errors.length} errors`);
      } else {
        progressTracker.complete(operationId, `Calculated ${risksCalculated} risks, skipped ${skipped}`);
      }

      return {
        success: true,
        risksCalculated,
        skipped,
        errors,
        operationId
      };
    }),

    /**
     * Recalculate geographic risks using calibrated asset values
     * This implements proportionate allocation based on reported tangible assets
     */
    recalculateWithCalibration: publicProcedure.mutation(async () => {
      const companies = await db.getAllCompanies();
      let risksRecalculated = 0;
      let skipped = 0;
      const errors: string[] = [];

      console.log(`[Calibration] Starting recalculation for ${companies.length} companies`);

      for (const company of companies) {
        try {
          console.log(`[Calibration] Processing ${company.name}...`);
          
          const assets = await db.getAssetsByCompanyId(company.id);
          
          // Calculate total estimated value for all assets
          let totalEstimatedValue = 0;
          const assetValues: Array<{ asset: typeof assets[0]; estimatedValue: number }> = [];
          
          for (const asset of assets) {
            const estimatedValue = parseFloat(asset.estimatedValueUsd || '0');
            if (estimatedValue > 0) {
              totalEstimatedValue += estimatedValue;
              assetValues.push({ asset, estimatedValue });
            }
          }

          // Get reported tangible assets value
          const reportedTangibleAssets = parseFloat(company.tangibleAssets || '0');
          
          if (totalEstimatedValue === 0 || reportedTangibleAssets === 0) {
            console.warn(`[Calibration] Cannot calibrate ${company.name}: totalEstimated=${totalEstimatedValue}, reported=${reportedTangibleAssets}`);
            continue;
          }

          // Recalculate geographic risks using calibrated values
          for (const { asset, estimatedValue } of assetValues) {
            try {
              // Only recalculate if asset has valid coordinates
              if (asset.latitude && asset.longitude) {
                const lat = parseFloat(asset.latitude);
                const lon = parseFloat(asset.longitude);
                
                if (!isNaN(lat) && !isNaN(lon)) {
                  // Calculate calibrated value
                  const percentageOfTotal = estimatedValue / totalEstimatedValue;
                  const calibratedValue = percentageOfTotal * reportedTangibleAssets;
                  
                  console.log(`[Calibration] ${asset.assetName}: $${estimatedValue.toFixed(0)} → $${calibratedValue.toFixed(0)} (${(percentageOfTotal * 100).toFixed(1)}%)`);
                  
                  // Delete existing risk data
                  await db.deleteGeographicRiskByAssetId(asset.id);
                  
                  // Fetch new risk data with calibrated value
                  const riskData = await externalApis.fetchGeographicRisk(
                    lat,
                    lon,
                    calibratedValue
                  );
                  
                  // Store new risk data
                  await db.insertGeographicRisk({
                    assetId: asset.id,
                    latitude: lat.toString(),
                    longitude: lon.toString(),
                    assetValue: calibratedValue.toString(),
                    riskData: riskData as any,
                  });
                  
                  risksRecalculated++;
                  console.log(`[Calibration] ✓ Recalculated (${risksRecalculated} total)`);
                             } else {
                  skipped++;
                }
              } else {
                skipped++;
              }
            } catch (error) {
              const errorMsg = `Asset ${asset.assetName} (ID: ${asset.id}): ${error}`;
              console.error(`[Calibration] ✗ ${errorMsg}`);
              errors.push(errorMsg);
            }
          }
        } catch (error) {
          const errorMsg = `Company ${company.name}: ${error}`;
          console.error(`[Calibration] ✗ ${errorMsg}`);
          errors.push(errorMsg);
        }
      }

      console.log(`[Calibration] Completed: ${risksRecalculated} recalculated, ${skipped} skipped, ${errors.length} errors`);

      return {
        success: true,
        risksRecalculated,
        skipped,
        errors,
      };
    }),

    /**
     * Get calibrated asset values for a company
     */
    getCalibratedValues: publicProcedure
      .input(z.object({ isin: z.string() }))
      .query(async ({ input }) => {
        const company = await db.getCompanyByIsin(input.isin);
        if (!company) {
          throw new Error(`Company not found: ${input.isin}`);
        }

        const assets = await db.getAssetsByCompanyId(company.id);
        
        // Calculate total estimated value
        let totalEstimatedValue = 0;
        const assetValues: Array<{ id: number; name: string; estimatedValue: number }> = [];
        
        for (const asset of assets) {
          const estimatedValue = parseFloat(asset.estimatedValueUsd || '0');
          if (estimatedValue > 0) {
            totalEstimatedValue += estimatedValue;
            assetValues.push({ 
              id: asset.id, 
              name: asset.assetName, 
              estimatedValue 
            });
          }
        }

        const reportedTangibleAssets = parseFloat(company.tangibleAssets || '0');
        
        const calibratedAssets = assetValues.map(({ id, name, estimatedValue }) => {
          const percentageOfTotal = totalEstimatedValue > 0 ? estimatedValue / totalEstimatedValue : 0;
          const calibratedValue = percentageOfTotal * reportedTangibleAssets;
          
          return {
            assetId: id,
            assetName: name,
            estimatedValue,
            percentageOfTotal,
            calibratedValue,
          };
        });

        return {
          companyName: company.name,
          totalEstimatedValue,
          reportedTangibleAssets,
          calibratedAssets,
        };
      }),
  }),

  export: router({
    /**
     * Generate CSV export data with complete company-level details
     */
    generateCSV: publicProcedure.query(async () => {
      const companies = await db.getAllCompanies();
      const csvData: Array<{
        isin: string;
        name: string;
        ev: number;
        directExposure: number;
        indirectExposure: number;
        grossExpectedLoss: number;
        floodLoss: number;
        wildfireLoss: number;
        heatStressLoss: number;
        extremePrecipLoss: number;
        hurricaneLoss: number;
        droughtLoss: number;
        riskManagementScore: number;
        netExpectedLoss: number;
        lossPercentOfEV: number;
      }> = [];

      for (const company of companies) {
        // Get assets and calculate direct exposure
        const assets = await db.getAssetsByCompanyId(company.id);
        let directExposure = 0;
        const riskBreakdown: Record<string, number> = {
          flood: 0,
          wildfire: 0,
          heat_stress: 0,
          extreme_precip: 0,
          hurricane: 0,
          drought: 0,
        };

        for (const asset of assets) {
          const geoRisk = await db.getGeographicRiskByAssetId(asset.id);
          if (geoRisk && geoRisk.riskData) {
            const riskData = geoRisk.riskData as any;
            const risks = riskData.risks || {};
            
            for (const [riskType, riskInfo] of Object.entries(risks)) {
              const expectedLoss = (riskInfo as any).expected_annual_loss || 0;
              directExposure += expectedLoss;
              
              if (riskBreakdown[riskType] !== undefined) {
                riskBreakdown[riskType] += expectedLoss;
              }
            }
          }
        }

        // Get risk management score
        const riskManagement = await db.getRiskManagementByCompanyId(company.id);
        const managementScore = riskManagement?.overallScore || 0;
        const managementFactor = (100 - managementScore) / 100;

        // Calculate net expected loss
        const indirectExposure = 0; // Currently not calculated
        const grossExpectedLoss = directExposure + indirectExposure;
        const netExpectedLoss = grossExpectedLoss * managementFactor;

        // Calculate as percentage of EV
        const ev = parseFloat(company.enterpriseValue || '0');
        const lossPercentOfEV = ev > 0 ? (netExpectedLoss / ev) * 100 : 0;

        csvData.push({
          isin: company.isin,
          name: company.name,
          ev,
          directExposure,
          indirectExposure,
          grossExpectedLoss,
          floodLoss: riskBreakdown.flood,
          wildfireLoss: riskBreakdown.wildfire,
          heatStressLoss: riskBreakdown.heat_stress,
          extremePrecipLoss: riskBreakdown.extreme_precip,
          hurricaneLoss: riskBreakdown.hurricane,
          droughtLoss: riskBreakdown.drought,
          riskManagementScore: managementScore,
          netExpectedLoss,
          lossPercentOfEV,
        });
      }

      return csvData;
    }),
  }),

  files: router({
    // Public endpoint to download uploaded files without authentication
    download: publicProcedure
      .input(z.object({ fileId: z.string() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        const file = await db.select().from(uploadedFiles).where(eq(uploadedFiles.id, parseInt(input.fileId))).limit(1);
        if (file.length === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'File not found' });
        }
        
        // Return the S3 URL - the file content will be fetched by the client
        return {
          filename: file[0].filename,
          fileType: file[0].fileType,
          url: file[0].s3Url,
        };
      }),
    /**
     * Upload a file to S3 and store metadata in database
     */
    upload: publicProcedure
      .input(z.object({
        filename: z.string(),
        fileType: z.string(),
        fileSize: z.number(),
        base64Data: z.string(),
        description: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { storagePut } = await import("./storage");
        
        // Generate unique file key
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(7);
        const fileKey = `uploads/public/${timestamp}-${randomSuffix}-${input.filename}`;
        
        // Convert base64 to buffer
        const buffer = Buffer.from(input.base64Data, 'base64');
        
        // Upload to S3
        const { url } = await storagePut(fileKey, buffer, input.fileType);
        
        // Store metadata in database
        await db.createUploadedFile({
          filename: input.filename,
          originalFilename: input.filename,
          fileType: input.fileType,
          fileSize: input.fileSize,
          s3Key: fileKey,
          s3Url: url,
          uploadedBy: ctx.user?.id ?? null,
          description: input.description,
        });
        
        return {
          success: true,
          url,
          fileKey,
        };
      }),

    /**
     * Get all uploaded files
     */
    list: publicProcedure.query(async () => {
      return await db.getAllUploadedFiles();
    }),

    /**
     * Get a specific uploaded file by ID
     */
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getUploadedFileById(input.id);
      }),

    /**
     * Process uploaded company file and trigger automated workflow
     */
    processCompanyFile: publicProcedure
      .input(z.object({
        filename: z.string(),
        fileType: z.string(),
        fileSize: z.number(),
        base64Data: z.string(),
        description: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { parseCompanyFile } = await import("./utils/fileParser");
        const { storagePut } = await import("./storage");
        const { fetchCompanyAssets, fetchGeographicRisk } = await import("./services/externalApis");
        
        try {
          // 1. Upload file to S3
          const timestamp = Date.now();
          const randomSuffix = Math.random().toString(36).substring(7);
          const fileKey = `uploads/public/${timestamp}-${randomSuffix}-${input.filename}`;
          const buffer = Buffer.from(input.base64Data, 'base64');
          const { url } = await storagePut(fileKey, buffer, input.fileType);
          
          // Store file metadata
          const fileRecord = await db.createUploadedFile({
            filename: input.filename,
            originalFilename: input.filename,
            fileType: input.fileType,
            fileSize: input.fileSize,
            s3Key: fileKey,
            s3Url: url,
            uploadedBy: ctx.user?.id || null,
            description: input.description,
          });
          
          // Generate public download URL
          const publicUrl = `${process.env.NODE_ENV === 'production' ? 'https://climate-risk-dash-40e3582ff948.herokuapp.com' : `http://localhost:${process.env.PORT || 3000}`}/public/files/${fileRecord.id}`;
          
          // 2. Parse company data from file
          const companies = await parseCompanyFile(buffer, input.filename);
          
          // 3. Insert/update companies in database
          for (const company of companies) {
            // Check if company exists
            const existing = await db.getCompanyByIsin(company.isin);
            if (!existing) {
              await db.insertCompany({
                isin: company.isin,
                name: company.name,
                sector: company.sector,
                geography: company.country,
                tangibleAssets: company.tangibleAssets.toString(),
                enterpriseValue: company.enterpriseValue.toString(),
              });
            }
          }
          
          // 4. Fetch assets for all companies (in background)
          const assetResults = [];
          for (const company of companies) {
            try {
              const assets = await fetchCompanyAssets(company.name);
              
              // Get company ID for foreign key
              const companyRecord = await db.getCompanyByIsin(company.isin);
              if (!companyRecord) continue;
              
              for (const asset of assets) {
                await db.insertAsset({
                  companyId: companyRecord.id,
                  assetName: asset.asset_name,
                  address: asset.location,
                  city: asset.city,
                  stateProvince: null,
                  country: asset.country,
                  latitude: asset.latitude?.toString() || null,
                  longitude: asset.longitude?.toString() || null,
                  estimatedValueUsd: asset.estimated_value_usd?.toString() || null,
                  assetType: asset.asset_type,
                });
                
                // Note: We can't easily get the inserted ID without changing insertAsset
                // For now, track by company
                assetResults.push({ companyIsin: company.isin, assetName: asset.asset_name });
              }
            } catch (error) {
              console.error(`[ProcessFile] Error fetching assets for ${company.isin}:`, error);
            }
          }
          
          // 5. Calculate geographic risks for all assets (in background)
          const riskResults = [];
          for (const company of companies) {
            try {
              const companyRecord = await db.getCompanyByIsin(company.isin);
              if (!companyRecord) continue;
              
              const companyAssets = await db.getAssetsByCompanyId(companyRecord.id);
              
              for (const asset of companyAssets) {
                try {
                  // Skip if already has risk data
                  const existingRisk = await db.getGeographicRiskByAssetId(asset.id);
                  if (existingRisk) continue;
                  
                  if (!asset.latitude || !asset.longitude) continue;
                  
                  const riskData = await fetchGeographicRisk(
                    parseFloat(asset.latitude),
                    parseFloat(asset.longitude),
                    parseFloat(asset.estimatedValueUsd || '0')
                  );
                  
                  await db.insertGeographicRisk({
                    assetId: asset.id,
                    latitude: asset.latitude,
                    longitude: asset.longitude,
                    assetValue: asset.estimatedValueUsd || '0',
                    riskData: riskData,
                  });
                  
                  riskResults.push({ assetId: asset.id, success: true });
                } catch (error) {
                  console.error(`[ProcessFile] Error calculating risk for asset ${asset.id}:`, error);
                  riskResults.push({ assetId: asset.id, success: false });
                }
              }
            } catch (error) {
              console.error(`[ProcessFile] Error processing company ${company.isin}:`, error);
            }
          }
          
          // 6. Fetch risk management assessments
          const { fetchRiskManagement } = await import("./services/externalApis");
          const managementResults = [];
          for (const company of companies) {
            try {
              const assessment = await fetchRiskManagement(company.isin);
              
              if (assessment && assessment.company) {
                const companyRecord = await db.getCompanyByIsin(company.isin);
                if (companyRecord) {
                  // Only save if analysis is completed and has a score
                  if (assessment.company.analysisStatus === 'completed' && assessment.company.totalScore !== null) {
                    await db.insertRiskManagement({
                      companyId: companyRecord.id,
                      overallScore: assessment.company.totalScore,
                      assessmentData: assessment,
                    });
                    managementResults.push({ companyIsin: company.isin, success: true, status: 'completed' });
                  } else {
                    // Log companies with pending/idle analysis
                    console.log(`[ProcessFile] ${company.isin} analysis status: ${assessment.company.analysisStatus}`);
                    managementResults.push({ companyIsin: company.isin, success: false, status: assessment.company.analysisStatus });
                  }
                }
              }
            } catch (error) {
              console.error(`[ProcessFile] Error fetching risk management for ${company.isin}:`, error);
              managementResults.push({ companyIsin: company.isin, success: false });
            }
          }
          
          return {
            success: true,
            fileUrl: publicUrl,
            companiesProcessed: companies.length,
            assetsCreated: assetResults.length,
            risksCalculated: riskResults.filter(r => r.success).length,
            managementAssessments: managementResults.filter(r => r.success).length,
          };
        } catch (error) {
          console.error('[ProcessFile] Error:', error);
          throw new Error(error instanceof Error ? error.message : 'Failed to process file');
        }
      }),
  }),

  progress: router({
    /**
     * Get progress for a specific operation
     */
    get: publicProcedure
      .input(z.object({ operationId: z.string() }))
      .query(async ({ input }) => {
        const { progressTracker } = await import('./utils/progressTracker');
        return progressTracker.get(input.operationId);
      }),

    /**
     * Get all active operations
     */
    getAll: publicProcedure.query(async () => {
      const { progressTracker } = await import('./utils/progressTracker');
      return progressTracker.getAll();
    }),

    /**
     * Cancel an operation
     */
    cancel: publicProcedure
      .input(z.object({ operationId: z.string() }))
      .mutation(async ({ input }) => {
        const { progressTracker } = await import('./utils/progressTracker');
        progressTracker.cancel(input.operationId);
        return { success: true, message: 'Operation cancelled' };
      }),

    /**
     * Clear all progress entries (debug endpoint)
     */
    clearAll: publicProcedure.mutation(async () => {
      const { progressTracker } = await import('./utils/progressTracker');
      const all = progressTracker.getAll();
      console.log('[Progress] Clearing all progress entries:', all);
      progressTracker.clearAll();
      return { success: true, cleared: all.length };
    }),
  }),
});

export type AppRouter = typeof appRouter;

