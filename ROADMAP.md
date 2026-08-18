# Agentic Video Editor — Roadmap

## Product vision

Build a **desktop-first, packaged, agentic video editor** where humans and AI edit the same deterministic timeline model.

The application is installed and runs as a desktop product from the beginning. There is no web-app-first architecture.

The AI feature is a **bring-your-own-model (BYOM)** capability. The application does not require a bundled AI provider or pay for model usage on behalf of users. Users configure the AI provider, endpoint, model, and credentials they want to use.

FFmpeg is the rendering engine, not the source of truth.

The core architecture is:

**User / AI → validated editing operations → timeline state → editing IR → FFmpeg compiler → FFmpeg**

---

# Product principles

## 1. Desktop from day one

The project is developed and tested as a desktop application from the first milestone.

Recommended shell:

- Tauri 2

The frontend can still use normal web technologies:

- React
- TypeScript
- Vite

The backend/runtime is:

- Node.js
- TypeScript

The desktop application owns:
- local files
- project storage
- media processing
- FFmpeg
- FFprobe
- render jobs
- local AI configuration

There is no requirement for a hosted backend for the core product.

---

## 2. Bring Your Own Model (BYOM)

AI is a provider-agnostic feature.

Users should be able to connect the model/provider they want and pay the provider directly.

The editor should not:

- require a proprietary AI subscription
- proxy model requests through a company-owned backend
- store provider credentials in a remote service
- lock the user to one model provider

The initial AI layer should be a **boilerplate abstraction**, not a deeply integrated AI product.

The first version should demonstrate:

```text
User
 ↓
AI Provider Configuration
 ↓
AI Adapter
 ↓
Agent
 ↓
Editing Tools
 ↓
Timeline
```

The provider layer should support configurable providers such as:

- OpenAI-compatible APIs
- Anthropic-compatible APIs
- Google/Gemini-compatible APIs
- local models
- custom OpenAI-compatible endpoints

The architecture should make adding another provider an adapter-level change rather than an editor-core change.

---

# Core architectural principle

**Timeline state is the source of truth.**

Never treat:
- rendered MP4 files
- FFmpeg command strings
- UI state
- AI messages

as canonical project state.

The canonical state is the serialized project/timeline model.

---

# Phase 0 — Desktop foundation and editor core

## Goals

Establish the actual desktop application immediately and build the deterministic editor domain underneath it.

### Deliverables

- Tauri 2 desktop shell.
- React + TypeScript frontend.
- Node.js + TypeScript backend.
- pnpm workspace.
- TypeScript project configuration.
- Vitest.
- Zod.
- Project/domain model.
- `Project`, `Asset`, `Track`, `Clip`, and `Timeline`.
- `EditOperation` discriminated union.
- Operation validation.
- Immutable operation application.
- Undo/redo history.
- Project serialization/deserialization.
- Initial desktop file access.
- Unit tests for editor core.

### Exit criteria

A packaged desktop application can create a project and manipulate its timeline entirely through deterministic operations.

---

# Phase 1 — Basic desktop editor

Create the smallest usable video editor.

## Operations

- import asset
- split clip
- trim clip
- delete clip
- move clip
- reorder clips
- duplicate clip
- mute clip
- set volume
- undo
- redo

## UI

- media bin
- video player
- timeline
- playhead
- clip selection
- split/delete controls
- basic drag interactions
- trim handles
- keyboard shortcuts

## Exit criteria

A user can install/run the desktop application, import a video, edit it, undo/redo changes, and save the project.

---

# Phase 2 — Media inspection and FFmpeg integration

## Goals

Connect the deterministic editor model to real media.

## Deliverables

- FFprobe integration.
- Asset metadata extraction.
- FFmpeg process manager.
- Temporary working directory management.
- FFmpeg command abstraction.
- Editing Intermediate Representation (IR).
- FFmpeg compiler.
- Render progress.
- Render cancellation.
- Error reporting.

## Initial render support

- trim
- concatenate
- audio preservation
- mute
- volume
- basic scaling

## Exit criteria

Every supported timeline edit can be compiled into reproducible FFmpeg execution and produces the expected output.

---

# Phase 3 — Render architecture

Separate interactive editing from expensive rendering.

## Deliverables

- preview render pipeline
- final render pipeline
- render queue
- render job state machine
- cancellation
- retries
- temporary artifact cleanup
- render cache strategy
- deterministic render manifests

### Important rule

Timeline interaction must not depend on completing a full-quality render.

---

# Phase 4 — AI boilerplate / BYOM foundation

The first AI implementation should be intentionally small.

Do **not** attempt to build an autonomous video-editing agent yet.

## Goals

Create the interfaces and configuration system needed for users to connect their own AI model.

## AI provider abstraction

Define a provider-neutral interface similar to:

```ts
interface AIProvider {
  id: string;
  name: string;

  listModels?(): Promise<ModelInfo[]>;

  generate(request: AIRequest): Promise<AIResponse>;
}
```

The exact interface can evolve, but provider-specific SDK types must not leak into the editor core.

## Configuration

Users should be able to configure:

- provider
- API endpoint
- API key
- model
- optional organization/project identifiers
- model-specific settings where appropriate

