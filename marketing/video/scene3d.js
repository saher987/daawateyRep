// 3D layer of the promo: Mom and Dad as stylized 3D characters (built from
// primitives, no model files), a living room for the opening, and close-ups
// later in the film. Everything is a pure function of time t, so render.js can
// seek frame by frame. Lip-sync reads window.MOUTH (voice/mouth.js), which
// mix.py builds from the recorded lines.
import * as THREE from 'three';
import { RoundedBoxGeometry } from './vendor/addons/RoundedBoxGeometry.js';

const W = 1080, H = 1920;
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setSize(W, H, false);
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 100);

// ---------- helpers ----------
const mat = (color, rough = .6, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });
function mesh(geo, m, parent, pos = [0, 0, 0], scale) {
  const o = new THREE.Mesh(geo, m); o.position.set(...pos);
  if (scale) o.scale.set(...scale);
  o.castShadow = o.receiveShadow = true; parent && parent.add(o); return o;
}
const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
// 0 -> 1 ramp between a and b (eased)
const ramp = (t, a, b) => smooth((t - a) / (b - a));

// ---------- lights ----------
scene.add(new THREE.HemisphereLight(0xfff1dc, 0x2a2230, 1.1));
const key = new THREE.DirectionalLight(0xffe2b8, 2.4);
key.position.set(3, 6, 5); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 6; key.shadow.bias = -0.0005;
Object.assign(key.shadow.camera, { left: -4, right: 4, top: 5, bottom: -1, near: 1, far: 20 });
scene.add(key);
const rim = new THREE.DirectionalLight(0xe3c48a, 2.2); rim.position.set(-4, 4, -5); scene.add(rim);
const fill = new THREE.DirectionalLight(0x9db4ff, .5); fill.position.set(-5, 2, 4); scene.add(fill);

