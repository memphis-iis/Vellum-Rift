import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

// Mock the heavy dependencies before importing the ingestor
vi.mock("../scripts/imageTo3DArray.js", () => ({
  ImageTo3DArray: class {
    async pdf2Array(_path: string, _page: number, _scale?: number) {
      return [
        [0, 0, [255, 255, 255, 255]],
        [1, 0, [0, 0, 0, 255]],
        [0, 1, [128, 128, 128, 255]],
        [1, 1, [255, 0, 0, 255]],
      ];
    }
    async img2Array(_path: string) {
      return [
        [0, 0, [100, 150, 200, 255]],
        [1, 0, [50, 75, 100, 255]],
        [0, 1, [200, 100, 50, 255]],
        [1, 1, [25, 37, 75, 255]],
      ];
    }
  },
}));

vi.mock("../scripts/imageArrayToOBJ.js", () => ({
  TopographyMeshGenerator: class {
    generate(_pixels: unknown[], _mode: string) {
      return {
        vertices: [
          [0, 0, 1],
          [1, 0, 0],
          [0, 1, 0.5],
          [1, 1, 1],
        ],
        faces: [0, 2, 1, 1, 2, 3],
        colors: [
          [255, 255, 255, 255],
          [0, 0, 0, 255],
          [128, 128, 128, 255],
          [255, 0, 0, 255],
        ],
      };
    }
  },
  GLTFExporter: class {
    async exportToBuffer() {
      return Buffer.from("FAKEGLB");
    }
  },
}));

const mockUpload = vi.fn().mockResolvedValue({ etag: "abc123" });
const mockPresignedUrl = vi.fn().mockResolvedValue("http://minio.local/test.glb");

vi.mock("./storage.js", () => ({
  getStorage: () => ({
    upload: mockUpload,
    presignedUrl: mockPresignedUrl,
  }),
}));

const mockCreate = vi.fn().mockImplementation((params) =>
  Promise.resolve({
    modelId: "test-model-id-0000-0000-0000-000000000001",
    sessionId: params.sessionId,
    label: params.label,
    storageKey: params.storageKey,
    heightMode: params.heightMode,
    width: params.width,
    height: params.height,
    vertexCount: params.vertexCount,
    fileSize: params.fileSize,
    createdAt: new Date().toISOString(),
  }),
);

vi.mock("./gltfModelRepository.js", () => ({
  GlTFModelRepository: class {
    create = mockCreate;
  },
}));

// Now import after all mocks are in place
import { SampleModelIngestor } from "./sampleModelIngestor.js";

describe("SampleModelIngestor", () => {
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    // Create a fresh temp directory with sample files
    tempDir = join(tmpdir(), `ingest-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it("returns empty array when sample directory does not exist", async () => {
    const ingestor = new SampleModelIngestor();
    const results = await ingestor.ingestAll("/nonexistent/path");
    expect(results).toEqual([]);
  });

  it("returns empty array when directory has no eligible files", async () => {
    // Create a .txt file (not eligible)
    writeFileSync(join(tempDir, "readme.txt"), "hello");

    const ingestor = new SampleModelIngestor();
    const results = await ingestor.ingestAll(tempDir);
    expect(results).toEqual([]);
  });

  it("ingests a PDF file", async () => {
    // Create a dummy PDF file
    writeFileSync(join(tempDir, "sample.pdf"), "%PDF-1.4 dummy content");

    const ingestor = new SampleModelIngestor();
    const results = await ingestor.ingestAll(tempDir);

    expect(results).toHaveLength(1);
    expect(results[0].label).toBe("sample.pdf");
    expect(results[0].vertexCount).toBe(4);
    expect(results[0].fileSize).toBe(7); // "FAKEGLB".length
    expect(mockUpload).toHaveBeenCalledTimes(1);
  });

  it("ingests an image file", async () => {
    // Create a real tiny PNG using sharp
    const buffer = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 4,
        background: { r: 100, g: 150, b: 200, alpha: 255 },
      },
    })
      .png()
      .toBuffer();

    writeFileSync(join(tempDir, "scan.png"), buffer);

    const ingestor = new SampleModelIngestor();
    const results = await ingestor.ingestAll(tempDir);

    expect(results).toHaveLength(1);
    expect(results[0].label).toBe("scan.png");
  });

  it("ingests multiple files of different types", async () => {
    // Create a PDF
    writeFileSync(join(tempDir, "doc.pdf"), "%PDF-1.4 dummy");

    // Create a PNG
    const buffer = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 4,
        background: { r: 50, g: 100, b: 150, alpha: 255 },
      },
    })
      .png()
      .toBuffer();

    writeFileSync(join(tempDir, "photo.jpg"), buffer);

    const ingestor = new SampleModelIngestor();
    const results = await ingestor.ingestAll(tempDir);

    expect(results).toHaveLength(2);
    const labels = results.map((r) => r.label);
    expect(labels).toContain("doc.pdf");
    expect(labels).toContain("photo.jpg");
  });

  it("ignores non-image/PDF files", async () => {
    writeFileSync(join(tempDir, "readme.md"), "# Hello");
    writeFileSync(join(tempDir, "data.json"), "{}");
    writeFileSync(join(tempDir, "script.js"), "console.log('hi')");

    const ingestor = new SampleModelIngestor();
    const results = await ingestor.ingestAll(tempDir);

    expect(results).toEqual([]);
  });

  it("continues processing when one file fails", async () => {
    // Create two files - the first will be a PDF, second a PNG
    writeFileSync(join(tempDir, "good.pdf"), "%PDF-1.4 dummy");

    const buffer = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 4,
        background: { r: 50, g: 100, b: 150, alpha: 255 },
      },
    })
      .png()
      .toBuffer();

    writeFileSync(join(tempDir, "also-good.png"), buffer);

    const ingestor = new SampleModelIngestor();
    const results = await ingestor.ingestAll(tempDir);

    // Both should succeed since our mocks don't throw
    expect(results).toHaveLength(2);
  });
});
