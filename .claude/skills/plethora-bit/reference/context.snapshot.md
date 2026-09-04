# Plethora Bit Agent Context

Version: plethora-agent-context-2026-08-13.1

Plethora Bits are tiny mobile-first interactive objects: games, puzzles, interactive art, fidget toys, music toys, educational activities, sensory experiences, and other small playful systems. Agents should be able to create them with no local starter repo as long as they follow this contract.

## Current Flow

1. Fetch /v1/agent/context.md or /v1/agent/context.json before creating code.
2. Before writing code, fetch /v1/agent/sdk.md and /v1/agent/schema.json. Treat those split resources as the current implementation and validation references.
3. Fetch /v1/agent/libraries.json before choosing any dependency or font. Do not guess registry URLs, versions, globals, or filenames.
4. Build a mobile-first bit using only the SDK and contract described by the agent resources. If any local starter, skill, or memory disagrees with these endpoints, these endpoints win.
5. Validate the manifest and source locally if the agent has a validator; otherwise keep to the schema endpoint exactly.
6. Pair with the creator at https://create.plethora.studio/agent-pair before uploading drafts. Public publish is intentionally manual from the app or dashboard.

Creator web guide: https://create.plethora.studio

## Current Sensor Status

Camera, microphone/audio-reactive, and motion capabilities are available in native Plethora builds. Use them only for intentional mechanics, declare matching permissions, start from a user gesture, stop them on cleanup, and always provide denied-permission fallback UI.

## Required Resource Reads

`context.md` is standalone and embeds the current SDK reference, but agents should still fetch these split resources before implementation and final validation:

- `/v1/agent/sdk.md` - exact public `ctx` surface and runtime rules.
- `/v1/agent/schema.json` - machine-readable manifest/schema, permissions, memory contract, limits, and validation constants.
- `/v1/agent/libraries.json` - approved pinned libraries, fonts, URLs, SHA-256 hashes, sizes, MIME types, and globals/kinds.

If `context.md`, `sdk.md`, and `schema.json` have different `contextVersion` values, stop and report the mismatch instead of guessing.

## Available Endpoints

- GET /v1/agent (available, auth: none) - Discover the creator-agent workflow and all agent resources.
- GET /v1/agent/context.md (available, auth: none) - Fetch the complete standalone bit-making instructions.
- GET /v1/agent/schema.json (available, auth: none) - Fetch the current public bit contract schema.
- GET /v1/agent/libraries.json (available, auth: none) - Fetch approved library and font metadata.
- POST /v1/agent/pair/sessions (available, auth: none) - Create a short-lived pairing code for an agent without exposing a Supabase token.
- POST /v1/agent/pair/claim (available, auth: user_session) - Approve pairing from the mobile app or web dashboard.
- POST /v1/agent/pair/lookup (available, auth: user_session) - Show the creator the pending agent identity and requested scopes before approval.
- POST /v1/agent/pair/sessions/:sessionId/exchange (available, auth: agent_pairing_secret) - Poll/exchange an approved pairing session using the session secret. On approval, read data.accessToken exactly once and reuse it for future draft uploads until revoked or expired.
- POST /v1/agent/bits/drafts (available, auth: agent_access_token) - Upload or update a draft bit for the paired user. Publish remains manual.
- GET /v1/agent/tokens (available, auth: user_session) - List paired coding agents for the signed-in creator.
- DELETE /v1/agent/tokens/:tokenId (available, auth: user_session) - Revoke a paired coding agent token. Publishing remains manual.

## Pairing And Upload Auth

Agents must pair before uploading drafts. Pairing is durable: the creator approves once, then the agent reuses `data.accessToken` for future draft uploads until the creator revokes it or it expires. Only the bootstrap exchange is one-time:

1. Call `POST /v1/agent/pair/sessions`.
2. On a web-based coding agent, render the returned `pairingQrPayload` as a QR code and also show `pairingCode` as fallback. Scanning `pairingUrl` or `pairingQrPayload` on a phone opens Plethora -> Create -> Connect agent with the code pre-filled. A creator using web can open `approvalUrl` and enter the fallback code.
3. Do not ask for username, email, password, Supabase credentials, or OAuth login. The app approval binds the agent to the creator already signed in on their device.
4. Poll `POST /v1/agent/pair/sessions/:sessionId/exchange` with the private `sessionSecret`.
5. When the response status is `approved`, save `data.accessToken` immediately.
6. Use `Authorization: Plethora-Agent <data.accessToken>` for draft upload now and future draft uploads.

