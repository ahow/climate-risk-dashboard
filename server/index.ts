import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { ensureSchemaUpdates } from "./db";
import { recoverOrphanedOperations } from "./services/operationManager";
import { storage } from "./storage";
import { fetchManagementPerformance } from "./services/externalApis";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await ensureSchemaUpdates();
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
      setTimeout(() => recoverOrphanedOperations(), 5000);
      setTimeout(() => backfillManagementScores(), 60000);
    },
  );
})();

async function backfillManagementScores() {
  try {
    log(`[startup] Starting management score backfill check...`);
    const companies = await storage.getCompanies();
    log(`[startup] Found ${companies.length} companies total`);
    const missing: Array<{id: number, isin: string, name: string}> = [];
    let hasScore = 0;
    let corruptedCount = 0;
    for (const company of companies) {
      try {
        const mgmt = await storage.getManagementScore(company.id);
        if (!mgmt) {
          missing.push({ id: company.id, isin: company.isin, name: company.companyName });
        } else if (mgmt.totalScore == null || mgmt.totalPossible == null || mgmt.totalPossible !== 26) {
          missing.push({ id: company.id, isin: company.isin, name: company.companyName });
          corruptedCount++;
        } else {
          hasScore++;
        }
      } catch (checkErr: any) {
        log(`[startup] Error checking management score for ${company.companyName} (id:${company.id}): ${checkErr.message}`);
        missing.push({ id: company.id, isin: company.isin, name: company.companyName });
      }
    }
    log(`[startup] Management score status: ${hasScore} valid, ${missing.length} need repair (${corruptedCount} corrupted, ${missing.length - corruptedCount} missing)`);
    if (missing.length === 0) {
      log(`[startup] All ${companies.length} companies have valid management scores`);
      return;
    }
    log(`[startup] Backfilling management scores for ${missing.length} companies...`);
    let success = 0;
    let failed = 0;
    let noData = 0;
    for (const company of missing) {
      try {
        const mgmtResult = await fetchManagementPerformance(company.isin, company.name);
        if (mgmtResult) {
          try {
            await storage.deleteManagementScore(company.id);
          } catch (delErr: any) {
            log(`[startup] Delete error for ${company.name}: ${delErr.message}`);
          }
          try {
            await storage.createManagementScore({
              companyId: company.id,
              totalScore: mgmtResult.company.totalScore,
              totalPossible: mgmtResult.company.totalPossible,
              summary: mgmtResult.company.summary,
              analysisStatus: mgmtResult.company.analysisStatus,
              scores: mgmtResult.scores,
              documents: mgmtResult.documents,
            });
            success++;
            if (success % 10 === 0 || success <= 3) {
              log(`[startup] Management score saved for ${company.name} (${success}/${missing.length})`);
            }
          } catch (createErr: any) {
            failed++;
            log(`[startup] CREATE FAILED for ${company.name}: ${createErr.message}`);
          }
        } else {
          noData++;
          if (noData <= 5) {
            log(`[startup] No management data available for ${company.name} (${company.isin})`);
          }
        }
      } catch (err: any) {
        failed++;
        log(`[startup] Fetch error for ${company.name}: ${err.message}`);
      }
    }
    log(`[startup] Management backfill complete: ${success} saved, ${noData} no data, ${failed} failed out of ${missing.length} missing`);
  } catch (err: any) {
    log(`[startup] Management backfill FATAL error: ${err.message}`);
    log(`[startup] Stack: ${err.stack}`);
  }
}
