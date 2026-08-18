# AGENT.md — Agentic Video Editor

## Mission

You are working on a **desktop-first, packaged, agentic video editor**.

The application lets humans and AI agents manipulate the same deterministic video-editing timeline.

The application uses FFmpeg as the rendering engine.

The AI feature follows a **Bring Your Own Model (BYOM)** architecture: users choose and pay their own AI provider/model. The application must remain provider-agnostic.

The core architecture is:

**User / AI → validated editing operations → timeline state → editing IR → FFmpeg compiler → FFmpeg**

The project must remain deterministic, reversible, inspectable, and safe for AI control.

---

# Non-negotiable architectural rules

## 1. Desktop from day one

This is a desktop application.

Do not create a web-only product as the primary runtime.

Use:

- Tauri 2 for packaging/runtime
- React + TypeScript for the UI
- Node.js + TypeScript for backend/application services

The application must work with local:
- files
- projects
- media
- FFmpeg
- FFprobe
- render jobs
- AI configuration

Do not introduce a hosted backend unless a future requirement explicitly needs one.

---

## 2. Timeline state is the source of truth

Never treat:
- rendered MP4 files
- FFmpeg command strings
- UI state
- AI messages

as canonical project state.

The canonical state is the serialized project/timeline model.

---

## 3. AI never executes arbitrary FFmpeg

The AI must not have:

- shell access
- arbitrary command execution
- direct filesystem mutation
- direct FFmpeg command execution

The AI interacts with typed editing tools.

Bad:

```ts
executeCommand("ffmpeg -i input.mp4 ...");
```

Good:

```ts
trimClip({
  clipId: "clip_123",
  start: 10,
  end: 30,
});
```

The backend validates the operation and updates the timeline.

---

## 4. Humans and AI use the same editing API

A button, keyboard shortcut, drag operation, automation, or AI action should ultimately produce the same operation type.

Do not create a separate “AI editing path.”

---

## 5. Keep the editor core independent

The core editing model must not depend on:

- React
- browser APIs
- Node process APIs
- FFmpeg
- Tauri
- a specific LLM provider
- provider-specific SDK types

The core should be testable in isolation.

---

## 6. FFmpeg is a compiler target

Do not scatter FFmpeg command construction throughout the application.

Use:

```text
Timeline
  ↓
Editing IR
  ↓
FFmpeg Compiler
  ↓
FFmpeg Runner
```

The compiler translates supported timeline state into FFmpeg execution.

---

## 7. AI is a provider abstraction

The application must support users choosing their own model provider.

Do not design the editor around one AI vendor.

The AI architecture should look like:

```text
             Agent
               │
        Provider-neutral API
               │
      ┌────────┼─────────┐
      ▼        ▼         ▼
   Provider  Provider  Local/custom
      A         B       endpoint
```

Provider-specific SDKs belong inside provider adapters.

Never allow provider-specific request/response types to leak into `editor-core`.

---

## 8. The application does not pay for model usage

The intended product model is BYOM.

The application should:
- let users enter/configure their own credentials
- call their chosen provider
- let the user pay the provider directly
- avoid routing AI requests through an application-owned billing/proxy backend

Do not introduce an application-owned AI API key by default.

---

# AI provider configuration

Users should be able to configure:

- provider name/type
- API endpoint
- API key
- model
- optional organization/project identifiers
- optional model parameters

Example conceptual configuration:

```ts
interface AIModelConfig {
  providerId: string;
  model: string;
  endpoint?: string;
  apiKey?: string;
  options?: Record<string, unknown>;
}
```

The exact schema can evolve.

### Security rules

Never:
- hardcode API keys
- commit credentials
- store secrets in source control
- store API keys in normal project files
- send API keys to an application-owned remote server

Prefer the operating system's secure credential/keychain storage for persisted secrets.

A project file should reference a provider/model configuration, not contain the secret itself.

---

# Provider architecture

Create a small provider-neutral interface.

Conceptually:

```ts
interface AIProvider {
  id: string;
  name: string;

  generate(request: AIRequest): Promise<AIResponse>;
}
```

Provider adapters implement this interface.

Start with:

1. OpenAI-compatible API adapter.
2. One reference hosted provider adapter.
3. Custom/local OpenAI-compatible endpoint support.

The architecture should make future adapters cheap to add.

Do not add every provider immediately.

---

# AI agent boilerplate