Do not look for `agentToken`. The token field is exactly `accessToken`, nested under `data` in the standard API envelope. The approved exchange consumes the session, so a second exchange call will not return the token again. The saved access token is the durable pairing.

Approved exchange response shape:

```json
{
  "ok": true,
  "data": {
    "status": "approved",
    "sessionId": "11111111-1111-4111-8111-111111111111",
    "expiresAt": "2026-06-20T22:00:00.000Z",
    "accessToken": "plag_example_one_time_visible_token",
    "tokenId": "22222222-2222-4222-8222-222222222222",
    "tokenExpiresAt": "2026-06-21T22:00:00.000Z",
    "scopes": [
      "bits:draft:write"
    ]
  },
  "requestId": "request-id",
  "serverTime": "2026-06-20T21:00:00.000Z"
}
```

Pending exchange response shape:

```json
{
  "ok": true,
  "data": {
    "status": "pending",
    "sessionId": "11111111-1111-4111-8111-111111111111",
    "expiresAt": "2026-06-20T22:00:00.000Z",
    "scopes": [
      "bits:draft:write"
    ]
  },
  "requestId": "request-id",
  "serverTime": "2026-06-20T21:00:00.000Z"
}
```

## Draft Upload Request

Upload drafts with `POST /v1/agent/bits/drafts`.

- Header: `Authorization: Plethora-Agent <data.accessToken>`
- Content-Type: `application/json`

Body shape:

- `title`: string fallback used only when manifest.title is missing; final title is required
- `description`: optional string fallback used only when manifest.description is missing
- `tags`: optional string[] fallback used only when manifest.tags is missing
- `source`: required JavaScript source string defining window.plethoraBit
- `manifest`: plethora.json object; strongly recommended for every upload; title, runtime, entry, permissions, dependencies, assets, and memory are validated and normalized
- `generated`: optional boolean; true when coding agent generated the draft

Request example:

```json
{
  "title": "Touch Sketch",
  "description": "A tiny touch-reactive Plethora Bit.",
  "tags": [
    "creative",
    "touch"
  ],
  "source": "window.plethoraBit = { async init(ctx) { const canvas = ctx.createCanvas2D(); ctx.platform.ready(); } };",
  "manifest": {
    "schemaVersion": 1,
    "runtime": "plethora-bit@2",
    "entry": "main.js",
    "title": "Touch Sketch",
    "description": "A tiny touch-reactive Plethora Bit.",
    "tags": [
      "creative",
      "touch"
    ],
    "permissions": [
      "haptics"
    ],
    "dependencies": []
  },
  "generated": true
}
```

Success response shape:

```json
{
  "ok": true,
  "data": {
    "action": "created | updated | draft_revision",
    "bit": "{ id, title, description, tags, source, manifest, runtime_version, ... }",
    "packageHash": "sha256:<64 hex chars>",
    "packageBytes": 12345
  },
  "requestId": "request-id",
  "serverTime": "2026-06-20T21:00:00.000Z"
}
```

Failure notes:

- 401 means missing Plethora-Agent token.
- 403 means invalid, expired, revoked, or wrong-scope agent token.
- 409 means creator already has an active bit with that title where current path cannot update it.
- 400 means manifest/source contract validation failed. Fix source and manifest, then upload again.

## Manifest Contract

This section is generated from the executable bit contract. If it disagrees with `/v1/agent/schema.json`, stop and report contract drift.

- Runtime: plethora-bit@2
- Manifest schema version: 1
- Runtime global: `window.plethoraBit`
- Entry default: `main.js`
- Package size limit: 2097152 bytes
- Packaged assets: max 0
- Approved library host: libs.plethora.studio
- Permissions: `audio`, `backgroundMusic`, `camera`, `haptics`, `microphone`, `motion`, `storage`
- Memory families: `local`, `records`, `tallies`, `worlds`


