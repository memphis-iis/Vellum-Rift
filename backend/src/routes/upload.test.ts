import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { computeExtent, detectFileType, MAX_UPLOAD_PIXELS } from "./upload.js";

const mocks = vi.hoisted(() => ({
  img2Array: vi.fn(),
  pdf2Array: vi.fn(),
  generate: vi.fn(),
  exportToBuffer: vi.fn(),
  upload: vi.fn(),
  presignedUrl: vi.fn(),
  create: vi.fn(),
}));

vi.mock("../scripts/imageTo3DArray.js", () => ({
  ImageTo3DArray: class {
    img2Array = mocks.img2Array;
    pdf2Array = mocks.pdf2Array;
  },
}));

vi.mock("../scripts/imageArrayToOBJ.js", () => ({
  TopographyMeshGenerator: class {
    generate = mocks.generate;
  },
  GLTFExporter: class {
    exportToBuffer = mocks.exportToBuffer;
  },
}));

vi.mock("../lib/storage.js", () => ({
  getStorage: () => ({
    upload: mocks.upload,
    presignedUrl: mocks.presignedUrl,
  }),
}));

vi.mock("../lib/gltfModelRepository.js", () => ({
  GlTFModelRepository: class {
    create = mocks.create;
  },
}));

// Real magic bytes (content-based validation ignores the Content-Type header)
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const PDF_BYTES = Buffer.from("%PDF-1.7\n% fake minimal pdf\n1 0 obj\n<<>>\nendobj\n%%EOF\n");

// [x, y, RGBA] pixel tuple helper
const px = (x: number, y: number): [number, number, [number, number, number, number]] => [x, y, [255, 255, 255, 255]];

const app = express();
app.use(express.json());
app.use("/api/upload", (await import("./upload.js")).default);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.img2Array.mockResolvedValue([px(0, 0), px(1, 0), px(1, 1)]);
  mocks.pdf2Array.mockResolvedValue([px(0, 0), px(2, 3)]);
  mocks.generate.mockReturnValue({ vertices: [{ x: 0, y: 0, z: 0 }] });
  mocks.exportToBuffer.mockResolvedValue(Buffer.from("glb-bytes"));
  mocks.upload.mockResolvedValue(undefined);
  mocks.presignedUrl.mockResolvedValue("https://minio/models/test.glb");
  mocks.create.mockResolvedValue({
    modelId: "m1",
    storageKey: "models/m1.glb",
    width: 2,
    height: 2,
    vertexCount: 1,
  });
});

// ---------------------------------------------------------------
// detectFileType (magic bytes)
// ---------------------------------------------------------------

describe("detectFileType", () => {
  it("recognizes PDF and the supported image signatures", () => {
    expect(detectFileType(PDF_BYTES)).toBe("application/pdf");
    expect(detectFileType(PNG_BYTES)).toBe("image/png");
    expect(detectFileType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]))).toBe("image/jpeg");
    expect(detectFileType(Buffer.from("RIFF\x00\x00\x00\x00WEBP"))).toBe("image/webp");
    expect(detectFileType(Buffer.from("BM\x00\x00\x00\x00\x00\x00"))).toBe("image/bmp");
    expect(detectFileType(Buffer.from([0x49, 0x49, 0x2a, 0x00, 0, 0, 0, 0]))).toBe("image/tiff");
  });

  it("rejects unknown content", () => {
    expect(detectFileType(Buffer.from("plain text, definitely not an image"))).toBeNull();
    expect(detectFileType(Buffer.from("abc"))).toBeNull();
    expect(detectFileType(Buffer.alloc(0))).toBeNull();
  });
});

// ---------------------------------------------------------------
// computeExtent (single-pass max, no spread)
// ---------------------------------------------------------------

