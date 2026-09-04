# Plethora draft uploads: what actually limits size

Measured against the live endpoint on **2026-09-04**, contract version
`plethora-agent-context-2026-08-13.1`. Every number below came from a real
request to `POST /v1/agent/bits/drafts`, not from the docs.

Re-measure before trusting any of it. The boundary has moved twice already.

---

## The short version

| | |
| --- | --- |
| Documented package limit | **2 MiB** (`2097152` bytes) |
| What actually stops you | a **~3 second server-side deadline** on the upload |
| Symptom | `HTTP 504`, `{"code":"deadline_exceeded","retryable":true}` |
| Practical budget | **~76 KB of source** — but it moves with the manifest |
| Behaviour at the line | **probabilistic**: retry before concluding anything |

The 2 MiB figure is real but irrelevant. Nothing that fails is anywhere near
it — a Bit that fails at 78 KB is using **3.7%** of the documented limit.

Budget against `packageBytes` in the success response, which is source plus
manifest. The upload that landed reported `packageBytes: 78883` for
`77079` bytes of source — the manifest added `1804`.

---

## The boundary moves with the manifest

This is the part that costs the most time, because it makes a single-number
"ceiling" meaningless. The same payload size passes or fails depending on what
the manifest declares.

**Bare manifest** (no permissions, no memory), synthetic valid source:

| source | result | time |
| --- | --- | --- |
| 10 / 30 / 50 / 60 / 70 / 80 KB | `200` | 2.0–2.7 s |
| 82 KB | `504` | 3.3 s |
| 84 KB | `504` | 3.0 s |
| **85 KB** | **`200`** | 2.8 s |
| 86 KB | `504` | 2.7 s |
| 88 / 90 KB | `504` | 2.7 s |

Note 82 fails, 85 passes, 86 fails. That is not a threshold, it is a coin
flip weighted by size.

**Real manifest** (3 permissions, 2 memory channels), synthetic valid source:

| source | result | time |
| --- | --- | --- |
| 40 KB | `200` | 2.70 s |
| 60 KB | `200` | 2.55 s |
| 70 KB | `200` | 2.58 s |
| **76 KB** | **`200`** | 2.75 s |
| 82 KB | `504` | 3.64 s |

**Real manifest, the real Bit:**

| source | attempts | result |
| --- | --- | --- |
| 95,059 | 3 | all `504` |
| 90,779 | ~12 | all `504` |
| 81,285 | 6 | all `504` |
| 80,137 | 8 | all `504` |
| **77,079** | 3 | `504`, `504`, **`200`** |

So with this manifest the usable line sits between **76 KB and 78 KB**, and
even under it the first two attempts failed. With a bare manifest it sat
around 80–85 KB. Declaring more in the manifest costs you source budget.

Removing individual manifest blocks did not help: at 81,285 bytes the real
source failed identically with memory removed, with only `memory.local`, and
with only `memory.records`. It is the manifest as a whole, not one field.

---

## Timing tells you which layer failed

Successes land in **1.9–2.9 s**. Deadline failures come back in **2.7–3.7 s**.
Everything else answers in **under 1.5 s**.

A failure that returns in three seconds is the deadline. A failure that
returns in one second is a validation error and no amount of shrinking will
fix it.

---

## Failure taxonomy

| status | code | retryable | means |
| --- | --- | --- | --- |
| 401 | `unauthorized` | no | no token, or malformed header |
| 403 | — | no | invalid, expired, revoked, or wrong scope |
| 400 | `bad_request` | no | manifest or source failed validation |
| 409 | — | no | title collides with a bit this path cannot update |
| 504 | `deadline_exceeded` | **yes** | the size problem — retry, then shrink |

`400` covers several distinct checks, and they run in a useful order — each
one is a probe you can use (see below):

1. `source is required.`
2. `Source must assign window.plethoraBit at the top level.`
3. `Creator source uses <permission> without declaring that permission.`
4. `This bit uses unsupported remote resources. …`

---

## Re-measuring without writing to the account

Do not bisect by uploading valid Bits — a success overwrites a real draft, and
there is no delete endpoint. Instead use payloads **built to be rejected**.
Each probe isolates one layer, and none of them can create anything:

