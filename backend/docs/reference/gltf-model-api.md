# glTF Model Generation & Serving API

## Overview

The `/api/models` endpoints enable server-side generation of 3D topographic meshes from 2D image pixel data, storage in MinIO, and streaming delivery to Unity clients. The pipeline is:

```
Pixel Array → Mesh Generation → glTF Binary (.glb) → MinIO Storage + DB Metadata → HTTP Stream
```

Each generated model is tracked in the `gltf_models` database table with metadata (dimensions, vertex count, file size, height mode) and a reference to its MinIO storage key. Models can optionally be associated with a game session via `session_id`.

---

## Endpoints

### POST `/api/models/generate`

Generate a glTF Binary (.glb) from pixel data, store it in MinIO, persist metadata to the database, and return the model record along with a presigned download URL.

**Request Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `pixels` | `PixelDataTuple[]` | Yes | Array of `[x, y, [r, g, b, a]]` tuples representing image pixels |
| `heightMode` | `string` | Yes | One of: `"red"`, `"green"`, `"blue"`, `"alpha"`, `"brightness"` |
| `sessionId` | `string` | No | UUID of an existing game session to associate the model with |
| `label` | `string` | No | Human-readable label for the model |

**Pixel Data Format:**

```typescript
type PixelDataTuple = [x: number, y: number, rgba: [r: number, g: number, b: number, a: number]];
```

Each tuple represents one pixel. The `x` and `y` values define the pixel's position in the image grid. The RGBA values determine both the vertex color and (based on `heightMode`) the Z-height of the corresponding 3D point.

**Height Modes:**

| Mode | Description |
|---|---|
| `"red"` | Uses the red channel as height (0–255 → 0–1) |
| `"green"` | Uses the green channel as height |
| `"blue"` | Uses the blue channel as height |
| `"alpha"` | Uses the alpha channel as height |
| `"brightness"` | Averages R, G, B channels: `(r + g + b) / 3 / 255` |

**Example Request:**

```bash
curl -X POST http://localhost:4000/api/models/generate \
  -H "Content-Type: application/json" \
  -d '{
    "pixels": [
      [0, 0, [0, 0, 0, 255]],
      [1, 0, [128, 0, 0, 255]],
      [0, 1, [128, 0, 0, 255]],
      [1, 1, [255, 0, 0, 255]]
    ],
    "heightMode": "red",
    "label": "test-terrain"
  }'
```

**Success Response (201):**

```json
{
  "modelId": "aaaa-0000-0000-0000-000000000001",
  "sessionId": null,
  "label": "test-terrain",
  "storageKey": "models/1719676800000-x7k2m.glb",
  "heightMode": "red",
  "width": 2,
  "height": 2,
  "vertexCount": 4,
  "fileSize": 1024,
  "createdAt": "2025-06-29T10:00:00.000Z",
  "downloadUrl": "http://minio.local:9000/bucket/models/...?X-Amz-Signature=..."
}
```

The `downloadUrl` is a presigned MinIO URL valid for 24 hours. Alternatively, use `GET /api/models/:modelId` to stream through the backend.

**Error Responses:**

| Status | Condition | Body |
|---|---|---|
| `400` | `pixels` missing or empty | `{ "error": "pixels array is required and must not be empty" }` |
| `400` | Invalid `heightMode` | `{ "error": "heightMode must be one of: red, green, blue, alpha, brightness" }` |
| `500` | Generation or storage failure | `{ "error": "Failed to generate glTF model" }` |

---

### GET `/api/models/:modelId`

Stream a previously-generated `.glb` file directly from MinIO to the client. This is the primary endpoint for Unity clients to download models.

**URL Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `modelId` | UUID | The model ID returned from `POST /generate` or `GET /meta` |

**Response Headers:**

| Header | Value |
|---|---|
| `Content-Type` | `model/gltf-binary` |
| `Content-Disposition` | `attachment; filename="{modelId}.glb"` |

**Success Response (200):** Binary `.glb` data streamed directly from MinIO.

**Error Responses:**

| Status | Condition | Body |
|---|---|---|
| `404` | Model not found in DB | `{ "error": "Model not found" }` |
| `500` | Storage read failure | `{ "error": "Failed to serve glTF model" }` |

