---
name: procedural-figure-animation
description: Author and QA a keyframed 2D figure drawn procedurally on a canvas - a human rig posed by joint angles, with alignment guides, joint-angle callouts and phase captions. Use when animating a person or creature without packaged image assets, when building an exercise/dance/posture demonstrator, when poses render wrong in a way the numbers do not explain, or when captions and markers land on the wrong half of a looping animation.
---

# Procedurally animated figures

Plethora disables packaged assets (`maxAssets` is 0) and blocks remote images,
so any Bit with a character has to draw it. The workable shape is a rig posed
by **absolute joint angles**, keyframed over a normalised `0..1` phase.

## Angles

Absolute angles are far easier to author than relative ones — each limb is
stated in world space, so you can read a pose without walking the chain.

Pick one convention and write it at the top of the file. A convention that
works: `dir(a) = (sin a, cos a)`, so **0 points straight down, +90 right, -90
left**; the torso runs the other way (`0` upright, `+` leaning forward).

Keep poses as short strings (`'to45 na-20 nt55 ns-65'`) rather than object
literals. It keeps a 33-pose library readable and small, and a
`'0.5|=0'` back-reference for A-B-A loops removes most of the duplication.

Ease between keyframes (`u*u*(3-2*u)`) or the figure snaps.

## The rules you will otherwise learn by shipping them wrong

None of these are visible in the numbers. Every one was found by rendering.

1. **Decide which way the figure faces, then honour it.** If she faces +x,
   anything travelling forward is a positive angle. A sign slip curls a barbell
   up behind her head and the numbers look fine.
2. **A foot's toe must end below the ankle** — unless the pose genuinely has
   the heel dropped. Invert it and she stands on her heels.
3. **A flat rig has no depth, so some poses only read from one camera.**
   Seated and hinged poses read from the side; the arc of a fly or a lateral
   raise reads from the front. Give the animation its own camera when the
   demonstration needs a different one from the setup, and tell the viewer the
   camera changed.
4. **Watch for a pose authored in one camera and played back in another.**
   This is the nastiest bug in the family: the numbers are valid, the linter
   passes, and the figure stands up off the bench she is supposed to be lying
   on. If a sequence changes camera, render its handover frames and look.
5. **Both limbs at the same sign is a side-view pose.** Render it in a front
   view and the legs splay to one side and the figure appears to float. Front
   views need mirrored signs (`nt50 / ft-50`).
6. **Exaggerate small movements.** A true-scale calf raise or shrug is
   invisible at phone size. Scale it up until it reads, and give it a prop (a
   step) so the travel has something to be measured against.
7. **Give the rig a parameter for anything that is genuinely its own joint.**
   Faking a shrug by translating the whole figure lifts her off the floor.
   A four-line `shoulderLift` that offsets only the shoulder points is correct
   and costs nothing.
8. **Props live where they really are.** If the hands take the weight partway
   through a pickup, draw it on the floor until that phase. Otherwise she
   stands holding a barbell and then squats to pick up the barbell she is
   holding.
9. **Seated and lying poses need the pelvis placed by hand.** With no IK, the
   vertical offset is what puts the ankles on the floor, and arm reach limits
   how deep a hinge can go before the hands stop reaching.

## Captions and markers on a loop

A looping animation is a **round trip**: `0` is the start, `0.5` the far end,
`1` back to the start. Reading it as a one-way sweep labels the bottom of a
press "locked out".

If a caption list is `'t|text'` picked by "first entry whose `t >= phase`",
then **`t` is the END of the window it labels, and a list that stops short of
1 repeats its last entry for the whole remainder**. That single detail caused
most of the mislabelling in this repo: a curl narrated "top of the rep" all the
way down, a squat narrated "bottom" through the entire ascent. **Every caption
and marker list must end at exactly `t = 1`**, and that last entry is the one
describing the return half — which, for anything physical, is usually the half
that matters most.

## QA it by looking, always

Numbers cannot tell you a pose is wrong. Build two throwaway tools early:

- **A contact sheet.** Every pose × a few phases × each camera, in one image.
  Author a sequence, shoot the sheet, then trust it. This is the single
  highest-value tool in the project.
- **A screenshot walk** of the real UI that fails loudly on a page error and
  prints the platform lifecycle events, so a broken `ready()` shows up without
  reading the images.

Then add a **linter** for the invariants above, because they are exactly the
bugs that come back: caption/marker lists ending at 1 and ascending, loops
returning to their start pose, one sequence handing over to the next in the
pose it starts in, every referenced id existing, nothing defined but unused.
Have it run the real source in a `vm` context with a `window` shim and inspect
the data directly, so it stays true to the source rather than a copy of it.

Keep these out of the uploaded artifact — a dev directory the build never
reads, and no URLs anywhere in the source the validator sees.
