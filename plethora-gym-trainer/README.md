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

## The size ceiling

The draft validator has a source budget of roughly 80 KB — the same code passes
under it and is rejected above it with a generic "unsupported remote resources"
error. `dev/build.py` strips comments and indentation to stay inside it:

    python3 dev/build.py     # main.js -> build/main.js, then node --check

Monday alone builds to about 62 KB, so the remaining four days will not fit in
the current encoding. Poses are already stored as a compact string:

    tr('0|to4 na72 nb-58 nt2 ns1', '0.5|y0.20 to16 nt44 ns-52 no86')

Codes are listed in `CODES` near the top of `main.js`. The next days will need
the coaching text compacting too, or splitting the week across Bits.

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
events, so a broken `ready()` shows up without reading the screenshots.

## Notes

Not medical advice. Weight suggestions are a starting point only.
