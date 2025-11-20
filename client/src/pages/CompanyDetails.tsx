import { Button } from "@/components/ui/button";
import { AssetMap } from "@/components/AssetMap";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  ChevronDown,
  ChevronUp,
  FileText,
  Globe,
  Loader2,
  MapPin,
  Shield,
  TrendingDown,
} from "lucide-react";
import { useState } from "react";
import { useLocation, useRoute } from "wouter";

export default function CompanyDetails() {
  const [, params] = useRoute("/company/:isin");
  const [, setLocation] = useLocation();
  const isin = params?.isin || "";

  const [assetsOpen, setAssetsOpen] = useState(true);
  const [supplyChainOpen, setSupplyChainOpen] = useState(true);
  const [managementOpen, setManagementOpen] = useState(true);

  const { data: fullDetails, isLoading, error } = trpc.companies.getFullDetails.useQuery(
    { isin },
    { enabled: !!isin }
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading company details...</p>
        </div>
      </div>
    );
  }

  if (error || !fullDetails) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">Error</CardTitle>
            <CardDescription>Failed to load company details</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">{error?.message || "Company not found"}</p>
            <Button onClick={() => setLocation("/")}>Back to Companies</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { company, assets, topSupplyChainContributors, managementMeasures } = fullDetails;
  const supplyChainRisks = topSupplyChainContributors || [];

  // Calculate totals
  const assetRiskAnnual = assets.reduce((sum, asset) => sum + (asset.expectedAnnualLoss || 0), 0);
  const supplyChainRiskAnnual = supplyChainRisks.reduce((sum: number, risk: any) => sum + (risk.expectedAnnualLoss || 0), 0);
  const totalRiskAnnual = assetRiskAnnual + supplyChainRiskAnnual;
  
  // Management score calculation
  const totalPoints = managementMeasures.reduce((sum: number, m: any) => sum + (m.maxPoints || 0), 0);
  const earnedPoints = managementMeasures.reduce((sum: number, m: any) => sum + (m.score || 0), 0);
  const managementScorePct = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0;
  
  // Net expected loss with management adjustment
  const managementFactor = 1 - (managementScorePct / 100) * 0.7; // 100% score → 30% of risk, 0% score → 100% of risk
  const netExpectedLoss = totalRiskAnnual * managementFactor;
  const netExpectedLossPctOfEV = company.enterpriseValue 
    ? (netExpectedLoss / parseFloat(company.enterpriseValue)) * 100 
    : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 py-4">
          <Button
            variant="ghost"
            onClick={() => setLocation("/")}
            className="mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Companies
          </Button>
          <div className="flex items-start gap-4">
            <Building2 className="h-10 w-10 text-indigo-600 mt-1" />
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900">{company.name}</h1>
              <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-600">
                <span className="font-mono">{company.isin}</span>
                <span>•</span>
                <span>{company.geography}</span>
                <span>•</span>
                <span>{company.sector?.split(',')[0]}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        {/* Overall Summary Card */}
        <Card className="border-2 border-indigo-200 bg-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="h-6 w-6 text-indigo-600" />
              Climate Risk Analysis Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
              <div>
                <div className="text-sm text-gray-600 mb-1">Asset Risk (Annual)</div>
                <div className="text-2xl font-bold text-gray-900">
                  ${assetRiskAnnual.toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">Supply Chain Risk</div>
                <div className="text-2xl font-bold text-gray-900">
                  ${supplyChainRiskAnnual.toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">Total Risk (Annual)</div>
                <div className="text-2xl font-bold text-orange-600">
                  ${totalRiskAnnual.toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">Management Score</div>
                <div className="text-2xl font-bold text-green-600">{managementScorePct.toFixed(0)}%</div>
                <div className="text-xs text-gray-500 mt-1">
                  {earnedPoints}/{totalPoints} points
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">Net Expected Loss</div>
                <div className="text-2xl font-bold text-red-600">
                  ${netExpectedLoss.toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {netExpectedLossPctOfEV.toFixed(2)}% of EV
                </div>
              </div>
            </div>
            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <div className="text-sm font-medium text-blue-900 mb-2">Calculation Logic:</div>
              <div className="text-sm text-blue-800 space-y-1">
                <div>1. Total Risk = Asset Risk + Supply Chain Risk</div>
                <div>2. Management Adjustment Factor = 1 - (Management Score% × 0.7)</div>
                <div>3. Net Expected Loss = Total Risk × Management Adjustment Factor</div>
                <div className="text-xs text-blue-600 mt-2">
                  * 100% management score reduces risk to 30%, 0% score keeps risk at 100%
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Assets Section */}
        <Collapsible open={assetsOpen} onOpenChange={setAssetsOpen}>
          <Card>
            <CollapsibleTrigger className="w-full">
              <CardHeader className="cursor-pointer hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-indigo-600" />
                    Asset Locations & Risk Breakdown
                  </CardTitle>
                  {assetsOpen ? (
                    <ChevronUp className="h-5 w-5 text-gray-500" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-gray-500" />
                  )}
                </div>
                <CardDescription>
                  {assets.length} assets identified • Total annual loss: ${assetRiskAnnual.toLocaleString()}
                </CardDescription>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                {assets.length === 0 ? (
                  <div className="text-center py-8 text-gray-600">
                    <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-yellow-500" />
                    <p>No asset data available for this company.</p>
                    <p className="text-sm mt-2">Asset data needs to be fetched from the Asset Discovery API.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Interactive Map */}
                    <div>
                      <h3 className="text-lg font-semibold mb-4">Asset Locations Map</h3>
                      <AssetMap 
                        assets={assets.map(a => ({
                          id: a.id,
                          facilityName: a.name,
                          latitude: a.latitude ? parseFloat(a.latitude) : null,
                          longitude: a.longitude ? parseFloat(a.longitude) : null,
                          expectedAnnualLoss: a.expectedAnnualLoss,
                          hazardBreakdown: a.hazardBreakdown
                        }))}
                        companyName={company.name}
                      />
                    </div>
                    
                    {/* Asset Details Table */}
                    <div>
                      <h3 className="text-lg font-semibold mb-4">Asset Details & Risk Breakdown</h3>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Asset Name</TableHead>
                              <TableHead>Coordinates</TableHead>
                              <TableHead className="text-right">Flood</TableHead>
                              <TableHead className="text-right">Wildfire</TableHead>
                              <TableHead className="text-right">Heat Stress</TableHead>
                              <TableHead className="text-right">Extreme Precip</TableHead>
                              <TableHead className="text-right">Hurricane</TableHead>
                              <TableHead className="text-right">Drought</TableHead>
                              <TableHead className="text-right">Total Loss</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {assets.map((asset) => {
                              const riskBreakdown = asset.hazardBreakdown || {};
                              const totalLoss = asset.expectedAnnualLoss || 0;

                              const formatRisk = (value: number | undefined) => {
                                if (!value || value === 0) return <span className="text-gray-400">$0</span>;
                                return (
                                  <span className="text-orange-600">
                                    ${value.toLocaleString(undefined, {
                                      minimumFractionDigits: 0,
                                      maximumFractionDigits: 0,
                                    })}
                                  </span>
                                );
                              };

                              return (
                                <TableRow key={asset.id}>
                                  <TableCell className="font-medium">
                                    <div>{asset.name}</div>
                                    <div className="text-xs text-gray-500">
                                      {asset.city && <span>{asset.city}, </span>}
                                      {asset.country}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-sm font-mono">
                                    {asset.latitude && asset.longitude ? (
                                      <>
                                        {parseFloat(asset.latitude).toFixed(4)}, {parseFloat(asset.longitude).toFixed(4)}
                                      </>
                                    ) : (
                                      <span className="text-gray-400">N/A</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right">{formatRisk(riskBreakdown.flood)}</TableCell>
                                  <TableCell className="text-right">{formatRisk(riskBreakdown.wildfire)}</TableCell>
                                  <TableCell className="text-right">{formatRisk(riskBreakdown.heatStress)}</TableCell>
                                  <TableCell className="text-right">{formatRisk(riskBreakdown.extremePrecip)}</TableCell>
                                  <TableCell className="text-right">{formatRisk(riskBreakdown.hurricane)}</TableCell>
                                  <TableCell className="text-right">{formatRisk(riskBreakdown.drought)}</TableCell>
                                  <TableCell className="text-right font-bold">
                                    {formatRisk(totalLoss)}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Supply Chain Risk Section */}
        <Collapsible open={supplyChainOpen} onOpenChange={setSupplyChainOpen}>
          <Card>
            <CollapsibleTrigger className="w-full">
              <CardHeader className="cursor-pointer hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5 text-indigo-600" />
                    Top 5 Supply Chain Risk Contributors
                  </CardTitle>
                  {supplyChainOpen ? (
                    <ChevronUp className="h-5 w-5 text-gray-500" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-gray-500" />
                  )}
                </div>
                <CardDescription>
                  Country-sector pairs contributing to supply chain risk • Total: ${supplyChainRiskAnnual.toLocaleString()}
                </CardDescription>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                {supplyChainRisks.length === 0 ? (
                  <div className="text-center py-8 text-gray-600">
                    <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-yellow-500" />
                    <p>No supply chain risk data available.</p>
                    <p className="text-sm mt-2">Click "Fetch Supply Chain Risks" to load data.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Country</TableHead>
                          <TableHead>Sector</TableHead>
                          <TableHead className="text-right">Risk %</TableHead>
                          <TableHead className="text-right">Expected Annual Loss</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {supplyChainRisks.slice(0, 5).map((risk: any, idx: number) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{risk.country}</TableCell>
                            <TableCell>{risk.sector}</TableCell>
                            <TableCell className="text-right">
                              {risk.riskPercentage ? `${(risk.riskPercentage * 100).toFixed(2)}%` : 'N/A'}
                            </TableCell>
                            <TableCell className="text-right font-bold text-orange-600">
                              ${(risk.expectedAnnualLoss || 0).toLocaleString(undefined, {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 0,
                              })}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Management Performance Section */}
        <Collapsible open={managementOpen} onOpenChange={setManagementOpen}>
          <Card>
            <CollapsibleTrigger className="w-full">
              <CardHeader className="cursor-pointer hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-indigo-600" />
                    Management Performance Measures
                  </CardTitle>
                  {managementOpen ? (
                    <ChevronUp className="h-5 w-5 text-gray-500" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-gray-500" />
                  )}
                </div>
                <CardDescription>
                  Detailed assessment of climate risk management practices • Score: {managementScorePct.toFixed(0)}%
                </CardDescription>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                {managementMeasures.length === 0 ? (
                  <div className="text-center py-8 text-gray-600">
                    <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-yellow-500" />
                    <p>No management data available.</p>
                    <p className="text-sm mt-2">Click "Fetch Risk Management Data" to load data.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {managementMeasures.map((measure: any, idx: number) => (
                      <Card key={idx} className="border-l-4 border-l-indigo-400">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <CardTitle className="text-lg">{measure.measure}</CardTitle>
                              <div className="flex items-center gap-4 mt-2">
                                <div className="text-sm">
                                  <span className="font-semibold">Score:</span>{' '}
                                  <span className={`font-bold ${
                                    (measure.score || 0) >= (measure.maxPoints || 0) * 0.7 
                                      ? 'text-green-600' 
                                      : (measure.score || 0) >= (measure.maxPoints || 0) * 0.4 
                                        ? 'text-yellow-600' 
                                        : 'text-red-600'
                                  }`}>
                                    {measure.score}/{measure.maxPoints}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {measure.rationale && (
                            <div>
                              <div className="text-sm font-medium text-gray-700 mb-1">Rationale:</div>
                              <div className="text-sm text-gray-600">{measure.rationale}</div>
                            </div>
                          )}
                          {measure.verbatimQuote && (
                            <div>
                              <div className="text-sm font-medium text-gray-700 mb-1">Verbatim Quote:</div>
                              <div className="text-sm italic text-gray-600 bg-gray-50 p-3 rounded border-l-2 border-gray-300">
                                "{measure.verbatimQuote}"
                              </div>
                            </div>
                          )}
                          {measure.source && (
                            <div>
                              <div className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                                <FileText className="h-4 w-4" />
                                Source:
                              </div>
                              <div className="text-sm text-blue-600 hover:underline">
                                <a href={measure.source} target="_blank" rel="noopener noreferrer">
                                  {measure.source}
                                </a>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </main>
    </div>
  );
}

