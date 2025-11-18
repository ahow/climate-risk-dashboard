#!/usr/bin/env node
/**
 * Post-build script to add .js extensions to relative imports in compiled JavaScript
 * Required for Node.js ES modules to work correctly
 */
import { readdir, readFile, writeFile } from 'fs/promises';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const distDir = join(__dirname, '../dist');

async function* walkFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(path);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      yield path;
    }
  }
}

async function fixImports(filePath) {
  let content = await readFile(filePath, 'utf-8');
  let modified = false;

  // Fix @shared path alias to relative path
  // Calculate relative path from current file to shared directory
  const fileDir = dirname(filePath);
  const sharedDir = join(distDir, 'shared');
  const relativePath = relative(fileDir, sharedDir).replace(/\\/g, '/');
  const prefix = relativePath.startsWith('.') ? relativePath : './' + relativePath;
  
  content = content.replace(
    /from\s+(['"])@shared\/([^'"]+)\1/g,
    (match, quote, modulePath) => {
      modified = true;
      return `from ${quote}${prefix}/${modulePath}.js${quote}`;
    }
  );

  // Fix: import ... from "./module" -> import ... from "./module.js"
  // Fix: import ... from "../module" -> import ... from "../module.js"
  content = content.replace(
    /from\s+(['"])(\.[^'"]+)(?<!\.js)\1/g,
    (match, quote, path) => {
      modified = true;
      return `from ${quote}${path}.js${quote}`;
    }
  );

  // Fix: import("./module") -> import("./module.js")
  content = content.replace(
    /import\s*\(\s*(['"])(\.[^'"]+)(?<!\.js)\1\s*\)/g,
    (match, quote, path) => {
      modified = true;
      return `import(${quote}${path}.js${quote})`;
    }
  );

  if (modified) {
    await writeFile(filePath, content, 'utf-8');
    console.log(`✓ Fixed imports in ${filePath}`);
  }
}

async function main() {
  console.log('🔧 Fixing ES module imports in dist/...');
  let count = 0;
  
  for await (const file of walkFiles(distDir)) {
    await fixImports(file);
    count++;
  }
  
  console.log(`✅ Processed ${count} files`);
}

main().catch(console.error);

