# Gym Trainer — a Plethora Bit

A training week with an animated coach who shows you how to do it *right*.

Every exercise plays as **one continuous demonstration in two parts**:

- **Setup** — how you stand, and how you pick the weight up off the floor.
- **Train** — the working posture, looped three times, then back to setup.

There are no rep counters and no countdowns. Your sets, reps and suggested load
are written under the video, along with **how far each rep should travel** —
the exact landmark it starts and stops at. You tap **Done** when you have
finished, and it moves you to the next exercise. Finish every exercise in a day
and that date is ticked on your calendar.

There is deliberately **no wrong-form variant**. The Bit only ever shows the
correct movement; the teaching is in the setup reel, the travel endpoints and
the alignment guides.

![the week, a day, the two reels and the tracker](docs/screens/train-reel.png)

## Status

Monday is built — seven exercises, fully authored and QA'd. Tuesday to Friday
are listed so the week reads as a whole, but they are placeholders.

| day | focus | state |
| --- | --- | --- |
| Monday | Legs · Shoulders · Biceps | built (7 exercises) |
| Tuesday | Back · Triceps | placeholder |
| Wednesday | Chest · Forearms · Cardio | placeholder |
| Thursday | Hamstrings · Glutes · HIIT | placeholder |
| Friday | Back · Chest · Shoulders · Arms | placeholder |

## Layout

    main.js         the Bit - single source of truth
    plethora.json   manifest
    build/main.js   upload artifact, generated
    dev/            local harness and QA tooling, never uploaded

## Uploading, and what the validator actually enforces

    python3 dev/build.py     # main.js -> build/main.js, strip + node --check

Three things were measured against the live draft endpoint, because all three
were previously guessed wrong:

1. **Never minify.** terser output is rejected at any size with the generic
   error *"This bit uses unsupported remote resources"*. The identical code
   unminified is accepted. The validator statically analyses the source and
   mangling defeats it. `dev/build.py` therefore only strips comments and
   indentation.
2. **No URLs anywhere in the source**, not even inside a comment. A GitHub
   link in a build banner was enough to trip the same error. `dev/build.py`
   fails the build if it finds one.
3. **The size ceiling is not ~80 KB.** A padded 100 KB source was accepted, as
   was 73.9 KB of real source. Around 160 KB the request fails with
   *"Request deadline exceeded"* — a server timeout, not validation. Uploads
   can also time out transiently well under that, so retry before concluding
   anything about size.

That generic remote-resources message says nothing about size. An earlier note
in this repo blamed it on an ~80 KB budget and sent a redesign down the wrong
path. Trust the message and bisect against the endpoint.

The week still fits comfortably: Monday builds to 60.6 KB, and the compaction
below leaves room for the remaining four days.

### Keeping it small anyway

- **A compact pose DSL.** A pose is a string, not an object literal:

      tr('0|to4 na72 nb-58 nt2 ns1', '0.5|y0.20 to16 nt44 ns-52 no86')

  Codes are listed in `CODES` near the top of `main.js`.
- **Shared setup reels.** Picking two dumbbells up off the floor is the same
  movement whatever you are about to do with them, so `RIG` holds each pickup
  once and an exercise contributes only its closing "set position" step via
  `sxs` (caption) and `sxt` (keyframe).

## The rig

The trainer is a keyframed 2D figure drawn procedurally — packaged assets are
disabled (`maxAssets` is 0) and remote images are blocked, so there is nothing
to load. Angles are absolute and in degrees: **0 points straight down, +90
points right, -90 points left**, and the torso runs the other way from the
pelvis so 0 is upright.

### Authoring rules, learned by getting them wrong

1. **She faces +x.** Anything travelling forward is a *positive* angle. A
   negative forearm angle curls the bar up behind her head.
2. **A foot's toe must end below the ankle.** Invert it and she is standing on
   her heels instead of up on her toes.
3. **Seated only reads in side view.** The rig has no depth, so a seated front
   view has nowhere to put the thighs and renders as a splayed float.
4. **Every setup reel must move**: squat to the floor, grip, stand, set
   position. Three standing frames teach nothing, and the setup reel is the
   whole point of the Bit.
5. **Exaggerate small movements.** A true-scale calf raise is invisible at
   phone size, and it needs a step prop so the heel has something to drop
   below.

None of these are detectable by reading the numbers — every one was found by
rendering. Author a day, then shoot a contact sheet before trusting it.

## QA

    node dev/shots.mjs              # walk the whole UI, screenshot each screen
    BUILT=1 node dev/shots.mjs      # same, against build/main.js
    node dev/posegrid.mjs out.png 0,0.34,0.66,1          # every exercise
    node dev/posegrid.mjs out.png 0,0.5,1 goblet         # just one

`dev/shots.mjs` fails loudly on a page error and prints the platform lifecycle
events, so a broken `ready()` shows up without reading the screenshots. Current
screens are in `docs/screens`: `home`, `day-menu`, `setup-reel`, `train-reel`,
`progress`, plus `monday-qa` — the pose contact sheet for all seven exercises.

## Notes

Not medical advice. Weight suggestions are a starting point only.
