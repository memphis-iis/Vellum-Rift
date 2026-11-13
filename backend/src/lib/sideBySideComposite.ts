import sharp from "sharp";

export type FitMode = "scale" | "pad";

export type RawRgba = {
  data: Buffer;
  width: number;
  height: number;
};

export type SideBySideResult = RawRgba & {
  pixelCount: number;
};

/**
 * Horizontally stitch two RGBA images.
 * - scale: resize both so height matches the taller (aspect preserved), then concat
 * - pad: letterbox shorter side with black (vertically centered), then concat
 */
export async function sideBySideComposite(
  left: RawRgba,
  right: RawRgba,
  fitMode: FitMode,
  maxPixels: number,
): Promise<SideBySideResult> {
  if (left.width < 1 || left.height < 1 || right.width < 1 || right.height < 1) {
    throw new Error("Both images must have positive dimensions");
  }
  if (fitMode !== "scale" && fitMode !== "pad") {
    throw new Error(`fitMode must be "scale" or "pad"`);
  }

  const targetHeight = Math.max(left.height, right.height);
  const preparedLeft = await prepareSide(left, targetHeight, fitMode);
  const preparedRight = await prepareSide(right, targetHeight, fitMode);

  const outWidth = preparedLeft.width + preparedRight.width;
  const outHeight = targetHeight;
  const pixelCount = outWidth * outHeight;
  if (pixelCount > maxPixels) {
    throw new Error(
      `Combined image too large (${outWidth}x${outHeight} = ${pixelCount} px; max ${maxPixels})`,
    );
  }

  const data = await sharp({
    create: {
      width: outWidth,
      height: outHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 255 },
    },
  })
    .composite([
      {
        input: preparedLeft.data,
        raw: { width: preparedLeft.width, height: preparedLeft.height, channels: 4 },
        left: 0,
        top: 0,
      },
      {
        input: preparedRight.data,
        raw: { width: preparedRight.width, height: preparedRight.height, channels: 4 },
        left: preparedLeft.width,
        top: 0,
      },
    ])
    .raw()
    .ensureAlpha()
    .toBuffer();

  return { data, width: outWidth, height: outHeight, pixelCount };
}

async function prepareSide(
  side: RawRgba,
  targetHeight: number,
  fitMode: FitMode,
): Promise<RawRgba> {
  if (fitMode === "scale") {
    if (side.height === targetHeight) {
      return side;
    }
    const { data, info } = await sharp(side.data, {
      raw: { width: side.width, height: side.height, channels: 4 },
    })
      .resize({ height: targetHeight, fit: "inside" })
      .raw()
      .ensureAlpha()
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  }

  // pad
  if (side.height === targetHeight) {
    return side;
  }
  const top = Math.floor((targetHeight - side.height) / 2);
  const { data, info } = await sharp(side.data, {
    raw: { width: side.width, height: side.height, channels: 4 },
  })
    .extend({
      top,
      bottom: targetHeight - side.height - top,
      left: 0,
      right: 0,
      background: { r: 0, g: 0, b: 0, alpha: 255 },
    })
    .raw()
    .ensureAlpha()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}