Minimal `plethora.json`:

```json
{
  "schemaVersion": 1,
  "runtime": "plethora-bit@2",
  "entry": "main.js",
  "title": "Touch Sketch",
  "description": "A tiny touch-reactive Plethora Bit.",
  "tags": [
    "creative",
    "touch"
  ],
  "permissions": [
    "haptics"
  ],
  "dependencies": []
}
```

## SDK

Define `window.plethoraBit = { meta?, async init(ctx) {} }`.

### Agent Rules
- Treat this SDK reference as the complete public surface. Do not invent ctx methods, manifest fields, endpoints, or response keys.
- If you started from context.md, still fetch /v1/agent/sdk.md and /v1/agent/schema.json before final code/manifest validation. All three should share the same contextVersion.
- Use ctx helpers for DOM/canvas, events, frame loops, media, storage, registry libraries, platform events, audio, and memory. Avoid raw document/body/script patterns unless explicitly allowed below.
- Camera, microphone/audio-reactive, and motion features are permission-gated native capabilities. Do not make them the default solution without creator intent; always provide a fallback.
- Every permission-gated API must have the matching manifest permission. Check ctx.capabilities before optional features and show a graceful fallback.
- DOM text inputs default to host keyboard avoidance on iOS. If a bit fully manages its own keyboard layout, set window.plethoraBit.meta.keyboardBehavior = "none"; otherwise leave it unset.
- Call ctx.platform.ready() only after first visible render or after calling ctx.markVisualReady(reason). Call ctx.platform.start() from the first real user gesture.

### Runtime Shell
- ctx.container -> HTMLElement owned by Plethora. Read-only target; prefer ctx.createRoot/createCanvas2D/createCanvas instead of appending directly.
- ctx.width, ctx.height -> current container size in CSS pixels. ctx.createCanvas2D() already applies ctx.dpr to its backing store, so use ctx.width/ctx.height for all drawing coordinates; canvas.width/canvas.height are physical pixels only.
- ctx.dpr -> runtime DPR used for Plethora-created 2D canvases; ctx.nativeDpr -> browser devicePixelRatio.
- ctx.safeArea -> { top, bottom, left, right }. Keep heavy controls away from ctx.safeArea.bottom.
- ctx.manifest -> normalized plethora.json manifest.
- ctx.runtime -> { version: "plethora-bit@2", schemaVersion: 1 }.
- ctx.capabilities -> booleans for audio, backgroundMusic, camera, haptics, microphone, motion, storage.
- ctx.markVisualReady(reason?) -> tells host that the Bit has produced a visible first frame.
- window.plethoraBit.meta.keyboardBehavior -> optional "auto" | "avoid" | "none". Default auto lifts focused visible text inputs above the iOS keyboard; none opts out for self-managed layouts.

### Surfaces
- ctx.createRoot({ className?, touchAction?, style? }?) -> HTMLElement absolutely filling the bit container; auto-removed on cleanup.
- ctx.createCanvas2D({ touchAction? }?) -> HTMLCanvasElement with DPR-correct backing store and 2D context already scaled to CSS pixels.
- ctx.createCanvas({ touchAction? }?) -> HTMLCanvasElement for WebGL, WebGL2, Three, Pixi, OGL, regl, Babylon, and custom renderers.

### Lifecycle And Platform Events
- ctx.platform.ready(payload?) -> hide loader and notify host. Call after first visible render, not before drawing.
- ctx.platform.start(payload?) -> first real user gesture. Use once when play begins.
- ctx.platform.interact(payload?) -> meaningful action such as tap, drag, choice, vote, score, mutation, replay.
- ctx.platform.setScore(score, payload?) -> current score for score-bearing games.
- ctx.platform.setProgress(value, payload?) -> 0..1 progress for finite experiences.
- ctx.platform.milestone(name, payload?) -> named moment such as level_clear, combo, ten_seconds.
- ctx.platform.complete(payload?) -> natural ending/win/survey submitted/finished state.
- ctx.platform.fail(payload?) -> failure/game-over state.
- ctx.platform.error(payload?) -> recoverable runtime issue visible to host/analytics.
- ctx.platform.emit(name, payload?) -> custom analytics event.
- ctx.platform.haptic('light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error') -> requires haptics permission.

