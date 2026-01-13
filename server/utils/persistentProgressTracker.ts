/**
 * Database-backed progress tracking service for long-running operations
 * Persists progress state to database to survive server restarts
 */

import { getDb } from '../db';
import { progressTracking } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';

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

class PersistentProgressTracker {
  private memoryCache: Map<string, ProgressState> = new Map();
  private updateThrottle: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Start tracking a new operation
   */
  async start(operationId: string, operation: string, total: number, message: string): Promise<void> {
    const state: ProgressState = {
      operationId,
      operation,
      status: 'running',
      current: 0,
      total,
      message,
      startedAt: new Date(),
    };

    // Update memory cache
    this.memoryCache.set(operationId, state);

    // Persist to database
    const db = await getDb();
    if (db) {
      try {
        await db.insert(progressTracking).values({
          operationId,
          operation,
          status: 'running',
          current: 0,
          total,
          message,
          startedAt: new Date(),
        });
        console.log(`[PersistentProgress] Started operation ${operationId} in database`);
      } catch (error) {
        console.error(`[PersistentProgress] Failed to persist start:`, error);
      }
    }
  }

  /**
   * Update progress for an operation (throttled to avoid excessive DB writes)
   */
  async update(operationId: string, current: number, message?: string): Promise<void> {
    const progress = this.memoryCache.get(operationId);
    if (progress) {
      progress.current = current;
      if (message) {
        progress.message = message;
      }

      // Throttle database updates to every 5 seconds per operation
      if (!this.updateThrottle.has(operationId)) {
        this.updateThrottle.set(operationId, setTimeout(() => {
          this.persistUpdate(operationId, current, message);
          this.updateThrottle.delete(operationId);
        }, 5000));
      }
    }
  }

  /**
   * Persist update to database (called by throttled update)
   */
  private async persistUpdate(operationId: string, current: number, message?: string): Promise<void> {
    const db = await getDb();
    if (db) {
      try {
        const updateData: any = { current };
        if (message) {
          updateData.message = message;
        }
        await db.update(progressTracking)
          .set(updateData)
          .where(eq(progressTracking.operationId, operationId));
      } catch (error) {
        console.error(`[PersistentProgress] Failed to persist update:`, error);
      }
    }
  }

  /**
   * Force immediate database update (for critical state changes)
   */
  async forceUpdate(operationId: string, current: number, message?: string): Promise<void> {
    const progress = this.memoryCache.get(operationId);
    if (progress) {
      progress.current = current;
      if (message) {
        progress.message = message;
      }
    }
    await this.persistUpdate(operationId, current, message);
  }

  /**
   * Mark operation as completed
   */
  async complete(operationId: string, message?: string): Promise<void> {
    const progress = this.memoryCache.get(operationId);
    if (progress) {
      progress.status = 'completed';
      progress.current = progress.total;
      progress.completedAt = new Date();
      if (message) {
        progress.message = message;
      }
    }

    const db = await getDb();
    if (db) {
      try {
        await db.update(progressTracking)
          .set({
            status: 'completed',
            current: progress?.total || 0,
            completedAt: new Date(),
            message: message || progress?.message,
          })
          .where(eq(progressTracking.operationId, operationId));
        console.log(`[PersistentProgress] Completed operation ${operationId}`);
      } catch (error) {
        console.error(`[PersistentProgress] Failed to persist completion:`, error);
      }
    }
  }

  /**
   * Mark operation as failed
   */
  async fail(operationId: string, error: string): Promise<void> {
    const progress = this.memoryCache.get(operationId);
    if (progress) {
      progress.status = 'failed';
      progress.completedAt = new Date();
      progress.error = error;
      progress.message = `Failed: ${error}`;
    }

    const db = await getDb();
    if (db) {
      try {
        await db.update(progressTracking)
          .set({
            status: 'failed',
            completedAt: new Date(),
            error,
            message: `Failed: ${error}`,
          })
          .where(eq(progressTracking.operationId, operationId));
        console.log(`[PersistentProgress] Failed operation ${operationId}`);
      } catch (error) {
        console.error(`[PersistentProgress] Failed to persist failure:`, error);
      }
    }
  }

