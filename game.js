'use strict';
// WITCH'S TREAT（魔女のおもてなし）— ほうきに乗った魔女が、お菓子でハロウィンのおばけたちを満足させていく横スクロールシューティング。
// 320x240 を整数倍に拡大して描く。色は art/witchs-treat.gpl の色だけ（文字も絵）。絵は src/art.js、曲は src/bgm.js

const W = 320, H = 240;
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
cv.width = W; cv.height = H;
const padCv = document.getElementById('pad');
const pctx = padCv.getContext('2d');
const QS = new URLSearchParams(location.search);
// 確かめ用（2026-10-31）: スマホは余白のボタン（INV 無敵、S1〜S4 面の頭から、B1〜B4 ボスの手前から）、PC はキー（I、1〜4、Shift+1〜4）。
// 通常は無敵なし。?debug でボタンとキーを出し、?inv で無敵を付ける（難易度を確かめるときは付けない）。
const DEBUG = QS.has('debug');
let debugInv = QS.has('inv');

// ---- 絵（src/art.js。art/*.pic を PX-13h Pixel で描き、tools/art.mjs が作る）----
const PALHEX = ART.palette;
const COL = ART.names;                              // 色の名前 → 番号（今の名前と、64 色の頃の名前の両方。art/witchs-treat.gpl の alias）
const hex = (c) => PALHEX[typeof c === 'string' ? COL[c] : c];
// 白っぽい色: それぞれの色を白に 6 割寄せた色（満足したおばけの絵に使う）。色の表の縛りは土台の絵の色だけで、特別な状態には表の外の色を使ってよい（ユーザー、2026-10-31）
const LIGHT = PALHEX.map((h) => '#' + [1, 3, 5].map((i) => { const v = parseInt(h.slice(i, i + 2), 16); return Math.round(v + (255 - v) * 0.6).toString(16).padStart(2, '0'); }).join(''));
function makePic(rows, colors) {
  const h = rows.length, w = rows[0].length;
  const mk = (white, light) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const ch = rows[j][i];
      if (ch === '.') continue;
      x.fillStyle = white ? PALHEX[COL.white] : light ? LIGHT[colors[ch]] : PALHEX[colors[ch]];
      x.fillRect(i, j, 1, 1);
    }
    return c;
  };
  return { img: mk(false), flash: mk(true), light: mk(false, true), w, h };
}
const PIC = {};
for (const [ref, file] of Object.entries(ART.pics)) {
  PIC[ref] = { anims: file.anims || {} };
  for (const [name, rows] of Object.entries(file.pics)) PIC[ref][name] = makePic(rows, file.colors);
}
// ボムの絵（ui/bomb の icon 16×16 はボタン、mini 9×9 は左上の数）
const bombPic = (name) => pic('ui/bomb', name);
function pic(ref, name) {
  const p = PIC[ref] && PIC[ref][name];
  if (!p) throw new Error(`絵が無い: ${ref} の ${name}`);
  return p;
}
// 動き（anim の行）の今のコマ。t はフレーム（1/60 秒）
function animPic(ref, anim, t) {
  const a = PIC[ref].anims[anim];
  if (!a) return pic(ref, anim);
  const total = a.ms.reduce((s, v) => s + v, 0);
  let ms = ((t * 1000) / 60) % total;
  for (let i = 0; i < a.frames.length; i++) {
    if (ms < a.ms[i] && PIC[ref][a.frames[i]]) return PIC[ref][a.frames[i]];
    ms -= a.ms[i];
  }
  return pic(ref, a.frames[0]);
}
function draw(p, x, y, flash = false, c = ctx) { c.drawImage(flash === 'light' ? p.light : flash ? p.flash : p.img, Math.round(x - p.w / 2), Math.round(y - p.h / 2)); }
const SKY = (() => {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.drawImage(pic('bg/sky', 'top').img, 0, 0);
  x.drawImage(pic('bg/sky', 'bottom').img, 0, pic('bg/sky', 'top').h);
  return c;
})();
// 文字（ui/font。1 文字 6 点幅）。色ごとに塗り替えた写しを使う
const FONT_ORDER = " 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ:!.-/'?+*";
const fontCache = {};
function fontIn(col) {
  if (!fontCache[col]) {
    const src = pic('ui/font', 'font').img;
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const x = c.getContext('2d');
    x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = hex(col);
    x.fillRect(0, 0, c.width, c.height);
    fontCache[col] = c;
  }
  return fontCache[col];
}
// 文字を書く。align: left・center・right。scale: 拡大（整数）。影は 1 点右下に濃い色
function text(s, x, y, col = 'white', align = 'left', scale = 1, c = ctx, shadow = 'ink') {
  s = String(s).toUpperCase();
  const w = s.length * 6 * scale - scale;
  let x0 = Math.round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x);
  for (const [col2, dx] of shadow ? [[shadow, 1], [col, 0]] : [[col, 0]]) {
    const f = fontIn(col2);
    for (let i = 0; i < s.length; i++) {
      const k = Math.max(0, FONT_ORDER.indexOf(s[i]));
      c.drawImage(f, k * 6, 0, 5, 7, x0 + i * 6 * scale + dx * scale, Math.round(y) + dx * scale, 5 * scale, 7 * scale);
    }
  }
}
function rect(x, y, w, h, col, c = ctx) { c.fillStyle = hex(col); c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }

// ---- 音 ----
let ac = null, master = null, muted = localStorage.getItem('witchs-treat-mute') === '1', noiseBuf = null;
function audio() {
  if (!ac) {
    try {
      ac = new AudioContext();
      master = ac.createGain();
      master.gain.value = muted ? 0 : 0.7;
      master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      decodeBgm();
    } catch (e) { ac = null; }
  }
  if (ac && ac.state === 'suspended') ac.resume();
}
function setMute(v) {
  muted = v;
  localStorage.setItem('witchs-treat-mute', v ? '1' : '0');
  if (master) master.gain.value = v ? 0 : 0.7;
}
function tone(freq, dur, type = 'square', vol = 0.05, slide = 1, delay = 0) {
  if (!ac) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}
function noise(dur, vol = 0.15, freq = 1800) {
  if (!ac) return;
  const t = ac.currentTime;
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf;
  f.type = 'lowpass';
  f.frequency.setValueAtTime(freq, t);
  f.frequency.exponentialRampToValueAtTime(80, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t);
  s.stop(t + dur);
}
let lastShotSe = 0;
const SE = {
  throw: () => { if (tick - lastShotSe < 6) return; lastShotSe = tick; tone(1600, 0.04, 'triangle', 0.035, 1.6); },
  munch: () => { tone(260, 0.05, 'square', 0.03, 0.7); tone(200, 0.05, 'square', 0.03, 0.7, 0.06); },
  treat: () => [784, 988, 1319].forEach((f, i) => tone(f, 0.09, 'square', 0.04, 1, i * 0.05)),
  bigtreat: () => [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.14, 'square', 0.05, 1, i * 0.08)),
  trick: () => { tone(600, 0.5, 'sawtooth', 0.07, 0.25); tone(900, 0.3, 'square', 0.03, 0.4, 0.05); noise(0.3, 0.12, 2400); },
  power: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.08, 'triangle', 0.07, 1, i * 0.06)),
  extend: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.12, 'triangle', 0.08, 1, i * 0.09)),
  king: () => [0, 0.45, 0.9].forEach((d) => tone(150, 0.4, 'sawtooth', 0.07, 0.8, d)),
  start: () => [392, 523, 659, 784].forEach((f, i) => tone(f, 0.1, 'square', 0.05, 1, i * 0.07)),
  sweet: () => [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 0.08, 'triangle', 0.06, 1, i * 0.04)),
  friend: () => [659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.1, 'square', 0.04, 1, 0.25 + i * 0.06)),
  levelup: () => [784, 1047, 1319].forEach((f, i) => tone(f, 0.09, 'square', 0.04, 1, 0.2 + i * 0.05)),
  bomb: () => { [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 0.18, 'triangle', 0.07, 1, i * 0.05)); noise(1.2, 0.12, 6000); },
};

// ---- BGM（src/bgm.js。music/*.song を PX-13h Music で作り、tools/audio.mjs が ogg にする）----
const bgmBufs = {};
let bgmGain = null, bgmSrc = null, bgmName = null, bgmWant = null;
function decodeBgm() {
  bgmGain = ac.createGain();
  bgmGain.connect(master);
  for (const [name, d] of Object.entries(window.BGM || {})) {
    const bin = Uint8Array.from(atob(d.data), (c) => c.charCodeAt(0));
    ac.decodeAudioData(bin.buffer).then((buf) => {
      bgmBufs[name] = { buf, loop: d.loop };
      if (bgmWant === name && bgmName !== name) bgm(name);
    }).catch(() => {});
  }
}
function bgm(name) {
  bgmWant = name;
  if (bgmName === name && bgmSrc) return;
  if (bgmSrc) { try { bgmSrc.stop(); } catch (e) { } bgmSrc = null; }
  bgmName = null;
  if (!name || !ac || !bgmBufs[name]) return;
  bgmGain.gain.cancelScheduledValues(ac.currentTime);
  bgmGain.gain.setValueAtTime(0.9, ac.currentTime);
  bgmSrc = ac.createBufferSource();
  bgmSrc.buffer = bgmBufs[name].buf;
  bgmSrc.loop = bgmBufs[name].loop;
  bgmSrc.connect(bgmGain);
  bgmSrc.start();
  bgmName = name;
}
function bgmFade(sec) {
  bgmWant = null;
  if (!bgmSrc) return;
  const t = ac.currentTime;
  bgmGain.gain.setValueAtTime(bgmGain.gain.value, t);
  bgmGain.gain.linearRampToValueAtTime(0, t + sec);
  bgmSrc.stop(t + sec + 0.05);
  bgmSrc = null; bgmName = null;
}

// ---- 画面の大きさとスマホの余白（gunzo・moonblade と同じ形）----
// 指で触る端末で、ゲームの画面の外に 100 CSS ピクセル以上の余白があれば、そこを操作の場所にする（pad）。
// 縦持ち: ゲームを上に寄せ、下の余白が移動のスティック、右上にボム、左上にポーズ。横持ち: 左右の帯で移動する。
// ポーズとボムのボタンは gunzo の余白のボタンと同じ大きさ（見た目で 46 CSS ピクセルほど）
const coarse = matchMedia('(pointer: coarse)').matches;
let scale = 1, pad = null, touchMode = coarse;
function layout() {
  const iw = innerWidth, ih = innerHeight;
  scale = Math.max(1, Math.floor(Math.min(iw / W, ih / H)));
  if (Math.min(iw / W, ih / H) < 1) scale = Math.min(iw / W, ih / H);
  const gw = W * scale, gh = H * scale;
  pad = null;
  let gx = (iw - gw) / 2, gy = (ih - gh) / 2;
  if (coarse) {
    if (ih - gh >= 100) { gy = 0; pad = { mode: 'bottom' }; }
    else if ((iw - gw) / 2 >= 100) pad = { mode: 'side' };
  }
  cv.style.width = gw + 'px'; cv.style.height = gh + 'px';
  cv.style.left = Math.round(gx) + 'px'; cv.style.top = Math.round(gy) + 'px';
  if (pad) {
    // 余白の絵: 窓いっぱい（ゲームの画面と同じ倍率、同じ色の表）
    const pw = Math.ceil(iw / scale), ph = Math.ceil(ih / scale);
    Object.assign(pad, { pw, ph, ox: gx / scale, oy: gy / scale });
    padCv.width = pw; padCv.height = ph;
    padCv.style.width = pw * scale + 'px'; padCv.style.height = ph * scale + 'px';
    padCv.hidden = false;
    const nav = Math.max(22, Math.min(40, Math.round(46 / scale)));
    if (pad.mode === 'bottom') {
      // スティックは帯のまん中（帯のどこを触っても、そこが中心）。ボムはポーズと左右対称に、帯の右上の隅
      const top = H, cy = Math.round(Math.min(ph - 46 - (DEBUG ? 26 : 0), top + Math.max(nav + 60, (ph - top) * 0.55)));
      Object.assign(pad, { stick: { x: Math.round(pw / 2), y: cy }, pause: { x: 6, y: top + 6, w: nav, h: nav },
        bomb: { x: pw - 6 - nav, y: top + 6, w: nav, h: nav }, stickArea: (x, y) => y > top + nav + 8 });
    } else {
      const band = Math.floor(pad.ox), cy = Math.round(ph * 0.62), ns = Math.min(nav, band - 12);
      Object.assign(pad, { stick: { x: Math.round(band / 2), y: cy }, pause: { x: 6, y: 6, w: ns, h: ns },
        bomb: { x: pw - 6 - ns, y: 6, w: ns, h: ns }, stickArea: (x, y) => (x < band || x > pw - band) && y > ns + 12 });   // スティックはどちらの帯でも。ボムは右の帯の上の隅（ポーズと左右対称）
    }
    if (DEBUG) {                                    // 確かめ用のボタン: 縦持ちは帯の下の端に 1 列、横持ちは右の帯に 2 列
      const names = ['INV', 'S1', 'S2', 'S3', 'S4', 'B1', 'B2', 'B3', 'B4'];
      const area = pad.mode === 'bottom' ? { x: 6, y: pad.ph - 24, w: pad.pw - 12, cols: 9 } : { x: pad.pw - Math.floor(pad.ox) + 6, y: Math.round(pad.ph * 0.45), w: Math.floor(pad.ox) - 12, cols: 2 };
      const bw = Math.floor((area.w - (area.cols - 1) * 3) / area.cols), bh = 18;
      pad.debug = names.map((n, i) => ({ n, x: area.x + (i % area.cols) * (bw + 3), y: area.y + Math.floor(i / area.cols) * (bh + 3), w: bw, h: bh }));
    }
  } else padCv.hidden = true;
}
addEventListener('resize', layout);
visualViewport?.addEventListener('resize', layout);
layout();

