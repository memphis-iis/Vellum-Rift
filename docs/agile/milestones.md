# Milestones And Sprint Plan

## Planning Assumptions

- Sprint length: 2 weeks.
- Initial roadmap: 10 sprints.
- Delivery model: Web, Meta Quest, and SteamVR from a shared product definition.
- GlyphWitch is the starting point for authentication, teams, permissions, chat, documents, and annotations.

## Milestone 1: Asset Pipeline And Solo Exploration

Sprints 1-3

Goal: users can upload supported files, enter a session while processing runs or after invite, and explore generated assets locally on web and VR clients.

Primary outcomes:

- asynchronous preprocessing pipeline
- web-friendly asset delivery
- baseline flight controls across web and VR
- local palette and Z-axis exploration

## Milestone 2: Session Persistence And Shared Coordination

Sprints 4-5

Goal: teams can enter the same session, preserve room state, transfer host authority, and use summon behavior and spatial artifacts.

Primary outcomes:

- durable session model
- host migration by join order
- summon team behavior
- pins, save points, and exportable session artifacts

## Milestone 3: Realtime Communication And Accessibility

Sprints 6-7

Goal: teams can communicate naturally across Web and VR with radar, text chat, spatial voice, radio mode, and speech bridging.

Primary outcomes:

- WebRTC voice and movement channels
- radar on web and visor HUD in VR
- text chat and voice integration
- speech-to-text and text-to-speech bridge

## Milestone 4: Collaborative Spatial Authoring And Release Readiness

Sprints 8-10

Goal: teams can create new strokes in space, reuse document traces, and prepare the product for production distribution.

Primary outcomes:

- realtime collaborative stroke creation
- durable completed stroke storage
- optimization for web and Quest constraints
- store and hosting readiness

## Documentation Rule

Each milestone should end with updated architecture docs, backlog refinement, and acceptance criteria review before the next milestone begins.