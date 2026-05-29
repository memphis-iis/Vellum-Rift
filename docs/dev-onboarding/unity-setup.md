# Unity Setup

This document captures the current setup expectations for the Unity client workstream.

## Target Roles

- XR engineers building Quest and SteamVR behaviors
- client engineers supporting WebGL delivery
- rendering engineers working on shader and asset pipelines

## Build Targets

- WebGL for hosted web access
- Android-based Quest build
- desktop VR build for Steam distribution

## Core Input Expectations

- Web uses WASD, mouse, and joystick support.
- VR uses joystick locomotion and a jetpack action.
- Drawing support should begin with VR-first authoring.

## Implementation Constraints

1. Shared state models should come from backend-generated contracts rather than manually duplicated network models.
2. Browser-specific behavior for WebGL should be isolated behind plugin boundaries.
3. Asset loading should prefer the same web-friendly formats across Web and VR.
4. Palette and shader controls should remain client-local unless explicitly designed as shared state.

## First Client Workstreams

- flight controller abstraction for Web and VR
- progressive asset loading for partially processed sessions
- local palette switching and shader controls
- radar and session-awareness HUDs
- realtime display of participant movement and in-progress strokes