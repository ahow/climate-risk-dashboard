import { useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Trash2, Loader2, FileSpreadsheet, Briefcase } from "lucide-react";
import type { Portfolio } from "@shared/schema";

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
        <p className="text-sm text-muted-foreground mt-1">Manage portfolio uploads for analysis</p>
      </div>

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
