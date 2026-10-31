#!/usr/bin/env node
// 最初の絵（下書き）を art/*.pic に作る。まだ無いファイルだけ作る（Pixel で描き直した絵は上書きしない）。--force で全部作り直す
//   node tools/draft.mjs [--force]
// 形と色の決まりで描く（楕円・多角形・自動の輪郭・顔の型）。描き直しは Pixel（グループ witchs-treat）で
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ART = join(ROOT, 'art')
const FORCE = process.argv.includes('--force')

// 色の表: 名前 → 番号。番号ごとに決まった 1 文字（どの絵でも同じ文字で同じ色。art/GROUP.md の表）
const NAMES = readFileSync(join(ART, 'witchs-treat.gpl'), 'utf8').split('\n').map((l) => /^\s*\d+\s+\d+\s+\d+\s+(\S+)/.exec(l)?.[1]).filter(Boolean)
export const CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ#@'
const C = Object.fromEntries(NAMES.map((n, i) => [n, i]))
for (const l of readFileSync(join(ART, 'witchs-treat.gpl'), 'utf8').split('\n')) { const m = /^# alias (\S+) (\S+)/.exec(l); if (m) C[m[1]] = C[m[2]] }   // 古い名前（64 色の頃）も引ける

// ---- 描く道具 ----
class G {
  constructor(w, h) { this.w = w; this.h = h; this.a = new Int16Array(w * h).fill(-1) }
  in(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h }
  get(x, y) { return this.in(x, y) ? this.a[y * this.w + x] : -1 }
  set(x, y, c) { x = Math.round(x); y = Math.round(y); if (this.in(x, y)) this.a[y * this.w + x] = typeof c === 'string' ? C[c] : c; return this }
  rect(x, y, w, h, c) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c); return this }
  ell(cx, cy, rx, ry, c, only = null) {             // 塗った楕円（only: すでに色のある所だけ）
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const d = ((x - cx) / (rx + 0.5)) ** 2 + ((y - cy) / (ry + 0.5)) ** 2
        if (d <= 1 && (!only || this.get(x, y) >= 0)) this.set(x, y, c)
      }
    return this
  }
  poly(pts, c) {                                    // 塗った多角形
    const ys = pts.map((p) => p[1])
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      const xs = []
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]
        if ((y1 <= y + 0.5 && y2 > y + 0.5) || (y2 <= y + 0.5 && y1 > y + 0.5)) xs.push(x1 + ((y + 0.5 - y1) * (x2 - x1)) / (y2 - y1))
      }
      xs.sort((a, b) => a - b)
      for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.round(xs[i]); x < Math.round(xs[i + 1]); x++) this.set(x, y, c)
    }
    return this
  }
  line(x0, y0, x1, y1, c) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
    for (let i = 0; i <= n; i++) this.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c)
    return this
  }
  // 輪郭: 色のある所のまわり（上下左右）の空きに c を置く
  outline(c = 'ink') {
    const add = []
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.get(x, y) >= 0) continue
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => this.get(x + dx, y + dy) >= 0 && this.get(x + dx, y + dy) !== C[c])) add.push([x, y])
    }
    for (const [x, y] of add) this.set(x, y, c)
    return this
  }
  // 型: 文字の並び（legend で 文字 → 色の名前。. は空き）を x, y に置く
  stamp(rows, legend, x = 0, y = 0) {
    rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch !== '.' && ch !== ' ') this.set(x + i, y + j, legend[ch]) }))
    return this
  }
  // 影: 色 from を、下（右下）側の縁だけ to に（丸みを出す）
  shade(from, to, dx = 1, dy = 1) {
    const f = C[from], hits = []
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.get(x, y) === f && this.get(x + dx, y + dy) !== f && this.get(x + dx, y + dy) !== -2) hits.push([x, y])
    for (const [x, y] of hits) this.set(x, y, to)
    return this
  }
  copy() { const g = new G(this.w, this.h); g.a.set(this.a); return g }
  flipX() { const g = new G(this.w, this.h); for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) g.a[y * this.w + x] = this.a[y * this.w + this.w - 1 - x]; return g }
  rows() { return Array.from({ length: this.h }, (_, y) => Array.from({ length: this.w }, (_, x) => (this.a[y * this.w + x] < 0 ? '.' : CHARS[this.a[y * this.w + x]])).join('')) }
}

// .pic を書く。pics: [[名前, G, 説明]]、anims: { 名前: [[絵, ms], …] }
function pic(ref, title, note, pics, anims = {}) {
  const file = join(ART, `${ref}.pic`)
  if (existsSync(file) && !FORCE) return
  mkdirSync(dirname(file), { recursive: true })
  const used = new Set()
  for (const [, g] of pics) for (const v of g.a) if (v >= 0) used.add(v)
  const lines = [...note.split('\n').map((l) => `# ${l}`), `title ${title}`, 'palette witchs-treat', ...[...used].sort((a, b) => a - b).map((i) => `color ${CHARS[i]} ${i}`)]
  for (const [n, fr] of Object.entries(anims)) lines.push(`anim ${n} ${fr.map(([f, ms]) => `${f}:${ms}`).join(' ')}`)
  for (const [n, g, label] of pics) lines.push('', `pic ${n} ${g.w} ${g.h}${label ? ` "${label}"` : ''}`, ...g.rows().map((r) => `  ${r}`))
  writeFileSync(file, lines.join('\n') + '\n')
  console.log(`art/${ref}.pic`)
}

// 乱数（毎回同じ絵になるように）
let seed = 7
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)

// ---- 魔女（32×24。右向きに飛ぶ。ほうきの穂は左＝うしろ）----
function witch(phase, hit = false) {
  const g = new G(32, 24)
  const fl = phase ? 1 : 0                          // はためき
  // マント（うしろへなびく）
  g.poly([[16, 12], [20, 13], [12, 19 + fl], [6, 17 - fl]], 'pu1')
  // ほうき: 柄と穂
  g.line(3, 17, 30, 15, 'br2').line(3, 18, 30, 16, 'br3')
  g.poly([[0, 13 - fl], [9, 15], [9, 19], [0, 22 + fl]], 'ye1')
  for (let y = 14; y <= 21; y += 2) g.line(1, y + (y > 17 ? fl : -fl), 8, 16 + (y - 14) / 3, 'ye2')
  g.rect(8, 15, 2, 4, 'or2')                        // 穂を縛る紐
  // 服と脚
  g.poly([[15, 12], [22, 12], [23, 17], [14, 17]], 'pu2')
  g.rect(16, 13, 2, 3, 'pu3')
  g.rect(19, 17, 3, 2, 'ink').rect(21, 18, 3, 1, 'ink')   // ブーツ
  g.rect(18, 17, 2, 1, 'pu2')
  // 腕（ほうきを持つ）
  g.rect(22, 13, 3, 2, 'pu2').set(25, 14, 'sn2').set(25, 15, 'sn2')
  // 髪（オレンジ。うしろへ流れる）
  g.poly([[15, 7], [19, 8], [17, 13 + fl], [11, 12 - fl]], 'or3')
  g.line(12, 11 - fl, 16, 9, 'or4')
  // 顔
  g.ell(19, 10, 2.6, 2.4, 'sn2')
  g.set(21, 11, 'sn1').set(18, 12, 'pk1')            // ほお
  if (hit) { g.set(19, 9, 'ink').set(21, 9, 'ink').set(20, 10, 'ink').set(19, 11, 'ink').set(21, 11, 'ink') }   // 目が ×
  else { g.set(20, 9, 'ink').set(20, 10, 'ink').set(21, 9, 'white') }
  // 帽子（とんがり。先はうしろへ）
  const tip = hit ? [6, 0] : [7 - fl, 1]
  g.poly([[14, 8], [24, 8], [19, 3], tip], 'pu2')
  g.line(tip[0] + 1, tip[1] + 1, 18, 4, 'pu3')
  g.rect(13, 7, 12, 2, 'pu1').rect(12, 8, 14, 1, 'pu2')   // つば
  g.rect(15, 6, 7, 1, 'or4')                         // 帽子の帯
  g.set(17, 6, 'ye3')
  g.outline('ink')
  return g
}

