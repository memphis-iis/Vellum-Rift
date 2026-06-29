import * as Minio from "minio";
import type { Readable } from "node:stream";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StorageConfig {
  endpoint: string;
  port?: number;
  useSSL?: boolean;
  accessKey: string;
  secretKey: string;
  region?: string;
  bucket: string;
}

export interface UploadResult {
  bucket: string;
  key: string;
  etag?: string;
  versionId?: string;
}

export interface FileStat {
  name: string;
  lastModified: string;
  size: number;
  etag: string;
}

export interface ListOptions {
  /** Prefix to filter objects (e.g. "images/") */
  prefix?: string;
  /** Return results that "look like" a directory listing by grouping on a delimiter */
  delimiter?: string;
  /** Maximum number of keys returned */
  limit?: number;
}

export interface ListResult {
  objects: FileStat[];
  /** Common prefixes when a delimiter is used (sub-"folders") */
  commonPrefixes: string[];
}

// ---------------------------------------------------------------------------
// StorageClient
// ---------------------------------------------------------------------------

/**
 * Thin, opinionated wrapper around the MinIO JS SDK.
 *
 * Handles bucket auto-creation on first use and exposes only the file
 * operations developers actually need: upload, download, delete, stat, list.
 */
export class StorageClient {
  private client: Minio.Client;
  protected bucket: string;
  private _bucketReady = false;

  /**
   * Construct a `StorageClient` either from raw config or by passing an
   * already-built MinIO client (useful for testing).
   */
  constructor(configOrClient: StorageConfig | { client: Minio.Client; bucket: string }) {
    if ("client" in configOrClient) {
      this.client = configOrClient.client;
      this.bucket = configOrClient.bucket;
    } else {
      const config = configOrClient;
      this.bucket = config.bucket;
      this.client = new Minio.Client({
        endPoint: config.endpoint,
        port: config.port ?? 9000,
        useSSL: config.useSSL ?? false,
        accessKey: config.accessKey,
        secretKey: config.secretKey,
        region: config.region,
      });
    }
  }

  // -- lifecycle ----------------------------------------------------------

  /** Ensure the target bucket exists (idempotent). */
  async ensureBucket(): Promise<void> {
    if (this._bucketReady) return;
    const exists = await this.client.bucketExists(this.bucket);
    if (!exists) {
      await this.client.makeBucket(this.bucket);
    }
    this._bucketReady = true;
  }

  // -- upload -------------------------------------------------------------

  /**
   * Upload a `Readable` stream (or any Node.js-compatible stream) to the
   * given key path inside the bucket.
   *
   * @param key  Object key, e.g. `"uploads/avatar-123.png"`
   * @param stream  Readable stream containing the file bytes
   * @param size  Byte length of the stream (required by MinIO)
   * @param contentType  MIME type, auto-detected when omitted
   */
  async upload(
    key: string,
    stream: Readable,
    size: number,
    contentType?: string,
  ): Promise<UploadResult> {
    await this.ensureBucket();
    const result = await this.client.putObject(this.bucket, key, stream, size, {
      "Content-Type": contentType ?? "",
    });
    return { bucket: this.bucket, key, etag: result.etag };
  }

  // -- download -----------------------------------------------------------

  /**
   * Download an object and return it as a `Readable` stream.
   * Throws if the object does not exist.
   */
  async download(key: string): Promise<Readable> {
    await this.ensureBucket();
    return this.client.getObject(this.bucket, key);
  }

