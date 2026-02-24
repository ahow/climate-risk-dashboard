import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Upload, Download, FileSpreadsheet, Link2, Copy, Trash2, Loader2, Search, Play, ExternalLink } from "lucide-react";

interface CompanyListUpload {
  id: number;
  fileName: string;
  rowCount: number;
  uploadedAt: string;
}

interface CompanyListEntry {
  id: number;
  uploadId: number;
  isin: string;
  companyName: string;
  level2Sector: string | null;
  level3Sector: string | null;
  level4Sector: string | null;
  level5Sector: string | null;
  geography: string | null;
  totalValue: number | null;
  ev: number | null;
  supplierCosts: number | null;
}

interface LatestResponse {
  upload: CompanyListUpload;
  entries: CompanyListEntry[];
}

interface BulkOperation {
  id: number;
  type: string;
  status: string;
  totalItems: number;
  processedItems: number;
  statusMessage: string;
  startedAt: string;
  completedAt: string | null;
}

export default function CompanyList() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [copied, setCopied] = useState(false);
  const [bulkOperationId, setBulkOperationId] = useState<number | null>(null);

  const { data: latestData, isLoading } = useQuery<LatestResponse>({
    queryKey: ["/api/company-list/latest"],
    retry: false,
  });

  const { data: uploads } = useQuery<CompanyListUpload[]>({
    queryKey: ["/api/company-list"],
  });

  const { data: allOperations } = useQuery<BulkOperation[]>({
    queryKey: ["/api/operations"],
    refetchInterval: 5000,
  });

  const activeBulkOp = allOperations?.find(
    (op) => op.type === "bulk_processing" && (op.status === "running" || op.status === "pending")
  );

  const trackedOp = bulkOperationId
    ? allOperations?.find((op) => op.id === bulkOperationId)
    : activeBulkOp;

  const { data: bulkOpStatus } = useQuery<BulkOperation>({
    queryKey: ["/api/operations", trackedOp?.id],
    enabled: !!trackedOp?.id,
    refetchInterval: trackedOp && (trackedOp.status === "running" || trackedOp.status === "pending") ? 3000 : false,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/company-list/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Upload failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Upload successful", description: `${data.rowCount} companies imported from ${data.fileName}` });
      queryClient.invalidateQueries({ queryKey: ["/api/company-list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/company-list/latest"] });
    },
    onError: (err: Error) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/company-list/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Deleted", description: "Company list removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/company-list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/company-list/latest"] });
    },
  });

  const processAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/company-list/process-all");
      return res.json();
    },
    onSuccess: (data: BulkOperation) => {
      setBulkOperationId(data.id);
      toast({ title: "Bulk processing started", description: `Processing ${data.totalItems} companies from your uploaded list` });
      queryClient.invalidateQueries({ queryKey: ["/api/operations"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to start", description: err.message, variant: "destructive" });
    },
  });

  const isBulkRunning = activeBulkOp != null || processAllMutation.isPending;
  const displayOp = bulkOpStatus || trackedOp;
  const bulkProgress = displayOp && displayOp.totalItems > 0
    ? Math.round((displayOp.processedItems / displayOp.totalItems) * 100)
    : 0;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadMutation.mutate(file);
      e.target.value = "";
    }
  };

  const permanentUrl = `${window.location.origin}/api/company-list/download`;
  const permanentCsvUrl = `${window.location.origin}/api/company-list/download/csv`;

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast({ title: "Copied", description: "Link copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  const formatCurrency = (val: number | null) => {
    if (val == null) return "-";
    if (val >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
    if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
    if (val >= 1e3) return `$${(val / 1e3).toFixed(0)}K`;
    return `$${val.toFixed(0)}`;
  };

  const filteredEntries = latestData?.entries?.filter(e =>
    e.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.isin.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (e.geography || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (e.level2Sector || "").toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  return (
    <div className="space-y-6" data-testid="page-company-list">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground" data-testid="text-page-title">Company List</h1>
          <p className="text-muted-foreground text-sm mt-1">Upload and manage your company universe spreadsheet</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFileSelect}
            data-testid="input-file-upload"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
            data-testid="button-upload"
          >
            {uploadMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            {uploadMutation.isPending ? "Uploading..." : "Upload Spreadsheet"}
          </Button>
          {latestData && (
            <Button
              variant="outline"
              onClick={() => window.location.href = "/api/company-list/download"}
              data-testid="button-download-xlsx"
            >
              <Download className="h-4 w-4 mr-2" />
              Download XLSX
            </Button>
          )}
        </div>
      </div>

      {latestData && (
        <Card data-testid="card-permanent-links">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Permanent Download Links
            </CardTitle>
            <CardDescription>
              These URLs always serve the latest uploaded company list. Share them with other applications — the links stay the same even when you update the spreadsheet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-muted-foreground w-12">XLSX</span>
              <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono break-all" data-testid="text-permanent-url-xlsx">
                {permanentUrl}
              </code>
              <Button variant="ghost" size="icon" onClick={() => copyUrl(permanentUrl)} data-testid="button-copy-xlsx-url">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-muted-foreground w-12">CSV</span>
              <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono break-all" data-testid="text-permanent-url-csv">
                {permanentCsvUrl}
              </code>
              <Button variant="ghost" size="icon" onClick={() => copyUrl(permanentCsvUrl)} data-testid="button-copy-csv-url">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {latestData && (
        <Card data-testid="card-bulk-processing">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Play className="h-5 w-5" />
                  Bulk Risk Processing
                </CardTitle>
                <CardDescription>
                  Add all companies from the uploaded list to the dashboard and automatically calculate all risk assessments. Data is saved permanently until you choose to update it.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => processAllMutation.mutate()}
                  disabled={isBulkRunning || processAllMutation.isPending}
                  data-testid="button-process-all"
                >
                  {isBulkRunning ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  {isBulkRunning ? "Processing..." : "Process All Companies"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => window.location.href = "/monitor"}
                  data-testid="button-goto-monitor"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Monitor
                </Button>
              </div>
            </div>
          </CardHeader>
          {displayOp && (
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground" data-testid="text-bulk-status">{displayOp.statusMessage}</span>
                  <span className="font-medium" data-testid="text-bulk-progress">
                    {displayOp.processedItems}/{displayOp.totalItems} ({bulkProgress}%)
                  </span>
                </div>
                <Progress value={bulkProgress} className="h-2" data-testid="progress-bulk" />
                {displayOp.status === "completed" && (
                  <p className="text-sm text-green-600 dark:text-green-400 font-medium" data-testid="text-bulk-complete">
                    Processing complete. View results on the Dashboard.
                  </p>
                )}
                {displayOp.status === "failed" && (
                  <p className="text-sm text-red-600 dark:text-red-400 font-medium" data-testid="text-bulk-failed">
                    Processing failed. Check the Calculation Monitor for details.
                  </p>
                )}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {latestData && (
        <Card data-testid="card-current-list">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5" />
                  Current List: {latestData.upload.fileName}
                </CardTitle>
                <CardDescription>
                  {latestData.upload.rowCount} companies | Uploaded {new Date(latestData.upload.uploadedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </CardDescription>
              </div>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search companies..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                  data-testid="input-search"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="border rounded-md overflow-auto max-h-[600px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky top-0 bg-card z-10">ISIN</TableHead>
                    <TableHead className="sticky top-0 bg-card z-10">Company</TableHead>
                    <TableHead className="sticky top-0 bg-card z-10">Sector</TableHead>
                    <TableHead className="sticky top-0 bg-card z-10">Sub-Sector</TableHead>
                    <TableHead className="sticky top-0 bg-card z-10">Geography</TableHead>
                    <TableHead className="sticky top-0 bg-card z-10 text-right">Total Value</TableHead>
                    <TableHead className="sticky top-0 bg-card z-10 text-right">EV</TableHead>
                    <TableHead className="sticky top-0 bg-card z-10 text-right">Supplier Costs</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        {searchTerm ? "No companies match your search" : "No entries"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredEntries.map((entry) => (
                      <TableRow key={entry.id} data-testid={`row-company-${entry.id}`}>
                        <TableCell className="font-mono text-xs">{entry.isin}</TableCell>
                        <TableCell className="font-medium">{entry.companyName}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{entry.level2Sector || "-"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{entry.level5Sector || entry.level4Sector || "-"}</TableCell>
                        <TableCell className="text-sm">{entry.geography || "-"}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatCurrency(entry.totalValue)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatCurrency(entry.ev)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatCurrency(entry.supplierCosts)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            {searchTerm && (
              <p className="text-xs text-muted-foreground mt-2" data-testid="text-filter-count">
                Showing {filteredEntries.length} of {latestData.entries.length} companies
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {!latestData && !isLoading && (
        <Card data-testid="card-empty-state">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileSpreadsheet className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Company List Uploaded</h3>
            <p className="text-muted-foreground text-center max-w-md mb-4">
              Upload an Excel spreadsheet (.xlsx) containing your company universe. The file should include columns for ISIN, Company, Sector, Geography, and financial values.
            </p>
            <Button onClick={() => fileInputRef.current?.click()} data-testid="button-upload-empty">
              <Upload className="h-4 w-4 mr-2" />
              Upload Spreadsheet
            </Button>
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <Card>
          <CardContent className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      )}

      {uploads && uploads.length > 1 && (
        <Card data-testid="card-upload-history">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Upload History</CardTitle>
            <CardDescription>Previous uploads (the latest one is active)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {uploads.map((upload, idx) => (
                <div
                  key={upload.id}
                  className={`flex items-center justify-between gap-4 p-3 rounded-md border ${idx === 0 ? "border-primary bg-primary/5" : ""}`}
                  data-testid={`upload-history-${upload.id}`}
                >
                  <div className="flex items-center gap-3">
                    <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{upload.fileName} {idx === 0 && <span className="text-xs text-primary ml-1">(Active)</span>}</p>
                      <p className="text-xs text-muted-foreground">{upload.rowCount} companies | {new Date(upload.uploadedAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  {idx > 0 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate(upload.id)}
                      data-testid={`button-delete-upload-${upload.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
