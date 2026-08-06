import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

import uploadRouter from "./upload.js";

const app = express();
app.use("/api/upload", uploadRouter);

const mockPixels = [
  [0, 0, [0, 0, 0, 255]],
  [1, 0, [128, 0, 0, 255]],
  [0, 1, [128, 0, 0, 255]],
  [1, 1, [255, 0, 0, 255]],
];

const mockMesh = {
  vertices: [
    [0, 0, 0],
    [1, 0, 0.5],
    [0, 1, 0.5],
    [1, 1, 1],
  ],
  faces: [0, 2, 1, 1, 2, 3],
  colors: mockPixels.map(([, , rgba]) => rgba),
};

describe("POST /api/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.img2Array.mockResolvedValue(mockPixels);
    mocks.pdf2Array.mockResolvedValue(mockPixels);
    mocks.generate.mockReturnValue(mockMesh);
    mocks.exportToBuffer.mockResolvedValue(Buffer.from("fake-glb"));
    mocks.upload.mockResolvedValue(undefined);
    mocks.presignedUrl.mockResolvedValue("http://minio.local/models/test.glb");
    mocks.create.mockResolvedValue({
      modelId: "model-123",
      sessionId: null,
      label: "test.png",
      storageKey: "models/test.glb",
      heightMode: "brightness",
      width: 2,
      height: 2,
      vertexCount: 4,
      fileSize: 8,
      createdAt: "2026-08-05T00:00:00.000Z",
    });
  });

  it("rejects requests with no uploaded file", async () => {
    const res = await request(app).post("/api/upload");

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("file is required");
  });

  it("rejects unsupported file types", async () => {
    const res = await request(app)
      .post("/api/upload")
      .attach("file", Buffer.from("hello"), {
        filename: "notes.txt",
        contentType: "text/plain",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Unsupported file type");
  });

  it("uploads an image, creates a GLB, stores it, records metadata, and returns model info", async () => {
    const res = await request(app)
      .post("/api/upload")
      .field("heightMode", "brightness")
      .field("label", "Test Manuscript")
      .attach("file", Buffer.from("fake-png"), {
        filename: "test.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(201);

    expect(mocks.img2Array).toHaveBeenCalled();
    expect(mocks.generate).toHaveBeenCalledWith(mockPixels, "brightness");
    expect(mocks.exportToBuffer).toHaveBeenCalledWith(mockMesh);
    expect(mocks.upload).toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Test Manuscript",
        heightMode: "brightness",
        width: 2,
        height: 2,
        vertexCount: 4,
      }),
    );

    expect(res.body).toEqual({
      modelId: "model-123",
      storageKey: "models/test.glb",
      width: 2,
      height: 2,
      vertexCount: 4,
      downloadUrl: "http://minio.local/models/test.glb",
    });
  });

  it("uses pdf2Array when the uploaded file is a PDF", async () => {
    const res = await request(app)
      .post("/api/upload")
      .field("page", "1")
      .attach("file", Buffer.from("fake-pdf"), {
        filename: "manuscript.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(201);
    expect(mocks.pdf2Array).toHaveBeenCalled();
    expect(mocks.img2Array).not.toHaveBeenCalled();
  });

  it("rejects invalid height modes", async () => {
    const res = await request(app)
      .post("/api/upload")
      .field("heightMode", "banana")
      .attach("file", Buffer.from("fake-png"), {
        filename: "test.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("heightMode must be one of");
  });

  it("returns 500 when conversion fails", async () => {
    mocks.img2Array.mockRejectedValue(new Error("image conversion failed"));

    const res = await request(app)
      .post("/api/upload")
      .attach("file", Buffer.from("fake-png"), {
        filename: "broken.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(500);
    expect(res.body.error).toContain("Failed to upload and convert file");
    expect(res.body.error).toContain("image conversion failed");
  });
});