  /**
   * Cancel an operation
   */
  async cancel(operationId: string): Promise<void> {
    const progress = this.memoryCache.get(operationId);
    if (progress) {
      progress.cancelled = true;
      progress.status = 'cancelled';
      progress.completedAt = new Date();
      progress.message = 'Operation cancelled by user';
    }

    const db = await getDb();
    if (db) {
      try {
        await db.update(progressTracking)
          .set({
            status: 'cancelled',
            completedAt: new Date(),
            message: 'Operation cancelled by user',
          })
          .where(eq(progressTracking.operationId, operationId));
        console.log(`[PersistentProgress] Cancelled operation ${operationId}`);
      } catch (error) {
        console.error(`[PersistentProgress] Failed to persist cancellation:`, error);
      }
    }
  }

  /**
   * Pause an operation
   */
  async pause(operationId: string): Promise<void> {
    const progress = this.memoryCache.get(operationId);
    if (progress && progress.status === 'running') {
      progress.paused = true;
      progress.status = 'paused';
      progress.message = 'Operation paused by user';
    }

    const db = await getDb();
    if (db) {
      try {
        await db.update(progressTracking)
          .set({
            status: 'paused',
            message: 'Operation paused by user',
          })
          .where(eq(progressTracking.operationId, operationId));
        console.log(`[PersistentProgress] Paused operation ${operationId}`);
      } catch (error) {
        console.error(`[PersistentProgress] Failed to persist pause:`, error);
      }
    }
  }

  /**
   * Resume a paused operation
   */
  async resume(operationId: string): Promise<void> {
    const progress = this.memoryCache.get(operationId);
    if (progress && progress.status === 'paused') {
      progress.paused = false;
      progress.status = 'running';
      progress.message = 'Operation resumed';
    }

    const db = await getDb();
    if (db) {
      try {
        await db.update(progressTracking)
          .set({
            status: 'running',
            message: 'Operation resumed',
          })
          .where(eq(progressTracking.operationId, operationId));
        console.log(`[PersistentProgress] Resumed operation ${operationId}`);
      } catch (error) {
        console.error(`[PersistentProgress] Failed to persist resume:`, error);
      }
    }
  }

  /**
   * Check if an operation is cancelled
   */
  isCancelled(operationId: string): boolean {
    const progress = this.memoryCache.get(operationId);
    return progress?.cancelled === true || progress?.status === 'cancelled';
  }

  /**
   * Check if an operation is paused
   */
  isPaused(operationId: string): boolean {
    const progress = this.memoryCache.get(operationId);
    return progress?.paused === true || progress?.status === 'paused';
  }

  /**
   * Get progress for an operation (from memory cache or database)
   */
  async get(operationId: string): Promise<ProgressState | undefined> {
    // Check memory cache first
    if (this.memoryCache.has(operationId)) {
      return this.memoryCache.get(operationId);
    }

    // Fallback to database
    const db = await getDb();
    if (db) {
      try {
        const result = await db.select()
          .from(progressTracking)
          .where(eq(progressTracking.operationId, operationId))
          .limit(1);

        if (result.length > 0) {
          const dbProgress = result[0];
          const state: ProgressState = {
            operationId: dbProgress.operationId,
            operation: dbProgress.operation,
            status: dbProgress.status,
            current: dbProgress.current,
            total: dbProgress.total,
            message: dbProgress.message || '',
            startedAt: dbProgress.startedAt,
            completedAt: dbProgress.completedAt || undefined,
            error: dbProgress.error || undefined,
            cancelled: dbProgress.status === 'cancelled',
            paused: dbProgress.status === 'paused',
          };
          // Cache in memory
          this.memoryCache.set(operationId, state);
          return state;
        }
      } catch (error) {
        console.error(`[PersistentProgress] Failed to get from database:`, error);
      }
    }

    return undefined;
  }