// ---- おばけの顔の型（16×16 用）。kind: move・eat・happy ----
function face(g, cx, cy, kind, eye = 'ink', mouth = 'ink') {
  if (kind === 'happy') {                            // 目は ^ ^、ほおは桃色
    for (const ex of [cx - 3, cx + 2]) { g.set(ex, cy, eye).set(ex + 1, cy - 1, eye).set(ex + 2, cy, eye) }
    g.set(cx - 4, cy + 2, 'pk1').set(cx + 4, cy + 2, 'pk1')
    g.set(cx - 1, cy + 2, mouth).set(cx, cy + 3, mouth).set(cx + 1, cy + 2, mouth)
  } else {
    g.rect(cx - 3, cy - 1, 2, 3, eye).rect(cx + 2, cy - 1, 2, 3, eye)
    g.set(cx - 3, cy - 1, 'white').set(cx + 2, cy - 1, 'white')
    if (kind === 'eat') g.rect(cx - 1, cy + 2, 3, 3, mouth).set(cx, cy + 3, 'rd2').set(cx - 4, cy + 2, 'pk1').set(cx + 4, cy + 2, 'pk1')
    else g.rect(cx - 1, cy + 3, 3, 1, mouth)
  }
  return g
}

function ghost(kind, phase = 0, big = false) {
  const s = big ? 1.5 : 1, W = big ? 24 : 16
  const g = new G(W, W)
  const body = big ? 'pu5' : 'white', dark = big ? 'pu4' : 'gy5'
  g.ell(7.5 * s, 6.5 * s, 6 * s, 6 * s, body)
  g.rect(Math.round(1.5 * s), Math.round(6.5 * s), Math.round(12.5 * s), Math.round(5 * s), body)
  for (let x = Math.round(1.5 * s); x < Math.round(14 * s); x++) {   // すその波
    const k = Math.sin((x / s + phase * 2) * 1.2)
    const yy = Math.round(11.5 * s + k * 1.5)
    for (let y = Math.round(11.5 * s); y <= yy; y++) g.set(x, y, body)
  }
  g.ell(10 * s, 9 * s, 4 * s, 4 * s, dark, true).ell(7 * s, 6 * s, 5 * s, 5 * s, body, true)
  g.set(Math.round(4 * s), Math.round(3 * s), 'white').set(Math.round(5 * s), Math.round(3 * s), 'white')
  face(g, Math.round(7.5 * s), Math.round(7 * s), kind)
  if (big && kind !== 'happy') g.set(Math.round(7.5 * s) - 4, Math.round(7 * s) - 2, 'ink').set(Math.round(7.5 * s) + 5, Math.round(7 * s) - 2, 'ink')   // まゆ
  return g.outline(big ? 'pu1' : 'gy3')
}

function bat(kind, up) {
  const g = new G(16, 16)
  if (up) { g.poly([[7, 8], [1, 2], [0, 6], [3, 9]], 'pu1').poly([[9, 8], [15, 2], [16, 6], [13, 9]], 'pu1') }
  else { g.poly([[7, 8], [0, 11], [2, 13], [5, 11]], 'pu1').poly([[9, 8], [16, 11], [14, 13], [11, 11]], 'pu1') }
  g.ell(8, 9, 3.4, 3.4, 'nt3')
  g.poly([[5, 6], [6, 3], [7, 6]], 'nt3').poly([[9, 6], [10, 3], [11, 6]], 'nt3')   // 耳
  if (kind === 'happy') { g.set(6, 9, 'pk2').set(7, 8, 'pk2').set(9, 8, 'pk2').set(10, 9, 'pk2').set(8, 11, 'pk1') }
  else { g.set(6, 8, 'rd3').set(7, 8, 'rd3').set(9, 8, 'rd3').set(10, 8, 'rd3'); if (kind === 'eat') g.rect(7, 10, 3, 2, 'ink').set(8, 11, 'rd2'); else g.set(7, 11, 'white').set(9, 11, 'white') }
  return g.outline('ink')
}

function pumpkin(kind, W = 16, mood = 'move') {
  const g = new G(W, W), s = W / 16
  const cx = W / 2 - 0.5, cy = W / 2 + s
  g.ell(cx, cy, 7 * s, 6 * s, 'or3')
  g.ell(cx - 3.5 * s, cy, 3 * s, 5.6 * s, 'or4', true).ell(cx + 3.5 * s, cy, 3 * s, 5.6 * s, 'or2', true).ell(cx, cy, 2.4 * s, 5.8 * s, 'or3', true)
  g.rect(Math.round(cx - s), Math.round(cy - 7 * s), Math.round(2 * s), Math.round(2.4 * s), 'gr2').set(Math.round(cx + s), Math.round(cy - 7 * s), 'gr3')
  const glow = 'ye3', ey = Math.round(cy - 2 * s), mx = Math.round(cx)
  if (kind === 'happy') {
    const t = Math.max(1, Math.round(s / 2))            // 線の太さ（大きいかぼちゃは太く）
    for (const ex of [mx - 4 * s, mx + 2 * s]) for (let k = 0; k < t; k++) { g.line(ex, ey + s + k, ex + s, ey + k, 'or0').line(ex + s, ey + k, ex + 2 * s, ey + s + k, 'or0') }   // 目は ^ ^
    for (let i = -3 * s; i <= 3 * s; i++) for (let k = 0; k < t; k++) g.set(mx + i, ey + 3 * s + Math.round((1 - (i / (3 * s)) ** 2) * 2 * s) + k, 'or0')   // にっこりの口
    g.ell(mx - 5 * s, ey + 3 * s, s, s * 0.6, 'pk1').ell(mx + 5 * s, ey + 3 * s, s, s * 0.6, 'pk1')   // ほお
  } else {
    for (const ex of [mx - 4 * s, mx + 2 * s]) g.poly([[ex, ey + 2 * s], [ex + 1 * s, ey - s], [ex + 2.5 * s, ey + 2 * s]], glow)   // 三角の目
    if (kind === 'eat') g.ell(mx, ey + 5 * s, 2.5 * s, 2 * s, 'or1').ell(mx, ey + 5 * s, 1.5 * s, 1 * s, 'rd2')
    else { g.rect(mx - 3 * s, ey + 4 * s, 7 * s, 2 * s, glow); for (let i = -2; i <= 2; i += 2) g.set(mx + i * s, ey + 4 * s, 'or1') }   // ぎざぎざの口
    if (mood === 'angry') { g.line(mx - 5 * s, ey - 2 * s, mx - 2 * s, ey - s, 'or0').line(mx + 4 * s, ey - 2 * s, mx + 1 * s, ey - s, 'or0') }
  }
  return g.outline('or0')
}

function skull(kind) {
  const g = new G(16, 16)
  g.ell(7.5, 6.5, 6, 5.5, 'bn3').rect(4, 10, 8, 3, 'bn3').ell(9.5, 8, 4, 4, 'bn2', true).ell(6.5, 5.5, 4, 4, 'bn3', true)
  if (kind === 'happy') { face(g, 8, 7, 'happy', 'ink', 'ink') }
  else {
    g.ell(5, 7, 1.6, 1.6, 'ink').ell(10, 7, 1.6, 1.6, 'ink').set(5, 7, 'mg').set(10, 7, 'mg').set(7, 9, 'gy3').set(8, 9, 'gy3')
    if (kind === 'eat') g.rect(5, 12, 6, 3, 'ink').rect(5, 14, 6, 1, 'bn2').set(7, 13, 'rd2')
    else for (let x = 5; x <= 10; x += 2) g.set(x, 11, 'gy3')
  }
  return g.outline('ink')
}

