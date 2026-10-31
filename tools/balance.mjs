// 実際の game.js を描画と音だけ省いて回す。node tools/balance.mjs [--measure]
// 自動操作の秒数は比較用。人が避けながら遊んだときの難しさ・クリア率は表さない。
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export function game(search = '') {
  const noop = () => {};
  const drawing = new Proxy({}, { get: (o, k) => o[k] ?? noop, set: (o, k, v) => (o[k] = v, true) });
  const canvas = () => ({ width: 0, height: 0, style: {}, getContext: () => drawing, addEventListener: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 240 }) });
  const storage = new Map([['witchs-treat-mute', '1']]);
  const context = vm.createContext({ console, URLSearchParams, location: { search },
    document: { getElementById: canvas, createElement: canvas },
    localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)) },
    matchMedia: () => ({ matches: false }), innerWidth: 960, innerHeight: 720, addEventListener: noop,
    visualViewport: { addEventListener: noop }, performance: { now: () => 0 }, requestAnimationFrame: noop, setTimeout: noop });
  context.window = context;
  vm.runInContext(readFileSync(root + 'src/art.js', 'utf8'), context);
  vm.runInContext(readFileSync(root + 'game.js', 'utf8'), context);
  const run = (source) => vm.runInContext(source, context);
  run(`let testSeed = 1; Math.random = () => { testSeed = (Math.imul(testSeed, 1664525) + 1013904223) >>> 0; return testSeed / 4294967296; };
    function step() { update(); for (const k in pressed) pressed[k] = false; }
    function setup(d = 'normal', si = 0) { difficulty = d; mode = 'play'; debugInv = false; newGame(); startStage(si); G.practice = true; }
    function bossSetup(d, si) { setup(d, si); G.t = STAGES[si].len; G.spawnI = stageWaveList(si).length; startBoss();
      Object.assign(G.boss, { x: BOSSES[G.boss.kind].hx, state: 'fight', t: 0 }); }
  `);
  return { run, storage };
}

