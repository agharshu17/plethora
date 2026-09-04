/* Gym Trainer - a Plethora Bit
 * runtime: plethora-bit@2
 *
 * A five-day training week with an animated coach. There are no rep counters
 * and no countdowns: every exercise is one continuous demonstration in two
 * parts - SETUP, which is how you stand and pick the weight up, and TRAIN,
 * which is the working posture - and you tap Done when you have finished it.
 * Reps and load live in the description, not on a timer.
 *
 * Everything is drawn procedurally: packaged assets are disabled (maxAssets 0)
 * and remote images are blocked, so the trainer is a keyframed 2D rig.
 */

(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Palette
   * ------------------------------------------------------------------ */

  var C = {
    bg0: '#080a1b',
    bg1: '#141a3d',
    grid: 'rgba(45,226,230,0.16)',
    glow: '#2de2e6',
    hot: '#ff2e88',
    hotSoft: '#ff7ab8',
    violet: '#7c4dff',
    skin: '#f2b78c',
    skinShade: '#cb8a63',
    hair: '#2a1b3d',
    hairLit: '#7c4dff',
    top: '#ff2e88',
    topLit: '#ff86bd',
    legs: '#241f42',
    legsLit: '#4b3f83',
    shoe: '#2de2e6',
    good: '#3ddc84',
    bad: '#ff4d5e',
    ink: '#f4f6ff',
    dim: 'rgba(244,246,255,0.62)',
    faint: 'rgba(244,246,255,0.34)',
    steel: '#8f9bc4',
    steelDark: '#414c78'
  };

  /* ------------------------------------------------------------------ *
   * Body proportions, in figure units (~1.0 = full standing height)
   * ------------------------------------------------------------------ */

  var B = {
    spine: 0.30,
    neckToHead: 0.105,
    headR: 0.072,
    upperArm: 0.155,
    foreArm: 0.15,
    thigh: 0.235,
    shank: 0.23,
    foot: 0.095,
    hipHalfSide: 0.030,
    hipHalfFront: 0.072,
    shHalfSide: 0.034,
    shHalfFront: 0.094
  };

  /* ------------------------------------------------------------------ *
   * Pose model
   *
   * Every angle is absolute, in degrees, so poses are easy to author.
   * Limb direction for angle a is (sin a, cos a): 0 points straight down,
   * +90 points right, -90 points left. The torso runs the other way from
   * the pelvis, (sin a, -cos a): 0 is upright, + leans right (forward).
   *
   * fa/fb = far arm upper/fore, na/nb = near arm upper/fore.
   * ft/fs/fo = far leg thigh/shank/foot, nt/ns/no = near leg.
   * The far limbs are drawn behind the torso, the near ones in front.
   *
   * Poses are written as a short string so 33 exercises fit inside the
   * draft validator's source budget:
   *
   *   q('to45 cu-6 ne-20 nt55 ns-65 no84')
   *
   * is the same pose as { torso: 45, curve: -6, neck: -20, ... }.
   * ------------------------------------------------------------------ */

  var CODES = {
    x: 'x', y: 'y', to: 'torso', cu: 'curve', ne: 'neck',
    fa: 'fau', fb: 'faf', na: 'nau', nb: 'naf',
    ft: 'flt', fs: 'fls', fo: 'flf',
    nt: 'nlt', ns: 'nls', no: 'nlf',
    fz: 'flScale', nz: 'nlScale', az: 'armScale', hl: 'heelLift'
  };

  var REST = {
    x: 0, y: 0,
    torso: 0, curve: 0, neck: 0,
    fau: 4, faf: 6, nau: 4, naf: 6,
    flt: 0, fls: 0, flf: 90,
    nlt: 0, nls: 0, nlf: 90,
    flScale: 1, nlScale: 1,
    armScale: 1,
    heelLift: 0
  };

  var POSE_KEYS = Object.keys(REST);
  var TOKEN = /^([a-z]+)(-?[0-9.]+)$/;

  function q(s) {
    var p = {}, i;
    for (i = 0; i < POSE_KEYS.length; i++) p[POSE_KEYS[i]] = REST[POSE_KEYS[i]];
    if (!s) return p;
    var parts = s.split(' ');
    for (i = 0; i < parts.length; i++) {
      if (!parts[i]) continue;
      var m = TOKEN.exec(parts[i]);
      if (!m || !CODES[m[1]]) throw new Error('bad pose token: ' + parts[i]);
      p[CODES[m[1]]] = parseFloat(m[2]);
    }
    return p;
  }

  /* 'time|pose' strings, ascending, describing one full cycle over 0..1 */
  function tr() {
    var out = [];
    for (var i = 0; i < arguments.length; i++) {
      var bar = arguments[i].indexOf('|');
      var body = arguments[i].slice(bar + 1);
      out.push({
        t: parseFloat(arguments[i].slice(0, bar)),
        p: body.charAt(0) === '=' ? out[parseInt(body.slice(1), 10)].p : q(body)
      });
    }
    return out;
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function lerpPose(a, b, t) {
    var p = {};
    for (var i = 0; i < POSE_KEYS.length; i++) {
      var k = POSE_KEYS[i];
      p[k] = lerp(a[k], b[k], t);
    }
    return p;
  }

  /* Sample a keyframe track: [{t, p}, ...] with t ascending over 0..1 */
  function sampleTrack(track, t) {
    if (t <= track[0].t) return track[0].p;
    for (var i = 1; i < track.length; i++) {
      if (t <= track[i].t) {
        var a = track[i - 1], b = track[i];
        var span = b.t - a.t || 1;
        var u = (t - a.t) / span;
        u = u * u * (3 - 2 * u); /* ease, so she never snaps between keys */
        return lerpPose(a.p, b.p, u);
      }
    }
    return track[track.length - 1].p;
  }

  /* ------------------------------------------------------------------ *
   * The exercise library
   *
   * nm name, tg target, vw view, pr prop rig, ld load line (reps + weight
   * live here, never on a timer), cu the written checklist, tk the TRAIN
   * loop, sd/ss/st the SETUP loop: duration, captions and keyframes.
   * ------------------------------------------------------------------ */

  /* ------------------------------------------------------------------ *
   * Shared setup reels
   *
   * Picking two dumbbells up off the floor is the same movement whether you
   * are about to press them or raise them, so the pickup is written once and
   * each exercise adds only its own final "set position" step through sxs
   * (caption) and sxt (keyframe). Side and front views need their own squat,
   * because the rig has no depth.
   * ------------------------------------------------------------------ */

  var TALL = 'Stand up with your legs, never your lower back. Arms hang straight, shoulders pulled down and back.';

  /* gr is the phase at which the hands actually take the weight. Before it,
   * the weight is drawn where it really is - on the floor. */
  var RIG = {
    db2s: { sd: 9600, gr: 0.34,
      ss: ['0.34|The dumbbells start on the floor beside your feet. Squat down with a flat back and take one in each hand — neutral grip, palms facing your thighs.',
        '0.64|' + TALL],
      st: tr('0|to2 na4 nb6 fa4 fb6',
        '0.34|y0.26 to42 ne-18 na14 nb18 fa14 fb18 nt54 ns-64 no84 ft56 fs-66 fo84',
        '0.64|=0') },
    db2f: { sd: 9600, gr: 0.34,
      ss: ['0.34|The dumbbells start on the floor beside your feet. Squat down with a flat back and take one in each hand — neutral grip, palms facing your thighs.',
        '0.64|' + TALL],
      st: tr('0|to0 na4 nb6 fa-4 fb-6',
        '0.34|y0.30 to0 na14 nb18 fa-14 fb-18 nt50 ns-42 no90 ft-50 fs42 fo-90',
        '0.64|=0') },
    bars: { sd: 10000, gr: 0.36,
      ss: ['0.36|The bar is on the floor. Walk to it so it sits over your mid-foot, then squat down to it with a flat back — never round over and drag it up.',
        '0.66|Underhand grip, hands about shoulder width — index fingers on the knurling rings. Stand up by pushing the floor away.'],
      st: tr('0|to2 na4 nb6 fa4 fb6',
        '0.36|y0.26 to42 ne-18 na22 nb38 fa22 fb38 nt54 ns-64 no84 ft56 fs-66 fo84',
        '0.66|to2 na2 nb4 fa2 fb4') },
    gob: { sd: 10000, gr: 0.62,
      ss: ['0.30|Stand the dumbbell upright on the floor between your feet. Feet shoulder width or a touch wider, toes turned out 15–30°.',
        '0.62|Squat down to it — hips back, chest up, flat back. Cup both hands under the TOP head, palms up, fingers interlaced beneath the plate.'],
      st: tr('0|to2 na4 nb6 fa4 fb6',
        '0.30|=0',
        '0.62|y0.24 to36 ne-14 na46 nb26 fa46 fb26 nt58 ns-46 no84 ft60 fs-48 fo84') },
    dl: { sd: 12000, gr: 0.42,
      ss: ['0.22|Set the bar over the middle of your feet — about a thumb width from your shins. Feet hip width, toes forward.',
        '0.42|Push the hips BACK and reach down. Bend the knees only until your hands reach the bar. Grip just outside your shins.',
        '0.70|Now pull your shins forward to touch the bar and lift your chest. Hips finish slightly above your knees.'],
      st: tr('0|to2 na4 nb6 fa4 fb6',
        '0.22|=0',
        '0.42|y0.22 to62 ne-22 na2 nb2 fa2 fb2 nt74 ns-28 no86 ft76 fs-30 fo86',
        '0.70|y0.21 to60 ne-20 na0 nb0 fa0 fb0 nt75 ns-30 no86 ft77 fs-32 fo86') },
    latp: { sd: 10000, gr: 0.30,
      ss: ['0.30|Set the thigh pad down firmly on your legs first, then stand up and take the bar — do not sit down and then reach for it.',
        '0.62|Grip overhand, a little wider than your shoulders. Sit down with the bar already in your hands.'],
      st: tr('0|to0 na150 nb168 fa-150 fb-168',
        '0.30|to0 na152 nb170 fa-152 fb-170',
        '0.62|y0.235 to-8 na154 nb172 fa-154 fb-172 nt80 ns6 no86 ft-80 fs-6 fo-86') },
    crow: { sd: 9600, gr: 0.34,
      ss: ['0.34|Sit down and plant both feet on the platform, knees slightly bent. Lean forward to take the handle.',
        '0.64|Sit tall again using your legs, not your lower back. Chest up, arms long.'],
      st: tr('0|y0.235 to24 na70 nb70 fa70 fb70 nt70 ns16 no86 ft70 fs14 fo86',
        '0.34|y0.235 to30 na76 nb78 fa76 fb78 nt70 ns16 no86 ft70 fs14 fo86',
        '0.64|y0.235 to0 na72 nb76 fa72 fb76 nt70 ns16 no86 ft70 fs14 fo86') },
    dboh: { sd: 9600, gr: 0.34,
      ss: ['0.34|Stand the dumbbell on one thigh. Cup both hands flat around the TOP plate, thumbs wrapped underneath it.',
        '0.64|Press it straight overhead until your arms lock out and your elbows point forward, close to your head.'],
      st: tr('0|to2 na20 nb40 fa20 fb40',
        '0.34|to2 na16 nb-20 fa16 fb-20',
        '0.64|to2 na175 nb175 fa175 fb175') },
    flr: { sd: 8800, gr: 0,
      ss: ['0.36|Set the hands down first, slightly wider than your shoulders, fingers spread and pointing forward.',
        '0.68|Step both feet back until you are one straight line from heels to head.'],
      st: tr('0|y0.26 to78 ne-26 na28 nb34 fa28 fb34 nt-80 ns-80 no-6 ft-80 fs-80 fo-6',
        '0.36|y0.30 to82 ne-28 na10 nb14 fa10 fb14 nt-82 ns-82 no-10 ft-82 fs-82 fo-10',
        '0.68|y0.33 to84 ne-30 na2 nb6 fa2 fb6 nt-84 ns-84 no-14 ft-84 fs-84 fo-14') },
    flat: { sd: 10000, gr: 0.30,
      ss: ['0.30|Sit on the end of the bench with the weight on your thighs, then lie back and kick it up as you go.',
        '0.64|Pull the shoulder blades down and TOGETHER into the pad and keep them pinned. Feet flat and wide.'],
      st: tr('0|y0.235 to6 na24 nb46 fa24 fb46 nt80 ns6 no86 ft80 fs4 fo86',
        '0.30|y0.20 to-30 ne10 na40 nb90 fa40 fb90 nt56 ns-16 no86 ft58 fs-18 fo86',
        '0.64|y0.17 to-72 ne22 na120 nb168 fa120 fb168 nt46 ns-12 no86 ft48 fs-14 fo86') },
    incl: { sd: 10000, gr: 0.30,
      ss: ['0.30|Set the bench to 30–40°. Steeper than that and it becomes a shoulder press. Sit with the dumbbells on your thighs.',
        '0.64|Lie back and kick them up as you go. Shoulder blades pulled down and together into the pad.'],
      st: tr('0|y0.235 to6 na24 nb46 fa24 fb46 nt80 ns6 no86 ft80 fs4 fo86',
        '0.30|y0.20 to-24 ne8 na36 nb84 fa36 fb84 nt58 ns-16 no86 ft60 fs-18 fo86',
        '0.64|y0.17 to-48 ne16 na72 nb128 fa72 fb128 nt46 ns-12 no86 ft48 fs-14 fo86') },
    bss: { sd: 14000, gr: 0,
      ss: ['0.20|Sit on the bench facing away from it, both feet flat on the floor.',
        '0.40|Stretch the leg you want in FRONT straight out and rest the heel on the floor. That spot is your front foot position.',
        '0.60|Stand up so the front foot lands exactly on that mark. Do not shuffle it closer afterwards.',
        '0.82|Now lift the BACK foot up behind you and rest the top of the foot on the bench.'],
      st: tr('0|y0.235 to0 na84 nb40 fa84 fb40 nt78 ns8 no86 ft78 fs6 fo86',
        '0.20|=0',
        '0.40|y0.235 to0 na84 nb40 fa84 fb40 nt42 ns-32 no72 ft78 fs6 fo86',
        '0.60|to2 na6 nb10 fa6 fb10 nt2 ns1 ft-3 fs4',
        '0.82|to2 na6 nb10 fa6 fb10 nt2 ns1 ft-40 fs-138 fo-58') },
    dbrw: { sd: 10000, gr: 0.36,
      ss: ['0.36|Put one hand and the matching knee on the bench so your back is flat and roughly parallel with the floor.',
        '0.68|Plant the other foot on the floor with a slight knee bend. Hips square and level, dumbbell hanging straight down.'],
      st: tr('0|to2 na4 nb6 fa4 fb6',
        '0.36|y0.06 to72 ne-26 na0 nb0 fa46 fb52 nt10 ns-6 no86 ft-30 fs-118 fo-46',
        '0.68|y0.06 to74 ne-28 na0 nb0 fa46 fb52 nt10 ns-6 no86 ft-30 fs-118 fo-46') },
    dip: { sd: 9600, gr: 0.32,
      ss: ['0.32|Stand between the bars and grip them firmly with straight arms BEFORE you lift your feet.',
        '0.66|Press down through the hands, lock the elbows and cross the ankles behind you.'],
      st: tr('0|to2 na4 nb6 fa4 fb6',
        '0.32|to2 na6 nb8 fa6 fb8 nt2 ns1 ft-3 fs4',
        '0.66|y-0.04 to4 na4 nb6 fa4 fb6 nt34 ns-96 no-40 ft36 fs-98 fo-42') },
    seat: { sd: 8600, gr: 0,
      ss: ['0.34|Sit right back so your hips are in the corner of the seat and your whole back is on the pad.',
        '0.64|Line the machine pivot up with the middle of your knee joint, then hold the handles lightly.'],
      st: tr('0|y0.235 to-4 na70 nb50 fa70 fb50 nt90 ns10 no86 ft90 fs8 fo86',
        '0.34|y0.235 to-6 na80 nb36 fa80 fb36 nt90 ns10 no86 ft90 fs8 fo86',
        '0.64|y0.235 to-6 na84 nb30 fa84 fb30 nt90 ns8 no86 ft90 fs6 fo86') }
  };

  var EX = {

  /* ---------------- Monday ---------------- */

  goblet: {
    nm: 'Goblet Squat', tg: 'Quads · Glutes', vw: 'side', pr: 'goblet', rig: 'gob', al: 'knee',
    ld: '3 × 12–15 reps  ·  one dumbbell, 8–14 kg',
    rom: ['Down until your hip crease is just below the top of your kneecap',
      'Elbows travel down the inside of your thighs and finish inside your knees'],
    cu: ['Hold it like a chalice: hands cupped UNDER the top plate, not gripping the handle',
      'Elbows point straight down at the floor and stay tucked against your ribs',
      'The dumbbell stays pressed to your sternum all set — let it drift away and you fold forward'],
    sxs: ['1|Stand up and pull it in against your sternum. Elbows point straight down and stay tucked to your ribs.'],
    sxt: ['1|to2 na10 nb140 fa10 fb140 nt2 ns1 ft-3 fs4'],
    mk: ['0.62|knN|knee ≈ toe',
      '1|knN|mid-foot'],
    tc: ['0.3|Sit straight down between your hips — chest tall, elbows pointing at the floor.',
      '0.62|Bottom: hip crease just below the knee, elbows brushing the inside of the knees.'],
    tk: tr('0|to2 na10 nb140 fa10 fb140 nt2 ns1 ft-3 fs4',
      '0.28|y0.08 to8 na10 nb140 fa10 fb140 nt45 ns-14 no86 ft47 fs-16 fo86',
      '0.55|y0.19 to12 na10 nb138 fa10 fb138 nt74 ns-24 no86 ft76 fs-26 fo86',
      '1|=0')
  },

  legext: {
    nm: 'Leg Extension', tg: 'Quads', vw: 'side', pr: 'legext', rig: 'seat', al: null,
    ld: '3 × 12–15 reps  ·  machine, light to moderate',
    rom: ['Up until the knee is almost straight — stop just short of locking, and hold one second',
      'Down until the knee is bent past 90°, without the plates resting on the stack'],
    cu: ['The pad sits on the bone just above the ankle — not on your foot, not up the shin',
      'The machine pivot must line up with the middle of your knee, or the load goes to the joint',
      'Hips stay pinned to the seat; if they lift to help, go lighter'],
    sxs: ['1|Set the pad on the bone just above your ankle. Hold the handles lightly — do not brace so hard your back arches.'],
    sxt: ['1|y0.235 to-6 na84 nb30 fa84 fb30 nt90 ns8 no86 ft90 fs6 fo86'],
    mk: ['0.6|knN|near lock',
      '1|knN|past 90°'],
    tc: ['0.5|Straighten the knees smoothly — no kicking the weight up. Squeeze one second at the top.',
      '1|Lower slower than you lifted. The plates never clang back onto the stack.'],
    tk: tr('0|y0.235 to-6 na84 nb30 fa84 fb30 nt90 ns8 no86 ft90 fs6 fo86',
      '0.5|y0.235 to-6 na84 nb30 fa84 fb30 nt90 ns84 no92 ft90 fs82 fo92',
      '1|=0')
  },

  lunge: {
    nm: 'Walking Lunges', tg: 'Quads · Glutes', vw: 'side', pr: 'db2', rig: 'db2s', al: 'knee',
    ld: '3 × 12–15 reps per leg  ·  bodyweight or 2 × 5–10 kg',
    rom: ['Down until BOTH knees read about 90°',
      'The back knee stops about 2 cm off the floor — it touches nothing'],
    cu: ['Neutral grip, arms hanging dead straight — the dumbbells are ballast, not part of the movement',
      'Torso upright and stacked over your hips the whole rep',
      'Step long enough that both knees can reach 90°; a short step throws the knee past the toes'],
    sxs: ['1|Stand tall, shoulders back. Take a long step — long enough that both knees can reach 90°.'],
    sxt: ['1|y0.13 to5 na2 nb3 fa2 fb3 nt62 ns-8 no84 ft-14 fs-92 fo-16'],
    mk: ['0.6|knN|90°',
      '1|knN|heel drive'],
    tc: ['0.5|Drop straight down. The back knee travels to the floor, it does not push you forward.',
      '1|Push through the front heel to stand, then step straight into the next one.'],
    tk: tr('0|to3 na2 nb3 fa2 fb3 nt2 ns1 ft-3 fs3',
      '0.45|y0.13 to5 na2 nb3 fa2 fb3 nt62 ns-8 no84 ft-14 fs-92 fo-16',
      '0.60|y0.16 to6 na2 nb3 fa2 fb3 nt70 ns-10 no84 ft-15 fs-100 fo-20',
      '1|=0')
  },

  calf: {
    nm: 'Calf Raises', tg: 'Calves', vw: 'side', pr: 'step', rig: 'db2s', al: null,
    ld: '3 × 12–15 reps  ·  bodyweight, or hold 2 dumbbells',
    rom: ['Up onto the balls of your feet, heels as high as your ankles allow, held one second',
      'Down until the heels drop below the step and the calf stretches'],
    cu: ['Balls of the feet on the step, heels hanging completely free off the back',
      'Knees stay straight — bending them makes it a different exercise',
      'Rise straight up through the big toe, not out over the little toe'],
    sxs: ['1|Balls of both feet on the step, heels hanging free. Let the heels sink until the calf stretches.'],
    sxt: ['1|y0.065 to2 na3 nb4 fa3 fb4 nt2 ns2 no120 ft-2 fs2 fo120'],
    mk: ['0.5|anN|full height',
      '1|anN|heel below'],
    tc: ['0.5|Press through the big toe and rise as high as your ankles allow. Hold one second.',
      '1|Lower under control until the heels are below the step.'],
    tk: tr('0|y0.065 to2 na3 nb4 fa3 fb4 nt2 ns2 no120 ft-2 fs2 fo120',
      '0.5|y-0.09 to2 na3 nb4 fa3 fb4 nt2 ns2 no38 ft-2 fs2 fo38',
      '1|=0')
  },

  ohp: {
    nm: 'Dumbbell Shoulder Press', tg: 'Shoulders', vw: 'front', pr: 'db2', rig: 'db2f', al: null,
    ld: '3 × 12–15 reps  ·  2 dumbbells, 5–10 kg each',
    rom: ['Start with the elbow at 90° and the forearm dead vertical, hands at ear height',
      'Down only to shoulder height — the elbow never drops below the shoulder line'],
    cu: ['Forearms stay vertical the whole rep — wrist stacked directly over the elbow, never behind it',
      'Elbows sit just in front of your chest, about 30° forward, not flared flat out to the sides',
      'Ribs pulled down. Arching the lower back turns this into an incline press'],
    sxs: ['1|Bring them to ear height, palms forward. Elbow at 90°, forearm vertical, elbows just in front of your chest.'],
    sxt: ['1|to0 na92 nb178 fa-92 fb-178'],
    mk: ['0.25|elN|90°',
      '0.7|elN|locked out'],
    tc: ['0.5|Press up and slightly in until the arms are straight and the dumbbells nearly touch.',
      '1|Lower under control until the elbow is back to 90° and level with your shoulder — no lower.'],
    tk: tr('0|to0 na92 nb178 fa-92 fb-178 nt3 ns-2 ft-3 fs2',
      '0.5|to0 na168 nb176 fa-168 fb-176 nt3 ns-2 ft-3 fs2',
      '1|=0')
  },

  lateral: {
    nm: 'Lateral Raises', tg: 'Side delts', vw: 'front', pr: 'db2', rig: 'db2f', al: null, dbo: 'end',
    ld: '3 × 12–15 reps  ·  2 dumbbells, 2.5–6 kg each',
    rom: ['Up until your hands are level with your shoulders — never higher',
      'The elbow finishes a shade higher than the wrist'],
    cu: ['Neutral grip: the two dumbbells stay PARALLEL to each other, like a pair of rails',
      'Soft 10–20° bend in each elbow, set before the first rep and never changed',
      'Lead with the elbow, not the hand — the hand is just along for the ride'],
    sxs: ['1|Turn your palms to face each other so the dumbbells sit parallel. Set a soft bend in each elbow and keep exactly that bend.'],
    sxt: ['1|to3 na8 nb14 fa-8 fb-14'],
    mk: ['0.25|elN|soft bend',
      '0.75|elN|elbow high'],
    tc: ['0.5|Lead with the elbows and lift out to the side, stopping level with the shoulders.',
      '1|Lower slowly and resist the whole way down. This half builds the muscle.'],
    tk: tr('0|to2 na8 nb14 fa-8 fb-14 nt3 ns-2 ft-3 fs2',
      '0.5|to2 na85 nb80 fa-85 fb-80 nt3 ns-2 ft-3 fs2',
      '1|=0')
  },

  bbcurl: {
    nm: 'Barbell Bicep Curl', tg: 'Biceps', vw: 'side', pr: 'bar', rig: 'bars', al: 'elbow',
    ld: '3 × 12–15 reps  ·  barbell or EZ bar, 10–20 kg total',
    rom: ['Up until the bar reaches the top of your chest',
      'Through 90° the upper arm must still be vertical — if the elbow has drifted forward, the weight is too heavy'],
    cu: ['Grip underhand, hands about shoulder width — index fingers on the knurling rings',
      'Elbows pinned to your ribs and the upper arm dead vertical: only the forearm moves',
      'The elbow is a hinge, not a lever — it does not travel forward as you curl'],
    sxs: ['1|Stand tall, bar resting on your thighs. Elbows pinned to your ribs, upper arms vertical.'],
    sxt: ['1|to2 na2 nb4 fa2 fb4 nt2 ns1 ft-2 fs2'],
    mk: ['0.3|elN|90°',
      '0.62|elN|to chest'],
    tc: ['0.3|Curl by bending only at the elbow. Upper arm stays vertical.',
      '0.62|Top: bar at the top of your chest, wrists still straight.'],
    tk: tr('0|to2 na2 nb4 fa2 fb4 nt2 ns1 ft-2 fs2',
      '0.55|to2 na-2 nb164 fa-2 fb164 nt2 ns1 ft-2 fs2',
      '1|=0')
  },

  /* ---------------- Tuesday ---------------- */

  deadlift: {
    nm: 'Conventional Deadlift', tg: 'Posterior chain', vw: 'side', pr: 'bar', rig: 'dl', al: 'spine',
    ld: '3 × 6–8 reps  ·  barbell, build up from an empty 20 kg bar',
    rom: ['The bar leaves the floor and travels straight up, dragging your shins',
      'Lockout is hips and knees straight, glutes squeezed — not leaning back'],
    cu: ['Bar over the middle of your foot before you bend — about a thumb width from the shins',
      'Arms are hooks: dead straight, they never pull',
      'Take the slack out of the bar until it clicks, THEN push the floor away'],
    sxs: ['1|Squeeze your armpits, pull the slack out of the bar until it clicks, and brace hard.'],
    sxt: ['1|y0.21 to60 ne-20 na0 nb0 fa0 fb0 nt75 ns-30 no86 ft77 fs-32 fo86'],
    mk: ['0.55|knN|push the floor away',
      '1|knN|hips back first'],
    tc: ['0.45|Push the floor away with your legs. The bar drags straight up your shins.',
      '0.6|Lockout: stand tall, glutes squeezed. Do not lean back.'],
    tk: tr('0|y0.21 to60 ne-20 na0 nb0 fa0 fb0 nt75 ns-30 no86 ft77 fs-32 fo86',
      '0.3|y0.11 to46 ne-16 na0 nb0 fa0 fb0 nt44 ns-14 no86 ft46 fs-16 fo86',
      '0.55|to2 na2 nb2 fa2 fb2 nt2 ns1 ft-2 fs2',
      '1|=0')
  },

  bbrow: {
    nm: 'Barbell Bent-Over Row', tg: 'Lats · Mid back', vw: 'side', pr: 'bar', rig: 'bars', al: 'spine',
    ld: '3 × 10–12 reps  ·  barbell, moderate',
    rom: ['Pull until the bar touches your belly button — not your chest',
      'The elbow finishes behind your ribs, past the line of your back'],
    cu: ['Hinge to about 45° and keep that angle: no rowing yourself upright to finish a rep',
      'Overhand grip, hands just outside shoulder width',
      'Start each rep by pulling the shoulder blades together, then bend the elbows'],
    sxs: ['1|Hinge to about 45°, soft knees, back flat. Let the bar hang under your shoulders.'],
    sxt: ['1|y0.03 to62 ne-22 na0 nb0 fa0 fb0 nt14 ns-8 no86 ft16 fs-10 fo86'],
    mk: ['0.5|elN|elbow past the ribs',
      '1|elN|arms long'],
    tc: ['0.5|Blades together first, then drive the elbows back past your ribs.',
      '1|Lower until the arms are straight and the lats stretch. Torso does not move.'],
    tk: tr('0|y0.03 to62 ne-22 na0 nb0 fa0 fb0 nt14 ns-8 no86 ft16 fs-10 fo86',
      '0.5|y0.03 to62 ne-22 na-42 nb38 fa-42 fb38 nt14 ns-8 no86 ft16 fs-10 fo86',
      '1|=0')
  },

  srow: {
    nm: 'Seated Cable Row', tg: 'Mid back', vw: 'side', pr: 'cablerow', rig: 'crow', al: null,
    ld: '3 × 10–12 reps  ·  cable machine, close-grip handle',
    rom: ['Pull until the handle touches just above your belly button',
      'Elbows brush past your ribs and finish behind you'],
    cu: ['Torso stays vertical — do not rock backward and forward to move the stack',
      'Knees stay slightly bent the whole set; never lock them straight',
      'Start the pull with the shoulder blade, not the hand'],
    sxs: ['1|Sit tall, chest lifted, arms long. Let the blades reach forward without slumping.'],
    sxt: ['1|y0.235 to0 na72 nb76 fa72 fb76 nt70 ns16 no86 ft70 fs14 fo86'],
    mk: ['0.5|elN|elbow past the ribs',
      '1|elN|full stretch'],
    tc: ['0.5|Blades down and back first, then bend the elbows to the belly button.',
      '1|Let it draw the arms straight without pulling your torso forward.'],
    tk: tr('0|y0.235 to0 na72 nb76 fa72 fb76 nt70 ns16 no86 ft70 fs14 fo86',
      '0.5|y0.235 to-3 na-28 nb44 fa-28 fb44 nt70 ns16 no86 ft70 fs14 fo86',
      '1|=0')
  },

  rdfly: {
    nm: 'Bent-Over Rear Delt Fly', tg: 'Rear delts', vw: 'side', vwT: 'front', pr: 'db2', rig: 'db2s', al: 'spine', dbo: 'end',
    ld: '3 × 12–15 reps  ·  2 dumbbells, 2.5–6 kg each',
    rom: ['Open until the arms are level with your back — no higher',
      'Down until the dumbbells meet under your chest, arms hanging straight down'],
    cu: ['Hinge until your chest is nearly parallel with the floor, back flat, chin tucked',
      'Palms face each other; the dumbbells stay parallel through the whole arc',
      'Fixed soft elbow bend — if it opens and closes, this became a triceps move'],
    sxs: ['1|Hinge until your chest is nearly parallel with the floor, back flat, chin tucked. Let the dumbbells hang under your shoulders, palms facing each other.'],
    sxt: ['1|y0.03 to66 ne-24 na0 nb0 fa0 fb0 nt14 ns-8 no86 ft16 fs-10 fo86'],
    mk: ['0.25|elN|fixed soft bend',
      '0.75|elN|level with the back'],
    tc: ['0.5|Sweep out in a wide arc, leading with the elbows. Stop level with your back.',
      '1|Lower slowly all the way back under the shoulders.'],
    tk: tr('0|to2 na10 nb16 fa-10 fb-16 nt3 ns-2 ft-3 fs2',
      '0.5|to2 na88 nb84 fa-88 fb-84 nt3 ns-2 ft-3 fs2',
      '1|=0')
  },

  shrug: {
    nm: 'Shrugs', tg: 'Traps', vw: 'front', pr: 'db2', rig: 'db2f', al: null,
    ld: '3 × 12–15 reps  ·  2 heavy dumbbells or a barbell',
    rom: ['Straight up toward your ears, as high as the shoulders will go',
      'Hold the top for a full second'],
    cu: ['Straight up and straight down. Rolling the shoulders adds risk and no benefit',
      'Arms stay dead straight — the elbows never bend',
      'Head stays level; do not tip it forward or back'],
    sxs: ['1|Stand tall, arms hanging dead straight, weight resting against your thighs. Only the shoulders will move.'],
    sxt: ['1|to0 na4 nb6 fa-4 fb-6'],
    mk: null,
    tc: ['0.5|Lift the shoulders straight up toward your ears. Hold one second.',
      '1|Lower all the way down until the traps stretch.'],
    tk: tr('0|y0.02 to0 na4 nb6 fa-4 fb-6',
      '0.5|y-0.035 to0 na3 nb5 fa-3 fb-5',
      '1|=0')
  },

  ulat: {
    nm: 'Underhand Lat Pulldown', tg: 'Lats · Biceps', vw: 'front', pr: 'latpull', rig: 'latp', al: null,
    ld: '3 × 10–12 reps  ·  lat pulldown machine',
    rom: ['Pull until the bar touches the top of your chest — never behind your neck',
      'The elbows drive DOWN toward the floor and finish beside your ribs'],
    cu: ['Underhand grip about shoulder width, thumbs wrapped',
      'Lock the thigh pad down first, or the weight will lift you off the seat',
      'Lean back only about 10–15°, chest lifted toward the bar'],
    sxs: ['1|Sit tall, thighs locked under the pad, leaning back about 15° with the chest lifted.'],
    sxt: ['1|y0.235 to-12 na154 nb172 fa-154 fb-172 nt80 ns6 no86 ft-80 fs-6 fo-86'],
    mk: ['0.25|elN|shoulders down first',
      '0.75|elN|elbows to the ribs'],
    tc: ['0.5|Shoulders down, then elbows down to the ribs. Bar to the top of the chest.',
      '1|Let it rise until the arms are straight and the lats stretch long.'],
    tk: tr('0|y0.235 to-12 na154 nb172 fa-154 fb-172 nt80 ns6 no86 ft-80 fs-6 fo-86',
      '0.5|y0.235 to-14 na25 nb135 fa-25 fb-135 nt80 ns6 no86 ft-80 fs-6 fo-86',
      '1|=0')
  },

  ohext: {
    nm: 'Overhead Triceps Extension', tg: 'Triceps', vw: 'side', pr: 'db1', rig: 'dboh', al: 'elbow',
    ld: '3 × 12–15 reps  ·  one dumbbell, 6–12 kg, both hands',
    rom: ['Down until the dumbbell is behind your head and the triceps are fully stretched',
      'Up until the elbows lock out, with the upper arms still vertical'],
    cu: ['Cup both hands flat around the top plate, thumbs wrapped underneath — never hold the handle',
      'The elbows are the hinge: they point forward, stay close to your head and do not travel',
      'Only the forearms move. If the upper arms swing, go lighter'],
    sxs: ['1|Locked out overhead, elbows pointing forward and close to your head, ribs pulled down.'],
    sxt: ['1|to2 na175 nb175 fa175 fb175'],
    mk: ['0.5|elN|upper arm still',
      '1|elN|lock out'],
    tc: ['0.5|Bend only at the elbow and lower it behind your head.',
      '1|Straighten the elbows back to lockout and squeeze the triceps.'],
    tk: tr('0|to2 na175 nb175 fa175 fb175',
      '0.5|to2 na173 nb-30 fa173 fb-30',
      '1|=0')
  },

  /* ---------------- Wednesday ---------------- */

  pushup: {
    nm: 'Push-Ups', tg: 'Chest · Triceps', vw: 'side', pr: null, rig: 'flr', al: 'plank',
    ld: '3 × 10–15 reps  ·  bodyweight',
    rom: ['Down until your chest is just above the floor',
      'Up until the arms are straight and the shoulder blades spread wide'],
    cu: ['Hips and chest move together — the hips never sag or pike up first',
      'Elbows track back at about 45°, making an arrow shape, not a T',
      'Hands slightly wider than the shoulders, screwed into the floor'],
    sxs: ['1|Squeeze the glutes and brace. One straight line from heels to head before the first rep.'],
    sxt: ['1|y0.33 to84 ne-30 na2 nb6 fa2 fb6 nt-84 ns-84 no-14 ft-84 fs-84 fo-14'],
    mk: ['0.5|elN|elbows ≈ 45°',
      '1|elN|spread the blades'],
    tc: ['0.5|Lower with the elbows back at 45° until the chest is just off the floor.',
      '1|Press the floor away and spread the shoulder blades at the top.'],
    tk: tr('0|y0.33 to84 ne-30 na2 nb6 fa2 fb6 nt-84 ns-84 no-14 ft-84 fs-84 fo-14',
      '0.5|y0.435 to84 ne-30 na-38 nb44 fa-38 fb44 nt-84 ns-84 no-14 ft-84 fs-84 fo-14',
      '1|=0')
  },

  incdb: {
    nm: 'Incline Dumbbell Press', tg: 'Upper chest', vw: 'side', pr: 'incline', rig: 'incl', al: null,
    ld: '3 × 10–12 reps  ·  2 dumbbells, 8–14 kg each',
    rom: ['Down until you feel a stretch across the collarbones, elbows just below shoulder level',
      'Up until the arms are straight over the upper chest, dumbbells almost touching'],
    cu: ['Bench at 30–40°. Steeper and the front delts take the set',
      'Shoulder blades stay pinched and pinned down for every rep — that is what protects the shoulder',
      'Elbows about 45° from your body, never flared straight out'],
    sxs: ['1|Dumbbells at the top of your chest, elbows just below shoulder level, blades pinned.'],
    sxt: ['1|y0.17 to-48 ne16 na72 nb128 fa72 fb128 nt46 ns-12 no86 ft48 fs-14 fo86'],
    mk: ['0.5|elN|stretch, not strain',
      '1|elN|almost touching'],
    tc: ['0.5|Press up and slightly together, following the angle of the bench.',
      '1|Lower slowly until you feel the stretch across the collarbones.'],
    tk: tr('0|y0.17 to-48 ne16 na72 nb128 fa72 fb128 nt46 ns-12 no86 ft48 fs-14 fo86',
      '0.5|y0.17 to-48 ne16 na142 nb162 fa142 fb162 nt46 ns-12 no86 ft48 fs-14 fo86',
      '1|=0')
  },

  fly: {
    nm: 'Flat Bench Chest Fly', tg: 'Chest', vw: 'side', vwT: 'front', pr: 'bench', rig: 'flat', al: null, dbo: 'end',
    ld: '3 × 12–15 reps  ·  2 dumbbells, 5–10 kg each',
    rom: ['Open until the upper arms are level with your chest — never deeper than that',
      'Close until the dumbbells meet above the chest, without clanging them together'],
    cu: ['This is an arc, not a press: the elbow angle is set once and never changes',
      'Hug a barrel — wide, fixed, soft elbows',
      'Go noticeably lighter than your press; the long lever makes it feel far heavier'],
    sxs: ['1|Press them over your chest, palms facing each other, then set a wide fixed curve in the elbows.'],
    sxt: ['1|to0 na170 nb174 fa-170 fb-174'],
    mk: ['0.25|elN|fixed curve',
      '0.75|elN|level with the chest'],
    tc: ['0.5|Open wide in a slow arc, keeping that elbow angle frozen, until level with the chest.',
      '1|Bring them back together over the chest and squeeze like closing a hinge.'],
    tk: tr('0|to0 na170 nb174 fa-170 fb-174 nt3 ns-2 ft-3 fs2',
      '0.5|to0 na96 nb92 fa-96 fb-92 nt3 ns-2 ft-3 fs2',
      '1|=0')
  },

  decpr: {
    nm: 'Machine Decline Press', tg: 'Lower chest', vw: 'side', pr: 'chestmachine', rig: 'seat', al: null,
    ld: '3 × 10–12 reps  ·  decline press machine',
    rom: ['Press out until the arms are almost straight — never snap the elbows locked',
      'Return until you feel the stretch, without the plates resting on the stack'],
    cu: ['Seat height is the whole exercise: handles level with the LOWER half of your chest',
      'Elbows sit just below the handles, not up at shoulder height',
      'Back stays flat on the pad; do not let the shoulders roll forward as you press'],
    sxs: ['1|Adjust the seat so the handles sit at your lower chest, then pull the blades down and back.'],
    sxt: ['1|y0.235 to-16 ne8 na96 nb70 fa96 fb70 nt76 ns10 no86 ft76 fs8 fo86'],
    mk: ['0.5|elN|almost straight',
      '1|elN|stretch'],
    tc: ['0.5|Press out and slightly down along the machine path. Stop just short of locking.',
      '1|Return slowly until the chest stretches, keeping tension on the stack.'],
    tk: tr('0|y0.235 to-16 ne8 na96 nb70 fa96 fb70 nt76 ns10 no86 ft76 fs8 fo86',
      '0.5|y0.235 to-16 ne8 na72 nb76 fa72 fb76 nt76 ns10 no86 ft76 fs8 fo86',
      '1|=0')
  },

  revcurl: {
    nm: 'Reverse Curl', tg: 'Forearms · Brachialis', vw: 'side', pr: 'bar', rig: 'bars', al: 'elbow',
    ld: '3 × 12–15 reps  ·  lighter than your normal curl',
    rom: ['Up until the bar reaches chest height, wrists still flat',
      'Down until the arms are completely straight'],
    cu: ['Overhand grip, knuckles up, thumbs wrapped over the top',
      'Wrists stay flat and rigid — they must not bend back under the load',
      'Elbows pinned at your sides, no swinging from the shoulders or hips'],
    sxs: ['1|Overhand grip, shoulder width. Wrists locked flat, elbows pinned to your ribs.'],
    sxt: ['1|to2 na2 nb4 fa2 fb4 nt2 ns1 ft-2 fs2'],
    mk: ['0.3|elN|90°',
      '1|elN|wrists flat'],
    tc: ['0.5|Curl up with the knuckles leading. Wrists stay flat the whole way.',
      '1|Lower slowly to completely straight arms.'],
    tk: tr('0|to2 na2 nb4 fa2 fb4 nt2 ns1 ft-2 fs2',
      '0.55|to2 na-2 nb160 fa-2 fb160 nt2 ns1 ft-2 fs2',
      '1|=0')
  },

  cardio: {
    nm: 'Cycling or Walking', tg: 'Easy cardio', vw: 'side', pr: null, rig: null, al: null,
    ld: '20 minutes steady  ·  easy, conversational pace',
    rom: ['Twenty unbroken minutes at a pace you could hold a conversation at'],
    cu: ['Easy on purpose — this is here to help you recover, not to add fatigue',
      'Walking: land under your hips with a quiet foot, not out in front with a heavy heel',
      'Cycling: set the saddle so the knee is only slightly bent at the bottom of the stroke'],
    sd: 8000,
    ss: ['0.5|Set an easy pace you could hold a conversation at. This is recovery work, not a race.',
      '1|Stay tall through the ribs. Eyes on the horizon, not on the floor.'],
    st: tr('0|to2 na4 nb6 fa4 fb6', '0.5|to3 na4 nb6 fa4 fb6', '1|=0'),
    mk: null,
    tc: ['0.5|Land under your hips and roll heel to toe. Keep the steps quiet.',
      '1|Breathe through the nose if you can. Twenty steady minutes beats five hard ones.'],
    tk: tr('0|to3 na24 nb30 fa-24 fb-30 nt22 ns-14 no86 ft-22 fs10 fo70',
      '0.5|to3 na4 nb6 fa4 fb6 nt2 ns1 ft-2 fs2',
      '1|to3 na-24 nb-30 fa24 fb30 nt-22 ns10 no70 ft22 fs-14 fo86')
  },

  /* ---------------- Thursday ---------------- */

  rdl: {
    nm: 'Romanian Deadlift', tg: 'Hamstrings · Glutes', vw: 'side', pr: 'bar', rig: 'bars', al: 'spine',
    ld: '3 × 10–12 reps  ·  barbell or 2 dumbbells, moderate',
    rom: ['Down until the hamstrings stop you — usually just below the knee, back still flat',
      'Up until the hips are through and the glutes squeeze. Do not lean back at the top'],
    cu: ['Unlock the knees a small amount, then FREEZE that angle for the whole set',
      'Push the hips back toward the wall behind you — this is a hinge, not a squat',
      'The bar slides down your thighs and stays in contact the whole way'],
    sxs: ['1|Stand tall, bar on your thighs. Unlock the knees slightly and keep exactly that bend.'],
    sxt: ['1|to2 na2 nb4 fa2 fb4 nt8 ns-4 no86 ft10 fs-6 fo86'],
    mk: ['0.5|knN|knee angle frozen',
      '1|knN|hips through'],
    tc: ['0.5|Push the hips straight back. The bar slides down your thighs.',
      '1|Drive the hips forward to stand and squeeze the glutes.'],
    tk: tr('0|to2 na2 nb4 fa2 fb4 nt8 ns-4 no86 ft10 fs-6 fo86',
      '0.5|y0.02 to64 ne-22 na0 nb0 fa0 fb0 nt12 ns-6 no86 ft14 fs-8 fo86',
      '1|=0')
  },

  legcurl: {
    nm: 'Seated Leg Curl', tg: 'Hamstrings', vw: 'side', pr: 'legcurl', rig: 'seat', al: null,
    ld: '3 × 12–15 reps  ·  machine, light to moderate',
    rom: ['Curl the heels down and under until the hamstrings fully shorten, held one second',
      'Return until the legs are almost straight and the hamstrings are on stretch'],
    cu: ['Pad low, on the back of the ankle just above the heels',
      'Hips stay glued to the seat — lifting them to help means it is too heavy',
      'Point the toes gently toward your shins to keep the calves out of it'],
    sxs: ['1|Ankle pad just above the heels, thigh pad snug, knee lined up with the pivot.'],
    sxt: ['1|y0.235 to-6 na84 nb30 fa84 fb30 nt90 ns-70 no30 ft90 fs-72 fo28'],
    mk: ['0.5|knN|squeeze, hold 1s',
      '1|knN|full stretch'],
    tc: ['0.5|Curl the heels down and under the seat, bending only at the knee. Hold one second.',
      '1|Let the legs straighten slowly. Never let the weight yank them back.'],
    tk: tr('0|y0.235 to-6 na84 nb30 fa84 fb30 nt90 ns-70 no30 ft90 fs-72 fo28',
      '0.5|y0.235 to-6 na84 nb30 fa84 fb30 nt90 ns26 no86 ft90 fs24 fo86',
      '1|=0')
  },

  bssq: {
    nm: 'Bulgarian Split Squat', tg: 'Quads · Glutes', vw: 'side', pr: 'box', rig: 'bss', al: 'knee',
    ld: '3 × 10–12 reps per leg  ·  bodyweight first, then 2 light dumbbells',
    rom: ['Down until the FRONT knee bends just past 90° — a little more, but not much more',
      'The back knee drops toward the floor; up until the front leg is straight'],
    cu: ['Set the distance by sitting first and stretching the front leg out — never guess the step length',
      'The front shin stays close to vertical; the knee travels only a little past the ankle',
      'Hips stay square and level. The back hip must not rotate open'],
    sxs: ['1|Square the hips, stand tall, and settle your weight into the front heel and mid-foot.'],
    sxt: ['1|to4 na6 nb10 fa6 fb10 nt2 ns1 ft-40 fs-138 fo-58'],
    mk: ['0.6|knN|just past 90°',
      '1|knN|front heel drive'],
    tc: ['0.5|Lower straight down. The back knee travels toward the floor, not forward.',
      '1|Push through the whole front foot to stand. The back leg only balances you.'],
    tk: tr('0|to4 na6 nb10 fa6 fb10 nt2 ns1 ft-40 fs-138 fo-58',
      '0.55|y0.17 to10 na6 nb10 fa6 fb10 nt70 ns-12 no84 ft-30 fs-150 fo-70',
      '1|=0')
  },

  sumo: {
    nm: 'Sumo Squat', tg: 'Glutes · Inner thigh', vw: 'front', pr: 'db1', rig: 'gob', al: 'knee',
    ld: '3 × 12–15 reps  ·  one dumbbell, 8–16 kg',
    rom: ['Down until the thighs are at or just below parallel',
      'Up until the hips and knees are straight, glutes and inner thighs squeezed'],
    cu: ['Stance noticeably wider than your shoulders, toes turned out 35–40°',
      'Knees track in the same direction the toes point — push them OUT the whole way down',
      'Torso stays much more upright than a normal squat; the width does the work'],
    sxs: ['1|Stand tall, dumbbell hanging at arm\'s length between your thighs, knees pushed out.'],
    sxt: ['1|to0 na4 nb6 fa-4 fb-6 nt20 ns2 no90 ft-20 fs-2 fo-90'],
    mk: ['0.55|knN|knees out over the toes',
      '1|knN|squeeze at the top'],
    tc: ['0.5|Sit straight down between your heels, actively pushing the knees outward.',
      '1|Drive up through the heels and squeeze the glutes and inner thighs.'],
    tk: tr('0|to0 na4 nb6 fa-4 fb-6 nt20 ns2 no90 ft-20 fs-2 fo-90',
      '0.5|y0.15 to0 na4 nb6 fa-4 fb-6 nt56 ns14 no90 ft-56 fs-14 fo-90',
      '1|=0')
  },

  mtn: {
    nm: 'Mountain Climbers', tg: 'Core · Conditioning', vw: 'side', pr: null, rig: 'flr', al: 'plank',
    ld: 'HIIT  ·  3 rounds of 30 seconds fast, 30 seconds rest',
    rom: ['Drive each knee toward your chest and return it fully, without the hips moving'],
    cu: ['Hips stay level — the moment they bounce up and down, slow the pace',
      'Shoulders stay stacked over the wrists for the whole interval',
      'Land on the ball of the foot softly rather than stamping'],
    sxs: ['1|Squeeze the glutes and brace hard. The plank has to hold at speed.'],
    sxt: ['1|y0.33 to84 ne-30 na2 nb6 fa2 fb6 nt-84 ns-84 no-14 ft-84 fs-84 fo-14'],
    mk: null,
    tc: ['0.5|Drive one knee toward the chest, quick and light. Hips stay level.',
      '1|Switch. Shoulders stay over the wrists — do not drift back.'],
    tk: tr('0|y0.33 to84 ne-30 na2 nb6 fa2 fb6 nt-84 ns-84 no-14 ft-84 fs-84 fo-14',
      '0.25|y0.33 to84 ne-30 na2 nb6 fa2 fb6 nt34 ns-78 no14 ft-84 fs-84 fo-14',
      '0.5|=0',
      '0.75|y0.33 to84 ne-30 na2 nb6 fa2 fb6 nt-84 ns-84 no-14 ft34 fs-78 fo14',
      '1|=0')
  },

  tap: {
    nm: 'Shoulder Taps', tg: 'Core · Anti-rotation', vw: 'side', pr: null, rig: 'flr', al: 'plank',
    ld: 'HIIT  ·  3 rounds of 30 seconds, 30 seconds rest',
    rom: ['Lift one hand, tap the opposite shoulder, and place it back down softly'],
    cu: ['The hips are the exercise — if they rock side to side, widen your feet and slow down',
      'Feet wider than your hips gives you a stable base',
      'The supporting shoulder stays stacked over its wrist and pushed away from the floor'],
    sxs: ['1|Widen the feet to shoulder width and brace. Every tap happens without the hips turning.'],
    sxt: ['1|y0.33 to84 ne-30 na2 nb6 fa2 fb6 nt-84 ns-84 no-14 ft-84 fs-84 fo-14'],
    mk: null,
    tc: ['0.5|Lift one hand and tap the opposite shoulder. The hips do not rotate.',
      '1|Place it back under the shoulder softly, then switch.'],
    tk: tr('0|y0.33 to84 ne-30 na2 nb6 fa2 fb6 nt-84 ns-84 no-14 ft-84 fs-84 fo-14',
      '0.28|y0.33 to84 ne-30 na-58 nb-128 fa2 fb6 nt-84 ns-84 no-14 ft-84 fs-84 fo-14',
      '0.5|=0',
      '0.78|y0.33 to84 ne-30 na2 nb6 fa-58 fb-128 nt-84 ns-84 no-14 ft-84 fs-84 fo-14',
      '1|=0')
  },

  suitcase: {
    nm: 'Suitcase Hold', tg: 'Obliques · Grip', vw: 'front', pr: 'db1', rig: 'db2f', al: 'plumb',
    ld: 'HIIT  ·  3 rounds of 30 seconds per side',
    rom: ['Stand dead vertical for the full interval, then switch hands'],
    cu: ['One heavy weight, one hand, arm hanging straight down',
      'Shoulders stay LEVEL — do not let the loaded side drop or the free side hike up',
      'Ribs down, glutes on, stand as tall as you can'],
    sxs: ['1|One heavy dumbbell in one hand, arm hanging straight. Stand dead vertical.'],
    sxt: ['1|to0 na4 nb6 fa-4 fb-6'],
    mk: null,
    tc: ['0.5|Ribs down, shoulders level, glutes on. Fight the lean.',
      '1|Hold tall for the whole interval, then switch hands.'],
    tk: tr('0|to0 na4 nb6 fa-4 fb-6', '0.5|to0.6 ne-0.5 na5 nb7 fa-5 fb-7', '1|=0')
  },

  /* ---------------- Friday ---------------- */

  latpd: {
    nm: 'Lat Pulldown', tg: 'Lats', vw: 'front', pr: 'latpull', rig: 'latp', al: null,
    ld: '3 × 10–12 reps  ·  wide overhand grip',
    rom: ['Pull until the bar touches the top of your chest — never behind your neck',
      'Let it rise until the arms are straight and the shoulders travel up toward your ears'],
    cu: ['Overhand grip a little wider than your shoulders, thumbs wrapped',
      'Think of the hands as hooks; the elbows drive the movement straight down',
      'Pull the shoulders down away from your ears before you bend the elbows'],
    sxs: ['1|Sit tall with the thighs locked under the pad, chest lifted, leaning back about 15°.'],
    sxt: ['1|y0.235 to-12 na150 nb166 fa-150 fb-166 nt80 ns6 no86 ft-80 fs-6 fo-86'],
    mk: ['0.25|elN|shoulders down first',
      '0.75|elN|elbows to the floor'],
    tc: ['0.5|Shoulders down first, then drive the elbows toward the floor. Bar to the chest.',
      '1|Let it rise until the arms are straight and the lats stretch long.'],
    tk: tr('0|y0.235 to-12 na150 nb166 fa-150 fb-166 nt80 ns6 no86 ft-80 fs-6 fo-86',
      '0.5|y0.235 to-14 na30 nb128 fa-30 fb-128 nt80 ns6 no86 ft-80 fs-6 fo-86',
      '1|=0')
  },

  sarow: {
    nm: 'Single-Arm Row', tg: 'Lats', vw: 'side', pr: 'db1', rig: 'dbrw', al: 'spine',
    ld: '3 × 10–12 reps per arm  ·  one dumbbell, 10–18 kg',
    rom: ['Pull until the dumbbell arrives beside your hip and the elbow is above your back',
      'Lower until the arm is straight and the shoulder blade reaches toward the floor'],
    cu: ['Row to the HIP, not the armpit — that keeps the lat working instead of the biceps',
      'The torso must not twist. If your shoulder rotates up to finish, go lighter',
      'Pull the shoulder blade back toward your spine first, then drive the elbow'],
    sxs: ['1|Back flat and parallel with the floor, hips square, dumbbell hanging under the shoulder.'],
    sxt: ['1|y0.06 to74 ne-28 na0 nb0 fa46 fb52 nt10 ns-6 no86 ft-30 fs-118 fo-46'],
    mk: ['0.5|elN|elbow to the hip',
      '1|elN|full stretch'],
    tc: ['0.5|Blade back first, then drive the elbow up past your ribs to the hip.',
      '1|Lower all the way and let the shoulder blade travel forward.'],
    tk: tr('0|y0.06 to74 ne-28 na0 nb0 fa46 fb52 nt10 ns-6 no86 ft-30 fs-118 fo-46',
      '0.5|y0.06 to74 ne-28 na-46 nb40 fa46 fb52 nt10 ns-6 no86 ft-30 fs-118 fo-46',
      '1|=0')
  },

  bench: {
    nm: 'Flat Bench Press', tg: 'Chest', vw: 'side', pr: 'bench', rig: 'flat', al: null,
    ld: '3 × 8–12 reps  ·  barbell or 2 dumbbells',
    rom: ['Down until the bar touches your MID-chest, and pause — it never bounces off you',
      'Up until the arms are straight, bar back over the shoulders'],
    cu: ['Thumbs always wrapped around the bar. Never a thumbless grip on a bench press',
      'Shoulder blades squeezed together and pulled down for every single rep',
      'Elbows tucked to about 45°, not flared out to a T'],
    sxs: ['1|Grip a little wider than shoulder width, thumbs wrapped. Blades pinned, small natural arch.'],
    sxt: ['1|y0.17 to-72 ne22 na160 nb172 fa160 fb172 nt46 ns-12 no86 ft48 fs-14 fo86'],
    mk: ['0.5|elN|elbows ≈ 45°',
      '1|elN|straight over the shoulders'],
    tc: ['0.5|Lower under control with the elbows at 45° until the bar touches your mid-chest.',
      '1|Press back up in a slight arc toward the shoulders and finish with straight arms.'],
    tk: tr('0|y0.17 to-72 ne22 na160 nb172 fa160 fb172 nt46 ns-12 no86 ft48 fs-14 fo86',
      '0.5|y0.17 to-72 ne22 na92 nb134 fa92 fb134 nt46 ns-12 no86 ft48 fs-14 fo86',
      '1|=0')
  },

  arnold: {
    nm: 'Arnold Press', tg: 'Shoulders', vw: 'front', pr: 'db2', rig: 'db2f', al: null,
    ld: '3 × 10–12 reps  ·  lighter than your normal shoulder press',
    rom: ['Start with the palms facing YOU, elbows tucked in front of your chest',
      'Finish overhead with the palms facing forward and the arms straight'],
    cu: ['The rotation is spread across the whole rep — never press first and twist at the top',
      'Use less weight than a straight shoulder press; the rotation is the point',
      'Ribs stay down and the back flat against the pad'],
    sxs: ['1|Palms facing you, dumbbells close together in front of your chest, elbows tucked down.'],
    sxt: ['1|to0 na30 nb96 fa-30 fb-96'],
    mk: ['0.25|elN|palms toward you',
      '0.75|elN|palms forward, locked'],
    tc: ['0.5|Rotate the palms outward as the elbows open and you press. Both happen together.',
      '1|Reverse it exactly: lower and rotate until the palms face you again.'],
    tk: tr('0|to0 na30 nb96 fa-30 fb-96 nt3 ns-2 ft-3 fs2',
      '0.5|to0 na168 nb176 fa-168 fb-176 nt3 ns-2 ft-3 fs2',
      '1|=0')
  },

  dbcurl: {
    nm: 'Dumbbell Bicep Curls', tg: 'Biceps', vw: 'side', pr: 'db2', rig: 'db2s', al: 'elbow',
    ld: '3 × 12–15 reps  ·  2 dumbbells, 5–12 kg each',
    rom: ['Up until the dumbbell reaches the front of your shoulder',
      'Down until the arm is completely straight, every rep'],
    cu: ['The upper arm stays vertical and still — only the forearm moves',
      'Elbows pinned to your ribs; they never travel forward',
      'No swinging at the hips or leaning back to help the weight up'],
    sxs: ['1|Stand tall, palms forward, elbows pinned to your ribs and shoulders back.'],
    sxt: ['1|to2 na2 nb4 fa2 fb4 nt2 ns1 ft-2 fs2'],
    mk: ['0.3|elN|90°',
      '1|elN|straighten fully'],
    tc: ['0.5|Curl by bending only at the elbow, up to the front of the shoulder.',
      '1|Lower slowly to a completely straight arm.'],
    tk: tr('0|to2 na2 nb4 fa2 fb4 nt2 ns1 ft-2 fs2',
      '0.55|to2 na-2 nb164 fa-2 fb164 nt2 ns1 ft-2 fs2',
      '1|=0')
  },

  dips: {
    nm: 'Dips', tg: 'Chest · Triceps', vw: 'side', pr: 'dip', rig: 'dip', al: null,
    ld: '3 × 8–12 reps  ·  parallel bars, or a bench for an easier version',
    rom: ['Down until the upper arms reach parallel with the floor — that is deep enough',
      'Up until the arms are straight, shoulders still pulled down'],
    cu: ['Stop at upper-arm-parallel. Deeper puts the shoulder in its most vulnerable position',
      'Elbows travel backward and stay close; never let them flare out sideways',
      'Shoulders stay pressed down the whole rep — never sink into a shrug'],
    sxs: ['1|Arms straight, shoulders pulled down away from your ears, a small forward lean.'],
    sxt: ['1|y-0.04 to6 na4 nb6 fa4 fb6 nt34 ns-96 no-40 ft36 fs-98 fo-42'],
    mk: ['0.5|elN|upper arm to parallel',
      '1|elN|shoulders down'],
    tc: ['0.5|Bend the elbows straight back, close to your body, to upper-arm-parallel.',
      '1|Press back up to straight arms with the shoulders still pulled down.'],
    tk: tr('0|y-0.04 to6 na4 nb6 fa4 fb6 nt34 ns-96 no-40 ft36 fs-98 fo-42',
      '0.5|y0.10 to8 na-40 nb52 fa-40 fb52 nt34 ns-96 no-40 ft36 fs-98 fo-42',
      '1|=0')
  },

  idle: { nm: 'Idle', vw: 'front', al: null, pr: null,
    tk: tr('0|to1 na6 nb9 fa-6 fb-9 nt2 ns-1 ft-2 fs1',
           '0.5|y0.012 to2.5 ne-1 na8 nb12 fa-8 fb-12 nt3 ns-2 ft-3 fs2',
           '1|=0'),
    st: tr('0|to1 na6 nb9 fa-6 fb-9') },

  cheer: { nm: 'Cheer', vw: 'front', al: null, pr: null,
    tk: tr('0|y0.05 to0 nt16 ns-18 ft-16 fs18 na128 nb150 fa-128 fb-150',
           '0.45|y-0.14 to0 ne-6 nt14 ns24 ft-14 fs-24 na146 nb160 fa-146 fb-160',
           '1|=0'),
    st: tr('0|y0.05 to0 na128 nb150 fa-128 fb-150') }
  };

  /* ------------------------------------------------------------------ *
   * The training week
   *
   * Monday is built. The other four days are listed so the week reads as a
   * whole, but they are placeholders until their exercises are authored.
   * ------------------------------------------------------------------ */

  var WEEK = [
    { id: 'mon', short: 'Mon', name: 'Monday', focus: 'Legs · Shoulders · Biceps',
      list: ['goblet', 'legext', 'lunge', 'calf', 'ohp', 'lateral', 'bbcurl'] },
    { id: 'tue', short: 'Tue', name: 'Tuesday', focus: 'Back · Triceps',
      list: ['deadlift', 'bbrow', 'srow', 'rdfly', 'shrug', 'ulat', 'ohext'] },
    { id: 'wed', short: 'Wed', name: 'Wednesday', focus: 'Chest · Forearms · Cardio',
      list: ['pushup', 'incdb', 'fly', 'decpr', 'revcurl', 'cardio'] },
    { id: 'thu', short: 'Thu', name: 'Thursday', focus: 'Hamstrings · Glutes · HIIT',
      list: ['rdl', 'legcurl', 'bssq', 'sumo', 'mtn', 'tap', 'suitcase'] },
    { id: 'fri', short: 'Fri', name: 'Friday', focus: 'Back · Chest · Shoulders · Arms',
      list: ['latpd', 'sarow', 'bench', 'arnold', 'dbcurl', 'dips'] },
    { id: 'sat', short: 'Sat', name: 'Saturday', focus: 'Rest day', rest: true },
    { id: 'sun', short: 'Sun', name: 'Sunday', focus: 'Rest day', rest: true }
  ];

  /* getDay() is 0=Sunday; the week above starts on Monday. */
  var DAY_INDEX = [6, 0, 1, 2, 3, 4, 5];
  function dayFor(d) { return WEEK[DAY_INDEX[d.getDay()]]; }
  function dayById(id) {
    for (var i = 0; i < WEEK.length; i++) if (WEEK[i].id === id) return WEEK[i];
    return null;
  }
  function keyOf(d) {
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  /* fitBox caches per id, so every entry needs to know its own key */
  /* Splice each exercise's own closing step onto its shared setup reel. */
  for (var _k in EX) {
    if (!EX.hasOwnProperty(_k)) continue;
    var _e = EX[_k], _r = RIG[_e.rig];
    _e.id = _k;
    if (!_r) continue;
    _e.sd = _r.sd;
    _e.gr = _r.gr;
    _e.ss = _r.ss.concat(_e.sxs || []);
    _e.st = _r.st.concat(tr.apply(null, _e.sxt || []));
  }
  /* ------------------------------------------------------------------ *
   * Rendering
   * ------------------------------------------------------------------ */

  function rad(d) { return d * Math.PI / 180; }
  function dir(a) { var r = rad(a); return { x: Math.sin(r), y: Math.cos(r) }; }
  function add(p, d, len) { return { x: p.x + d.x * len, y: p.y + d.y * len }; }

  function solve(p, view) {
    var hipHalf = view === 'front' ? B.hipHalfFront : B.hipHalfSide;
    var shHalf = view === 'front' ? B.shHalfFront : B.shHalfSide;
    var t = rad(p.torso);
    var up = { x: Math.sin(t), y: -Math.cos(t) };
    var perp = { x: -up.y, y: up.x };

    var pelvis = { x: p.x, y: p.y };
    var neck = add(pelvis, up, B.spine);
    var curveAmt = p.curve * 0.0016;
    var ctrl = {
      x: (pelvis.x + neck.x) / 2 + perp.x * curveAmt * -1 + up.x * 0.02,
      y: (pelvis.y + neck.y) / 2 + perp.y * curveAmt * -1 + up.y * 0.02
    };

    var ha = rad(p.torso + p.neck);
    var headDir = { x: Math.sin(ha), y: -Math.cos(ha) };
    var head = add(neck, headDir, B.neckToHead);

    var farSh = add(neck, perp, -shHalf);
    var nearSh = add(neck, perp, shHalf);
    var farHip = add(pelvis, perp, -hipHalf);
    var nearHip = add(pelvis, perp, hipHalf);

    function arm(sh, u, f) {
      var e = add(sh, dir(u), B.upperArm * p.armScale);
      return { shoulder: sh, elbow: e, wrist: add(e, dir(f), B.foreArm * p.armScale) };
    }
    function leg(hip, tAng, sAng, fAng, sc) {
      var k = add(hip, dir(tAng), B.thigh * sc);
      var a = add(k, dir(sAng), B.shank * sc);
      return { hip: hip, knee: k, ankle: a, toe: add(a, dir(fAng), B.foot * sc) };
    }

    return {
      pelvis: pelvis, neck: neck, ctrl: ctrl, head: head, headDir: headDir,
      up: up, perp: perp,
      farArm: arm(farSh, p.fau, p.faf),
      nearArm: arm(nearSh, p.nau, p.naf),
      farLeg: leg(farHip, p.flt, p.fls, p.flf, p.flScale),
      nearLeg: leg(nearHip, p.nlt, p.nls, p.nlf, p.nlScale)
    };
  }

  /* Screen-space transform for a figure */
  function makeTx(ox, oy, S, mir) {
    return function (pt) { return { x: ox + pt.x * S * mir, y: oy + pt.y * S }; };
  }

  function seg(g, a, b, w, col, S) {
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(5,7,18,0.9)';
    g.lineWidth = w * S + Math.max(2, S * 0.012);
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    g.strokeStyle = col;
    g.lineWidth = w * S;
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
  }

  function limbChain(g, pts, widths, col, S) {
    for (var i = 0; i < pts.length - 1; i++) seg(g, pts[i], pts[i + 1], widths[i], col, S);
  }

  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
    var gg = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
    var b = Math.max(0, Math.min(255, (n & 255) + amt));
    return 'rgb(' + r + ',' + gg + ',' + b + ')';
  }

  function drawTorso(g, s, tx, S, tone) {
    var N = 14, i, u;
    var left = [], right = [];
    for (i = 0; i <= N; i++) {
      u = i / N;
      var a = s.pelvis, c = s.ctrl, b = s.neck;
      var pt = {
        x: (1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * c.x + u * u * b.x,
        y: (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * c.y + u * u * b.y
      };
      var d = {
        x: 2 * (1 - u) * (c.x - a.x) + 2 * u * (b.x - c.x),
        y: 2 * (1 - u) * (c.y - a.y) + 2 * u * (b.y - c.y)
      };
      var m = Math.sqrt(d.x * d.x + d.y * d.y) || 1;
      var nx = -d.y / m, ny = d.x / m;
      /* hips, nipped waist, ribcage, then a narrow shoulder yoke */
      var hw = 0.070 - 0.016 * Math.sin(Math.PI * Math.min(1, u * 1.9)) + 0.020 * Math.pow(u, 2.2);
      left.push(tx({ x: pt.x + nx * hw, y: pt.y + ny * hw }));
      right.push(tx({ x: pt.x - nx * hw, y: pt.y - ny * hw }));
    }

    function bandColor(u) {
      if (u < 0.40) return tone.legs;
      if (u < 0.53) return tone.skin;
      return tone.top;
    }
    for (i = 0; i < N; i++) {
      var u0 = i / N;
      g.beginPath();
      g.moveTo(left[i].x, left[i].y);
      g.lineTo(left[i + 1].x, left[i + 1].y);
      g.lineTo(right[i + 1].x, right[i + 1].y);
      g.lineTo(right[i].x, right[i].y);
      g.closePath();
      g.fillStyle = bandColor(u0);
      g.fill();
      /* hairline overdraw kills the seams between strips */
      g.strokeStyle = bandColor(u0);
      g.lineWidth = 1;
      g.stroke();
    }

    g.beginPath();
    g.moveTo(left[0].x, left[0].y);
    for (i = 1; i < left.length; i++) g.lineTo(left[i].x, left[i].y);
    for (i = right.length - 1; i >= 0; i--) g.lineTo(right[i].x, right[i].y);
    g.closePath();
    g.strokeStyle = 'rgba(5,7,18,0.9)';
    g.lineWidth = Math.max(2, S * 0.012);
    g.lineJoin = 'round';
    g.stroke();

    g.beginPath();
    var start = Math.round(N * 0.55);
    for (i = start; i < left.length; i++) {
      if (i === start) g.moveTo(left[i].x, left[i].y); else g.lineTo(left[i].x, left[i].y);
    }
    g.strokeStyle = tone.topLit;
    g.globalAlpha = 0.6;
    g.lineWidth = Math.max(1.5, S * 0.009);
    g.stroke();
    g.globalAlpha = 1;
  }

  function drawYoke(g, s, tx, S, tone) {
    var neck = tx(s.neck), head = tx(s.head);
    g.strokeStyle = tone.skin;
    g.lineCap = 'round';
    g.lineWidth = S * 0.052;
    g.beginPath();
    g.moveTo(neck.x, neck.y);
    g.lineTo(neck.x + (head.x - neck.x) * 0.55, neck.y + (head.y - neck.y) * 0.55);
    g.stroke();
    [s.farArm.shoulder, s.nearArm.shoulder].forEach(function (pt, i) {
      var c = tx(pt);
      g.beginPath();
      g.arc(c.x, c.y, S * 0.037, 0, Math.PI * 2);
      g.fillStyle = i === 0 ? shade(tone.top, -45) : tone.top;
      g.strokeStyle = 'rgba(5,7,18,0.9)';
      g.lineWidth = Math.max(1.5, S * 0.01);
      g.fill();
      g.stroke();
    });
  }

  function drawHead(g, s, tx, S, view, mir, tone, timeMs) {
    var h = tx(s.head);
    var R = B.headR * S;
    var faceX = mir >= 0 ? 1 : -1;

    /* ponytail: sits behind the head and lags the motion */
    var sway = Math.sin(timeMs / 420) * 0.16 + Math.sin(timeMs / 190) * 0.06;
    var back = { x: h.x - faceX * R * 0.85, y: h.y - R * 0.25 };
    var tip = { x: back.x - faceX * R * (2.0 + sway * 0.7), y: back.y + R * (1.5 + sway) };
    var mid = { x: back.x - faceX * R * 1.4, y: back.y - R * 0.15 };
    g.strokeStyle = tone.hair;
    g.lineCap = 'round';
    g.lineWidth = R * 0.78;
    g.beginPath();
    g.moveTo(back.x, back.y);
    g.quadraticCurveTo(mid.x, mid.y, tip.x, tip.y);
    g.stroke();
    g.strokeStyle = 'rgba(124,77,255,0.55)';
    g.lineWidth = R * 0.2;
    g.beginPath();
    g.moveTo(back.x, back.y);
    g.quadraticCurveTo(mid.x, mid.y, tip.x, tip.y);
    g.stroke();

    /* head */
    g.beginPath();
    g.ellipse(h.x, h.y, R * 0.94, R, 0, 0, Math.PI * 2);
    g.fillStyle = tone.skin;
    g.strokeStyle = 'rgba(5,7,18,0.9)';
    g.lineWidth = Math.max(2, S * 0.012);
    g.fill(); g.stroke();

    /* hair cap */
    g.save();
    g.beginPath();
    g.ellipse(h.x, h.y, R * 0.98, R * 1.04, 0, 0, Math.PI * 2);
    g.clip();
    g.beginPath();
    g.ellipse(h.x - faceX * R * 0.36, h.y - R * 0.62, R * 1.00, R * 0.70, 0, 0, Math.PI * 2);
    g.fillStyle = tone.hair;
    g.fill();
    g.beginPath();
    g.ellipse(h.x - faceX * R * 0.66, h.y - R * 0.12, R * 0.56, R * 0.82, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();

    /* eyes */
    g.fillStyle = 'rgba(10,12,26,0.92)';
    if (view === 'front') {
      g.beginPath(); g.ellipse(h.x - R * 0.34, h.y + R * 0.12, R * 0.11, R * 0.15, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(h.x + R * 0.34, h.y + R * 0.12, R * 0.11, R * 0.15, 0, 0, Math.PI * 2); g.fill();
    } else {
      g.beginPath(); g.ellipse(h.x + faceX * R * 0.42, h.y + R * 0.08, R * 0.1, R * 0.14, 0, 0, Math.PI * 2); g.fill();
    }
  }

  function drawFoot(g, ankle, toe, S, view, tone, heelLift) {
    if (view === 'front') {
      g.save();
      g.translate(ankle.x, ankle.y + S * 0.012);
      g.rotate(0);
      g.beginPath();
      g.ellipse(0, 0, S * 0.055, S * 0.032 * (1 - heelLift * 0.35), 0, 0, Math.PI * 2);
      g.fillStyle = tone.shoe;
      g.strokeStyle = 'rgba(5,7,18,0.9)';
      g.lineWidth = Math.max(2, S * 0.011);
      g.fill(); g.stroke();
      g.restore();
    } else {
      seg(g, ankle, toe, 0.042, tone.shoe, S);
    }
  }

  function drawFigure(g, p, view, o) {
    var s = solve(p, view);
    var tx = makeTx(o.ox, o.oy, o.S, o.mir);
    var S = o.S;
    var tone = o.tone;
    var P = {};
    P.pelvis = tx(s.pelvis); P.neck = tx(s.neck); P.head = tx(s.head);
    ['farArm', 'nearArm'].forEach(function (k) {
      P[k] = { shoulder: tx(s[k].shoulder), elbow: tx(s[k].elbow), wrist: tx(s[k].wrist) };
    });
    ['farLeg', 'nearLeg'].forEach(function (k) {
      P[k] = { hip: tx(s[k].hip), knee: tx(s[k].knee), ankle: tx(s[k].ankle), toe: tx(s[k].toe) };
    });

    var farTone = { legs: shade(tone.legs, -22), skin: shade(tone.skin, -40), shoe: shade(tone.shoe, -55) };

    /* far limbs behind the torso */
    limbChain(g, [P.farLeg.hip, P.farLeg.knee, P.farLeg.ankle], [0.062, 0.05], farTone.legs, S);
    drawFoot(g, P.farLeg.ankle, P.farLeg.toe, S, view, farTone, p.heelLift);
    limbChain(g, [P.farArm.shoulder, P.farArm.elbow, P.farArm.wrist], [0.045, 0.038], farTone.skin, S);

    drawTorso(g, s, tx, S, tone);
    drawYoke(g, s, tx, S, tone);
    drawHead(g, s, tx, S, view, o.mir, tone, o.timeMs);

    limbChain(g, [P.nearLeg.hip, P.nearLeg.knee, P.nearLeg.ankle], [0.066, 0.052], tone.legs, S);
    /* a neon stripe down the near leg, for the video-game read */
    g.strokeStyle = 'rgba(124,77,255,0.75)';
    g.lineWidth = Math.max(1.5, S * 0.008);
    g.beginPath();
    g.moveTo(P.nearLeg.hip.x, P.nearLeg.hip.y);
    g.lineTo(P.nearLeg.knee.x, P.nearLeg.knee.y);
    g.lineTo(P.nearLeg.ankle.x, P.nearLeg.ankle.y);
    g.stroke();
    drawFoot(g, P.nearLeg.ankle, P.nearLeg.toe, S, view, tone, p.heelLift);
    limbChain(g, [P.nearArm.shoulder, P.nearArm.elbow, P.nearArm.wrist], [0.048, 0.04], tone.skin, S);

    [[P.farArm.wrist, farTone.skin], [P.nearArm.wrist, tone.skin]].forEach(function (h) {
      g.beginPath();
      g.arc(h[0].x, h[0].y, S * 0.026, 0, Math.PI * 2);
      g.fillStyle = h[1];
      g.strokeStyle = 'rgba(5,7,18,0.9)';
      g.lineWidth = Math.max(1.2, S * 0.008);
      g.fill(); g.stroke();
    });

    return P;
  }

  /* ---------------- equipment ---------------- */

  function plate(g, c, r, S) {
    g.beginPath(); g.arc(c.x, c.y, r, 0, Math.PI * 2);
    g.fillStyle = 'rgba(27,33,69,0.62)'; g.strokeStyle = C.steel;
    g.lineWidth = Math.max(2, S * 0.012); g.fill(); g.stroke();
    g.beginPath(); g.arc(c.x, c.y, r * 0.34, 0, Math.PI * 2);
    g.strokeStyle = C.steelDark; g.stroke();
  }

  /* endOn: the handle points at the viewer, so the bell foreshortens to a
   * disc. That is what a neutral grip looks like from the front - the two
   * dumbbells sit parallel, like rails, not broadside. */
  function dumbbell(g, c, S, big, endOn) {
    var w = S * (big ? 0.10 : 0.085), r = S * (big ? 0.030 : 0.025);
    g.strokeStyle = C.steel;
    g.lineWidth = Math.max(2, S * 0.013);
    g.lineCap = 'round';
    g.fillStyle = '#2b3363';
    if (endOn) {
      g.beginPath(); g.arc(c.x, c.y, r * 1.25, 0, Math.PI * 2); g.fill(); g.stroke();
      g.beginPath(); g.arc(c.x, c.y, r * 0.45, 0, Math.PI * 2); g.stroke();
      return;
    }
    g.beginPath(); g.moveTo(c.x - w * 0.5, c.y); g.lineTo(c.x + w * 0.5, c.y); g.stroke();
    for (var d = -1; d <= 1; d += 2) {
      g.beginPath(); g.arc(c.x + d * w * 0.5, c.y, r, 0, Math.PI * 2);
      g.fill(); g.stroke();
    }
  }

  /* A dumbbell stood on its end, gripped by the top plate. */
  function goblet(g, c, S) {
    var r = S * 0.055, h = S * 0.055;
    g.strokeStyle = C.steel;
    g.lineWidth = Math.max(2, S * 0.014);
    g.fillStyle = '#2b3363';
    g.beginPath(); g.moveTo(c.x, c.y - h); g.lineTo(c.x, c.y + h); g.stroke();
    g.beginPath(); g.ellipse(c.x, c.y - h, r, r * 0.42, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(c.x, c.y + h, r, r * 0.42, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  }


  /* ---------------- equipment rigs ---------------- */

  function bar(g, c, S, half) {
    var h = S * (half || 0.19);
    g.strokeStyle = C.steel;
    g.lineWidth = Math.max(3, S * 0.018);
    g.lineCap = 'round';
    g.beginPath(); g.moveTo(c.x - h, c.y); g.lineTo(c.x + h, c.y); g.stroke();
    plate(g, { x: c.x - h * 0.78, y: c.y }, S * 0.078, S);
    plate(g, { x: c.x + h * 0.78, y: c.y }, S * 0.078, S);
  }

  function pad(g, x, y, w, h, S) {
    g.fillStyle = 'rgba(26,32,68,0.94)';
    g.strokeStyle = C.steelDark;
    g.lineWidth = Math.max(2, S * 0.011);
    g.beginPath(); g.rect(x, y, w, h); g.fill(); g.stroke();
  }

  function cable(g, a, b, S) {
    g.strokeStyle = 'rgba(143,155,196,0.85)';
    g.lineWidth = Math.max(1.5, S * 0.008);
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
  }

  function mid(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }

  function drawProps(g, ex, P, S, view, mir, reel, phase) {
    var pr = ex.pr, nw = P.nearArm.wrist, fw = P.farArm.wrist, c = mid(nw, fw);
    var na = P.nearLeg.ankle, fa = P.farLeg.ankle, pv = P.pelvis;

    /* Before the hands take the weight it is still on the floor. Drawing it
     * in her fists the whole way through made her look like she was holding
     * a barbell while walking up to it and then squatting down with it. */
    var held = !(reel === 'setup' && ex.gr && phase < ex.gr);
    if (!held) {
      var fy = Math.max(P.nearLeg.toe.y, P.farLeg.toe.y);
      var fx = (P.nearLeg.toe.x + P.farLeg.toe.x) / 2;
      if (pr === 'bar') {
        bar(g, { x: fx + S * 0.10, y: fy - S * 0.02 }, S, 0.19);
      } else if (pr === 'goblet') {
        goblet(g, { x: fx + S * 0.06, y: fy - S * 0.055 }, S);
      } else if (pr === 'db2' || pr === 'step') {
        dumbbell(g, { x: fx - S * 0.14, y: fy - S * 0.02 }, S, false, ex.dbo === 'end');
        dumbbell(g, { x: fx + S * 0.16, y: fy - S * 0.02 }, S, false, ex.dbo === 'end');
      }
      if (pr !== 'step') return;
    }

    if (pr === 'bar') {
      bar(g, nw, S, 0.19);
    } else if (pr === 'db2') {
      dumbbell(g, nw, S, false, ex.dbo === 'end');
      dumbbell(g, fw, S, false, ex.dbo === 'end');
    } else if (pr === 'db1') {
      dumbbell(g, nw, S, true);
    } else if (pr === 'goblet') {
      goblet(g, c, S);
    } else if (pr === 'box') {
      /* a knee-high bench standing behind her, wherever the back foot is */
      var bx = fa.x - S * 0.30, by = fa.y - S * 0.06;
      pad(g, bx, by, S * 0.44, S * 0.05, S);
      pad(g, bx + S * 0.04, by + S * 0.05, S * 0.045, S * 0.30, S);
      pad(g, bx + S * 0.33, by + S * 0.05, S * 0.045, S * 0.30, S);
      dumbbell(g, nw, S, false);
    } else if (pr === 'bench' || pr === 'incline' || pr === 'decline') {
      if (view === 'front') {
        if (pr === 'bench') bar(g, nw, S, 0.20);
        else { dumbbell(g, nw, S, false, ex.dbo === 'end'); dumbbell(g, fw, S, false, ex.dbo === 'end'); }
        return;
      }
      /* the pad runs along her back, so it follows the torso line */
      var a = P.pelvis, b = P.neck;
      var dx = b.x - a.x, dy = b.y - a.y;
      var L2 = Math.sqrt(dx * dx + dy * dy) || 1;
      var nx = -dy / L2, ny = dx / L2;
      var t = S * 0.075;
      g.fillStyle = 'rgba(26,32,68,0.94)';
      g.strokeStyle = C.steelDark;
      g.lineWidth = Math.max(2, S * 0.011);
      g.beginPath();
      g.moveTo(a.x + nx * t - dx * 0.18, a.y + ny * t - dy * 0.18);
      g.lineTo(b.x + nx * t + dx * 0.24, b.y + ny * t + dy * 0.24);
      g.lineTo(b.x + nx * t * 2.6 + dx * 0.24, b.y + ny * t * 2.6 + dy * 0.24);
      g.lineTo(a.x + nx * t * 2.6 - dx * 0.18, a.y + ny * t * 2.6 - dy * 0.18);
      g.closePath(); g.fill(); g.stroke();
      if (pr === 'bench') bar(g, nw, S, 0.20);
      else { dumbbell(g, nw, S, false); dumbbell(g, fw, S, false); }
    } else if (pr === 'legext' || pr === 'legcurl') {
      pad(g, pv.x - S * 0.30, pv.y + S * 0.05, S * 0.42, S * 0.07, S);       /* seat */
      pad(g, pv.x - S * 0.34, pv.y - S * 0.34, S * 0.07, S * 0.40, S);       /* back rest */
      g.fillStyle = '#39406f';
      g.strokeStyle = C.steelDark;
      g.beginPath();
      g.arc(na.x + S * 0.03, na.y + (pr === 'legcurl' ? -S * 0.05 : S * 0.02), S * 0.045, 0, Math.PI * 2);
      g.fill(); g.stroke();
    } else if (pr === 'cablerow') {
      pad(g, pv.x - S * 0.26, pv.y + S * 0.05, S * 0.40, S * 0.07, S);
      pad(g, na.x + S * 0.02, na.y - S * 0.10, S * 0.08, S * 0.26, S);        /* foot plate */
      cable(g, nw, { x: nw.x + S * 0.80, y: nw.y + S * 0.04 }, S);
      g.fillStyle = C.steelDark;
      g.beginPath(); g.arc(nw.x, nw.y, S * 0.035, 0, Math.PI * 2); g.fill();
    } else if (pr === 'latpull') {
      pad(g, pv.x - S * 0.26, pv.y + S * 0.05, S * 0.40, S * 0.07, S);
      pad(g, pv.x - S * 0.10, pv.y - S * 0.06, S * 0.34, S * 0.06, S);        /* thigh pad */
      bar(g, nw, S, 0.24);
      cable(g, nw, { x: nw.x, y: nw.y - S * 1.1 }, S);
    } else if (pr === 'chestmachine') {
      pad(g, pv.x - S * 0.30, pv.y + S * 0.05, S * 0.42, S * 0.07, S);
      var bb = P.neck;
      pad(g, bb.x - S * 0.30, bb.y - S * 0.14, S * 0.08, S * 0.46, S);
      g.fillStyle = C.steelDark;
      [nw, fw].forEach(function (w) {
        g.beginPath(); g.arc(w.x, w.y, S * 0.038, 0, Math.PI * 2); g.fill();
      });
    } else if (pr === 'step') {
      /* the toes sit on a step so the heel has somewhere to drop below */
      var tx = Math.min(P.nearLeg.toe.x, P.farLeg.toe.x) - S * 0.05;
      var ty = Math.max(P.nearLeg.toe.y, P.farLeg.toe.y) - S * 0.005;
      pad(g, tx, ty, S * 0.24, S * 0.055, S);
      if (held) { dumbbell(g, nw, S, false); dumbbell(g, fw, S, false); }
    } else if (pr === 'dip') {
      g.strokeStyle = C.steel;
      g.lineWidth = Math.max(3, S * 0.017);
      g.lineCap = 'round';
      [nw, fw].forEach(function (w) {
        g.beginPath();
        g.moveTo(w.x - S * 0.16, w.y); g.lineTo(w.x + S * 0.16, w.y);
        g.stroke();
      });
    }
  }

  /* ---------------- alignment guides ---------------- *
   * Correct form only. There is no wrong-form variant anywhere in this
   * Bit: the guide traces the line the body should be holding.
   * ------------------------------------------------------------------ */

  function dash(g, pts, col, S) {
    g.save();
    g.setLineDash([S * 0.035, S * 0.028]);
    g.strokeStyle = col;
    g.lineWidth = Math.max(2, S * 0.013);
    g.lineCap = 'butt';
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.stroke();
    g.restore();
  }

  /* parent, vertex, child for each joint a marker can point at */
  var JOINT = {
    elN: ['nearArm', 'shoulder', 'elbow', 'wrist'],
    elF: ['farArm', 'shoulder', 'elbow', 'wrist'],
    knN: ['nearLeg', 'hip', 'knee', 'ankle'],
    knF: ['farLeg', 'hip', 'knee', 'ankle'],
    anN: ['nearLeg', 'knee', 'ankle', 'toe'],
    anF: ['farLeg', 'knee', 'ankle', 'toe']
  };

  function angleMark(g, P, key, label, S, bx) {
    var j = JOINT[key];
    if (!j) return;
    var limb = P[j[0]];
    var a = limb[j[1]], b = limb[j[2]], c = limb[j[3]];
    var a1 = Math.atan2(a.y - b.y, a.x - b.x);
    var a2 = Math.atan2(c.y - b.y, c.x - b.x);
    var d = a2 - a1;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    var r = S * 0.09;
    g.save();
    g.strokeStyle = C.glow;
    g.lineWidth = Math.max(2, S * 0.015);
    g.beginPath(); g.arc(b.x, b.y, r, a1, a1 + d, d < 0); g.stroke();
    g.beginPath(); g.arc(b.x, b.y, S * 0.018, 0, Math.PI * 2);
    g.fillStyle = C.glow; g.fill();

    if (label) {
      var m = a1 + d / 2;
      var lx = b.x + Math.cos(m) * r * 2.2, ly = b.y + Math.sin(m) * r * 2.2;
      var fs = Math.max(9, Math.min(13, S * 0.075));
      g.font = '700 ' + fs + 'px ' + FONT_UI;
      var tw = g.measureText(label).width;
      var bw = tw + fs * 1.1, bh = fs * 1.7;
      if (bx) {
        lx = Math.min(Math.max(lx, bx.x + bw / 2 + 3), bx.x + bx.w - bw / 2 - 3);
        ly = Math.min(Math.max(ly, bx.y + bh / 2 + 3), bx.y + bx.h - bh / 2 - 3);
      }
      g.beginPath();
      g.moveTo(lx - bw / 2 + bh / 2, ly - bh / 2);
      g.arcTo(lx + bw / 2, ly - bh / 2, lx + bw / 2, ly + bh / 2, bh / 2);
      g.arcTo(lx + bw / 2, ly + bh / 2, lx - bw / 2, ly + bh / 2, bh / 2);
      g.arcTo(lx - bw / 2, ly + bh / 2, lx - bw / 2, ly - bh / 2, bh / 2);
      g.arcTo(lx - bw / 2, ly - bh / 2, lx + bw / 2, ly - bh / 2, bh / 2);
      g.closePath();
      g.fillStyle = C.glow; g.fill();
      g.fillStyle = '#052027';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(label, lx, ly + 0.5);
    }
    g.restore();
  }

  function drawAnnotation(g, ex, P, S, reel, phase, bx) {
    var col = 'rgba(61,220,132,0.85)';
    var k = ex.al;
    var marks = reel === 'setup' ? ex.mks : ex.mk;
    if (marks && marks.length) {
      var pick = marks[marks.length - 1];
      for (var i = 0; i < marks.length; i++) {
        if (phase <= parseFloat(marks[i])) { pick = marks[i]; break; }
      }
      var parts = pick.split('|');
      angleMark(g, P, parts[1], parts[2], S, bx);
    }
    if (!k) return;
    if (k === 'plank') {
      dash(g, [P.nearArm.shoulder, P.pelvis, P.farLeg.ankle], col, S);
    } else if (k === 'spine') {
      dash(g, [P.pelvis, P.neck], col, S);
    } else if (k === 'knee') {
      var kn = P.nearLeg.knee, an = P.nearLeg.ankle, hp = P.nearLeg.hip;
      dash(g, [{ x: an.x, y: hp.y }, an], 'rgba(255,255,255,0.22)', S);
      dash(g, [hp, kn, an], col, S);
    } else if (k === 'plumb') {
      dash(g, [{ x: P.pelvis.x, y: P.head.y - S * 0.1 },
        { x: P.pelvis.x, y: P.nearLeg.ankle.y + S * 0.04 }], col, S);
    } else if (k === 'hipline') {
      dash(g, [{ x: P.pelvis.x - S * 0.3, y: P.pelvis.y },
        { x: P.pelvis.x + S * 0.3, y: P.pelvis.y }], col, S);
    } else if (k === 'stack') {
      dash(g, [P.nearArm.wrist, P.nearArm.shoulder], col, S);
    } else if (k === 'elbow') {
      dash(g, [P.nearArm.shoulder, P.nearArm.elbow, P.nearArm.wrist], col, S);
    }
  }

  /* ------------------------------------------------------------------ *
   * Scene: background, panels, figure fitting
   * ------------------------------------------------------------------ */

  var fitCache = {};

  function trackFor(id, variant) {
    var e = EX[id];
    if (!e) return IDLE_TRACK;
    return variant === 'setup' ? e.st : e.tk;
  }

  function fitBox(id, view) {
    var ck = id + '|' + view;
    if (fitCache[ck]) return fitCache[ck];
    var box = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9, floor: -1e9 };
    ['setup', 'train'].forEach(function (v) {
      var track = trackFor(id, v);
      for (var i = 0; i <= 16; i++) {
        var s = solve(sampleTrack(track, i / 16), view);
        var pts = [s.pelvis, s.neck, s.head,
          s.farArm.elbow, s.farArm.wrist, s.nearArm.elbow, s.nearArm.wrist,
          s.farLeg.knee, s.farLeg.ankle, s.farLeg.toe,
          s.nearLeg.knee, s.nearLeg.ankle, s.nearLeg.toe];
        for (var j = 0; j < pts.length; j++) {
          box.x0 = Math.min(box.x0, pts[j].x); box.x1 = Math.max(box.x1, pts[j].x);
          box.y0 = Math.min(box.y0, pts[j].y); box.y1 = Math.max(box.y1, pts[j].y);
        }
        /* one fixed floor per exercise, set by the planted hands */
        box.floor = Math.max(box.floor, s.nearArm.wrist.y, s.farArm.wrist.y);
      }
    });
    /* padding for head, props and annotations */
    box.x0 -= 0.13; box.x1 += 0.13; box.y0 -= 0.14; box.y1 += 0.07;
    fitCache[ck] = box;
    return box;
  }

  function drawBackground(g, w, h, timeMs) {
    var grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, C.bg0);
    grad.addColorStop(0.55, '#0e1230');
    grad.addColorStop(1, C.bg1);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);

    /* soft neon bloom behind the trainer */
    var r = Math.max(w, h) * 0.55;
    var rg = g.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.42, r);
    rg.addColorStop(0, 'rgba(124,77,255,0.20)');
    rg.addColorStop(0.6, 'rgba(45,226,230,0.06)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, w, h);

    /* perspective grid floor */
    g.save();
    g.strokeStyle = C.grid;
    g.lineWidth = 1;
    var hor = h * 0.66;
    for (var i = -8; i <= 8; i++) {
      g.beginPath();
      g.moveTo(w * 0.5 + i * w * 0.055, hor);
      g.lineTo(w * 0.5 + i * w * 0.5, h + 10);
      g.stroke();
    }
    var scroll = (timeMs / 3400) % 1;
    for (var k = 0; k < 9; k++) {
      var u = (k + scroll) / 9;
      var y = hor + (h - hor) * u * u;
      g.globalAlpha = 0.25 + u * 0.5;
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
    }
    g.restore();
  }

  function panelFrame(g, x, y, w, h, col, label, S) {
    var r = Math.min(18, w * 0.08);
    g.save();
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
    g.fillStyle = 'rgba(8,11,28,0.5)';
    g.fill();
    g.strokeStyle = col;
    g.lineWidth = 2;
    g.globalAlpha = 0.75;
    g.stroke();
    g.globalAlpha = 1;
    g.restore();

    if (label) {
      var fs = Math.max(10, Math.min(13, w * 0.075));
      g.save();
      g.font = '700 ' + fs + 'px ' + FONT_UI;
      var tw = g.measureText(label).width;
      var bw = tw + fs * 1.6, bh = fs * 1.9;
      var bx = x + w / 2 - bw / 2, by = y - bh / 2;
      g.beginPath();
      g.moveTo(bx + bh / 2, by);
      g.arcTo(bx + bw, by, bx + bw, by + bh, bh / 2);
      g.arcTo(bx + bw, by + bh, bx, by + bh, bh / 2);
      g.arcTo(bx, by + bh, bx, by, bh / 2);
      g.arcTo(bx, by, bx + bw, by, bh / 2);
      g.closePath();
      g.fillStyle = col;
      g.fill();
      g.fillStyle = '#080a1b';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.letterSpacing = '1px';
      g.fillText(label, x + w / 2, by + bh / 2 + 0.5);
      g.letterSpacing = '0px';
      g.restore();
    }
  }

  var IDLE_EX = { id: 'idle', vw: 'front', al: null, pr: null };
  var CHEER_EX = { id: 'cheer', vw: 'front', al: null, pr: null };

  var FONT_UI = 'Inter, system-ui, -apple-system, sans-serif';
  var FONT_DISPLAY = '"Bebas Neue", Inter, system-ui, sans-serif';

  function drawFigureInPanel(g, ex, variant, phase, x, y, w, h, timeMs, mir, opts) {
    var view = ex ? ((variant === 'train' && ex.vwT) ? ex.vwT : ex.vw) : 'front';
    var id = ex ? ex.id : 'idle';
    var box = fitBox(id, view);
    var bw = box.x1 - box.x0, bh = box.y1 - box.y0;
    var pad = 0.96;
    var S = Math.min(w / bw, h / bh) * pad;
    var cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
    var ox = x + w / 2 - cx * S * mir;
    var oy = y + h / 2 - cy * S;
    var p = sampleTrack(trackFor(id, variant), phase);
    g.save();
    g.beginPath(); g.rect(x - 4, y - 4, w + 8, h + 8); g.clip();
    if (ex && ex.al === 'plank') {
      var fy = oy + box.floor * S + S * 0.012;
      g.strokeStyle = 'rgba(45,226,230,0.42)';
      g.lineWidth = Math.max(2, S * 0.012);
      g.beginPath(); g.moveTo(x, fy); g.lineTo(x + w, fy); g.stroke();
    }
    var P = drawFigure(g, p, view, {
      ox: ox, oy: oy, S: S, mir: mir, timeMs: timeMs,
      tone: { legs: C.legs, skin: C.skin, top: C.top, topLit: C.topLit, hair: C.hair, shoe: C.shoe }
    });
    if (ex && ex.pr) drawProps(g, ex, P, S, view, mir, variant, phase);
    if (ex && (!opts || opts.annotate !== false)) drawAnnotation(g, ex, P, S, variant, phase, { x: x, y: y, w: w, h: h });
    g.restore();
    return S;
  }


  /* ------------------------------------------------------------------ *
   * Bit
   * ------------------------------------------------------------------ */

  var TRAIN_CYCLE = 4200;   /* one demonstrated rep */
  var TRAIN_LOOPS = 3;      /* reps shown before the setup reel comes round again */

  window.plethoraBit = {
    meta: { name: 'Gym Trainer' },

    async init(ctx) {
      var canvas = ctx.createCanvas2D({ touchAction: 'manipulation' });
      var g = canvas.getContext('2d');
      var root = ctx.createRoot({ touchAction: 'manipulation' });
      var caps = ctx.capabilities || {};
      var canStore = !!caps.storage, canMusic = !!caps.backgroundMusic, canHaptic = !!caps.haptics;

      var S = {
        screen: 'home', day: 0, exi: 0,
        log: {}, musicOn: canMusic, started: false, month: 0, openCues: true
      };
      var reel = { name: 'setup', t: 0, loops: 0 };
      var scene = { ex: null };
      var stageRect = { x: 0, y: 0, w: ctx.width, h: 200 };
      var music = null, timeMs = 0, lastCap = '';

      /* ---------------- dates and the log ---------------- */

      function today() { return new Date(); }
      function todayKey() { return keyOf(today()); }
      function entry(k) { return S.log[k] || null; }
      function todayDay() { return dayFor(today()); }

      function ensure(k, dayId) {
        if (!S.log[k]) S.log[k] = { d: dayId, ex: [], done: false };
        return S.log[k];
      }
      function exDone(id) {
        var e = entry(todayKey());
        return !!(e && e.ex.indexOf(id) >= 0);
      }
      function dayDoneCount(d) {
        if (!d.list) return 0;
        var n = 0;
        for (var i = 0; i < d.list.length; i++) if (exDone(d.list[i])) n++;
        return n;
      }
      function sessions() {
        var n = 0;
        for (var k in S.log) if (S.log[k].done) n++;
        return n;
      }
      /* A streak survives scheduled rest days; it breaks on a missed
       * training day. Today only breaks it once it is over. */
      function streak() {
        var n = 0, d = today(), first = true;
        for (var i = 0; i < 400; i++) {
          var k = keyOf(d), w = dayFor(d), e = entry(k);
          if (e && e.done) n++;
          else if (w.rest) { /* rest days are free */ }
          else if (first) { /* today is still open */ }
          else break;
          first = false;
          d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
        }
        return n;
      }

      var STORE = 'gym_v1';
      async function load() {
        var data = null;
        try { if (canStore) data = await ctx.storage.get(STORE); } catch (e) { data = null; }
        if (!data) {
          try { var m = await ctx.memory.local('gym_state').get(); data = m && m.value ? m.value : m; }
          catch (e2) { data = null; }
        }
        if (data && typeof data === 'object') {
          if (data.log) S.log = data.log;
          if (typeof data.musicOn === 'boolean') S.musicOn = data.musicOn && canMusic;
        }
      }
      async function save() {
        var p = { log: S.log, musicOn: S.musicOn };
        try { if (canStore) await ctx.storage.set(STORE, p); } catch (e) { /* viewer-local only */ }
        try { await ctx.memory.local('gym_state').set(p); } catch (e2) { /* optional */ }
      }

      /* ---------------- small helpers ---------------- */

      function esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }
      function haptic(k) { if (canHaptic) { try { ctx.platform.haptic(k); } catch (e) { /* optional */ } } }
      function sting(n) {
        if (!canMusic || !S.musicOn) return;
        try { ctx.music.sting(n); } catch (e) { /* optional */ }
      }
      function musicPreset(name, tempo) {
        if (!canMusic || !S.musicOn) return;
        try { ctx.music.unlock(); } catch (e) { /* optional */ }
        try {
          if (!music) music = ctx.music.play({ preset: name, volume: 0.34, tempo: tempo || 92, fadeInMs: 900 });
          else { ctx.music.setPreset(name, { fadeMs: 700 }); if (tempo) ctx.music.setTempo(tempo); }
        } catch (e2) { music = music || null; }
      }
      function firstGesture() {
        if (S.started) return;
        S.started = true;
        try { ctx.platform.start(); } catch (e) { /* ignore */ }
        musicPreset('lofi', 88);
      }
      /* 'until|text' lists, shared by the setup and train reels */
      function capAt(list, phase) {
        if (!list || !list.length) return '';
        for (var i = 0; i < list.length; i++) {
          var bar = list[i].indexOf('|');
          if (phase <= parseFloat(list[i].slice(0, bar))) return list[i].slice(bar + 1);
        }
        var last = list[list.length - 1];
        return last.slice(last.indexOf('|') + 1);
      }
      function curDay() { return WEEK[S.day]; }
      function curEx() {
        var d = curDay();
        return d && d.list ? EX[d.list[S.exi]] : null;
      }

      /* ---------------- shell ---------------- */

      var style = document.createElement('style');
      style.textContent = [
        '.gt{position:absolute;inset:0;display:flex;flex-direction:column;font-family:' + FONT_UI + ';',
        'color:' + C.ink + ';-webkit-user-select:none;user-select:none;overflow:hidden;}',
        '.gt *{box-sizing:border-box;}',
        '.hd{flex:0 0 auto;padding:10px 16px 6px;}',
        '.hdrow{display:flex;align-items:center;gap:7px;}',
        '.hdname{font:700 17px/1.2 ' + FONT_UI + ';flex:1;min-width:0;}',
        '.hdname>span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
        '.hdsub{font:500 11px/1.3 ' + FONT_UI + ';color:' + C.dim + ';margin-top:4px;}',
        '.hdsub b{color:' + C.hotSoft + ';font-weight:800;letter-spacing:0.6px;}',
        '.chip{font:700 11px/1 ' + FONT_UI + ';letter-spacing:1.4px;text-transform:uppercase;padding:6px 10px;',
        'border-radius:999px;background:rgba(255,46,136,0.18);color:' + C.hotSoft + ';',
        'border:1px solid rgba(255,46,136,0.45);white-space:nowrap;}',
        '.iconbtn{flex:0 0 auto;width:29px;height:29px;border-radius:50%;border:1px solid rgba(244,246,255,0.22);',
        'background:rgba(255,255,255,0.06);color:' + C.ink + ';font:700 13px/1 ' + FONT_UI + ';',
        'display:flex;align-items:center;justify-content:center;padding:0;}',
        '.bar{height:5px;border-radius:99px;background:rgba(255,255,255,0.10);margin-top:9px;overflow:hidden;}',
        '.barfill{height:100%;border-radius:99px;background:linear-gradient(90deg,' + C.hot + ',' + C.glow + ');transition:width .35s ease;}',
        '.stage{flex:1 1 auto;min-height:0;position:relative;}',
        '.reelbar{position:absolute;left:14px;right:14px;bottom:6px;height:3px;border-radius:99px;background:rgba(255,255,255,0.12);}',
        '.reelfill{height:100%;border-radius:99px;background:' + C.glow + ';}',
        '.phase{position:absolute;left:14px;top:8px;font:800 10px/1 ' + FONT_UI + ';letter-spacing:1.6px;',
        'text-transform:uppercase;padding:6px 10px;border-radius:999px;}',
        '.phase.s{background:rgba(45,226,230,0.9);color:#052027;}',
        '.phase.t{background:rgba(61,220,132,0.92);color:#04220f;}',
        '.panel{flex:0 0 auto;padding:2px 16px 0;max-height:62%;overflow-y:auto;-webkit-overflow-scrolling:touch;}',
        '.title{font:800 38px/0.95 ' + FONT_DISPLAY + ';letter-spacing:2px;text-transform:uppercase;}',
        '.lede{font:500 13.5px/1.45 ' + FONT_UI + ';color:' + C.dim + ';margin-top:9px;}',
        '.btn{display:block;width:100%;margin-top:12px;padding:16px 18px;border:0;border-radius:16px;',
        'font:800 15px/1 ' + FONT_UI + ';color:#0a0c1e;background:linear-gradient(135deg,' + C.glow + ',#7ef0d0);',
        'box-shadow:0 8px 22px rgba(45,226,230,0.28);}',
        '.btn:active{transform:translateY(1px);}',
        '.btn.alt{background:rgba(255,255,255,0.08);color:' + C.ink + ';border:1px solid rgba(244,246,255,0.22);box-shadow:none;}',
        '.btn.hot{background:linear-gradient(135deg,' + C.hot + ',#ff7ab8);color:#fff;box-shadow:0 8px 22px rgba(255,46,136,0.3);}',
        '.btn[disabled]{opacity:.45;}',
        '.row{display:flex;gap:10px;}.row>*{flex:1;}',
        '.card{margin-top:10px;padding:12px 14px;border-radius:14px;background:rgba(255,255,255,0.055);',
        'border:1px solid rgba(244,246,255,0.14);}',
        '.card .k{font:800 10px/1 ' + FONT_UI + ';letter-spacing:1.4px;text-transform:uppercase;color:' + C.faint + ';}',
        '.card .v{font:800 17px/1.25 ' + FONT_UI + ';margin-top:6px;}',
        '.card ul{margin:8px 0 0;padding-left:0;list-style:none;}',
        '.card li{position:relative;padding-left:16px;font:500 12.5px/1.5 ' + FONT_UI + ';color:' + C.dim + ';margin-bottom:6px;}',
        '.card li:before{content:"";position:absolute;left:0;top:7px;width:6px;height:6px;border-radius:50%;background:' + C.glow + ';}',
        '.card.rom{background:rgba(45,226,230,0.10);border-color:rgba(45,226,230,0.40);}',
        '.card.rom li:before{background:' + C.glow + ';}',
        '.card.rom li{color:#dffcff;}',
        '.cap{margin-top:10px;padding:12px 13px;border-radius:13px;min-height:66px;',
        'background:rgba(45,226,230,0.12);border:1px solid rgba(45,226,230,0.42);',
        'font:600 13px/1.45 ' + FONT_UI + ';color:#eafcff;}',
        '.week{display:flex;gap:5px;margin-top:10px;}',
        '.wd{flex:1;padding:9px 2px 8px;border-radius:12px;text-align:center;background:rgba(255,255,255,0.05);',
        'border:1px solid rgba(244,246,255,0.12);font:800 11px/1 ' + FONT_UI + ';}',
        '.wd small{display:block;font:700 9px/1 ' + FONT_UI + ';color:' + C.faint + ';margin-top:5px;}',
        '.wd.on{border-color:' + C.glow + ';background:rgba(45,226,230,0.14);}',
        '.wd.ok{background:rgba(61,220,132,0.16);border-color:rgba(61,220,132,0.5);}',
        '.wd.ok small{color:' + C.good + ';}',
        '.wd.rest{opacity:.55;}',
        '.plan{display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:12px;margin-bottom:6px;',
        'background:rgba(255,255,255,0.05);border:1px solid rgba(244,246,255,0.12);}',
        '.plan b{flex:0 0 24px;height:24px;border-radius:8px;background:rgba(255,255,255,0.10);',
        'font:800 12px/24px ' + FONT_UI + ';text-align:center;}',
        '.plan .pn{flex:1;min-width:0;font:700 13px/1.25 ' + FONT_UI + ';}',
        '.plan .pn span{display:block;font:500 10.5px/1.35 ' + FONT_UI + ';color:' + C.faint + ';margin-top:3px;}',
        '.plan.done b{background:' + C.good + ';color:#08111a;}',
        '.plan.now{border-color:' + C.glow + ';background:rgba(45,226,230,0.12);}',
        '.plan.soon{opacity:.5;}',
        '.cal{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-top:10px;}',
        '.cal i{aspect-ratio:1;display:flex;align-items:center;justify-content:center;border-radius:9px;',
        'font:600 11px/1 ' + FONT_UI + ';font-style:normal;background:rgba(255,255,255,0.045);color:' + C.dim + ';}',
        '.cal i.h{background:none;color:' + C.faint + ';font:800 9px/1 ' + FONT_UI + ';}',
        '.cal i.pad{background:none;}',
        '.cal i.ok{background:rgba(61,220,132,0.22);color:#c8ffe0;border:1px solid rgba(61,220,132,0.55);font-weight:800;}',
        '.cal i.td{outline:2px solid ' + C.glow + ';outline-offset:-2px;color:' + C.ink + ';}',
        '.stats{display:flex;gap:8px;margin-top:10px;}',
        '.stat{flex:1;padding:11px 8px;border-radius:13px;text-align:center;background:rgba(255,255,255,0.055);',
        'border:1px solid rgba(244,246,255,0.13);}',
        '.stat b{display:block;font:800 21px/1 ' + FONT_DISPLAY + ';letter-spacing:1px;}',
        '.stat span{display:block;font:700 9px/1.2 ' + FONT_UI + ';letter-spacing:1.1px;text-transform:uppercase;',
        'color:' + C.faint + ';margin-top:6px;}',
        '.note{font:500 10.5px/1.45 ' + FONT_UI + ';color:' + C.faint + ';margin-top:10px;}',
        '.foot{flex:0 0 auto;padding:6px 16px 0;}',
        '.foot .btn{margin-top:8px;}',
        '.stage.big{flex:0 0 36%;}',
        '.stage.gone{display:none;}',
        '.panel.full{flex:1 1 auto;max-height:none;}',
        '.sheet{position:absolute;inset:0;background:#070915;padding:18px;overflow:auto;z-index:5;',
        'font-family:' + FONT_UI + ';color:' + C.ink + ';}',
        '.sheet h3{font:800 22px/1.1 ' + FONT_DISPLAY + ';letter-spacing:1.5px;text-transform:uppercase;margin:0 0 12px;}',
        '.sheet li{font:500 13px/1.55 ' + FONT_UI + ';color:' + C.dim + ';margin-bottom:9px;}',
        '.hidden{display:none;}'
      ].join('');
      root.appendChild(style);

      var safe = ctx.safeArea || {};
      var wrap = document.createElement('div');
      wrap.className = 'gt';
      wrap.style.paddingTop = (safe.top || 0) + 'px';
      wrap.style.paddingBottom = ((safe.bottom || 0) + 24) + 'px';
      wrap.innerHTML = '<div class="hd" id="hd"></div><div class="stage" id="stage"></div>' +
        '<div class="panel" id="panel"></div><div class="foot" id="foot"></div>';
      root.appendChild(wrap);

      var sheet = document.createElement('div');
      sheet.className = 'sheet hidden';
      sheet.style.paddingTop = ((safe.top || 0) + 18) + 'px';
      sheet.style.paddingBottom = ((safe.bottom || 0) + 28) + 'px';
      root.appendChild(sheet);

      var elHd = wrap.querySelector('#hd');
      var elStage = wrap.querySelector('#stage');
      var elPanel = wrap.querySelector('#panel');
      var elFoot = wrap.querySelector('#foot');

      function measure() {
        var cr = ctx.container.getBoundingClientRect();
        var sr = elStage.getBoundingClientRect();
        stageRect = { x: sr.left - cr.left, y: sr.top - cr.top, w: sr.width, h: sr.height };
      }
      function headBtns() {
        return '<button class="iconbtn" data-act="sound">' + (S.musicOn ? '♪' : '✕') + '</button>' +
          '<button class="iconbtn" data-act="help">?</button>';
      }

      /* ---------------- screens ---------------- */

      function show(name) {
        S.screen = name;
        sheet.classList.add('hidden');
        elStage.innerHTML = '';
        elFoot.innerHTML = '';
        var listy = (name === 'day' || name === 'progress');
        /* the exercise screen gives the video a fixed share and lets the
         * coaching text scroll underneath it */
        elStage.className = 'stage' + (listy ? ' gone' : (name === 'ex' ? ' big' : ''));
        elPanel.className = 'panel' + (listy || name === 'ex' ? ' full' : '');
        scene.ex = null;

        if (name === 'home') homeScreen();
        else if (name === 'day') dayScreen();
        else if (name === 'ex') exScreen();
        else if (name === 'daydone') doneScreen();
        else if (name === 'progress') progressScreen();
        measure();
      }

      function homeScreen() {
        var td = todayDay(), tk = todayKey();
        scene.ex = IDLE_EX;
        elHd.innerHTML = '<div class="hdrow"><div class="chip">Gym Trainer</div><div class="hdname"></div>' +
          headBtns() + '</div>';

        var strip = '', d = today();
        var monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - DAY_INDEX[d.getDay()]);
        for (var i = 0; i < 7; i++) {
          var dd = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
          var w = WEEK[i], e = entry(keyOf(dd));
          var cls = 'wd' + (w.rest ? ' rest' : '') + (e && e.done ? ' ok' : '') +
            (keyOf(dd) === tk ? ' on' : '');
          strip += '<div class="' + cls + '" data-act="openday" data-v="' + i + '">' + w.short +
            '<small>' + (e && e.done ? '✓' : w.rest ? 'rest' : dd.getDate()) + '</small></div>';
        }

        var ready = !!td.list;
        var doneToday = ready && dayDoneCount(td) >= td.list.length;
        elPanel.innerHTML =
          '<div class="title">Gym<br>Trainer</div>' +
          '<div class="lede">Five training days. No rep counters and no countdowns — every exercise is one continuous demonstration in two parts, setup then train. Read it, do it, tap Done.</div>' +
          '<div class="week">' + strip + '</div>' +
          '<div class="card"><div class="k">Today · ' + esc(td.name) + '</div>' +
            '<div class="v">' + esc(td.focus) + '</div>' +
            '<div class="note" style="margin-top:6px">' +
              (td.rest ? 'Rest day. Walk if you feel like moving, but nothing is scheduled.'
                : ready ? (doneToday ? 'Done for today. Nice.' : td.list.length + ' exercises · about 45 minutes')
                : 'Not built yet — this day is a placeholder.') +
            '</div></div>' +
          (td.rest || !ready ? '' :
            '<button class="btn" data-act="openday" data-v="' + DAY_INDEX[today().getDay()] + '">' +
            (doneToday ? 'Review ' + esc(td.name) : 'Start ' + esc(td.name)) + '</button>') +
          (ready ? '' : '<button class="btn" data-act="openday" data-v="0">Open Monday — the day that is built</button>') +
          '<button class="btn alt" data-act="progress">My progress</button>' +
          '<div class="note">Not medical advice. Start lighter than you think and stop any rep that hurts.</div>';
      }

      function dayScreen() {
        var d = curDay();
        scene.ex = IDLE_EX;
        elHd.innerHTML = '<div class="hdrow"><button class="iconbtn" data-act="home">‹</button>' +
          '<div class="hdname"><span>' + esc(d.name) + '</span></div>' + headBtns() + '</div>' +
          '<div class="hdsub">' + esc(d.focus) + '</div>';

        var rows = '', i;
        if (d.list) {
          for (i = 0; i < d.list.length; i++) {
            var e = EX[d.list[i]], ok = exDone(d.list[i]);
            rows += '<div class="plan' + (ok ? ' done' : '') + '" data-act="goex" data-v="' + i + '">' +
              '<b>' + (ok ? '✓' : i + 1) + '</b>' +
              '<div class="pn">' + esc(e.nm) + '<span>' + esc(e.ld) + '</span></div></div>';
          }
        } else if (d.soon) {
          for (i = 0; i < d.soon.length; i++) {
            rows += '<div class="plan soon"><b>' + (i + 1) + '</b>' +
              '<div class="pn">' + esc(d.soon[i]) + '<span>Coming soon</span></div></div>';
          }
        }

        var n = d.list ? dayDoneCount(d) : 0;
        var next = 0;
        if (d.list) { while (next < d.list.length && exDone(d.list[next])) next++; }
        elPanel.innerHTML = rows +
          (d.list
            ? (n >= d.list.length
                ? '<button class="btn hot" data-act="finishday">Mark ' + esc(d.name) + ' complete</button>'
                : '<button class="btn" data-act="goex" data-v="' + Math.min(next, d.list.length - 1) + '">' +
                  (n ? 'Continue — ' : 'Start — ') + esc(EX[d.list[Math.min(next, d.list.length - 1)]].nm) + '</button>')
            : '<div class="note">Monday is built. The other days are listed so the week reads as a whole; their animations and coaching are still being authored.</div>') +
          '<button class="btn alt" data-act="home">Back to the week</button>';
      }

      function exScreen() {
        var d = curDay(), e = curEx();
        if (!e) return show('day');
        scene.ex = e;
        reel.name = 'setup'; reel.t = 0; reel.loops = 0; lastCap = '';

        var pct = Math.round(((S.exi) / d.list.length) * 100);
        elHd.innerHTML = '<div class="hdrow"><button class="iconbtn" data-act="day">‹</button>' +
          '<div class="hdname"><span>' + esc(e.nm) + '</span></div>' + headBtns() + '</div>' +
          '<div class="hdsub"><b>' + (S.exi + 1) + ' of ' + d.list.length + '</b> · ' + esc(e.tg) + '</div>' +
          '<div class="bar"><div class="barfill" style="width:' + pct + '%"></div></div>';

        elStage.innerHTML = '<div class="phase s" id="phase">Setup</div>' +
          '<div class="reelbar"><div class="reelfill" id="reelfill" style="width:0%"></div></div>';

        var rom = '', i;
        for (i = 0; i < e.rom.length; i++) rom += '<li>' + esc(e.rom[i]) + '</li>';
        var cues = '';
        for (i = 0; i < e.cu.length; i++) cues += '<li>' + esc(e.cu[i]) + '</li>';

        elPanel.innerHTML =
          '<div class="cap" id="cap">' + esc(capAt(e.ss, 0)) + '</div>' +
          '<div class="card"><div class="k">Sets, reps and load</div><div class="v">' + esc(e.ld) + '</div></div>' +
          '<div class="card rom"><div class="k">How far it should travel</div><ul>' + rom + '</ul></div>' +
          '<div class="card"><div class="k">How to do it correctly</div><ul>' + cues + '</ul></div>';

        elFoot.innerHTML =
          '<button class="btn" data-act="done">' + (exDone(d.list[S.exi]) ? 'Done again' : 'Done') + '</button>' +
          '<div class="row">' +
            '<button class="btn alt" data-act="prev"' + (S.exi === 0 ? ' disabled' : '') + '>Previous</button>' +
            '<button class="btn alt" data-act="skip"' + (S.exi >= d.list.length - 1 ? ' disabled' : '') + '>Skip</button>' +
          '</div>';
      }

      function doneScreen() {
        var d = curDay();
        scene.ex = CHEER_EX;
        elHd.innerHTML = '<div class="hdrow"><div class="chip">' + esc(d.name) + ' complete</div>' +
          '<div class="hdname"></div>' + headBtns() + '</div>' +
          '<div class="bar"><div class="barfill" style="width:100%"></div></div>';
        var rows = '';
        for (var i = 0; i < d.list.length; i++) {
          rows += '<div class="plan done"><b>✓</b><div class="pn">' + esc(EX[d.list[i]].nm) +
            '<span>' + esc(EX[d.list[i]].ld) + '</span></div></div>';
        }
        elPanel.innerHTML =
          '<div class="title" style="font-size:32px">That is<br>' + esc(d.name) + '.</div>' +
          '<div class="lede">Ticked on your calendar for ' + esc(todayKey()) + '. Streak: <b style="color:' +
            C.glow + '">' + streak() + '</b> — total sessions: <b style="color:' + C.glow + '">' + sessions() + '</b>.</div>' +
          rows +
          '<button class="btn" data-act="progress">See my progress</button>' +
          '<button class="btn alt" data-act="home">Back to the week</button>';
      }

      function progressScreen() {
        scene.ex = IDLE_EX;
        elHd.innerHTML = '<div class="hdrow"><button class="iconbtn" data-act="home">‹</button>' +
          '<div class="hdname"><span>My progress</span></div>' + headBtns() + '</div>';

        var now = today();
        var m = new Date(now.getFullYear(), now.getMonth() + S.month, 1);
        var names = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
          'August', 'September', 'October', 'November', 'December'];
        var heads = ['M', 'T', 'W', 'T', 'F', 'S', 'S'], cells = '', i;
        for (i = 0; i < 7; i++) cells += '<i class="h">' + heads[i] + '</i>';
        var lead = DAY_INDEX[m.getDay()];
        for (i = 0; i < lead; i++) cells += '<i class="pad"></i>';
        var days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
        for (i = 1; i <= days; i++) {
          var dd = new Date(m.getFullYear(), m.getMonth(), i);
          var k = keyOf(dd), e = entry(k);
          cells += '<i class="' + (e && e.done ? 'ok' : '') + (k === todayKey() ? ' td' : '') + '">' +
            (e && e.done ? '✓' : i) + '</i>';
        }

        /* the most recent sessions, newest first */
        var keys = [];
        for (var kk in S.log) if (S.log[kk].done) keys.push(kk);
        keys.sort(); keys.reverse();
        var recent = '';
        for (i = 0; i < Math.min(keys.length, 8); i++) {
          var en = S.log[keys[i]], wd = dayById(en.d);
          recent += '<div class="plan done"><b>✓</b><div class="pn">' + esc(keys[i]) +
            '<span>' + esc(wd ? wd.name + ' · ' + wd.focus : en.d) + ' · ' + en.ex.length + ' exercises</span></div></div>';
        }

        elPanel.innerHTML =
          '<div class="stats">' +
            '<div class="stat"><b>' + streak() + '</b><span>Day streak</span></div>' +
            '<div class="stat"><b>' + sessions() + '</b><span>Sessions</span></div>' +
            '<div class="stat"><b>' + keys.filter(function (k) {
              return k >= keyOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));
            }).length + '</b><span>Last 7 days</span></div>' +
          '</div>' +
          '<div class="card"><div class="k">' + names[m.getMonth()] + ' ' + m.getFullYear() + '</div>' +
            '<div class="cal">' + cells + '</div>' +
            '<div class="row" style="margin-top:10px">' +
              '<button class="btn alt" data-act="month" data-v="-1" style="margin:0">‹ Earlier</button>' +
              '<button class="btn alt" data-act="month" data-v="1" style="margin:0"' +
                (S.month >= 0 ? ' disabled' : '') + '>Later ›</button>' +
            '</div></div>' +
          (recent ? '<div class="card"><div class="k">Recent sessions</div><div style="margin-top:9px">' +
            recent + '</div></div>' : '<div class="note">No sessions logged yet. Finish a day and it gets ticked here.</div>') +
          '<button class="btn alt" data-act="home">Back to the week</button>';
      }

      function openHelp() {
        sheet.innerHTML = '<h3>How this works</h3><ol>' +
          ['Pick a day from the week strip. Monday is built; the other days are placeholders for now.',
           'Each exercise plays as one continuous video in two parts. <b>Setup</b> shows how to stand and pick the weight up. <b>Train</b> shows the working posture. It loops, so watch it as long as you need.',
           'There is no rep counter and no countdown. Your sets, reps and suggested weight are written under the video.',
           '<b>How far it should travel</b> is the important one: it tells you exactly where each rep starts and stops.',
           'Tap <b>Done</b> when you have finished the exercise and it moves you to the next.',
           'Finish every exercise in a day and that date gets ticked on your calendar.',
           'There is no spoken coaching — Plethora Bits have music and sound but no voice, so every cue is on screen.'
          ].map(function (t) { return '<li>' + t + '</li>'; }).join('') +
          '</ol><button class="btn" data-act="closesheet">Got it</button>' +
          '<div class="note">Weight suggestions are a starting point, not coaching or medical advice.</div>';
        sheet.classList.remove('hidden');
      }

      /* ---------------- flow ---------------- */

      function markDone() {
        var d = curDay(), id = d.list[S.exi];
        var en = ensure(todayKey(), d.id);
        if (en.ex.indexOf(id) < 0) en.ex.push(id);
        haptic('success'); sting('success');
        try { ctx.platform.interact({ type: 'exercise_done', ex: id }); } catch (e) { /* ignore */ }

        var all = dayDoneCount(d) >= d.list.length;
        if (all) { en.done = true; finishDay(); return; }
        save();
        var n = S.exi + 1;
        while (n < d.list.length && exDone(d.list[n])) n++;
        if (n >= d.list.length) { n = 0; while (n < d.list.length && exDone(d.list[n])) n++; }
        S.exi = Math.min(n, d.list.length - 1);
        show('ex');
      }

      async function finishDay() {
        var d = curDay();
        ensure(todayKey(), d.id).done = true;
        await save();
        try { await ctx.memory.record('gym_streak').submit(streak(), { label: streak() + ' days' }); }
        catch (e) { /* optional */ }
        haptic('heavy'); sting('win');
        musicPreset('triumph', 100);
        try { ctx.platform.setProgress(1); ctx.platform.complete({ day: d.id }); } catch (e2) { /* ignore */ }
        show('daydone');
      }

      /* ---------------- input ---------------- */

      ctx.listen(root, 'click', function (ev) {
        var t = ev.target;
        while (t && t !== root && !t.getAttribute('data-act')) t = t.parentNode;
        if (!t || t === root) return;
        if (t.hasAttribute('disabled')) return;
        var act = t.getAttribute('data-act'), v = t.getAttribute('data-v');
        firstGesture();
        haptic('light');

        if (act === 'help') return openHelp();
        if (act === 'closesheet') return sheet.classList.add('hidden');
        if (act === 'sound') {
          S.musicOn = !S.musicOn;
          if (S.musicOn) { music = null; musicPreset('lofi', 88); sting('coin'); }
          else { try { ctx.music.stop({ fadeOutMs: 350 }); } catch (e) { /* optional */ } music = null; }
          save();
          return show(S.screen);
        }
        if (act === 'home') return show('home');
        if (act === 'progress') return show('progress');
        if (act === 'day') return show('day');
        if (act === 'openday') { S.day = parseInt(v, 10); S.exi = 0; return show('day'); }
        if (act === 'goex') { S.exi = parseInt(v, 10); return show('ex'); }
        if (act === 'done') return markDone();
        if (act === 'finishday') return finishDay();
        if (act === 'prev') { S.exi = Math.max(0, S.exi - 1); return show('ex'); }
        if (act === 'skip') { S.exi = Math.min(curDay().list.length - 1, S.exi + 1); return show('ex'); }
        if (act === 'month') { S.month += parseInt(v, 10); if (S.month > 0) S.month = 0; return show('progress'); }
      });

      /* tapping the video jumps between the two reels */
      ctx.listen(elStage, 'click', function () {
        if (S.screen !== 'ex') return;
        firstGesture();
        reel.name = reel.name === 'setup' ? 'train' : 'setup';
        reel.t = 0; reel.loops = 0;
        haptic('light');
      });

      ctx.listen(window, 'resize', measure);

      /* ---------------- frame loop ---------------- */

      function update(dt) {
        if (S.screen !== 'ex' || !scene.ex) return;
        var e = scene.ex;
        reel.t += dt;
        var phase;
        if (reel.name === 'setup') {
          if (reel.t >= e.sd) { reel.name = 'train'; reel.t = 0; reel.loops = 0; }
          phase = Math.min(1, reel.t / e.sd);
        } else {
          if (reel.t >= TRAIN_CYCLE) {
            reel.t -= TRAIN_CYCLE;
            reel.loops++;
            if (reel.loops >= TRAIN_LOOPS) { reel.name = 'setup'; reel.t = 0; }
          }
          phase = (reel.t % TRAIN_CYCLE) / TRAIN_CYCLE;
        }
        scene.phase = phase;

        var pill = elStage.querySelector('#phase');
        var fill = elStage.querySelector('#reelfill');
        if (pill) {
          pill.className = 'phase ' + (reel.name === 'setup' ? 's' : 't');
          pill.textContent = reel.name === 'setup' ? 'Setup' : 'Train';
        }
        if (fill) fill.style.width = Math.round(phase * 100) + '%';

        var text = capAt(reel.name === 'setup' ? e.ss : e.tc, phase);
        if (text !== lastCap) {
          lastCap = text;
          var cap = elPanel.querySelector('#cap');
          if (cap) cap.textContent = text;
        }
      }

      function draw() {
        drawBackground(g, ctx.width, ctx.height, timeMs);
        var r = stageRect;
        if (!r.w || !r.h || !scene.ex) return;
        if (S.screen === 'ex') {
          drawFigureInPanel(g, scene.ex, reel.name === 'setup' ? 'setup' : 'train',
            scene.phase || 0, r.x, r.y, r.w, r.h, timeMs, 1);
        } else {
          var fh = Math.min(r.h, r.w * 1.2);
          drawFigureInPanel(g, scene.ex, 'train', (timeMs / 2600) % 1,
            r.x, r.y + (r.h - fh) / 2, r.w, fh, timeMs, 1, { annotate: false });
        }
      }

      ctx.onFrame(function (dt, t) {
        timeMs = t;
        update(Math.min(dt, 64));
        draw();
      });

      /* ---------------- boot ---------------- */

      try {
        await ctx.loadFont('Inter', 'inter', '1.0.0', { weight: '400' });
        await ctx.loadFont('Inter', 'inter', '1.0.0', { weight: '700' });
        await ctx.loadFont('Bebas Neue', 'bebas-neue', '1.0.0', { weight: '400' });
      } catch (e) { /* system font fallback */ }

      await load();
      S.day = DAY_INDEX[today().getDay()];
      show('home');
      measure();
      draw();
      ctx.markVisualReady('first-frame');
      ctx.platform.ready();
    }
  };
})();
