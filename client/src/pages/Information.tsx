import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Building2,
  MapPin,
  TrendingDown,
  Shield,
  Calculator,
  ArrowRight,
  Globe,
  Factory,
  BarChart3,
  AlertTriangle,
  Link2,
  Layers,
  Search,
  GitBranch,
  Database,
  FileSpreadsheet,
} from "lucide-react";

function SectionCard({ icon: Icon, iconColor, title, children }: { icon: any; iconColor: string; title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className={`h-5 w-5 ${iconColor}`} />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {children}
      </CardContent>
    </Card>
  );
}

function FormulaBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-muted/50 p-4 rounded-lg space-y-2 text-sm font-mono">
      {children}
    </div>
  );
}

export default function Information() {
  return (
    <div className="space-y-8 max-w-4xl mx-auto" data-testid="information-page">
      <div>
        <h1 className="text-2xl font-bold text-foreground" data-testid="text-page-title">
          How the Model Works
        </h1>
        <p className="text-muted-foreground mt-1">
          Understanding the climate risk assessment methodology
        </p>
      </div>

      <SectionCard icon={BarChart3} iconColor="text-primary" title="Overview">
        <p>
          The Climate Risk Dashboard quantifies the financial exposure of publicly traded companies
          to climate-related risks. It combines data from four independent sources to produce a
          single adjusted exposure metric for each company, expressed both in dollar terms and as
          a percentage of enterprise value.
        </p>
        <p>
          The model assesses three dimensions of risk:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div className="flex flex-col gap-2 p-4 rounded-lg border border-border bg-card">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-blue-500" />
              <span className="font-semibold">Direct Risk</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Physical climate hazards affecting company-owned assets (facilities, plants, offices).
              Assessed per-facility using geographic coordinates and scaled to the company's actual asset base.
            </p>
          </div>
          <div className="flex flex-col gap-2 p-4 rounded-lg border border-border bg-card">
            <div className="flex items-center gap-2">
              <Factory className="h-5 w-5 text-orange-500" />
              <span className="font-semibold">Supply Chain Risk</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Indirect exposure through supplier networks, assessed by country and industry sector.
              Scaled by supplier costs with saturation capping for extreme ratios.
            </p>
          </div>
          <div className="flex flex-col gap-2 p-4 rounded-lg border border-border bg-card">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-green-500" />
              <span className="font-semibold">Management Quality</span>
            </div>
            <p className="text-sm text-muted-foreground">
              How well a company manages climate risk across 9 categories and 44 measures.
              Used to adjust the raw exposure downward by up to 70%.
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard icon={Calculator} iconColor="text-primary" title="The Calculation Pipeline">
        <div className="space-y-2">
          <h3 className="font-semibold flex items-center gap-2">
            <Badge variant="outline">Step 1</Badge>
            Company Data Ingestion
          </h3>
          <p className="text-sm text-muted-foreground">
            Companies are loaded from an uploaded spreadsheet containing ISIN codes, total asset
            values, enterprise values (EV), supplier costs, sector, and country. These financial
            figures anchor all subsequent risk calculations. All values are stored and processed
            in US dollars with no currency conversion.
          </p>
          <p className="text-sm text-muted-foreground">
            The system validates country data against ISIN prefixes. For example, a company with
            an ISIN starting "US" will have its country corrected to "United States" if mismatched.
            Offshore registrations (Cayman Islands, Bermuda, etc.) are excluded from this correction.
          </p>
        </div>

        <Separator />

        <div className="space-y-2">
          <h3 className="font-semibold flex items-center gap-2">
            <Badge variant="outline">Step 2</Badge>
            Asset Location Discovery
          </h3>
          <p className="text-sm text-muted-foreground">
            The Asset Locations API is queried by ISIN to retrieve the geographic coordinates and
            estimated values of each company's physical facilities. The API returns synthetic
            facility-level valuations that may sum to more or less than the company's actual total
            asset value.
          </p>
        </div>

        <Separator />

        <div className="space-y-2">
          <h3 className="font-semibold flex items-center gap-2">
            <Badge variant="outline">Step 3</Badge>
            Geographic (Direct) Risk Assessment
          </h3>
          <p className="text-sm text-muted-foreground">
            Each facility is submitted to the Climate Risk API with its coordinates and value.
            The API returns Expected Annual Loss (EAL) for five climate hazards: flood, drought,
            heat stress, hurricane, and extreme precipitation. These are converted to a 30-year
            Present Value (PV).
          </p>
          <div className="space-y-2 mt-2">
            <p className="text-sm font-medium">Geo Scaling Factor:</p>
            <FormulaBlock>
              <p>geoScaleFactor = company.totalAssetValue / SUM(API asset values)</p>
            </FormulaBlock>
            <p className="text-sm text-muted-foreground">
              This factor is always applied bidirectionally — it scales risk down when the API
              overestimates asset values, and scales up when the API underestimates. If the API
              returns no assets, the factor is 0. This ensures geographic risk PV is always
              proportional to the company's actual reported asset base.
            </p>
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <h3 className="font-semibold flex items-center gap-2">
            <Badge variant="outline">Step 4</Badge>
            Supply Chain (Indirect) Risk Assessment
          </h3>
          <p className="text-sm text-muted-foreground">
            The Supply Chain Risk API assesses indirect climate exposure based on the company's
            country (ISO3 code) and industry sector (ISIC code). It returns a Present Value of
            expected loss per $1 billion of supplier exposure, covering five risk dimensions:
            climate, water stress, nature loss, modern slavery, and political risk.
          </p>
          <p className="text-sm text-muted-foreground">
            Only the <span className="font-medium">indirect risk</span> component is used from this API, since direct climate risk on
            owned assets is already captured by the geographic risk assessment in Step 3. Using
            both would double-count.
          </p>

          <div className="space-y-2 mt-2">
            <p className="text-sm font-medium">Linear Scaling:</p>
            <FormulaBlock>
              <p>scaleFactor = supplierCosts / $1,000,000,000</p>
              <p>Supply Chain PV = API.indirect_risk.present_value × scaleFactor</p>
            </FormulaBlock>
          </div>

          <div className="space-y-2 mt-2">
            <p className="text-sm font-medium">Saturation Scaling (when supplierCosts / EV &gt; 1):</p>
            <FormulaBlock>
              <p>costToEV = supplierCosts / EV</p>
              <p>effectiveScale = (EV / $1B) × (1 − e<sup>−costToEV</sup>)</p>
              <p>Supply Chain PV = API.indirect_risk.present_value × effectiveScale</p>
            </FormulaBlock>
            <p className="text-sm text-muted-foreground">
              When a company's supplier costs significantly exceed its enterprise value,
              linear scaling would produce unrealistically high risk figures. The saturation
              formula uses an exponential cap that approaches EV as the limit, preventing
              supply chain risk from exceeding what the company could plausibly sustain. This
              affects companies like utilities with very high supplier cost to EV ratios.
            </p>
          </div>

          <div className="space-y-2 mt-2">
            <p className="text-sm font-medium">Legacy API Handling:</p>
            <p className="text-sm text-muted-foreground">
              Older API versions without a <code className="bg-muted px-1 py-0.5 rounded text-xs">present_value</code> field
              use a PV conversion factor of 13.57 applied to the annual loss, and scale
              per $1 million (instead of $1 billion). The same saturation logic applies.
            </p>
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <h3 className="font-semibold flex items-center gap-2">
            <Badge variant="outline">Step 5</Badge>
            Management Performance Scoring
          </h3>
          <p className="text-sm text-muted-foreground">
            The Management Performance API scores each company across 9 categories and 44 individual
            measures of climate risk management quality. The total score is expressed as a percentage
            (e.g., 27 means 27% of maximum possible score).
          </p>
          <p className="text-sm text-muted-foreground">
            When ISIN lookup fails, a name-matching fallback is used. The system matches companies
            by comparing significant tokens (words of 3+ characters) between the query and the API
            database, requiring at least 2 matching tokens to confirm identity. This handles
            cross-listing differences (e.g., a company listed under both GB and AU ISINs) while
            avoiding false positives between similarly-named but different companies.
          </p>
        </div>

        <Separator />

        <div className="space-y-2">
          <h3 className="font-semibold flex items-center gap-2">
            <Badge variant="outline">Step 6</Badge>
            Adjusted Exposure Calculation
          </h3>
          <p className="text-sm text-muted-foreground">
            The three components are combined into a final adjusted exposure:
          </p>
          <FormulaBlock>
            <p>Total Exposure PV = Direct Risk PV + Supply Chain Risk PV</p>
            <p>Adjusted Exposure PV = Total Exposure PV × (1 − 0.7 × Management Score %)</p>
            <p>Valuation Exposure % = Adjusted Exposure PV / Enterprise Value × 100</p>
          </FormulaBlock>
          <p className="text-sm text-muted-foreground">
            The management score acts as a mitigating factor: a company with a 100% management score
            would see its exposure reduced by 70%. The remaining 30% represents residual risk that
            cannot be fully mitigated through management practices alone. Companies without a
            management score receive no adjustment (conservative approach — full exposure is used).
          </p>
        </div>
      </SectionCard>

      <SectionCard icon={Search} iconColor="text-primary" title="ISIC Sector Classification">
        <p className="text-sm text-muted-foreground">
          The Supply Chain API requires an ISIC Rev. 4 sector code. The system uses a three-tier
          classification to find the best match for each company:
        </p>

        <div className="space-y-3 mt-2">
          <div className="p-3 rounded-lg border border-border">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <Badge variant="outline" className="text-xs">Tier 1</Badge>
              L4 Sub-Sector Mapping
            </h4>
            <p className="text-xs text-muted-foreground mt-1">
              Uses spreadsheet L4 sub-sector fields (available for Industrials, Energy, Financials) for
              precise ISIC code assignment. For example, "Oil & Gas Exploration" maps directly to B06.
            </p>
          </div>

          <div className="p-3 rounded-lg border border-border">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <Badge variant="outline" className="text-xs">Tier 2</Badge>
              Company Name Keywords
            </h4>
            <p className="text-xs text-muted-foreground mt-1">
              Analyses the company name for industry-specific keywords. For example, automobile
              manufacturers are classified as C29 (Motor vehicles), hotel/restaurant companies
              as I (Accommodation & food), and homebuilders as F (Construction).
            </p>
          </div>

          <div className="p-3 rounded-lg border border-border">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <Badge variant="outline" className="text-xs">Tier 3</Badge>
              Direct Sector Name Mapping
            </h4>
            <p className="text-xs text-muted-foreground mt-1">
              Over 70 sector name to ISIC code mappings, sorted by specificity (longest match first).
              Covers major industry classifications like Energy, Materials, Industrials, Consumer Staples, etc.
            </p>
          </div>

          <div className="p-3 rounded-lg border border-border">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <Badge variant="outline" className="text-xs">Fallback</Badge>
              Fuzzy Matching
            </h4>
            <p className="text-xs text-muted-foreground mt-1">
              When no exact match is found, the system tokenises the sector name and scores it against
              keyword descriptions for 42 ISIC codes. Scoring uses exact-token matches (3 pts),
              multi-word phrase matches (3 pts × word count), and stem-prefix matches for 4+ character
              tokens (1 pt). Scores are normalised by the square root of keyword count. The best match
              is automatically added to the runtime mapping table.
            </p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mt-2">
          ISIC codes are recalculated during "Process All" bulk reprocessing, ensuring new
          mappings are applied retroactively.
        </p>
      </SectionCard>

      <SectionCard icon={Globe} iconColor="text-primary" title="Data Sources">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-lg border border-border">
            <h4 className="font-semibold text-sm">Asset Locations API</h4>
            <p className="text-xs text-muted-foreground mt-1">
              Provides physical facility locations and estimated valuations for each company by ISIN code.
              Returns synthetic per-facility values that are corrected by the geo scaling factor.
            </p>
            <p className="text-xs text-muted-foreground mt-1 font-mono">
              GET /api/assets/isin/&#123;isin&#125;
            </p>
          </div>
          <div className="p-4 rounded-lg border border-border">
            <h4 className="font-semibold text-sm">Climate Risk API V6</h4>
            <p className="text-xs text-muted-foreground mt-1">
              Probabilistic climate hazard assessment for specific geographic coordinates. Returns
              expected annual losses and 30-year present values across five hazard types: flood,
              drought, heat stress, hurricane, and extreme precipitation.
            </p>
            <p className="text-xs text-muted-foreground mt-1 font-mono">
              POST /assess
            </p>
          </div>
          <div className="p-4 rounded-lg border border-border">
            <h4 className="font-semibold text-sm">Supply Chain Risk API</h4>
            <p className="text-xs text-muted-foreground mt-1">
              Multi-dimensional supply chain risk assessment by country (ISO3) and sector (ISIC code).
              Covers climate, water stress, nature loss, modern slavery, and political risk dimensions.
              Includes tier-level breakdowns showing upstream supplier risk contributions.
            </p>
            <p className="text-xs text-muted-foreground mt-1 font-mono">
              GET /api/assess?country=&#123;ISO3&#125;&amp;sector=&#123;ISIC&#125;
            </p>
          </div>
          <div className="p-4 rounded-lg border border-border">
            <h4 className="font-semibold text-sm">Management Performance API</h4>
            <p className="text-xs text-muted-foreground mt-1">
              Scores company climate risk management quality across 9 categories and 44 measures.
              Returns a total percentage score used as a mitigation factor. Includes name-matching
              fallback for cross-listed companies.
            </p>
            <p className="text-xs text-muted-foreground mt-1 font-mono">
              GET /api/lookup/&#123;isin&#125;
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard icon={AlertTriangle} iconColor="text-amber-500" title="Data Quality Controls">
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="font-semibold text-sm">Automated Data Quality Warnings</h3>
            <p className="text-sm text-muted-foreground">
              The system automatically flags companies with anomalous financial data that may affect
              the reliability of risk calculations. Warning indicators appear as amber triangles on
              the dashboard and as a banner on the company detail page.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
              <div className="p-3 rounded border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 text-sm">
                <span className="font-medium">EV unusually low</span>
                <p className="text-xs text-muted-foreground mt-0.5">Enterprise value below $10M — may indicate data error or micro-cap outside model scope</p>
              </div>
              <div className="p-3 rounded border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 text-sm">
                <span className="font-medium">EV unusually high</span>
                <p className="text-xs text-muted-foreground mt-0.5">Enterprise value above $5T — may indicate data entry error (units mismatch)</p>
              </div>
              <div className="p-3 rounded border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 text-sm">
                <span className="font-medium">Supplier Costs / EV ratio</span>
                <p className="text-xs text-muted-foreground mt-0.5">Supplier costs exceeding 100x EV — triggers saturation scaling and may indicate data quality issues</p>
              </div>
              <div className="p-3 rounded border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 text-sm">
                <span className="font-medium">Total assets unusually high</span>
                <p className="text-xs text-muted-foreground mt-0.5">Total assets above $1T — may indicate data entry error</p>
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <h3 className="font-semibold text-sm">Country Validation</h3>
            <p className="text-sm text-muted-foreground">
              The system validates and corrects company country assignments using ISIN prefixes. For
              example, a US-domiciled company with a mismatched country field will be corrected
              automatically. Offshore jurisdictions (Cayman Islands, Bermuda, Jersey, etc.) are
              excluded from this correction as companies registered there typically operate elsewhere.
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            <h3 className="font-semibold text-sm">Incomplete Company Filtering</h3>
            <p className="text-sm text-muted-foreground">
              Companies missing any of the three core financial inputs (total asset value, supplier
              costs, or enterprise value) are excluded from dashboard totals by default. A toggle
              allows users to include these companies if desired. Financial sector companies can
              also be excluded, as their asset structures differ materially from industrial companies.
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            <h3 className="font-semibold text-sm">Supply Chain API Result Caching</h3>
            <p className="text-sm text-muted-foreground">
              During batch processing, supply chain API results are cached per country and sector
              combination. This ensures all companies with the same country and sector receive
              identical raw risk values within a single processing run, eliminating inconsistencies
              caused by the API's approximately 25% inter-call variability.
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard icon={Layers} iconColor="text-primary" title="Processing Architecture">
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="font-semibold text-sm">Batch Processing</h3>
            <p className="text-sm text-muted-foreground">
              Company risk assessments are processed in batches via the Calculation Monitor page.
              Two processing modes are available:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
              <div className="p-3 rounded-lg border border-border">
                <span className="font-medium text-sm">Process Missing</span>
                <p className="text-xs text-muted-foreground mt-1">
                  Processes only companies that have incomplete risk data (missing geographic risk,
                  supply chain risk, or management score). Useful for incremental updates.
                </p>
              </div>
              <div className="p-3 rounded-lg border border-border">
                <span className="font-medium text-sm">Process All</span>
                <p className="text-xs text-muted-foreground mt-1">
                  Full reprocessing of all companies. Recalculates ISIC sector codes, refreshes
                  all API data, and re-syncs company fields from the latest spreadsheet upload.
                  Use after uploading new spreadsheet data or updating sector mappings.
                </p>
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <h3 className="font-semibold text-sm">Per-Company Processing Steps</h3>
            <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
              <li>Validate and correct country from ISIN prefix</li>
              <li>Sync company name, sector, and financial data from latest spreadsheet</li>
              <li>Calculate ISIC sector code using three-tier classification</li>
              <li>Fetch asset locations from the Asset Locations API</li>
              <li>Assess geographic risk for each facility via the Climate Risk API</li>
              <li>Assess supply chain risk via the Supply Chain Risk API (with batch caching)</li>
              <li>Fetch management performance score (with name-matching fallback)</li>
            </ol>
          </div>

          <Separator />

          <div className="space-y-2">
            <h3 className="font-semibold text-sm">Reliability Features</h3>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li>Pause and resume long-running batch operations with progress preserved</li>
              <li>Automatic retry with exponential backoff for API failures</li>
              <li>Auto-recovery of orphaned operations after server restart</li>
              <li>Database connection pooling (max 5 connections) for managed load</li>
              <li>Real-time progress tracking on the Calculation Monitor page</li>
            </ul>
          </div>
        </div>
      </SectionCard>

      <SectionCard icon={FileSpreadsheet} iconColor="text-primary" title="Dashboard Metrics">
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="font-semibold text-sm">Summary Cards</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-summary-metrics">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Metric</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/50"><td className="py-2 px-3 font-medium">Companies</td><td className="py-2 px-3 text-muted-foreground">Count of companies in the filtered view</td></tr>
                  <tr className="border-b border-border/50"><td className="py-2 px-3 font-medium">Total Asset Value</td><td className="py-2 px-3 text-muted-foreground">Sum of total asset values for filtered companies</td></tr>
                  <tr className="border-b border-border/50"><td className="py-2 px-3 font-medium">Direct Risk PV</td><td className="py-2 px-3 text-muted-foreground">Sum of geographic risk PVs (with % of total exposure)</td></tr>
                  <tr className="border-b border-border/50"><td className="py-2 px-3 font-medium">Supply Chain Risk PV</td><td className="py-2 px-3 text-muted-foreground">Sum of supply chain risk PVs (with % of total exposure)</td></tr>
                  <tr className="border-b border-border/50"><td className="py-2 px-3 font-medium">Total Exposure PV</td><td className="py-2 px-3 text-muted-foreground">Combined direct + supply chain risk PV</td></tr>
                  <tr className="border-b border-border/50"><td className="py-2 px-3 font-medium">Supplier Costs</td><td className="py-2 px-3 text-muted-foreground">Sum of supplier costs for filtered companies</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <h3 className="font-semibold text-sm">Per-Company Table Columns</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-column-descriptions">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Column</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/50"><td className="py-2 px-3 font-medium">Company</td><td className="py-2 px-3 text-muted-foreground">Company name, ISIN, sector. Amber triangle indicates data quality warnings (hover for details).</td></tr>
                  <tr className="border-b border-border/50"><td className="py-2 px-3 font-medium">Total Assets</td><td className="py-2 px-3 text-muted-foreground">Company's total reported asset value from spreadsheet</td></tr>
                  <tr className="border-b border-border/50"><td className="py-2 px-3 font-medium">EV</td><td className="py-2 px-3 text-muted-foreground">Enterprise Value — market cap + debt − cash</td></tr>
                  <tr className="border-b border-border/50"><td className="py-2 px-3 font-medium">Geo PV</td><td className="py-2 px-3 text-muted-foreground">Geographic (direct) risk present value, with geo scaling factor applied</td></tr>
                  <tr className="border-b border-border/50"><td className="py-2 px-3 font-medium">SC PV</td><td className="py-2 px-3 text-muted-foreground">Supply chain (indirect) risk present value, with saturation scaling where applicable</td></tr>
                  <tr className="border-b border-border/50"><td className="py-2 px-3 font-medium">Total PV</td><td className="py-2 px-3 text-muted-foreground">Geo PV + SC PV combined</td></tr>
                  <tr className="border-b border-border/50"><td className="py-2 px-3 font-medium">Mgmt</td><td className="py-2 px-3 text-muted-foreground">Management performance score as percentage (directly from API)</td></tr>
                  <tr className="border-b border-border/50"><td className="py-2 px-3 font-medium">Adj PV</td><td className="py-2 px-3 text-muted-foreground">Total PV adjusted by management score (up to 70% reduction)</td></tr>
                  <tr className="border-b border-border/50"><td className="py-2 px-3 font-medium">Val%</td><td className="py-2 px-3 text-muted-foreground">Adjusted PV as percentage of Enterprise Value — enables cross-company comparison</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <h3 className="font-semibold text-sm">Company Detail View</h3>
            <p className="text-sm text-muted-foreground">
              Clicking a company opens a detailed breakdown showing:
            </p>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1 mt-1">
              <li>Data quality warning banner (if applicable) highlighting anomalous financial data</li>
              <li>Summary cards for total asset value, geographic risk PV, supply chain PV, and management score</li>
              <li>Full breakdown of geographic risk by facility and hazard type</li>
              <li>Supply chain risk breakdown by hazard category and risk dimension scores (1–5)</li>
              <li>Tier-level supply chain breakdown showing upstream supplier risk contributions</li>
              <li>Top upstream suppliers ranked by climate risk contribution</li>
              <li>Management performance scores across all 9 categories and 44 measures</li>
              <li>Complete calculation chain from raw API values to final adjusted exposure</li>
            </ul>
          </div>

          <Separator />

          <div className="space-y-2">
            <h3 className="font-semibold text-sm">CSV Export</h3>
            <p className="text-sm text-muted-foreground">
              All company risk data can be exported as CSV, with filters matching the dashboard:
              exclude incomplete companies (default on), exclude financial sector companies, and
              all scaling factors (geo scaling, saturation scaling) applied to exported values.
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard icon={TrendingDown} iconColor="text-primary" title="Key Assumptions & Limitations">
        <ul className="space-y-3 text-sm text-muted-foreground list-disc list-inside">
          <li>
            <span className="font-medium text-foreground">Currency:</span> All financial values are in US dollars. No currency conversion is applied.
            Companies reporting in other currencies may have translation effects not captured.
          </li>
          <li>
            <span className="font-medium text-foreground">Synthetic Asset Valuations:</span> The Asset Locations API does not provide actual facility values.
            Its synthetic allocations are corrected by the bidirectional geo scaling factor, but the
            geographic distribution of assets may not perfectly reflect reality.
          </li>
          <li>
            <span className="font-medium text-foreground">Supply Chain Indirect Only:</span> Only the indirect risk component is used. Direct risk from the same
            API is excluded to avoid double-counting with the geographic assessment.
          </li>
          <li>
            <span className="font-medium text-foreground">Saturation Scaling:</span> The exponential saturation formula caps supply chain risk for
            companies with extreme supplier cost to EV ratios. While mathematically sound, it
            represents a modelling choice about maximum plausible exposure.
          </li>
          <li>
            <span className="font-medium text-foreground">Management Mitigation Cap:</span> The maximum 70% mitigation effect assumes even
            perfect management cannot fully eliminate climate exposure. The 30% residual is a
            model assumption.
          </li>
          <li>
            <span className="font-medium text-foreground">30-Year Horizon:</span> All present values use a 30-year horizon with growth and discount rates
            embedded in the external APIs. These rates are not user-configurable.
          </li>
          <li>
            <span className="font-medium text-foreground">Sector Mapping Granularity:</span> While the three-tier ISIC classification with fuzzy matching
            significantly improves accuracy, some sector assignments may still be approximate for
            highly diversified conglomerates.
          </li>
          <li>
            <span className="font-medium text-foreground">Management Score Coverage:</span> Not all companies have management performance data in the API.
            Companies without scores receive no mitigation adjustment (conservative approach).
          </li>
          <li>
            <span className="font-medium text-foreground">API Variability:</span> Supply Chain API values can vary approximately 25% between calls for the
            same inputs due to live climate data caching. Batch caching within processing runs
            ensures internal consistency, but values may differ between runs.
          </li>
          <li>
            <span className="font-medium text-foreground">Static Financial Data:</span> Company financial data is loaded from point-in-time spreadsheet
            uploads and does not update automatically. Use "Process All" after uploading new data.
          </li>
          <li>
            <span className="font-medium text-foreground">Climate Scenarios:</span> The underlying Climate Risk API uses a specific climate scenario and
            time horizon. The model does not currently support scenario comparison (e.g., RCP 4.5 vs RCP 8.5).
          </li>
        </ul>
      </SectionCard>
    </div>
  );
}