// ---------- character ----------
function makeChar(kind) {
  const mom = kind === 'mom';
  const skinM = mat(mom ? 0xf2c4a0 : 0xdaa682, .5);
  const clothM = mat(mom ? 0x8f2d4b : 0x1e2a46, .7);
  const hairM = mat(mom ? 0x3a2216 : 0x231812, .55);
  const darkM = mat(0x1c120c, .3);
  const whiteM = mat(0xffffff, .25);
  const goldM = mat(0xe3c48a, .25, { metalness: .8 });
  const c = { kind, root: new THREE.Group(), legs: new THREE.Group() };
  const R = c.root;

  // torso + legs (legs only show when seated in the living room)
  c.torso = mesh(new THREE.CapsuleGeometry(.48, .5, 8, 32), clothM, R, [0, 1.08, 0], [1, 1, .72]);
  R.add(c.legs);
  for (const s of [-1, 1]) {
    const thigh = mesh(new THREE.CapsuleGeometry(.17, .45, 6, 16), mom ? clothM : mat(0x1a2238, .75), c.legs, [s * .21, .62, .3]);
    thigh.rotation.x = Math.PI / 2;
    mesh(new THREE.CapsuleGeometry(.14, .38, 6, 16), mom ? skinM : mat(0x1a2238, .75), c.legs, [s * .21, .32, .62]);
    mesh(new THREE.SphereGeometry(.15, 16, 12), mat(mom ? 0x6b1f35 : 0x111111, .4), c.legs, [s * .21, .06, .7], [1, .6, 1.5]);
  }
  if (mom) {
    mesh(new THREE.TorusGeometry(.27, .022, 8, 40, Math.PI), goldM, R, [0, 1.7, 0], [1, 1, 1.05]).rotation.set(Math.PI / 2 + .45, 0, 0);
    mesh(new THREE.SphereGeometry(.05, 12, 10), goldM, R, [0, 1.6, .3]);
  } else {
    const tri = new THREE.Shape([new THREE.Vector2(-.19, 0), new THREE.Vector2(.19, 0), new THREE.Vector2(0, -.5)]);
    mesh(new THREE.ShapeGeometry(tri), whiteM, R, [0, 1.74, .3]).rotation.x = -.38;
    mesh(new THREE.CylinderGeometry(.065, .03, .36, 4), goldM, R, [0, 1.47, .375], [1, 1, .4]).rotation.set(-.3, Math.PI / 4, Math.PI);
    mesh(new THREE.SphereGeometry(.05, 10, 8), goldM, R, [0, 1.68, .33]);
  }
  // neck + head pivot
  mesh(new THREE.CylinderGeometry(.14, .16, .3, 16), skinM, R, [0, 1.85, 0]);
  c.head = new THREE.Group(); c.head.position.set(0, 1.9, 0); R.add(c.head);
  const Hd = c.head;
  mesh(new THREE.SphereGeometry(.6, 48, 32), skinM, Hd, [0, .5, 0], [1, 1.04, .95]);
  // eyes
  c.eyes = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Group(); e.position.set(s * .2, .56, .47); Hd.add(e);
    mesh(new THREE.SphereGeometry(.11, 24, 16), whiteM, e);
    mesh(new THREE.SphereGeometry(.066, 20, 14), darkM, e, [0, -.005, .065]);
    mesh(new THREE.SphereGeometry(.02, 8, 6), whiteM, e, [.025, .025, .125]);
    c.eyes.push(e);
  }
  // brows
  c.brows = [-1, 1].map((s) => {
    const b = mesh(new THREE.CapsuleGeometry(.028, .15, 4, 8), hairM, Hd, [s * .2, .76, .5]);
    b.rotation.z = Math.PI / 2; b.userData.s = s; return b;
  });
  mesh(new THREE.SphereGeometry(.075, 16, 12), skinM, Hd, [0, .44, .58]); // nose
  // cheeks
  c.cheeks = [-1, 1].map((s) => mesh(new THREE.SphereGeometry(.09, 16, 12),
    mat(0xf08a8a, .8, { transparent: true, opacity: 0 }), Hd, [s * .31, .36, .44], [1, .7, .4]));
  // mouth: dark opening + teeth + a lip curve (smile / frown)
  c.mouth = new THREE.Group(); c.mouth.position.set(0, .25, .5); Hd.add(c.mouth);
  c.mouthHole = mesh(new THREE.SphereGeometry(.1, 24, 16), mat(0x4a1418, .6), c.mouth, [0, 0, 0], [1.25, .2, .45]);
  c.teeth = mesh(new THREE.SphereGeometry(.1, 24, 12, 0, Math.PI * 2, 0, Math.PI * .32), whiteM, c.mouth, [0, -.02, .012], [1.05, .5, .42]);
  c.lip = mesh(new THREE.TorusGeometry(.12, .02, 8, 24, Math.PI), mat(mom ? 0xb04a5a : 0x8a4a3a, .5), c.mouth, [0, 0, .03]);
  if (!mom) {
    for (const s of [-1, 1]) {
      const m = mesh(new THREE.CapsuleGeometry(.055, .13, 4, 10), hairM, Hd, [s * .085, .33, .56]);
      m.rotation.z = s * 1.15;
    }
    for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(.13, 16, 12), skinM, Hd, [s * .6, .5, 0], [.6, 1, .8]);
    const cap = mesh(new THREE.SphereGeometry(.635, 48, 24, 0, Math.PI * 2, 0, Math.PI * .44), hairM, Hd, [0, .52, -.02]);
    cap.rotation.x = -.3;
    for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(.12, 12, 10), mat(0x8c8c8c, .6), Hd, [s * .57, .62, -.05], [.5, 1, 1]);
  } else {
    const cap = mesh(new THREE.SphereGeometry(.665, 48, 24, 0, Math.PI * 2, 0, Math.PI * .5), hairM, Hd, [0, .5, -.02]);
    cap.rotation.x = -.42;
    mesh(new THREE.CapsuleGeometry(.5, .55, 8, 24), hairM, Hd, [0, -.05, -.3], [1.2, 1, .6]);
    for (const s of [-1, 1]) mesh(new THREE.CapsuleGeometry(.16, .6, 6, 16), hairM, Hd, [s * .55, .15, .02]);
    mesh(new THREE.SphereGeometry(.24, 20, 16), hairM, Hd, [0, 1.02, -.32]); // bun
    for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(.04, 12, 10), goldM, Hd, [s * .6, .22, .1]);
  }
  // arms: shoulder -> elbow -> hand
  c.arms = [-1, 1].map((s) => {
    const sh = new THREE.Group(); sh.position.set(s * .5, 1.55, 0); R.add(sh);
    mesh(new THREE.CapsuleGeometry(.13, .34, 6, 16), clothM, sh, [0, -.3, 0]);
    const el = new THREE.Group(); el.position.set(0, -.6, 0); sh.add(el);
    mesh(new THREE.CapsuleGeometry(.12, .3, 6, 16), mom ? skinM : clothM, el, [0, -.26, 0]);
    mesh(new THREE.SphereGeometry(.14, 20, 14), skinM, el, [0, -.56, 0], [1, 1.1, .8]);
    return { sh, el, s };
  });
  return c;
}

