import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { Download, Loader2, TrendingDown } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";

export default function Rankings() {
  const [, setLocation] = useLocation();
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: companies, isLoading } = trpc.companies.list.useQuery();

  // Extract unique sectors and countries
  const { sectors, countries } = useMemo(() => {
    if (!companies) return { sectors: [], countries: [] };
    
    const sectorsSet = new Set(companies.map(c => c.sector).filter(Boolean));
    const countriesSet = new Set(companies.map(c => c.geography).filter(Boolean));
    
    return {
      sectors: Array.from(sectorsSet).sort(),
      countries: Array.from(countriesSet).sort(),
    };
  }, [companies]);

  // Filter and sort companies
  const filteredCompanies = useMemo(() => {
    if (!companies) return [];

    let filtered = companies;

    // Apply sector filter
    if (sectorFilter !== "all") {
      filtered = filtered.filter(c => c.sector === sectorFilter);
    }

    // Apply country filter
    if (countryFilter !== "all") {
      filtered = filtered.filter(c => c.geography === countryFilter);
    }

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        c =>
          c.name.toLowerCase().includes(query) ||
          c.isin.toLowerCase().includes(query) ||
          c.geography?.toLowerCase().includes(query) ||
          c.sector?.toLowerCase().includes(query)
      );
    }

    // Sort by Net Expected Loss (descending)
    return filtered.sort((a, b) => {
      const aLoss = a.netExpectedLossAnnual || 0;
      const bLoss = b.netExpectedLossAnnual || 0;
      return bLoss - aLoss;
    });
  }, [companies, sectorFilter, countryFilter, searchQuery]);

  // Calculate aggregate statistics
  const stats = useMemo(() => {
    if (!filteredCompanies.length) return null;

    const totalAssetRisk = filteredCompanies.reduce((sum, c) => sum + (c.assetRiskAnnual || 0), 0);
    const totalSupplyChainRisk = filteredCompanies.reduce((sum, c) => sum + (c.supplyChainRiskAnnual || 0), 0);
    const totalNetLoss = filteredCompanies.reduce((sum, c) => sum + (c.netExpectedLossAnnual || 0), 0);
    const avgRiskMgmt = filteredCompanies.reduce((sum, c) => sum + (c.managementScorePct || 0), 0) / filteredCompanies.length;

    return {
      count: filteredCompanies.length,
      totalAssetRisk,
      totalSupplyChainRisk,
      totalNetLoss,
      avgRiskMgmt,
    };
  }, [filteredCompanies]);

  const handleDownloadCSV = () => {
    if (!filteredCompanies.length) return;

    const csvRows = [
      // Header
      [
        'Rank',
        'Company Name',
        'ISIN',
        'Sector',
        'Country',
        'EV (USD)',
        'Asset Risk (Annual)',
        'Supply Chain Risk',
        'Total Risk (Annual)',
        'Risk Management Score',
        'Net Expected Loss',
        'Loss % of EV'
      ].join(',')
    ];

    // Data rows
    filteredCompanies.forEach((company, index) => {
      const lossPercentOfEV = company.enterpriseValue 
        ? ((company.netExpectedLossAnnual || 0) / parseFloat(company.enterpriseValue) * 100).toFixed(4)
        : '0.0000';

      csvRows.push([
        index + 1,
        `"${company.name}"`,
        company.isin,
        `"${company.sector || ''}"`,
        `"${company.geography || ''}"`,
        (parseFloat(company.enterpriseValue || '0')).toFixed(2),
        (company.assetRiskAnnual || 0).toFixed(2),
        (company.supplyChainRiskAnnual || 0).toFixed(2),
        (company.totalRiskAnnual || 0).toFixed(2),
        (company.managementScorePct || 0).toFixed(1),
        (company.netExpectedLossAnnual || 0).toFixed(2),
        lossPercentOfEV
      ].join(','));
    });

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `climate-risk-rankings-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button onClick={() => setLocation("/")} className="flex items-center space-x-2 hover:opacity-80">
                <TrendingDown className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold">Climate Risk Rankings</h1>
              </button>
            </div>
            <Button onClick={handleDownloadCSV} variant="outline" disabled={!filteredCompanies.length}>
              <Download className="mr-2 h-4 w-4" />
              Download CSV
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Filters */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Filter companies by sector, country, or search term</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Sector</label>
                <Select value={sectorFilter} onValueChange={setSectorFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Sectors" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sectors</SelectItem>
                    {sectors.map(sector => (
                      <SelectItem key={sector} value={sector || ''}>{sector}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Country</label>
                <Select value={countryFilter} onValueChange={setCountryFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Countries" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Countries</SelectItem>
                    {countries.map(country => (
                      <SelectItem key={country} value={country || ''}>{country}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Search</label>
                <Input
                  placeholder="Search by name, ISIN, etc..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Statistics */}
        {stats && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Summary Statistics</CardTitle>
              <CardDescription>Aggregate metrics for filtered companies</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Companies</div>
                  <div className="text-2xl font-bold">{stats.count}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Total Asset Risk</div>
                  <div className="text-2xl font-bold">${(stats.totalAssetRisk / 1000000).toFixed(1)}M</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Total Supply Chain Risk</div>
                  <div className="text-2xl font-bold">${(stats.totalSupplyChainRisk / 1000000).toFixed(1)}M</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Total Net Loss</div>
                  <div className="text-2xl font-bold">${(stats.totalNetLoss / 1000000).toFixed(1)}M</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Avg Risk Mgmt Score</div>
                  <div className="text-2xl font-bold">{stats.avgRiskMgmt.toFixed(1)}%</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Rankings Table */}
        <Card>
          <CardHeader>
            <CardTitle>Company Rankings by Net Expected Loss</CardTitle>
            <CardDescription>
              Companies ranked from highest to lowest climate risk exposure
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Rank</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Sector</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead className="text-right">EV (USD)</TableHead>
                    <TableHead className="text-right">Asset Risk</TableHead>
                    <TableHead className="text-right">Supply Chain</TableHead>
                    <TableHead className="text-right">Net Loss</TableHead>
                    <TableHead className="text-right">Loss % of EV</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCompanies.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                        No companies match the selected filters
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredCompanies.map((company, index) => {
                      const lossPercentOfEV = company.enterpriseValue 
                        ? ((company.netExpectedLossAnnual || 0) / parseFloat(company.enterpriseValue) * 100)
                        : 0;

                      return (
                        <TableRow 
                          key={company.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setLocation(`/company/${company.id}`)}
                        >
                          <TableCell className="font-medium">{index + 1}</TableCell>
                          <TableCell>
                            <div className="font-medium">{company.name}</div>
                            <div className="text-sm text-muted-foreground">{company.isin}</div>
                          </TableCell>
                          <TableCell>{company.sector || '-'}</TableCell>
                          <TableCell>{company.geography || '-'}</TableCell>
                          <TableCell className="text-right">
                            ${(parseFloat(company.enterpriseValue || '0')).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            ${(company.assetRiskAnnual || 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            ${(company.supplyChainRiskAnnual || 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            ${(company.netExpectedLossAnnual || 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={lossPercentOfEV > 10 ? "text-red-600 font-medium" : ""}>
                              {lossPercentOfEV.toFixed(2)}%
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

