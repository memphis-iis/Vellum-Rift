import { Router, type Request, type Response } from "express"; //allows for route creation
import multer from "multer"; //receives uploaded files
import { mkdtemp, rm, writeFile } from "node:fs/promises"; //make/delete a temporary file
import { tmpdir } from "node:os"; //helps create safe file paths
import { extname, join } from "node:path"; //helps create safe file paths
import { Readable } from "node:stream"; //turns a buffer into a stream for MiniIO
import crypto from "node:crypto"; //makes unique file names

import { ImageTo3DArray, type PixelDataTuple } from "../scripts/imageTo3DArray.js"; //converts PDF/image into pixels
import {
  GLTFExporter, //turns mesh into glb
  TopographyMeshGenerator,
  type HeightMode,
} from "../scripts/imageArrayToOBJ.js";
import { getStorage } from "../lib/storage.js"; //uploads to MiniIO
import { GlTFModelRepository } from "../lib/gltfModelRepository.js"; //saves metadata to the database

const router = Router(); //router is the mini Express app for upload routes
const repo = new GlTFModelRepository(); //how to talk to the gltf_models database table

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; //25 MB
/** Upper bound on decoded pixels (≈16M px ≈ 4096x4096), protecting memory/CPU. */
export const MAX_UPLOAD_PIXELS = 16 * 1024 * 1024;