Credentials should be stored securely using the desktop operating system's credential/keychain facilities where practical.

Never commit credentials to the project.

Never put API keys into project files.

## Initial provider strategy

Prioritize:

1. OpenAI-compatible provider interface.
2. One reference hosted provider adapter.
3. Local/custom endpoint support.

Additional provider adapters should be easy to add later.

The editor should not depend on one provider.

## Initial AI agent

The agent should have only a small set of tools:

```text
getProject()
getTimeline()
getAssets()
getClip()

splitClip()
trimClip()
deleteClip()
moveClip()
reorderClip()
duplicateClip()
muteClip()
setVolume()
undo()
redo()
```

Initially, the agent can be a simple tool-calling loop.

No sophisticated autonomous planning is required.

## Exit criteria

A user can configure their own AI provider/model, send a simple editing request, and have the model call validated editor tools.

The application itself does not pay for model inference.

---

# Phase 5 — AI context and media understanding

Add structured information that makes AI editing useful:

- transcript
- word timestamps
- silence detection
- scene/shot detection
- thumbnails
- waveform
- clip semantic metadata

Example capabilities:

- “Remove the long pauses.”
- “Cut the part where I talk about the sponsor.”
- “Find every time I say product.”
- “Keep the section between these two topics.”

Media analysis produces structured data.

The agent still modifies the timeline only through editing operations.

---

# Phase 6 — Expanded editing primitives

## Video

- crop
- resize
- rotate
- flip
- speed
- freeze frame
- opacity
- fade in/out

## Audio

- audio extraction
- audio replacement
- fade in/out
- background music
- audio gain

## Text

- add text
- edit text
- position
- size
- font
- color
- duration

## Timeline

- multiple video tracks
- multiple audio tracks
- overlays
- transitions
- snapping
- markers

---

# Phase 7 — Agentic workflows

Move from single commands to plans.

Example:

> Turn this podcast into a 60-second vertical clip.

The agent can eventually:

1. inspect transcript
2. identify candidate sections
3. select clips
4. remove pauses
5. reorder clips
6. crop to 9:16
7. add captions
8. preview
9. ask for approval
10. render

Every step remains a validated operation.

---

# Phase 8 — Advanced editor

Potential future work:

- keyframes
- effects
- color adjustments
- masks
- captions styling
- motion tracking
- proxy media
- GPU acceleration
- project versioning
- plugin system

Do not start these until the operation model and rendering architecture are stable.

---

# Recommended stack

## Desktop

- Tauri 2

## Frontend

- React
- TypeScript
- Vite
- Zustand initially
- XState only where explicit state-machine behavior is useful

## Backend

- Node.js
- TypeScript

## Media

- FFmpeg
- FFprobe

## Persistence

- SQLite

## Validation

- Zod

## Testing

- Vitest
- Playwright for desktop/UI E2E once the UI is mature

## Package management

- pnpm

## AI

- provider-agnostic TypeScript interfaces
- tool calling
- BYOM configuration
- adapter-based provider architecture

---

# Recommended repository shape

```text
agentic-video-editor/
├── apps/
│   └── desktop/
│       ├── frontend/
│       └── backend/
├── packages/
│   ├── editor-core/
│   ├── project-schema/
│   ├── operations/
│   ├── media/
│   ├── ffmpeg/
│   ├── agent/
│   ├── ai-providers/
│   └── shared/
├── tests/
├── docs/
├── AGENT.md
├── ROADMAP.md
├── package.json
└── pnpm-workspace.yaml
```

The exact structure can change during implementation. The dependency direction should remain:

```text
editor-core
    ↑
UI / agent / backend adapters

FFmpeg
    ↑
render/compiler integration

AI providers
    ↑
agent adapter layer
```

The editor core should remain the least coupled package.

---

# First implementation milestone

Do not begin with sophisticated AI.

Build this first:

1. Launch the packaged desktop application.
2. Create project.
3. Import one video.
4. Read metadata with FFprobe.
5. Represent it as an asset and clip.
6. Split the clip.
7. Delete one segment.
8. Move segments.
9. Undo/redo.
10. Serialize project.
11. Restore project.
12. Compile the timeline to a minimal FFmpeg render.
13. Verify rendered output against expected timeline state.

Then add the AI boilerplate:

14. Create provider configuration.
15. Store credentials securely.
16. Add one provider adapter.
17. Add an agent interface.
18. Add read-only timeline tools.
19. Add one editing tool.
20. Verify a model can request an operation and the timeline changes.

---

# Definition of done for the MVP

The MVP is successful when:

- The application is packaged as a desktop application.
- A project has a deterministic serialized timeline.
- Every edit is represented as a validated operation.
- Undo/redo is operation-based.
- Human edits and AI edits use the same operation API.
- No AI tool can execute arbitrary shell/FFmpeg commands.
- Timeline state can be compiled to an FFmpeg render.
- Rendering happens asynchronously.
- Render failures do not corrupt timeline state.
- A project can be saved and restored.
- A user can configure their own AI provider/model.
- AI credentials are not sent to an application-owned server.
- The AI provider layer is replaceable.
- The application itself does not require a bundled paid AI service.
- Tests cover editor-core and operation semantics.
