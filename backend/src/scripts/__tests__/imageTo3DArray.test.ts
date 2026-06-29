import { describe, it, expect, beforeEach } from "vitest";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { ImageTo3DArray, type PixelDataTuple } from "../imageTo3DArray.js";

describe("ImageTo3DArray", () => {
  let converter: ImageTo3DArray;

  beforeEach(() => {
    converter = new ImageTo3DArray();
  });

  describe("img2Array", () => {
    it("converts a small image to pixel data tuples", async () => {
      // Create a tiny 2x2 PNG with solid color (opaque)
      const buffer = await sharp({
        create: {
          width: 2,
          height: 2,
          channels: 4,
          background: { r: 255, g: 128, b: 64, alpha: 255 },
        },
      })
        .png()
        .toBuffer();

      const tmpPath = join(tmpdir(), `test-img-${Date.now()}.png`);
      writeFileSync(tmpPath, buffer);

      try {
        const result = await converter.img2Array(tmpPath);

        expect(result).toBeInstanceOf(Array);
        expect(result.length).toBe(4);

        // Check structure: [x, y, [r, g, b, a]]
        const firstPixel = result[0];
        expect(firstPixel).toHaveLength(3);
        expect(typeof firstPixel[0]).toBe("number"); // x
        expect(typeof firstPixel[1]).toBe("number"); // y
        expect(Array.isArray(firstPixel[2])).toBe(true); // RGBA
        expect(firstPixel[2]).toHaveLength(4);

        // All pixels should have the same color since it's a solid image
        for (const pixel of result) {
          const [, , [r, g, b, a]] = pixel;
          expect(r).toBe(255);
          expect(g).toBe(128);
          expect(b).toBe(64);
          expect(a).toBe(255);
        }
      } finally {
        await unlink(tmpPath).catch(() => {});
      }
    });

    it("returns correct dimensions for a known image", async () => {
      const buffer = await sharp({
        create: {
          width: 3,
          height: 2,
          channels: 4,
          background: { r: 128, g: 64, b: 32, alpha: 255 },
        },
      })
        .png()
        .toBuffer();

      const tmpPath = join(tmpdir(), `test-dim-${Date.now()}.png`);
      writeFileSync(tmpPath, buffer);

      try {
        const result = await converter.img2Array(tmpPath);

        expect(result.length).toBe(6); // 3 * 2

        // Check x coordinates range from 0 to 2
        const xValues = result.map(([x]) => x);
        assert.ok(xValues.every((x) => x >= 0 && x <= 2));

        // Check y coordinates range from 0 to 1
        const yValues = result.map(([, y]) => y);
        assert.ok(yValues.every((y) => y >= 0 && y <= 1));
      } finally {
        await unlink(tmpPath).catch(() => {});
      }
    });

    it("throws on invalid file path", async () => {
      await expect(converter.img2Array("/nonexistent/image.png")).rejects.toThrow();
    });
  });

  describe("pdf2Array", () => {
    it("converts a PDF page to pixel data tuples", async () => {
      // Create a minimal valid PDF
      const pdfContent = Buffer.from(
        "%PDF-1.4\n" +
          "1 0 obj\n" +
          "<< /Type /Catalog /Pages 2 0 R >>\n" +
          "endobj\n" +
          "2 0 obj\n" +
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>\n" +
          "endobj\n" +
          "3 0 obj\n" +
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << >> >>\n" +
          "endobj\n" +
          "4 0 obj\n" +
          "<< /Length 44 >>\n" +
          "stream\n" +
          "BT /F1 12 Tf 100 700 Td (Hello) Tj ET\n" +
          "endstream\n" +
          "endobj\n" +
          "xref\n" +
          "0 5\n" +
          "trailer\n" +
          "<< /Size 5 /Root 1 0 R >>\n" +
          "startxref\n" +
          "0\n" +
          "%%EOF",
      );

      const tmpPath = join(tmpdir(), `test-pdf-${Date.now()}.pdf`);
      writeFileSync(tmpPath, pdfContent);

      try {
        const result = await converter.pdf2Array(tmpPath, 1);

        expect(result).toBeInstanceOf(Array);
        expect(result.length).toBeGreaterThan(0);

        // Check structure
        const firstPixel = result[0];
        expect(firstPixel).toHaveLength(3);
        expect(typeof firstPixel[0]).toBe("number");
        expect(typeof firstPixel[1]).toBe("number");
        expect(Array.isArray(firstPixel[2])).toBe(true);
        expect(firstPixel[2]).toHaveLength(4);
      } finally {
        await unlink(tmpPath).catch(() => {});
      }
    });

    it("throws on invalid page number", async () => {
      const pdfContent = Buffer.from(
        "%PDF-1.4\n" +
          "1 0 obj\n" +
          "<< /Type /Catalog /Pages 2 0 R >>\n" +
          "endobj\n" +
          "2 0 obj\n" +
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>\n" +
          "endobj\n" +
          "3 0 obj\n" +
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << >> >>\n" +
          "endobj\n" +
          "4 0 obj\n" +
          "<< /Length 0 >>\n" +
          "stream\n" +
          "endstream\n" +
          "endobj\n" +
          "xref\n" +
          "0 5\n" +
          "trailer\n" +
          "<< /Size 5 /Root 1 0 R >>\n" +
          "startxref\n" +
          "0\n" +
          "%%EOF",
      );

      const tmpPath = join(tmpdir(), `test-pdf-invalid-${Date.now()}.pdf`);
      writeFileSync(tmpPath, pdfContent);

      try {
        await expect(converter.pdf2Array(tmpPath, 99)).rejects.toThrow();
      } finally {
        await unlink(tmpPath).catch(() => {});
      }
    });

    it("throws on invalid file path", async () => {
      await expect(converter.pdf2Array("/nonexistent/document.pdf", 1)).rejects.toThrow();
    });
  });

  describe("output format compatibility", () => {
    it("produces output compatible with TopographyMeshGenerator input type", async () => {
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

      const tmpPath = join(tmpdir(), `test-compat-${Date.now()}.png`);
      writeFileSync(tmpPath, buffer);

      try {
        const result = await converter.img2Array(tmpPath);

        // Verify it matches PixelDataTuple type: [number, number, RGBA]
        for (const pixel of result) {
          expect(pixel).toHaveLength(3);
          const [x, y, rgba] = pixel;
          expect(typeof x).toBe("number");
          expect(typeof y).toBe("number");
          expect(rgba).toHaveLength(4);
          rgba.forEach((channel) => {
            expect(typeof channel).toBe("number");
            expect(channel).toBeGreaterThanOrEqual(0);
            expect(channel).toBeLessThanOrEqual(255);
          });
        }
      } finally {
        await unlink(tmpPath).catch(() => {});
      }
    });
  });
});