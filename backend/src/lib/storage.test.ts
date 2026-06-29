import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Readable } from "node:stream";
import type * as Minio from "minio";

// ---------------------------------------------------------------------------
// Mock the minio module BEFORE importing storage.js so that every
// `new Minio.Client()` call inside storage.ts returns our controllable mock.
// ---------------------------------------------------------------------------

let _currentMock: Record<string, ReturnType<typeof vi.fn>> | null = null;

vi.mock("minio", () => ({
  Client: class {
    constructor(_opts: Record<string, unknown>) {
      // Dynamically attach all mock methods onto `this` so the instance
      // behaves like a real MinIO client but is fully controllable.
      const mock = _currentMock ?? buildMockClient();
      Object.keys(mock).forEach((key) => {
        (this as Record<string, unknown>)[key] = mock[key];
      });
    }
  },
}));

// Now import — it will use the mocked minio module
import { StorageClient, getStorage, resetStorage } from "./storage.js";

// ---------------------------------------------------------------------------
// Helpers — build a mock MinIO client & readable streams
// ---------------------------------------------------------------------------

function createMockStream(chunks: (string | object)[]): Readable {
  return Readable.from(chunks.map((c) => (typeof c === "string" ? Buffer.from(c) : c)));
}

type MockMinioClient = Record<string, ReturnType<typeof vi.fn>>;

