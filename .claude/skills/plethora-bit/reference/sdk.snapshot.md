# Plethora Bit SDK

## Contract Source Of Truth

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