function wisp(kind, phase) {
  const g = new G(16, 16), f = phase ? 1 : 0
  g.ell(8, 10, 5, 4.5, 'cy2').poly([[3, 9], [8 - f, 0], [13, 9]], 'cy2').ell(8, 11, 3, 3, 'cy3', true)
  g.set(5 + f, 3, 'cy3').set(10 - f, 2, 'cy2')
  face(g, 8, 10, kind, 'nt2', 'nt2')
  return g.outline('cy1')
}

// ---- 追加のおばけ（16×16）----
function cat(kind, phase) {                         // 黒猫（ほうきの切れ端に乗って飛ぶ）
  const g = new G(16, 16), f = phase ? 1 : 0
  g.line(1, 13, 14, 12, 'br2').poly([[11, 10 - f], [16, 11], [16, 14], [11, 14 + f]], 'ye1')   // ほうき（穂は右＝うしろ）
  g.ell(8, 9, 4.5, 3.5, 'nt2').ell(5, 6, 3.5, 3.2, 'nt2')
  g.poly([[2, 4], [3, 0], [5, 3]], 'nt2').poly([[6, 3], [8, 0], [8, 4]], 'nt2').set(3, 2, 'pk1').set(7, 2, 'pk1')   // 耳
  g.line(12, 8, 14, 4 - f, 'nt2').line(13, 8, 15, 4 - f, 'nt2')   // しっぽ
  if (kind === 'happy') { g.set(3, 6, 'ye3').set(4, 5, 'ye3').set(6, 5, 'ye3').set(7, 6, 'ye3').set(5, 8, 'pk1') }
  else { g.set(3, 5, 'gr4').set(3, 6, 'gr4').set(6, 5, 'gr4').set(6, 6, 'gr4'); if (kind === 'eat') g.rect(4, 8, 2, 2, 'rd2'); else g.set(5, 8, 'pk1') }
  return g.outline('ink')
}
function crow(kind, up) {                           // カラス
  const g = new G(16, 16)
  if (up) g.poly([[7, 8], [12, 1], [14, 3], [10, 9]], 'sk2'); else g.poly([[7, 9], [12, 14], [14, 12], [10, 8]], 'sk2')
  g.ell(8, 9, 4.5, 2.8, 'sk3').ell(4, 7, 2.6, 2.4, 'sk3').poly([[13, 8], [16, 6], [16, 11]], 'sk3')   // 体・頭・尾（夜空に沈まない青みの黒）
  g.line(5, 8, 10, 8, 'fg1')
  g.poly([[0, 7], [2, 6], [2, 8]], 'ye2')                                                            // くちばし
  if (kind === 'happy') g.set(3, 6, 'ye3').set(4, 5, 'ye3').set(5, 6, 'ye3').set(4, 9, 'pk1')
  else { g.set(3, 6, 'ye3'); if (kind === 'eat') g.poly([[0, 8], [2, 8], [2, 10]], 'rd2') }
  if (up) g.line(9, 7, 12, 2, 'fg1'); else g.line(9, 10, 12, 13, 'fg1')
  return g.outline('ink')
}
function spider(kind) {                             // クモ（上から糸で降りてくる）
  const g = new G(16, 16)
  for (const [x0, x1, y1] of [[5, 0, 6], [5, 0, 11], [5, 1, 15], [10, 15, 6], [10, 15, 11], [10, 14, 15]]) g.line(x0, 9, x1, y1, 'nt1')
  g.ell(7.5, 9, 4, 3.6, 'pu1').ell(7.5, 8, 2.6, 2.2, 'pu2', true).set(7, 0, 'gy5').line(7, 0, 7, 5, 'gy5')
  face(g, 8, 9, kind, kind === 'happy' ? 'pk2' : 'rd3', 'pk1')
  return g.outline('ink')
}
function mummy(kind) {                              // ミイラ（ふわふわ漂う）
  const g = new G(16, 16)
  g.ell(7.5, 7, 5.5, 6, 'bn3').rect(3, 7, 9, 7, 'bn3')
  for (let y = 2; y < 15; y += 3) g.line(2, y, 13, y + 1, 'bn2')
  g.line(12, 11, 15, 14, 'bn3').line(13, 11, 15, 13, 'bn2')                                         // ほどけた包帯
  g.rect(3, 5, 10, 4, 'gy1')                                                                        // 目のすき間
  if (kind === 'happy') { g.set(4, 7, 'ye3').set(5, 6, 'ye3').set(6, 7, 'ye3').set(9, 7, 'ye3').set(10, 6, 'ye3').set(11, 7, 'ye3') }
  else { g.rect(4, 6, 2, 2, 'gr4').rect(9, 6, 2, 2, 'gr4'); if (kind === 'eat') g.rect(6, 10, 3, 3, 'ink').set(7, 11, 'rd2') }
  return g.outline('br1')
}
function candle(kind, phase) {                      // ろうそくお化け
  const g = new G(16, 16), f = phase ? 1 : 0
  g.rect(4, 6, 8, 9, 'bn3').ell(5, 6, 1, 2, 'bn3').rect(11, 7, 1, 4, 'bn2').rect(4, 14, 8, 1, 'bn2')
  g.ell(6, 15, 3, 1, 'bn2')                                                                         // とけたろう
  g.line(8, 5, 8, 3, 'ink').poly([[6, 3], [8 + f, -1], [10, 3]], 'or3').ell(8, 2.5, 1, 1.2, 'ye3')  // 芯と炎
  face(g, 8, 9, kind, 'nt2', 'nt2')
  return g.outline('br1')
}
function vampire(kind) {                            // 吸血鬼の子（マント）
  const g = new G(16, 16)
  g.poly([[8, 6], [0, 15], [16, 15]], 'nt1').poly([[8, 7], [3, 15], [13, 15]], 'rd1')                // マント
  g.ell(8, 6, 4, 4, 'gy5').ell(8, 6, 4, 4, 'bn3', true)                                              // 顔（白い）
  g.poly([[4, 3], [8, 1], [12, 3], [8, 4]], 'nt1')                                                  // 髪（とがった前髪）
  g.poly([[2, 7], [4, 4], [5, 8]], 'nt1').poly([[14, 7], [12, 4], [11, 8]], 'nt1')                   // えり
  if (kind === 'happy') { g.set(6, 6, 'ink').set(7, 5, 'ink').set(9, 5, 'ink').set(10, 6, 'ink').set(5, 8, 'pk1').set(11, 8, 'pk1').set(8, 8, 'ink') }
  else { g.set(6, 6, 'rd2').set(10, 6, 'rd2'); if (kind === 'eat') g.rect(7, 8, 3, 2, 'ink').set(8, 9, 'rd2'); else g.set(7, 9, 'white').set(9, 9, 'white') }
  return g.outline('ink')
}
function wand() {                                   // ボムの印（星の杖）
  const g = new G(9, 9)
  g.line(1, 8, 5, 4, 'br3').poly([[6, 0], [7, 2], [9, 3], [7, 4], [6, 6], [5, 4], [3, 3], [5, 2]], 'ye3').set(6, 3, 'white')
  return g.outline('ink')
}

// ---- 王様かぼちゃ（ボス 64×64）----
function king(kind) {
  const g = pumpkin(kind === 'happy' ? 'happy' : kind === 'eat' ? 'eat' : 'move', 56, kind === 'angry' ? 'angry' : 'move')
  const big = new G(64, 64)
  for (let y = 0; y < 56; y++) for (let x = 0; x < 56; x++) { const v = g.get(x, y); if (v >= 0) big.set(x + 4, y + 8, v) }
  // 王冠
  big.poly([[20, 12], [44, 12], [46, 2], [39, 8], [32, 0], [25, 8], [18, 2]], 'ye2').rect(20, 10, 24, 3, 'ye1')
  big.set(32, 4, 'rd3').set(25, 9, 'cy2').set(39, 9, 'gr3').set(32, 10, 'mg')
  if (kind === 'angry') for (let i = 0; i < 40; i++) { const x = 8 + Math.floor(rnd() * 48), y = 20 + Math.floor(rnd() * 40); if (big.get(x, y) === C.or3) big.set(x, y, 'rd2') }
  return big.outline('ink')
}