// ---- 入力 ----
const keys = {}, pressed = {};
addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (!keys[e.code]) pressed[e.code] = true;
  keys[e.code] = true;
  audio();
  touchMode = false;
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; ptrs.clear(); if (mode === 'play') pauseGame(); });
// 指: スティック（触った所が中心。遠くまで引くと中心がついてくる）、ボム、ポーズ。余白が無い端末は、ゲームの画面をなぞって動かす
const ptrs = new Map();
const STICK_REACH = 15;                             // ここまで指を動かすと最高速（22 → 15。スマホで少しもたついたので、2026-10-31）
const inBox = (p, b, m = 4) => p.x >= b.x - m && p.x <= b.x + b.w + m && p.y >= b.y - m && p.y <= b.y + b.h + m;
const BOMB_BTN = { x: W - 44, y: 2, w: 18, h: 16 }, PAUSE_BTN = { x: W - 22, y: 2, w: 18, h: 16 };
function toPad(e) { return { x: e.clientX / scale, y: e.clientY / scale }; }
function toGame(e) { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height }; }
function pointerDown(e, onPad) {
  e.preventDefault();
  audio();
  if (e.pointerType !== 'mouse') touchMode = true;
  if (onPad && pad && pad.debug) {                   // 確かめ用のボタン（タイトルでも、遊んでいる途中でも）
    const p = toPad(e), b = pad.debug.find((b) => inBox(p, b, 1));
    if (b) {
      if (b.n === 'INV') { debugInv = !debugInv; if (G) popText(debugInv ? 'INV ON' : 'INV OFF', W / 2, 60, 'gy5', false, 60); }
      else debugJump(+b.n[1] - 1, b.n[0] === 'B');
      return;
    }
  }
  if (mode === 'title') {
    if (!onPad) {
      const p = toGame(e), i = DIFFICULTY_BUTTONS.findIndex((b) => inBox(p, b, 0));
      if (i >= 0) { selectDifficulty(DIFFICULTY_ORDER[i]); startGame(); }
    }
    return;
  }
  if (mode !== 'play' || (G && (G.over || G.ending))) { pressed.Enter = true; return; }   // コンティニュー・終わりの画面はタップで進む
  if (onPad && pad) {
    const p = toPad(e);
    if (inBox(p, pad.pause)) { pauseGame(); return; }
    if (inBox(p, pad.bomb)) { pressed.KeyZ = true; return; }
    if (pad.stickArea(p.x, p.y)) ptrs.set(e.pointerId, { kind: 'stick', ax: p.x, ay: p.y, x: p.x, y: p.y });
    else return;
  } else {
    const p = toGame(e);
    if (touchMode && inBox(p, PAUSE_BTN, 2)) { pauseGame(); return; }
    if (touchMode && inBox(p, BOMB_BTN, 2)) { pressed.KeyZ = true; return; }
    ptrs.set(e.pointerId, { kind: 'drag', x: p.x, y: p.y, mouse: e.pointerType === 'mouse' });
  }
  try { (onPad ? padCv : cv).setPointerCapture(e.pointerId); } catch (err) { }
}
function pointerMove(e, onPad) {
  const t = ptrs.get(e.pointerId);
  if (!t) return;
  if (t.kind === 'stick') {
    const p = toPad(e);
    t.x = p.x; t.y = p.y;
    const dx = t.x - t.ax, dy = t.y - t.ay, d = Math.hypot(dx, dy);
    if (d > STICK_REACH) { t.ax += (dx / d) * (d - STICK_REACH); t.ay += (dy / d) * (d - STICK_REACH); }
  } else if (t.kind === 'drag' && !onPad) {
    const p = toGame(e);
    t.mx = (t.mx || 0) + p.x - t.x; t.my = (t.my || 0) + p.y - t.y;   // なぞった分だけ魔女が動く
    t.x = p.x; t.y = p.y;
  }
}
const pointerUp = (e) => ptrs.delete(e.pointerId);
cv.addEventListener('pointerdown', (e) => pointerDown(e, false));
cv.addEventListener('pointermove', (e) => pointerMove(e, false));
padCv.addEventListener('pointerdown', (e) => pointerDown(e, true));
padCv.addEventListener('pointermove', (e) => pointerMove(e, true));
for (const el of [cv, padCv]) for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, pointerUp);
for (const el of [cv, padCv]) el.addEventListener('contextmenu', (e) => e.preventDefault());
// 今の入力: 動く向き（-1〜1）。お菓子はいつも自動で投げる（さわって仲間にするので、投げるのを止める必要がない。2026-10-31 にボタンをやめた）
function input() {
  let mx = 0, my = 0, fire = true, slow = false;
  if (keys.ArrowLeft || keys.KeyA) mx -= 1;
  if (keys.ArrowRight || keys.KeyD) mx += 1;
  if (keys.ArrowUp || keys.KeyW) my -= 1;
  if (keys.ArrowDown || keys.KeyS) my += 1;
  let dragX = 0, dragY = 0;
  for (const t of ptrs.values()) {
    if (t.kind === 'stick') {
      const dx = t.x - t.ax, dy = t.y - t.ay;
      mx = Math.max(-1, Math.min(1, dx / STICK_REACH)); my = Math.max(-1, Math.min(1, dy / STICK_REACH));
      if (Math.abs(mx) < 0.15) mx = 0;
      if (Math.abs(my) < 0.15) my = 0;
    }
    else if (t.kind === 'drag') { dragX += t.mx || 0; dragY += t.my || 0; t.mx = t.my = 0; }   // なぞる・マウスで動かす
  }
  return { mx, my, fire, dragX, dragY, slow };
}

// ---- ゲームの中身 ----
const EXTEND_FIRST = 20000, EXTEND_EVERY = 50000, LIVES_MAX = 5;
// 面の長さと魔女のお菓子は共通。敵の数・速さ、予告と隙、捕まえやすさ・立て直しで難しさを変える。
const DIFFICULTIES = {
  easy: { name: 'EASY', density: 0.75, waveGap: 1.2, speed: 0.8, bossHp: 0.75, bossSpeed: 0.85, rest: 1.3, warning: 80, lives: 5, bombs: 3, refill: 3, charge: 10, bombPower: 0.2, catchR: 18, inv: 210, keepFriends: true },
  normal: { name: 'NORMAL', density: 1, waveGap: 1, speed: 1, bossHp: 1, bossSpeed: 1, rest: 1, warning: 60, lives: 3, bombs: 2, refill: 2, charge: 12, bombPower: 0.16, catchR: 15, inv: 150, keepFriends: false },
  hard: { name: 'HARD', density: 1.6, waveGap: 0.68, speed: 1.32, bossHp: 1.2, bossSpeed: 1.3, rest: 0.58, warning: 36, lives: 3, bombs: 2, refill: 1, charge: 18, bombPower: 0.12, catchR: 13, inv: 90, keepFriends: false },
};
const DIFFICULTY_ORDER = Object.keys(DIFFICULTIES);
const DIFFICULTY_BUTTONS = DIFFICULTY_ORDER.map((_, i) => ({ x: 29 + i * 89, y: 141, w: 84, h: 24 }));
const savedDifficulty = QS.get('difficulty') || localStorage.getItem('witchs-treat-difficulty');
let difficulty = DIFFICULTY_ORDER.includes(savedDifficulty) ? savedDifficulty : 'normal';
const rules = () => DIFFICULTIES[G ? G.difficulty : difficulty];
const highScore = (d) => +(localStorage.getItem(`witchs-treat-hi-${d}`) || 0);
function selectDifficulty(d) {
  difficulty = d; hi = highScore(d);
  localStorage.setItem('witchs-treat-difficulty', d);
}
const LV_NEED = (lv) => lv;                        // 仲間のレベルを lv → lv+1 に上げるのに要る、同じ種類を捕まえる数（レベルはおまけ。上げると楽になる）
const FRIEND_MAX_LV = 5;                            // 仲間のレベルの上限（種類ごとに 1 人）
const BOMB_MAX = 5;
let mode = 'title', tick = 0, modeT = 0, hi = highScore(difficulty);
let G = null;                                       // 遊んでいる間の状態
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function startGame() {
  audio(); mode = 'play'; modeT = 0; ptrs.clear();
  for (const k in pressed) pressed[k] = false;       // 決定の Z を、開始直後のボムにしない
  newGame(); SE.start();
}

function newGame(jump = null) {                     // jump: 確かめ用の飛び先 { stage: 0〜3, boss }。無ければ URL（?stage=2・?boss）
  const d = DIFFICULTIES[difficulty];
  G = {
    difficulty, practice: DEBUG || debugInv || ['stage', 'boss', 'friends', 'inv'].some((k) => QS.has(k)) || !!jump,
    stage: 0, t: 0, scroll: 0, score: 0, lives: d.lives, nextExtend: EXTEND_FIRST, treats: 0, catches: 0, continues: 0,
    w: { x: 60, y: 110, inv: 120, hitT: 0, fireCd: 0 },
    trail: [], friends: [], bombs: d.bombs, bombCharge: 0, rain: 0,
    candies: [], enemies: [], fx: [], texts: [], boss: null,
    over: 0, clear: 0, ending: 0, bossIntro: 0, spawnI: 0,
  };
  if (QS.has('friends')) for (const k of Object.keys(EDEF)) G.friends.push({ kind: k, lv: Math.max(1, Math.min(FRIEND_MAX_LV, +QS.get('friends') || 1)), exp: 0, cd: 0, x: 0, y: 0, t: 0, heal: VAMP_HEAL(1) });   // 確かめ用: 全員が仲間
  G.jumpBoss = jump ? jump.boss : QS.has('boss');
  startStage(jump ? jump.stage : Math.max(0, Math.min(STAGES.length - 1, (+QS.get('stage') || 1) - 1)));   // 確かめ用: ?stage=2 で 2 面から
}
// 面を始める（初めから・次の面・コンティニュー）。仲間・点・残り・ボムは持ち越す
function startStage(si) {
  const g = G;
  Object.assign(g, { stage: si, t: 0, scroll: 0, spawnI: 0, boss: null, clear: 0, bossIntro: 0, rain: 0 });
  g.candies = []; g.enemies = []; g.texts = [];
  Object.assign(g.w, { x: 60, y: 110, inv: 120, hitT: 0 });
  if (g.jumpBoss) { g.t = g.scroll = STAGES[si].len - 60; const waves = stageWaveList(si), i = waves.findIndex((w) => w[0] > g.t); g.spawnI = i < 0 ? waves.length : i; }   // 確かめ用: ボスの手前から
  bgm(STAGES[si].bgm);
}

