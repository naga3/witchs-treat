#!/usr/bin/env node
// BGM（music/<名前>.song。PX-13h Music で編集）を、PX-13h の音源（Music と同じ engine.wasm）で鳴らして書き出す。
//   audio/<名前>.ogg と、ゲームが読む src/bgm.js（ogg を base64 で埋めたもの。index.html をそのまま開いても鳴るように）
//   node tools/audio.mjs            全部
//   node tools/audio.mjs stage boss 指定したものだけ（src/bgm.js は、ほかの曲は今の audio/*.ogg から作り直す）
// Music で保存すると動く（music/group.json の after）。PX-13h の場所は環境変数 PX13H（既定は ../../px13h）。ffmpeg が要る
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join, resolve } from 'path'

// peak は書き出すときの音の大きさ（0〜1）、loop は繰り返すか（ゲームで 1 周分を切れ目なく回す）
const BGM = {
  stage: { peak: 0.5, loop: true },   // 1 面（町）の道中（タイトルでも流す）
  grave: { peak: 0.5, loop: true },   // 2 面（墓地）の道中
  mansion: { peak: 0.5, loop: true }, // 3 面（おばけ屋敷）の道中
  sky: { peak: 0.5, loop: true },     // 最後の面（満月の空）の道中
  last: { peak: 0.55, loop: true },   // ラスボス（月のおばけ）
  boss: { peak: 0.55, loop: true },   // 面のボス戦（王様かぼちゃ・クモの女王・吸血鬼の伯爵）
  clear: { peak: 0.55, loop: false }, // ボスを倒したとき
  over: { peak: 0.5, loop: false },   // ゲームオーバー
}

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const px = resolve(process.env.PX13H || join(root, '../../px13h'))
const { Engine } = await import(join(px, 'tools/music/web/engine.js'))
const { parseSong, compose, analyze, buildTracks, engineSong } = await import(join(px, 'tools/music/web/song.js'))
const { defaultEnvelopes } = await import(join(px, 'tools/music/lib.js'))
const wasm = readFileSync(join(px, 'tools/music/web/engine.wasm'))
const OUT = join(root, 'audio')
const RATE = 48000
mkdirSync(OUT, { recursive: true })

async function render(S, loop, seconds) {
  const e = await Engine.load(wasm)
  e.setSong(engineSong(S.song, buildTracks(S.song, S.composed, S.a, -Infinity, Infinity, loop), defaultEnvelopes()))
  e.play()
  const chunks = []
  let n = 0
  const limit = (seconds || 60) * RATE
  while (n < limit && (loop || e.playing())) {
    chunks.push(Int16Array.from(e.render(800)))
    n += 800
  }
  const all = new Int16Array(n)
  let o = 0
  for (const c of chunks) { all.set(c, o); o += c.length }
  return all
}
// 繰り返しの 1 周分を取り出す。2 周目を切り出すので、1 周目の余韻が頭に重なって、つなぎ目が自然になる
async function renderLoop(S) {
  const period = Math.round(((S.composed.bars.length * 4 * 60) / S.song.tempo) * RATE)
  return (await render(S, true, (period * 2 + 2400) / RATE)).slice(period, period * 2)
}
function trimSilence(s) {
  let end = s.length
  while (end > 0 && Math.abs(s[end - 1]) < 60) end--
  return s.slice(0, Math.min(s.length, end + 480))
}
function normalize(s, peak) {
  let p = 0
  for (const v of s) p = Math.max(p, Math.abs(v))
  const g = p ? (peak * 32767) / p : 1
  return Int16Array.from(s, (v) => Math.round(v * g))
}
function writeOgg(name, s) {
  const data = Buffer.from(s.buffer, s.byteOffset, s.byteLength)
  const h = Buffer.alloc(44)
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12)
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28)
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40)
  const wav = `/tmp/witchs-treat-${name}.wav`
  writeFileSync(wav, Buffer.concat([h, data]))
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libvorbis', '-q:a', '3', join(OUT, `${name}.ogg`)])
  unlinkSync(wav)
  console.log(`audio/${name}.ogg  ${(s.length / RATE).toFixed(2)} 秒`)
}
// 曲を読む。書き間違い・長さのずれがあれば止める。選んだ候補（.picks.json）も当てはめる
function loadSong(name) {
  const file = join(root, 'music', `${name}.song`)
  const song = parseSong(readFileSync(file, 'utf8'))
  const pf = file.replace(/\.song$/, '.picks.json')
  const composed = compose(song, existsSync(pf) ? JSON.parse(readFileSync(pf, 'utf8')) : {})
  const a = analyze(song, composed)
  const errors = [...song.errors, ...a.errors]
  if (errors.length) { console.error(`${name}.song:\n  ${errors.join('\n  ')}`); process.exit(1) }
  return { song, composed, a }
}

const want = process.argv.slice(2)
for (const [name, def] of Object.entries(BGM)) {
  if (want.length && !want.includes(name)) continue
  if (!existsSync(join(root, 'music', `${name}.song`))) { console.log(`music/${name}.song が無いので飛ばす`); continue }
  const S = loadSong(name)
  writeOgg(name, normalize(def.loop ? await renderLoop(S) : trimSilence(await render(S, false)), def.peak))
}
// src/bgm.js: { 名前: { loop, data（ogg の base64） } }
const lines = Object.entries(BGM).filter(([n]) => existsSync(join(OUT, `${n}.ogg`)))
  .map(([n, d]) => `  ${n}: { loop: ${d.loop}, data: '${readFileSync(join(OUT, `${n}.ogg`)).toString('base64')}' },`)
writeFileSync(join(root, 'src/bgm.js'), `// BGM（tools/audio.mjs が music/*.song から作る。手で直さない）\nwindow.BGM = {\n${lines.join('\n')}\n};\n`)
console.log(`src/bgm.js: ${lines.length} 曲`)
