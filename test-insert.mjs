#!/usr/bin/env node
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { pgTable, integer, varchar, text, timestamp } from 'drizzle-orm/pg-core';

// Recreate the uploadedFiles table definition
const uploadedFiles = pgTable("uploadedFiles", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  filename: varchar("filename", { length: 255 }).notNull(),
  originalFilename: varchar("originalFilename", { length: 255 }).notNull(),
  fileType: varchar("fileType", { length: 100 }).notNull(),
  fileSize: integer("fileSize").notNull(),
  s3Key: varchar("s3Key", { length: 512 }).notNull(),
  s3Url: varchar("s3Url", { length: 1024 }).notNull(),
  uploadedBy: integer("uploadedBy"),
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
  description: text("description"),
});

// Test the insert query generation
console.log('Testing Drizzle insert query generation...\n');

// Create a mock connection (won't actually connect)
const mockSql = postgres('postgresql://fake:fake@localhost/fake', {
  max: 0, // Don't actually connect
});

const db = drizzle(mockSql);

// Test 1: Insert with all fields except id and uploadedAt
const values1 = {
  filename: 'test.xlsx',
  originalFilename: 'test.xlsx',
  fileType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  fileSize: 95677,
  s3Key: 'uploads/test.xlsx',
  s3Url: 'https://example.com/test.xlsx',
};

try {
  const query1 = db.insert(uploadedFiles).values(values1).toSQL();
  console.log('Test 1: Insert without id and uploadedAt');
  console.log('SQL:', query1.sql);
  console.log('Params:', query1.params);
  console.log('');
} catch (e) {
  console.error('Test 1 failed:', e.message);
}

// Test 2: Insert with explicit undefined for id and uploadedAt
const values2 = {
  id: undefined,
  filename: 'test.xlsx',
  originalFilename: 'test.xlsx',
  fileType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  fileSize: 95677,
  s3Key: 'uploads/test.xlsx',
  s3Url: 'https://example.com/test.xlsx',
  uploadedAt: undefined,
};

try {
  const query2 = db.insert(uploadedFiles).values(values2).toSQL();
  console.log('Test 2: Insert with undefined id and uploadedAt');
  console.log('SQL:', query2.sql);
  console.log('Params:', query2.params);
  console.log('');
} catch (e) {
  console.error('Test 2 failed:', e.message);
}

process.exit(0);
