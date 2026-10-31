#!/usr/bin/env node
// art/（PX-13h Pixel のグループ witchs-treat）の絵を、ゲームが読む src/art.js にする。Pixel で保存すると動く（art/group.json の after）
//   node tools/art.mjs
//   art/witchs-treat.gpl: 色の表（ゲームも Pixel もここを読む）
//   art/<フォルダー>/<名前>.pic: 絵。ゲームは「フォルダー/名前」と絵の名前で引く（ART.pics['enemies/ghost'].pics.move1）
// 候補（名前に ~ の付く絵）と、空の絵は入れない
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join, dirname, relative } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ART = join(ROOT, 'art')

const palette = [], names = {}
for (const line of readFileSync(join(ART, 'witchs-treat.gpl'), 'utf8').split('\n')) {
  const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)/.exec(line), a = /^# alias (\S+) (\S+)/.exec(line)
  if (m) { names[m[4]] = palette.length; palette.push('#' + [m[1], m[2], m[3]].map((v) => (+v).toString(16).padStart(2, '0')).join('')) }
  if (a) names[a[1]] = names[a[2]]                   // 古い名前（64 色の頃）も、今の色の番号で引ける
}

function readPic(file) {
  const doc = { palette: null, colors: {}, pics: {}, anims: {} }
  let cur = null
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.replace(/\s+$/, '')
    if (/^\s/.test(line) && line.trim()) { if (cur) cur.push(line.trim()); continue }
    cur = null
    let m
    if ((m = /^palette\s+(\S+)$/.exec(line))) doc.palette = m[1]
    else if ((m = /^color\s+(\S)\s+(\d+)$/.exec(line))) doc.colors[m[1]] = +m[2]
    else if ((m = /^anim\s+(\S+)\s+(.+)$/.exec(line))) {
      const fr = m[2].trim().split(/\s+/).map((f) => /^([A-Za-z_][A-Za-z0-9_]*)(?::(\d+))?$/.exec(f)).filter(Boolean)
      doc.anims[m[1]] = { frames: fr.map((x) => x[1]), ms: fr.map((x) => Math.max(10, Math.min(5000, +(x[2] ?? 120)))) }
    }
    else if ((m = /^pic\s+(\S+)\s+(\d+)\s+(\d+)/.exec(line))) doc.pics[m[1]] = cur = []
  }
  return doc
}

const files = []
const walk = (dir) => {
  for (const f of readdirSync(dir).sort()) {
    if (f.startsWith('.')) continue
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p)
    else if (f.endsWith('.pic')) files.push(p)
  }
}
walk(ART)

const out = {}
const errors = []
for (const file of files) {
  const ref = relative(ART, file).slice(0, -4)
  const doc = readPic(file)
  if (doc.palette !== 'witchs-treat') errors.push(`${ref}: palette witchs-treat の行が要る`)
  const one = { colors: {}, pics: {}, anims: doc.anims }
  for (const [name, rows] of Object.entries(doc.pics)) {
    if (name.includes('~') || rows.every((r) => /^\.*$/.test(r))) continue
    if (rows.some((r) => r.length !== rows[0].length)) { errors.push(`${ref} の ${name}: 行の長さがそろっていない`); continue }
    for (const ch of new Set(rows.join(''))) {
      if (ch === '.') continue
      if (!(ch in doc.colors) || !palette[doc.colors[ch]]) errors.push(`${ref} の ${name}: 色の決まっていない文字 ${ch}`)
      else one.colors[ch] = doc.colors[ch]
    }
    one.pics[name] = rows
  }
  out[ref] = one
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1) }

const text = `// 絵（tools/art.mjs が art/*.pic と art/witchs-treat.gpl から作る。手で直さない。絵は PX-13h Pixel のグループ witchs-treat で描く）\n` +
  `window.ART = {\n  palette: ${JSON.stringify(palette)},\n  names: ${JSON.stringify(names)},\n  pics: {\n` +
  Object.entries(out).map(([k, v]) => `    '${k}': ${JSON.stringify(v)},`).join('\n') + `\n  },\n};\n`
const dest = join(ROOT, 'src/art.js')
if (!existsSync(dest) || readFileSync(dest, 'utf8') !== text) {
  writeFileSync(dest, text)
  console.log(`src/art.js: ${Object.keys(out).length} ファイル、${Object.values(out).reduce((n, v) => n + Object.keys(v.pics).length, 0)} 枚`)
}
