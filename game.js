
'use strict';
const { Engine, Bodies, Body, World, Events, Composite } = Matter;

// ─── Canvas & sizing ─────────────────────────────────────────────────────────
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
let W = 0, H = 0;           // world dimensions (game + 50% top, left, right)
let origW = 0, origH = 0;   // original window size (canvas size)

function resize() {
  origW = window.innerWidth;
  origH = window.innerHeight;
  W = origW + Math.round(origW * 0.25);   // +50% left, +50% right
  H = origH + Math.round(origH * 0.25);       // +50% top
  cv.width = origW;
  cv.height = origH;
  makeFISH();
  if (G && G.eng) {
    rebuildGround();
    G.camScaleX = W / origW;
    G.camScaleY = H / origH;
  }
}

// ─── Layout helpers — always derived from W/H ─────────────────────────────────
// Kept within initial camera view (center origW×origH of world)
function isLandscape() { return W > H; }
function GY() { return Math.round(H * (isLandscape() ? 0.84 : 0.86)); }
function TRAY_X() { return Math.round(W * (isLandscape() ? 0.30 : 0.32)); }
function TRAY_TOP_Y() { return GY() - Math.round(H * (isLandscape() ? 0.18 : 0.14)); }
function BRIK_REST_Y() { return TRAY_TOP_Y() - BH() / 2; }
function PLAT_BASE_X() { return Math.round(W * (isLandscape() ? 0.68 : 0.70)); }
function PLAT_BASE_Y() { return GY() - 20; }

// Brik size — scales with screen
function BW() { return Math.round(Math.min(W, H) * 0.065); }
function BH() { return Math.round(Math.min(W, H) * 0.115); }

// ─── FISH ───────────────────────────────────────────────────────────────────
let FISH = [];
function makeFISH() {
  const n = 10;
  FISH = Array.from({ length: n }, () => ({
    x: Math.random() * W,
    y: Math.random() * GY() * 0.8,
    r: 15,
    ph: Math.random() * 6.28,
    speed: Math.random() * 0.25 + 0.05,
  }));
}

// ─── Skins (one per tetra-brik flavour) ──────────────────────────────────────
// Each entry needs: { src, ratio, wineParticles }
// ratio = natural image width / height  (so the brik is never stretched)
// wineParticles = color palette for melt effect when brik hits the floor.
const TINTO_PALETTE = ['#4a1a6a', '#6b2d8a', '#8b4aaa', '#a86bc4', '#c090e0', '#e0b8ff'];
const BLANCO_PALETTE = ['#7cb87c', '#9ed49e', '#b8e0b8', '#c8e8c8', '#d4f0d4', '#e0f8e0'];
const ROSADO_PALETTE = ['#c87090', '#d890a8', '#e8b0c0', '#f0c8d4', '#f8dce4', '#ffe0ea'];

const SKINS = [
  { src: 'imgs/tinto.png', ratio: 100 / 190, wineParticles: TINTO_PALETTE },
  { src: 'imgs/blanco.png', ratio: 100 / 190, wineParticles: BLANCO_PALETTE },
  { src: 'imgs/rosado.png', ratio: 100 / 190, wineParticles: ROSADO_PALETTE },
  { src: 'imgs/tintodulce.png', ratio: 100 / 190, wineParticles: TINTO_PALETTE },
  { src: 'imgs/blancodulce.png', ratio: 100 / 190, wineParticles: BLANCO_PALETTE },
];

// ─── Asset loader ────────────────────────────────────────────────────────────
// Add all images (and later Audio objects) to ASSETS before boot.
// Each entry: { type:'image'|'audio', obj: Image|Audio, src: string }
// The loader waits for everything to resolve then fades out.
const ASSETS = [];

function addImage(src, crossOrigin = true) {
  const img = new Image();
  if (crossOrigin) img.crossOrigin = 'anonymous';
  img.src = src;
  ASSETS.push({ type: 'image', obj: img, src });
  return img;
}

function addAudio(src) {
  const audio = new Audio();
  audio.preload = 'auto';
  audio.src = src;
  ASSETS.push({ type: 'audio', obj: audio, src });
  return audio;
}

// ── Register skin images ──────────────────────────────────────────────────────
SKINS.forEach(s => { s.img = addImage(s.src); });

// ── Register sound effects ────────────────────────────────────────────────────
const SFX_LAUNCH = [addAudio('sounds/ahiva.mp3'), addAudio('sounds/ahivapapa.mp3')];
const SFX_PERFECT = [
  addAudio('sounds/yesss.mp3'),
  addAudio('sounds/yes.mp3'),
  addAudio('sounds/vamosquesepuede.mp3'),
  addAudio('sounds/paravosyuta.mp3'),
  addAudio('sounds/opaaaa.mp3'),
  addAudio('sounds/opa.mp3'),
];
const SFX_FAIL = [addAudio('sounds/oleee.mp3'), addAudio('sounds/vamosquesepuede.mp3')];
const SFX_LAND = [addAudio('sounds/ahorasi.mp3'), addAudio('sounds/paravos.mp3')];