// おばけ 12 種類。hp はお菓子をいくつで満足するか、score は満足させたときの点、r は当たりの大きさ
const EDEF = {
  ghost: { ref: 'enemies/ghost', hp: 2, score: 100, r: 6 },
  bat: { ref: 'enemies/bat', hp: 1, score: 80, r: 5 },
  pumpkin: { ref: 'enemies/pumpkin', hp: 3, score: 150, r: 6 },
  cat: { ref: 'enemies/cat', hp: 2, score: 150, r: 6 },
  crow: { ref: 'enemies/crow', hp: 1, score: 100, r: 5 },
  skull: { ref: 'enemies/skull', hp: 4, score: 200, r: 6 },
  wisp: { ref: 'enemies/wisp', hp: 2, score: 150, r: 5 },
  spider: { ref: 'enemies/spider', hp: 3, score: 200, r: 6 },
  mummy: { ref: 'enemies/mummy', hp: 4, score: 250, r: 7 },
  candle: { ref: 'enemies/candle', hp: 3, score: 200, r: 6 },
  vampire: { ref: 'enemies/vampire', hp: 4, score: 400, r: 6 },
  bigghost: { ref: 'enemies/bigghost', hp: 28, score: 1000, r: 10 },
};
function spawn(kind, x, y, o = {}) {
  const e = { kind, x, y, y0: y, t: 0, hp: EDEF[kind].hp, maxHp: EDEF[kind].hp, state: 'move', flash: 0, eatT: 0, slow: 0, ...o };
  G.enemies.push(e);
  return e;
}
function aimAt(x, y, speed) { const dx = G.w.x - x, dy = G.w.y - y, d = Math.hypot(dx, dy) || 1; return [(dx / d) * speed, (dy / d) * speed]; }

// ---- 面 ----
// 4 つの面。len: ボスが出るまでのフレーム。scene: 中と手前の景色（bg/mid・bg/near の絵の名前）。bgm: 道中の曲。boss: ボスの種類
const STAGES = [
  { name: 'STAGE 1', sub: 'HALLOWEEN TOWN', scene: 'town', bgm: 'stage', boss: 'king', len: 3600 },
  { name: 'STAGE 2', sub: 'GRAVEYARD', scene: 'grave', bgm: 'grave', boss: 'queen', len: 3900 },
  { name: 'STAGE 3', sub: 'HAUNTED MANSION', scene: 'mansion', bgm: 'mansion', boss: 'count', len: 4200 },
  { name: 'FINAL STAGE', sub: 'MOONLIT SKY', scene: 'sky', bgm: 'sky', boss: 'moon', len: 3000 },
];
// 場所ごとのザコ（群れと合間に出る子・ボスが呼ぶ子）
const LOCAL = { town: ['ghost', 'bat', 'pumpkin', 'cat', 'crow'], grave: ['skull', 'wisp', 'spider', 'crow', 'bat'], mansion: ['mummy', 'candle', 'vampire', 'ghost', 'bat'],
  sky: ['ghost', 'bat', 'pumpkin', 'cat', 'crow', 'skull', 'wisp', 'mummy', 'candle', 'vampire'] };
