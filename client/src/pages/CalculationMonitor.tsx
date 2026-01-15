import { useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, XCircle, PauseCircle, Clock, PlayCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function CalculationMonitor() {
  const { data: operations, isLoading, refetch } = trpc.progress.getAll.useQuery(undefined, {
    refetchInterval: 5000, // Poll every 5 seconds
  });

  const pauseMutation = trpc.progress.pause.useMutation({
    onSuccess: () => {
      toast.success('Operation paused');
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to pause: ${error.message}`);
    },
  });

  const resumeMutation = trpc.progress.resume.useMutation({
    onSuccess: () => {
      toast.success('Operation resumed');
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to resume: ${error.message}`);
    },
  });

  const cancelAllRunningMutation = trpc.progress.cancelAllRunning.useMutation({
    onSuccess: (data) => {
      toast.success(`Cancelled ${data.cancelled} running calculation(s)`);
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to cancel: ${error.message}`);
    },
  });

  const clearAllMutation = trpc.progress.clearAll.useMutation({
    onSuccess: () => {
      toast.success('All progress entries cleared');
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to clear: ${error.message}`);
    },
  });

  useEffect(() => {
    // Auto-refresh on mount
    refetch();
  }, [refetch]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'paused':
        return <PauseCircle className="h-4 w-4 text-amber-500" />;
      case 'cancelled':
        return <XCircle className="h-4 w-4 text-gray-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      running: 'default',
      completed: 'secondary',
      failed: 'destructive',
      paused: 'outline',
      cancelled: 'outline',
    };
    return (
      <Badge variant={variants[status] || 'outline'} className="capitalize">
        {status}
      </Badge>
    );
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleString();
  };

  const formatDuration = (start: Date | string, end?: Date | string) => {
    const startTime = new Date(start).getTime();
    const endTime = end ? new Date(end).getTime() : Date.now();
    const durationMs = endTime - startTime;
    
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((durationMs % (1000 * 60)) / 1000);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Loading calculation history...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Calculation Monitor</h1>
          <p className="text-muted-foreground mt-1">
            Track progress of long-running geographic risk calculations
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()}>
            Refresh
          </Button>
          <Button
            variant="destructive"
            onClick={() => cancelAllRunningMutation.mutate()}
            disabled={cancelAllRunningMutation.isPending || !operations || operations.filter(op => op.status === 'running').length === 0}
          >
            {cancelAllRunningMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Cancelling...</>
            ) : (
              'Cancel All Running'
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => clearAllMutation.mutate()}
            disabled={clearAllMutation.isPending || !operations || operations.length === 0}
          >
            Clear All
          </Button>
        </div>
      </div>

      {!operations || operations.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No calculation operations found</p>
              <p className="text-sm mt-2">
                Start a geographic risk calculation from the Dashboard to see progress here
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {operations.map((operation) => (
            <Card key={operation.operationId}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(operation.status)}
                    <div>
                      <CardTitle className="text-lg">{operation.operation}</CardTitle>
                      <CardDescription className="text-xs font-mono mt-1">
                        {operation.operationId}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(operation.status)}
                    {operation.status === 'running' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => pauseMutation.mutate({ operationId: operation.operationId })}
                        disabled={pauseMutation.isPending}
                      >
                        <PauseCircle className="h-4 w-4 mr-1" />
                        Pause
                      </Button>
                    )}
                    {operation.status === 'paused' && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => resumeMutation.mutate({ operationId: operation.operationId })}
                        disabled={resumeMutation.isPending}
                      >
                        <PlayCircle className="h-4 w-4 mr-1" />
                        Resume
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {/* Progress Bar */}
                  <div>
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-medium">
                        {operation.current} / {operation.total} ({Math.round((operation.current / operation.total) * 100)}%)
                      </span>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          operation.status === 'completed'
                            ? 'bg-green-500'
                            : operation.status === 'failed'
                            ? 'bg-red-500'
                            : operation.status === 'paused'
                            ? 'bg-amber-500'
                            : 'bg-blue-500'
                        }`}
                        style={{ width: `${(operation.current / operation.total) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Status Message */}
                  <div className="text-sm">
                    <span className="text-muted-foreground">Status: </span>
                    <span>{operation.message}</span>
                  </div>

                  {/* Error Message */}
                  {operation.error && (
                    <div className="text-sm text-red-500 bg-red-50 dark:bg-red-950 p-2 rounded">
                      <span className="font-medium">Error: </span>
                      <span>{operation.error}</span>
                    </div>
                  )}

                  {/* Timing Information */}
                  <div className="grid grid-cols-3 gap-4 text-sm pt-2 border-t">
                    <div>
                      <span className="text-muted-foreground">Started</span>
                      <p className="font-medium">{formatDate(operation.startedAt)}</p>
                    </div>
                    {operation.completedAt && (
                      <div>
                        <span className="text-muted-foreground">Completed</span>
                        <p className="font-medium">{formatDate(operation.completedAt)}</p>
                      </div>
                    )}
                    <div>
                      <span className="text-muted-foreground">Duration</span>
                      <p className="font-medium">
                        {formatDuration(operation.startedAt, operation.completedAt)}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
