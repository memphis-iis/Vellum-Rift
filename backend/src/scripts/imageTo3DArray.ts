import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import sharp from "sharp";
import { createCanvas } from "canvas";
import { resolve } from "node:path";

// Set the worker source for pdfjs-dist (legacy build for Node.js)
// Use an absolute file:// URL to the worker in node_modules
pdfjs.GlobalWorkerOptions.workerSrc = `file://${resolve(
  import.meta.dirname,
  "../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
)}`;

export type RGBA = [number, number, number, number];
export type PixelDataTuple = [number, number, RGBA];

/**
 * Converts PDF pages or image files into a 3D array representation.
 * Each pixel becomes a tuple of [x, y, [r, g, b, a]].
 */
export class ImageTo3DArray {
  /**
   * Converts a specific page of a PDF file into a 3D pixel array.
   * @param filePath - Path to the PDF file
   * @param pageNumber - Page number to convert (1-indexed)
   * @param scale - Optional scale factor for rendering resolution (default: 2)
   * @returns Promise resolving to an array of [x, y, RGBA] tuples
   */
  async pdf2Array(
    filePath: string,
    pageNumber: number,
    scale: number = 2,
  ): Promise<PixelDataTuple[]> {
    const doc = await pdfjs.getDocument({ url: filePath }).promise;

    if (pageNumber < 1 || pageNumber > doc.numPages) {
      throw new Error(
        `Invalid page number ${pageNumber}. Document has ${doc.numPages} pages.`,
      );
    }

    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });

    // Create a real canvas for rendering
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext("2d");

    // Fill with white background
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, viewport.width, viewport.height);

    await page.render({
      canvasContext: context as any,
      viewport,
      canvas: canvas as any,
    }).promise;

    // Extract pixel data from the canvas
    const imageData = context.getImageData(0, 0, viewport.width, viewport.height);

    return this.convertToPixelDataTuple(
      imageData.data,
      viewport.width,
      viewport.height,
    );
  }

  /**
   * Converts a specific page of a PDF from a raw buffer into a 3D pixel array.
   * Used by the async upload worker after downloading from MinIO.
   * @param buffer - Raw PDF bytes
   * @param pageNumber - Page number to convert (1-indexed)
   * @param scale - Optional scale factor for rendering resolution (default: 2)
   * @returns Promise resolving to an array of [x, y, RGBA] tuples
   */
  async pdf2ArrayFromBuffer(
    buffer: Buffer,
    pageNumber: number,
    scale: number = 2,
  ): Promise<PixelDataTuple[]> {
    const doc = await pdfjs.getDocument({ data: buffer }).promise;

    if (pageNumber < 1 || pageNumber > doc.numPages) {
      throw new Error(
        `Invalid page number ${pageNumber}. Document has ${doc.numPages} pages.`,
      );
    }

    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });

    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext("2d");

    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, viewport.width, viewport.height);

    await page.render({
      canvasContext: context as any,
      viewport,
      canvas: canvas as any,
    }).promise;

    const imageData = context.getImageData(0, 0, viewport.width, viewport.height);

    return this.convertToPixelDataTuple(
      imageData.data,
      viewport.width,
      viewport.height,
    );
  }

  /**
   * Converts an image file into a 3D pixel array.
   * @param filePath - Path to the image file
   * @returns Promise resolving to an array of [x, y, RGBA] tuples
   */
  async img2Array(filePath: string): Promise<PixelDataTuple[]> {
    const metadata = await sharp(filePath).metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error("Failed to read image dimensions.");
    }

    // Process the image and get raw RGBA data
    const { data, info } = await sharp(filePath)
      .raw()
      .ensureAlpha()
      .toBuffer({ resolveWithObject: true });

    return this.convertToPixelDataTuple(
      new Uint8ClampedArray(data),
      info.width!,
      info.height!,
    );
  }

  /**
   * Converts an image from a raw buffer into a 3D pixel array.
   * Used by the async upload worker after downloading from MinIO.
   * @param buffer - Raw image bytes (PNG, JPEG, WebP, BMP, TIFF)
   * @returns Promise resolving to an array of [x, y, RGBA] tuples
   */
  async img2ArrayFromBuffer(buffer: Buffer): Promise<PixelDataTuple[]> {
    const { data, info } = await sharp(buffer)
      .raw()
      .ensureAlpha()
      .toBuffer({ resolveWithObject: true });

    if (!info.width || !info.height) {
      throw new Error("Failed to read image dimensions from buffer.");
    }

    return this.convertToPixelDataTuple(
      new Uint8ClampedArray(data),
      info.width,
      info.height,
    );
  }

  /**
   * Converts flat RGBA pixel data into the 3D array format.
   * @param pixels - Flat array of RGBA values
   * @param width - Width of the image in pixels
   * @param height - Height of the image in pixels
   * @returns Array of [x, y, RGBA] tuples
   */
  private convertToPixelDataTuple(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
  ): PixelDataTuple[] {
    const result: PixelDataTuple[] = new Array(width * height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;
        const r = pixels[index];
        const g = pixels[index + 1];
        const b = pixels[index + 2];
        const a = pixels[index + 3];

        result[y * width + x] = [x, y, [r, g, b, a]];
      }
    }

    return result;
  }
}