describe("computeExtent", () => {
  it("computes width/height from max coordinates", () => {
    expect(computeExtent([px(0, 0), px(1, 0), px(1, 1)])).toEqual({ width: 2, height: 2 });
    expect(computeExtent([px(0, 0), px(2, 3)])).toEqual({ width: 3, height: 4 });
  });

  it("returns null for an empty list", () => {
    expect(computeExtent([])).toBeNull();
  });

  it("handles large lists without spreading", () => {
    const big: ReturnType<typeof px>[] = [];
    for (let i = 0; i < 200_000; i++) big.push(px(i % 1000, Math.floor(i / 1000)));
    expect(computeExtent(big)).toEqual({ width: 1000, height: 200 });
  });
});

// ---------------------------------------------------------------
// POST /api/upload route
// ---------------------------------------------------------------

describe("POST /api/upload", () => {
  it("rejects a request with no file", async () => {
    const res = await request(app).post("/api/upload");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("file is required");
  });

  it("rejects spoofed content — real bytes are text despite a PNG Content-Type", async () => {
    const res = await request(app)
      .post("/api/upload")
      .field("heightMode", "brightness")
      .attach("file", Buffer.from("definitely not a png"), {
        filename: "fake.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Unsupported file type");
    expect(mocks.img2Array).not.toHaveBeenCalled();
  });

  it("accepts a real-signature image and returns model metadata", async () => {
    mocks.img2Array.mockResolvedValue([px(0, 0), px(9, 7)]);

    const res = await request(app)
      .post("/api/upload")
      .field("heightMode", "brightness")
      .attach("file", PNG_BYTES, { filename: "page.png", contentType: "image/png" });

    expect(res.status).toBe(201);
    // the computed extent (10x8 from pixels) flows into the DB record...
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ width: 10, height: 8 }));
    // ...and the response reflects the stored record (mocked as 2x2)
    expect(res.body).toMatchObject({ modelId: "m1", width: 2, height: 2, downloadUrl: "https://minio/models/test.glb" });
  });

  it("accepts a real-signature PDF and routes to the PDF pipeline", async () => {
    const res = await request(app)
      .post("/api/upload")
      .field("page", "2")
      .attach("file", PDF_BYTES, { filename: "manuscript.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(201);
    expect(mocks.pdf2Array).toHaveBeenCalledWith(expect.stringMatching(/\.pdf$/), 2);
    expect(mocks.img2Array).not.toHaveBeenCalled();
  });

  it("rejects invalid height modes", async () => {
    const res = await request(app)
      .post("/api/upload")
      .field("heightMode", "banana")
      .attach("file", PNG_BYTES, { filename: "test.png", contentType: "image/png" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("heightMode must be one of");
  });

  it("rejects a non-integer page number", async () => {
    const res = await request(app)
      .post("/api/upload")
      .field("page", "abc")
      .attach("file", PDF_BYTES, { filename: "m.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("page must be a positive integer");
  });

  it("returns 400 when no pixels can be extracted", async () => {
    mocks.img2Array.mockResolvedValue([]);

    const res = await request(app)
      .post("/api/upload")
      .attach("file", PNG_BYTES, { filename: "blank.png", contentType: "image/png" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("No pixels could be extracted");
  });

  it("returns 413 when the decoded image exceeds the pixel cap", async () => {
    const sparse: unknown = [];
    (sparse as { length: number }).length = MAX_UPLOAD_PIXELS + 1;
    mocks.img2Array.mockResolvedValue(sparse as never);

    const res = await request(app)
      .post("/api/upload")
      .attach("file", PNG_BYTES, { filename: "huge.png", contentType: "image/png" });

    expect(res.status).toBe(413);
    expect(res.body.error).toContain("pixel limit");
  });

  it("returns 500 with a generic message when conversion fails (no internals leaked)", async () => {
    mocks.img2Array.mockRejectedValue(new Error("image conversion failed: /tmp/vellum-upload-1234/secret.png"));

    const res = await request(app)
      .post("/api/upload")
      .attach("file", PNG_BYTES, { filename: "broken.png", contentType: "image/png" });

    expect(res.status).toBe(500);
    expect(res.body.error).toContain("Failed to upload and convert file");
    expect(res.body.error).not.toContain("secret.png");
    expect(res.body.error).not.toContain("image conversion failed");
  });
});
