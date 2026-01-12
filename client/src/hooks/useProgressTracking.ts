import { useEffect, useRef } from 'react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

interface ProgressToast {
  toastId: string | number;
  lastProgress: number;
}

/**
 * Hook to track progress of a long-running operation
 * Shows real-time progress updates in toast notifications
 */
export function useProgressTracking(operationId: string | null | undefined) {
  const toastRef = useRef<ProgressToast | null>(null);
  
  const { data: progress } = trpc.progress.get.useQuery(
    { operationId: operationId! },
    {
      enabled: !!operationId,
      refetchInterval: (query) => {
        // Poll every 5 seconds while running (reduced from 1s to save database queries)
        return query.state.data?.status === 'running' ? 5000 : false;
      },
    }
  );

  useEffect(() => {
    if (!progress) return;

    const percentage = progress.total > 0 
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

    // Create or update toast
    if (!toastRef.current) {
      // Create new toast
      const toastId = toast.loading(progress.message, {
        description: `${percentage}% complete`,
      });
      toastRef.current = { toastId, lastProgress: percentage };
    } else if (progress.status === 'running') {
      // Update existing toast only if progress changed
      if (percentage !== toastRef.current.lastProgress) {
        toast.loading(progress.message, {
          id: toastRef.current.toastId,
          description: `${percentage}% complete`,
        });
        toastRef.current.lastProgress = percentage;
      }
    } else if (progress.status === 'completed') {
      // Show success toast
      toast.success(progress.message, {
        id: toastRef.current.toastId,
        description: 'Operation completed successfully',
      });
      toastRef.current = null;
    } else if (progress.status === 'failed') {
      // Show error toast
      toast.error(progress.message, {
        id: toastRef.current.toastId,
        description: progress.error || 'Operation failed',
      });
      toastRef.current = null;
    } else if (progress.status === 'cancelled') {
      // Show cancelled toast
      toast.info('Operation cancelled', {
        id: toastRef.current.toastId,
        description: progress.message,
      });
      toastRef.current = null;
    }
  }, [progress]);

  return progress;
}

