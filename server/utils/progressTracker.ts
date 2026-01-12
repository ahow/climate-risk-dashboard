/**
 * Progress tracking service for long-running operations
 * Stores progress state in memory and provides real-time updates
 */

export interface ProgressState {
  operationId: string;
  operation: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';
  current: number;
  total: number;
  message: string;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
  cancelled?: boolean;
  paused?: boolean;
}

class ProgressTracker {
  private progressMap: Map<string, ProgressState> = new Map();

  /**
   * Start tracking a new operation
   */
  start(operationId: string, operation: string, total: number, message: string): void {
    this.progressMap.set(operationId, {
      operationId,
      operation,
      status: 'running',
      current: 0,
      total,
      message,
      startedAt: new Date(),
    });
  }

  /**
   * Update progress for an operation
   */
  update(operationId: string, current: number, message?: string): void {
    const progress = this.progressMap.get(operationId);
    if (progress) {
      progress.current = current;
      if (message) {
        progress.message = message;
      }
    }
  }

  /**
   * Mark operation as completed
   */
  complete(operationId: string, message?: string): void {
    const progress = this.progressMap.get(operationId);
    if (progress) {
      progress.status = 'completed';
      progress.current = progress.total;
      progress.completedAt = new Date();
      if (message) {
        progress.message = message;
      }
    }
  }

  /**
   * Mark operation as failed
   */
  fail(operationId: string, error: string): void {
    const progress = this.progressMap.get(operationId);
    if (progress) {
      progress.status = 'failed';
      progress.completedAt = new Date();
      progress.error = error;
      progress.message = `Failed: ${error}`;
    }
  }

  /**
   * Cancel an operation
   */
  cancel(operationId: string): void {
    const progress = this.progressMap.get(operationId);
    if (progress) {
      progress.cancelled = true;
      progress.status = 'cancelled';
      progress.completedAt = new Date();
      progress.message = 'Operation cancelled by user';
    }
  }

  /**
   * Pause an operation
   */
  pause(operationId: string): void {
    const progress = this.progressMap.get(operationId);
    if (progress && progress.status === 'running') {
      progress.paused = true;
      progress.status = 'paused';
      progress.message = 'Operation paused by user';
    }
  }

  /**
   * Resume a paused operation
   */
  resume(operationId: string): void {
    const progress = this.progressMap.get(operationId);
    if (progress && progress.status === 'paused') {
      progress.paused = false;
      progress.status = 'running';
      progress.message = 'Operation resumed';
    }
  }

  /**
   * Check if an operation is cancelled
   */
  isCancelled(operationId: string): boolean {
    const progress = this.progressMap.get(operationId);
    return progress?.cancelled === true;
  }

  /**
   * Check if an operation is paused
   */
  isPaused(operationId: string): boolean {
    const progress = this.progressMap.get(operationId);
    return progress?.paused === true;
  }

  /**
   * Get progress for an operation
   */
  get(operationId: string): ProgressState | undefined {
    return this.progressMap.get(operationId);
  }

  /**
   * Get all active operations
   */
  getAll(): ProgressState[] {
    return Array.from(this.progressMap.values());
  }

  /**
   * Clear all progress entries
   */
  clearAll(): void {
    this.progressMap.clear();
  }

  /**
   * Clear completed/failed operations older than 5 minutes
   */
  cleanup(): void {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const entries = Array.from(this.progressMap.entries());
    for (const [id, progress] of entries) {
      if (
        progress.status !== 'running' &&
        progress.completedAt &&
        progress.completedAt < fiveMinutesAgo
      ) {
        this.progressMap.delete(id);
      }
    }
  }
}

// Singleton instance
export const progressTracker = new ProgressTracker();

// Cleanup every minute
setInterval(() => progressTracker.cleanup(), 60 * 1000);

