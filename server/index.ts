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
      setTimeout(() => recoverOrphanedOperations(), 3000);
      setTimeout(() => backfillManagementScores(), 10000);
    },
  );
})();

async function backfillManagementScores() {
  try {
    const companies = await storage.getCompanies();
    const missing: Array<{id: number, isin: string, name: string}> = [];
    for (const company of companies) {
      const mgmt = await storage.getManagementScore(company.id);
      if (!mgmt) {
        missing.push({ id: company.id, isin: company.isin, name: company.companyName });
      }
    }
    if (missing.length === 0) {
      log(`[startup] All ${companies.length} companies have management scores`);
      return;
    }
    log(`[startup] Backfilling management scores for ${missing.length}/${companies.length} companies`);
    let success = 0;
    for (const company of missing) {
      try {
        const mgmtResult = await fetchManagementPerformance(company.isin);
        if (mgmtResult) {
          await storage.deleteManagementScore(company.id);
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
          log(`[startup] Management score saved for ${company.name} (${success}/${missing.length})`);
        }
      } catch (err: any) {
        log(`[startup] Management score error for ${company.name}: ${err.message}`);
      }
    }
    log(`[startup] Management backfill complete: ${success}/${missing.length} scores saved`);
  } catch (err: any) {
    log(`[startup] Management backfill failed: ${err.message}`);
  }
}
