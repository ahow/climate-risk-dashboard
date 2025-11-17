import { Router } from "express";
import { getDb } from "../db";
import { uploadedFiles } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { storageGet } from "../storage";

export const publicFilesRouter = Router();

/**
 * Public endpoint to download uploaded files
 * GET /public/files/:fileId
 */
publicFilesRouter.get("/files/:fileId", async (req, res) => {
  try {
    const fileId = parseInt(req.params.fileId);
    
    if (isNaN(fileId)) {
      return res.status(400).json({ error: "Invalid file ID" });
    }

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Database not available" });
    }

    // Get file metadata from database
    const files = await db
      .select()
      .from(uploadedFiles)
      .where(eq(uploadedFiles.id, fileId))
      .limit(1);

    if (files.length === 0) {
      return res.status(404).json({ error: "File not found" });
    }

    const file = files[0];

    // Use the direct S3 URL stored in the database
    const s3Url = file.s3Url;
    
    if (!s3Url) {
      return res.status(500).json({ error: "File URL not available" });
    }

    // Fetch the file from S3
    const response = await fetch(s3Url);
    
    if (!response.ok) {
      return res.status(500).json({ error: "Failed to fetch file from storage" });
    }

    // Stream the file to the client
    res.setHeader("Content-Type", file.fileType);
    res.setHeader("Content-Disposition", `attachment; filename="${file.originalFilename}"`);
    
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error("[PublicFiles] Error downloading file:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