// ── Background image (optional) ───────────────────────────────────────────────
// const BG_IMG = addImage('/background.jpg');
const FISH_IMG = addImage('imgs/fish.png');

// ─── DOM ─────────────────────────────────────────────────────────────────────
const msgEl = document.getElementById('msg');
const popEl = document.getElementById('pop');
let popTimer = null;
let msgHideTimer = null;

function showMsg(h, sub = '', pts = '', showBtn = false) {
  clearTimeout(msgHideTimer);
  msgHideTimer = null;
  if (showBtn) {
    msgEl.classList.add('msg-dim');
  } else {
    msgEl.classList.remove('msg-dim');
  }
  msgEl.innerHTML =
    `<h1>${h}</h1>` +
    (sub ? `<div class="sub">${sub}</div>` : '') +
    (pts ? `<div class="pts">${pts}</div>` : '') +
    (showBtn ? `<button class="restart-btn" onclick="init()">PLAY AGAIN</button>` : '');
  msgEl.classList.remove('off');
}
function hideMsg() { msgEl.classList.add('off'); }
function pop(txt) {
  popEl.textContent = txt;
  popEl.classList.add('on');
  clearTimeout(popTimer);
  popTimer = setTimeout(() => popEl.classList.remove('on'), 1400);
}

// ─── Game state ───────────────────────────────────────────────────────────────
let G;