// ---- 2 面のボス: クモの女王（56×48）----
function queen(kind) {
  const g = new G(56, 48)
  for (const [ax, ay, bx, by, cx, cy] of [[22, 26, 8, 14, 2, 34], [22, 30, 6, 30, 0, 44], [24, 32, 12, 40, 8, 47], [34, 26, 48, 14, 54, 34], [34, 30, 50, 30, 56, 44], [32, 32, 44, 40, 48, 47], [24, 24, 14, 8, 6, 20], [32, 24, 42, 8, 50, 20]]) { g.line(ax, ay, bx, by, 'pu1').line(bx, by, cx, cy, 'pu1').line(ax, ay + 1, bx, by + 1, 'nt2').line(bx, by + 1, cx, cy + 1, 'nt2') }   // 8 本の脚
  g.ell(28, 32, 13, 11, 'pu2').ell(26, 29, 9, 7, 'pu3', true).ell(28, 18, 9, 8, 'pu2').ell(26, 16, 6, 5, 'pu3', true)   // 胴と頭
  for (const [x, y] of [[22, 34], [30, 37], [26, 40], [33, 31]]) g.set(x, y, 'mg')                                       // 背中の模様
  g.poly([[21, 11], [24, 4], [26, 9], [28, 2], [30, 9], [32, 4], [35, 11]], 'ye2').rect(21, 10, 15, 2, 'ye1').set(28, 5, 'rd3')   // 小さな王冠
  g.line(28, 0, 28, 3, 'gy5')                                                                                              // 糸
  if (kind === 'happy') { g.line(22, 17, 24, 15, 'ye3').line(24, 15, 26, 17, 'ye3').line(30, 17, 32, 15, 'ye3').line(32, 15, 34, 17, 'ye3').ell(21, 21, 1.5, 1, 'pk1').ell(35, 21, 1.5, 1, 'pk1').line(26, 22, 30, 22, 'ink') }
  else {
    const eye = kind === 'angry' ? 'rd3' : 'mg'
    for (const [x, y] of [[23, 16], [33, 16], [26, 14], [30, 14]]) g.rect(x - 1, y - 1, 3, 3, 'ink').set(x, y, eye)
    if (kind === 'eat') g.ell(28, 22, 3, 2.4, 'ink').set(28, 22, 'rd2'); else g.set(26, 22, 'white').set(30, 22, 'white')   // 牙
  }
  return g.outline('ink')
}
// ---- 3 面のボス: 吸血鬼の伯爵（48×56）----
function count(kind) {
  const g = new G(48, 56)
  g.poly([[24, 14], [0, 30], [4, 40], [10, 34], [14, 54], [24, 46], [34, 54], [38, 34], [44, 40], [48, 30]], 'nt1').poly([[24, 18], [8, 34], [14, 50], [24, 44], [34, 50], [40, 34]], 'rd1')   // 広げたマント
  g.rect(17, 20, 14, 24, 'nt2').rect(22, 20, 4, 14, 'white').set(24, 24, 'rd2')                                         // 服とえり
  g.ell(24, 13, 8, 9, 'bn3').ell(25, 14, 6, 7, 'gy5', true)                                                               // 顔
  g.poly([[15, 9], [24, 1], [33, 9], [24, 7]], 'nt1').poly([[16, 10], [18, 4], [20, 10]], 'nt1').poly([[28, 10], [30, 4], [32, 10]], 'nt1')   // 髪
  g.poly([[13, 16], [16, 10], [18, 18]], 'rd1').poly([[35, 16], [32, 10], [30, 18]], 'rd1')                               // 立ったえり
  if (kind === 'happy') { g.line(19, 12, 21, 10, 'ink').line(21, 10, 23, 12, 'ink').line(25, 12, 27, 10, 'ink').line(27, 10, 29, 12, 'ink').ell(18, 16, 1.5, 1, 'pk1').ell(30, 16, 1.5, 1, 'pk1').line(22, 18, 26, 18, 'ink') }
  else {
    const eye = kind === 'angry' ? 'rd3' : 'rd2'
    g.rect(19, 11, 3, 2, eye).rect(26, 11, 3, 2, eye).line(18, 9, 22, 10, 'ink').line(30, 9, 26, 10, 'ink')
    if (kind === 'eat') g.ell(24, 18, 2.5, 2, 'ink').set(24, 18, 'rd2'); else g.rect(21, 18, 6, 1, 'ink').set(22, 19, 'white').set(25, 19, 'white')   // 牙
  }
  return g.outline('ink')
}
// ---- ラスボス: 月のおばけ（80×80）----
function moonGhost(kind, phase = 0) {
  const g = new G(80, 80)
  for (let i = 0; i < 5; i++) { const x0 = 18 + i * 11, w = 4 + (i % 2) * 2; g.poly([[x0, 52], [x0 + w * 2, 52], [x0 + w + Math.sin(i + phase) * 4, 78]], 'pu5') }   // 下にゆれる、おばけのすそ
  g.ell(40, 36, 30, 30, kind === 'angry' ? 'or4' : 'ye3').ell(44, 40, 26, 26, kind === 'angry' ? 'or3' : 'ye2', true).ell(36, 32, 22, 22, kind === 'angry' ? 'or5' : 'ye4', true)
  for (const [x, y, r] of [[22, 22, 4], [56, 50, 5], [30, 56, 3], [60, 24, 3]]) g.ell(x, y, r, r, kind === 'angry' ? 'or3' : 'ye2').ell(x - 0.5, y - 0.5, r - 1.2, r - 1.2, kind === 'angry' ? 'or4' : 'ye3', true)   // クレーター
  if (kind === 'happy') { for (const ex of [26, 46]) { g.line(ex, 34, ex + 4, 30, 'ink').line(ex + 4, 30, ex + 8, 34, 'ink') } g.ell(24, 42, 3, 2, 'pk1').ell(56, 42, 3, 2, 'pk1'); for (let x = 32; x <= 48; x++) g.set(x, 44 + Math.round(Math.sin(((x - 32) / 16) * Math.PI) * 4), 'ink') }
  else {
    const eye = kind === 'angry' ? 'rd2' : 'ink'
    g.ell(30, 33, 4, 5, eye).ell(50, 33, 4, 5, eye).set(29, 31, 'white').set(49, 31, 'white').set(30, 31, 'white').set(50, 31, 'white')
    if (kind === 'angry') g.line(24, 25, 34, 28, 'ink').line(56, 25, 46, 28, 'ink')
    if (kind === 'eat') g.ell(40, 46, 6, 5, 'ink').ell(40, 47, 3, 2, 'rd2'); else g.ell(40, 46, 5, 1.5, 'ink')
  }
  return g.outline('pu2').outline('ink')
}