// joint angles: [shoulderX, shoulderZ(out), elbowX]; negative X swings forward/up
const POSES = {
  lap:      { r: [-.45, .1, -.9], l: [-.45, .1, -.9] },
  forehead: { r: [-2.45, -.45, -1.75], l: [-.45, .1, -.9] },     // dad: hand to forehead
  cheeks:   { r: [-.95, -.2, -2.35], l: [-.95, -.2, -2.35] },   // mom: hands on cheeks
  explain:  { r: [-.7, .35, -1.3], l: [-.45, .1, -.9] },
  clasp:    { r: [-.75, -.35, -1.5], l: [-.75, -.35, -1.5] },  // happy, hands together
  thumb:    { r: [-1.0, .45, -1.9], l: [.05, .12, -.15] },
  wave:     { r: [-.2, 2.3, -.6], l: [.05, .15, -.15] },
  open:     { r: [-.25, .85, -.35], l: [-.25, .85, -.35] },
};
function blendPose(a, b, k) {
  const o = {};
  for (const side of ['r', 'l']) o[side] = a[side].map((v, i) => lerp(v, b[side][i], k));
  return o;
}

function updateChar(c, t, { mood = 0, talk = 0, pose = POSES.lap, wave = 0, look = 0, seed = 0 }) {
  // mood: 0 worried .. 1 happy
  const breathe = Math.sin(t * 2.1 + seed) * .012;
  c.torso.scale.set(1 + breathe, 1 + breathe, .72);
  // head: idle sway, nod while talking, turn toward partner (look)
  c.head.rotation.set(
    Math.sin(t * 9.5 + seed) * .05 * talk + Math.sin(t * 1.1 + seed) * .03 - (1 - mood) * .08,
    look + Math.sin(t * .9 + seed) * .06,
    Math.sin(t * 1.4 + seed) * .03 + (1 - mood) * .05 * Math.sin(t * 3 + seed));
  // blink every ~3.2s
  const ph = (t + seed * 1.7) % 3.2, blink = ph < .14 ? 1 - Math.sin(ph / .14 * Math.PI) * .9 : 1;
  const squint = lerp(1, .62, mood);
  for (const e of c.eyes) e.scale.set(1, blink * squint, 1);
  for (const b of c.brows) {
    b.rotation.z = Math.PI / 2 + b.userData.s * lerp(-.38, .08, mood); // worried: inner ends up
    b.position.y = lerp(.8, .78, mood);
  }
  for (const ch of c.cheeks) ch.material.opacity = .45 * mood;
  // mouth: base shape by mood + jaw from audio
  const open = talk;
  c.mouthHole.scale.set(lerp(.9, 1.3, mood) - open * .15, lerp(.12, .32, mood) * (1 - open) + open * .85, .45);
  c.teeth.visible = mood > .5 && open < .6;
  c.lip.rotation.z = mood > .5 ? Math.PI : 0;            // smile vs frown
  c.lip.position.y = mood > .5 ? .01 : -.02 - open * .05;
  c.lip.scale.set(lerp(.8, 1.15, mood), lerp(.6, .9, mood) * (1 - open * .7), 1);
  // arms
  for (const a of c.arms) {
    const [sx, sz, ex] = a.s < 0 ? pose.r : pose.l;
    a.sh.rotation.set(sx, 0, a.s * sz + (a.s < 0 ? -1 : 1) * 0);
    a.el.rotation.set(ex, 0, 0);
    if (a.s < 0 && wave) a.el.rotation.z = -Math.sin(t * 9) * .45 * wave;
    else a.el.rotation.z = 0;
    if (talk > .05 && pose === POSES.explain && a.s < 0) a.el.rotation.x += Math.sin(t * 6) * .15;
  }
}

const dad = makeChar('dad'), mom = makeChar('mom');
scene.add(dad.root, mom.root);

