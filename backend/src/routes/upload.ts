import { Router, type Request, type Response } from "express"; //allows for route creation
import multer from "multer"; //receives uploaded files
import { mkdtemp, rm, writeFile } from "node:fs/promises"; //make/delete a temporary file
import { tmpdir } from "node:os"; //helps create safe file paths
import { extname, join } from "node:path"; //helps create safe file paths
import { Readable } from "node:stream"; //turns a buffer into a stream for MiniIO
import crypto from "node:crypto"; //makes unique file names

import { ImageTo3DArray } from "../scripts/imageTo3DArray.js"; //converts PDF/image into pixels
import {
  GLTFExporter, //turns mesh into glb
  TopographyMeshGenerator, 
  type HeightMode,
} from "../scripts/imageArrayToOBJ.js";
import { getStorage } from "../lib/storage.js"; //uploads to MiniIO
import { GlTFModelRepository } from "../lib/gltfModelRepository.js"; //saves metadata to the database

const router = Router(); //router is the mini Express app for upload routes
const repo = new GlTFModelRepository(); //how to talk to the gltf_models database table

const upload = multer({ //when a file is uploaded, hold it in memory temporarily and reject files bigger than 25 MB
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const supportedMimeTypes = new Set([ //supported type files
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/bmp",
  "image/tiff",
]);

const validHeightModes: HeightMode[] = [ //chooses what part of the image controls the 3D height
  "red",
  "green",
  "blue",
  "alpha",
  "brightness",
];

//expect on euploaded file with the form field name "file"
router.post("/", upload.single("file"), async (req: Request, res: Response) => {
  let tempDir: string | null = null;

  try {
    const file = req.file;

    //if no file uploaded, return 404 error
    if (!file) {
      res.status(400).json({ error: "file is required" });
      return;
    }

    //if not supported PDF/image type, stop
    if (!supportedMimeTypes.has(file.mimetype)) {
      res.status(400).json({ error: `Unsupported file type: ${file.mimetype}` });
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

    //temporarily save and write the uploaded file to disk so converted can read it
    tempDir = await mkdtemp(join(tmpdir(), "vellum-upload-"));
    const tempPath = join(
      tempDir,
      `${crypto.randomUUID()}${extname(file.originalname)}`,
    );

    await writeFile(tempPath, file.buffer);

    //convert the file to pixels
    const converter = new ImageTo3DArray();
    const pixels =
      file.mimetype === "application/pdf"
        ? await converter.pdf2Array(tempPath, page)
        : await converter.img2Array(tempPath);

    const width = Math.max(...pixels.map(([x]) => x)) + 1;
    const height = Math.max(...pixels.map(([, y]) => y)) + 1;

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

    const downloadUrl = await storage.presignedUrl(record.storageKey, 86400);

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
    const message = err instanceof Error ? err.message : "Unknown upload error";
    res.status(500).json({ error: `Failed to upload and convert file: ${message}` });
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
});

export default router;