function newG() {
  return {
    eng: null, wld: null,
    platBody: null, brikBody: null,
    skin: SKINS[0],
    particles: [], trail: [],
    // Touch / mouse drag
    touching: false,
    touchStart: { x: 0, y: 0 },   // where finger first landed
    touchCur: { x: 0, y: 0 },   // current finger position
    phase: 'idle',               // 'idle' | 'flying' | 'dead'
    shake: 0,
    score: 0, best: 0, streak: 0, level: 1,
    sid: 0,
    platW: 0,
    landedBriks: [],   // briks that have successfully landed and stay in world
    camScaleX: 1, camScaleY: 1, brikMinY: null, brikHitTarget: false,   // zoom: original view = (W/origW, H/origH)
  };
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function init() {
  if (G && G.eng) {
    // Landed briks are physics bodies — World.clear handles them,
    // but reset the array reference too
    G.landedBriks = [];
    Events.off(G.eng);
    World.clear(G.eng.world, false);
    Engine.clear(G.eng);
  }
  const prevBest = G ? G.best : 0;
  G = newG();
  G.best = prevBest;
  G.camScaleX = W / origW;
  G.camScaleY = H / origH;
  G.sid = Math.random();
  G.touchStart = { x: TRAY_X(), y: BRIK_REST_Y() };
  G.touchCur = { x: TRAY_X(), y: BRIK_REST_Y() };

  G.eng = Engine.create({ gravity: { x: 0, y: 2.5 } });
  G.wld = G.eng.world;

  rebuildGround();
  Events.on(G.eng, 'collisionStart', onHit);

  G.skin = SKINS[Math.floor(Math.random() * SKINS.length)];
  makePlatform();
  updateUI();
  showMsg('VINO TORO FLIP',
    'DRAG LEFT → POWER &nbsp;·&nbsp; DRAG UP/DOWN → ANGLE<br>RELEASE TO FLIP · LAND UPRIGHT');
  msgHideTimer = setTimeout(function () {
    msgHideTimer = null;
    hideMsg();
  }, 4000);
}

function rebuildGround() {
  Composite.allBodies(G.wld)
    .filter(b => b.label === 'ground')
    .forEach(b => { try { World.remove(G.wld, b); } catch (_) { } });
  World.add(G.wld, Bodies.rectangle(W / 2, GY() + 15, W + 300, 30,
    { isStatic: true, label: 'ground', friction: .8, restitution: .05 }));
}

// ─── Platform ─────────────────────────────────────────────────────────────────
function makePlatform() {
  if (G.platBody) { try { World.remove(G.wld, G.platBody); } catch (_) { } }
  const pw = Math.max(BW() * 1.6, Math.min(W * 0.22, W * 0.22 - G.level * 4));
  const maxRise = GY() * 0.55;
  const py = Math.max(GY() - maxRise, PLAT_BASE_Y() - G.level * Math.round(H * 0.03));
  const jitter = W * 0.08;
  const px = PLAT_BASE_X() + (Math.random() - .5) * jitter;
  G.platW = pw;
  G.platBody = Bodies.rectangle(px, py, pw, 12,
    { isStatic: true, label: 'platform', friction: .9, restitution: .02 });
  G.platBody._pw = pw;
  World.add(G.wld, G.platBody);
}

// ─── Arc calculation ──────────────────────────────────────────────────────────
// Player touches near brik and drags LEFT (and optionally up/down).
// The drag vector is used: rightward release = forward throw (mirrored).
function arcFromDrag() {
  const ox = TRAY_X(), oy = BRIK_REST_Y();
  const sx = G.touchStart.x, sy = G.touchStart.y;
  const cx = G.touchCur.x, cy = G.touchCur.y;

  // Drag delta from start to current
  const ddx = cx - sx;   // negative = dragged left = pulling back
  const ddy = cy - sy;

  // Horizontal pull: only counts when dragged LEFT
  const pullX = Math.max(0, -ddx);
  const maxPull = W * 0.38;                         // up to 38% of screen width
  const clampedX = Math.min(pullX, maxPull);
  const power = Math.min(1, 2 * clampedX / maxPull);  // 0..1, 2x sensitivity

  // Initial angle from click Y: brik rest Y = 0°, top of viewport = 90°
  const spaceToTop = oy;  // brik rest y to top (top is 0)
  const clickY = Math.max(0, Math.min(sy, spaceToTop));
  const baseAngleDeg = spaceToTop <= 0 ? 45 : 90 * (spaceToTop - clickY) / spaceToTop;
  const baseAngle = baseAngleDeg * Math.PI / 180;
  const angleRange = 70 * Math.PI / 180;  // 2x sensitivity for drag
  const dyNorm = -ddy / (H * 0.2);        // up = steeper
  const angle = Math.max(0, Math.min(90 * Math.PI / 180,
    baseAngle + dyNorm * angleRange));

  const speed = 30 + power * 30;                   // base x3: 30..50
  const vx = Math.cos(angle) * speed;
  const vy = -Math.sin(angle) * speed;           // negative = up
  const spin = -(power * 0.24 + 0.05);            // CCW

  return { vx, vy, spin, power, angle, pullX: clampedX };
}

// ─── Launch ───────────────────────────────────────────────────────────────────
function launch() {
  if (G.brikBody) { try { World.remove(G.wld, G.brikBody); } catch (_) { } G.brikBody = null; }

  const { vx, vy, spin, power } = arcFromDrag();
  if (power < 0.04) return;   // tap without drag = ignore

  const brik = Bodies.rectangle(TRAY_X(), BRIK_REST_Y(), BW(), BH(), {
    label: 'brik', restitution: .15, friction: .6, frictionAir: .007, density: .005,
  });
  brik._hit = false;
  brik._done = false;
  brik._settleTimer = null;
  brik._bigBurst = false;
  brik._skin = G.skin;   // remember skin so it draws correctly after archiving
  World.add(G.wld, brik);
  G.brikBody = brik;

  Body.setVelocity(brik, { x: vx, y: vy });
  Body.setAngularVelocity(brik, spin);
  // select random SFX_LAUNCH to play on launch
  const sfx = SFX_LAUNCH[Math.floor(Math.random() * SFX_LAUNCH.length)];
  sfx.currentTime = 0;
  sfx.play().catch(() => { });;
  G.phase = 'flying';
  G.trail = [];
  G.brikMinY = null;
  G.brikHitTarget = false;
  clearTimeout(msgHideTimer);
  msgHideTimer = null;
  hideMsg();
}

// ─── Input ────────────────────────────────────────────────────────────────────
// Works for both touch and mouse.
// Drag can start ANYWHERE — no need to hit the brik exactly.
function evXY(e) {
  const src = e.changedTouches ? e.changedTouches[0] : e;
  var rect = cv.getBoundingClientRect();
  var x = ((src.clientX - rect.left) / rect.width) * W;
  var y = ((src.clientY - rect.top) / rect.height) * H;
  return { x: x, y: y };
}

cv.addEventListener('touchstart', e => {
  e.preventDefault();
  if (G.phase !== 'idle') return;
  const p = evXY(e);
  G.touching = true;
  G.touchStart = { ...p };
  G.touchCur = { ...p };
}, { passive: false });

cv.addEventListener('touchmove', e => {
  e.preventDefault();
  if (!G.touching) return;
  G.touchCur = evXY(e);
}, { passive: false });

cv.addEventListener('touchend', e => {
  e.preventDefault();
  if (!G.touching || G.phase !== 'idle') return;
  G.touching = false;
  launch();
  // Reset drag visual
  G.touchStart = { x: TRAY_X(), y: BRIK_REST_Y() };
  G.touchCur = { x: TRAY_X(), y: BRIK_REST_Y() };
}, { passive: false });

cv.addEventListener('touchcancel', e => {
  e.preventDefault();
  G.touching = false;
}, { passive: false });

// Mouse fallback (desktop)
cv.addEventListener('mousedown', e => {
  if (G.phase !== 'idle') return;
  const p = evXY(e);
  G.touching = true;
  G.touchStart = { ...p };
  G.touchCur = { ...p };
});
cv.addEventListener('mousemove', e => {
  if (!G.touching) return;
  G.touchCur = evXY(e);
});
cv.addEventListener('mouseup', e => {
  if (!G.touching || G.phase !== 'idle') return;
  G.touching = false;
  launch();
  G.touchStart = { x: TRAY_X(), y: BRIK_REST_Y() };
  G.touchCur = { x: TRAY_X(), y: BRIK_REST_Y() };
});

document.addEventListener('keydown', e => {
  if (e.key === 'r' || e.key === 'R') init();
});

// ─── Collision ────────────────────────────────────────────────────────────────
// Any brik (flying or previously landed) that touches the ground is melted.
function onHit({ pairs }) {
  const sid = G.sid;
  pairs.forEach(({ bodyA, bodyB }) => {
    // When both bodies are briks, Matter.js order is undefined — always treat
    // G.brikBody as the flying brik, or we return early at brik !== G.brikBody
    // and stack landings never run.
    var brik;
    var other;
    if (bodyA.label === 'brik' && bodyB.label === 'brik') {
      if (bodyA === G.brikBody) {
        brik = bodyA;
        other = bodyB;
      } else if (bodyB === G.brikBody) {
        brik = bodyB;
        other = bodyA;
      } else {
        return;
      }
    } else {
      brik = bodyA.label === 'brik' ? bodyA : bodyB.label === 'brik' ? bodyB : null;
      other = brik === bodyA ? bodyB : bodyA;
    }
    if (!brik) return;

    if (other.label === 'ground') {
      meltBrik(brik.position.x, brik.position.y, brik._skin);
      try { World.remove(G.wld, brik); } catch (_) { }
      if (brik === G.brikBody) {
        clearPendingSettle(brik);
        brik._hit = true;
        G.brikBody = null;
        G.brikHitTarget = true;
        G.shake = 3;
        setTimeout(function () { if (G.sid === sid) fail(); }, 700);
      } else {
        var idx = G.landedBriks.indexOf(brik);
        if (idx >= 0) G.landedBriks.splice(idx, 1);
        if (G.phase !== 'dead') {
          G.shake = 3;
          setTimeout(function () { if (G.sid === sid) fail(); }, 700);
        }
      }
      return;
    }
    if (brik !== G.brikBody) return;

    // Platform beats a graze on the stack: can fire after brik–brik in another
    // frame or later in the same forEach — must run before the _hit gate.
    if (other.label === 'platform') {
      if (brik._settleTimer != null) {
        clearTimeout(brik._settleTimer);
        brik._settleTimer = null;
      }
      if (!brik._bigBurst) {
        burst(brik.position.x, brik.position.y, 18, true);
        G.shake = 8;
        brik._bigBurst = true;
      }
      brik._hit = true;
      G.brikHitTarget = true;
      brik._settleTimer = setTimeout(function () {
        brik._settleTimer = null;
        if (G.sid === sid) settle(brik, other);
      }, 1200);
      return;
    }

    if (brik._hit) return;
    brik._hit = true;
    G.brikHitTarget = true;

    if (other.label === 'brik' && G.landedBriks.indexOf(other) >= 0) {
      burst(brik.position.x, brik.position.y, 18, true);
      G.shake = 8;
      brik._bigBurst = true;
      brik._settleTimer = setTimeout(function () {
        brik._settleTimer = null;
        if (G.sid === sid) settle(brik, other);
      }, 1200);
    } else {
      burst(brik.position.x, brik.position.y, 8, false);
      G.shake = 3;
      setTimeout(function () { if (G.sid === sid) fail(); }, 700);
    }
  });
}

function clearPendingSettle(brik) {
  if (brik && brik._settleTimer != null) {
    clearTimeout(brik._settleTimer);
    brik._settleTimer = null;
  }
}

function brikOverlapsSupport(brik, support) {
  const { x: bx, y: by } = brik.position;
  const { x: px, y: py } = support.position;
  if (support.label === 'platform') {
    return Math.abs(bx - px) < support._pw / 2 + BW() / 2 - 3
      && by < py + 8 && by > py - BH() * 3;
  }
  return Math.abs(bx - px) < BW() - 3
    && by < py + 8 && by > py - BH() * 3;
}

// ─── Settle ───────────────────────────────────────────────────────────────────
// support = platform body, or a landed brik to stack on
function settle(brik, support) {
  if (brik._done || G.phase === 'dead') return;
  const spd = Math.hypot(brik.velocity.x, brik.velocity.y);
  const av = Math.abs(brik.angularVelocity);
  let a = brik.angle % (Math.PI * 2); if (a < 0) a += Math.PI * 2;
  const fromUpright = Math.min(a, Math.PI * 2 - a);
  const fromFlipped = Math.abs(a - Math.PI);
  let over = brikOverlapsSupport(brik, support);
  // Grazed the stack then came to rest on the platform — still a valid land.
  if (!over && support.label === 'brik' && G.platBody) {
    over = brikOverlapsSupport(brik, G.platBody);
  }

  if (over && spd < 2.8 && av < 0.10) {
    let mult = 1, label = 'LANDED!';

    if (fromUpright < 0.38) {
      mult = 3; label = 'PERFECT!';
      // Play perfect SFX on perfect landing
      const sfx = SFX_PERFECT[Math.floor(Math.random() * SFX_PERFECT.length)];
      sfx.currentTime = 0;
      sfx.play().catch(() => { });

    }
    else if (fromFlipped < 0.38) {
      mult = 2; label = 'UPSIDE DOWN!';
      // Play perfect SFX on perfect landing
      const sfx = SFX_LAND[Math.floor(Math.random() * SFX_LAND.length)];
      sfx.currentTime = 0;
      sfx.play().catch(() => { });
    }
    doSuccess(brik, label, mult);
  } else if (spd > 0.5 || av > 0.06) {
    const sid = G.sid;
    setTimeout(() => { if (G.sid === sid) settle(brik, support); }, 750);
  } else {
    fail();
    // play random SFX_FAIL on fail
    const sfx = SFX_FAIL[Math.floor(Math.random() * SFX_FAIL.length)];
    sfx.currentTime = 0;
    sfx.play().catch(() => { });
  }
}

// ─── Success / Fail ───────────────────────────────────────────────────────────
function doSuccess(brik, label, mult) {
  if (brik._done || G.phase === 'dead') return;
  clearPendingSettle(brik);
  brik._done = true;
  G.phase = 'idle';
  G.streak++;
  const pts = Math.floor((10 + G.level * 5) * mult * (G.streak > 2 ? G.streak - 1 : 1));
  G.score += pts;
  if (G.score > G.best) G.best = G.score;
  G.level++;
  updateUI();
  burst(brik.position.x, brik.position.y - 20, 30, true);
  G.shake = 6;
  const streakTxt = G.streak >= 3 ? ` · ${G.streak}× STREAK` : '';
  pop(`${label}${streakTxt}  +${pts}`);
  // Archive the landed brik — keep it in the physics world so it stays visible
  G.landedBriks.push(brik);
  G.brikBody = null;

  const sid = G.sid;
  // select random SFX_PERFECT to play on launch
  const sfx = SFX_PERFECT[Math.floor(Math.random() * SFX_PERFECT.length)];
  sfx.currentTime = 0;
  sfx.play();
  // No makePlatform() — same platform, pile keeps growing
  setTimeout(() => { if (G.sid !== sid) return; spawnIdle(); }, 950);
}

function fail() {
  if (G.phase === 'dead') return;
  G.phase = 'dead'; G.streak = 0;
  if (G.score > G.best) G.best = G.score;
  updateUI();
  showMsg('OOPS!', '', `SCORE ${G.score}`, true);
}

function spawnIdle() {
  // Don't remove brikBody here — landed briks are now owned by G.landedBriks
  // Only remove if it's an un-launched idle placeholder (isStatic)
  if (G.brikBody && G.brikBody.isStatic) {
    try { World.remove(G.wld, G.brikBody); } catch (_) { }
  }
  G.brikBody = null;
  G.skin = SKINS[Math.floor(Math.random() * SKINS.length)];
  G.phase = 'idle';
  G.trail = [];
  G.touchStart = { x: TRAY_X(), y: BRIK_REST_Y() };
  G.touchCur = { x: TRAY_X(), y: BRIK_REST_Y() };
}

// ─── Particles ────────────────────────────────────────────────────────────────
function burst(x, y, n, big = false) {
  const cols = ['#60e8a0', '#e0e060', '#ff6868', '#60b8ff', '#ffffff', '#ff98c8'];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = Math.random() * (big ? 7 : 3.5) + 1;
    G.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (big ? 3 : 1),
      life: 1, decay: Math.random() * .02 + .013,
      r: Math.random() * (big ? 5.5 : 3) + 1.5,
      col: cols[Math.floor(Math.random() * cols.length)],
    });
  }
}

