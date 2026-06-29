# Storage Client (`storage.ts`)

Thin, opinionated wrapper around the [MinIO JS SDK](https://github.com/minio/minio-js) for server-side file operations. Handles bucket auto-creation and exposes only the operations developers actually need.

## Quick Start

```ts
import { getStorage } from "./lib/storage.js";

const storage = getStorage();

// Upload a file
await storage.upload("avatars/user-123.png", readableStream, fileSize, "image/png");

// Download as Buffer
const data = await storage.downloadBuffer("avatars/user-123.png");

// List objects with a prefix
const { objects } = await storage.list({ prefix: "avatars/" });

// Delete
await storage.remove("avatars/old-file.png");
```

## Configuration

The client reads from environment variables (already defined in `.env.example`):

| Variable | Description | Default |
|---|---|---|
| `S3_ENDPOINT` | MinIO/S3 host URL | `http://localhost:9000` |
| `S3_REGION` | AWS region | `us-east-1` |
| `S3_BUCKET_NAME` | Target bucket name | `vellum-rift-assets` |
| `S3_ACCESS_KEY_ID` | Access key | `minio` |
| `S3_SECRET_ACCESS_KEY` | Secret key | `minioadmin` |

The endpoint URL is parsed automatically — both `http://localhost:9000` and `https://play.min.io` work. IPv6 addresses in brackets (e.g. `[::1]:9000`) are also supported.

### Custom Configuration

For scenarios where you need a different bucket or endpoint at runtime:

```ts
import { StorageClient } from "./lib/storage.js";

const client = new StorageClient({
  endpoint: "minio.internal",
  port: 9000,
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY!,
  secretKey: process.env.MINIO_SECRET_KEY!,
  bucket: "custom-bucket",
});
```

## API Reference

### `getStorage(): StorageClient`

Returns a singleton `StorageClient` configured from environment variables. Repeated calls return the same instance.

### `resetStorage(): void`

Clears the cached singleton. Primarily useful in tests to isolate test cases.

---

### `StorageClient` Methods

#### `upload(key, stream, size, contentType?) → Promise<UploadResult>`

Upload a readable stream to the given key path.

| Param | Type | Description |
|---|---|---|
| `key` | `string` | Object key, e.g. `"uploads/avatar-123.png"` |
| `stream` | `Readable` | Node.js readable stream containing file bytes |
| `size` | `number` | Byte length of the stream (required by MinIO) |
| `contentType` | `string?` | MIME type; defaults to `""` |

**Returns:** `{ bucket, key, etag }`

```ts
import { Readable } from "node:stream";

const fileBuffer = Buffer.from("file contents");
const stream = Readable.from([fileBuffer]);

await storage.upload(
  "documents/report.pdf",
  stream,
  fileBuffer.length,
  "application/pdf",
);
```

---

#### `download(key) → Promise<Readable>`

Download an object as a readable stream. Throws if the object does not exist.

```ts
const stream = await storage.download("documents/report.pdf");
stream.pipe(response); // e.g. pipe to an HTTP response
```

---

#### `downloadBuffer(key) → Promise<Buffer>`

Convenience wrapper around `download()` that collects all chunks into a single `Buffer`.

```ts
const data = await storage.downloadBuffer("documents/report.pdf");
console.log(data.length); // byte size
```

---

#### `remove(key) → Promise<void>`

Delete a single object.

```ts
await storage.remove("documents/old-report.pdf");
```

---

#### `removeBatch(keys) → Promise<void>`

Delete multiple objects in one call. No-op if the array is empty. Throws on the first error encountered.

```ts
await storage.removeBatch([
  "temp/upload-1.tmp",
  "temp/upload-2.tmp",
  "temp/upload-3.tmp",
]);
```

---

#### `stat(key) → Promise<FileStat>`

Get metadata for a single object. Throws if not found.

**Returns:**

```ts
interface FileStat {
  name: string;       // the object key
  lastModified: string; // ISO 8601 date string
  size: number;       // size in bytes
  etag: string;
}
```

```ts
const info = await storage.stat("documents/report.pdf");
console.log(`${info.name} — ${info.size} bytes`);
```

---

#### `list(options?) → Promise<ListResult>`

List objects with optional prefix and delimiter filtering.

| Option | Type | Description |
|---|---|---|
| `prefix` | `string?` | Filter to keys starting with this prefix, e.g. `"images/"` |
| `delimiter` | `string?` | Group results like a directory listing (e.g. `"/"`) |
| `limit` | `number?` | Maximum number of object keys returned |

**Returns:**

```ts
interface ListResult {
  objects: FileStat[];
  commonPrefixes: string[]; // sub-"folders" when delimiter is used
}
```

```ts
// List all files in the "images/" prefix
const result = await storage.list({ prefix: "images/", delimiter: "/" });

console.log(result.commonPrefixes); // ["images/cats/", "images/dogs/"]
console.log(result.objects);        // files directly under "images/"
```

---

#### `presignedUrl(key, expiresIn?) → Promise<string>`

Generate a presigned GET URL for direct client downloads. Defaults to 600 seconds (10 minutes).

```ts
const url = await storage.presignedUrl("documents/report.pdf", 3600); // 1 hour
// Return `url` to the client — they can download directly from MinIO
```

---

#### `presignedPutUrl(key, expiresIn?) → Promise<string>`

Generate a presigned PUT URL for direct client uploads. Defaults to 600 seconds.

```ts
const url = await storage.presignedPutUrl("uploads/user-file.png", 900);
// Return `url` + the target key to the client so they can POST directly
```

---

#### `ensureBucket() → Promise<void>`

Ensure the target bucket exists (idempotent). Called automatically before every operation, but can be invoked explicitly if needed.

---

#### `StorageClient.fromEnv(): StorageClient`

Static factory that creates a new client from environment variables. Unlike `getStorage()`, this does **not** use a singleton — each call creates a fresh instance.

```ts
const client = StorageClient.fromEnv();
```

## Testing

The constructor accepts an existing MinIO client for easy mocking:

```ts
import { StorageClient } from "./lib/storage.js";

const mockMinioClient = {
  bucketExists: vi.fn().mockResolvedValue(true),
  putObject: vi.fn().mockResolvedValue({ etag: "abc123" }),
  // ... other methods
};

const client = new StorageClient({
  client: mockMinioClient as any,
  bucket: "test-bucket",
});
```

## Types

All exported types are available for import:

```ts
import type {
  StorageConfig,
  UploadResult,
  FileStat,
  ListOptions,
  ListResult,
} from "./lib/storage.js";
```
