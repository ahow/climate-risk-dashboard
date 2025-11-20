import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

export function ProgressTracker() {
  const { data: allProgress } = trpc.progress.getAll.useQuery(undefined, {
    refetchInterval: 2000, // Poll every 2 seconds
  });

  const [elapsedTime, setElapsedTime] = useState(0);

  // Get the most recent running operation
  const progress = allProgress?.find(p => p.status === "running");

  useEffect(() => {
    if (progress && progress.status === "running") {
      const timer = setInterval(() => {
        setElapsedTime(Date.now() - new Date(progress.startedAt).getTime());
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [progress]);

  if (!progress || progress.status !== "running") {
    return null;
  }

  const percentage = Math.round((progress.current / progress.total) * 100);
  const remainingItems = progress.total - progress.current;
  
  // Estimate time remaining based on current progress
  const avgTimePerItem = progress.current > 0 ? elapsedTime / progress.current : 0;
  const estimatedRemainingMs = avgTimePerItem * remainingItems;
  const estimatedMinutes = Math.ceil(estimatedRemainingMs / 60000);

  return (
    <Card className="border-primary/50 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <CardTitle className="text-base">{progress.operation}</CardTitle>
        </div>
        <CardDescription>
          Processing {progress.current.toLocaleString()} of {progress.total.toLocaleString()} items ({percentage}%)
          {estimatedMinutes > 0 && ` • ~${estimatedMinutes} min remaining`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Progress value={percentage} className="h-2" />
        {progress.message && (
          <p className="text-xs text-muted-foreground">{progress.message}</p>
        )}
      </CardContent>
    </Card>
  );
}

