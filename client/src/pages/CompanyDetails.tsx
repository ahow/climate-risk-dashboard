import { Button } from "@/components/ui/button";
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

  const [directExposureOpen, setDirectExposureOpen] = useState(true);
  const [managementOpen, setManagementOpen] = useState(false);

  const { data: fullDetails, isLoading, error } = trpc.companies.getFullDetails.useQuery(
    { isin },
    { enabled: !!isin }
  );

  const { data: overallLoss } = trpc.companies.calculateOverallLoss.useQuery(
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

  const { company, assets, riskManagement } = fullDetails;
  const managementScore = riskManagement?.overallScore || 0;
  const assessmentData = riskManagement?.assessmentData as any;

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
              Overall Expected Losses from Physical Climate Risks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div>
                <div className="text-sm text-gray-600 mb-1">Direct Exposure</div>
                <div className="text-2xl font-bold text-gray-900">
                  ${(overallLoss?.directExposure || 0).toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">Indirect Exposure</div>
                <div className="text-2xl font-bold text-gray-900">
                  ${(overallLoss?.indirectExposure || 0).toLocaleString()}
                </div>
                <div className="text-xs text-gray-500 mt-1">Currently not calculated</div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">Risk Management Score</div>
                <div className="text-2xl font-bold text-green-600">{managementScore}%</div>
                <div className="text-xs text-gray-500 mt-1">
                  Mitigation factor: {((100 - managementScore) / 100).toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">Overall Expected Loss</div>
                <div className="text-2xl font-bold text-red-600">
                  ${(overallLoss?.overallExpectedLoss || 0).toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {overallLoss?.enterpriseValue && (
                    <>
                      {(
                        ((overallLoss.overallExpectedLoss || 0) /
                          parseFloat(overallLoss.enterpriseValue)) *
                        100
                      ).toFixed(2)}
                      % of EV
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <div className="text-sm font-medium text-blue-900 mb-2">Calculation Formula:</div>
              <div className="text-sm text-blue-800 font-mono">
                Overall Expected Losses = (Direct Exposure + Indirect Exposure) × (100% - Risk Management Score)
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Direct Exposure Section */}
        <Collapsible open={directExposureOpen} onOpenChange={setDirectExposureOpen}>
          <Card>
            <CollapsibleTrigger className="w-full">
              <CardHeader className="cursor-pointer hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-indigo-600" />
                    Direct Exposure - Asset Details
                  </CardTitle>
                  {directExposureOpen ? (
                    <ChevronUp className="h-5 w-5 text-gray-500" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-gray-500" />
                  )}
                </div>
                <CardDescription>
                  {assets.length} assets identified • Click to {directExposureOpen ? "collapse" : "expand"}
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
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Asset Name</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead>Coordinates</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead className="text-right">Value (USD)</TableHead>
                          <TableHead className="text-right">Expected Loss</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {assets.map((asset) => {
                          const riskData = asset.geographicRisk?.riskData as any;
                          let totalLoss = 0;
                          if (riskData?.risks) {
                            Object.values(riskData.risks).forEach((risk: any) => {
                              totalLoss += risk.expected_annual_loss || 0;
                            });
                          }

                          return (
                            <TableRow key={asset.id}>
                              <TableCell className="font-medium">{asset.assetName}</TableCell>
                              <TableCell>
                                <div className="text-sm">
                                  {asset.city && <div>{asset.city}</div>}
                                  {asset.stateProvince && <div>{asset.stateProvince}</div>}
                                  <div>{asset.country}</div>
                                </div>
                              </TableCell>
                              <TableCell>
                                {asset.latitude && asset.longitude ? (
                                  <div className="text-xs font-mono">
                                    {parseFloat(asset.latitude).toFixed(4)}, {parseFloat(asset.longitude).toFixed(4)}
                                  </div>
                                ) : (
                                  <span className="text-gray-400">N/A</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="text-sm">
                                  <div>{asset.assetType}</div>
                                  {asset.assetSubtype && (
                                    <div className="text-xs text-gray-500">{asset.assetSubtype}</div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                ${parseFloat(asset.estimatedValueUsd || '0').toLocaleString()}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {totalLoss > 0 ? (
                                  <span className="text-red-600">
                                    ${totalLoss.toLocaleString(undefined, {
                                      minimumFractionDigits: 0,
                                      maximumFractionDigits: 0,
                                    })}
                                  </span>
                                ) : (
                                  <span className="text-gray-400">Not assessed</span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Risk Management Section */}
        <Collapsible open={managementOpen} onOpenChange={setManagementOpen}>
          <Card>
            <CollapsibleTrigger className="w-full">
              <CardHeader className="cursor-pointer hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-green-600" />
                    Risk Management Assessment
                  </CardTitle>
                  {managementOpen ? (
                    <ChevronUp className="h-5 w-5 text-gray-500" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-gray-500" />
                  )}
                </div>
                <CardDescription>
                  Overall Score: {managementScore}% • Click to {managementOpen ? "collapse" : "expand"}
                </CardDescription>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                {!assessmentData || !assessmentData.measures || assessmentData.measures.length === 0 ? (
                  <div className="text-center py-8 text-gray-600">
                    <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-yellow-500" />
                    <p>No risk management assessment available for this company.</p>
                    <p className="text-sm mt-2">Assessment data needs to be fetched from the Risk Management API.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {assessmentData.measures.map((measure: any, index: number) => (
                      <Card key={index} className="border-l-4 border-l-indigo-500">
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <CardTitle className="text-base">{measure.measure_name}</CardTitle>
                              <CardDescription className="mt-1">
                                {measure.category} • ID: {measure.measure_id}
                              </CardDescription>
                            </div>
                            <div className="text-right">
                              <div className="text-2xl font-bold text-indigo-600">{measure.score}</div>
                              <div className="text-xs text-gray-500">{measure.confidence} confidence</div>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div>
                            <div className="text-sm font-medium text-gray-700 mb-1">Rationale:</div>
                            <p className="text-sm text-gray-600">{measure.rationale}</p>
                          </div>
                          
                          {measure.evidence && (
                            <div>
                              <div className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                                <FileText className="h-4 w-4" />
                                Evidence:
                              </div>
                              <div className="space-y-3">
                                {(() => {
                                  const evidenceQuotes = typeof measure.evidence === 'string' 
                                    ? measure.evidence.split(' | ') 
                                    : [];
                                  const sourceUrls = measure.source_urls?.split(',') || [];
                                  const sourceTitles = measure.source_titles?.split(',') || [];
                                  const sourcePages = measure.source_pages?.split(',') || [];
                                  
                                  return evidenceQuotes.map((quote: string, evIndex: number) => (
                                    <div key={evIndex} className="bg-gray-50 p-3 rounded-lg text-sm">
                                      <div className="italic text-gray-700 mb-2">
                                        "{quote.substring(0, 300)}
                                        {quote.length > 300 ? "..." : ""}"
                                      </div>
                                      <div className="text-xs text-gray-600">
                                        <div>Source: {sourceTitles[evIndex] || 'N/A'}</div>
                                        {sourcePages[evIndex] && (
                                          <div>Page: {sourcePages[evIndex]}</div>
                                        )}
                                        {sourceUrls[evIndex] && sourceUrls[evIndex] !== "N/A" && (
                                          <div className="mt-1">
                                            <a
                                              href={sourceUrls[evIndex]}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-indigo-600 hover:underline"
                                            >
                                              View Document
                                            </a>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ));
                                })()}
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

