import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import * as externalApis from "./services/externalApis";

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
     * Get all companies
     */
    list: publicProcedure.query(async () => {
      const companies = await db.getAllCompanies();
      return companies;
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
     * Get company with all related data (assets, risks, management scores)
     */
    getFullDetails: publicProcedure
      .input(z.object({ isin: z.string() }))
      .query(async ({ input }) => {
        const company = await db.getCompanyByIsin(input.isin);
        if (!company) {
          throw new Error(`Company not found: ${input.isin}`);
        }

        const assets = await db.getAssetsByCompanyId(company.id);
        const riskManagement = await db.getRiskManagementByCompanyId(company.id);

        // Fetch geographic risks for each asset
        const assetsWithRisks = await Promise.all(
          assets.map(async (asset) => {
            const geoRisk = await db.getGeographicRiskByAssetId(asset.id);
            return {
              ...asset,
              geographicRisk: geoRisk,
            };
          })
        );

        return {
          company,
          assets: assetsWithRisks,
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
     */
    seedCompanies: publicProcedure.mutation(async () => {
      const fs = await import('fs/promises');
      const companiesData = JSON.parse(
        await fs.readFile('/home/ubuntu/companies_seed.json', 'utf-8')
      );
      
      await db.bulkInsertCompanies(companiesData);
      
      return { success: true, count: companiesData.length };
    }),

    /**
     * Fetch assets for all companies from Asset Discovery API
     */
    fetchAllAssets: publicProcedure.mutation(async () => {
      const companies = await db.getAllCompanies();
      let totalAssetsFetched = 0;
      const errors: string[] = [];

      for (const company of companies) {
        try {
          const assetData = await externalApis.fetchCompanyAssets(company.name);
          
          if (assetData.length > 0) {
            const assetsToInsert = assetData.map(asset => ({
              companyId: company.id,
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
              dataSources: asset.description || 'Asset Discovery API',
              confidenceLevel: asset.geocoding_certainty?.toString() || null,
            }));

            await db.bulkInsertAssets(assetsToInsert);
            totalAssetsFetched += assetsToInsert.length;
          }
        } catch (error) {
          errors.push(`${company.name}: ${error}`);
        }
      }

      return { 
        success: true, 
        totalAssetsFetched, 
        companiesProcessed: companies.length,
        errors 
      };
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
  }),
});

export type AppRouter = typeof appRouter;

