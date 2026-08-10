/**
 * Shared upload validation logic — used by both the upload route and its tests.
 */

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

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