// 面の群れを作る（決まった乱数で、毎回同じ流れ）。中ほどに中ボス（大きなゴースト）
function stageWaves(si, difficulty) {
  const st = STAGES[si], kinds = LOCAL[st.scene], out = [], d = DIFFICULTIES[difficulty];
  let sd = 1234 + si * 977;
  const r = () => ((sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const pk = (a) => a[Math.floor(r() * a.length)];
  const wave = (at, fn) => out.push([at, fn]);
  const row = (at, n, gap, fn) => { n = Math.max(2, Math.round(n * 1.25 * d.density)); for (let i = 0; i < n; i++) wave(at + Math.round(i * gap), () => fn(i)); };
  const PAT = {
    ghost: (at) => { const y = 40 + r() * 150; row(at, 5, 22, () => spawn('ghost', W + 10, y, { amp: 14 })); },
    bat: (at) => { const y = 50 + r() * 130; row(at, 6, 14, (i) => spawn('bat', W + 10, y, { amp: 26, phase: i * 0.4 })); },
    pumpkin: (at) => { wave(at, () => spawn('pumpkin', W + 10, 160)); wave(at + 50, () => spawn('pumpkin', W + 10, 185)); },
    cat: (at) => { const n = 2 + Math.floor(r() * 2); for (let i = 0; i < n; i++) { const y = 40 + r() * 150; wave(at + i * 40, () => spawn('cat', W + 10, y)); } },
    crow: (at) => { const y = 20 + r() * 120; row(at, 5, 10, (i) => spawn('crow', W + 10 + Math.abs(i - 2) * 12, y + i * 10)); },
    skull: (at) => { const n = 2 + Math.floor(r() * 2); for (let i = 0; i < n; i++) wave(at + i * 20, () => spawn('skull', W + 10, 40 + i * 60)); },
    wisp: (at) => row(at, 3, 40, (i) => spawn('wisp', W + 10, 40 + i * 50)),
    spider: (at) => { const x1 = 180 + r() * 40, x2 = 250 + r() * 40; wave(at, () => spawn('spider', x1, -10)); wave(at + 40, () => spawn('spider', x2, -10)); },
    mummy: (at) => { wave(at, () => spawn('mummy', W + 10, 70)); wave(at + 30, () => spawn('mummy', W + 10, 160)); },
    candle: (at) => row(at, 3, 30, (i) => spawn('candle', W + 10, 28 + (i % 2) * 14)),
    vampire: (at) => { const y = 60 + r() * 120; wave(at, () => spawn('vampire', 240, y)); },
  };
  const mid = Math.round(st.len / 2);
  if (st.scene !== 'sky') { const y = 80 + r() * 80; wave(mid, () => spawn('bigghost', W + 16, y)); }
  for (let t = 150; t < st.len - 240; t += Math.round((si === 0 ? 300 : st.scene === 'sky' ? 225 : 270) * d.waveGap)) {
    if (st.scene !== 'sky' && Math.abs(t - mid) < 240) continue;   // 中ボスの前後は群れを休む
    // 1 面の最初はゆっくり来る子から。捕まえて仲間を作る時間を取る。
    PAT[si === 0 && t < 600 ? 'ghost' : pk(kinds)](t);
  }
  for (let t = 600; t < st.len - 180; t += Math.round((si === 0 ? 150 : 120) * d.waveGap)) {
    if (st.scene !== 'sky' && Math.abs(t - mid) < 180) continue;
    const k = pk(kinds.filter((k) => k !== 'vampire' && k !== 'spider')), y = 30 + r() * 160, amp = 6 + r() * 14, phase = r() * 6;
    wave(t, () => spawn(k, W + 10, y, { amp, phase }));
  }
  return out.sort((a, b) => a[0] - b[0]);
}
const WAVES_BY_DIFFICULTY = Object.fromEntries(DIFFICULTY_ORDER.map((d) => [d, STAGES.map((_, i) => stageWaves(i, d))]));
const stageWaveList = (si) => WAVES_BY_DIFFICULTY[G.difficulty][si];
const sceneNow = () => (G ? STAGES[G.stage].scene : 'town');

// 魔女のお菓子: 大きなペロペロキャンディ 1 種類を 1 つずつまっすぐ（仲間のいろいろなお菓子と見分けられるように。強さは仲間で上がる）
const CANDY_KINDS = ['pink', 'blue', 'yellow', 'choco'];
const CANDY_SPEED = 0.45;                           // お菓子の速さの倍率（速すぎて見えなかったので、2026-10-31 に遅く）
const FRIEND_RATE = 2.5;                            // 仲間の投げる間隔の倍率（多すぎたので広げた。1.6 → 2.5。2026-10-31）
function candy(x, y, vx, vy, kind, o = {}) {
  const k = CANDY_SPEED;
  if (o.grav) o.grav *= k * k;                       // 山なりは、同じ形のまま遅く
  if (o.life) o.life = Math.round(o.life / k);       // 届く距離は同じまま
  G.candies.push({ x, y, vx: vx * k, vy: vy * k, kind, dmg: 1, t: 0, ...o });
}
function fireCandies() {
  const w = G.w;
  candy(w.x + 12, w.y + 1, 5, 0, 'pop', { dmg: 2 });   // 1 つだけ（2 つだと分かりにくかった。2026-10-31）。そのぶん 2 個分の満腹
  SE.throw();
}

// ---- 仲間（手渡しで満足させたおばけ。種類ごとに 1 人、レベル 1〜5）----
// 魔女の通った跡（trail）を、少しずつ遅れてついてくる。それぞれ自分のやり方でお菓子を投げる。cd は次に投げるまで
function nearestEnemy(x, y, maxD = 999) {
  let best = null, bd = maxD;
  for (const e of G.enemies) { if (e.state !== 'move') continue; const d = Math.hypot(e.x - x, e.y - y); if (d < bd) { bd = d; best = e; } }
  if (G.boss && G.boss.state === 'fight') { const d = Math.hypot(G.boss.x - x, G.boss.y - y); if (d < bd) best = G.boss; }
  return best;
}
// 種類ごとの投げ方。every: 間隔（フレーム。レベルで縮む）、fire(f, lv)
const FRIEND = {
  // どの子も 1 回に 1 つだけ投げる（たくさん出ると分かりにくい。2026-10-31）。レベルは間隔と 1 つの効き目で
  ghost: { every: (l) => 20 - l * 2, fire: (f, l) => candy(f.x + 6, f.y, 5, 0, 'marshmallow', { dmg: 1 + Math.floor(l / 3), wave: 14 }) },   // 波のようにゆらゆら
  bat: { every: (l) => 13 - l, fire: (f) => { f.flip = !f.flip; candy(f.x + (f.flip ? -6 : 6), f.y, f.flip ? -5 : 5, 0, 'gummy'); } },   // 前とうしろへ交互（うしろも守る）
  pumpkin: { aimed: true, every: (l) => 32 - l * 3, fire: (f, l) => candy(f.x + 4, f.y, 3, -2.6, 'cupcake', { grav: 0.12, dmg: 2 + Math.floor(l / 3), bounce: 1 }) },   // 山なりで、地面で 1 回跳ねる
  cat: { aimed: true, every: (l) => 34 - l * 3, fire: (f, l) => candy(f.x + 14, f.y, 3, 0, 'claw', { life: 8, dmg: 2 + Math.floor(l / 2), big: 14, pierce: 9 }) },
  crow: { aimed: true, every: (l) => 16 - l * 2, fire: (f, l) => candy(f.x + 4, f.y, 4.6, (f.side || 1) * 1.6, 'icecream', { dmg: 1 + Math.floor(l / 3) }) },   // 上の翼なら斜め上、下の翼なら斜め下へ
  skull: { aimed: true, every: (l) => 30 - l * 3, fire: (f, l) => { const e = nearestEnemy(f.x, f.y, 260); if (!e) return; const dx = e.x - f.x, dy = e.y - f.y, d = Math.hypot(dx, dy) || 1; candy(f.x, f.y, (dx / d) * 5, (dy / d) * 5, 'cookie', { dmg: 1 + Math.floor(l / 3) }); } },
  wisp: { aimed: true, every: (l) => 30 - l * 3, fire: (f, l) => candy(f.x + 4, f.y, 3, rnd(-1, 1), 'jellybean', { home: true, life: 120, dmg: 1 + Math.floor(l / 3) }) },   // ペロペロキャンディは魔女だけ
  spider: { every: (l) => 40 - l * 4, fire: (f, l) => candy(f.x + 4, f.y, 3.5, 0, 'web', { slow: 60 + l * 20, grow: true, pierce: 4 }) },   // 進むほど網が広がる（当たった子が遅くなる）
  mummy: { every: (l) => 44 - l * 4, fire: (f, l) => candy(f.x + 8, f.y, 5, 0, 'bandage', { pierce: 4 + l, dmg: 2, boomerang: true, life: 200 }) },   // ブーメランのように行って戻る（行きも帰りも突き抜ける）
  candle: { aimed: true, every: (l) => 24 - l * 3, fire: (f, l) => candy(f.x, f.y + 4, 0.6, 1, 'caramel', { dmg: 2, grav: 0.15, roll: true, life: 260 }) },   // 下へ落ちて、地面で転がる
  vampire: { aimed: true, every: (l) => 90, fire: (f, l) => { if (G.candies.some((c) => c.orbit)) return; for (let i = 0; i < 2 + Math.floor(l / 2); i++) candy(G.w.x, G.w.y, 0, 0, 'macaron', { dmg: 1, orbit: (i / (2 + Math.floor(l / 2))) * 6.283, life: 240, pierce: 99 }); } },   // 魔女のまわりを回る（体当たりしてくる子に当たる）
  bigghost: { aimed: true, every: (l) => 120 - l * 12, fire: (f, l) => { for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; candy(f.x, f.y, Math.cos(a) * 3.5, Math.sin(a) * 3.5, 'choco', { life: 70, dmg: 1 + Math.floor(l / 2) }); } } },   // 8 方向に広がる（ただ一つ、1 回に 8 つ）
};
const VAMP_HEAL = (l) => 4800 - l * 300;           // 吸血鬼の子: 55〜75 秒ごとに残りを 1 つ戻す（いっぱいなら 2000 点）
// 捕まえた: まだいない種類なら新しい仲間。いる種類ならレベル上げの分がたまる（LV_NEED 人でレベルが 1 つ上がる）
function addFriend(e) {
  const f = G.friends.find((x) => x.kind === e.kind && !x.leaving);
  G.catches++;
  addScore(EDEF[e.kind].score);
  if (++G.bombCharge >= rules().charge) { G.bombCharge = 0; if (G.bombs < BOMB_MAX) { G.bombs++; popText('BOMB +1', G.w.x, G.w.y + 18, 'ye3', false, 60); } }
  if (!f) { G.friends.push({ kind: e.kind, lv: 1, exp: 0, cd: 20, x: e.x, y: e.y, t: 0, heal: VAMP_HEAL(1) }); popText('NEW FRIEND!', e.x, e.y - 14, 'gr4', false, 70); SE.friend(); return; }
  if (f.lv >= FRIEND_MAX_LV) { addScore(1000); popText('+1000', e.x, e.y - 14, 'ye3', false, 50); SE.sweet(); return; }
  if (++f.exp >= LV_NEED(f.lv)) { f.exp = 0; f.lv++; f.up = 40; popText(`LV ${f.lv}!`, f.x, f.y - 14, 'gr4', false, 60); SE.levelup(); }
  else { popText('FRIEND!', e.x, e.y - 14, 'pk2', false, 40); SE.sweet(); }
}
function updateFriends() {
  const g = G, w = g.w;
  g.trail.unshift([w.x, w.y]);
  if (g.trail.length > 200) g.trail.length = 200;
  g.friends.forEach((f, i) => {
    f.t++;
    if (f.up > 0) f.up--;
    if (f.leaving) { f.y -= 1; f.x -= 0.4; return; }
    // 魔女の跡を少し遅れてついてくる。並びは魔女のうしろの V 字（止まっていても魔女に重ならない）
    const p = g.trail[Math.min(g.trail.length - 1, 6 + Math.floor(i / 2) * 6)] || [w.x, w.y];
    const col = Math.floor(i / 2), side = i % 2 ? 1 : -1;
    f.side = side; f.col = col;                     // 上の翼（-1）か下の翼（1）か、魔女から何列目か（お菓子の向きに使う）
    f.x += (p[0] - 16 - col * 12 - f.x) * 0.25; f.y += (p[1] + side * (16 + col * 9) - f.y) * 0.25;   // うしろへ行くほど上下に大きく開く（翼のように）
    if (g.over || g.clear) return;
    if (f.cd > 0) f.cd--;
    if (g.firing && f.cd <= 0) {
      const n0 = g.candies.length;
      FRIEND[f.kind].fire(f, f.lv);
      // 上の翼の子は斜め上、下の翼の子は斜め下へ（外側ほど開く）。向きの決まっているお菓子（狙う・追う・回る・山なり・転がる・8 方向）はそのまま
      if (!FRIEND[f.kind].aimed) for (const c of g.candies.slice(n0)) { const v = Math.abs(c.vx); c.vy += f.side * v * (0.12 + f.col * 0.07); }
      f.cd = Math.max(6, Math.round(FRIEND[f.kind].every(f.lv) * FRIEND_RATE));
    }   // 魔女と一緒に自動で投げる
    if (f.kind === 'vampire' && --f.heal <= 0) {
      f.heal = VAMP_HEAL(f.lv);
      if (g.lives < LIVES_MAX) { g.lives++; popText('HEAL!', w.x, w.y - 20, 'rd3', false, 60); SE.extend(); } else { addScore(2000); popText('+2000', f.x, f.y - 14, 'rd3', false, 50); }
    }
  });
  g.friends = g.friends.filter((f) => !(f.leaving && f.y < -30));
}

function popText(s, x, y, col, big = false, life = 50) {
  if (G.texts.length > 9) G.texts.shift();
  G.texts.push({ s, x: Math.max(30, Math.min(W - 30, x)), y, col, big, t: 0, life });
}
function addScore(n) {
  G.score += n;
  while (G.score >= G.nextExtend) {
    G.nextExtend += EXTEND_EVERY;
    if (G.lives < LIVES_MAX) { G.lives++; popText('1UP!', G.w.x, G.w.y - 20, 'gr4', true, 80); SE.extend(); }
    else { G.score += 5000; popText('BONUS 5000', G.w.x, G.w.y - 20, 'ye3', false, 80); }
  }
}
// 満足させた: 食べてから、上っていく（さわると仲間になる。ボムで満足させた子も捕まえられる）
function satisfy(e) {
  e.state = 'eat'; e.eatT = 22;
  G.treats++;
  const d = EDEF[e.kind];
  addScore(d.score);
  popText('TREAT!', e.x, e.y - 14, e.kind === 'bigghost' ? 'ye3' : pick(['ye3', 'gr4', 'cy3', 'or4']), e.kind === 'bigghost'); if (e.kind === 'bigghost') SE.bigtreat(); else SE.treat();
  for (let i = 0; i < 3; i++) G.fx.push({ kind: 'heart', x: e.x + rnd(-6, 6), y: e.y - 4, vx: rnd(-0.4, 0.4), vy: rnd(-1.2, -0.5), t: 0, life: 50 });
}
// お菓子が当たった: 少し満たされる。いっぱいになったら満足する
function feed(e, c) {
  e.hp -= c.dmg;
  e.flash = 4; e.eatT = 8;
  if (c.slow) e.slow = Math.max(e.slow, c.slow);
  if (e.hp > 0) { if (G.t % 3 === 0) SE.munch(); return; }
  satisfy(e);
}
// いたずらされた（TRICK!）: 残りが 1 つ減り、仲間は全員レベルが 1 つ下がる（レベル 1 の子はびっくりして帰る）
function trick() {
  const w = G.w;
  if (w.inv > 0 || G.over || G.clear || G.ending || G.rain > 0) return;
  if (QS.has('inv') || debugInv) { w.inv = 30; return; }
  G.lives--;
  w.hitT = 50; w.inv = rules().inv;
  popText('TRICK!', w.x, w.y - 18, 'pu5', true, 70);
  SE.trick();
  for (const f of G.friends) { if (f.leaving) continue; f.exp = 0; if (--f.lv <= 0) { if (rules().keepFriends) f.lv = 1; else f.leaving = true; } }
  if (G.bombs < rules().refill) G.bombs = rules().refill;
  G.fx.push({ kind: 'hat', x: w.x + 2, y: w.y - 10, vx: -1.2, vy: -2.4, t: 0, life: 70 });
  for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.28; G.fx.push({ kind: 'spark', x: w.x, y: w.y, vx: Math.cos(a) * 1.6, vy: Math.sin(a) * 1.6, t: 0, life: 24 }); }
  if (G.lives <= 0) { G.lives = 0; G.over = 1; bgmFade(1.2); }
}
// ボム（CANDY RAIN）: 画面のおばけは全員その場で満足する（シャボン玉は捕まえられる）。敵の弾は消える。ボスは満足のゲージが大きく進む
function bomb() {
  const g = G;
  if (g.bombs <= 0 || g.rain > 0 || g.over || g.clear || g.ending) return;
  g.bombs--;
  g.rain = 100;
  g.w.inv = Math.max(g.w.inv, 110);
  popText('TRICK OR TREAT!', W / 2, 70, 'or4', true, 90);
  SE.bomb();
  for (const e of g.enemies) if (e.state === 'move' && e.x > -10 && e.x < W + 10 && e.y > -10 && e.y < H + 10) satisfy(e);
  const b = g.boss;
  if (bossHittable(b)) { b.hp -= b.max * rules().bombPower; b.eatT = 30; if (b.hp <= 0) bossSatisfied(); }
}

