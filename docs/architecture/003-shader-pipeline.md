# SDD 003: Local Shader Pipeline For Z-Axis Exploration

## Context

Researchers need to inspect the same manuscript through different visual interpretations without forcing the entire room into a single rendering mode.

## Decision

Use client-local shader controls to drive vertex displacement and visual palette changes from the same underlying asset.

## Behavior

- The manuscript-derived asset is loaded once.
- The client selects a local palette or channel interpretation.
- The shader derives displacement or emphasis from the selected input channel.
- No network event is required for ordinary local palette changes.

## Expected Inputs

- source texture or image-derived data
- target channel selection such as red, green, blue, or contrast
- displacement scale
- optional clipping or threshold values

## Rendering Notes

- Web and VR should consume the same source asset formats.
- GPU-side work should be preferred to CPU mesh rewrites for interactive palette changes.
- The shader path should degrade gracefully for lower-end web targets.

## Follow-Up Work

1. define the exact asset contract for channel data
2. define contrast and threshold semantics consistently across clients
3. determine fallback behavior when only partial processing is complete