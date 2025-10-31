import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { APP_TITLE } from "@/const";
import { trpc } from "@/lib/trpc";
import { Loader2, Search, TrendingDown } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

export default function Home() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: companies, isLoading, error } = trpc.companies.list.useQuery();

  // Seed companies on first load if needed
  const seedMutation = trpc.companies.seedCompanies.useMutation({
    onSuccess: () => {
      window.location.reload();
    },
  });

  const fetchAssetsMutation = trpc.companies.fetchAllAssets.useMutation();
  const fetchRiskMgmtMutation = trpc.companies.fetchAllRiskManagement.useMutation();
  const calculateRisksMutation = trpc.risks.calculateAllGeographicRisks.useMutation();
  const calibrateMutation = trpc.risks.recalculateWithCalibration.useMutation();

  // CSV Export
  const exportMutation = trpc.export.generateCSV.useQuery(undefined, {
    enabled: false, // Don't fetch automatically
  });

  const handleExportCSV = async () => {
    try {
      // Fetch the data
      const data = await exportMutation.refetch();
      if (!data.data) return;

      const csvRows = [
        // Header
        [
          'ISIN',
          'Name',
          'EV',
          'Direct Exposure',
          'Indirect Exposure',
          'Gross Expected Loss',
          'Flood Loss',
          'Wildfire Loss',
          'Heat Stress Loss',
          'Extreme Precip Loss',
          'Hurricane Loss',
          'Drought Loss',
          'Risk Management Score',
          'Net Expected Loss',
          'Expected Loss % of EV'
        ].join(',')
      ];

      // Data rows
      data.data.forEach(row => {
        csvRows.push([
          row.isin,
          `"${row.name}"`,
          row.ev.toFixed(2),
          row.directExposure.toFixed(2),
          row.indirectExposure.toFixed(2),
          row.grossExpectedLoss.toFixed(2),
          row.floodLoss.toFixed(2),
          row.wildfireLoss.toFixed(2),
          row.heatStressLoss.toFixed(2),
          row.extremePrecipLoss.toFixed(2),
          row.hurricaneLoss.toFixed(2),
          row.droughtLoss.toFixed(2),
          row.riskManagementScore.toFixed(1),
          row.netExpectedLoss.toFixed(2),
          row.lossPercentOfEV.toFixed(4)
        ].join(','));
      });

      // Create and download CSV
      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `climate-risk-analysis-${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
    } catch (error) {
      console.error('Error exporting CSV:', error);
    }
  };

  const filteredCompanies = companies?.filter(
    (company) =>
      company.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      company.isin.toLowerCase().includes(searchQuery.toLowerCase()) ||
      company.geography?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading companies...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">Error</CardTitle>
            <CardDescription>Failed to load companies</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">{error.message}</p>
            <Button onClick={() => window.location.reload()}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!companies || companies.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>No Companies Found</CardTitle>
            <CardDescription>The database is empty. Would you like to load the initial company data?</CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => seedMutation.mutate()} 
              disabled={seedMutation.isPending}
              className="w-full"
            >
              {seedMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading Companies...
                </>
              ) : (
                "Load 20 Companies"
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <TrendingDown className="h-8 w-8 text-indigo-600" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{APP_TITLE}</h1>
              <p className="text-sm text-gray-600 mt-1">
                Assess physical climate risks across company portfolios
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Data Loading Actions */}
        {companies && companies.length > 0 && (
          <Card className="mb-6 bg-indigo-50 border-indigo-200">
            <CardHeader>
              <CardTitle className="text-lg">Data Loading</CardTitle>
              <CardDescription>
                Fetch asset locations and risk management data from external APIs
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-4">
              <Button
                onClick={() => fetchAssetsMutation.mutate()}
                disabled={fetchAssetsMutation.isPending}
                variant="default"
              >
                {fetchAssetsMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Fetching Assets...
                  </>
                ) : (
                  "Fetch All Assets"
                )}
              </Button>
              <Button
                onClick={() => fetchRiskMgmtMutation.mutate()}
                disabled={fetchRiskMgmtMutation.isPending}
                variant="default"
              >
                {fetchRiskMgmtMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Fetching Risk Assessments...
                  </>
                ) : (
                  "Fetch Risk Management Data"
                )}
              </Button>
              {fetchAssetsMutation.isSuccess && (
                <div className="text-sm text-green-600 flex items-center">
                  ✓ Assets loaded: {fetchAssetsMutation.data.totalAssetsFetched} from {fetchAssetsMutation.data.companiesProcessed} companies
                </div>
              )}
              {fetchRiskMgmtMutation.isSuccess && (
                <div className="text-sm text-green-600 flex items-center">
                  ✓ Risk assessments loaded: {fetchRiskMgmtMutation.data.assessmentsFetched} companies
                </div>
              )}
              <Button
                onClick={() => calculateRisksMutation.mutate()}
                disabled={calculateRisksMutation.isPending}
                variant="secondary"
              >
                {calculateRisksMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Calculating Risks...
                  </>
                ) : (
                  "Calculate Geographic Risks"
                )}
              </Button>
              {calculateRisksMutation.isSuccess && (
                <div className="text-sm text-green-600 flex items-center">
                  ✓ Geographic risks: {calculateRisksMutation.data.risksCalculated} calculated, {calculateRisksMutation.data.skipped} skipped
                  {calculateRisksMutation.data.errors && calculateRisksMutation.data.errors.length > 0 && (
                    <span className="text-red-600 ml-2">({calculateRisksMutation.data.errors.length} errors)</span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Asset Value Calibration & Export */}
        {companies && companies.length > 0 && (
          <Card className="mb-6 bg-green-50 border-green-200">
            <CardHeader>
              <CardTitle className="text-lg">Asset Value Calibration & Export</CardTitle>
              <CardDescription>
                Recalculate risks using proportionate allocation based on reported tangible assets
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-4">
              <Button
                onClick={() => calibrateMutation.mutate()}
                disabled={calibrateMutation.isPending}
                variant="default"
                className="bg-green-600 hover:bg-green-700"
              >
                {calibrateMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Calibrating... (this takes ~10 min)
                  </>
                ) : (
                  "Recalculate with Calibrated Values"
                )}
              </Button>
              {calibrateMutation.isSuccess && (
                <div className="text-sm text-green-600 flex items-center">
                  ✓ Calibrated: {calibrateMutation.data.risksRecalculated} assets recalculated, {calibrateMutation.data.skipped} skipped
                  {calibrateMutation.data.errors && calibrateMutation.data.errors.length > 0 && (
                    <span className="text-red-600 ml-2">({calibrateMutation.data.errors.length} errors)</span>
                  )}
                </div>
              )}
              <Button
                onClick={handleExportCSV}
                variant="outline"
                className="ml-auto"
              >
                Download CSV Report
              </Button>
            </CardContent>
          </Card>
        )}
        {/* Search Bar */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <Input
                type="text"
                placeholder="Search by company name, ISIN, or geography..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-12 text-base"
              />
            </div>
          </CardContent>
        </Card>

        {/* Company Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCompanies?.map((company) => (
            <Card
              key={company.id}
              className="hover:shadow-lg transition-shadow cursor-pointer group"
              onClick={() => setLocation(`/company/${company.isin}`)}
            >
              <CardHeader>
                <CardTitle className="text-lg group-hover:text-indigo-600 transition-colors">
                  {company.name}
                </CardTitle>
                <CardDescription className="space-y-1">
                  <div className="text-xs font-mono">{company.isin}</div>
                  <div className="text-xs">{company.geography}</div>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Sector:</span>
                    <span className="font-medium text-right">{company.sector?.split(',')[0]}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Assets:</span>
                    <span className="font-medium">
                      ${parseFloat(company.tangibleAssets || '0').toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">EV:</span>
                    <span className="font-medium">
                      ${parseFloat(company.enterpriseValue || '0').toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 mt-2 border-t">
                    <span className="text-gray-600">Expected Loss:</span>
                    <span className="font-semibold text-red-600">
                      {(company as any).lossPercentageOfEV !== undefined 
                        ? `${(company as any).lossPercentageOfEV.toFixed(2)}% of EV`
                        : 'N/A'}
                    </span>
                  </div>
                </div>
                <Button className="w-full mt-4" variant="outline">
                  View Risk Analysis
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredCompanies?.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-gray-600">No companies match your search criteria.</p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