// ---- お菓子（弾）----
function wrapped(col, light, flip) {
  const g = new G(10, 6)
  g.ell(4.5, 2.5, 2.6, 2.2, col).set(3, 1, light).set(4, 1, light)
  g.poly([[0, flip ? 1 : 0], [2, 2], [0, flip ? 5 : 4]], 'white').poly([[9, flip ? 0 : 1], [7, 2], [9, flip ? 4 : 5]], 'white')
  return g.outline('ink')
}
function lolli(phase) {
  const g = new G(9, 9)
  g.ell(4, 3.5, 3.4, 3.4, 'white')
  for (let a = 0; a < 6.28 * 2; a += 0.3) { const r = a / 4, k = a + phase * 1.6; g.set(4 + Math.cos(k) * r, 3.5 + Math.sin(k) * r, 'rd2') }
  g.line(4, 7, 4, 8, 'bn2')
  return g.outline('ink')
}
function bigLolli(phase) {                          // 魔女のお菓子（12×12）: 大きめの渦巻きのペロペロキャンディ
  const g = new G(12, 12)
  g.ell(5.5, 4.5, 4.6, 4.6, 'white')
  for (let a = 0; a < 6.28 * 2.2; a += 0.22) { const r = a / 3, k = a + phase * 1.57; g.set(5.5 + Math.cos(k) * r, 4.5 + Math.sin(k) * r, 'rd2'); g.set(5.5 + Math.cos(k + 0.1) * r, 4.5 + Math.sin(k + 0.1) * r, 'pk1') }
  g.set(4, 2, 'pk3').set(3, 3, 'pk3')
  g.rect(5, 10, 2, 2, 'bn2').set(5, 10, 'bn3')
  return g.outline('ink')
}
// 仲間のお菓子（種類ごとに違うお菓子）
function marshmallow() { const g = new G(8, 7); g.rect(1, 1, 6, 5, 'white').rect(1, 1, 6, 1, 'pk3').rect(1, 4, 6, 2, 'pk2').rect(0, 2, 1, 3, 'white').rect(7, 2, 1, 3, 'pk2'); return g.outline('gy3') }
function gummy() { const g = new G(7, 8); g.ell(3, 5, 2.6, 2.4, 'pu4').ell(3, 2, 2, 1.8, 'pu4').set(1, 0, 'pu4').set(5, 0, 'pu4').set(2, 2, 'pu1').set(4, 2, 'pu1').set(2, 4, 'pu5').set(1, 5, 'pu5'); return g.outline('pu1') }
function cupcake() { const g = new G(9, 9); g.poly([[1, 4], [8, 4], [7, 9], [2, 9]], 'pk1').line(3, 5, 3, 8, 'rd2').line(5, 5, 5, 8, 'rd2'); g.ell(4.5, 3, 3.6, 2.2, 'or4').ell(4, 2.5, 2, 1.2, 'or5', true).set(4, 0, 'rd3').set(2, 3, 'pu4').set(6, 2, 'gr4'); return g.outline('ink') }
function jellybean() { const g = new G(7, 5); g.ell(3, 2, 3, 1.8, 'cy2').set(2, 1, 'cy3').set(3, 1, 'cy3').set(3, 3, 'cy1'); return g.outline('nt3') }
function cookie() { const g = new G(9, 9); g.ell(4, 4, 4, 4, 'br4').ell(4, 4, 3, 3, 'bn3', true); g.set(3, 3, 'ink').set(5, 3, 'ink').set(4, 5, 'ink').set(3, 6, 'gy3').set(5, 6, 'gy3'); return g.outline('br1') }
function caramel() { const g = new G(6, 6); g.rect(0, 0, 6, 6, 'br3').rect(1, 1, 3, 2, 'br4').rect(4, 3, 2, 3, 'br2'); return g.outline('br0') }
function macaron() { const g = new G(9, 7); g.ell(4, 1.8, 4, 1.8, 'pk1').ell(4, 5.2, 4, 1.6, 'pk1').rect(0, 3, 9, 1, 'white').set(2, 1, 'pk3').set(3, 1, 'pk3'); return g.outline('rd1') }
function corn() {
  const g = new G(6, 7)
  g.poly([[0, 0], [6, 0], [3, 7]], 'ye2').rect(0, 0, 6, 2, 'white').poly([[1, 4], [5, 4], [3, 7]], 'or3')
  return g
}
function choco(phase) {
  const g = new G(9, 6)
  g.rect(0, 0, 9, 6, 'br2').rect(1, 1, 3, 2, 'br3').rect(5, 1, 3, 2, 'br3').rect(1, 3, 3, 2, 'br1').rect(5, 3, 3, 2, 'br1')
  if (phase) g.rect(0, 0, 3, 6, 'cy2').set(1, 2, 'cy3')   // 銀紙
  return g
}

// ---- 演出 ----
function heart(c = 'pk1') { return new G(7, 6).stamp(['.x.x..', 'xxxxx.', 'xxxxx.', '.xxx..', '..x...'].map((r) => r + '.'), { x: c }).set(1, 1, 'white') }
function sparkle(n) {
  const g = new G(7, 7), r = [1, 3, 2][n]
  g.line(3 - r, 3, 3 + r, 3, 'ye3').line(3, 3 - r, 3, 3 + r, 'ye3').set(3, 3, 'white')
  return g
}
function poof(n) {
  const g = new G(14, 14), r = [3, 5, 6][n]
  for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.28 + n; g.ell(7 + Math.cos(a) * r * 0.7, 7 + Math.sin(a) * r * 0.7, r * 0.45, r * 0.45, n === 2 ? 'gy3' : 'gy4') }
  if (n < 2) g.ell(7, 7, r * 0.5, r * 0.5, 'gy5')
  return g
}
function seedPic() { return new G(4, 4).stamp(['.y..', 'yYy.', '.yo.', '..o.'], { y: 'bn3', Y: 'white', o: 'or2' }) }
function orb(n) { const g = new G(6, 6).ell(2.5, 2.5, 2.4, 2.4, n ? 'pu4' : 'mg').ell(2, 2, 1, 1, 'pk3'); return g.outline(n ? 'pu1' : 'pu2') }
function flame(n) { const g = new G(6, 7).ell(2.5, 4.5, 2, 2, 'or3').poly([[1, 4], [3 - n, 0], [5, 4]], 'or3').ell(2.5, 4.8, 1, 1, 'ye3'); return g }
function bag(n) {                                  // お菓子の袋（パワーアップ）
  const g = new G(14, 14)
  g.ell(7, 8.5, 5.2, 5, 'or3').ell(5.5, 7.5, 3, 3, 'or4', true).rect(5, 2, 4, 2, 'or2').poly([[3, 1], [5, 3], [9, 3], [11, 1]], 'or4')
  g.rect(4, 4, 6, 1, n ? 'mg' : 'pu3')              // リボン
  g.set(6, 8, 'ink').set(8, 8, 'ink').rect(5, 10, 5, 1, 'ink').set(6, 11, 'ye3').set(8, 11, 'ye3')   // かぼちゃの顔の袋
  return g.outline('ink')
}
function webPic() { const g = new G(7, 7); g.line(0, 3, 6, 3, 'gy5').line(3, 0, 3, 6, 'gy5').line(1, 1, 5, 5, 'gy4').line(5, 1, 1, 5, 'gy4'); for (const r of [1, 2]) for (let a = 0; a < 6.28; a += 0.8) g.set(3 + Math.cos(a) * r * 1.4, 3 + Math.sin(a) * r * 1.4, 'white'); return g }
function waxPic() { return new G(4, 5).ell(1.5, 3, 1.5, 1.5, 'bn3').set(1, 0, 'bn3').set(1, 1, 'bn3').set(2, 3, 'bn2') }
function bandagePic() { const g = new G(10, 4); g.rect(0, 1, 10, 2, 'bn3'); for (let x = 1; x < 10; x += 3) g.set(x, 1, 'bn2'); return g.outline('br1') }
function redPic() { return new G(6, 6).ell(2.5, 2.5, 2.4, 2.4, 'rd2').ell(2, 2, 1, 1, 'pk2').outline('rd0') }
function hat(c = 'pu2') { return new G(9, 8).poly([[0, 7], [9, 7], [5, 2], [2, 0]], c).rect(0, 6, 9, 2, 'pu1').rect(2, 5, 5, 1, 'or4').outline('ink') }