The initial AI feature is intentionally a **boilerplate agent**.

Do not build a complex autonomous agent before the editor core is stable.

The first agent should:

1. receive a user request;
2. read project/timeline information;
3. decide whether an available editing tool can satisfy the request;
4. call the tool;
5. receive structured tool results;
6. report the result.

The first tool set should be small:

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

Initially, the agent does not need:
- long-running autonomous planning
- complex memory
- embeddings
- multi-agent systems
- autonomous render pipelines
- sophisticated media understanding

Build those only after the basic agent works.

---

# Operation rules

Operations must be:

- typed
- validated
- deterministic
- reversible
- serializable where appropriate
- testable

Example:

```ts
type EditOperation =
  | {
      type: "split";
      clipId: string;
      at: number;
    }
  | {
      type: "trim";
      clipId: string;
      start: number;
      end: number;
    }
  | {
      type: "delete";
      clipId: string;
    };
```

Every operation must have enough information to:
- undo itself
- be logged
- be replayed
- be inspected by the UI
- be generated by the AI

---

# Initial supported operations

Implement these before advanced editing:

- import asset
- split clip
- trim clip
- delete clip
- move clip
- reorder clip
- duplicate clip
- mute clip
- set volume
- undo
- redo

Do not add new operations casually.

A new operation requires:
1. timeline representation;
2. validation;
3. deterministic application;
4. undo/reversal;
5. tests;
6. serialization/history behavior where relevant;
7. rendering strategy.

---

# Time model

Always distinguish:

- source time: position inside the original asset
- timeline time: position inside the project timeline

A clip can represent:

```text
source:   20s → 50s
timeline: 10s → 40s
```

Never assume these are interchangeable.

Use a clearly defined numeric internal time representation.

Do not use formatted strings such as:

```text
00:01:32
```

as the canonical internal representation.

---

# Project model

Initial conceptual model:

```text
Project
├── assets
├── tracks
│   ├── video tracks
│   └── audio tracks
├── clips
├── operations/history
└── metadata
```

Do not prematurely optimize the schema for every future editing feature.

---

# Backend

The backend is Node.js + TypeScript.

Responsibilities:

- filesystem operations
- FFmpeg process management
- FFprobe
- render jobs
- temporary files
- media metadata
- project persistence
- backend validation
- AI provider adapters
- AI tool execution

Do not put domain logic exclusively in backend infrastructure if it belongs in `editor-core`.

---

# Tauri boundary

Tauri is the desktop shell.

Keep the Tauri-specific integration thin.

The goal should be:

```text
React UI
   │
   ▼
Application services
   │
   ▼
Domain/editor core
```

Tauri-specific APIs should primarily handle desktop capabilities such as:
- packaging
- secure storage integration
- native file dialogs
- application lifecycle
- native filesystem integration where appropriate

Do not put core editing rules into Tauri commands.

---

# FFmpeg rules

FFmpeg should be invoked through a dedicated abstraction.

The rest of the application should not need to know:
- exact command-line syntax
- temporary filenames
- process IDs
- FFmpeg stderr parsing

A render request should conceptually look like:

```ts
renderProject(projectId, renderOptions);
```

not:

```ts
runFfmpeg(commandString);
```

The FFmpeg layer is responsible for converting a render plan into a safe process invocation.

Never construct shell commands by interpolating untrusted strings.

Prefer `spawn`/argument arrays over shell execution.

---

# Rendering and timeline state

Never allow a failed FFmpeg render to corrupt canonical timeline state.

The sequence should be:

```text
validate operation
→ apply operation to project state
→ save valid state
→ render asynchronously
```

A render failure is a render failure, not a timeline failure.

For speculative previews, use temporary project/render state rather than corrupting the saved project.

---

# AI confirmation policy

For simple deterministic edits, the application may apply an operation immediately.

For multi-step or destructive edits, prefer:

```text
User request
  ↓
Agent plan
  ↓
Proposed operations
  ↓
Validation
  ↓
User approval
  ↓
Apply
```

Regardless of confirmation policy, the final changes must be represented as reversible operations.

---

# Testing requirements

Prioritize tests for the editor core.

Every operation should have tests for:

- valid input
- invalid input
- resulting timeline
- undo
- replay
- serialization where applicable

Important invariant:

```text
apply(operation)
then undo(operation)
```

must restore the previous state.

Also test:

```text
serialize(state)
→ deserialize()
```

