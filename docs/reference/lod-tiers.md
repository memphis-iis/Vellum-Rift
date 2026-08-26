# LoD Tiers (IMPL-005)

Level of Detail (LoD) tiers define platform-specific budgets for mesh generation and asset delivery. Clients specify a tier when requesting assets to receive appropriately optimized models.

## Endpoint

```
GET /api/lod-tiers          # List all available tiers
GET /api/lod-tiers/:tier    # Get budget for a specific tier
```

## Tier Definitions

| Tier | Target Platform | Max Vertices | Texture Size | Height Scale | Use Case |
|------|----------------|--------------|--------------|--------------|----------|
| `archival` | Reference/Storage | Unlimited | 4096×4096 | 1.0 | Research, printing, reference |
| `high` | Desktop WebGL, SteamVR | 2,000,000 | 2048×2048 | 1.5 | High-end displays |
| `balanced` | Standard WebGL, mobile browsers | 500,000 | 1024×1024 | 1.2 | Default web experience |
| `quest` | Meta Quest 2/3 | 100,000 | 512×512 | 0.8 | VR headset (strict budgets) |

## Example: List Tiers

```json
{
  "tiers": [
    {
      "tier": "archival",
      "maxVertices": null,
      "maxTextureSize": 4096,
      "heightScale": 1.0,
      "targetPlatform": "reference/storage"
    },
    {
      "tier": "quest",
      "maxVertices": 100000,
      "maxTextureSize": 512,
      "heightScale": 0.8,
      "targetPlatform": "meta-quest"
    }
  ],
  "defaultTier": "balanced"
}
```

## Example: Get Specific Tier

```
GET /api/lod-tiers/quest
```

```json
{
  "tier": "quest",
  "maxVertices": 100000,
  "maxTextureSize": 512,
  "heightScale": 0.8,
  "targetPlatform": "meta-quest"
}
```

## Using LoD with Asset Manifests

When fetching an asset manifest, clients can request a specific LoD tier:

```
GET /api/assets/:assetId/manifest?tier=quest
```

This returns the manifest filtered to only include the requested tier's chunk data.

## Budget Validation

The backend provides utility functions for budget enforcement during mesh generation:

- `validateBudget(vertexCount, tier)` — checks if a mesh is within budget
- `calculateSubsampleFactor(vertexCount, tier)` — calculates subsampling ratio needed to meet budget

## Default Behavior

When no tier is specified, the backend uses `balanced` as the default. Clients should explicitly request their target tier for optimal performance.
