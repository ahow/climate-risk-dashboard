import { Router } from "express";
import { getDb } from "../db";

export const migrateRouter = Router();

/**
 * Database migration endpoint
 * This endpoint creates the uploadedFiles table if it doesn't exist
 * Access: GET /migrate/schema
 */
migrateRouter.get("/schema", async (req, res) => {
  try {
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Database not available" });
    }

    // Create uploadedFiles table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS uploadedFiles (
        id int AUTO_INCREMENT PRIMARY KEY,
        filename varchar(255) NOT NULL,
        originalFilename varchar(255) NOT NULL,
        fileType varchar(100) NOT NULL,
        fileSize int NOT NULL,
        s3Key varchar(512) NOT NULL,
        s3Url varchar(1024) NOT NULL,
        uploadedBy int,
        uploadedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        description text,
        FOREIGN KEY (uploadedBy) REFERENCES users(id)
      )
    `);

    // Get list of uploaded files
    const [files] = await db.execute(
      'SELECT id, filename, originalFilename, s3Url, uploadedAt FROM uploadedFiles ORDER BY uploadedAt DESC LIMIT 10'
    );

    res.json({
      success: true,
      message: "Schema migration completed successfully",
      uploadedFiles: files,
      publicUrlFormat: "https://climate-risk-dash-40e3582ff948.herokuapp.com/public/files/{fileId}"
    });
  } catch (error: any) {
    console.error("Migration error:", error);
    res.status(500).json({
      error: "Migration failed",
      details: error.message
    });
  }
});