function verify() {
  const { run, storage } = game();
  assert.equal(run('difficulty'), 'normal');
  assert.equal(run('DEBUG || debugInv'), false);
  run(`pointerDown({preventDefault(){},clientX:65,clientY:153,pointerType:'touch'}, false)`);
  assert.equal(run('difficulty'), 'easy');
  assert.equal(run('mode'), 'play');
  assert.equal(run('G.difficulty === "easy" && G.bombs === 3'), true);
  run('toTitle(); pressed.ArrowRight = true; step()');
  assert.equal(run('difficulty'), 'normal');
  assert.equal(storage.get('witchs-treat-difficulty'), 'normal');
  assert.equal(run('mode'), 'title');
  run('pressed.KeyZ = true; step(); step()');
  assert.equal(run('G.difficulty === "normal" && G.bombs === 2'), true);
  assert.equal(game('?difficulty=hard').run('difficulty'), 'hard');
  assert.equal(game('?difficulty=wrong').run('difficulty'), 'normal');
  assert.equal(game('?debug').run('DEBUG && !debugInv'), true);
  assert.equal(game('?inv').run('debugInv'), true);
  assert.equal(game('?friends=999').run(`newGame(); G.friends.every(f => f.lv === 5)`), true);
  for (const d of ['easy', 'normal', 'hard']) {
    run(`setup('${d}'); G.w.inv = 0; trick()`);
    assert.equal(run('G.lives'), { easy: 4, normal: 2, hard: 2 }[d]);
    run(`G.friends = [{kind:'ghost',lv:1,exp:0}]; G.w.inv = 0; trick()`);
    assert.equal(run('!!G.friends[0].leaving'), d !== 'easy');
    run(`G.w.inv = 0; G.lives = 1; trick()`);
    assert.equal(run('G.over'), 1);
    run(`bossSetup('${d}', 0); G.boss.hp = 81; G.over = 1; var timeBefore = G.t;
      for(let i=0;i<90;i++) step()`);
    assert.equal(run('G.t === timeBefore && G.boss.hp === 81'), true);
    run('continueGame()');
    assert.equal(run('G.lives'), { easy: 5, normal: 3, hard: 3 }[d]);
    assert.equal(run('G.boss.hp === 81 && G.difficulty === difficulty'), true);
    // ワープ・折り返しも含め、全員の両方の技が終わり、その後に隙があること。
    for (let si = 0; si < 4; si++) {
      for (let variant = 1; variant <= 2; variant++) {
        run(`bossSetup('${d}', ${si}); Object.assign(G.boss, {attackN:${variant}, target:{x:60,y:120}});
          G.boss.move = BOSS_MOVE[G.boss.kind].attack(G.boss, false);
          var motionFrames = 0; var finite = true;
          while(G.boss.move && motionFrames++ < 1000) { updateBoss(); finite &&= Number.isFinite(G.boss.x) && Number.isFinite(G.boss.y); }`);
        assert.equal(run('finite && motionFrames < 1000 && G.boss.next > G.boss.t'), true, `${d}/${si}/${variant}`);
      }
      // 仲間の人数やレベルでゲージを増やさない。
      run(`bossSetup('${d}', ${si}); var fixedHp = G.boss.max; G.friends = Object.keys(EDEF).map(kind => ({kind,lv:5})); startBoss()`);
      assert.equal(run('G.boss.max === fixedHp'), true);
    }
    for (let si = 0; si < 4; si++) {
      run(`setup('${d}',${si}); G.enemies = []; for(const [,spawnWave] of stageWaveList(${si})) spawnWave()`);
      assert.equal(run('G.enemies.filter(e => e.kind === "bigghost").length'), si < 3 ? 1 : 0);
      assert.equal(run('G.enemies.every(e => Number.isFinite(e.x) && Number.isFinite(e.y))'), true);
    }
  }
  // 回転するお菓子の待ち時間と、貫通する引っかきの同じボスへの重複を守る。
  run(`bossSetup('normal',0); G.boss.next = 999999; G.boss.hp = G.boss.max = 1000;
    G.candies = [{x:G.boss.x,y:G.boss.y,kind:'claw',dmg:2,t:0,vx:0,vy:0,big:14,pierce:9,life:18}];
    G.w.hitT = 50; for(let i=0;i<4;i++) step()`);
  assert.equal(run('G.boss.hp'), 998);
  run(`bossSetup('normal',0); G.boss.hp = G.boss.max = 1000; G.boss.next = 999999;
    G.w.x = G.boss.x; G.w.y = G.boss.y; G.w.inv = 9999; G.w.hitT = 50;
    G.candies = [{x:0,y:0,kind:'macaron',dmg:1,t:0,vx:0,vy:0,orbit:0,pierce:99,life:100}];
    for(let i=0;i<19;i++) step()`);
  assert.equal(run('G.boss.hp'), 1000);
  // 通しの進行。満足させてクリア・次の面・最後のエンディングまで。
  run(`setup(); for(let si=0;si<4;si++){ startBoss(); bossSatisfied(); if(si<3) { for(let i=0;i<331;i++) step(); } }`);
  assert.equal(run('G.stage === 3 && G.ending > 0'), true);
  run(`setup(); G.practice = false; G.score = 123; step()`);
  assert.equal(storage.get('witchs-treat-hi-normal'), '123');
  run(`setup('hard'); G.score = 9999; step()`);
  assert.equal(storage.has('witchs-treat-hi-hard'), false);
  run(`setup(); G.practice = false; G.continues = 1; G.score = 8888; step()`);
  assert.equal(storage.get('witchs-treat-hi-normal'), '123');
  console.log('OK: 難易度の操作・保存、残りと仲間、コンティニュー停止、全24通りのボス技、当たり判定、4面の進行、記録の分離');
}

function measure() {
  const { run } = game();
  const report = run(`(()=>{
    const out = [];
    for(const d of DIFFICULTY_ORDER) {
      const waves = STAGES.map((_,si)=>{ setup(d,si); for(const [,fn] of stageWaveList(si))fn(); return G.enemies.length; });
      for(const party of ['solo','friends']) {
        const times=[[],[],[],[]];
        for(const seed of [11,97,1234,8191,65537]) {
        for(let si=0;si<4;si++) {
          testSeed=seed+si; bossSetup(d,si); debugInv=true;
          // 魔女だけ / よく集まる4種類の lv1。捕獲とボムは使わず、低レベルで届くかを比較。
          if(party==='friends') G.friends=['ghost','bat','skull','wisp'].map(kind=>({kind,lv:1,exp:0,cd:0,x:40,y:110,t:0,heal:VAMP_HEAL(1)}));
          addFriend = () => {};
          const begin=G.t;
          while(G.t-begin<60*180&&!G.clear&&!G.ending) {
            const b=G.boss;
            keys.ArrowUp=G.w.y>b.y+3; keys.ArrowDown=G.w.y<b.y-3;
            step();
          }
          times[si].push(Math.round((G.t-begin)/6)/10);
        }
        }
        const range = ts => Math.min(...ts) + '-' + Math.max(...ts);
        out.push({difficulty:d,party,spawns:waves.join('/'),king:range(times[0]),queen:range(times[1]),count:range(times[2]),moon:range(times[3]),slowest:Math.max(...times.flat())});
      }
    }
    return out;
  })()`);
  console.table(report);
  assert.ok(report.every((r) => r.slowest < 180), '3分以内に全ボスを満足させられること');
  console.log('秒数は乱数5通りの範囲。無敵・縦追尾の自動操作（ボムと新規捕獲なし）で、通しのクリア率は表しません。');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  verify();
  if (process.argv.includes('--measure')) measure();
}
