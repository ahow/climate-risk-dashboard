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
                const geoRisk = await db.getGeographicRiskByAssetId(asset.id);
                if (geoRisk && geoRisk.riskData) {
                  const riskData = geoRisk.riskData as any;
                  assetRiskAnnual += riskData.expected_annual_loss || 0;
                  assetRiskPV += riskData.present_value_30yr || 0;
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
        const measures = assessmentData?.measures || [];
        const managementMeasures = measures.map((measure: any) => ({
          measure: measure.measure || measure.category,
          score: measure.score || 0,
          rationale: measure.rationale || measure.explanation || '',
          verbatimQuote: measure.verbatim_quote || measure.quote || '',
          source: measure.source || measure.document || '',
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
    seedCompanies: publicProcedure.mutation(async () => {
      try {
        console.log('[seedCompanies] Starting...');
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
      try {
        // Fetch all assets at once from the API
        const allAssets = await externalApis.fetchAllAssetsFromAPI();
        
        if (allAssets.length === 0) {
          return {
            success: false,
            totalAssetsFetched: 0,
            message: 'No assets returned from API',
          };
        }

        // Get all companies to map assets to company IDs
        const companies = await db.getAllCompanies();
        const companyMap = new Map(companies.map(c => [c.name, c.id]));

        let totalAssetsFetched = 0;
        let skipped = 0;
        const errors: string[] = [];

        // Group assets by company and insert
        const assetsByCompany = new Map<number, any[]>();
        
        for (const asset of allAssets) {
          const companyId = companyMap.get(asset.company_name);
          
          if (!companyId) {
            skipped++;
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
        for (const [companyId, assets] of Array.from(assetsByCompany.entries())) {
          try {
            await db.bulkInsertAssets(assets);
            totalAssetsFetched += assets.length;
          } catch (error) {
            const errorMsg = `Failed to insert assets for company ID ${companyId}: ${error}`;
            console.error(errorMsg);
            errors.push(errorMsg);
          }
        }

        return {
          success: true,
          totalAssetsFetched,
          totalAssetsFromAPI: allAssets.length,
          skipped,
          companiesProcessed: assetsByCompany.size,
          errors,
        };
      } catch (error) {
        console.error('Error in fetchAllAssets:', error);
        return {
          success: false,
          totalAssetsFetched: 0,
          message: `Failed to fetch assets: ${error}`,
        };
      }
    }),

    /**
     * Fetch risk management assessments for all companies
     */
    fetchAllRiskManagement: publicProcedure.mutation(async () => {
      const companies = await db.getAllCompanies();
      let assessmentsFetched = 0;
      const errors: string[] = [];

      for (const company of companies) {
        try {
          const managementData = await externalApis.fetchRiskManagement(company.isin);
          
          if (managementData.measures && managementData.measures.length > 0) {
            await db.insertRiskManagement({
              companyId: company.id,
              overallScore: managementData.summary?.score_percentage || 0,
              assessmentData: managementData as any,
            });
            assessmentsFetched++;
          }
        } catch (error) {
          errors.push(`${company.name}: ${error}`);
        }
      }

      return { 
        success: true, 
        assessmentsFetched, 
        companiesProcessed: companies.length,
        errors 
      };
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
          
          // Calculate expected losses
          const supplierCosts = parseFloat(company.supplierCosts || '0');
          const expectedAnnualLossPct = assessment.climate_risk_detailed.expected_annual_loss_pct;
          const { annualLoss, presentValue } = calculateSupplyChainLoss(supplierCosts, expectedAnnualLossPct);
          
          // Extract top 5 suppliers
          const topSuppliers = assessment.top_suppliers.slice(0, 5);
          
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

        await db.insertRiskManagement({
          companyId: company.id,
          overallScore: managementData.summary?.score_percentage || 0,
          assessmentData: managementData as any,
        });

        return { success: true };
      }),

    /**
     * Calculate geographic risks for all assets with coordinates
     */
    calculateAllGeographicRisks: publicProcedure.mutation(async () => {
      const companies = await db.getAllCompanies();
      let risksCalculated = 0;
      let skipped = 0;
      const errors: string[] = [];

      console.log(`[Geographic Risks] Starting calculation for ${companies.length} companies`);

      for (const company of companies) {
        try {
          const assets = await db.getAssetsByCompanyId(company.id);
          console.log(`[Geographic Risks] Processing ${company.name}: ${assets.length} assets`);
          
          for (const asset of assets) {
            // Only calculate for assets with coordinates and value
            if (asset.latitude && asset.longitude && asset.estimatedValueUsd) {
              try {
                // Check if risk already calculated for this asset
                const existingRisk = await db.getGeographicRiskByAssetId(asset.id);
                if (existingRisk) {
                  skipped++;
                  continue;
                }

                const lat = parseFloat(asset.latitude);
                const lon = parseFloat(asset.longitude);
                const value = parseFloat(asset.estimatedValueUsd);
                
                if (!isNaN(lat) && !isNaN(lon) && !isNaN(value) && value > 0) {
                  console.log(`[Geographic Risks] Calculating for asset ${asset.id}: ${asset.assetName} at (${lat}, ${lon})`);
                  
                  const riskData = await externalApis.fetchGeographicRisk(lat, lon, value);
                  
                  await db.insertGeographicRisk({
                    assetId: asset.id,
                    latitude: lat.toString(),
                    longitude: lon.toString(),
                    assetValue: value.toString(),
                    riskData: riskData as any,
                  });
                  
                  risksCalculated++;
                  console.log(`[Geographic Risks] ✓ Calculated (${risksCalculated} total)`);
                  
                  // Add a small delay to avoid overwhelming the API
                  await new Promise(resolve => setTimeout(resolve, 1000));
                }
              } catch (error) {
                const errorMsg = `Asset ${asset.assetName} (ID: ${asset.id}): ${error}`;
                console.error(`[Geographic Risks] ✗ ${errorMsg}`);
                errors.push(errorMsg);
                // Continue processing other assets even if one fails
              }
            }
          }
        } catch (error) {
          const errorMsg = `Company ${company.name}: ${error}`;
          console.error(`[Geographic Risks] ✗ ${errorMsg}`);
          errors.push(errorMsg);
          // Continue processing other companies even if one fails
        }
      }

      console.log(`[Geographic Risks] Completed: ${risksCalculated} calculated, ${skipped} skipped, ${errors.length} errors`);

      return {
        success: true,
        risksCalculated,
        skipped,
        errors
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
                  
                  // Add delay to avoid overwhelming the API
                  await new Promise(resolve => setTimeout(resolve, 1000));
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
          uploadedBy: ctx.user?.id || null,
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
              
              if (assessment) {
                const companyRecord = await db.getCompanyByIsin(company.isin);
                if (companyRecord) {
                  await db.insertRiskManagement({
                    companyId: companyRecord.id,
                    overallScore: assessment.summary.score_percentage,
                    assessmentData: assessment,
                  });
                  managementResults.push({ companyIsin: company.isin, success: true });
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
});

export type AppRouter = typeof appRouter;

