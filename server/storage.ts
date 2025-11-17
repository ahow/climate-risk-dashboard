// Preconfigured storage helpers for Manus WebDev templates
// Supports both Manus storage proxy and direct AWS S3 access

import { ENV } from './_core/env';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

type ManusStorageConfig = { type: 'manus'; baseUrl: string; apiKey: string };
type AwsStorageConfig = { type: 'aws'; client: S3Client; bucket: string; region: string };
type StorageConfig = ManusStorageConfig | AwsStorageConfig;

function getStorageConfig(): StorageConfig {
  const baseUrl = ENV.forgeApiUrl;
  const apiKey = ENV.forgeApiKey;

  // Try Manus storage first
  if (baseUrl && apiKey) {
    return { type: 'manus', baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
  }

  // Fallback to AWS S3
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const bucket = process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_REGION || 'us-east-1';

  if (accessKeyId && secretAccessKey && bucket) {
    return {
      type: 'aws',
      client: new S3Client({ region, credentials: { accessKeyId, secretAccessKey } }),
      bucket,
      region
    };
  }

  throw new Error(
    "Storage credentials missing: set either (BUILT_IN_FORGE_API_URL + BUILT_IN_FORGE_API_KEY) or (AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY + AWS_S3_BUCKET)"
  );
}

// Manus storage functions
function buildUploadUrl(baseUrl: string, relKey: string): URL {
  const url = new URL("v1/storage/upload", ensureTrailingSlash(baseUrl));
  url.searchParams.set("path", normalizeKey(relKey));
  return url;
}

async function buildDownloadUrl(
  baseUrl: string,
  relKey: string,
  apiKey: string
): Promise<string> {
  const downloadApiUrl = new URL(
    "v1/storage/downloadUrl",
    ensureTrailingSlash(baseUrl)
  );
  downloadApiUrl.searchParams.set("path", normalizeKey(relKey));
  const response = await fetch(downloadApiUrl, {
    method: "GET",
    headers: buildAuthHeaders(apiKey),
  });
  return (await response.json()).url;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function toFormData(
  data: Buffer | Uint8Array | string,
  contentType: string,
  fileName: string
): FormData {
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as any], { type: contentType });
  const form = new FormData();
  form.append("file", blob, fileName || "file");
  return form;
}

function buildAuthHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey}` };
}

// AWS S3 functions
async function s3Put(
  config: AwsStorageConfig,
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType: string
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const buffer = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data);
  
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    // Note: Public access is controlled by bucket policy, not ACL
  });

  await config.client.send(command);
  
  // Generate public URL
  const url = `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`;
  
  return { key, url };
}

// Public API
export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const config = getStorageConfig();
  
  if (config.type === 'aws') {
    return s3Put(config, relKey, data, contentType);
  }
  
  // Manus storage
  const key = normalizeKey(relKey);
  const uploadUrl = buildUploadUrl(config.baseUrl, key);
  const formData = toFormData(data, contentType, key.split("/").pop() ?? key);
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: buildAuthHeaders(config.apiKey),
    body: formData,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(
      `Storage upload failed (${response.status} ${response.statusText}): ${message}`
    );
  }
  const url = (await response.json()).url;
  return { key, url };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string; }> {
  const config = getStorageConfig();
  const key = normalizeKey(relKey);
  
  if (config.type === 'aws') {
    // For AWS, generate public URL directly
    const url = `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`;
    return { key, url };
  }
  
  // Manus storage
  return {
    key,
    url: await buildDownloadUrl(config.baseUrl, key, config.apiKey),
  };
}