### Events, Frames, Timers, Cleanup
- ctx.listen(target, eventName, handler, options?) -> addEventListener plus automatic remove on cleanup. Use this for all event listeners.
- ctx.onFrame((dtMs, timeMs) => void) -> persistent runtime-owned frame callback. Register once during init, never inside itself.
- ctx.raf(cb) -> legacy alias for ctx.onFrame; avoid for new code.
- ctx.timeout(fn, ms) and ctx.interval(fn, ms) -> cleanup-owned timer helpers.
- ctx.onDestroy(fn) -> cleanup hook for external renderers, custom audio, or library teardown.
- Do not call ctx.cleanup() manually; Plethora owns unload cleanup.

### Library Loading And Network
- ctx.loadScript(name, version) -> Promise<void>. Loads classic script dependencies from declared Plethora Library Registry pins.
- ctx.importModule(name, version) -> Promise<module>. Imports ES module dependencies from declared Plethora Library Registry pins.
- ctx.loadFont(family, name, version, options?) -> Promise<FontFace>. Loads approved font files from the Plethora Font Registry.
- ctx.registry.resources(name, version) -> Promise<resourceBundle>. Loads verified non-executable sidecar files such as wasm/model files. resourceBundle.locateFile(file) returns a runtime-local blob URL.
- ctx.mediapipe.hands(version?) -> Promise<{ Hands, HAND_CONNECTIONS, locateFile, resources }>. Requires manifest dependency mediapipe-hands@0.4.1675469240 and loads the approved MediaPipe Hands script plus verified wasm/model sidecars.
- Compatibility overloads ctx.loadScript(url), ctx.importModule(url), and ctx.loadFont(family, url, options?) still accept exact libs.plethora.studio registry URLs. Args may be direct literals or simple const string aliases, never concatenated/template/runtime-built URLs.
- ctx.fetch(url, options?) -> Promise<Response>. Compatibility helper for data/blob/about URLs only; http/https network egress is denied.
- No networkFetch permission exists. Registry libraries are authorized by exact manifest dependencies; fonts must match fontRegistry entries exactly.
- Inline SVG markup is allowed for small self-contained vector shapes; remote SVG/image URLs are still remote assets and blocked.
- Fetch /v1/agent/libraries.json before choosing pins. Do not guess paths, versions, filenames, or global names.

### Audio And Music
- ctx.music.presets -> string[] currently including ambient, pulse, arcade, drift, sparkle, techno, house, chiptune, drone, lofi, synthwave, jungle, cozy, spooky, triumph, bubble.
- ctx.music.scales -> string[] currently including major, minor, pentatonic, minorPentatonic, blues, dorian, lydian, wholeTone, hirajoshi, chromatic.
- ctx.music.stings -> string[] currently including tap, coin, success, fail, danger, powerup, win, lose.
- ctx.music.unlock() -> Promise<state>. Call it inside the first tap/press before or after ctx.music.play() so mobile WebViews unlock audio reliably.
- ctx.music.play(optionsOrPreset) / ctx.music.start(optionsOrPreset) -> music handle. Requires backgroundMusic permission; call from a user gesture when possible.
- Music options: { preset?, id?, volume?, tempo?, fadeInMs?, intensity?, density?, swing?, scale?, root?, transpose?, pattern?, chords?, chordPattern?, drums?, drumPattern?, drumGain?, filterCutoff? }. Values are clamped by runtime.
- Music handle: stop(opts?), pause(), resume(), unlock(), setVolume(value, opts?), setPreset(name, opts?), setTempo(bpm, opts?), setIntensity(value, opts?), setScale(nameOrFreqs, opts?), setPattern(pattern), duck(amount, ms), sting(nameOrOpts, opts?), state(), details(), error(), ready(), playing, preset.
- ctx.music.stop({ fadeOutMs? }), pause(), resume(), unlock(), setVolume(value, { fadeMs? }), setPreset(), setTempo(), setIntensity(), setScale(), setPattern(), duck(), sting(), state(), details(), error(), ready(), playing, preset are also available on ctx.music.
- ctx.music.sting(nameOrOptions) plays small musical event cues. Good names: tap, coin, success, fail, danger, powerup, win, lose. It returns a Promise and should be called from/after a user gesture.
- ctx.music.duck(amount, ms) briefly lowers the music bed. Use before loud action moments; amount is 0..0.95.
- ctx.music.state() returns locked, ready, playing, paused, or stopped. ctx.music.details() returns preset, presets, scales, stings, tempo, volume, intensity, density, swing, filterCutoff, error. ctx.music.error() returns { message, code, name } or null. host_paused means the Bit is inactive/backgrounded and Plethora intentionally blocked audio.
- ctx.audio.play(url, { volume? }?) -> sound handle. ctx.audio.loop(url, { volume? }?) -> looping sound handle. Requires audio permission.
- Audio handle: stop(), pause(), resume(), paused, volume get/set. ctx.audio.stopAll() stops all ctx.audio elements.
- new Audio(url), AudioContext, and webkitAudioContext are permission-guarded; prefer ctx.music/ctx.audio unless custom synthesis is truly needed.
- Audio URLs must be data/blob/non-network or approved registry URLs. No arbitrary public audio files.
- Start audio after a user gesture so mobile autoplay rules do not mute the Bit. Prefer ctx.music for background beds instead of custom WebAudio unless the bit needs bespoke synthesis.

