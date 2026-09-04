# Plethora Bits

Mobile-first interactive Bits for [Plethora](https://create.plethora.studio),
built against the `plethora-bit@2` runtime.

| Bit | What it is |
| --- | --- |
| [`bits/gym-trainer`](bits/gym-trainer) | A five-day training week with an animated coach: setup and train reels, travel endpoints, and a date-ticked calendar. |

## Layout

    bits/<name>/        one Bit each - source, manifest, dev tooling, screens
    .claude/skills/     what we know about the platform, as reusable skills
    scripts/sync.sh     copy a Bit across from a working checkout

## The skills are the memory

Everything painful we learned about Plethora itself lives in `.claude/skills/`
rather than inside any one Bit, so the next agent picks it up automatically:

- **`plethora-bit`** — the live contract endpoints, the pairing flow that gets
  an upload token, the draft upload call, and the two error messages that mean
  something other than what they say. Its
  [`reference/size-and-upload-limits.md`](.claude/skills/plethora-bit/reference/size-and-upload-limits.md)
  is the measured answer to "how big can a Bit be", which is **not** the 2 MiB
  the contract documents: uploads die on a ~3 second deadline at around 76 KB,
  and the line moves with what the manifest declares.
- **`procedural-figure-animation`** — authoring and QAing a keyframed 2D figure,
  since packaged assets are disabled and every Bit has to draw its own.

Start any Bit session by fetching the live contract; it outranks both of them.

    curl -s https://api.plethora.studio/v1/agent/context.md
