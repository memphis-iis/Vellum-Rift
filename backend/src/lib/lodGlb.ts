import { NodeIO } from "@gltf-transform/core";
import type { Accessor, Document, Primitive, Texture } from "@gltf-transform/core";
import sharp from "sharp";

import type { LoDTier } from "./lodTiers.js";

export interface SubsampleOptions {
  maxVertices: number;
  maxTextureSize: number;
  /** Grid width stored with the model. Vertices are row-major, y then x. */
  width: number;
  height: number;
}

export interface SubsampleResult {
  glb: Buffer;
  vertexCount: number;
  changed: boolean;
}

/** Cache key for a tier variant of a stored model, beside the original .glb. */
export function lodStorageKey(storageKey: string, tier: LoDTier): string {
  return storageKey.replace(/\.glb$/i, `.${tier}.glb`);
}

/**
 * Subsample a topography GLB down to a vertex budget. The stored mesh is a
 * row-major grid (one vertex per source pixel). Returns the original buffer
 * when it already fits or the layout is not that grid.
 */
export async function subsampleGlb(
  glb: Buffer,
  options: SubsampleOptions,
): Promise<SubsampleResult> {
  const io = new NodeIO();
  const document = await io.readBinary(new Uint8Array(glb));
  const primitive = firstPrimitive(document);
  if (!primitive) {
    return { glb, vertexCount: 0, changed: false };
  }

  const position = primitive.getAttribute("POSITION");
  const index = primitive.getIndices();
  if (!position || !index) {
    return { glb, vertexCount: 0, changed: false };
  }

  const vertexCount = position.getCount();
  if (vertexCount <= options.maxVertices) {
    return { glb, vertexCount, changed: false };
  }

  const grid = resolveGrid(vertexCount, options.width, options.height);
  if (!grid) {
    return { glb, vertexCount, changed: false };
  }

  const srcPos = position.getArray();
  if (!srcPos) {
    return { glb, vertexCount, changed: false };
  }

  const xs = chooseAxis(grid.width, grid.height, options.maxVertices).xs;
  const ys = chooseAxis(grid.width, grid.height, options.maxVertices).ys;
  const nw = xs.length;
  const nh = ys.length;

  const newPos = new Float32Array(nw * nh * 3);
  const srcUv = primitive.getAttribute("TEXCOORD_0")?.getArray();
  const newUv = new Float32Array(nw * nh * 2);
  const hasUv = srcUv != null && srcUv.length >= vertexCount * 2;

  for (let j = 0; j < nh; j++) {
    for (let i = 0; i < nw; i++) {
      const src = ys[j] * grid.width + xs[i];
      const dst = j * nw + i;
      newPos[dst * 3] = srcPos[src * 3];
      newPos[dst * 3 + 1] = srcPos[src * 3 + 1];
      newPos[dst * 3 + 2] = srcPos[src * 3 + 2];
      if (hasUv && srcUv) {
        newUv[dst * 2] = srcUv[src * 2];
        newUv[dst * 2 + 1] = srcUv[src * 2 + 1];
      } else {
        newUv[dst * 2] = grid.width > 1 ? xs[i] / (grid.width - 1) : 0;
        newUv[dst * 2 + 1] = grid.height > 1 ? 1 - ys[j] / (grid.height - 1) : 0;
      }
    }
  }

  const newIndex = new Uint32Array((nw - 1) * (nh - 1) * 6);
  let t = 0;
  for (let j = 0; j < nh - 1; j++) {
    for (let i = 0; i < nw - 1; i++) {
      const topLeft = j * nw + i;
      const topRight = topLeft + 1;
      const bottomLeft = (j + 1) * nw + i;
      const bottomRight = bottomLeft + 1;
      newIndex[t++] = topLeft;
      newIndex[t++] = bottomLeft;
      newIndex[t++] = topRight;
      newIndex[t++] = topRight;
      newIndex[t++] = bottomLeft;
      newIndex[t++] = bottomRight;
    }
  }

  writeVec3(position, newPos);
  const uvAccessor = primitive.getAttribute("TEXCOORD_0");
  if (uvAccessor) writeVec2(uvAccessor, newUv);
  const normal = primitive.getAttribute("NORMAL");
  if (normal) writeVec3(normal, computeNormals(newPos, newIndex));
  index.setArray(newIndex);

  await resizeBaseColor(primitive, options.maxTextureSize);

  const bytes = await io.writeBinary(document);
  return {
    glb: Buffer.from(bytes),
    vertexCount: nw * nh,
    changed: true,
  };
}

function firstPrimitive(document: Document): Primitive | null {
  const mesh = document.getRoot().listMeshes()[0];
  return mesh?.listPrimitives()[0] ?? null;
}

function resolveGrid(
  vertexCount: number,
  width: number,
  height: number,
): { width: number; height: number } | null {
  if (width >= 2 && height >= 2 && width * height === vertexCount) {
    return { width, height };
  }
  return null;
}

function chooseAxis(width: number, height: number, maxVertices: number): {
  xs: number[];
  ys: number[];
} {
  let xs = sampleAxis(width, 1);
  let ys = sampleAxis(height, 1);
  const limit = Math.max(width, height);
  for (let stride = 1; stride < limit; stride++) {
    xs = sampleAxis(width, stride);
    ys = sampleAxis(height, stride);
    if (xs.length * ys.length <= maxVertices) break;
  }
  return { xs, ys };
}

/** Inclusive samples along one grid axis, always keeping the last index. */
export function sampleAxis(count: number, stride: number): number[] {
  if (stride < 1) stride = 1;
  const steps = Math.floor((count - 1) / stride) + 1;
  const addLast = (count - 1) % stride !== 0;
  const idx = new Array<number>(steps + (addLast ? 1 : 0));
  for (let i = 0; i < steps; i++) idx[i] = i * stride;
  if (addLast) idx[steps] = count - 1;
  return idx;
}

function writeVec3(accessor: Accessor, values: Float32Array): void {
  accessor.setArray(values);
}

function writeVec2(accessor: Accessor, values: Float32Array): void {
  accessor.setArray(values);
}

function computeNormals(positions: Float32Array, faces: Uint32Array): Float32Array {
  const normals = new Float32Array(positions.length);
  for (let i = 0; i + 2 < faces.length; i += 3) {
    const a = faces[i] * 3;
    const b = faces[i + 1] * 3;
    const c = faces[i + 2] * 3;
    const ux = positions[c] - positions[a];
    const uy = positions[c + 1] - positions[a + 1];
    const uz = positions[c + 2] - positions[a + 2];
    const vx = positions[b] - positions[a];
    const vy = positions[b + 1] - positions[a + 1];
    const vz = positions[b + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    for (const base of [a, b, c]) {
      normals[base] += nx;
      normals[base + 1] += ny;
      normals[base + 2] += nz;
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= len;
    normals[i + 1] /= len;
    normals[i + 2] /= len;
  }
  return normals;
}

async function resizeBaseColor(primitive: Primitive, maxTextureSize: number): Promise<void> {
  const texture: Texture | null = primitive.getMaterial()?.getBaseColorTexture() ?? null;
  const image = texture?.getImage();
  if (!texture || !image || maxTextureSize <= 0) return;

  const resized = await sharp(Buffer.from(image))
    .resize(maxTextureSize, maxTextureSize, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
  texture.setImage(new Uint8Array(resized));
}