// ---------- living room (opening scene) ----------
const room = new THREE.Group(); scene.add(room);
mesh(new THREE.PlaneGeometry(20, 20), mat(0x3a2a20, .8), room).rotation.x = -Math.PI / 2;
mesh(new THREE.CircleGeometry(2.6, 64), mat(0x5a3a2e, .95), room, [0, .005, .6]).rotation.x = -Math.PI / 2;
const wall = mesh(new THREE.PlaneGeometry(20, 10), mat(0x2b2f3d, .9), room, [0, 5, -1.2]);
mesh(new RoundedBoxGeometry(3.6, .5, 1.3, 4, .12), mat(0x6e5a48, .85), room, [0, .3, .05]);        // seat
mesh(new RoundedBoxGeometry(3.6, 1.1, .35, 4, .14), mat(0x6e5a48, .85), room, [0, .95, -.55]);     // back
for (const s of [-1, 1]) mesh(new RoundedBoxGeometry(.4, .85, 1.3, 4, .15), mat(0x5f4c3c, .85), room, [s * 1.95, .5, .05]);
// side table + lamp
mesh(new THREE.CylinderGeometry(.35, .3, .7, 32), mat(0x2a201a, .5), room, [2.75, .35, -.3]);
mesh(new THREE.CylinderGeometry(.04, .06, .7, 12), mat(0xc9a35a, .3, { metalness: .7 }), room, [2.75, 1.05, -.3]);
mesh(new THREE.CylinderGeometry(.22, .38, .4, 32, 1, true), mat(0xffe3b0, .9, { emissive: 0xffc070, emissiveIntensity: .7, side: THREE.DoubleSide }), room, [2.75, 1.5, -.3]);
const lamp = new THREE.PointLight(0xffc27a, 6, 6, 1.6); lamp.position.set(2.75, 1.4, -.3); room.add(lamp);
// floor lamp behind mom, and a soft warm glow on the wall
mesh(new THREE.CylinderGeometry(.03, .03, 2.4, 10), mat(0xc9a35a, .3, { metalness: .7 }), room, [1.55, 1.2, -.95]);
mesh(new THREE.CylinderGeometry(.25, .4, .45, 32, 1, true), mat(0xffe3b0, .9, { emissive: 0xffc070, emissiveIntensity: .9, side: THREE.DoubleSide }), room, [1.55, 2.5, -.95]);
const floorLamp = new THREE.PointLight(0xffc27a, 5, 5, 1.5); floorLamp.position.set(1.55, 2.4, -.8); room.add(floorLamp);
// coffee table with a pile of guest lists and a phone
mesh(new RoundedBoxGeometry(1.8, .12, .8, 3, .05), mat(0x2a201a, .45), room, [0, .45, 1.55]);
for (const s of [-1, 1]) for (const z of [-1, 1]) mesh(new THREE.CylinderGeometry(.04, .04, .45, 8), mat(0x2a201a, .45), room, [s * .8, .22, 1.55 + z * .32]);
for (let i = 0; i < 9; i++) {
  const p = mesh(new THREE.BoxGeometry(.42, .012, .56), mat(i % 3 ? 0xf5efe3 : 0xe8dcc4, .9), room, [-.35 + (i % 3) * .05, .52 + i * .014, 1.5 + ((i * 37) % 7) * .01]);
  p.rotation.y = ((i * 53) % 9 - 4) * .06;
}
mesh(new RoundedBoxGeometry(.22, .02, .42, 2, .01), mat(0x111111, .2), room, [.45, .52, 1.55]).rotation.y = .3;

// ---------- shots ----------
// Each shot: [start, end, setup(t, k)]; k = 0..1 progress within the shot.
const say = (who, t) => {
  const M = window.MOUTH; if (!M) return 0;
  const i = Math.floor(t * M.fps); const a = M[who] || [];
  return Math.min(1, ((a[i] || 0) + (a[i - 1] || 0) + (a[i + 1] || 0)) / 3);
};
function place(c, x, y, z, ry = 0, s = 1) { c.root.position.set(x, y, z); c.root.rotation.set(0, ry, 0); c.root.scale.setScalar(s); }
// Point a straight-on camera so world point (wx, wy, 0) lands on screen pixel (sx, sy) from distance d.
const TAN = Math.tan(THREE.MathUtils.degToRad(15));
function frameAt(wx, wy, sx, sy, d) {
  const cx = wx - (sx - W / 2) / (W / 2) * d * TAN * (W / H);
  const cy = wy + (sy - H / 2) / (H / 2) * d * TAN;
  camera.position.set(cx, cy, d); camera.lookAt(cx, cy, 0);
}
const HEAD_Y = 2.4;          // head centre of a character standing at y=0
const BG_CLOSE = new THREE.Color(0x2a2a33);