  /**
   * Download an object and return its raw bytes as a `Buffer`.
   * Convenience wrapper around {@link download}.
   */
  async downloadBuffer(key: string): Promise<Buffer> {
    const stream = await this.download(key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  // -- delete -------------------------------------------------------------

  /** Delete a single object. Returns `true` even if the key didn't exist. */
  async remove(key: string): Promise<void> {
    await this.ensureBucket();
    await this.client.removeObject(this.bucket, key);
  }

  /** Delete multiple objects in one call. */
  async removeBatch(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.ensureBucket();
    const errors = await this.client.removeObjects(this.bucket, keys);
    // Re-throw the first error encountered, if any
    const firstError = await new Promise<Error | null>((resolve) => {
      (errors as unknown as Readable).on("error", resolve as () => void);
      (errors as unknown as Readable).on("end", () => resolve(null));
    });
    if (firstError) {
      throw firstError;
    }
  }

  // -- stat ---------------------------------------------------------------

  /** Get metadata for a single object. Throws if not found. */
  async stat(key: string): Promise<FileStat> {
    await this.ensureBucket();
    const stat = await this.client.statObject(this.bucket, key);
    return {
      name: key,
      lastModified: stat.lastModified.toISOString(),
      size: stat.size,
      etag: stat.etag,
    };
  }

  // -- list ---------------------------------------------------------------

  /**
   * List objects in the bucket with optional prefix / delimiter filtering.
   */
  async list(options?: ListOptions): Promise<ListResult> {
    await this.ensureBucket();
    const prefix = options?.prefix ?? "";
    const delimiter = options?.delimiter;
    const limit = options?.limit;

    const stream = this.client.listObjectsV2(
      this.bucket,
      prefix,
      delimiter ? true : false,
      delimiter,
    );

    const objects: FileStat[] = [];
    const commonPrefixes: string[] = [];
    let count = 0;

    for await (const entry of stream) {
      if (limit !== undefined && count >= limit) break;

      // MinIO streams emit `{ isTruncated, key, name, ... }` for objects
      // and `{ isTruncated, prefix }` for common prefixes.
      const entryAny = entry as Record<string, unknown>;
      if ("prefix" in entryAny && entryAny.prefix) {
        commonPrefixes.push(entryAny.prefix as string);
      } else if ("key" in entryAny) {
        objects.push({
          name: entryAny.key as string,
          lastModified: entryAny.lastModified
            ? new Date(entryAny.lastModified as string | number | Date).toISOString()
            : "",
          size: (entryAny.size as number) ?? 0,
          etag: (entryAny.etag as string) ?? "",
        });
        count++;
      }
    }

    return { objects, commonPrefixes };
  }

  // -- presigned URLs -----------------------------------------------------

  /**
   * Generate a presigned GET URL that expires after `expiresIn` seconds.
   * Useful for letting clients download directly from MinIO.
   */
  async presignedUrl(key: string, expiresIn = 600): Promise<string> {
    await this.ensureBucket();
    return this.client.presignedGetObject(this.bucket, key, expiresIn);
  }

  /**
   * Generate a presigned PUT URL that expires after `expiresIn` seconds.
   * Useful for letting clients upload directly to MinIO.
   */
  async presignedPutUrl(key: string, expiresIn = 600): Promise<string> {
    await this.ensureBucket();
    return this.client.presignedPutObject(this.bucket, key, expiresIn);
  }

  // -- factory ------------------------------------------------------------

  /**
   * Create a `StorageClient` from environment variables.
   *
   * Expected env vars (already in `.env.example`):
   *   S3_ENDPOINT, S3_REGION, S3_BUCKET_NAME,
   *   S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
   */
  static fromEnv(): StorageClient {
    const endpoint = process.env.S3_ENDPOINT ?? "http://localhost:9000";
    const useSSL = endpoint.startsWith("https");

    // Parse the URL to cleanly separate host and port for the minio SDK.
    // The SDK rejects endpoints like "host:port" in the endPoint field.
    let host = endpoint.replace(/^https?:\/\//, "");
    let port: number;

    // Handle IPv6 brackets e.g. [::1]:9000
    const ipv6Match = host.match(/^\[([^\]]+)\](:\d+)?$/);
    if (ipv6Match) {
      host = ipv6Match[1];
      port = ipv6Match[2] ? parseInt(ipv6Match[2].slice(1), 10) : useSSL ? 443 : 9000;
    } else {
      const lastColon = host.lastIndexOf(":");
      if (lastColon !== -1) {
        const maybePort = host.slice(lastColon + 1);
        if (/^\d+$/.test(maybePort)) {
          port = parseInt(maybePort, 10);
          host = host.slice(0, lastColon);
        } else {
          port = useSSL ? 443 : 9000;
        }
      } else {
        port = useSSL ? 443 : 9000;
      }
    }

    return new StorageClient({
      endpoint: host,
      port,
      useSSL,
      accessKey: process.env.S3_ACCESS_KEY_ID ?? "minio",
      secretKey: process.env.S3_SECRET_ACCESS_KEY ?? "minioadmin",
      region: process.env.S3_REGION ?? "us-east-1",
      bucket: process.env.S3_BUCKET_NAME ?? "vellum-rift-assets",
    });
  }
}

// Default singleton backed by env vars — what most callers will use.
let _defaultClient: StorageClient | null = null;

export function getStorage(): StorageClient {
  if (!_defaultClient) {
    _defaultClient = StorageClient.fromEnv();
  }
  return _defaultClient;
}

/** Reset the singleton (mainly useful in tests). */
export function resetStorage(): void {
  _defaultClient = null;
}