// ---- おばけの動き ----
// 呼び出し（中ボス・王様）: 今いる場所のザコを n 体、光の輪と一緒に
function summon(x, y, n) {
  n = Math.max(1, Math.round(n * rules().density));
  const kinds = LOCAL[sceneNow()].filter((k) => k !== 'spider');
  for (let i = 0; i < n; i++) {
    const k = pick(kinds.filter((k) => k !== 'vampire' || i === 0)), yy = Math.max(20, Math.min(H - 20, y + (i - (n - 1) / 2) * 26));
    spawn(k, x, yy, { amp: 14, phase: i, summoned: true });
    G.fx.push({ kind: 'spark', x, y: yy, vx: 0, vy: 0, t: 0, life: 18 });
  }
}
function updateEnemy(e) {
  e.t++;
  if (e.flash > 0) e.flash--;
  if (e.eatT > 0) e.eatT--;
  if (e.state === 'eat') {                          // 食べている（止まって、もぐもぐ）
    if (e.eatT === 0) { e.state = 'happy'; e.t = 0; }
    return;
  }
  if (e.state === 'happy') {                        // 満足して、左へ流れながらゆっくり上っていく（当たらない。魔女がさわると仲間になる）
    e.y -= 0.42; e.x -= 1.3 + Math.sin(e.t * 0.1) * 0.3;   // 画面の右で満足させた子も、魔女のいる左側を通り過ぎるように（2026-10-31）
    if (e.y < -30 || e.x < -30) e.dead = true;
    return;
  }
  const sl = (e.slow > 0 ? 0.45 : 1) * rules().speed;
  if (e.slow > 0) e.slow--;
  const t = e.t, X = (v) => (e.x += v * sl), Y = (v) => (e.y += v * sl);
  switch (e.kind) {
    // ザコは弾を撃たない（弾があると、近づいて手渡しする余裕が無い。2026-10-31）。動きで迫る
    case 'ghost': { X(-0.9); e.y0 += Math.sign(G.w.y - e.y0) * 0.25 * sl; e.y = e.y0 + Math.sin(t * 0.05 + (e.phase || 0)) * (e.amp || 10); break; }   // ゆらゆらしながら魔女の高さへ寄る
    case 'bat': X(-1.7); e.y = e.y0 + Math.sin(t * 0.09 + (e.phase || 0)) * (e.amp || 20); break;
    case 'pumpkin':                                  // 跳ねながら来る
      e.vy = (e.vy ?? -2) + 0.09; Y(e.vy); X(-0.8);
      if (e.y > 196) { e.y = 196; e.vy = -3.4; }
      break;
    case 'cat':                                     // 入ってきて止まり、身をかがめてから、魔女のいた所へ一気に
      if (t < 50) X(-1.8);
      else if (t < 95) { e.x += Math.sin(t * 1.3) * 0.4; if (t === 94) { const [vx, vy] = aimAt(e.x, e.y, 4.2); e.vx = vx; e.vy = vy; } }
      else { X(e.vx); Y(e.vy); }
      break;
    case 'crow': X(-2.3); e.y = e.y0 + Math.sin(Math.min(t * 0.025, 1.6)) * 60; break;   // V 字の編隊で急降下
    case 'skull':                                   // 入ってきて止まり、カタカタ震えてから、魔女へ突っ込む。それを 2 回
      if (t < 60) X(-1.6);
      else if (e.vx === undefined || e.dash <= 0) {
        e.x += Math.sin(t * 1.7) * 0.6;
        if ((t - 60) % 140 === 70) { const [vx, vy] = aimAt(e.x, e.y, 2.6); e.vx = vx; e.vy = vy; e.dash = 50; e.n = (e.n || 0) + 1; }
      } else { X(e.vx); Y(e.vy); if (--e.dash <= 0 && e.n >= 2) { e.vx = -2.2; e.vy = 0; e.dash = 999; } }
      break;
    case 'wisp': {                                  // ゆっくり追いかける。時間がたつと離れていく
      const [vx, vy] = aimAt(e.x, e.y, 0.75);
      if (t < 360) { X(vx * 0.6 - 0.4); Y(vy * 0.6); } else X(-1.4);
      break;
    }
    case 'spider':                                  // 上から糸で、魔女の高さまで降りてきて、また上へ
      X(-0.6);
      if (t < 120) Y(Math.max(0, Math.min(2, (G.w.y - e.y) * 0.05))); else if (t > 200) Y(-1.8);
      if (t > 200 && e.y < -20) e.dead = true;
      break;
    case 'mummy':                                   // ふわふわ漂いながら、魔女の高さへゆっくり寄る
      X(-0.6); e.y0 += Math.sign(G.w.y - e.y0) * 0.35 * sl; e.y = e.y0 + Math.sin(t * 0.03) * 10;
      break;
    case 'candle':                                  // 上を漂い、魔女の真上あたりに来たら降ってくる
      if (!e.fall) { X(-0.9); e.y = e.y0 + Math.sin(t * 0.06) * 4; if (Math.abs(e.x - G.w.x) < 24 && e.x < W - 20) e.fall = 1; }
      else { e.fall += 0.12; Y(e.fall); X(-0.5); }
      break;
    case 'vampire': {                               // 消えては魔女の近く（前か上下）に現れ、少しためて飛びかかる
      const ph = t % 130;
      e.hide = ph > 100;
      if (ph === 0) {
        if ((e.jumps = (e.jumps || 0) + 1) > 4) { e.x = W + 40; e.dead = true; break; }
        if (t > 0) { const a = rnd(-1.2, 1.2); e.x = Math.min(W - 12, G.w.x + 70 + Math.cos(a) * 30); e.y = Math.max(16, Math.min(H - 16, G.w.y + Math.sin(a) * 60)); }
        e.vx = e.vy = 0;
        G.fx.push({ kind: 'spark', x: e.x, y: e.y, vx: 0, vy: 0, t: 0, life: 18 });
      }
      if (ph === 40) { const [vx, vy] = aimAt(e.x, e.y, 2.4); e.vx = vx; e.vy = vy; }
      if (ph > 40 && ph < 90) { X(e.vx); Y(e.vy); }
      break;
    }
    case 'bigghost':                                // 中ボス: 入ってきて、ふわふわしながら、その場所のザコを呼ぶ
      if (t < 90) X(-1); else e.x += Math.sin(t * 0.02) * 0.3;
      e.y = e.y0 + Math.sin(t * 0.03) * 30;
      if (t > 90 && t % Math.round(180 * rules().rest) === 0) summon(e.x - 10, e.y, 2);
      if (t > 900) X(-1.2);
      break;
  }
  if (e.x < -30 || e.y > H + 30) e.dead = true;
}

// ---- ボス ----
// 弾は撃たない。ザコを呼ぶのと、体当たり（必ずふるえて予告する）。hp: NORMAL の満足のゲージ。仲間の人数・レベルでは増やさない。
// hw・hh・oy: 当たりの箱（半分の幅・高さ、絵の中心からのずれ）。hx・hy: いつもいる所
const BOSSES = {
  king: { ref: 'boss/king', label: 'KING', name: 'THE PUMPKIN KING!', hp: 200, hw: 24, hh: 22, oy: 6, hx: 246, hy: 110 },
  queen: { ref: 'boss/queen', label: 'QUEEN', name: 'THE SPIDER QUEEN!', hp: 240, hw: 24, hh: 20, oy: 0, hx: 240, hy: 70 },
  count: { ref: 'boss/count', label: 'COUNT', name: 'THE VAMPIRE COUNT!', hp: 270, hw: 18, hh: 24, oy: 0, hx: 240, hy: 110 },
  moon: { ref: 'boss/moon', label: 'MOON', name: 'THE MOON GHOST!', hp: 400, hw: 34, hh: 34, oy: 0, hx: 240, hy: 110, last: true },
};
const finalStage = () => G.stage === STAGES.length - 1;
function startBoss() {
  const kind = STAGES[G.stage].boss, d = BOSSES[kind];
  const hp = Math.round(d.hp * rules().bossHp);
  G.boss = { kind, x: W + 50, y: d.hy, t: 0, hp, max: hp, eatT: 0, state: 'in', next: 120, warn: 0, alpha: 1, action: 0, attackN: 0 };
  // 道中の敵を重ねて初見の体当たりにしない。満足した子は残して捕まえられる。
  for (const e of G.enemies) if (e.state === 'move') satisfy(e);
  G.bossIntro = 150;
  bgmFade(1.0);
  SE.king();
}
// 体当たりの予告（ふるえる）が終わったら、それぞれの技
function updateBoss() {
  const b = G.boss, d = BOSSES[b.kind], w = G.w;
  b.t++;
  if (b.eatT > 0) b.eatT--;
  if (b.state === 'in') { b.x -= 0.8; if (b.x <= d.hx) { b.state = 'fight'; b.t = 0; bgm(d.last ? 'last' : 'boss'); } return; }
  if (b.state === 'happy') {                         // 満足した: 上へ帰っていく
    b.alpha = 1; b.y -= 0.5; b.x += Math.sin(b.t * 0.05) * 0.4;
    if (b.t % 8 === 0) G.fx.push({ kind: 'heart', x: b.x + rnd(-24, 24), y: b.y - 20, vx: rnd(-0.6, 0.6), vy: rnd(-1.4, -0.6), t: 0, life: 60 });
    return;
  }
  const angry = b.hp < b.max / 2, t = b.t;
  if (b.move) {
    if (b.move(b) === false) { b.move = null; b.next = t + Math.round((angry ? 100 : 140) * rules().rest); b.target = null; }
    return;
  }
  if (b.warn > 0) { if (--b.warn === 0) b.move = BOSS_MOVE[b.kind].attack(b, angry); return; }
  BOSS_MOVE[b.kind].idle(b, t);
  if (b.move) return;
  if (t >= b.next) {
    // 呼ぶ → 技 → 呼ぶ → 別の技。運で突進が続かないよう、2 種類を交互に使う。
    if (b.action++ % 2 === 0) { BOSS_MOVE[b.kind].summon(b, angry); b.next = t + Math.round((angry ? 210 : 270) * rules().rest); }
    else { b.warn = rules().warning; b.target = { x: w.x, y: w.y }; b.attackN++; }
  }
}
// 目標の位置へなめらかに寄る（位置を直接置くと、技のあとにワープして見える）
const easeTo = (b, x, y, k = 0.06, max = 4) => { const c = (v) => Math.max(-max, Math.min(max, v)); b.x += c((x - b.x) * k); b.y += c((y - b.y) * k); };   // 1 コマに max 点まで
// 右へ抜けたら、右からいつもの所へ戻ってくる
function comeBack(b, d) {
  b.back = (b.back || 0) + rules().bossSpeed;
  const k = Math.min(1, b.back / 60);
  b.x = W + 60 - k * (W + 60 - d.hx); b.y += (d.hy - b.y) * 0.05;
  if (b.back >= 60) { b.back = 0; return false; }
}
const BOSS_MOVE = {
  king: {                                           // 王様かぼちゃ: 上下にゆれて、ザコを呼ぶ。魔女の高さへ突進
    idle: (b, t) => easeTo(b, 246 + Math.sin(t * 0.011) * 18, 110 + Math.sin(t * 0.011) * 34),
    summon: (b, angry) => summon(b.x - 30, b.y, angry ? 5 : 4),
    attack: (b, angry) => {
      const y = Math.max(40, Math.min(H - 40, b.target.y)), x0 = b.x, y0 = b.y;
      let rt = 0, out = false;
      const bounce = b.attackN % 2 === 0;
      return (b) => {
        if (!out) {
          rt += rules().bossSpeed;
          b.x = x0 - rt * (bounce ? (angry ? 3.1 : 2.6) : (angry ? 4.6 : 3.8));
          if (bounce) b.y = Math.max(40, Math.min(195, y0 + (y - y0) * Math.min(1, rt / 50) - Math.abs(Math.sin(rt * 0.055)) * 58));
          else b.y += Math.max(-4, Math.min(4, (y - b.y) * 0.1));
          if (b.x < -60) { out = true; b.x = W + 60; b.y = y; }
          return;
        }
        return comeBack(b, BOSSES.king);
      };
    },
  },
  queen: {                                          // クモの女王: 上から糸でぶら下がる。子グモを降らせる。魔女めがけて降りてきて、糸で戻る
    idle: (b, t) => easeTo(b, 236 + Math.sin(t * 0.013) * 40, 64 + Math.sin(t * 0.014) * 22),
    summon: (b, angry) => {
      const n = Math.max(2, Math.round((angry ? 4 : 3) * rules().density));
      for (let i = 0; i < n; i++) { const x = 130 + i * (160 / n) + rnd(0, 20); spawn('spider', x, -10, { summoned: true }); }
      if (angry) summon(b.x - 30, b.y + 20, 2);
    },
    attack: (b, angry) => {
      const tx = Math.max(60, Math.min(W - 40, b.target.x)), ty = Math.max(70, Math.min(H - 30, b.target.y));
      const sweep = b.attackN % 2 === 0, x0 = b.x;
      let ph = 0;
      return (b) => {
        ph += rules().bossSpeed;
        if (sweep) {
          // 糸を長くして大きく左へ振れ、同じ弧を戻る。端に逃げ込んでも押しつぶさない。
          const u = Math.min(1, ph / (angry ? 155 : 180)), arc = Math.sin(u * Math.PI);
          b.x = x0 - (x0 - Math.max(65, tx - 12)) * arc;
          b.y = 64 + (Math.min(185, ty + 25) - 64) * arc;
          if (u === 1) return false;
          return;
        }
        if (ph <= 40) { easeTo(b, tx, 40, 0.07); return; }   // 真上へ
        if (ph <= 80) { b.y = Math.min(ty, b.y + (angry ? 5 : 4)); return; }         // 降りる
        if (ph <= 100) return;                                                        // ぶら下がって止まる
        b.y -= 2 * rules().bossSpeed; if (b.y <= 64) return false;                       // 糸で戻る
      };
    },
  },
  count: {                                          // 吸血鬼の伯爵: 消えては別の所に現れる。コウモリに分かれて飛ばす。マントを広げて魔女めがけて体当たり
    idle: (b, t) => {
      b.y += Math.sin(t * 0.04) * 0.3;
      if (t % 240 === 120) b.move = teleport(rnd(170, 280), rnd(50, 180));
    },
    summon: (b, angry) => {
      const n = Math.max(3, Math.round((angry ? 7 : 5) * rules().density));
      for (let i = 0; i < n; i++) { const a = Math.PI * 0.6 + (i / (n - 1)) * Math.PI * 0.8; spawn('bat', b.x + Math.cos(a) * 14, b.y + Math.sin(a) * 14, { amp: 20, phase: i, summoned: true }); }
      for (let i = 0; i < 6; i++) G.fx.push({ kind: 'spark', x: b.x + rnd(-10, 10), y: b.y + rnd(-14, 14), vx: rnd(-1, 1), vy: rnd(-1, 1), t: 0, life: 18 });
    },
    attack: (b, angry) => {
      const bend = b.attackN % 2 === 0;
      const x0 = b.x, y0 = b.y, tx = Math.max(45, Math.min(180, b.target.x)), ty = Math.max(42, Math.min(H - 42, b.target.y));
      const dx = tx - x0, dy = ty - y0, dist = Math.hypot(dx, dy) || 1;
      const speed = (angry ? 4.2 : 3.5) * rules().bossSpeed;
      const vx = dx / dist * speed, vy = dy / dist * speed;
      let ph = 0;
      return (b) => {
        if (bend) {
          ph += rules().bossSpeed;
          const u = Math.min(1, ph / (angry ? 110 : 135));
          b.x = x0 + (tx - x0) * Math.sin(u * Math.PI);
          b.y = y0 + (ty - y0) * Math.sin(u * Math.PI) + Math.sin(u * Math.PI * 2) * 38;
          if (u === 1) return false;
          return;
        }
        b.x += vx; b.y += vy;
        if (b.x < -40 || b.y < -40 || b.y > H + 40) { b.move = teleport(BOSSES.count.hx, BOSSES.count.hy, true); return true; }
      };
    },
  },
  moon: {                                           // 月のおばけ: 大きく漂い、どの場所のおばけも呼ぶ。弧を描いて左へ急降下し、右から戻る
    idle: (b, t) => easeTo(b, 240 + Math.sin(t * 0.009) * 20, 110 + Math.sin(t * 0.009) * 44),
    summon: (b, angry) => summon(b.x - 40, b.y, angry ? 6 : 5),
    attack: (b, angry) => {
      const x0 = b.x, y0 = b.y, ty = Math.max(50, Math.min(H - 50, b.target.y));
      const crescent = b.attackN % 2 === 0;
      let rt = 0, out = false;
      return (b) => {
        rt += rules().bossSpeed;
        if (crescent) {
          // 月が大きな三日月の弧を描き、予告した場所のそばを通って右へ帰る。
          const u = Math.min(1, rt / (angry ? 155 : 185)), arc = Math.sin(u * Math.PI);
          b.x = x0 - (x0 - 65) * arc;
          b.y = Math.max(42, Math.min(192, y0 + (ty - y0) * arc + Math.sin(u * Math.PI * 2) * 58));
          if (u === 1) return false;
          return;
        }
        if (!out) { b.x = x0 - rt * (angry ? 3.8 : 3.1); b.y = y0 + (ty - y0) * Math.sin(Math.min(1, rt / 50) * Math.PI / 2) + Math.sin(rt * 0.08) * 24; if (b.x < -60) { out = true; b.x = W + 60; } return; }
        return comeBack(b, BOSSES.moon);
      };
    },
  },
};
// 消えて（薄くなり）別の所に現れる。消えている間は当たらないし、当てられない
function teleport(x, y, fromOut = false) {
  let ph = fromOut ? 29 : 0;                         // 画面の外から: 消える所は飛ばす
  return (b) => {
    ph++;
    b.hide = true;
    if (ph < 30) { b.alpha = 1 - ph / 30; b.hide = true; return; }
    if (ph === 30) { b.x = x; b.y = y; for (let i = 0; i < 6; i++) G.fx.push({ kind: 'spark', x: x + rnd(-12, 12), y: y + rnd(-16, 16), vx: 0, vy: 0, t: 0, life: 16 }); }
    b.alpha = Math.min(1, (ph - 30) / 20);
    if (ph >= 50) { b.alpha = 1; b.hide = false; return false; }
  };
}
const bossHittable = (b) => b && b.state === 'fight' && !b.hide;
function feedBoss(dmg) {
  const b = G.boss;
  b.hp -= dmg; b.eatT = 6;
  if (G.t % 4 === 0) SE.munch();
  if (b.hp <= 0) bossSatisfied();
}
function bossSatisfied() {
  const b = G.boss;
  if (b.state === 'happy') return;
  b.state = 'happy'; b.t = 0; b.hp = 0; b.move = null; b.warn = 0; b.hide = false;
  for (const e of G.enemies) if (e.state === 'move') satisfy(e);   // 残ったザコも満足する（シャボン玉は捕まえられる）
  addScore(BOSSES[b.kind].last ? 50000 : 20000);
  popText('TREAT!', W / 2, 80, 'ye3', true, 200);
  SE.bigtreat();
  bgmFade(0.5);
  setTimeout(() => bgm('clear'), 600);
  if (finalStage()) G.ending = 1; else G.clear = 1;
}
// やられた: コンティニューするとその場から（残り 3 つ・ボムは少なくとも 2 つ。点はそのまま、コンティニューの回数を数える）
const CONTINUE_T = 600;
function continueGame() {
  const g = G;
  g.over = 0; g.continues++;
  g.lives = rules().lives; g.bombs = Math.max(g.bombs, rules().bombs);
  Object.assign(g.w, { inv: Math.max(180, rules().inv), hitT: 0 });
  SE.start();
  const b = g.boss;
  bgm(b && b.state !== 'in' ? (BOSSES[b.kind].last ? 'last' : 'boss') : STAGES[g.stage].bgm);
}