// ---- 背景（すべて左右の端がつながる）----
const BW = 320
function dither(g, x, y, a, b, k) { g.set(x, y, (x + y) % 2 === 0 || k > 0.75 ? (k > 0.25 ? b : a) : a) }
function skyPiece(top) {                            // 夜空（上下 2 枚。合わせて 320×240）
  const g = new G(BW, 120)
  const bands = ['nt1', 'nt1', 'nt2', 'nt2', 'nt3', 'nt3', 'nt4', 'sk2']
  for (let y = 0; y < 120; y++) {
    const Y = (top ? y : y + 120) / 240 * (bands.length - 1), i = Math.floor(Y), k = Y - i
    for (let x = 0; x < BW; x++) {
      const a = bands[i], b = bands[Math.min(bands.length - 1, i + 1)]
      g.set(x, y, k > 0.66 && (x + y) % 2 === 0 ? b : k > 0.33 && (x % 2 === 0 && y % 2 === 0) ? b : a)
    }
  }
  seed = top ? 11 : 23
  for (let i = 0; i < (top ? 110 : 50); i++) {      // 星
    const x = Math.floor(rnd() * BW), y = Math.floor(rnd() * 120), big = rnd() < 0.12
    g.set(x, y, rnd() < 0.5 ? 'gy5' : 'fg2')
    if (big) g.set(x, y, 'ye4').set(x - 1, y, 'fg2').set(x + 1, y, 'fg2').set(x, y - 1, 'fg2').set(x, y + 1, 'fg2')
  }
  if (top) {                                         // 満月
    const mx = 248, my = 50
    for (let r = 30; r > 24; r -= 2) g.ell(mx, my, r, r, r > 27 ? 'nt4' : 'nt5', true)
    g.ell(mx, my, 22, 22, 'ye3').ell(mx + 4, my + 4, 19, 19, 'ye2', true).ell(mx - 3, my - 3, 17, 17, 'ye4', true)
    for (const [x, y, r] of [[mx - 8, my - 6, 4], [mx + 7, my + 2, 5], [mx - 2, my + 10, 3], [mx + 10, my - 10, 2]]) g.ell(x, y, r, r, 'ye2').ell(x - 0.5, y - 0.5, r - 1, r - 1, 'ye3', true)
    // 月の前を飛ぶコウモリの影
    for (const [x, y] of [[226, 40], [236, 46], [262, 34]]) g.poly([[x, y], [x - 4, y - 3], [x - 2, y], [x, y + 1], [x + 2, y], [x + 4, y - 3]], 'nt1')
  }
  return g
}
// 丘の線（320 で 1 周するなめらかな線）
const wave = (x, amps) => amps.reduce((s, [a, k, p]) => s + a * Math.sin((x / BW) * 6.283 * k + p), 0)
function far() {                                    // 遠くの丘と、おばけ屋敷の影（320×80）
  const g = new G(BW, 80)
  for (let x = 0; x < BW; x++) { const top = Math.round(48 + wave(x, [[8, 1, 0.3], [5, 3, 1.2], [2, 7, 2]])); for (let y = top; y < 80; y++) g.set(x, y, 'nt2') }
  // 屋敷: 塔が 3 つ
  const hx = 120, base = 48
  g.rect(hx, base - 22, 40, 30, 'nt1').rect(hx - 10, base - 34, 12, 42, 'nt1').rect(hx + 36, base - 40, 12, 48, 'nt1').rect(hx + 16, base - 30, 8, 10, 'nt1')
  g.poly([[hx - 12, base - 34], [hx - 4, base - 48], [hx + 4, base - 34]], 'nt2').poly([[hx + 34, base - 40], [hx + 42, base - 56], [hx + 50, base - 40]], 'nt2').poly([[hx + 14, base - 30], [hx + 20, base - 40], [hx + 26, base - 30]], 'nt2')
  for (const [x, y] of [[hx - 6, base - 26], [hx + 40, base - 30], [hx + 8, base - 14], [hx + 28, base - 14], [hx + 18, base - 4]]) g.rect(x, y, 2, 3, rnd() < 0.5 ? 'ye1' : 'or3')
  // 枯れ木
  for (const tx of [30, 230, 285]) { const b = Math.round(48 + wave(tx, [[8, 1, 0.3], [5, 3, 1.2], [2, 7, 2]])); g.line(tx, b, tx, b - 18, 'nt2').line(tx, b - 10, tx - 6, b - 16, 'nt2').line(tx, b - 13, tx + 5, b - 20, 'nt2').line(tx - 3, b - 13, tx - 5, b - 19, 'nt2') }
  return g
}
function town() {                                   // 町の屋根（320×100）
  const g = new G(BW, 100)
  seed = 31
  let x = 0
  while (x < BW) {
    const w = 26 + Math.floor(rnd() * 22), h = 34 + Math.floor(rnd() * 30), col = rnd() < 0.5 ? 'nt4' : 'pu1', roof = rnd() < 0.5 ? 'nt2' : 'nt1'
    const top = 100 - h, ww = Math.min(w, BW - x)
    g.rect(x, top, ww, h, col)
    const rh = 10 + Math.floor(rnd() * 8)
    g.poly([[x - 2, top], [x + ww / 2, top - rh], [x + ww + 2, top]], roof)
    if (rnd() < 0.6 && ww > 20) g.rect(x + ww - 9, top - rh + 2, 4, rh, roof)   // 煙突
    for (let wy = top + 8; wy < 92; wy += 12) for (let wx = x + 5; wx + 4 < x + ww - 2; wx += 10) if (rnd() < 0.6) g.rect(wx, wy, 4, 5, rnd() < 0.3 ? 'or3' : 'ye2').rect(wx + 2, wy, 1, 5, col).rect(wx, wy + 2, 4, 1, col)
    if (rnd() < 0.4 && ww > 20) g.ell(x + ww / 2, top + 6, 3, 3, 'or3')   // 丸窓のかぼちゃ
    x += ww
  }
  return g
}
function grave() {                                  // 墓地（320×100）: 墓石・十字・柵・枯れ木。左右の端は低い土
  const g = new G(BW, 100)
  for (let x = 0; x < BW; x++) { const top = Math.round(84 + wave(x, [[3, 2, 0], [2, 5, 1]])); for (let y = top; y < 100; y++) g.set(x, y, 'nt2') }
  seed = 47
  // 大きな枯れ木
  for (const tx of [60, 220]) {
    g.poly([[tx - 4, 100], [tx - 2, 40], [tx + 2, 40], [tx + 5, 100]], 'nt1')
    for (const [dx, dy, ex, ey] of [[0, 52, -22, 30], [0, 46, 18, 22], [0, 60, 24, 48], [-10, 40, -18, 24], [10, 32, 16, 18]]) g.line(tx + dx, dy, tx + ex, ey, 'nt1').line(tx + dx + 1, dy, tx + ex + 1, ey, 'nt1')
  }
  for (let i = 0; i < 9; i++) {
    const x = 14 + i * 34 + Math.floor(rnd() * 10), base = Math.round(84 + wave(x, [[3, 2, 0], [2, 5, 1]]))
    if (rnd() < 0.35) { g.rect(x + 3, base - 22, 3, 22, 'gy3').rect(x - 1, base - 16, 11, 3, 'gy3').rect(x + 4, base - 22, 1, 22, 'gy4') }
    else { const h = 14 + Math.floor(rnd() * 8); g.rect(x, base - h, 12, h, 'gy3').ell(x + 5.5, base - h, 6, 4, 'gy3').rect(x + 1, base - h, 2, h, 'gy4').rect(x + 3, base - h + 4, 6, 1, 'gy2').rect(x + 3, base - h + 7, 6, 1, 'gy2') }
  }
  for (let x = 0; x < BW; x += 8) { g.rect(x, 74, 1, 14, 'nt1').set(x, 73, 'nt1') }   // 柵
  g.rect(0, 78, BW, 1, 'nt1')
  return g
}
function mansion() {                                // 屋敷の庭（320×100）: 鉄の門と生け垣、遠くの窓
  const g = new G(BW, 100)
  g.rect(0, 70, BW, 30, 'gr0')
  for (let x = 0; x < BW; x++) { const t = Math.round(66 + wave(x, [[2, 8, 0], [1, 20, 1]])); for (let y = t; y < 76; y++) g.set(x, y, 'gr1') }
  // 石の柱と鉄の柵
  for (let px = 20; px < BW; px += 80) {
    g.rect(px, 30, 12, 70, 'gy2').rect(px - 2, 26, 16, 5, 'gy3').rect(px + 1, 32, 2, 66, 'gy3')
    g.ell(px + 6, 20, 5, 5, 'or3').ell(px + 6, 20, 2, 2, 'ye3').rect(px + 5, 14, 2, 2, 'gr2')   // 柱の上のかぼちゃ
  }
  for (let x = 0; x < BW; x += 6) if ((x - 20) % 80 > 12 || (x - 20) % 80 < 0) { g.rect(x, 40, 1, 40, 'nt1'); g.poly([[x - 1, 40], [x, 36], [x + 1, 40]], 'nt1') }
  g.rect(0, 46, BW, 2, 'nt1').rect(0, 70, BW, 2, 'nt1')
  return g
}
function near(kind) {                               // 手前（320×40）: 草とかぼちゃ・墓石・茂み
  const g = new G(BW, 40)
  for (let x = 0; x < BW; x++) {
    const t = Math.round(24 + wave(x, [[3, 3, 0.5], [2, 9, 1.4], [1, 23, 0.3]]))
    for (let y = t; y < 40; y++) g.set(x, y, y < t + 2 ? 'gr2' : y < t + 6 ? 'gr1' : 'gr0')
    if (x % 3 === 0) g.set(x, t - 1, 'gr2')
    if (x % 7 === 2) g.set(x, t - 2, 'gr3')
  }
  seed = kind === 'town' ? 5 : kind === 'grave' ? 9 : 13
  for (let i = 0; i < 6; i++) {
    const x = 20 + i * 52 + Math.floor(rnd() * 14), t = Math.round(24 + wave(x, [[3, 3, 0.5], [2, 9, 1.4], [1, 23, 0.3]]))
    if (kind === 'grave' && i % 2) g.rect(x, t - 12, 9, 13, 'gy2').ell(x + 4, t - 12, 4.5, 3, 'gy2').rect(x + 1, t - 12, 1, 12, 'gy3')
    else if (kind === 'mansion' && i % 2) g.ell(x + 6, t - 4, 9, 6, 'gr1').ell(x + 4, t - 6, 6, 4, 'gr2', true)
    else {
      g.ell(x + 5, t - 4, 5.5, 4.5, 'or2').ell(x + 3.5, t - 4, 2.5, 4, 'or3', true).ell(x + 7, t - 4, 2, 4, 'or1', true).rect(x + 4, t - 10, 2, 3, 'gr2')
      if (i % 3 === 0) g.poly([[x + 2, t - 6], [x + 3, t - 8], [x + 4, t - 6]], 'ye3').poly([[x + 6, t - 6], [x + 7, t - 8], [x + 8, t - 6]], 'ye3').rect(x + 3, t - 3, 5, 1, 'ye3')
    }
  }
  return g
}