### Camera And Microphone
- ctx.camera.start({ facing?: "user" | "environment" | "front" | "back", width?, height?, preview?: { opacity?, zIndex?, objectFit?, mirror? } }) -> Promise<HTMLVideoElement>. preview configures the SDK-owned video layer; objectFit is cover/contain/fill/none/scale-down and mirror flips it horizontally. Requires camera permission and user OS grant.
- ctx.camera.stop(), pause(), resume(), flip() -> camera lifecycle. flip() returns Promise<HTMLVideoElement|null> and toggles user/environment.
- ctx.camera.snapshot() -> HTMLCanvasElement|null from latest video frame.
- ctx.camera.zoom(level) -> best-effort hardware zoom when supported.
- ctx.camera.ready, width, height, facing -> camera state getters.
- ctx.microphone.start({ fftSize?, smoothing? }) -> Promise<microphoneHandle>. Requires microphone permission and user OS grant.
- Microphone handle: sampleRate, fftSize get/set, smoothing get/set, analyser, getFrequencyData(), getTimeDomainData(), getFeatures() -> { level, peak, bass, lowMid, mid, treble, beat, spectrum }.
- ctx.microphone.stop() -> stop mic stream and close audio context.
- ctx.audio.reactive.start(options) and stop() reuse the same managed microphone analysis stream; never create a second getUserMedia stream for visual audio reactivity.
- If camera or microphone permission is denied, show a graceful fallback instead of a blank screen.

### Camera Notes
- Camera is supported in native builds. Use it only when the camera is the actual interaction surface, not as decoration.
- Permission: camera. Prompt should happen from a user gesture where possible.
- Use facing "user" for selfie/face bits and "environment" for rear-camera filters.
- Keep the returned video in its SDK-owned DOM layer; configure visual placement through start({ preview }) instead of reparenting it. Layer canvas effects above it with z-index instead.
- Never assume camera exists. Check ctx.capabilities.camera and handle rejected start().

### Microphone Notes
- Microphone analysis is supported in native builds. Use it only when audio is central to the interaction.
- Permission: microphone. Plethora exposes analysis data only; do not record or upload audio.
- Use getFrequencyData() for spectrum/reactive visuals and getTimeDomainData() for waveform/amplitude.
- Never assume microphone exists. Check ctx.capabilities.microphone and handle rejected start().

