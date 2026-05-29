# Crossplay Test Harness

## Purpose

Vellum Rift requires verification across desktop input, browser delivery, Quest interaction, realtime voice, and persisted collaboration state. This document defines the QA strategy and harness expectations for those mixed conditions.

## Test Categories

### Client Input And Navigation

- desktop keyboard and mouse navigation
- joystick support on the web client
- VR joystick locomotion and jetpack behavior
- out-of-bounds warning and recovery

### Realtime Collaboration

- summon-team behavior
- host migration by join order
- radar visibility and participant updates
- spatial voice and global radio mode
- in-progress stroke streaming

### Persistence And Recovery

- pin creation, editing, and deletion
- save point creation and recovery targeting
- stroke persistence after draw completion
- session export correctness

## Headset-Less VR Testing

Unity developers should be able to simulate core XR interactions without wearing a headset for every iteration.

Expected harness capabilities:

- input simulation for movement and jetpack controls
- controller pose simulation for drawing flows
- editor-time validation for menu and HUD interactions

The preferred first-pass approach is to support editor-side XR input simulation or device-simulator workflows so feature iteration is not blocked on physical hardware availability.

## Network Jitter And Latency Emulation

Realtime collaboration must be tested under degraded network conditions, not only ideal local networks.

Minimum scenarios:

- packet loss between 5 percent and 15 percent
- increased latency and jitter on voice and data channels
- brief disconnect and reconnect during stroke completion
- delayed subscription updates while realtime channels remain alive

Validation goals:

- voice remains intelligible or degrades gracefully
- in-progress drawing remains usable under expected packet loss
- participant state recovers without corrupting persisted room state

## Idempotency And Conflict Resolution

The existing `sync_idempotency` pattern in GlyphWitch should inform Vellum Rift durability behavior.

Validation scenarios:

- duplicate completed stroke submission after a reconnect
- repeated pin or save point mutation due to client retry
- host migration race conditions during partial disconnects
- summon-team event replays after transient reconnection

Expected outcomes:

- duplicate durable writes are rejected or reconciled cleanly
- realtime temporary duplication does not become persistent corruption
- room leadership settles deterministically

## Cross-Platform Session Matrix

Minimum pairings to test:

- Web plus Web
- Web plus Quest
- Web plus SteamVR
- Quest plus Quest
- Quest plus SteamVR

## Test Artifacts

- stable seed documents for repeatable ingestion tests
- representative heavy TIFF and multi-page PDF fixtures
- representative trace data for alignment verification
- scripted session scenarios for regression testing

## Follow-Up Work

1. define automated versus manual coverage boundaries
2. define replayable network impairment profiles
3. define minimum supported browser matrix
4. define capture and triage workflow for headset-specific defects