import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Activity, Pause, Play, Trash2, Loader2, Clock, CheckCircle2,
  XCircle, AlertCircle,
} from "lucide-react";

function formatDuration(start: string, end?: string | null): string {
  const startTime = new Date(start).getTime();
  const endTime = end ? new Date(end).getTime() : Date.now();
  const diff = Math.floor((endTime - startTime) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`;
  return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { icon: any; variant: string; className: string }> = {
    pending: { icon: Clock, variant: "secondary", className: "text-muted-foreground" },
    running: { icon: Loader2, variant: "default", className: "text-primary animate-spin" },
    paused: { icon: Pause, variant: "secondary", className: "text-yellow-600" },
    completed: { icon: CheckCircle2, variant: "secondary", className: "text-green-600" },
    failed: { icon: XCircle, variant: "destructive", className: "text-red-600" },
    cancelled: { icon: AlertCircle, variant: "secondary", className: "text-muted-foreground" },
  };
  const { icon: Icon, className } = config[status] || config.pending;
  return (
    <Badge variant="secondary" className="flex items-center gap-1">
      <Icon className={`h-3 w-3 ${className}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

const typeLabels: Record<string, string> = {
  geographic_risk: "Geographic Risk",
  supply_chain_risk: "Supply Chain Risk",
  management_score: "Management Score",
  full_assessment: "Full Assessment",
};

export default function CalculationMonitor() {
  const { toast } = useToast();

  const { data: operations = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/operations"],
    refetchInterval: 3000,
  });

  const pauseMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/operations/${id}/pause`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/operations"] });
      toast({ title: "Operation Paused" });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/operations/${id}/resume`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/operations"] });
      toast({ title: "Operation Resumed" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/operations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/operations"] });
      toast({ title: "Operation Removed" });
    },
  });

  const activeOps = operations.filter((op: any) => ["running", "pending", "paused"].includes(op.status));
  const completedOps = operations.filter((op: any) => ["completed", "failed", "cancelled"].includes(op.status));

  return (
    <div className="space-y-6" data-testid="monitor-page">
      <div>
        <h1 className="text-2xl font-bold text-foreground" data-testid="text-page-title">
          Calculation Monitor
        </h1>
        <p className="text-muted-foreground mt-1">
          Track and control long-running risk calculations
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : operations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center" data-testid="empty-state">
            <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Calculations</h3>
            <p className="text-muted-foreground">
              Start a risk calculation from a company's detail page.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {activeOps.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Active ({activeOps.length})
              </h2>
              {activeOps.map((op: any) => {
                const progress = op.totalItems > 0 ? (op.processedItems / op.totalItems) * 100 : 0;
                return (
                  <Card key={op.id} data-testid={`card-operation-${op.id}`}>
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <StatusBadge status={op.status} />
                          <span className="font-medium">{typeLabels[op.type] || op.type}</span>
                          <span className="text-sm text-muted-foreground">{op.companyName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {formatDuration(op.startedAt, op.completedAt)}
                          </span>
                          {op.status === "running" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => pauseMutation.mutate(op.id)}
                              disabled={pauseMutation.isPending}
                              data-testid={`button-pause-${op.id}`}
                            >
                              <Pause className="h-3 w-3 mr-1" />
                              Pause
                            </Button>
                          )}
                          {op.status === "paused" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => resumeMutation.mutate(op.id)}
                              disabled={resumeMutation.isPending}
                              data-testid={`button-resume-${op.id}`}
                            >
                              <Play className="h-3 w-3 mr-1" />
                              Resume
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteMutation.mutate(op.id)}
                            className="text-muted-foreground hover:text-destructive"
                            data-testid={`button-delete-${op.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <Progress value={progress} className="h-2 mb-2" />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{op.statusMessage}</span>
                        <span>{op.processedItems}/{op.totalItems} ({progress.toFixed(0)}%)</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {completedOps.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
                History ({completedOps.length})
              </h2>
              {completedOps.map((op: any) => (
                <Card key={op.id} className="opacity-80" data-testid={`card-operation-${op.id}`}>
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <StatusBadge status={op.status} />
                        <span className="font-medium text-sm">{typeLabels[op.type] || op.type}</span>
                        <span className="text-sm text-muted-foreground">{op.companyName}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">{op.statusMessage}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDuration(op.startedAt, op.completedAt)}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteMutation.mutate(op.id)}
                          className="text-muted-foreground hover:text-destructive h-8 w-8"
                          data-testid={`button-delete-${op.id}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