### Storage And Motion
- ctx.storage.get(key) -> parsed JSON value or null. Requires storage permission.
- ctx.storage.set(key, value), remove(key), clear() -> viewer-local storage scoped to this Bit. Requires storage permission.
- ctx.sensors.start() -> Promise<boolean>. Requires motion permission and subscribes to the native accelerometer, gyroscope, magnetometer, and device-motion bridge.
- ctx.sensors.tilt, acceleration, accelerationIncludingGravity, accelerometer, gyroscope, magnetometer, rotation, rotationRate, orientation, snapshot, onChange(listener), and active expose normalized native sensor state.
- ctx.motion remains the browser compatibility fallback: ctx.motion.start(), tilt, accel, active.

### Storage Notes
- Use ctx.storage only for viewer-local convenience. For platform leaderboards/tallies/shared worlds, use ctx.memory.
- Do not store secrets. Values should be small JSON-serializable state.

### Motion Notes
- Permission: motion. On iOS, device orientation access may require user gesture; start it after tap/press.
- Always support non-motion fallback controls.

### Memory Channels
- ctx.memory.local(channelId).get() -> Promise<value>. ctx.memory.local(channelId).set(value) -> Promise<result>. Channel must be declared in manifest.memory.local.
- ctx.memory.record(channelId).submit(value, { label?, dimensions?, run? }?) -> Promise<result>. Use for high scores, best times, streaks, completions. The channel declaration label names the leaderboard column; submit label is only an optional formatted value such as "950 pts", never "High Score".
- ctx.memory.record(channelId).leaderboard({ scope?, period?, dimensions? }?) -> Promise<leaderboard>. Plethora owns standard global/following leaderboard UI.
- ctx.memory.tally(channelId).choose(value) -> Promise<result>. ctx.memory.tally(channelId).results(options?) -> Promise<results>. Use for polls, ratings, reactions, votes.
- ctx.memory.world(channelId).get(options?) -> Promise<snapshot>. ctx.memory.world(channelId).mutate(mutation) -> Promise<result>. Use for bounded co-creation.
- World mutations are semantic and bounded. pixel_grid: { x, y, color }. points: { id, x, y, ... } or { id, delete: true }. objects: prefer { id, object } or { id, op: "delete" } for per-object updates; legacy/small board patches like { notes: [...] } are accepted but field worlds are cleaner for whole-state patches. sequencer_grid: { x, y, value }. field: object patch.
- Declare memory channels in plethora.json first. Bits cannot create ad hoc channels at runtime.
- Respect declared rules/rate limits. Design UI for rejected writes or unchanged state.

### Assets
- ctx.assets.url/image/audio/json/text exist only to fail clearly in the public runtime while maxAssets is 0.
- Do not include packaged bit assets in zips. Generate visuals/audio procedurally, use inline data for tiny sounds if appropriate, or use approved registry libraries.

### Anti-Patterns
- No document.body mounting, manual script tags, public CDN URLs, latest/range dependencies, workers, sockets, arbitrary fetches, or hidden network calls.
- No blank first frame. Draw something immediately, then call ctx.platform.ready() or ctx.markVisualReady(reason).
- No bottom-heavy controls; account for ctx.safeArea.bottom.
- No undeclared permissions. If source uses camera/microphone/audio/backgroundMusic/haptics/motion/storage, manifest.permissions must include it.
- No defaulting to camera, microphone, or motion mechanics; they need explicit creator intent plus fallback UI.

## Hard Safety Rules

- Public bits run in a fixed WebView sandbox owned by Plethora.
- Bits cannot load arbitrary public CDNs or arbitrary remote code.
- External libraries must be approved, version-pinned registry dependencies served from libs.plethora.studio.
- Packaged bit assets are currently disabled: maxAssets is 0.
- Camera, microphone/audio-reactive, and motion bits are supported in native Plethora builds. Use them when they serve the creator intent; require manifest permission, OS/user grant, user-gesture startup, cleanup, and a non-sensor fallback.
- Publish stays manual so the creator can review AI feedback and platform moderation before release.

## Best Practices

