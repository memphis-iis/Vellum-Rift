# User Stories

This file is the initial backlog seed, not the full 300-story plan. It establishes story format, epics, and enough stories to drive early milestone planning.

## Story Writing Standard

Each story should include:

- a unique ID
- milestone and sprint target
- role, goal, and outcome statement
- acceptance criteria
- dependencies or notes where needed

## Epic A: Ingestion And Processing

### VR-001

As a session owner, I want to upload TIFF, JPEG, or PDF manuscripts so the system can begin asynchronous preprocessing.

Acceptance criteria:

- supported formats are validated before processing
- the system records processing status for the uploaded manuscript
- the upload flow produces a session-ready document identifier

### VR-002

As a researcher, I want to enter a session while processing is still underway so I can explore as the environment populates.

Acceptance criteria:

- the client can load a partial session state
- processed content appears progressively as it becomes available
- incomplete processing is surfaced to the user clearly

### VR-003

As a session owner, I want an invite when processing completes so I can bring collaborators into a stable session.

Acceptance criteria:

- the system emits a completion notification
- the invite targets the correct session or document
- failed processing states are distinguishable from completed ones

## Epic B: Exploration And Controls

### VR-004

As a web user, I want WASD, mouse, and joystick controls so I can navigate the manuscript environment without a headset.

Acceptance criteria:

- keyboard movement is supported
- mouse look is supported
- joystick input is supported when available

### VR-005

As a VR user, I want joystick movement and a jetpack action so I can travel naturally through large-scale manuscript terrain.

Acceptance criteria:

- joystick locomotion is available in VR builds
- jetpack thrust is mapped to a dedicated control
- locomotion and jetpack behaviors are tunable

### VR-006

As a researcher, I want to choose my own palette or Z-axis interpretation so I can analyze the data independently from other users.

Acceptance criteria:

- palette changes are local to the client
- supported views include red, green, blue, and contrast
- local changes do not overwrite another participant's view

## Epic C: Shared Sessions

### VR-007

As a session lead, I want to summon the team to my position so I can focus the group on the same location.

Acceptance criteria:

- the lead can trigger a summon action
- other users are moved to the lead location
- the action is visible to all affected participants

### VR-008

As a participant, I want host authority to migrate automatically when the lead disconnects so the session can continue.

Acceptance criteria:

- host migration follows join order
- the next eligible participant receives host capabilities
- users are informed when host authority changes

### VR-009

As a participant, I want out-of-bounds protection so I do not get lost in empty space.

Acceptance criteria:

- the system warns before forced recovery
- recovery can target the lead or a save point
- recovery behavior works in Web and VR clients

## Epic D: Communication

### VR-010

As a participant, I want spatial voice chat so nearby teammates sound local to the space.

Acceptance criteria:

- audio attenuation is distance-based
- audio positions track participant locations
- the system supports multiple simultaneous users

### VR-011

As a participant, I want a global radio mode so I can address the entire team regardless of distance.

Acceptance criteria:

- a user can enter global broadcast mode
- global mode bypasses spatial attenuation
- the receiving experience is clear and distinct

### VR-012

As a participant, I want text and speech bridging so VR and desktop users can communicate with less friction.

Acceptance criteria:

- speech can be turned into visible text
- text can be turned into spoken output
- the bridge works across supported clients
- the MVP uses self-hosted STT and TTS services
- the default MVP implementation uses Faster-Whisper and Piper

### VR-019

As a user of the deterministic document analysis bot, I want provenance-tagged answers so I can trust that outputs came from specific stored sources rather than generative invention.

Acceptance criteria:

- bot responses identify the source table or record used to construct the reply
- exported bot analysis retains a provenance label
- the system language clearly describes the bot as deterministic rather than generative

## Epic E: Persistence And Artifacts

### VR-013

As a participant, I want to drop persistent coordinate pins so findings remain available in later sessions.

Acceptance criteria:

- a pin stores coordinates
- persisted pins reload in later sessions
- pins are visible to participants with access

### VR-014

As a participant, I want to edit or delete session pins regardless of creator so the team can curate findings collaboratively.

Acceptance criteria:

- any authorized team member can edit a pin
- any authorized team member can delete a pin
- pin changes are reflected for other participants

### VR-015

As a session owner, I want to export session artifacts so the team can archive and analyze findings outside the app.

Acceptance criteria:

- export includes non-PII research artifacts and related metadata
- export is available in a structured format
- exported data can be traced to the source session
- export excludes or redacts user PII by default

### VR-015A

As a participant, I want save points to be stored as a distinct artifact type so navigation recovery and team regrouping can use them predictably.

Acceptance criteria:

- save points are distinguishable from pins in persisted data
- recovery flows can target save points explicitly
- save points can be restored when a session is reloaded

## Epic F: Spatial Authoring

### VR-016

As a VR user, I want to create new strokes in 3D space so I can mark paths, reconstruct shapes, or call attention to traces.

Acceptance criteria:

- draw mode exists in VR
- new stroke points render while drawing
- completed strokes can be persisted
- the MVP does not require desktop stroke authoring

### VR-017

As a collaborator, I want to see a teammate's stroke appear while it is being drawn so we can work together in real time.

Acceptance criteria:

- in-progress stroke points are streamed to peers
- peers can render the in-progress stroke without waiting for final save
- a completed stroke is reconciled with persisted data after draw end

### VR-018

As a participant, I want stored document traces and newly created strokes to coexist in the same environment so I can compare source-derived and user-authored data.

Acceptance criteria:

- document traces load into the same session as user-created strokes
- source and authored strokes are distinguishable
- both kinds of artifacts can be restored on session re-entry

## Backlog Expansion Rules

To reach a full multi-hundred-story backlog, split stories further by:

- platform-specific behavior
- failure handling
- moderation and permissions
- analytics and telemetry
- accessibility cases
- performance and distribution requirements