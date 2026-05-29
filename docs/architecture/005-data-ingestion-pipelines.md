# SDD 005: Data Ingestion Pipelines

## Purpose

Vellum Rift ingests large manuscript inputs and transforms them into web-friendly, progressively loadable assets for Web and VR exploration. This document defines the server-side ingestion flow, memory strategy, and level-of-detail rules.

## Ingestion Flow

```text
[ Multi-Page PDF / TIFF / JPEG ]
            |
            v
 /api/documents/upload or related GlyphWitch upload flow
            |
            v
 [ Object Storage / Durable Upload Bucket ]
            |
            v
 [ Worker Trigger / Queue Event ]
            |
            v
 [ PDFium / LibTIFF / Image Processing Workers ]
            |
            +--> channel extraction: red, green, blue, contrast
            |
            +--> trace extraction or trace import alignment
            |
            v
 [ Chunked Mesh / .glb Export Pipeline ]
            |
            +--> exploration-ready asset manifests
            +--> level-of-detail outputs
            +--> session population metadata
            |
            v
 [ Persisted State + Progressive Client Delivery ]
```

## Source Inputs

- TIFF
- JPEG
- PDF, including multi-page documents
- imported or existing trace data from GlyphWitch

## Processing Goals

1. preserve enough detail for scholarly inspection
2. avoid exhausting server RAM during transformation
3. emit web-friendly outputs shared by Web and VR clients
4. support progressive loading while processing is still underway

## Worker Responsibilities

### File Normalization

- validate source format and page count
- extract page-level images from PDFs where needed
- normalize orientation, bounds, and metadata before deeper processing

### Channel Extraction

- derive red, green, blue, and contrast-oriented data products
- produce intermediate representations suitable for shader-driven exploration

### Trace Alignment

- align imported or existing trace data with the manuscript geometry
- preserve source provenance so trace-derived and user-authored content stay distinguishable

### Chunked Asset Export

- produce one or more `.glb` or related web-friendly payloads
- emit metadata that allows the client to know which chunks are available
- structure outputs for progressive scene population rather than all-at-once delivery

## Memory Management And Tiling

Large TIFFs and multipage PDFs must not be processed as single giant in-memory blobs when avoidable.

Recommended approach:

- stream or tile page content during extraction
- use pyramid or multiresolution tiling for high-resolution sources
- bound worker concurrency based on available RAM and CPU
- prefer chunk-level serialization over full-scene assembly in memory

Operational expectations:

- workers should enforce memory ceilings
- oversized jobs should degrade gracefully through reduced parallelism or staged processing
- processing progress should be visible to clients and operators

## Downsampling And Level Of Detail

Quest and browser builds cannot consume the same texture and geometry budgets as workstation-class systems.

Rules to define and enforce:

- generate LoD tiers for geometry and texture payloads
- default the Quest client to lower memory tiers unless the artifact budget is known safe
- allow the web client to scale quality by device capability where possible
- preserve a high-fidelity archival derivative for reprocessing if better client budgets arrive later

Suggested LoD dimensions:

- archival source derivative
- high desktop tier
- balanced web tier
- constrained Quest tier

## Persistence And Progress Reporting

- processing state should be persisted and queryable
- clients entering early should be able to render partial outputs safely
- final invite or ready-state transitions should happen only after minimum viable outputs exist

## Failure Handling

- failed page extraction should be isolated when possible rather than invalidating the whole document
- malformed or degraded sources should report diagnosable failure modes
- reprocessing should be possible without duplicating the original upload unnecessarily

## Follow-Up Work

1. define the asset manifest schema
2. define exact LoD budgets per target platform
3. decide queue and worker orchestration technology
4. define reprocessing and retry semantics for partial failures