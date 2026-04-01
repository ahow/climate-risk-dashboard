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
} from "lucide-react";

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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
              </p>
            </div>
            <div className="flex flex-col gap-2 p-4 rounded-lg border border-border bg-card">
              <div className="flex items-center gap-2">
                <Factory className="h-5 w-5 text-orange-500" />
                <span className="font-semibold">Supply Chain Risk</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Indirect exposure through supplier networks, assessed by country and industry sector.
              </p>
            </div>
            <div className="flex flex-col gap-2 p-4 rounded-lg border border-border bg-card">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-green-500" />
                <span className="font-semibold">Management Quality</span>
              </div>
              <p className="text-sm text-muted-foreground">
                How well a company manages climate risk, used to adjust the raw exposure downward.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            The Calculation Pipeline
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <h3 className="font-semibold flex items-center gap-2">
              <Badge variant="outline">Step 1</Badge>
              Company Data Ingestion
            </h3>
            <p className="text-sm text-muted-foreground">
              Companies are loaded from an uploaded spreadsheet containing ISIN codes, total asset
              values, enterprise values (EV), and supplier costs. These financial figures anchor all
              subsequent risk calculations.
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
              facility-level valuations that may sum to more than the company's actual total asset
              value.
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
            <p className="text-sm text-muted-foreground">
              Because the Asset API's synthetic values can exceed the company's actual total assets,
              a scaling factor is applied: <code className="bg-muted px-1 py-0.5 rounded text-xs">geoScaleFactor = totalAssetValue / sumOfAPIAssetValues</code>.
              This ensures the geographic risk PV is proportional to the company's real asset base.
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            <h3 className="font-semibold flex items-center gap-2">
              <Badge variant="outline">Step 4</Badge>
              Supply Chain (Indirect) Risk Assessment
            </h3>
            <p className="text-sm text-muted-foreground">
              The Supply Chain Risk API assesses indirect climate exposure based on the company's
              country and industry sector. It returns a Present Value of expected loss per $1 billion
              of supplier exposure, covering five hazard categories. This is scaled by the company's
              actual supplier costs to produce a dollar-denominated PV.
            </p>
            <p className="text-sm text-muted-foreground">
              Only the indirect risk component is used from this API, since direct climate risk on
              owned assets is already captured by the geographic risk assessment in Step 3.
            </p>
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
            <div className="bg-muted/50 p-4 rounded-lg space-y-2 text-sm font-mono">
              <p>Total Exposure PV = Direct Risk PV + Supply Chain Risk PV</p>
              <p>Adjusted Exposure PV = Total Exposure PV × (1 − 0.7 × Management Score %)</p>
              <p>Valuation Exposure % = Adjusted Exposure PV / Enterprise Value × 100</p>
            </div>
            <p className="text-sm text-muted-foreground">
              The management score acts as a mitigating factor: a company with a 100% management score
              would see its exposure reduced by 70%. The remaining 30% represents residual risk that
              cannot be fully mitigated through management practices alone.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Data Sources
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg border border-border">
                <h4 className="font-semibold text-sm">Asset Locations API</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Provides physical facility locations and estimated valuations for each company by ISIN code.
                </p>
              </div>
              <div className="p-4 rounded-lg border border-border">
                <h4 className="font-semibold text-sm">Climate Risk API V6</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Probabilistic climate hazard assessment for specific geographic coordinates, returning
                  expected annual losses across five hazard types.
                </p>
              </div>
              <div className="p-4 rounded-lg border border-border">
                <h4 className="font-semibold text-sm">Supply Chain Risk API</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Multi-dimensional supply chain risk assessment by country (ISO3) and sector (ISIC code),
                  including climate, political, nature loss, and water stress dimensions.
                </p>
              </div>
              <div className="p-4 rounded-lg border border-border">
                <h4 className="font-semibold text-sm">Management Performance API</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Scores company climate risk management quality across 9 categories and 44 measures,
                  producing an overall percentage score.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-primary" />
            Key Assumptions & Limitations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-2 text-sm text-muted-foreground list-disc list-inside">
            <li>
              All financial values are in US dollars. No currency conversion is applied.
            </li>
            <li>
              The Asset Locations API returns synthetic facility valuations. The geo scaling factor
              ensures the total geographic risk is proportional to the company's reported total
              asset value, not the API's estimates.
            </li>
            <li>
              Supply Chain Risk uses only the indirect risk component. Direct risk from the same
              API is excluded to avoid double-counting with the geographic assessment.
            </li>
            <li>
              The management score adjustment assumes a maximum 70% mitigation effect. Even
              perfect management cannot fully eliminate climate exposure.
            </li>
            <li>
              Present Values use a 30-year horizon with growth and discount rates embedded in the
              Climate Risk API's calculations.
            </li>
            <li>
              Companies without complete financial data (total asset value, supplier costs, or
              enterprise value) are excluded from dashboard totals by default, as their risk
              calculations cannot be properly scaled.
            </li>
            <li>
              Supply Chain API values can vary approximately 25% between calls for the same
              inputs, due to live climate data caching at the API level.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
