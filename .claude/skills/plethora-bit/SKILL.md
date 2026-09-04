---
name: plethora-bit
description: Build, validate, and upload a Plethora Bit - the mobile-first interactive objects hosted at create.plethora.studio, built against the plethora-bit@2 runtime. Use when creating or editing a Bit, working with plethora.json, the ctx SDK, ctx.memory channels or approved library pins, when pairing a coding agent with a Plethora creator account, when uploading or publishing a draft, or when a Bit upload is rejected with errors like "unsupported remote resources" or "Request deadline exceeded".
---

# Plethora Bits

Bits are small mobile-first interactive objects — games, toys, puzzles,
generative art — that run in a fixed WebView sandbox Plethora owns. There is no
starter repo: a Bit is one JavaScript source file plus a `plethora.json`
manifest, uploaded as a draft over HTTP.

## Always start from the live contract

The platform publishes its own contract, and **it wins over anything written
here or remembered from a previous session**. Fetch it before writing code:

    curl -s https://api.plethora.studio/v1/agent/context.md   # standalone brief
    curl -s https://api.plethora.studio/v1/agent/sdk.md       # exact ctx surface
    curl -s https://api.plethora.studio/v1/agent/schema.json  # manifest + limits
    curl -s https://api.plethora.studio/v1/agent/libraries.json  # approved pins

All four are unauthenticated. They carry a `contextVersion`; if they disagree
with each other, stop and report the drift rather than guessing. Never invent
`ctx` methods, manifest fields, endpoints, response keys, library versions or
font names — if it is not in those documents, it does not exist.

This directory caches a dated copy in `reference/` purely so you can diff
against it and notice what changed. It is a snapshot, not the contract.

## Connecting: pairing, once, with the creator

Uploading needs an agent access token. You get one by pairing, which the
creator approves on their phone or dashboard. **Never ask for a username,
email, password, Supabase credentials or an OAuth login** — approval binds the
agent to whoever is already signed in on their device.

1. `POST /v1/agent/pair/sessions` → returns `sessionId`, `sessionSecret`,
   `pairingCode`, `pairingUrl`, `pairingQrPayload`, `approvalUrl`.
2. Show the creator the `pairingCode` and the `approvalUrl`. Scanning
   `pairingUrl` on a phone opens Plethora → Create → Connect agent with the
   code pre-filled. **Stop and wait** — you cannot approve this yourself.
3. Poll `POST /v1/agent/pair/sessions/:sessionId/exchange` with the private
   `sessionSecret`. It returns `status: "pending"` until approved.
4. On `status: "approved"`, **save `data.accessToken` immediately**. The field
   is `accessToken`, nested under `data` — there is no `agentToken`. Approval
   consumes the session, so a second exchange will not hand it back.

The token is durable: pair once, reuse it for every later draft upload until
the creator revokes it or it expires. Only the bootstrap exchange is one-shot.
Store it outside the repo (an env var or an ignored file), never in a commit.

## Uploading a draft

    POST /v1/agent/bits/drafts
    Authorization: Plethora-Agent <accessToken>
    Content-Type: application/json

Body: `source` (the JavaScript, required), `manifest` (the `plethora.json`
object — send it every time), and optional `title`/`description`/`tags`
fallbacks used only when the manifest omits them, plus `generated: true`.

Scope is `bits:draft:write`. **Publishing is deliberately manual** — the draft
appears in the creator's Plethora app for them to test and release. An agent
cannot publish, and should not offer to.

Failures: `401` no token · `403` invalid/expired/revoked/wrong scope · `409`
title collides with an existing bit this path cannot update · `400` manifest or
source failed contract validation.

## The two rejections that waste the most time

**"This bit uses unsupported remote resources"** almost never means what it
says. It is what the static validator emits when it cannot prove where your
code loads things from. Causes seen in practice:

- **Minified source.** terser output is rejected at *any* size; the identical
  code unminified is accepted. The contract requires library and font arguments
  to be "direct literals or simple const string aliases, never concatenated /
  template / runtime-built URLs" — mangling defeats that analysis. Strip
  comments and whitespace if you need to; never mangle.
- **Any URL in the source, including inside a comment.** A link in a build
  banner is enough. Grep the artifact for `https?://` before uploading.
- A genuine remote asset: a public CDN, a remote image or SVG, an `img` src, a
  font that is not an exact `fontRegistry` entry.

**"Request deadline exceeded"** is a server timeout, not a size limit. The real
package limit is **2 MiB**. Uploads have been observed to start timing out
around 96 KB of source for validator-heavy code (many string literals), and to
fail once or twice before succeeding even at a passing size — so **always retry
before concluding anything about size**. Do not redesign a Bit to be smaller on
the strength of one timeout; that mistake has been made twice in this repo.

## Writing the Bit

Define `window.plethoraBit = { meta?, async init(ctx) {} }`. Everything comes
through `ctx`:

- Surfaces: `ctx.createRoot()`, `ctx.createCanvas2D()` (already DPR-scaled — draw
  in `ctx.width`/`ctx.height`), `ctx.createCanvas()` for WebGL. Never mount to
  `document.body` or make raw canvases or script tags.
- Lifecycle: draw something first, then `ctx.platform.ready()`. Never a blank
  first frame. `ctx.platform.start()` on the first real gesture. Also
  `interact`, `setScore`, `setProgress`, `milestone`, `complete`, `fail`.
- Loops and cleanup: `ctx.onFrame(cb)` once during init; `ctx.listen`,
  `ctx.timeout`, `ctx.interval`, `ctx.onDestroy`. Never call `ctx.cleanup()`.
- Libraries: `ctx.loadScript(name, version)` / `ctx.importModule(name, version)`
  against exact pins declared in `manifest.dependencies`. Check
  `libraries.json`; do not guess versions or globals.
- **Packaged assets are disabled (`maxAssets` is 0).** Generate visuals and
  audio procedurally, or inline tiny data. Inline SVG markup is fine; remote
  SVG/image URLs are not. `http/https` egress is denied outright.
- Storage vs memory: `ctx.storage` is viewer-local convenience.
  `ctx.memory.local/record/tally/world` are the platform channels and must be
  declared in `plethora.json` first — a Bit cannot create one at runtime.
- Every permission-gated API needs its manifest permission, and camera /
  microphone / motion need a user gesture and a denied-permission fallback.
  Do not reach for them unless the creator asked.

Keep the bottom of the screen light (`ctx.safeArea.bottom`), add an
instructions affordance when the Bit is not self-explanatory, and give finite
experiences a replay.

## Checklist before every upload

1. Re-fetch the contract endpoints if the session is not fresh.
2. `node --check` the artifact.
3. Grep it for `https?://` — zero matches.
4. Confirm it is not minified.
5. Every API used has its manifest permission; every dependency is an exact
   approved pin; every memory channel is declared.
6. Upload, and retry a couple of times on a timeout before changing anything.