// Wine melt particles when brik hits the floor (color from skin.wineParticles)
function meltBrik(x, y, skin) {
  const palette = (skin && skin.wineParticles);
  const n = 140;
  const spread = 8;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = Math.random() * 3 + 1.5;
    const vy = Math.random() * 2.5 + 1.5;
    G.particles.push({
      x: x + (Math.random() - 0.5) * spread,
      y: y,
      vx: Math.cos(a) * s,
      vy: vy,
      life: 1,
      decay: Math.random() * 0.012 + 0.008,
      r: Math.random() * 2.5 + 1.8,
      col: palette[Math.floor(Math.random() * palette.length)],
    });
  }
}

// ─── UI ───────────────────────────────────────────────────────────────────────
function updateUI() {
  document.getElementById('s-score').textContent = G.score;
  document.getElementById('s-best').textContent = G.best;
  document.getElementById('s-streak').textContent = G.streak;
}

// ─── Draw ─────────────────────────────────────────────────────────────────────

function drawBg() {
  const gy = GY();
  var skyTop = -H * 2;
  var skyH = gy - skyTop;
  const gr = ctx.createLinearGradient(0, skyTop, 0, gy);
  gr.addColorStop(0, '#07101a'); gr.addColorStop(1, '#0f1e2c');
  ctx.fillStyle = gr;
  ctx.fillRect(-W * 2, skyTop, W * 5, skyH);

  const t = Date.now() * .001;
  FISH.forEach(s => {
    s.x += s.speed;
    if (s.x > W + s.r) s.x = -s.r;
    ctx.globalAlpha = .25 + Math.sin(t + s.ph) * .2;
    if (FISH_IMG.complete && FISH_IMG.naturalWidth > 0) {
      const ratio = FISH_IMG.naturalWidth / FISH_IMG.naturalHeight;
      const drawH = s.r * 2;
      const drawW = drawH * ratio;
      ctx.drawImage(FISH_IMG, s.x - drawW / 2, s.y - drawH / 2, drawW, drawH);
    } else {
      // fallback circle while image loads
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    }
  });
  ctx.globalAlpha = 1;

  // Ground (extend left/right so zoomed-out view never shows empty)
  ctx.fillStyle = '#0c1420';
  ctx.fillRect(-W * 2, gy, W * 5, H - gy + H);
  // Grass strip
  ctx.fillStyle = '#14261a';
  ctx.fillRect(-W * 2, gy, W * 5, 5);
}