function clouds() {                                 // 満月の空の面: 雲（320×100。下の方ほど多い）
  const g = new G(BW, 100)
  seed = 61
  for (let i = 0; i < 14; i++) {
    const cx = 10 + i * 23 + rnd() * 10, cy = 40 + rnd() * 50, w = 18 + rnd() * 20
    for (let k = 0; k < 4; k++) g.ell(cx + (k - 1.5) * w * 0.35, cy - (k % 2) * 4, w * 0.35, 6 + (k % 2) * 3, 'nt4')
    g.ell(cx - 4, cy - 5, w * 0.3, 3, 'nt5', true)
  }
  for (let x = 0; x < BW; x++) for (let y = 88; y < 100; y++) g.set(x, y, 'nt4')
  return g
}
function roofs() {                                  // 満月の空の面: 手前の屋根と煙突（320×40）
  const g = new G(BW, 40)
  for (let x = 0; x < BW; x++) { const t = 26 + Math.round(Math.abs(((x % 80) - 40) / 6)); for (let y = t; y < 40; y++) g.set(x, y, y < t + 2 ? 'nt3' : 'nt1') }
  for (const x of [30, 110, 190, 270]) g.rect(x, 14, 8, 20, 'nt2').rect(x - 1, 12, 10, 3, 'nt3')
  for (const x of [70, 230]) g.ell(x, 24, 4, 3, 'or3').ell(x, 24, 1.5, 1, 'ye3')   // 屋根の上のかぼちゃ
  return g
}

// ---- 文字（1 文字 6 点幅 × 7。HORIZON ARROW の文字に ' ? + ♥ を足す。白で描き、ゲームが塗り替える）----
const FONT_ORDER = " 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ:!.-/'?+*"
function font() {
  const src = readFileSync(join(ROOT, '../yoko-stg/art/ui/font.pic'), 'utf8').split('\n').filter((l) => /^  /.test(l)).map((l) => l.slice(2))
  const old = ' 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ:!.-/'
  const g = new G(FONT_ORDER.length * 6, 7)
  for (let i = 0; i < old.length; i++) for (let y = 0; y < 7; y++) for (let x = 0; x < 6; x++) if (src[y][i * 6 + x] === 'w') g.set(i * 6 + x, y, 'white')
  const extra = {
    "'": ['..w..', '..w..', '.w...', '.....', '.....', '.....', '.....'],
    '?': ['.www.', 'w...w', '....w', '...w.', '..w..', '.....', '..w..'],
    '+': ['.....', '..w..', '..w..', 'wwwww', '..w..', '..w..', '.....'],
    '*': ['.....', '.w.w.', 'wwwww', 'wwwww', '.www.', '..w..', '.....'],   // ハート
  }
  for (const [ch, rows] of Object.entries(extra)) g.stamp(rows, { w: 'white' }, FONT_ORDER.indexOf(ch) * 6, 0)
  return g
}
// タイトルの文字（大きな文字。文字の絵を 3 倍にして、上から黄 → 橙、紫の輪郭と影）
function logo() {
  const f = font(), text = "WITCH'S TREAT", S = 3
  const W = text.length * 6 * S + 4, g = new G(W, 7 * S + 5)
  const grad = ['ye3', 'ye3', 'ye2', 'ye2', 'or4', 'or4', 'or3']
  for (let i = 0; i < text.length; i++) {
    const k = FONT_ORDER.indexOf(text[i])
    for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) if (f.get(k * 6 + x, y) >= 0) g.rect(2 + (i * 6 + x) * S, 2 + y * S, S, S, grad[y])
  }
  const sh = g.copy()
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (sh.get(x, y) >= 0 && g.get(x + 1, y + 2) < 0) g.set(x + 1, y + 2, 'pu1')
  return g.outline('pu2').outline('ink')
}

// ---- 書き出す ----
const E = (ref, title, note, mk, extra = {}) => pic(ref, title, note, [
  ['move1', mk('move', 0), '動き 1'], ['move2', mk('move', 1), '動き 2'], ['eat', mk('eat', 0), 'お菓子を食べている'], ['happy', mk('happy', 0), '満足して帰っていく'],
  ...(extra.pics ?? []),
], { move: [['move1', 200], ['move2', 200]], ...(extra.anims ?? {}) })

