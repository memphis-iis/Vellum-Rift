import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import winston from "winston";

import { ImageTo3DArray } from "../scripts/imageTo3DArray.js";
import { TopographyMeshGenerator, GLTFExporter, type HeightMode } from "../scripts/imageArrayToOBJ.js";
import { getStorage } from "./storage.js";
import { GlTFModelRepository } from "./gltfModelRepository.js";
import { Readable } from "node:stream";

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  transports: [new winston.transports.Console()],
});

// Supported file extensions for ingestion
const PDF_EXTENSIONS = new Set([".pdf"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff"]);

interface IngestResult {
  modelId: string;
  label: string;
  storageKey: string;
  width: number;
  height: number;
  vertexCount: number;
  fileSize: number;
}

/**
 * Scans a directory for PDF and image files, converts each to a 3D pixel array,
 * generates a glTF mesh, uploads it to MinIO, and persists metadata to the DB.
 */
export class SampleModelIngestor {
  private converter: ImageTo3DArray;
  private generator: TopographyMeshGenerator;
  private exporter: GLTFExporter;
  private repo: GlTFModelRepository;

  constructor() {
    this.converter = new ImageTo3DArray();
    this.generator = new TopographyMeshGenerator();
    this.exporter = new GLTFExporter();
    this.repo = new GlTFModelRepository();
  }

  /**
   * Ingest all PDF and image files from the sample directory on startup.
   * @param sampleDir - Absolute path to the sample directory (default: src/sample/pdfs/)
   * @returns Array of ingest results for each successfully processed file
   */
  async ingestAll(sampleDir?: string): Promise<IngestResult[]> {
    const dir = sampleDir ?? resolve(import.meta.dirname, "../sample/pdfs");

    let files: string[];
    try {
      files = await readdir(dir);
    } catch (err) {
      logger.warn(`Sample directory not found at ${dir}, skipping ingestion.`, { error: String(err) });
      return [];
    }

    const results: IngestResult[] = [];
    const eligibleFiles = files.filter((f) => {
      const ext = f.slice(f.lastIndexOf(".")).toLowerCase();
      return PDF_EXTENSIONS.has(ext) || IMAGE_EXTENSIONS.has(ext);
    });

    if (eligibleFiles.length === 0) {
      logger.info(`No PDF or image files found in ${dir}`);
      return [];
    }

    logger.info(`Found ${eligibleFiles.length} file(s) to ingest from ${dir}`);

    for (const file of eligibleFiles) {
      const filePath = join(dir, file);
      const ext = file.slice(file.lastIndexOf(".")).toLowerCase();

      try {
        if (PDF_EXTENSIONS.has(ext)) {
          const result = await this.ingestPdf(filePath, file);
          results.push(result);
        } else {
          const result = await this.ingestImage(filePath, file);
          results.push(result);
        }
      } catch (err) {
        logger.error(`Failed to ingest ${file}`, { error: String(err) });
      }
    }

    return results;
  }

  /**
   * Ingest a single PDF file. Renders page 1 by default.
   */
  private async ingestPdf(filePath: string, fileName: string): Promise<IngestResult> {
    logger.info(`Ingesting PDF: ${fileName}`);

    // Convert PDF page 1 to pixel array (scale=2 for decent resolution)
    const pixels = await this.converter.pdf2Array(filePath, 1, 2);

    return this.generateAndStore(pixels, fileName);
  }

  /**
   * Ingest a single image file.
   */
  private async ingestImage(filePath: string, fileName: string): Promise<IngestResult> {
    logger.info(`Ingesting image: ${fileName}`);

    const pixels = await this.converter.img2Array(filePath);

    return this.generateAndStore(pixels, fileName);
  }

  /**
   * Shared pipeline: pixels → mesh → glb buffer → MinIO upload → DB record.
   */
  private async generateAndStore(
    pixels: [number, number, [number, number, number, number]][],
    sourceFileName: string,
  ): Promise<IngestResult> {
    // Derive dimensions
    const width = Math.max(...pixels.map(([x]) => x)) + 1;
    const height = Math.max(...pixels.map(([, y]) => y)) + 1;

    logger.info(`Generating mesh for ${sourceFileName}: ${width}x${height}, ${pixels.length} pixels`);

    // Generate mesh using brightness mode (good default for documents)
    const heightMode: HeightMode = "brightness";
    const mesh = this.generator.generate(pixels, heightMode);

    // Export to glb buffer
    const glbBuffer = await this.exporter.exportToBuffer(mesh);

    // Upload to MinIO
    const storage = getStorage();
    const safeLabel = sourceFileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storageKey = `sample-models/${Date.now()}-${safeLabel}.glb`;

    const stream = Readable.from([glbBuffer]);
    await storage.upload(storageKey, stream, glbBuffer.length, "model/gltf-binary");

    // Persist metadata to DB
    const record = await this.repo.create({
      sessionId: null,
      label: safeLabel,
      storageKey,
      heightMode,
      width,
      height,
      vertexCount: mesh.vertices.length,
      fileSize: glbBuffer.length,
    });

    logger.info(`Successfully ingested ${sourceFileName} → modelId=${record.modelId}`);

    return {
      modelId: record.modelId,
      label: record.label,
      storageKey: record.storageKey,
      width: record.width,
      height: record.height,
      vertexCount: record.vertexCount,
      fileSize: record.fileSize,
    };
  }
}