| probe | expected | proves |
| --- | --- | --- |
| `-d '{}'` | `400 source is required` | the token works |
| large source, never assigns `window.plethoraBit` | fast `400` | the gateway accepts a body that size |
| large source that assigns it **and** contains a public CDN URL | fast `400 unsupported remote resources` | the **deep analyser** is not what is timing out |
| **your real source** with a URL appended | fast `400` | your real source analyses fine; the deadline is in persistence |
| your real source with a bare manifest | `400 … without declaring that permission` | permission checks are early and cheap |

Measured: a 90 KB source with thousands of distinct string literals reached
the remote-resource check in **1.15–1.35 s**. Static analysis is fast and is
not the bottleneck, whatever the error message implies.

Only after that ladder should you bisect with valid payloads — and then under
a **throwaway title**, reusing one title so probes update it instead of
littering the account.

---

## When you are over: compress data, never identifiers

**Minifying is not an option.** terser output is rejected at any size with
`This bit uses unsupported remote resources`, while the identical code
unminified is accepted. The contract explains why: loader arguments must be
"direct literals or simple const string aliases, never concatenated /
template / runtime-built URLs", and the validator proves that statically.
Mangling defeats the proof.

Everything below is whitespace or string **data**. No identifier is renamed,
and every literal still appears in full, once. Measured on this Bit, from a
117,909-byte readable source:

| step | bytes | delta |
| --- | --- | --- |
| comments + indentation stripped (baseline) | 95,059 | — |
| write the setup→train handover pose once (`'1|=T'`) | 93,674 | −1,385 |
| squeeze whitespace around `= * / < > + - ? :` | 90,779 | −2,895 |
| phrase dictionary over the exercise library | 81,285 | −9,494 |
| extend the same table to the stylesheet | 80,137 | −1,148 |
| second placeholder bank (2 markers × 87 chars) | 78,929 | −1,208 |
| join lines where ASI cannot apply | 77,079 | −1,850 |
| **total** | **77,079** | **−17,980 (−18.9%)** |

Nothing was cut. Not one word of coaching text was removed.

### The phrase dictionary

Prose repeats because good writing repeats — ` the `, ` your `, `shoulder`,
` until the `. So do keyframe strings (` no86 ft`) and CSS. Replace each
frequent run with a two-byte placeholder and expand it at load.

On this Bit: **124 phrases** (5–33 chars) in a **1,542-byte** table, standing
in for **~2,970 occurrences**. One marker character gives you only as many
slots as your placeholder alphabet (87 here, after excluding `'`, `\`, `|`
and the markers); a **second marker character doubles it**.

Only compress strings that are guaranteed to be expanded again. Here that
means the exercise library (walked once at startup) and the stylesheet (passed
through the expander at its single `.join('')`). A placeholder left anywhere
else is shown to the reader verbatim.

### Two rules that are not optional

**Make the placeholder atomic while compressing.** Use one private-use
character internally and convert to the two-byte form only at emission. Emit
the short form immediately and a later phrase will match the second half of an
earlier placeholder plus the text after it, leaving a stray marker in the
artifact. That happened here and broke pose parsing.

**Keep a verifier that runs both files and compares the data they build.**
`node --check` is blind to a regex that ate a token — the file still parses.
Screenshot diffing does not work either when the animation is time-driven.
Loading `main.js` and `build/main.js` in a `vm` context and deep-comparing
their data structures caught two real regressions that would otherwise have
shipped.

### Line joining

Safe after `,` `;` `{` `+` — automatic semicolon insertion has nothing to
insert. **Never after `)` or `}`**: a line ending in either can be a complete
statement, and gluing the next line onto it changes what the program means.

---

## History of this number in this repo

Worth recording, because each wrong answer sent a redesign down the wrong path:

- **"~80 KB budget"** — wrong, and blamed for the generic remote-resources
  error, which is not a size error at all.
- **"~93 KB, measured in bytes"** — right method, but the boundary has since
  moved and the reasoning ("the validator costs more for real code with many
  string literals") is disproved above: 90 KB of dense string literals
  analyses in 1.3 s.
- **"2 MiB, per the contract"** — true and useless; the deadline bites at
  4% of it.

The lesson is the method, not the number: **bisect against the endpoint with
probes that cannot write**, watch the response *time* as well as the code, and
re-measure whenever the manifest changes.