// 確かめ用: その面の頭（boss なら、ボスの手前）へすぐ飛ぶ
function debugJump(stage, boss) {
  audio(); mode = 'play'; modeT = 0; ptrs.clear();
  newGame({ stage, boss });
  popText(boss ? `BOSS ${stage + 1}` : `STAGE ${stage + 1}`, W / 2, 60, 'gy5', false, 60);
}
function debugKeys() {
  if (!DEBUG) return;
  if (pressed.KeyI) { debugInv = !debugInv; if (G) popText(debugInv ? 'INV ON' : 'INV OFF', W / 2, 60, 'gy5', false, 60); }
  for (let i = 0; i < 4; i++) if (pressed['Digit' + (i + 1)]) debugJump(i, keys.ShiftLeft || keys.ShiftRight);
}

// ---- 1 コマ進める ----
function update() {
  tick++; modeT++;
  debugKeys();
  if (mode === 'title') {
    const dir = (pressed.ArrowRight || pressed.KeyD || pressed.ArrowDown || pressed.KeyS ? 1 : 0) - (pressed.ArrowLeft || pressed.KeyA || pressed.ArrowUp || pressed.KeyW ? 1 : 0);
    if (dir) selectDifficulty(DIFFICULTY_ORDER[(DIFFICULTY_ORDER.indexOf(difficulty) + dir + DIFFICULTY_ORDER.length) % DIFFICULTY_ORDER.length]);
    if (pressed.Enter || pressed.KeyZ || pressed.Space) startGame();
    if (pressed.KeyM) setMute(!muted);
    return;
  }
  if (mode === 'pause') {
    if (pressed.Enter || pressed.KeyP || pressed.Escape || pressed.KeyZ) { mode = 'play'; if (ac) ac.resume(); }
    if (pressed.KeyM) setMute(!muted);
    if (pressed.KeyQ) { toTitle(); }
    return;
  }
  if (mode !== 'play') return;
  if (pressed.KeyP || pressed.Escape) { pauseGame(); return; }
  if (pressed.KeyM) setMute(!muted);
  const g = G, w = g.w;
  if (g.over) {                                     // 続けるのを待っている間は、面・敵・ボスのゲージを止める
    g.over++;
    const left = g.over - 60, ok = pressed.Enter || pressed.KeyZ || pressed.Space;
    if (left > 0 && left < CONTINUE_T && ok) continueGame();
    else if (left === CONTINUE_T) bgm('over');
    else if (left > CONTINUE_T + 60 && ok) toTitle();
    return;
  }
  g.t++;
  g.scroll += g.boss ? 0.6 : 1;
  // 魔女
  const inp = input();
  if (!g.over && !g.clear && !g.ending) {
    const sp = w.hitT > 0 ? 0.8 : 1.9;
    w.x += inp.mx * sp + inp.dragX; w.y += inp.my * sp + inp.dragY;
    w.x = Math.max(14, Math.min(W - 14, w.x)); w.y = Math.max(14, Math.min(H - 12, w.y));
    if (w.fireCd > 0) w.fireCd--;
    if (inp.fire && w.fireCd === 0 && w.hitT === 0) { fireCandies(); w.fireCd = 20; }   // 1 秒に 3 回（最初は控えめにして、仲間が増えたときの強さが味わえるように。7 → 12 → 20。2026-10-31）
    g.firing = inp.fire && w.hitT === 0;
    if (pressed.KeyZ) bomb();
  } else { g.firing = false; if (g.clear || g.ending) { w.x += (90 - w.x) * 0.02; w.y += (120 - w.y) * 0.02; } }
  if (w.inv > 0) w.inv--;
  if (w.hitT > 0) w.hitT--;
  updateFriends();
  // 流れ
  const waves = stageWaveList(g.stage);
  while (g.spawnI < waves.length && waves[g.spawnI][0] <= g.t) { if (!g.boss) waves[g.spawnI][1](); g.spawnI++; }
  if (g.t >= STAGES[g.stage].len && !g.boss) startBoss();
  if (g.bossIntro > 0) g.bossIntro--;
  if (g.rain > 0) g.rain--;
  // お菓子
  for (const c of g.candies) {
    c.t++;
    if (c.home) { const e = nearestEnemy(c.x, c.y, 200); if (e) { const dx = e.x - c.x, dy = e.y - c.y, d = Math.hypot(dx, dy) || 1; c.vx += (dx / d) * 0.35 * CANDY_SPEED; c.vy += (dy / d) * 0.35 * CANDY_SPEED; const v = Math.hypot(c.vx, c.vy), sp = 3.6 * CANDY_SPEED; c.vx *= sp / v; c.vy *= sp / v; } }
    if (c.grav) c.vy += c.grav;
    if (c.orbit !== undefined) {                     // 魔女のまわりを回る（吸血鬼の子のマカロン）
      const a = c.orbit + c.t * 0.07, r = Math.min(26, 8 + c.t);
      c.x = w.x + Math.cos(a) * r; c.y = w.y + Math.sin(a) * r;
      c.hitIds = null;                               // 回っている間は、同じ子に何度も当たってよい（間隔は下）
      if (c.t % 20 !== 0) c.cool = true; else c.cool = false;
    } else {
      if (c.boomerang && c.t > 30) { c.vx -= 0.12; if (c.vx < 0 && !c.back) { c.back = true; c.hitIds = null; } if (c.vx < 0 && c.x < w.x) c.dead = true; }   // 行って戻る（帰りも同じ子に当たる）
      c.x += c.vx; c.y += c.vy;
      if (c.wave) c.y += Math.cos(c.t * 0.16) * c.wave * 0.16 * 0.5;   // ゆらゆら
      if (c.bounce && c.y > 200 && c.vy > 0) { c.vy = -c.vy * 0.6; c.bounce--; }
      if (c.roll && c.y > 202) { c.y = 202; c.vy = 0; c.grav = 0; c.vx = 1.4 * CANDY_SPEED * 2; }   // 地面で転がる
      if (c.grow) c.big = Math.min(14, 4 + c.t * 0.12);   // 網が広がる
    }
    if (c.life && c.t > c.life) c.dead = true;
  }
  g.candies = g.candies.filter((c) => c.x < W + 12 && c.x > -12 && c.y > -14 && c.y < H + 10 && !c.dead);
  // おばけ
  for (const e of g.enemies) updateEnemy(e);
  if (g.boss) updateBoss();
  // 当たり: お菓子 → おばけ
  for (const c of g.candies) {
    if (c.dead) continue;
    const cr = c.big || 4;
    for (const e of g.enemies) {
      if (e.state !== 'move' || e.hide || c.dead || c.cool || (c.hitIds && c.hitIds.has(e))) continue;
      const r = EDEF[e.kind].r + cr;
      if (Math.abs(c.x - e.x) < r && Math.abs(c.y - e.y) < r) {
        feed(e, c);
        if (c.pierce) { (c.hitIds ??= new Set()).add(e); if (--c.pierce <= 0) c.dead = true; } else c.dead = true;
      }
    }
    const b = g.boss, bd = b && BOSSES[b.kind];
    if (bossHittable(b) && !c.dead && !c.cool && !(c.hitIds && c.hitIds.has(b)) && Math.abs(c.x - b.x) < bd.hw + cr && Math.abs(c.y - b.y - bd.oy) < bd.hh + cr) {
      feedBoss(c.dmg);
      if (c.pierce) { if (!(c.hitIds ??= new Set()).has(b)) c.hitIds.add(b); c.dead = c.kind !== 'claw'; } else c.dead = true;
      G.fx.push({ kind: 'spark', x: c.x, y: c.y, vx: -0.5, vy: rnd(-0.5, 0.5), t: 0, life: 12 });
    }
  }
  // 捕まえる: 満足して上っていく子に、魔女がさわる
  if (!g.over && !g.clear && !g.ending) for (const e of g.enemies) if (e.state === 'happy' && !e.dead && Math.abs(e.x - w.x) < rules().catchR + EDEF[e.kind].r && Math.abs(e.y - w.y) < rules().catchR + EDEF[e.kind].r) { e.dead = true; addFriend(e); for (let i = 0; i < 4; i++) G.fx.push({ kind: 'spark', x: e.x, y: e.y, vx: rnd(-1, 1), vy: rnd(-1, 1), t: 0, life: 16 }); }
  // 当たり: おばけ・弾 → 魔女（当たり判定は顔のあたりの小さな点）
  const hx = w.x + 3, hy = w.y - 2;
  if (!g.over && !g.clear && !g.ending) {
    for (const e of g.enemies) if (e.state === 'move' && !e.hide && Math.abs(e.x - hx) < EDEF[e.kind].r + 2 && Math.abs(e.y - hy) < EDEF[e.kind].r + 2) trick();
    const b = g.boss, bd = b && BOSSES[b.kind];
    if (bossHittable(b) && Math.abs(b.x - hx) < bd.hw - 2 && Math.abs(b.y + bd.oy - hy) < bd.hh) trick();
  }
  g.enemies = g.enemies.filter((e) => !e.dead);
  // 演出
  for (const f of g.fx) { f.t++; f.x += f.vx; f.y += f.vy; if (f.kind === 'hat') f.vy += 0.12; }
  g.fx = g.fx.filter((f) => f.t < f.life);
  for (const tx of g.texts) { tx.t++; tx.y -= tx.big ? 0.2 : 0.4; }
  g.texts = g.texts.filter((tx) => tx.t < tx.life);
  // 終わり
  const ok = pressed.Enter || pressed.KeyZ || pressed.Space;
  if (g.clear) { g.clear++; if (g.clear > 330) startStage(g.stage + 1); }   // 次の面へ（仲間・点・残り・ボムは持ち越す）
  if (g.ending) { g.ending++; if (g.ending > 360 && ok) toTitle(); }
  if (!g.practice && !g.continues && g.score > hi) { hi = g.score; localStorage.setItem(`witchs-treat-hi-${g.difficulty}`, hi); }
}
function pauseGame() { if (mode === 'play' && G && !G.over && !G.clear && !G.ending) { mode = 'pause'; } }
function toTitle() { mode = 'title'; modeT = 0; G = null; ptrs.clear(); bgm(null); }

