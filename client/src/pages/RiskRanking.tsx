import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, ArrowUpDown, TrendingDown, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";

type SortField = 'totalRisk' | 'assetRisk' | 'supplyChainRisk' | 'netExpectedLoss' | 'name';
type SortDirection = 'asc' | 'desc';

export default function RiskRanking() {
  const [, setLocation] = useLocation();
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>('totalRisk');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const { data: companies, isLoading } = trpc.companies.list.useQuery();

  // Extract unique countries and sectors for filters
  const { countries, sectors } = useMemo(() => {
    if (!companies) return { countries: [], sectors: [] };
    
    const countrySet = new Set<string>();
    const sectorSet = new Set<string>();
    
    companies.forEach(c => {
      if (c.geography) countrySet.add(c.geography);
      if (c.sector) sectorSet.add(c.sector);
    });
    
    return {
      countries: Array.from(countrySet).sort(),
      sectors: Array.from(sectorSet).sort(),
    };
  }, [companies]);

  // Filter and sort companies
  const filteredAndSortedCompanies = useMemo(() => {
    if (!companies) return [];
    
    let filtered = companies;
    
    // Apply filters
    if (countryFilter !== "all") {
      filtered = filtered.filter(c => c.geography === countryFilter);
    }
    if (sectorFilter !== "all") {
      filtered = filtered.filter(c => c.sector === sectorFilter);
    }
    
    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      let aValue: number | string = 0;
      let bValue: number | string = 0;
      
      switch (sortField) {
        case 'totalRisk':
          aValue = a.totalRiskAnnual || 0;
          bValue = b.totalRiskAnnual || 0;
          break;
        case 'assetRisk':
          aValue = a.assetRiskAnnual || 0;
          bValue = b.assetRiskAnnual || 0;
          break;
        case 'supplyChainRisk':
          aValue = a.supplyChainRiskAnnual || 0;
          bValue = b.supplyChainRiskAnnual || 0;
          break;
        case 'netExpectedLoss':
          aValue = a.netExpectedLossAnnual || 0;
          bValue = b.netExpectedLossAnnual || 0;
          break;
        case 'name':
          aValue = a.name || '';
          bValue = b.name || '';
          break;
      }
      
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }
      
      return sortDirection === 'asc' 
        ? (aValue as number) - (bValue as number)
        : (bValue as number) - (aValue as number);
    });
    
    return sorted;
  }, [companies, countryFilter, sectorFilter, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const formatCurrency = (value: number | null | undefined) => {
    if (!value) return "$0";
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercent = (value: number | null | undefined) => {
    if (value === null || value === undefined) return "—";
    return `${(value * 100).toFixed(2)}%`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading company data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => setLocation('/')}
            className="mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
          <h1 className="text-4xl font-bold mb-2">Climate Risk Rankings</h1>
          <p className="text-muted-foreground">
            Filter and rank companies by climate risk exposure
          </p>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>
              Filter companies by country and sector to focus your analysis
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="country-filter">Country</Label>
                <Select value={countryFilter} onValueChange={setCountryFilter}>
                  <SelectTrigger id="country-filter">
                    <SelectValue placeholder="All Countries" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Countries</SelectItem>
                    {countries.map(country => (
                      <SelectItem key={country} value={country}>
                        {country}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sector-filter">Sector</Label>
                <Select value={sectorFilter} onValueChange={setSectorFilter}>
                  <SelectTrigger id="sector-filter">
                    <SelectValue placeholder="All Sectors" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sectors</SelectItem>
                    {sectors.map(sector => (
                      <SelectItem key={sector} value={sector}>
                        {sector}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
              <span>Showing {filteredAndSortedCompanies.length} of {companies?.length || 0} companies</span>
              {(countryFilter !== "all" || sectorFilter !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCountryFilter("all");
                    setSectorFilter("all");
                  }}
                >
                  Clear Filters
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Rankings Table */}
        <Card>
          <CardHeader>
            <CardTitle>Company Rankings</CardTitle>
            <CardDescription>
              Click column headers to sort. Click company name to view details.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        onClick={() => handleSort('name')}
                        className="hover:bg-transparent p-0 h-auto font-semibold"
                      >
                        Company
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Sector</TableHead>
                    <TableHead className="text-right">
                      <Button
                        variant="ghost"
                        onClick={() => handleSort('totalRisk')}
                        className="hover:bg-transparent p-0 h-auto font-semibold ml-auto"
                      >
                        Total Risk
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="text-right">
                      <Button
                        variant="ghost"
                        onClick={() => handleSort('assetRisk')}
                        className="hover:bg-transparent p-0 h-auto font-semibold ml-auto"
                      >
                        Asset Risk
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="text-right">
                      <Button
                        variant="ghost"
                        onClick={() => handleSort('supplyChainRisk')}
                        className="hover:bg-transparent p-0 h-auto font-semibold ml-auto"
                      >
                        Supply Chain Risk
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="text-right">
                      <Button
                        variant="ghost"
                        onClick={() => handleSort('netExpectedLoss')}
                        className="hover:bg-transparent p-0 h-auto font-semibold ml-auto"
                      >
                        Net Expected Loss
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="text-right">% of EV</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndSortedCompanies.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                        No companies match the selected filters
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAndSortedCompanies.map((company, index) => {
                      const evPercent = company.enterpriseValue 
                        ? ((company.netExpectedLossAnnual || 0) / parseFloat(company.enterpriseValue)) * 100
                        : 0;
                      
                      return (
                        <TableRow key={company.isin} className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setLocation(`/company/${company.isin}`)}
                        >
                          <TableCell className="font-medium text-muted-foreground">
                            {index + 1}
                          </TableCell>
                          <TableCell className="font-medium">
                            {company.name}
                          </TableCell>
                          <TableCell>{company.geography || '—'}</TableCell>
                          <TableCell className="text-sm">{company.sector || '—'}</TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(company.totalRiskAnnual)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(company.assetRiskAnnual)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(company.supplyChainRiskAnnual)}
                          </TableCell>
                          <TableCell className="text-right font-medium text-destructive">
                            {formatCurrency(company.netExpectedLossAnnual)}
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {evPercent > 0 ? `${evPercent.toFixed(2)}%` : '—'}
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
