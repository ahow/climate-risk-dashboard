import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Upload, Trash2, Loader2, FileSpreadsheet, Briefcase, Link2, SlidersHorizontal, Save,
} from "lucide-react";
import type { Portfolio } from "@shared/schema";
import {
  computeMeasureWeights, type WeightLevel,
} from "@shared/weights";

type MeasureRow = {
  measureId: string;
  title: string;
  category: string;
  disclosurePct: number;
  disclosureLevel: WeightLevel;
  importanceLevel: WeightLevel;
  weight: number;
};

const LEVEL_OPTIONS: WeightLevel[] = ["low", "medium", "high"];

function ManagementSourceCard() {
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const { data } = useQuery<{ url: string }>({ queryKey: ["/api/settings/management-source"] });

  useEffect(() => {
    if (data?.url != null) setUrl(data.url);
  }, [data?.url]);

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/settings/management-source", { url }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/management-source"] });
      toast({ title: "Source URL saved" });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const [weightsOpen, setWeightsOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Link2 className="h-4 w-4 text-primary" /> Management Score Source
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="mgmt-source-url">Source URL</Label>
          <Input
            id="mgmt-source-url"
            placeholder="https://app-production-xxxx.up.railway.app/api/results/390/share"
            value={url}
            onChange={e => setUrl(e.target.value)}
            data-testid="input-management-source-url"
          />
          <p className="text-xs text-muted-foreground">
            The results share URL. <code className="text-foreground">?format=full</code> is appended automatically.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid="button-save-management-source"
          >
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
            Save URL
          </Button>
          <Button
            variant="outline"
            onClick={() => setWeightsOpen(true)}
            disabled={!data?.url}
            data-testid="button-populate-weights"
          >
            <SlidersHorizontal className="h-4 w-4 mr-1.5" /> Populate weights
          </Button>
        </div>
        {!data?.url && (
          <p className="text-xs text-muted-foreground">Save a source URL to enable weighting.</p>
        )}
      </CardContent>
      <PopulateWeightsDialog open={weightsOpen} onOpenChange={setWeightsOpen} />
    </Card>
  );
}

function PopulateWeightsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<MeasureRow[]>([]);
  const [loading, setLoading] = useState(false);

  const loadMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/management-weights/measures", {});
      return res.json() as Promise<{ measures: MeasureRow[] }>;
    },
    onSuccess: (data) => setRows(data.measures),
    onError: (e: any) => toast({ title: "Could not load measures", description: e.message, variant: "destructive" }),
  });

  useEffect(() => {
    if (open && rows.length === 0 && !loadMutation.isPending) {
      setLoading(true);
      loadMutation.mutate(undefined, { onSettled: () => setLoading(false) });
    }
    if (!open) setRows([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Recompute weights live whenever any level changes.
  const recomputed = computeMeasureWeights(rows);
  const weightById = new Map(recomputed.map(r => [r.measureId, r.weight]));

  const setLevel = (measureId: string, field: "disclosureLevel" | "importanceLevel", value: WeightLevel) => {
    setRows(prev => prev.map(r => r.measureId === measureId ? { ...r, [field]: value } : r));
  };

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/management-weights", {
      measures: rows.map(r => ({
        measureId: r.measureId,
        title: r.title,
        category: r.category,
        disclosurePct: r.disclosurePct,
        disclosureLevel: r.disclosureLevel,
        importanceLevel: r.importanceLevel,
      })),
    }),
    onSuccess: async (res) => {
      const body = await res.json().catch(() => ({}));
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/management-weights"] });
      toast({ title: "Weights saved", description: `Recomputed ${body.recomputed ?? 0} company scores` });
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const weightVals = recomputed.map(r => r.weight);
  const minW = weightVals.length ? Math.min(...weightVals) : 0;
  const maxW = weightVals.length ? Math.max(...weightVals) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col" data-testid="dialog-populate-weights">
        <DialogHeader>
          <DialogTitle>Populate measure weights</DialogTitle>
        </DialogHeader>

        {loading || loadMutation.isPending ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading measures from source...
          </div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground py-12 text-center">No measures found.</div>
        ) : (
          <>
            <div className="text-xs text-muted-foreground">
              Disclosure % is the share of the universe scoring above zero on each measure. Weights sum to 100%,
              and the largest weight is 3× the smallest. Range: {minW.toFixed(2)}%–{maxW.toFixed(2)}%.
            </div>
            <div className="overflow-auto flex-1 -mx-1 px-1">
              <table className="w-full text-xs border-collapse" data-testid="table-weights">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-2 font-medium">Measure</th>
                    <th className="py-2 px-2 font-medium">Category</th>
                    <th className="py-2 px-2 font-medium text-right">Disclosure %</th>
                    <th className="py-2 px-2 font-medium">Disclosure</th>
                    <th className="py-2 px-2 font-medium">Importance</th>
                    <th className="py-2 pl-2 font-medium text-right">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.measureId} className="border-b border-border/40 align-top" data-testid={`weight-row-${r.measureId}`}>
                      <td className="py-2 pr-2 max-w-[320px]">{r.title || r.measureId}</td>
                      <td className="py-2 px-2 text-muted-foreground whitespace-nowrap">{r.category}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{r.disclosurePct.toFixed(1)}%</td>
                      <td className="py-2 px-2">
                        <Select value={r.disclosureLevel} onValueChange={(v) => setLevel(r.measureId, "disclosureLevel", v as WeightLevel)}>
                          <SelectTrigger className="h-7 w-[100px]" data-testid={`select-disclosure-${r.measureId}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LEVEL_OPTIONS.map(o => <SelectItem key={o} value={o} className="capitalize">{o}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2 px-2">
                        <Select value={r.importanceLevel} onValueChange={(v) => setLevel(r.measureId, "importanceLevel", v as WeightLevel)}>
                          <SelectTrigger className="h-7 w-[100px]" data-testid={`select-importance-${r.measureId}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LEVEL_OPTIONS.map(o => <SelectItem key={o} value={o} className="capitalize">{o}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2 pl-2 text-right tabular-nums font-medium" data-testid={`weight-value-${r.measureId}`}>
                        {(weightById.get(r.measureId) ?? 0).toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)} data-testid="button-cancel-weights">Cancel</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-weights">
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
                Save & apply
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Admin() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");

  const { data: portfolios = [] } = useQuery<Portfolio[]>({ queryKey: ["/api/portfolios"] });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Select a file first");
      const fd = new FormData();
      fd.append("file", file);
      if (name) fd.append("name", name);
      const res = await fetch("/api/portfolios/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Upload failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/portfolios"] });
      toast({ title: "Portfolio uploaded", description: `${data.name}: ${data.holdingsCount} holdings` });
      setFile(null); setName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    onError: (e: any) => toast({ title: "Upload failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/portfolios/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portfolios"] });
      toast({ title: "Portfolio deleted" });
    },
  });

  return (
    <div className="space-y-6" data-testid="admin-page">
      <div>
        <h1 className="text-xl font-semibold tracking-tight" data-testid="text-page-title">Admin / Upload</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage data sources and portfolio uploads</p>
      </div>

      <ManagementSourceCard />

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Upload className="h-4 w-4 text-primary" /> Upload Portfolio
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="portfolio-name">Portfolio name</Label>
              <Input
                id="portfolio-name"
                placeholder="e.g. Global Equity Core"
                value={name}
                onChange={e => setName(e.target.value)}
                data-testid="input-portfolio-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="portfolio-file">Excel / CSV file</Label>
              <input
                ref={fileInputRef}
                id="portfolio-file"
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={e => setFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground file:cursor-pointer hover:file:opacity-90"
                data-testid="input-portfolio-file"
              />
              <p className="text-xs text-muted-foreground">
                Requires <code className="text-foreground">ISIN</code> and <code className="text-foreground">Weight</code> columns. Optional: <code className="text-foreground">Company</code>.
              </p>
            </div>
            <Button
              onClick={() => uploadMutation.mutate()}
              disabled={!file || uploadMutation.isPending}
              data-testid="button-upload-portfolio"
            >
              {uploadMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
              Upload
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-primary" /> Current Portfolios ({portfolios.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {portfolios.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-10 border border-dashed border-border rounded-md">
                <FileSpreadsheet className="h-6 w-6 mx-auto mb-2 opacity-50" />
                No portfolios yet
              </div>
            ) : (
              <div className="space-y-2">
                {portfolios.map(p => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 p-3 rounded-md border border-border hover-elevate"
                    data-testid={`portfolio-${p.id}`}
                  >
                    <Briefcase className="h-4 w-4 text-primary flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{p.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        Uploaded {p.uploadedAt ? new Date(p.uploadedAt).toLocaleString() : ""}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm(`Delete portfolio "${p.name}"?`)) deleteMutation.mutate(p.id);
                      }}
                      data-testid={`button-delete-portfolio-${p.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