// ---- 描く ----
function layer(ref, name, speed, y) {
  const p = pic(ref, name), off = ((speed % p.w) + p.w) % p.w;
  for (let x = -off; x < W; x += p.w) ctx.drawImage(p.img, Math.round(x), y);
}
// 中と手前の景色: 面ごとの場所（町・墓地・屋敷・空）の絵
const sceneLayer = (ref, speed, y, t) => layer(ref, sceneNow(), speed * t, y);
function drawBackground(t, scrollT) {
  ctx.drawImage(SKY, 0, 0);
  for (let i = 0; i < 12; i++) { const x = (i * 97 + 13) % W, y = (i * 53 + 7) % 130; if ((t + i * 23) % 90 < 20) rect(x, y, 1, 1, 'white'); }   // 星のまたたき
  layer('bg/far', 'far', scrollT * 0.15, 110);
  sceneLayer('bg/mid', 0.5, 130, scrollT);
  sceneLayer('bg/near', 1.6, 200, scrollT);
}
function drawWitch(w, t) {
  if (w.inv > 0 && w.hitT === 0 && Math.floor(t / 3) % 2) return;
  const p = w.hitT > 0 ? pic('witch/witch', 'hit') : animPic('witch/witch', 'fly', t);
  if (w.hitT > 25) {                                 // くるくる回る
    ctx.save(); ctx.translate(Math.round(w.x), Math.round(w.y)); ctx.rotate(Math.round((w.hitT * 0.4) / 1.57) * 1.57); ctx.drawImage(p.img, -p.w / 2, -p.h / 2); ctx.restore();
  } else draw(p, w.x, w.y + (Math.sin(t * 0.1) > 0.6 ? 1 : 0));
  if (t % 4 === 0 && w.hitT === 0) G.fx.push({ kind: 'spark', x: w.x - 16, y: w.y + 4 + rnd(-2, 2), vx: -1, vy: rnd(-0.2, 0.2), t: 0, life: 14 });   // ほうきの粉
}
// シャボン玉（満足した子を包む）: 薄い中身、1 点の輪、左上の光。少しだけ揺れて形が変わる
function drawBubble(x, y, r, t) {
  x = Math.round(x); y = Math.round(y);
  const rx = r + Math.sin(t * 0.15) * 0.6, ry = r - Math.sin(t * 0.15) * 0.6;
  ctx.globalAlpha = 0.12; ctx.fillStyle = hex('cy3');
  for (let j = -Math.ceil(ry); j <= Math.ceil(ry); j++) { const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (j / ry) ** 2))); ctx.fillRect(x - w, y + j, w * 2 + 1, 1); }
  ctx.globalAlpha = 0.75; ctx.fillStyle = hex('cy3');
  const seen = new Set();
  for (let a = 0; a < 6.283; a += 0.5 / r) { const px = Math.round(x + Math.cos(a) * rx), py = Math.round(y + Math.sin(a) * ry), k = px * 1000 + py; if (seen.has(k)) continue; seen.add(k); ctx.fillRect(px, py, 1, 1); }
  ctx.globalAlpha = 1; ctx.fillStyle = hex('white');   // 左上の光
  const hx = Math.round(x - rx * 0.5), hy = Math.round(y - ry * 0.55);
  ctx.fillRect(hx, hy, 2, 1); ctx.fillRect(hx - 1, hy + 1, 1, 2);
}
function drawEnemy(e) {
  const d = EDEF[e.kind];
  if (e.hide && e.state === 'move' && e.t % 4 < 2) return;   // 吸血鬼の子: 消える前の点滅
  const p = e.state === 'happy' ? pic(d.ref, 'happy') : e.state === 'eat' || e.eatT > 0 ? pic(d.ref, 'eat') : animPic(d.ref, 'move', e.t);
  if (e.kind === 'spider') rect(e.x, -2, 1, e.y - 4, 'gy4');   // 糸
  if (e.state === 'happy') { ctx.globalAlpha = 0.4; draw(p, e.x, e.y); ctx.globalAlpha = 1; drawBubble(e.x, e.y, Math.max(p.w, p.h) / 2 + 3, e.t); return; }   // 満足した子は半透明で、シャボン玉に入る（取れるアイテムだと分かるように）
  else draw(p, e.x, e.y, e.flash > 0 && e.state === 'move' && e.flash % 2 === 1);
  if (e.kind === 'bigghost' && e.state === 'move') {   // 満足のゲージ
    const k = Math.max(0, e.hp / e.maxHp);
    rect(e.x - 10, e.y - 17, 20, 3, 'ink'); rect(e.x - 9, e.y - 16, 18 * (1 - k), 1, 'pk1');
  }
}
// 捕まえられる子（満足して上っていく子）: まだ 1 人も捕まえていない間だけ CATCH! の案内（頭の上のハートは、敵の弾に見えるのでやめた）
function drawCatchHints(t) {
  for (const e of G.enemies) {
    if (e.state !== 'happy') continue;
    if (G.catches === 0 && G.t < 5000) text('CATCH!', e.x, e.y - EDEF[e.kind].r - 20, 'pk2', 'center');
  }
}
function drawFriend(f, t) {
  const d = EDEF[f.kind];
  const p = f.leaving ? pic(d.ref, 'eat') : animPic(d.ref, 'move', f.t);
  if (!f.leaving && f.up > 0 && f.up % 4 < 2) draw(p, f.x, f.y, true); else draw(p, f.x, f.y);
  if (!f.leaving) for (let i = 0; i < f.lv; i++) rect(f.x - 5 + i * 2, f.y + d.r + 4, 1, 1, 'ye3');   // レベルの点
}
function drawBoss(b, t) {
  const ref = BOSSES[b.kind].ref;
  const p = b.state === 'happy' ? pic(ref, 'happy') : b.eatT > 0 ? pic(ref, 'eat') : pic(ref, b.hp < b.max / 2 ? 'angry' : 'idle');
  const shake = b.warn > 0 ? (t % 4 < 2 ? 2 : -2) : 0;   // 体当たりの予告: ぶるぶる震える
  if (b.kind === 'queen' && b.state !== 'happy') rect(Math.round(b.x), 0, 1, Math.max(0, Math.round(b.y - p.h / 2)), 'gy4');   // 女王の糸
  ctx.globalAlpha = b.alpha ?? 1;
  draw(p, b.x + shake, b.y + (b.state === 'fight' && Math.floor(t / 20) % 2 ? 1 : 0));
  ctx.globalAlpha = 1;   // 当たっても白く光らせない。食べる顔に替えるだけ
  if (b.warn > 0 && b.target) {
    const names = { king: ['DASH!', 'BOUNCE!'], queen: ['DROP!', 'SWING!'], count: ['DASH!', 'TURN!'], moon: ['DIVE!', 'CRESCENT!'] };
    text(names[b.kind][(b.attackN - 1) % 2], Math.max(35, Math.min(W - 35, b.x)), Math.max(30, b.y - p.h / 2 - 12), 'amber', 'center');
    if (b.warn % 16 < 10) {
      const { x, y } = b.target;
      rect(x - 10, y - 10, 6, 1, 'amber'); rect(x + 5, y - 10, 6, 1, 'amber');
      rect(x - 10, y + 10, 6, 1, 'amber'); rect(x + 5, y + 10, 6, 1, 'amber');
      text('!', x, y - 3, 'amber', 'center');
    }
  }
}
function drawCandy(c, t) {
  if (c.kind === 'claw') { const k = c.t % 4; for (let i = 0; i < 3; i++) rect(c.x - 6 + i * 4 + k, c.y - 6 + i, 2, 10, 'white'); return; }   // 黒猫の引っかき
  if (c.kind === 'web') { const p = pic('fx/fx', 'web'), sz = Math.round(p.w * (c.big || 4) / 5); ctx.drawImage(p.img, Math.round(c.x - sz / 2), Math.round(c.y - sz / 2), sz, sz); return; }   // クモの網（進むほど広がる）
  if (c.kind === 'bandage') return draw(pic('fx/fx', 'bandage'), c.x, c.y);   // ミイラの包帯（お菓子ではない攻撃）
  draw(PIC['candy/candy'].anims[c.kind] ? animPic('candy/candy', c.kind, t) : pic('candy/candy', c.kind), c.x, c.y);   // 仲間ごとに違うお菓子（マシュマロ・グミ・カップケーキ…）
}
function drawFx(f) {
  if (f.kind === 'heart') { if (f.life - f.t > 8 || f.t % 2) { ctx.globalAlpha = 0.4; draw(pic('fx/fx', 'heart'), f.x, f.y); ctx.globalAlpha = 1; } }   // 満足のハートは半透明（弾に見えないように目立たなく）
  else if (f.kind === 'spark') draw(pic('fx/fx', ['spark1', 'spark2', 'spark3'][Math.min(2, Math.floor((f.t / f.life) * 3))]), f.x, f.y);
  else if (f.kind === 'hat') draw(pic('fx/fx', 'life'), f.x, f.y);
}
// ボムの雨: 画面いっぱいにお菓子が降る
const RAIN = Array.from({ length: 46 }, (_, i) => ({ x: (i * 53) % W, s: 2 + (i % 5) * 0.6, k: ['pop1', 'marshmallow', 'gummy', 'cupcake', 'cookie', 'macaron', 'caramel', 'jellybean', 'icecream', 'choco1'][i % 10], o: (i * 37) % 240 }));
function drawRain(r) {
  const k = 100 - r;
  for (const d of RAIN) { const y = ((d.o + k * d.s * 2) % 280) - 20; draw(pic('candy/candy', d.k), d.x + Math.sin((k + d.o) * 0.1) * 4, y); }
}
function drawHud() {
  text(`SCORE ${String(G.score).padStart(7, '0')}`, 4, 4, 'white');
  text(`HI ${String(hi).padStart(7, '0')}`, 150, 4, 'ye3', 'center');
  for (let i = 0; i < G.lives; i++) draw(pic('fx/fx', 'life'), W - 52 - i * 11 + (touchMode && !pad ? 0 : 42), 8);
  for (let i = 0; i < G.bombs; i++) draw(bombPic('mini'), 9 + i * 10, 18);   // ボムの数
  if (!touchMode) text('Z BOMB', 64, 17, 'lilac');
  for (let i = 0; i < rules().charge - 1; i++) rect(4 + i * 3, 25, 2, 2, i < G.bombCharge ? 'pk1' : 'nt4');   // 次のボムまで（捕まえるとたまる）
  text(rules().name, 150, 17, 'lilac', 'center');
  if (G.practice) text('PRACTICE', W - 4, 19, 'amber', 'right');
  if (touchMode && !pad) {                          // 余白が無い端末: 右上にボムとポーズ
    rect(BOMB_BTN.x, BOMB_BTN.y, BOMB_BTN.w, BOMB_BTN.h, 'nt3'); draw(bombPic('icon'), BOMB_BTN.x + BOMB_BTN.w / 2, BOMB_BTN.y + BOMB_BTN.h / 2);
    rect(PAUSE_BTN.x, PAUSE_BTN.y, PAUSE_BTN.w, PAUSE_BTN.h, 'nt3'); rect(PAUSE_BTN.x + 5, PAUSE_BTN.y + 4, 2, 8, 'white'); rect(PAUSE_BTN.x + 11, PAUSE_BTN.y + 4, 2, 8, 'white');
  }
  if (G.boss && G.boss.state === 'fight') {         // ボスの満足のゲージ
    const k = Math.max(0, G.boss.hp / G.boss.max);
    text(BOSSES[G.boss.kind].label, 66, 226, 'or4', 'right');
    rect(70, 227, 202, 7, 'ink'); rect(71, 228, 200 * (1 - k), 5, 'pk1'); rect(71, 228, 200 * (1 - k), 1, 'pk3');
  }
}
function drawPad() {
  if (!pad) return;
  const c = pctx;
  c.fillStyle = hex('ink'); c.fillRect(0, 0, pad.pw, pad.ph);
  const ring = (x, y, r, col) => { c.fillStyle = hex(col); for (let a = 0; a < 6.283; a += 1 / r) c.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), 1, 1); };
  const disc = (x, y, r, col) => { c.fillStyle = hex(col); for (let j = -r; j <= r; j++) { const w = Math.round(Math.sqrt(r * r - j * j)); c.fillRect(Math.round(x - w), Math.round(y + j), w * 2 + 1, 1); } };
  const box = (b, col, edge) => { c.fillStyle = hex(col); c.fillRect(b.x, b.y, b.w, b.h); c.fillStyle = hex(edge); c.fillRect(b.x, b.y, b.w, 1); c.fillRect(b.x, b.y + b.h - 1, b.w, 1); c.fillRect(b.x, b.y, 1, b.h); c.fillRect(b.x + b.w - 1, b.y, 1, b.h); };
  if (pad.debug) for (const b of pad.debug) {      // 確かめ用のボタン
    const on = b.n === 'INV' && debugInv;
    box(b, on ? 'night4' : 'night2', on ? 'amber' : 'night4');
    text(b.n, b.x + b.w / 2, b.y + 6, on ? 'amber' : 'lilac', 'center', 1, c, null);
  }
  if (mode !== 'play') { text(mode === 'title' ? 'SELECT DIFFICULTY ABOVE' : 'TAP', pad.pw / 2, pad.stick.y - 3, 'gy4', 'center', 1, c, null); return; }
  const st = [...ptrs.values()].find((t) => t.kind === 'stick');
  const ax = st ? st.ax : pad.stick.x, ay = st ? st.ay : pad.stick.y;
  ring(ax, ay, STICK_REACH + 6, st ? 'pu3' : 'nt4');
  let kx = ax, ky = ay;
  if (st) { const dx = st.x - ax, dy = st.y - ay, d = Math.hypot(dx, dy) || 1, m = Math.min(d, STICK_REACH); kx = ax + (dx / d) * m; ky = ay + (dy / d) * m; }
  disc(kx, ky, 9, st ? 'pu3' : 'nt4'); disc(kx - 2, ky - 2, 3, st ? 'pu5' : 'nt5');
  if (!st) text('MOVE', ax, ay + STICK_REACH + 12, 'nt5', 'center', 1, c, null);
  const bb = pad.bomb, has = G && G.bombs > 0;   // ボム（gunzo の余白のボタンと同じ大きさ）
  box(bb, has ? 'pu1' : 'nt2', has ? 'pu4' : 'nt4');
  { const bp = bombPic('icon'); c.drawImage(bp.img, Math.round(bb.x + (bb.w - bp.w) / 2), Math.round(bb.y + Math.max(2, (bb.h - 10 - bp.h) / 2))); }
  text(`X${G ? G.bombs : 0}`, bb.x + bb.w / 2, bb.y + bb.h - 9, has ? 'ye3' : 'nt5', 'center', 1, c, null);
  const pz = pad.pause;
  box(pz, 'nt3', 'nt5');
  c.fillStyle = hex('gy4'); c.fillRect(Math.round(pz.x + pz.w * 0.32), Math.round(pz.y + pz.h * 0.25), 3, Math.round(pz.h * 0.5)); c.fillRect(Math.round(pz.x + pz.w * 0.58), Math.round(pz.y + pz.h * 0.25), 3, Math.round(pz.h * 0.5));
}
function render() {
  if (mode === 'title') {
    drawBackground(tick, tick);
    draw(pic('ui/logo', 'logo'), W / 2, 56 + Math.round(Math.sin(tick * 0.04) * 2));
    const wx = ((tick * 1.2) % (W + 120)) - 60;   // 横切る魔女と、ついてくる仲間
    draw(animPic('witch/witch', 'fly', tick), wx, 108 + Math.sin(tick * 0.05) * 6);
    ['ghost', 'bat', 'pumpkin'].forEach((k, i) => draw(animPic(EDEF[k].ref, 'move', tick), wx - 26 - i * 18, 108 + Math.sin((tick - (i + 1) * 12) * 0.05) * 6));
    text('HAPPY HALLOWEEN!', W / 2, 84, 'or4', 'center');
    text('SELECT DIFFICULTY', W / 2, 126, 'lilac', 'center');
    DIFFICULTY_BUTTONS.forEach((b, i) => {
      const on = DIFFICULTY_ORDER[i] === difficulty;
      rect(b.x, b.y, b.w, b.h, on ? 'night4' : 'night2');
      rect(b.x, b.y, b.w, 1, on ? 'amber' : 'night4'); rect(b.x, b.y + b.h - 1, b.w, 1, on ? 'amber' : 'night4');
      text(DIFFICULTIES[DIFFICULTY_ORDER[i]].name, b.x + b.w / 2, b.y + 9, on ? 'amber' : 'lilac', 'center');
    });
    text(touchMode ? 'TAP A DIFFICULTY' : 'ARROWS SELECT  Z CONFIRM', W / 2, 176, 'white', 'center');
    if (!touchMode) text('ARROWS MOVE  Z BOMB  P PAUSE', W / 2, 190, 'gy4', 'center');
    text('FEED THE GHOSTS - TREAT!', W / 2, 205, 'pk2', 'center');
    text('CATCH THE HAPPY ONES - NEW FRIENDS!', W / 2, 216, 'gr4', 'center');
    text(`HI ${String(hi).padStart(7, '0')}`, W / 2, 231, 'ye3', 'center');
    if (muted) text('SOUND OFF', 4, 230, 'gy3');
    return;
  }
  const g = G, t = g.t;
  drawBackground(t, g.scroll);
  for (const e of g.enemies) drawEnemy(e);
  if (g.boss) drawBoss(g.boss, t);
  for (const f of g.friends) drawFriend(f, t);
  for (const c of g.candies) drawCandy(c, t);
  if (!(g.over && g.over > 60)) drawWitch(g.w, t);
  for (const f of g.fx) drawFx(f);
  if (!g.over && !g.clear) drawCatchHints(t);
  if (g.rain > 0) drawRain(g.rain);
  for (const tx of g.texts) {
    if (tx.life - tx.t < 10 && tx.t % 2) continue;
    text(tx.s, tx.x, tx.y, tx.col, 'center', tx.big ? 2 : 1);
  }
  drawHud();
  if (g.bossIntro > 0 && Math.floor(g.bossIntro / 15) % 2 === 0) { text('HERE COMES', W / 2, 80, 'or4', 'center', 2); text(BOSSES[STAGES[g.stage].boss].name, W / 2, 100, 'or4', 'center', 2); }
  if (g.t < 150 && !g.jumpBoss) { text(STAGES[g.stage].name, W / 2, 90, 'white', 'center', 2); text(STAGES[g.stage].sub, W / 2, 112, 'or4', 'center'); }
  if (g.over > 60) {
    const left = g.over - 60;
    if (left < CONTINUE_T) {
      text('CONTINUE?', W / 2, 90, 'or4', 'center', 2);
      text(String(9 - Math.floor(left / (CONTINUE_T / 10))), W / 2, 112, 'white', 'center', 2);
      text(touchMode ? 'TAP TO CONTINUE' : 'PRESS Z', W / 2, 136, 'gy5', 'center');
    } else {
      text('GAME OVER', W / 2, 96, 'pu5', 'center', 2);
      if (left > CONTINUE_T + 60) text(touchMode ? 'TAP TO TITLE' : 'PRESS Z', W / 2, 124, 'white', 'center');
    }
  }
  if (g.clear > 120) { text(STAGES[g.stage].name, W / 2, 90, 'white', 'center', 2); text('CLEAR!', W / 2, 110, 'or4', 'center', 2); }
  if (g.ending > 200) {
    text('HAPPY HALLOWEEN!', W / 2, 96, 'or4', 'center', 2);
    text(`TREATED ${g.treats}  FRIENDS ${g.friends.filter((f) => !f.leaving).length}/12`, W / 2, 120, 'pk2', 'center');
    if (g.continues) text(`CONTINUES ${g.continues}`, W / 2, 132, 'gy5', 'center');
    text(rules().name, W / 2, 144, 'lilac', 'center');
    if (g.ending > 360) text(touchMode ? 'TAP TO TITLE' : 'PRESS Z', W / 2, 164, 'white', 'center');
  }
  if (mode === 'pause') {
    rect(100, 92, 120, 50, 'nt1'); rect(100, 92, 120, 1, 'pu3'); rect(100, 141, 120, 1, 'pu3');
    text('PAUSE', W / 2, 100, 'white', 'center', 2);
    text(touchMode ? 'TAP TO RESUME' : 'P RESUME  Q TITLE', W / 2, 124, 'gy5', 'center');
  }
}

// ---- ループ（1/60 秒ずつ進める）----
let acc = 0, last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  acc += Math.min(100, now - last);
  last = now;
  let n = 0;
  while (acc >= 1000 / 60 && n < 4) {
    update();
    for (const k in pressed) pressed[k] = false;
    acc -= 1000 / 60; n++;
  }
  render();
  drawPad();
}
requestAnimationFrame(frame);
window.__WT = { get G() { return G; }, get mode() { return mode; } };   // 確かめ用