- Keep the bottom of the screen light; it is an unsafe area for heavy controls and core gameplay.
- Add an instructions button with point-wise instructions when the bit is not self-explanatory.
- Provide tap-to-replay or a replay button for games and finite experiences.
- Check that buttons do not overlap each other on phone-sized screens.
- Add tasteful background music and short action sounds when they improve the feel.
- Make the bit polished, tactile, and visually memorable.
- Update manifest permissions accurately whenever APIs change.
- Treat camera, microphone/audio-reactive, and motion as intentional permission-gated mechanics; use them only when requested and always include denied-permission fallback UI.
- Call ctx.platform.ready() at the end of init and ctx.platform.start() on first real interaction.
- Use ctx.onFrame() once during init for animation loops.
- Use ctx.memory records for scores/times that should appear in Plethora leaderboards.
- Use ctx.memory tallies for surveys/polls and ctx.memory worlds for co-creation.
- Never mount to document.body, create raw canvas elements for the main surface, or create script tags manually.

## Approved Library Pins

- three@0.164.1
- three-global@0.134.0
- three-global@0.128.0
- playcanvas@1.74.0
- mediapipe-hands@0.4.1675469240
- html2canvas@1.4.1
- ammo.js@0.0.10
- d3@7.9.0
- vfx-js-core@0.11.1+esbuild.0.28.1
- animejs@3.2.1
- p5@2.2.3
- pixi.js@8.18.1
- paper@0.12.18
- regl@2.1.1
- ogl@1.0.11+esbuild.0.28.1
- two.js@0.8.23
- pts@0.12.9
- twgl.js@7.0.0
- zdog@1.1.3
- oimo@1.0.9
- phaser@4.1.0
- fabric@7.4.0
- makerjs@0.19.2
- sketch-js@1.1.3
- picogl@0.17.9
- babylonjs@9.7.0
- css-doodle@0.51.0
- hydra-synth@1.4.0
- @jscad/modeling@2.13.0+esbuild.0.28.1
- @luma.gl/core@9.3.3+esbuild.0.28.1
- @theatre/core@0.7.2+esbuild.0.28.1
- canvas-sketch@0.7.7+esbuild.0.28.1
- @thi.ng/geom@8.3.30+esbuild.0.28.1
- shader-park-core@0.2.8+esbuild.0.28.1

## Approved Resource Sidecars

These are loaded through dedicated helpers or `ctx.registry.resources()`; do not add them as separate manifest dependencies unless the SDK explicitly asks for it.

- mediapipe-hands-runtime@0.4.1675469240

Fetch `/v1/agent/libraries.json` for exact URLs, SHA-256 hashes, sizes, MIME types, and font metadata.

## Minimal Single-File Bit

```js
window.plethoraBit = {
  meta: {
    title: "Touch Sketch",
    runtime: "plethora-bit@2",
    tags: ["creative", "touch"],
    permissions: ["haptics"]
  },

  async init(ctx) {
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext("2d");
    const touches = [];

    function draw() {
      g.clearRect(0, 0, ctx.width, ctx.height);
      g.fillStyle = "#f2c94c";

      for (const touch of touches) {
        g.beginPath();
        g.arc(touch.x, touch.y, touch.r, 0, Math.PI * 2);
        g.fill();
        touch.r += 2;
      }

      while (touches.length && touches[0].r > 96) {
        touches.shift();
      }
    }

    ctx.listen(canvas, "touchstart", event => {
      event.preventDefault();
      ctx.platform.start();
      ctx.platform.haptic("light");
      const rect = canvas.getBoundingClientRect();

      for (const touch of event.changedTouches) {
        touches.push({
          x: touch.clientX - rect.left,
          y: touch.clientY - rect.top,
          r: 12
        });
      }
    }, { passive: false });

    ctx.onFrame(draw);
    ctx.platform.ready();
  }
};
```

## Diverse Example Bits

### Score Chase

Short arcade score bit with a standard Plethora leaderboard.

`plethora.json`:

```json
{
  "schemaVersion": 1,
  "runtime": "plethora-bit@2",
  "entry": "main.js",
  "title": "Score Chase",
  "description": "Tap targets, build a score, submit a high score.",
  "tags": [
    "arcade",
    "score"
  ],
  "permissions": [
    "haptics"
  ],
  "dependencies": [],
  "memory": {
    "records": {
      "score": {
        "label": "High Score",
        "valueType": "number",
        "order": "desc",
        "format": "integer",
        "periods": [
          "daily",
          "weekly",
          "all_time"
        ],
        "scopes": [
          "following",
          "global"
        ],
        "dedupe": "best_per_user"
      }
    }
  }
}
```

