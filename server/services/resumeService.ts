/**
 * Resume Service - Automatically resumes interrupted calculations on server startup
 * Checks database for running/paused operations and restarts them
 */

import { persistentProgressTracker } from '../utils/persistentProgressTracker';
import { calculateGeographicRisksOptimized } from '../workers/optimizedGeoRiskWorker';

export async function resumeInterruptedOperations() {
  console.log('[ResumeService] Checking for interrupted operations...');
  
  try {
    // Load all running/paused operations from database
    const operations = await persistentProgressTracker.loadFromDatabase();
    
    if (operations.length === 0) {
      console.log('[ResumeService] No interrupted operations found');
      return;
    }
    
    console.log(`[ResumeService] Found ${operations.length} interrupted operations:`);
    operations.forEach(op => {
      console.log(`  - ${op.operationId}: ${op.operation} (${op.status}) - ${op.current}/${op.total}`);
    });
    
    // Resume each operation
    for (const operation of operations) {
      if (operation.operation === 'Calculating geographic risks') {
        console.log(`[ResumeService] Resuming geographic risk calculation: ${operation.operationId}`);
        
        // Mark as running
        await persistentProgressTracker.resume(operation.operationId);
        
        // Restart the worker in background
        setImmediate(() => {
          calculateGeographicRisksOptimized(operation.operationId)
            .then(result => {
              console.log(`[ResumeService] Resumed operation completed:`, result);
            })
            .catch(error => {
              console.error(`[ResumeService] Resumed operation failed:`, error);
            });
        });
      } else {
        console.log(`[ResumeService] Unknown operation type: ${operation.operation}`);
      }
    }
    
    console.log('[ResumeService] All interrupted operations have been resumed');
  } catch (error) {
    console.error('[ResumeService] Failed to resume operations:', error);
  }
}

/**
 * Initialize resume service on server startup
 * Call this from the main server entry point
 */
export function initializeResumeService() {
  // Wait 5 seconds after server starts to ensure database is ready
  setTimeout(() => {
    resumeInterruptedOperations().catch(error => {
      console.error('[ResumeService] Initialization failed:', error);
    });
  }, 5000);
}