// [start, end, setup(t, k) -> css for the canvas]; k = 0..1 within the shot.
// The HTML scenes in video.html leave room for these frames.
const SHOTS = [
  // 1 · living room, both worried; dad speaks, then mom
  [0, 9.6, (t, k) => {
    room.visible = true; dad.legs.visible = mom.legs.visible = true; scene.background = null;
    place(dad, -.82, .02, 0, .14); place(mom, .82, .02, 0, -.14);
    updateChar(dad, t, { mood: 0, talk: say('dad', t), seed: 0, look: t > 4.7 ? .45 : .05,
      pose: t < 4.6 ? blendPose(POSES.lap, POSES.forehead, ramp(t, .4, 1.1)) : blendPose(POSES.forehead, POSES.lap, ramp(t, 4.6, 5.4)) });
    updateChar(mom, t, { mood: 0, talk: say('mom', t), seed: 2, look: t < 4.6 ? -.45 : -.05,
      pose: t < 4.7 ? blendPose(POSES.lap, POSES.cheeks, ramp(t, 1.8, 2.6)) : blendPose(POSES.cheeks, POSES.explain, ramp(t, 4.8, 5.5)) });
    frameAt(lerp(.15, -.05, k), HEAD_Y, 540, 840, lerp(11.6, 10.4, k));
    return { clipPath: 'none', maskImage: 'none' };
  }],
  // 6 · mom, relieved (round portrait, lower right)
  [56.3, 60.2, (t) => {
    room.visible = false; mom.legs.visible = false; dad.root.visible = false; scene.background = BG_CLOSE;
    place(mom, 0, 0, 0, -.22);
    updateChar(mom, t, { mood: 1, talk: say('mom', t), seed: 2, pose: POSES.clasp });
    frameAt(0, HEAD_Y, 800, 1185, 21);
    return { clipPath: 'circle(205px at 800px 1240px)', maskImage: 'none' };
  }],
  // 8 · dad, happy, thumbs up (round portrait, lower left)
  [74.7, 78.2, (t) => {
    room.visible = false; dad.legs.visible = false; mom.root.visible = false; scene.background = BG_CLOSE;
    place(dad, 0, 0, 0, .22);
    updateChar(dad, t, { mood: 1, talk: say('dad', t), seed: 0, pose: blendPose(POSES.lap, POSES.thumb, ramp(t, 74.9, 75.5)) });
    frameAt(0, HEAD_Y, 280, 1185, 21);
    return { clipPath: 'circle(205px at 280px 1240px)', maskImage: 'none' };
  }],
  // 9 · finale: both happy, dad waves, mom opens her arms (top of frame)
  [78, 99, (t) => {
    room.visible = false; dad.legs.visible = mom.legs.visible = false; scene.background = null;
    place(dad, -.95, 0, 0, .2); place(mom, .95, 0, 0, -.2);
    updateChar(dad, t, { mood: 1, seed: 0, pose: blendPose(POSES.lap, POSES.wave, ramp(t, 78.6, 79.3)), wave: ramp(t, 79, 79.5) });
    updateChar(mom, t, { mood: 1, seed: 2, pose: blendPose(POSES.lap, POSES.open, ramp(t, 78.8, 79.5)), look: -.05 });
    frameAt(0, HEAD_Y, 540, 330, 16.5);
    return { clipPath: 'none', maskImage: 'linear-gradient(#000 0, #000 560px, transparent 720px)' };
  }],
];

window.render3D = (t) => {
  const shot = SHOTS.find(([a, b]) => t >= a && t < b);
  if (!shot) { canvas.style.opacity = 0; return; }
  dad.root.visible = mom.root.visible = true;
  const css = shot[2](t, clamp01((t - shot[0]) / (shot[1] - shot[0])));
  canvas.style.clipPath = css.clipPath;
  canvas.style.webkitMaskImage = canvas.style.maskImage = css.maskImage;
  // fade the 3D layer in/out with its shot (the opening starts from black)
  canvas.style.opacity = Math.min(shot[0] === 0 ? ramp(t, 0, .5) : ramp(t, shot[0], shot[0] + .4), 1 - ramp(t, shot[1] - .4, shot[1]));
  renderer.render(scene, camera);
};
window.ready3D = true;