**Unity Example (C#):**

```csharp
using UnityEngine;
using UnityEngine.Networking;
using System.Collections;

public class ModelDownloader : MonoBehaviour
{
    public string apiUrl = "http://localhost:4000";
    public string modelId = "aaaa-0000-0000-0000-000000000001";

    IEnumerator DownloadModel()
    {
        using (var uwr = UnityWebRequest.Get($"{apiUrl}/api/models/{modelId}"))
        {
            uwr.downloadHandler = new DownloadHandlerBuffer();
            yield return uwr.SendWebRequest();

            if (uwr.result == UnityWebRequest.Result.Success)
            {
                byte[] glbData = uwr.downloadHandler.data;
                // Load with Unity's GLTF loader or custom parser
                Debug.Log($"Downloaded {glbData.Length} bytes");
            }
        }
    }
}
```

---

### GET `/api/models/:modelId/meta`

Return the metadata record for a model without transferring the binary payload. Useful for listing models, checking file sizes, or building UI before downloading.

**URL Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `modelId` | UUID | The model ID |

**Success Response (200):**

```json
{
  "modelId": "aaaa-0000-0000-0000-000000000001",
  "sessionId": "bbbb-0000-0000-0000-000000000002",
  "label": "manuscript-scan-001",
  "storageKey": "models/1719676800000-x7k2m.glb",
  "heightMode": "brightness",
  "width": 512,
  "height": 512,
  "vertexCount": 262144,
  "fileSize": 5242880,
  "createdAt": "2025-06-29T10:00:00.000Z"
}
```

**Error Responses:**

| Status | Condition | Body |
|---|---|---|
| `404` | Model not found | `{ "error": "Model not found" }` |
| `500` | Database error | `{ "error": "Failed to fetch model metadata" }` |

---

### DELETE `/api/models/:modelId`

Permanently remove a model from both MinIO storage and the database. This operation is irreversible.

**URL Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `modelId` | UUID | The model ID to delete |

**Success Response (200):**

```json
{
  "removed": true,
  "modelId": "aaaa-0000-0000-0000-000000000001"
}
```

**Error Responses:**

| Status | Condition | Body |
|---|---|---|
| `404` | Model not found | `{ "error": "Model not found" }` |
| `500` | Deletion failure | `{ "error": "Failed to delete model" }` |

---

## Database Schema

### `gltf_models` Table

```sql
CREATE TABLE gltf_models (
  model_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID REFERENCES game_sessions(session_id),
  label        TEXT NOT NULL DEFAULT '',
  storage_key  TEXT NOT NULL,
  height_mode  TEXT NOT NULL,
  width        INT NOT NULL,
  height       INT NOT NULL,
  vertex_count INT NOT NULL DEFAULT 0,
  file_size    BIGINT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

| Column | Type | Description |
|---|---|---|
| `model_id` | UUID | Primary key, auto-generated |
| `session_id` | UUID | Optional FK to `game_sessions` — links the model to a game session |
| `label` | TEXT | Human-readable name |
| `storage_key` | TEXT | Object key path in MinIO (e.g., `models/1719676800000-x7k2m.glb`) |
| `height_mode` | TEXT | Which channel was used for height mapping |
| `width` | INT | Image width in pixels |
| `height` | INT | Image height in pixels |
| `vertex_count` | INT | Number of vertices in the generated mesh |
| `file_size` | BIGINT | Size of the `.glb` file in bytes |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

---

## Architecture

```
┌──────────────┐     POST /generate      ┌─────────────────┐
│  Unity Client │ ──────────────────────► │  Express Server  │
│  (or any HTTP)│                         │                  │
└──────────────┘                         │  ┌──────────────┐│
                                         │  │ Topography   ││
                                         │  │ Mesh Gen     ││
                                         │  └──────┬───────┘│
                                         │         │        │
                                         │         ▼        │
                                         │  ┌──────────────┐│
                                         │  │ GLTF Exporter││
                                         │  │ (→ .glb buf) ││
                                         │  └──────┬───────┘│
                                         │         │        │
                                         │    ┌────┴─────┐  │
                                         │    ▼         ▼  │
                                         │ ┌──────┐  ┌────┐│
                                         │ │MinIO │  │ DB ││
                                         │ │.glb  │  │meta││
                                         │ └──────┘  └────┘│
                                         │                  │
┌──────────────┐     GET /:modelId       └─────────────────┘
│  Unity Client │ ◄────────────────────── │  (stream from   │
│               │                         │   MinIO → HTTP) │
└──────────────┘                         └─────────────────┘
```

### Request Body Size Limit

The Express JSON parser limit is set to **50 MB** to accommodate large pixel arrays. A 1024×1024 image with RGBA data produces a ~17 MB JSON payload.

---

## Error Handling

All endpoints return JSON error responses with an `error` field. The server logs internal errors via Winston but never exposes stack traces to clients.

| Status | Meaning |
|---|---|
| `400` | Client sent invalid input (missing fields, bad heightMode) |
| `404` | Referenced model does not exist |
| `500` | Server-side failure (DB connection, MinIO upload, glTF generation) |
