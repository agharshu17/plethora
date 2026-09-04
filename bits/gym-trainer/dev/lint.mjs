// Contract checks for the exercise library. Every rule here exists because
// the matching bug shipped at least once.
//
//   node dev/lint.mjs
//
// It runs the real main.js in a bare window shim and inspects EX/WEEK/RIG
// directly, so it stays true to the source rather than to a copy of it.
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, '..', 'main.js'), 'utf8');
const marker = '  window.plethoraBit = {';
if (!src.includes(marker)) throw new Error('marker not found in main.js');

const sandbox = { window: {}, console };
sandbox.window.__GT = null;
vm.createContext(sandbox);
vm.runInContext(
  src.replace(marker, '  window.__GT = { EX: EX, WEEK: WEEK, RIG: RIG };\n' + marker),
  sandbox, { filename: 'main.js' });

const { EX, WEEK, RIG } = sandbox.window.__GT;
const fails = [];
const bad = (id, msg) => fails.push(id + ': ' + msg);
const tOf = (entry) => parseFloat(entry.slice(0, entry.indexOf('|')));

// capAt() and the marker picker both treat a timestamp as the END of the
// window it labels and fall back to the LAST entry once the phase passes it.
// A list that stops short of 1 therefore narrates its whole eccentric with a
// stale line - which is how a curl came to read "to chest" with the arms hanging.
function endsAtOne(id, name, list) {
  if (!list || !list.length) return;
  const ts = list.map(tOf);
  if (ts.some(Number.isNaN)) return bad(id, name + ' has an unparseable timestamp');
  for (let i = 1; i < ts.length; i++) {
    if (ts[i] <= ts[i - 1]) bad(id, name + ' timestamps are not ascending (' + ts.join(', ') + ')');
  }
  if (ts[ts.length - 1] !== 1) {
    bad(id, name + ' ends at ' + ts[ts.length - 1] + ', not 1, so the rest of the reel repeats it');
  }
}

// A train reel is a round trip: 0 = start, 0.5 = the far end, 1 = back to the
// start. Reading it as a one-way sweep is what labelled the bottom of a
// shoulder press "locked out".
function roundTrip(id, track) {
  if (!track || track.length < 2) return;
  if (track[0].t !== 0) bad(id, 'train track starts at ' + track[0].t + ', not 0');
  const last = track[track.length - 1];
  if (last.t !== 1) return bad(id, 'train track ends at ' + last.t + ', not 1');
  for (const k of Object.keys(track[0].p)) {
    if (Math.abs(track[0].p[k] - last.p[k]) > 1e-9) {
      return bad(id, 'train track does not return to its start pose (' + k + ')');
    }
  }
}

for (const id of Object.keys(EX)) {
  const e = EX[id];
  if (id === 'idle' || id === 'cheer') continue;

  // Cardio has no equipment rig and no reps: its train reel is a gait cycle
  // that travels rather than a round trip, so the loop rules do not apply.
  const isRep = !!e.rig;

  endsAtOne(id, 'tc', e.tc);
  endsAtOne(id, 'mk', e.mk);
  endsAtOne(id, 'ss', e.ss);
  if (isRep) roundTrip(id, e.tk);

  if (e.rig && !RIG[e.rig]) bad(id, 'unknown rig ' + e.rig);

  // The setup reel has to hand over to the train reel in the pose the train
  // reel begins in, or the figure snaps between the two. An exercise with its
  // own train camera (vwT) is exempt: the two reels are shot from different
  // angles, so their poses are authored in different frames of reference. That
  // exemption is also the trap - a vwT closing keyframe written in the TRAIN
  // camera's coordinates plays back in the SETUP camera, which once stood the
  // chest fly up off her bench. Shoot the setup reel's last frame and look.
  if (isRep && e.st && e.tk && !e.vwT) {
    const handover = e.st[e.st.length - 1].p, start = e.tk[0].p;
    const off = Object.keys(start).filter((k) => Math.abs(handover[k] - start[k]) > 0.5);
    if (off.length) bad(id, 'setup ends in a different pose than train starts (' + off.join(', ') + ')');
  }

  // A setup reel that does not move teaches nothing, and it is the whole
  // point of this Bit.
  if (isRep && e.st && e.st.length > 1) {
    const moved = e.st.some((kf) =>
      Object.keys(kf.p).some((k) => Math.abs(kf.p[k] - e.st[0].p[k]) > 1));
    if (!moved) bad(id, 'setup reel never moves');
  }

  if (!e.rom || !e.rom.length) bad(id, 'no range-of-motion endpoints');
  if (!e.cu || !e.cu.length) bad(id, 'no coaching cues');
  if (!e.ld) bad(id, 'no load line');
}

for (const day of WEEK) {
  if (day.rest) continue;
  if (!day.list || !day.list.length) { bad(day.id, 'training day with no exercises'); continue; }
  for (const id of day.list) if (!EX[id]) bad(day.id, 'lists unknown exercise ' + id);
}

const used = new Set(Object.values(EX).map((e) => e.rig).filter(Boolean));
for (const r of Object.keys(RIG)) if (!used.has(r)) bad('RIG.' + r, 'setup rig is never used');

const planned = new Set(WEEK.flatMap((d) => d.list || []));
for (const id of Object.keys(EX)) {
  if (id !== 'idle' && id !== 'cheer' && !planned.has(id)) bad(id, 'exercise is in no day');
}

if (fails.length) {
  console.error(fails.length + ' problem(s):');
  for (const f of fails) console.error('  ' + f);
  process.exit(1);
}
console.log('ok - ' + (Object.keys(EX).length - 2) + ' exercises, ' +
  WEEK.filter((d) => !d.rest).length + ' training days, ' +
  Object.keys(RIG).length + ' setup rigs');