  /**
   * Get all active operations (from database)
   */
  async getAll(): Promise<ProgressState[]> {
    const db = await getDb();
    if (!db) {
      return Array.from(this.memoryCache.values());
    }

    try {
      const results = await db.select().from(progressTracking);
      return results.map(dbProgress => ({
        operationId: dbProgress.operationId,
        operation: dbProgress.operation,
        status: dbProgress.status,
        current: dbProgress.current,
        total: dbProgress.total,
        message: dbProgress.message || '',
        startedAt: dbProgress.startedAt,
        completedAt: dbProgress.completedAt || undefined,
        error: dbProgress.error || undefined,
        cancelled: dbProgress.status === 'cancelled',
        paused: dbProgress.status === 'paused',
      }));
    } catch (error) {
      console.error(`[PersistentProgress] Failed to get all from database:`, error);
      return Array.from(this.memoryCache.values());
    }
  }

  /**
   * Clear all progress entries (for testing/debugging)
   */
  async clearAll(): Promise<void> {
    this.memoryCache.clear();
    const db = await getDb();
    if (db) {
      try {
        await db.delete(progressTracking);
        console.log(`[PersistentProgress] Cleared all progress entries`);
      } catch (error) {
        console.error(`[PersistentProgress] Failed to clear database:`, error);
      }
    }
  }

  /**
   * Load all running/paused operations from database into memory cache
   * Called on server startup to resume interrupted operations
   */
  async loadFromDatabase(): Promise<ProgressState[]> {
    const db = await getDb();
    if (!db) {
      return [];
    }

    try {
      const results = await db.select().from(progressTracking);
      const runningOrPaused = results.filter(p => 
        p.status === 'running' || p.status === 'paused'
      );

      for (const dbProgress of runningOrPaused) {
        const state: ProgressState = {
          operationId: dbProgress.operationId,
          operation: dbProgress.operation,
          status: dbProgress.status,
          current: dbProgress.current,
          total: dbProgress.total,
          message: dbProgress.message || '',
          startedAt: dbProgress.startedAt,
          completedAt: dbProgress.completedAt || undefined,
          error: dbProgress.error || undefined,
          cancelled: dbProgress.status === 'cancelled',
          paused: dbProgress.status === 'paused',
        };
        this.memoryCache.set(dbProgress.operationId, state);
      }

      console.log(`[PersistentProgress] Loaded ${runningOrPaused.length} operations from database`);
      return runningOrPaused.map(dbProgress => ({
        operationId: dbProgress.operationId,
        operation: dbProgress.operation,
        status: dbProgress.status,
        current: dbProgress.current,
        total: dbProgress.total,
        message: dbProgress.message || '',
        startedAt: dbProgress.startedAt,
        completedAt: dbProgress.completedAt || undefined,
        error: dbProgress.error || undefined,
        cancelled: dbProgress.status === 'cancelled',
        paused: dbProgress.status === 'paused',
      }));
    } catch (error) {
      console.error(`[PersistentProgress] Failed to load from database:`, error);
      return [];
    }
  }

  /**
   * Cleanup completed/failed operations older than 24 hours
   */
  async cleanup(): Promise<void> {
    const db = await getDb();
    if (!db) {
      return;
    }

    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      // Note: Drizzle doesn't have a direct way to delete with complex WHERE clauses
      // We'll fetch and delete individually
      const old = await db.select().from(progressTracking);
      for (const progress of old) {
        if (
          progress.status !== 'running' &&
          progress.completedAt &&
          progress.completedAt < oneDayAgo
        ) {
          await db.delete(progressTracking)
            .where(eq(progressTracking.operationId, progress.operationId));
          this.memoryCache.delete(progress.operationId);
        }
      }
      console.log(`[PersistentProgress] Cleanup completed`);
    } catch (error) {
      console.error(`[PersistentProgress] Cleanup failed:`, error);
    }
  }
}

// Singleton instance
export const persistentProgressTracker = new PersistentProgressTracker();

// Cleanup every hour
setInterval(() => persistentProgressTracker.cleanup(), 60 * 60 * 1000);