function buildMockClient(): MockMinioClient {
  return {
    bucketExists: vi.fn().mockResolvedValue(true),
    makeBucket: vi.fn().mockResolvedValue(undefined),
    putObject: vi.fn().mockResolvedValue({ etag: "d41d8cd98f00b204e9800998ecf8427e" }),
    getObject: vi.fn().mockReturnValue(createMockStream(["hello"])),
    removeObject: vi.fn().mockResolvedValue(undefined),
    removeObjects: vi.fn(() => {
      const s = new Readable({ read() {} });
      setImmediate(() => {
        s.push(null);
        s.emit("end");
      });
      return s;
    }),
    statObject: vi.fn().mockResolvedValue({
      lastModified: new Date("2025-01-01T00:00:00Z"),
      size: 128,
      etag: "abc123",
    }),
    listObjectsV2: vi.fn().mockReturnValue(
      createMockStream([
        { key: "a.txt", lastModified: new Date("2025-06-01"), size: 10, etag: "e1" },
        { key: "b.txt", lastModified: new Date("2025-06-02"), size: 20, etag: "e2" },
      ]),
    ),
    presignedGetObject: vi
      .fn()
      .mockResolvedValue("http://localhost:9000/bucket/key?X-Amz-Signature=abc"),
    presignedPutObject: vi
      .fn()
      .mockResolvedValue("http://localhost:9000/bucket/key?X-Amz-Signature=put"),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("StorageClient", () => {
  let mockClient: MockMinioClient;
  let client: StorageClient;

  beforeEach(() => {
    mockClient = buildMockClient();
    _currentMock = mockClient;
    // Inject the mock MinIO client directly for unit tests — no module-level mocking needed
    client = new StorageClient({
      client: mockClient as unknown as Minio.Client,
      bucket: "test-bucket",
    });
  });

  afterEach(() => {
    _currentMock = null;
  });

  // -- ensureBucket -------------------------------------------------------

  describe("ensureBucket", () => {
    it("creates the bucket when it does not exist", async () => {
      mockClient.bucketExists.mockResolvedValue(false);
      await client.ensureBucket();
      expect(mockClient.makeBucket).toHaveBeenCalledWith("test-bucket");
    });

    it("skips creation when the bucket already exists", async () => {
      mockClient.bucketExists.mockResolvedValue(true);
      await client.ensureBucket();
      expect(mockClient.makeBucket).not.toHaveBeenCalled();
    });

    it("is idempotent — second call is a no-op", async () => {
      mockClient.bucketExists.mockResolvedValue(true);
      await client.ensureBucket();
      await client.ensureBucket();
      expect(mockClient.bucketExists).toHaveBeenCalledTimes(1);
    });
  });

  // -- upload -------------------------------------------------------------

  describe("upload", () => {
    it("uploads a stream and returns the result", async () => {
      const data = "hello world";
      const stream = Readable.from([Buffer.from(data)]);
      const result = await client.upload("files/hello.txt", stream, data.length, "text/plain");

      expect(mockClient.putObject).toHaveBeenCalledWith(
        "test-bucket",
        "files/hello.txt",
        expect.anything(),
        data.length,
        { "Content-Type": "text/plain" },
      );
      expect(result.bucket).toBe("test-bucket");
      expect(result.key).toBe("files/hello.txt");
      expect(result.etag).toBeTruthy();
    });

    it("defaults Content-Type to empty string when omitted", async () => {
      const stream = Readable.from([Buffer.from("x")]);
      await client.upload("no-type.bin", stream, 1);
      expect(mockClient.putObject).toHaveBeenCalledWith(
        "test-bucket",
        "no-type.bin",
        expect.anything(),
        1,
        { "Content-Type": "" },
      );
    });
  });

  // -- download -----------------------------------------------------------

  describe("download", () => {
    it("returns a readable stream from the client", async () => {
      const stream = await client.download("files/hello.txt");
      expect(mockClient.getObject).toHaveBeenCalledWith("test-bucket", "files/hello.txt");
      expect(stream).toBeInstanceOf(Readable);
    });

    describe("downloadBuffer", () => {
      it("collects all chunks into a single Buffer", async () => {
        mockClient.getObject.mockReturnValue(Readable.from([Buffer.from("hel"), Buffer.from("lo")]));
        const buf = await client.downloadBuffer("files/hello.txt");
        expect(buf.toString()).toBe("hello");
      });
    });
  });

  // -- remove -------------------------------------------------------------

  describe("remove", () => {
    it("deletes a single object", async () => {
      await client.remove("files/old.txt");
      expect(mockClient.removeObject).toHaveBeenCalledWith("test-bucket", "files/old.txt");
    });
  });

  describe("removeBatch", () => {
    it("deletes multiple objects", async () => {
      const keys = ["a.txt", "b.txt", "c.txt"];
      await client.removeBatch(keys);
      expect(mockClient.removeObjects).toHaveBeenCalledWith("test-bucket", keys);
    });

    it("is a no-op for an empty array", async () => {
      await client.removeBatch([]);
      expect(mockClient.removeObjects).not.toHaveBeenCalled();
    });
  });

  // -- stat ---------------------------------------------------------------

  describe("stat", () => {
    it("returns file metadata", async () => {
      const info = await client.stat("files/hello.txt");
      expect(info.name).toBe("files/hello.txt");
      expect(info.size).toBe(128);
      expect(info.etag).toBe("abc123");
      expect(info.lastModified).toBeTruthy();
    });
  });

  // -- list ---------------------------------------------------------------

  describe("list", () => {
    it("returns objects from the bucket", async () => {
      const result = await client.list();
      expect(result.objects).toHaveLength(2);
      expect(result.objects[0].name).toBe("a.txt");
      expect(result.commonPrefixes).toEqual([]);
    });

    it("passes prefix and delimiter through", async () => {
      mockClient.listObjectsV2.mockReturnValue(
        createMockStream([
          { prefix: "images/" },
          { key: "images/cat.png", lastModified: new Date(), size: 50, etag: "e3" },
        ]),
      );

      const result = await client.list({ prefix: "images/", delimiter: "/" });
      expect(mockClient.listObjectsV2).toHaveBeenCalledWith(
        "test-bucket",
        "images/",
        true,
        "/",
      );
      expect(result.commonPrefixes).toContain("images/");
    });

    it("respects the limit option", async () => {
      mockClient.listObjectsV2.mockReturnValue(
        createMockStream([
          { key: "1.txt", lastModified: new Date(), size: 1, etag: "a" },
          { key: "2.txt", lastModified: new Date(), size: 1, etag: "b" },
          { key: "3.txt", lastModified: new Date(), size: 1, etag: "c" },
        ]),
      );

      const result = await client.list({ limit: 2 });
      expect(result.objects).toHaveLength(2);
    });
  });

  // -- presigned URLs -----------------------------------------------------

  describe("presignedUrl", () => {
    it("returns a presigned GET URL", async () => {
      const url = await client.presignedUrl("files/secret.pdf", 300);
      expect(mockClient.presignedGetObject).toHaveBeenCalledWith(
        "test-bucket",
        "files/secret.pdf",
        300,
      );
      expect(url).toContain("X-Amz-Signature");
    });

    it("uses a default expiry of 600 seconds", async () => {
      await client.presignedUrl("default-expiry.txt");
      expect(mockClient.presignedGetObject).toHaveBeenCalledWith(
        "test-bucket",
        "default-expiry.txt",
        600,
      );
    });
  });

  describe("presignedPutUrl", () => {
    it("returns a presigned PUT URL", async () => {
      const url = await client.presignedPutUrl("uploads/new-file.png");
      expect(mockClient.presignedPutObject).toHaveBeenCalledWith(
        "test-bucket",
        "uploads/new-file.png",
        600,
      );
      expect(url).toContain("X-Amz-Signature");
    });
  });

  // -- fromEnv ------------------------------------------------------------

  describe("fromEnv", () => {
    it("reads S3 env vars and constructs a client", () => {
      vi.stubEnv("S3_ENDPOINT", "http://minio.local:9000");
      vi.stubEnv("S3_ACCESS_KEY_ID", "myAccessKey");
      vi.stubEnv("S3_SECRET_ACCESS_KEY", "mySecretKey");
      vi.stubEnv("S3_BUCKET_NAME", "env-bucket");
      vi.stubEnv("S3_REGION", "eu-west-1");

      const envClient = StorageClient.fromEnv();
      expect((envClient as any).bucket).toBe("env-bucket");

      vi.unstubAllEnvs();
    });

    it("falls back to sensible defaults when env vars are missing", () => {
      vi.stubEnv("S3_ENDPOINT", undefined as unknown as string);
      vi.stubEnv("S3_ACCESS_KEY_ID", undefined as unknown as string);
      vi.stubEnv("S3_SECRET_ACCESS_KEY", undefined as unknown as string);
      vi.stubEnv("S3_BUCKET_NAME", undefined as unknown as string);

      const envClient = StorageClient.fromEnv();
      expect((envClient as any).bucket).toBe("vellum-rift-assets");

      vi.unstubAllEnvs();
    });

    it("parses port from endpoint URL", () => {
      vi.stubEnv("S3_ENDPOINT", "http://minio.local:9001");
      vi.stubEnv("S3_ACCESS_KEY_ID", "key");
      vi.stubEnv("S3_SECRET_ACCESS_KEY", "secret");
      vi.stubEnv("S3_BUCKET_NAME", "bucket");

      // If the endpoint is parsed correctly (host + port separated), the
      // constructor should succeed without throwing an InvalidEndpointError.
      expect(() => StorageClient.fromEnv()).not.toThrow();

      vi.unstubAllEnvs();
    });
  });
});

// ---------------------------------------------------------------------------
// getStorage / resetStorage singleton helpers
// ---------------------------------------------------------------------------

describe("getStorage / resetStorage", () => {
  beforeEach(() => {
    _currentMock = buildMockClient();
    vi.stubEnv("S3_ENDPOINT", "http://localhost:9000");
    vi.stubEnv("S3_ACCESS_KEY_ID", "minio");
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "minioadmin");
    vi.stubEnv("S3_BUCKET_NAME", "singleton-test");
  });

  afterEach(() => {
    resetStorage();
    _currentMock = null;
    vi.unstubAllEnvs();
  });

  it("returns the same instance on repeated calls", () => {
    const a = getStorage();
    const b = getStorage();
    expect(a).toBe(b);
  });

  it("resetStorage clears the cached singleton", () => {
    const a = getStorage();
    resetStorage();
    const b = getStorage();
    expect(a).not.toBe(b);
  });
});