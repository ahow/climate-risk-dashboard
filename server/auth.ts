import type { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";

declare module "express-session" {
  interface SessionData {
    role?: "admin" | "viewer";
  }
}

const MemoryStore = createMemoryStore(session);

export function setupAuth(app: Express) {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error("SESSION_SECRET env var is required");
  }

  app.set("trust proxy", 1);

  app.use(
    session({
      name: "signal.sid",
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      store: new MemoryStore({ checkPeriod: 86_400_000 }),
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 24 * 14,
      },
    }),
  );

  app.post("/api/auth/login", (req, res) => {
    const { password } = req.body || {};
    if (typeof password !== "string" || !password) {
      return res.status(400).json({ error: "Password required" });
    }
    const adminPw = process.env.ADMIN_PASSWORD;
    const viewerPw = process.env.VIEWER_PASSWORD;
    if (!adminPw || !viewerPw) {
      return res.status(503).json({ error: "Authentication not configured on server" });
    }
    if (password === adminPw) {
      req.session.role = "admin";
      return req.session.save(() => res.json({ role: "admin" }));
    }
    if (password === viewerPw) {
      req.session.role = "viewer";
      return req.session.save(() => res.json({ role: "viewer" }));
    }
    return res.status(401).json({ error: "Incorrect password" });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.clearCookie("signal.sid");
      res.json({ ok: true });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.session.role) return res.status(401).json({ role: null });
    res.json({ role: req.session.role });
  });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.session?.role === "admin" || req.session?.role === "viewer") return next();
  return res.status(401).json({ error: "Authentication required" });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.session?.role === "admin") return next();
  return res.status(403).json({ error: "Admin role required" });
}