`main.js`:

```js
window.plethoraBit = {
  async init(ctx) {
    const root = ctx.createRoot();
    let score = 0;
    root.innerHTML = '<button class="target">tap</button><strong class="score">0</strong>';
    const scoreNode = root.querySelector(".score");
    ctx.listen(root.querySelector(".target"), "click", async () => {
      ctx.platform.start();
      score += 10;
      scoreNode.textContent = String(score);
      ctx.platform.setScore(score);
      ctx.platform.haptic("light");
      await ctx.memory.record("score").submit(score);
      ctx.platform.interact({ type: "score" });
    });
    ctx.platform.ready();
  }
};
```

### One-Tap Poll

Survey bit with a global tally visible after voting.

`plethora.json`:

```json
{
  "schemaVersion": 1,
  "runtime": "plethora-bit@2",
  "entry": "main.js",
  "title": "One-Tap Poll",
  "description": "Vote once, then see how everyone answered.",
  "tags": [
    "survey",
    "choice"
  ],
  "permissions": [],
  "dependencies": [],
  "memory": {
    "tallies": {
      "mood": {
        "label": "Pick a mood",
        "type": "single_choice",
        "options": [
          "bright",
          "soft",
          "strange"
        ],
        "visibility": "after_vote",
        "rules": [
          {
            "type": "replace_previous",
            "by": "user"
          }
        ]
      }
    }
  }
}
```

`main.js`:

```js
window.plethoraBit = {
  async init(ctx) {
    const root = ctx.createRoot();
    root.innerHTML = '<button data-v="bright">bright</button><button data-v="soft">soft</button><button data-v="strange">strange</button><pre></pre>';
    const out = root.querySelector("pre");
    for (const button of root.querySelectorAll("button")) {
      ctx.listen(button, "click", async () => {
        ctx.platform.start();
        await ctx.memory.tally("mood").choose(button.dataset.v);
        const results = await ctx.memory.tally("mood").results();
        out.textContent = JSON.stringify(results, null, 2);
        ctx.platform.interact({ type: "vote" });
        ctx.platform.complete({ choice: button.dataset.v });
      });
    }
    ctx.platform.ready();
  }
};
```

### Shared Pixel Mural

Co-creation bit where each visitor mutates a bounded shared world.

`plethora.json`:

```json
{
  "schemaVersion": 1,
  "runtime": "plethora-bit@2",
  "entry": "main.js",
  "title": "Shared Pixel Mural",
  "description": "Tap one pixel into a small shared canvas.",
  "tags": [
    "art",
    "shared"
  ],
  "permissions": [
    "haptics"
  ],
  "dependencies": [],
  "memory": {
    "worlds": {
      "mural": {
        "label": "Shared mural",
        "type": "pixel_grid",
        "width": 64,
        "height": 64,
        "rules": [
          {
            "type": "rate_limit",
            "max": 1,
            "per": "day",
            "by": "user"
          }
        ],
        "attribution": true
      }
    }
  }
}
```

`main.js`:

```js
window.plethoraBit = {
  async init(ctx) {
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext("2d");
    const world = ctx.memory.world("mural");
    async function draw() {
      const snapshot = await world.get();
      g.clearRect(0, 0, canvas.width, canvas.height);
      for (const pixel of snapshot?.pixels || []) {
        g.fillStyle = pixel.color;
        g.fillRect(pixel.x * 4, pixel.y * 4, 4, 4);
      }
    }
    ctx.listen(canvas, "click", async (event) => {
      ctx.platform.start();
      const rect = canvas.getBoundingClientRect();
      await world.mutate({
        x: Math.floor((event.clientX - rect.left) / rect.width * 64),
        y: Math.floor((event.clientY - rect.top) / rect.height * 64),
        color: "#00ff99"
      });
      ctx.platform.haptic("success");
      ctx.platform.interact({ type: "world_mutation" });
      await draw();
    });
    await draw();
    ctx.platform.ready();
  }
};
```