const upload = multer({
  //when a file is uploaded, hold it in memory temporarily and reject files bigger than 25 MB
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

const validHeightModes: HeightMode[] = [ //chooses what part of the image controls the 3D height
  "red",
  "green",
  "blue",
  "alpha",
  "brightness",
];

/**
 * Detect the real file type from magic bytes rather than trusting the client's
 * Content-Type header (trivially spoofable; a mislabeled file would otherwise
 * 500 deep inside the wrong conversion branch). Returns a canonical MIME type
 * or null when the content isn't a supported PDF/image.
 */
export function detectFileType(buffer: Buffer): string | null {
  if (buffer.length < 4) return null;

  // PDF: "%PDF-"
  if (buffer.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";

  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";

  // WebP: "RIFF" .... "WEBP"
  if (buffer.subarray(0, 4).toString("latin1") === "RIFF" && buffer.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";

  // BMP: "BM"
  if (buffer.subarray(0, 2).toString("latin1") === "BM") return "image/bmp";

  // TIFF: "II*\0" (little-endian) or "MM\0*" (big-endian)
  if (
    (buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00) ||
    (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a)
  ) return "image/tiff";

  return null;
}

//expect one uploaded file with the form field name "file"
router.post("/", upload.single("file"), async (req: Request, res: Response) => {
  let tempDir: string | null = null;

  try {
    const file = req.file;

    //if no file uploaded, return 400 error
    if (!file) {
      res.status(400).json({ error: "file is required" });
      return;
    }

    //validate by content (magic bytes), not by the client-supplied header
    const fileType = detectFileType(file.buffer);
    if (!fileType) {
      res.status(400).json({ error: "Unsupported file type — expected a PDF or PNG/JPEG/WebP/BMP/TIFF image" });
      return;
    }

    //if heightmode not chosen, default to brightness
    const heightMode = (req.body.heightMode ?? "brightness") as HeightMode;

    if (!validHeightModes.includes(heightMode)) {
      res.status(400).json({
        error: `heightMode must be one of: ${validHeightModes.join(", ")}`,
      });
      return;
    }

    //when a pdf is uploaded, use page 1 unless the user asks for another page
    const page = Number(req.body.page ?? 1);
    if (!Number.isInteger(page) || page < 1) {
      res.status(400).json({ error: "page must be a positive integer" });
      return;
    }

    //temporarily save and write the uploaded file to disk so converter can read it
    tempDir = await mkdtemp(join(tmpdir(), "vellum-upload-"));
    const tempPath = join(
      tempDir,
      `${crypto.randomUUID()}${extname(file.originalname)}`,
    );

    await writeFile(tempPath, file.buffer);

    //convert the file to pixels
    const converter = new ImageTo3DArray();
    const pixels =
      fileType === "application/pdf"
        ? await converter.pdf2Array(tempPath, page)
        : await converter.img2Array(tempPath);

    if (pixels.length === 0) {
      res.status(400).json({ error: "No pixels could be extracted from the uploaded file" });
      return;
    }

    //cap decoded pixels to protect memory/CPU (a 25 MB upload can otherwise
    // balloon into GBs of heap once decoded)
    if (pixels.length > MAX_UPLOAD_PIXELS) {
      res.status(413).json({ error: `Decoded image exceeds the ${MAX_UPLOAD_PIXELS.toLocaleString()} pixel limit` });
      return;
    }

    const extent = computeExtent(pixels);
    if (extent === null) {
      // unreachable after the empty check above; defensive for TS narrowing
      res.status(400).json({ error: "No pixels could be extracted from the uploaded file" });
      return;
    }
    const width = extent.width;
    const height = extent.height;

    const generator = new TopographyMeshGenerator();
    const mesh = generator.generate(pixels, heightMode);

    //turns the mesh into a real .glb model file in memory
    const exporter = new GLTFExporter();
    const glbBuffer = await exporter.exportToBuffer(mesh);

    //upload to MinIO
    const storage = getStorage();
    const storageKey = `models/${Date.now()}-${crypto.randomUUID()}.glb`;

    //storageKey is like the file path in MiniIo
    await storage.upload(
      storageKey,
      Readable.from([glbBuffer]),
      glbBuffer.length,
      "model/gltf-binary",
    );

    //save metadata to the database, actual glb file lives in MinIO
    const record = await repo.create({
      sessionId: req.body.sessionId ?? null,
      label: req.body.label ?? file.originalname,
      storageKey,
      heightMode,
      width,
      height,
      vertexCount: mesh.vertices.length,
      fileSize: glbBuffer.length,
    });

    // Public download URL: the backend's own streaming route
    // (GET /api/models/:modelId), reachable through the same origin the
    // request came from. The raw MinIO presigned URL is internal-only
    // (S3_ENDPOINT points at the docker gateway), so it must not be exposed.
    const proto = (req.headers["x-forwarded-proto"] as string) ?? req.protocol;
    const prefix = (req.headers["x-forwarded-prefix"] as string) ?? "";
    const downloadUrl = `${proto}://${req.get("host")}${prefix}/api/models/${record.modelId}`;

    res.status(201).json({
      modelId: record.modelId,
      storageKey: record.storageKey,
      width: record.width,
      height: record.height,
      vertexCount: record.vertexCount,
      downloadUrl,
    });

    //error handling
  } catch (err) {
    //log the real reason server-side; never leak internals to clients
    console.error("POST /api/upload failed:", err);
    res.status(500).json({ error: "Failed to upload and convert file" });
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
});

/**
 * Single-pass width/height of a pixel list. Avoids Math.max(...spread), which
 * blows the engine argument limit on large arrays (RangeError). Returns null
 * for an empty list (caller should reject it first).
 */
export function computeExtent(pixels: PixelDataTuple[]): { width: number; height: number } | null {
  if (pixels.length === 0) return null;

  let maxX = 0;
  let maxY = 0;
  for (const [x, y] of pixels) {
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { width: maxX + 1, height: maxY + 1 };
}

// multer errors (e.g. file too large) arrive here as an Express error — return
// JSON instead of the default HTML 500. Detected structurally by the "LIMIT_"
// code prefix so we don't depend on multer's type narrowing quirks.
router.use((err: unknown, _req: Request, res: Response, _next: () => void) => {
  const multerErr = err as { code?: unknown; message?: unknown } | null;
  if (multerErr && typeof multerErr.code === "string" && multerErr.code.startsWith("LIMIT_")) {
    if (multerErr.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: `File too large (max ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB)` });
      return;
    }
    res.status(400).json({ error: `Upload failed: ${String(multerErr.message ?? "multer error")}` });
    return;
  }
  console.error("Upload middleware error:", err);
  res.status(500).json({ error: "Failed to upload file" });
});

export default router;
