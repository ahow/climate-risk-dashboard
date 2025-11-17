import { drizzle } from "drizzle-orm/mysql2";
import { uploadedFiles } from "./drizzle/schema.ts";
import { desc } from "drizzle-orm";

const db = drizzle(process.env.DATABASE_URL);

const files = await db.select({
  id: uploadedFiles.id,
  filename: uploadedFiles.originalFilename,
  s3Url: uploadedFiles.s3Url,
  uploadedAt: uploadedFiles.uploadedAt
}).from(uploadedFiles).orderBy(desc(uploadedFiles.uploadedAt)).limit(5);

console.log(JSON.stringify(files, null, 2));