produces an equivalent state.

For FFmpeg:
- test command generation independently
- use small fixture media for integration tests
- don't require huge videos for normal CI

For AI:
- test provider adapters independently
- mock provider responses
- test tool schema validation
- test that model output cannot bypass editing operations

---

# Development priorities

Always prioritize:

1. Desktop application foundation.
2. Correctness of editor model.
3. Deterministic operations.
4. Undo/redo and history.
5. Persistence.
6. FFmpeg compilation/rendering.
7. Basic timeline UI.
8. AI provider/BYOM boilerplate.
9. AI tool integration.
10. Media intelligence.
11. Advanced editing.
12. Agentic workflows.

Do not reverse this order because an AI demo looks more impressive.

---

# Avoid premature complexity

Do not introduce yet:

- Rust
- separate cloud backend
- microservices
- cloud rendering
- collaboration
- plugin marketplace
- GPU-specific optimizations
- complex effects
- keyframes
- advanced transitions
- custom video codecs
- multi-agent architecture

The desktop app and Node backend are sufficient for the initial product.

---

# Code style

Prefer:

- small pure functions
- explicit types
- immutable state transitions
- dependency injection for external services
- domain logic isolated from infrastructure
- descriptive names
- focused modules
- provider-neutral interfaces

Avoid:

- giant editor classes
- global mutable state in the core
- hidden side effects
- raw FFmpeg commands spread across modules
- LLM-specific types leaking into the domain model
- provider SDKs imported by `editor-core`

---

# Suggested package boundaries

```text
apps/
└── desktop/
    ├── frontend/
    └── backend/

packages/
├── editor-core/
│   ├── project/
│   ├── timeline/
│   ├── operations/
│   ├── history/
│   └── serialization/
│
├── media/
│   ├── ffprobe/
│   ├── metadata/
│   └── assets/
│
├── ffmpeg/
│   ├── ir/
│   ├── compiler/
│   ├── runner/
│   └── render/
│
├── agent/
│   ├── tools/
│   ├── schemas/
│   ├── planning/
│   └── execution/
│
├── ai-providers/
│   ├── openai-compatible/
│   ├── adapters/
│   └── registry/
│
└── shared/
```

The exact directory structure may change.

The dependency direction should not.

---

# Definition of done for an operation

A new editing operation is not complete until it has:

- typed schema
- runtime validation
- deterministic application
- undo/reversal behavior
- serialization support if required
- history entry
- tests
- clear timeline representation
- rendering strategy or explicit documented limitation

---

# Definition of done for an AI provider

A provider adapter is not complete until it has:

- provider metadata
- configuration schema
- secure credential handling
- request translation
- response normalization
- error normalization
- model selection support where available
- tests with mocked responses
- no dependency from `editor-core`

---

# First task

Before sophisticated AI:

1. Initialize the TypeScript/pnpm project.
2. Initialize the Tauri desktop application.
3. Configure React + TypeScript + Vite.
4. Configure the Node.js + TypeScript backend.
5. Configure Vitest.
6. Add Zod.
7. Create `editor-core`.
8. Define `Project`, `Asset`, `Track`, `Clip`, and `Timeline`.
9. Define the first `EditOperation` union.
10. Implement operation application.
11. Implement undo/redo.
12. Write tests.
13. Implement serialization/deserialization.
14. Add a minimal FFprobe adapter.
15. Add a minimal FFmpeg runner behind an interface.
16. Build one end-to-end path:

```text
desktop app
→ import
→ split
→ delete
→ save
→ reload
→ render
```

Then implement the AI boilerplate:

17. Create provider configuration.
18. Add secure credential storage.
19. Create provider-neutral AI interfaces.
20. Implement one OpenAI-compatible adapter.
21. Add custom/local endpoint support.
22. Create the agent interface.
23. Add read-only timeline tools.
24. Add one editing tool.
25. Verify that a user-configured model can request an operation.
26. Verify that the timeline changes through the same operation system used by humans.

Do not build sophisticated autonomous AI before this path is deterministic.

---

# Working principle

When in doubt, ask:

> “Can this action be represented as a deterministic, validated, reversible operation on the timeline?”

If yes, it belongs in the editing operation system.

If no, do not bypass the model. Improve the model first.

For AI-related decisions, also ask:

> “Can the user use a different model/provider without changing the editor core?”

If no, the AI abstraction is too tightly coupled.