function drawTray() {
  const tx = TRAY_X(), ty = TRAY_TOP_Y(), gy = GY();
  const bw = BW(), legW = Math.max(6, bw * 0.22);
  const tableW = bw * 3.2;

  // Legs
  ctx.fillStyle = '#182430';
  ctx.fillRect(tx - tableW / 2 + 4, ty + 2, legW, gy - ty - 2);
  ctx.fillRect(tx + tableW / 2 - 4 - legW, ty + 2, legW, gy - ty - 2);
  // Table top
  ctx.fillStyle = '#1e3040';
  ctx.fillRect(tx - tableW / 2, ty - 10, tableW, 12);
  // Top shine
  ctx.fillStyle = '#263a50';
  ctx.fillRect(tx - tableW / 2, ty - 10, tableW, 3);
}

function drawBrik(x, y, angle, skin) {
  skin = skin || G.skin || SKINS[0];
  const bh = BH();
  // Preserve each image's own aspect ratio so nothing looks stretched
  const bw = Math.round(bh * (skin.ratio || 195 / 300));

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  ctx.shadowColor = 'rgba(0,0,0,0.65)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 6;

  if (skin.img && skin.img.complete && skin.img.naturalWidth > 0) {
    ctx.drawImage(skin.img, -bw / 2, -bh / 2, bw, bh);
  } else {
    // Fallback while image loads — plain tinted rectangle
    ctx.fillStyle = '#c82020';
    ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(-bw / 2, -bh / 2, bw, bh * 0.18);
  }

  ctx.restore();
}

