# Asset Manifest Schema (IMPL-004)

Defines the contract for progressive chunked loading of 3D assets. Clients fetch this manifest to discover available chunks and their metadata before streaming `.glb` files.

## Endpoint

```
GET /api/assets/:assetId/manifest
```

Returns `200 OK` with the manifest JSON, or `404 Not Found` if no manifest exists for the given asset ID.

## Schema

### Top-Level: `AssetManifest`

| Field | Type | Required | Description |
|---|---|---|---|
| `assetId` | string | ✅ | Unique identifier for the source asset (PDF page) |
| `version` | string | ✅ | Manifest schema version (semver, e.g., `"1.0.0"`) |
| `sourceFile` | string | ✅ | Original filename for traceability |
| `totalChunks` | number | ✅ | Number of chunks in this manifest |
| `totalSizeBytes` | number | ✅ | Sum of all chunk sizes in bytes |
| `generatedAt` | string (ISO 8601) | ✅ | Timestamp of manifest generation |
| `chunks[]` | ChunkDescriptor[] | ✅ | Array of chunk descriptors |

### Chunk Descriptor: `ChunkDescriptor`

| Field | Type | Required | Description |
|---|---|---|---|
| `chunkId` | string | ✅ | Unique identifier within this asset (e.g., `"chunk-tl"`) |
| `region` | Region | ✅ | Spatial bounds in source pixel coordinates |
| `url` | string | ✅ | Full URL to download the `.glb` chunk |
| `sizeBytes` | number | ✅ | File size of this chunk in bytes |
| `vertexCount` | number | ✅ | Number of vertices in this chunk's mesh |
| `priority` | number | ✅ | Load order (`1` = highest priority, loaded first) |
| `dependencies[]` | string[] | ❌ | Chunk IDs that must load before this one |

### Region

| Field | Type | Description |
|---|---|---|
| `x` | number | Top-left X coordinate in source pixels |
| `y` | number | Top-left Y coordinate in source pixels |
| `width` | number | Width in source pixels |
| `height` | number | Height in source pixels |

## Example Response

```json
{
  "assetId": "vellum-page-001",
  "version": "1.0.0",
  "sourceFile": "voynich-folio-01r.pdf",
  "totalChunks": 4,
  "totalSizeBytes": 24576000,
  "generatedAt": "2026-08-10T12:00:00.000Z",
  "chunks": [
    {
      "chunkId": "chunk-tl",
      "region": { "x": 0, "y": 0, "width": 512, "height": 512 },
      "url": "https://storage.example.com/models/vellum-page-001/chunk-tl.glb",
      "sizeBytes": 6144000,
      "vertexCount": 524288,
      "priority": 1,
      "dependencies": []
    },
    {
      "chunkId": "chunk-tr",
      "region": { "x": 512, "y": 0, "width": 512, "height": 512 },
      "url": "https://storage.example.com/models/vellum-page-001/chunk-tr.glb",
      "sizeBytes": 6144000,
      "vertexCount": 524288,
      "priority": 2,
      "dependencies": []
    }
  ]
}
```

## Client Usage

1. Fetch manifest: `GET /api/assets/:assetId/manifest`
2. Sort chunks by `priority` ascending
3. Load chunks progressively, placing each at its `region` spatial bounds
4. Show placeholder/fog for unloaded regions; "pop in" high-fidelity mesh as chunks arrive

## Backward Compatibility

Small pages that generate a single monolithic `.glb` will have a manifest with `totalChunks: 1` and one chunk descriptor covering the full page region. This ensures clients can always use the manifest path without special-casing.