pic('witch/witch', 'witch', 'ほうきに乗った魔女（自機）。右向きに飛ぶ。当たり判定は顔のあたりの小さな点（ゲームが決める）', [
  ['fly1', witch(0), '飛ぶ 1'], ['fly2', witch(1), '飛ぶ 2'], ['hit', witch(0, true), 'いたずらされた（TRICK!）'],
], { fly: [['fly1', 150], ['fly2', 150]] })
E('enemies/ghost', 'ghost', 'ゴースト。ゆらゆら近づく', (k, p) => ghost(k, p))
E('enemies/bigghost', 'bigghost', '大きなゴースト（24×24）。お菓子をたくさん食べないと満足しない。輪の弾を撃つ', (k, p) => ghost(k, p, true))
E('enemies/bat', 'bat', 'コウモリ。群れで波のように飛ぶ', (k, p) => bat(k, p === 0))
E('enemies/pumpkin', 'pumpkin', 'ジャック・オ・ランタン。跳ねながら種を飛ばす', (k, p) => { const g = pumpkin(k); return p ? g : g })
E('enemies/skull', 'skull', '浮かぶガイコツ。狙って紫の玉を撃つ', (k) => skull(k))
E('enemies/wisp', 'wisp', '鬼火。ゆっくり追いかけてくる', (k, p) => wisp(k, p))
E('enemies/cat', 'cat', '黒猫（ほうきの切れ端に乗る）。止まってから一気に突っ込む', (k, p) => cat(k, p))
E('enemies/crow', 'crow', 'カラス。V 字の編隊で急降下する', (k, p) => crow(k, p === 0))
E('enemies/spider', 'spider', 'クモ。上から糸で降りてきて、巣の弾（当たると魔女が遅くなる）', (k) => spider(k))
E('enemies/mummy', 'mummy', 'ミイラ。ふわふわ漂い、包帯を飛ばす', (k) => mummy(k))
E('enemies/candle', 'candle', 'ろうそくお化け。上を漂い、ろうのしずくを下へ落とす', (k, p) => candle(k, p))
E('enemies/vampire', 'vampire', '吸血鬼の子。消えては別の所に現れ、赤い弾を撃つ', (k) => vampire(k))
pic('boss/king', 'king', '王様かぼちゃ（ボス 64×64）。上下に動き、種・コウモリ・炎の輪でいたずらしてくる', [
  ['idle', king('idle'), 'ふだん'], ['angry', king('angry'), '怒っている（体力が半分より下）'], ['eat', king('eat'), 'お菓子を食べた瞬間'], ['happy', king('happy'), '満足した'],
])
pic('candy/candy', 'candy', 'お菓子。魔女のお菓子は pop（大きなペロペロキャンディ、動き pop）だけ。ほかは仲間のお菓子', [
  ['pink1', wrapped('pk1', 'pk3', 0)], ['pink2', wrapped('pk1', 'pk3', 1)], ['blue1', wrapped('cy2', 'cy3', 0)], ['blue2', wrapped('cy2', 'cy3', 1)],
  ['yellow1', wrapped('ye2', 'ye4', 0)], ['yellow2', wrapped('ye2', 'ye4', 1)], ['lolli1', lolli(0)], ['lolli2', lolli(1)], ['corn', corn()], ['choco1', choco(0)], ['choco2', choco(1)],
  ['marshmallow', marshmallow(), 'ゴーストのお菓子'], ['gummy', gummy(), 'コウモリのお菓子'], ['cupcake', cupcake(), 'かぼちゃのお菓子'], ['jellybean', jellybean(), '鬼火のお菓子'],
  ['cookie', cookie(), 'ガイコツのお菓子'], ['caramel', caramel(), 'ろうそくお化けのお菓子'], ['macaron', macaron(), '吸血鬼の子のお菓子'],
  ['pop1', bigLolli(0), '魔女のお菓子 1'], ['pop2', bigLolli(1), '魔女のお菓子 2'], ['pop3', bigLolli(2), '魔女のお菓子 3'], ['pop4', bigLolli(3), '魔女のお菓子 4'],
], { pop: [['pop1', 70], ['pop2', 70], ['pop3', 70], ['pop4', 70]], pink: [['pink1', 80], ['pink2', 80]], blue: [['blue1', 80], ['blue2', 80]], yellow: [['yellow1', 80], ['yellow2', 80]], lolli: [['lolli1', 90], ['lolli2', 90]], choco: [['choco1', 100], ['choco2', 100]] })
pic('fx/fx', 'fx', '演出: ハート（満足）・きらきら・煙・敵の弾（種・紫の玉・炎・巣・ろう・包帯・赤い玉）・残りの帽子・ボムの杖。bag は今は使っていない', [
  ['heart', heart()], ['heart2', heart('rd3')], ['spark1', sparkle(0)], ['spark2', sparkle(1)], ['spark3', sparkle(2)],
  ['poof1', poof(0)], ['poof2', poof(1)], ['poof3', poof(2)], ['seed', seedPic()], ['orb1', orb(0)], ['orb2', orb(1)], ['flame1', flame(0)], ['flame2', flame(1)],
  ['bag1', bag(0)], ['bag2', bag(1)], ['life', hat()], ['wand', wand()], ['web', webPic()], ['wax', waxPic()], ['bandage', bandagePic()], ['red', redPic()],
], { spark: [['spark1', 60], ['spark2', 60], ['spark3', 60]], poof: [['poof1', 70], ['poof2', 70], ['poof3', 90]], orb: [['orb1', 100], ['orb2', 100]], flame: [['flame1', 90], ['flame2', 90]], bag: [['bag1', 250], ['bag2', 250]] })
pic('boss/queen', 'queen', 'クモの女王（2 面のボス 56×48）。上から糸でぶら下がり、子グモを撒き、魔女めがけて降りてくる', [
  ['idle', queen('idle'), 'ふだん'], ['angry', queen('angry'), '怒っている'], ['eat', queen('eat'), 'お菓子を食べた瞬間'], ['happy', queen('happy'), '満足した'],
])
pic('boss/count', 'count', '吸血鬼の伯爵（3 面のボス 48×56）。消えては現れ、コウモリに分かれて飛び、マントで体当たり', [
  ['idle', count('idle'), 'ふだん'], ['angry', count('angry'), '怒っている'], ['eat', count('eat'), 'お菓子を食べた瞬間'], ['happy', count('happy'), '満足した'],
])
pic('boss/moon', 'moon', '月のおばけ（ラスボス 80×80）。満月が顔を出したおばけ。すべてのおばけを呼び出す', [
  ['idle', moonGhost('idle', 0), 'ふだん'], ['angry', moonGhost('angry', 1), '怒っている'], ['eat', moonGhost('eat', 0), 'お菓子を食べた瞬間'], ['happy', moonGhost('happy', 0), '満足した'],
])
pic('bg/sky', 'sky', '夜空（動かない）。上の top と下の bottom で 320×240', [['top', skyPiece(true), '上半分'], ['bottom', skyPiece(false), '下半分']])
pic('bg/far', 'far', '遠くの丘とおばけ屋敷の影（とてもゆっくり流れる）。左右の端がつながる', [['far', far()]])
pic('bg/mid', 'mid', '中の景色（ゆっくり流れる）。1 面 town（町）、2 面 grave（墓地）、3 面 mansion（屋敷の庭）、最後の面 sky（満月の空の雲）。どれも左右の端がつながる', [['town', town()], ['grave', grave()], ['mansion', mansion()], ['sky', clouds()]])
pic('bg/near', 'near', '手前（速く流れる）。中の景色に合わせて town・grave・mansion・sky（屋根）。左右の端がつながる', [['town', near('town')], ['grave', near('grave')], ['mansion', near('mansion')], ['sky', roofs()]])
pic('ui/font', 'font', `文字。1 文字 6 点幅（5 点＋すき間）× 7。並びはゲームの FONT_ORDER（"${FONT_ORDER}"。* はハート）\n白で描く。ゲームが色を塗り替えて使う`, [['font', font()]])
pic('ui/logo', 'logo', 'タイトルの文字 WITCH\'S TREAT', [['logo', logo()]])