function drawPlatform() {
  if (!G.platBody) return;
  const { x, y } = G.platBody.position, w = G.platBody._pw || G.platW, h = 12;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 6;
  ctx.fillStyle = '#162218'; ctx.fillRect(x - w / 2, y - h / 2, w, h);
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.fillStyle = '#244830'; ctx.fillRect(x - w / 2, y - h / 2, w, 4);
  ctx.fillStyle = '#38785a'; ctx.fillRect(x - w / 2, y - h / 2, w, 1.5);
  // Drop guide
  ctx.strokeStyle = 'rgba(96,232,160,.3)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
  ctx.beginPath(); ctx.moveTo(x, y - h / 2 - 5); ctx.lineTo(x, y - h / 2 - 16); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// ─── Aimer: drag indicator + trajectory dots + power bar ─────────────────────
function drawAimer() {
  if (G.phase !== 'idle' || !G.touching) return;

  const { vx, vy, power, angle, pullX } = arcFromDrag();
  const ox = TRAY_X(), oy = BRIK_REST_Y();
  const cx = G.touchCur.x, cy = G.touchCur.y;

  // ── Trajectory preview (same intensity colors as power bar: green → red by power) ─
  var TRAJ_MIN_OPACITY = 0.1;
  var grav = 2.5 * 0.003;
  var trajR = Math.floor(power * 220);
  var trajG = Math.floor((1 - power) * 180 + 60);
  ctx.save();
  for (var ti = 0.08; ti < 3.2; ti += 0.1) {
    var ex = ox + vx * ti * 16;
    var ey = oy + vy * ti * 16 + 0.5 * grav * (ti * 16) * (ti * 16);
    if (ex > W + 20 || ey > GY() + 10 || ex < 0) break;
    var frac = ti / 3.2;
    var dotOpacity = (1 - frac) * 0.8 * power;
    if (dotOpacity < TRAJ_MIN_OPACITY) dotOpacity = TRAJ_MIN_OPACITY;
    ctx.fillStyle = 'rgba(' + trajR + ',' + trajG + ',50,' + dotOpacity + ')';
    ctx.beginPath(); ctx.arc(ex, ey, Math.max(2, 4 * (1 - frac * 0.5)), 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // ── Quarter-circle + angle scale (90 / 45 / 0) — same tones as power bar track ─
  var bwA = BW(), bhA = BH();
  var arcCx = ox - bwA * 0.5;
  var arcCy = oy + bhA * 0.5;
  var arcR = Math.min(W, H) * 0.11 * (0.88 + 0.12 * power);
  var innerGap = Math.max(3, Math.min(W, H) * 0.012);
  var innerR = arcR - innerGap;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,.55)';
  ctx.lineWidth = Math.max(2.5, Math.min(W, H) * 0.004);
  var dotLen = Math.max(1.8, Math.min(W, H) * 0.0028);
  ctx.setLineDash([dotLen, dotLen * 1.85]);
  ctx.beginPath();
  ctx.arc(arcCx, arcCy, arcR, -Math.PI / 2, 0, false);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(140,160,170,.6)';
  ctx.font = `${Math.round(Math.max(8, Math.min(W, H) * 0.017))}px 'Courier New', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  var angleMarks = [90, 45, 0];
  for (var mi = 0; mi < angleMarks.length; mi++) {
    var deg = angleMarks[mi];
    var tInner = (90 - deg) / 90;
    var theta = -Math.PI / 2 + tInner * (Math.PI / 2);
    var tx = arcCx + innerR * Math.cos(theta);
    var ty = arcCy + innerR * Math.sin(theta);
    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(theta + Math.PI / 2);
    ctx.fillText(String(deg), 0, 0);
    ctx.restore();
  }
  ctx.restore();

  // ── Power bar — below the tray, wide and thumb-friendly ─────────────────
  const barW = Math.min(W * 0.45, 220);
  const bx = ox - barW / 2;
  const by = TRAY_TOP_Y() + 18;
  const barH = Math.max(12, H * 0.022);
  const rc = Math.floor(power * 220), gc = Math.floor((1 - power) * 180 + 60);
  ctx.save();
  // bg track
  ctx.fillStyle = 'rgba(0,0,0,.55)';
  ctx.beginPath(); ctx.roundRect(bx - 2, by - 2, barW + 4, barH + 4, 4); ctx.fill();
  // sweet-spot highlight
  ctx.fillStyle = 'rgba(255,255,255,.07)';
  ctx.beginPath(); ctx.roundRect(bx + barW * 0.3, by, barW * 0.3, barH, 2); ctx.fill();
  // fill
  ctx.fillStyle = `rgb(${rc},${gc},50)`;
  ctx.beginPath(); ctx.roundRect(bx, by, barW * power, barH, 2); ctx.fill();
  // label
  ctx.fillStyle = 'rgba(140,160,170,.6)';
  ctx.font = `${Math.round(Math.max(9, barH * 0.7))}px Courier New`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  var powerLabelY = by + barH + Math.round(barH * 1.1);
  ctx.fillText('POWER', bx + barW / 2, powerLabelY);
  var angleDeg = Math.round(angle * 180 / Math.PI);
  ctx.fillText(String(angleDeg) + '\u00B0', bx + barW / 2, powerLabelY + Math.round(barH * 1.15));
  ctx.restore();


}

function drawTrail() {
  const tr = G.trail; if (tr.length < 2) return;
  ctx.save();
  for (let i = 1; i < tr.length; i++) {
    ctx.strokeStyle = `rgba(96,232,160,${(i / tr.length) * .32})`;
    ctx.lineWidth = Math.max(1, 2.5 * (i / tr.length)); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(tr[i - 1].x, tr[i - 1].y); ctx.lineTo(tr[i].x, tr[i].y); ctx.stroke();
  }
  ctx.restore();
}

// Green ring flashes when brik is near upright
function drawUprightHint() {
  if (G.phase !== 'flying' || !G.brikBody) return;
  let a = G.brikBody.angle % (Math.PI * 2); if (a < 0) a += Math.PI * 2;
  const d = Math.min(a, Math.PI * 2 - a);
  if (d > .45) return;
  const { x, y } = G.brikBody.position;
  ctx.save();
  ctx.globalAlpha = .42 * (1 - d / .45);
  ctx.strokeStyle = '#60e8a0'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(x, y, BH() * .7, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

// Idle "drag hint" arrow — shows new players where to drag
function drawDragHint() {
  if (G.phase !== 'idle' || G.touching) return;
  const ox = TRAY_X(), oy = BRIK_REST_Y();
  const t = Date.now() * .002;
  const wave = Math.sin(t) * 12;
  const hintX = ox - 60 + wave;

  ctx.save();
  ctx.globalAlpha = 0.35 + Math.sin(t) * 0.15;
  ctx.strokeStyle = '#4a8aaa'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.setLineDash([5, 5]);
  // Arrow shaft
  ctx.beginPath(); ctx.moveTo(ox - BW() / 2 - 8, oy); ctx.lineTo(hintX, oy); ctx.stroke();
  ctx.setLineDash([]);
  // Arrowhead pointing left
  ctx.fillStyle = '#4a8aaa';
  ctx.beginPath();
  ctx.moveTo(hintX, oy);
  ctx.lineTo(hintX + 10, oy - 6);
  ctx.lineTo(hintX + 10, oy + 6);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

// ─── Main loop ────────────────────────────────────────────────────────────────
let lastT = 0;
function loop(ts) {
  const dt = Math.min((ts - lastT) / 1000, .05); lastT = ts;
  Engine.update(G.eng, dt * 1000);

  if (G.phase === 'flying' && G.brikBody) {
    G.trail.push({ x: G.brikBody.position.x, y: G.brikBody.position.y });
    if (G.trail.length > 30) G.trail.shift();
    const { x, y } = G.brikBody.position;
    if (x > W + 150 || x < -150 || y > H + 150) fail();
    if (G.brikMinY == null || y < G.brikMinY) G.brikMinY = y;
    var vy = G.brikBody.velocity.y;
    var gravY = 2.5;
    var effectiveMinY = G.brikMinY;
    if (vy < 0) {
      var predictedApexY = y - (vy * vy) / (2 * gravY);
      if (predictedApexY < effectiveMinY) effectiveMinY = predictedApexY;
    }
    var contentH = GY() - effectiveMinY + 120;
    var zoomOutScale = Math.min(1, H / contentH);
    var MIN_ZOOM = 0.28;
    if (zoomOutScale < MIN_ZOOM) zoomOutScale = MIN_ZOOM;
    var targetX = W / origW;
    var targetY = H / origH;
    var lerpSpeed = 0.04;
    if (G.brikHitTarget) {
      targetX = W / origW;
      targetY = H / origH;
    } else {
      var s;
      if (vy < -1.2) {
        s = zoomOutScale;
      } else if (vy > 1.2) {
        s = zoomOutScale;
      } else {
        var t = (vy + 1.2) / 2.4;
        t = t * t * (3 - 2 * t);
        s = zoomOutScale + (1 - zoomOutScale) * t;
      }
      targetX = s;
      targetY = s;
    }
    G.camScaleX = G.camScaleX + (targetX - G.camScaleX) * lerpSpeed;
    G.camScaleY = G.camScaleY + (targetY - G.camScaleY) * lerpSpeed;
  } else {
    G.brikMinY = null;
    G.brikHitTarget = false;
    var tx = W / origW;
    var ty = H / origH;
    G.camScaleX = G.camScaleX + (tx - G.camScaleX) * 0.05;
    G.camScaleY = G.camScaleY + (ty - G.camScaleY) * 0.05;
  }

  // Check if any landed brik has fallen off the platform to the ground
  if (G.phase !== 'dead' && G.landedBriks.length > 0) {
    const toppled = G.landedBriks.some(b => b.position.y > GY() - 4);
    if (toppled) fail();
  }

  G.particles = G.particles.filter(p => p.life > 0);
  G.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += .13; p.vx *= .97; p.life -= p.decay; });
  if (G.shake > 0) G.shake -= .5;

  const sx = G.shake > 0 ? (Math.random() - .5) * G.shake : 0;
  const sy = G.shake > 0 ? (Math.random() - .5) * G.shake : 0;
  var camCenterX = (TRAY_X() + PLAT_BASE_X()) / 2;
  var camCenterY = (BRIK_REST_Y() + PLAT_BASE_Y()) / 2;
  ctx.save();
  ctx.scale(origW / W, origH / H);
  ctx.translate(origW / 2 - (camCenterX * origW / W), 0);
  ctx.translate(sx, sy);
  ctx.translate(camCenterX, camCenterY);
  ctx.scale(G.camScaleX, G.camScaleY);
  ctx.translate(-camCenterX, -camCenterY);

  drawBg();
  drawTray();
  drawTrail();
  drawPlatform();
  drawUprightHint();
  drawDragHint();

  // Draw all landed (stacked) briks first, then active brik on top
  G.landedBriks.forEach(b => {
    drawBrik(b.position.x, b.position.y, b.angle, b._skin || SKINS[0]);
  });

  // Active brik
  if (G.phase === 'idle' || !G.brikBody) {
    drawBrik(TRAY_X(), BRIK_REST_Y(), 0, G.skin);
  } else {
    drawBrik(G.brikBody.position.x, G.brikBody.position.y, G.brikBody.angle, G.skin);
  }

  // Particles
  G.particles.forEach(p => {
    ctx.save(); ctx.globalAlpha = p.life;
    ctx.fillStyle = p.col;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  });

  drawAimer();
  ctx.restore();
  requestAnimationFrame(loop);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => { resize(); if (G && G.eng) rebuildGround(); });
resize();

// Wait for all assets, show progress, then start
(function waitForAssets() {
  const loaderEl = document.getElementById('loader');
  const fillEl = document.getElementById('loader-fill');
  const labelEl = document.getElementById('loader-label');

  function checkAsset(asset) {
    if (asset.type === 'image') {
      return asset.obj.complete && asset.obj.naturalWidth > 0;
    }
    if (asset.type === 'audio') {
      // readyState 4 = HAVE_ENOUGH_DATA, 3 = HAVE_FUTURE_DATA — either is fine
      return asset.obj.readyState >= 3;
    }
    return true;
  }

  function tick() {
    if (ASSETS.length === 0) {
      launch();
      return;
    }
    const done = ASSETS.filter(checkAsset).length;
    const total = ASSETS.length;
    const pct = Math.round((done / total) * 100);

    fillEl.style.width = pct + '%';
    labelEl.textContent = done < total
      ? 'LOADING  ' + pct + '%'
      : 'READY';

    if (done >= total) {
      // Small pause so "READY" is visible for a beat
      setTimeout(launch, 300);
    } else {
      setTimeout(tick, 80);
    }
  }

  function launch() {
    loaderEl.classList.add('fade');
    loaderEl.addEventListener('transitionend', () => loaderEl.remove(), { once: true });
    init();
    requestAnimationFrame(loop);
  }

  tick();
})();