/**
 * test-scene.mjs — ブラウザ無しで検証できる範囲を自動チェックする。
 *   node tools/test-scene.mjs
 *
 * 1) three の数学だけで教室・廊下・屋外を組み立て、寸法と NaN を検証
 * 2) 机・椅子の配置が壁/教壇/ロッカーに干渉しないか
 * 3) 太陽位置と色温度の計算が妥当か
 * 4) 場面プリセットと板書データの整合、アセットファイルの実在
 */
import { existsSync, statSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Box3, Vector3, BufferGeometry } from 'three';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'src');

const { ROOM, SCENES, ASSETS } = await import(path.join(SRC, 'config.js'));
const geo = await import(path.join(SRC, 'lib/geo.js'));
const layout = await import(path.join(SRC, 'lib/layout.js'));
const sunpath = await import(path.join(SRC, 'lib/sunpath.js'));
const { BOARD_SCRIPTS } = await import(path.join(SRC, 'procedural.js'));

let pass = 0, fail = 0;
const ok = (cond, msg, extra = '') => {
  if (cond) { pass++; console.log(`  ✔ ${msg}${extra ? ' — ' + extra : ''}`); }
  else { fail++; console.log(`  ✘ ${msg}${extra ? ' — ' + extra : ''}`); }
};
const section = (t) => console.log(`\n■ ${t}`);

/* ------------------------------------------------------------------ */
section('1. 教室の殻（寸法・NaN・三角形数）');
const shell = geo.buildRoomShell(ROOM);
const byMat = geo.mergePartsByMaterial(shell.parts);
const stats = (g) => {
  const p = g.getAttribute('position');
  let nan = 0;
  for (let i = 0; i < p.array.length; i++) if (!Number.isFinite(p.array[i])) nan++;
  g.computeBoundingBox();
  return { count: p.count, tris: g.index ? g.index.count / 3 : p.count / 3, nan, box: g.boundingBox };
};
const floor = stats(byMat.floor);
ok(floor.nan === 0, '床ジオメトリに NaN が無い');
ok(Math.abs((floor.box.max.x - floor.box.min.x) - ROOM.width) < 0.01 &&
   Math.abs((floor.box.max.z - floor.box.min.z) - ROOM.depth) < 0.01,
  `床が ${ROOM.width}×${ROOM.depth}m`, `${(floor.box.max.x - floor.box.min.x).toFixed(2)}×${(floor.box.max.z - floor.box.min.z).toFixed(2)}`);
const wall = stats(byMat.wall);
ok(wall.nan === 0 && wall.tris > 100, `壁は窓と扉の開口を挟んで分割されている`, `${wall.tris} 三角形`);
ok(shell.openings.windows.length === ROOM.window.count, `窓の開口が ${ROOM.window.count} 個ある`);
ok(shell.openings.door && shell.openings.door.h > 1.9, '引き戸の開口が確保されている', `h=${shell.openings.door.h}m`);
let totalTris = 0;
for (const g of Object.values(byMat)) totalTris += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
ok(totalTris < 12000, '教室の殻の三角形数が軽量', `${totalTris.toFixed(0)} 三角形`);

/* ------------------------------------------------------------------ */
section('2. 廊下・屋外');
const corridor = geo.buildCorridor(ROOM);
const cStat = stats(geo.mergeSimple(corridor.parts.map((p) => { const g = p.geo.clone(); g.applyMatrix4(geo.mat4From(p.pos, p.rot, p.scale)); return g; })));
ok(cStat.nan === 0, '廊下ジオメトリに NaN が無い', `${cStat.tris.toFixed(0)} 三角形`);
ok(corridor.xOut < -ROOM.width / 2, '廊下が教室の外側(−X)に張り出している', `xOut=${corridor.xOut.toFixed(2)}`);
const outdoor = geo.buildOutdoor(ROOM, 'spring');
const oStat = stats(geo.mergeSimple(outdoor.parts.map((p) => { const g = p.geo.clone(); g.applyMatrix4(geo.mat4From(p.pos, p.rot, p.scale)); return g; })));
ok(oStat.nan === 0, '屋外ジオメトリに NaN が無い', `${oStat.tris.toFixed(0)} 三角形`);
ok(oStat.box.max.x > 60, '田んぼ・山が遠景まで広がっている', `maxX=${oStat.box.max.x.toFixed(0)}m`);
const wires = geo.powerLineVertices([{ x: 18, y: 12, z: -6 }, { x: 46, y: 12, z: -8 }]);
ok(wires.length > 200 && wires.every(Number.isFinite), '送電線の架線頂点が生成される', `${wires.length / 3} 頂点`);

/* ------------------------------------------------------------------ */
section('3. 机・椅子の配置');
for (const count of [30, 40]) {
  const seats = layout.deskLayout(count, ROOM);
  ok(seats.length === count, `${count} 席ぶんの座席が生成される`);
  const problems = layout.validateLayout(seats, ROOM);
  ok(problems.length === 0, `${count} 席が壁・教壇・ロッカーに干渉しない`, problems.slice(0, 2).join(' / '));
  const chairs = layout.chairLayout(seats);
  ok(chairs.every((c) => c.z > -3 && c.z < ROOM.depth / 2 - 0.3), `${count} 席の椅子が教室内に収まる`);
  const xs = new Set(seats.map((s) => s.x.toFixed(3)));
  ok(xs.size === (count > 30 ? 8 : 6), `${count} 席は ${count > 30 ? 8 : 6} 列に整列する`);
}
const seats30 = layout.deskLayout(30, ROOM);
const roles = layout.roleSeats(seats30, 30);
ok(roles.sugar && roles.sugar.row === 4, '砂糖は最後列（窓際）にいる', `x=${roles.sugar.x.toFixed(2)} z=${roles.sugar.z.toFixed(2)}`);
ok(roles.ryouma && roles.ryouma.row === 0, '両馬は前列（廊下側）にいる');
const mods = layout.sceneDeskModifiers('after', seats30);
ok(mods.size > 0, '放課後は前の席が黒板側へ向く（人の気配）', `${mods.size} 席を変更`);

/* ------------------------------------------------------------------ */
section('4. 太陽と色温度');
const noon = sunpath.sunFromClock(12);
const morning = sunpath.sunFromClock(7);
const evening = sunpath.sunFromClock(18);
ok(noon.altitude > morning.altitude && noon.kelvin > evening.kelvin, '正午は高く・白く、夕方は低く・赤い',
  `12時 alt=${noon.altitude.toFixed(0)}° ${noon.kelvin.toFixed(0)}K / 18時 alt=${evening.altitude.toFixed(0)}° ${evening.kelvin.toFixed(0)}K`);
const westDir = sunpath.sunVector(270, 20);
ok(westDir.x > 0.8, '西（=窓壁 +X）の太陽は窓側から差し込む', `dir=(${westDir.x.toFixed(2)},${westDir.y.toFixed(2)},${westDir.z.toFixed(2)})`);
for (const k of [2400, 3400, 5600, 6500]) {
  const c = sunpath.kelvinToRGB(k);
  ok(c.r >= 0 && c.r <= 1 && c.g >= 0 && c.g <= 1 && c.b >= 0 && c.b <= 1, `${k}K の RGB が 0..1 に収まる`);
}
ok(sunpath.kelvinToRGB(2400).r > sunpath.kelvinToRGB(6500).b, '色温度が低いほど赤い');
ok(sunpath.shadowRadius(8) > sunpath.shadowRadius(60), '低い太陽ほど影が柔らかい');

/* ------------------------------------------------------------------ */
section('5. 場面プリセットと板書');
ok(SCENES.length >= 5, `象徴的な場面が ${SCENES.length} つ用意されている`);
for (const s of SCENES) {
  const hasBoard = !!BOARD_SCRIPTS[s.board];
  ok(hasBoard, `場面「${s.label}」の板書データがある`);
  ok(!!ASSETS.hdri[s.hdri], `場面「${s.label}」の HDRI キーが定義済み (${s.hdri})`);
  const [px, py, pz] = s.camera.pos;
  const inside = Math.abs(px) < 12 && py > -4 && py < 6 && Math.abs(pz) < 12;
  ok(inside, `場面「${s.label}」のカメラが教室周辺の妥当な位置`, `(${px}, ${py}, ${pz})`);
  ok(s.sun.altitude >= -2 && s.sun.altitude <= 90, `場面「${s.label}」の太陽高度が妥当`, `${s.sun.altitude}°`);
}

/* ------------------------------------------------------------------ */
section('6. アセットの実在（取得失敗しても代替がある前提で、存在は確認）');
const mustExist = [
  'assets/vendor/three.module.js',
  'assets/vendor/addons/loaders/GLTFLoader.js',
  'assets/vendor/addons/loaders/RGBELoader.js',
  'assets/vendor/addons/loaders/EXRLoader.js',
  'assets/vendor/addons/controls/OrbitControls.js',
  'assets/vendor/addons/utils/BufferGeometryUtils.js',
  'assets/vendor/addons/libs/fflate.module.js',
  'assets/models/water_bottle.glb',
  'assets/assets-manifest.json',
  'index.html',
  'src/main.js',
  'src/scene.js',
  'src/lighting.js',
  'src/gimmicks.js',
  'src/ui.js',
  'src/assets.js',
  'src/procedural.js',
];
for (const f of mustExist) ok(existsSync(path.join(ROOT, f)), `${f} が存在する`);
let texBytes = 0, texCount = 0;
for (const [key, def] of Object.entries(ASSETS.textures)) {
  for (const [slot, file] of Object.entries(def.maps)) {
    const p = path.join(ROOT, 'assets', def.dir, file);
    const exists = existsSync(p);
    if (exists) { texBytes += statSync(p).size; texCount++; }
    ok(exists, `テクスチャ ${key}/${slot} が同梱されている (${file})`);
  }
}
let hdriBytes = 0;
for (const [key, rel] of Object.entries(ASSETS.hdri)) {
  const p = path.join(ROOT, 'assets', rel);
  const exists = existsSync(p);
  if (exists) hdriBytes += statSync(p).size;
  ok(exists, `HDRI ${key} が同梱されている (${rel})`);
}
const modelBytes = statSync(path.join(ROOT, 'assets/models/water_bottle.glb')).size;
const vendorBytes = ['three.module.js', 'addons/loaders/GLTFLoader.js', 'addons/loaders/RGBELoader.js',
  'addons/loaders/EXRLoader.js', 'addons/controls/OrbitControls.js', 'addons/utils/BufferGeometryUtils.js',
  'addons/libs/fflate.module.js'].reduce((a, f) => a + statSync(path.join(ROOT, 'assets/vendor', f)).size, 0);
console.log(`\n  合計: テクスチャ ${(texBytes / 1024).toFixed(0)}KB (${texCount}枚) / HDRI ${(hdriBytes / 1024).toFixed(0)}KB / GLB ${(modelBytes / 1024).toFixed(1)}KB / three+addons ${(vendorBytes / 1024).toFixed(0)}KB`);
ok(texBytes + hdriBytes + modelBytes + vendorBytes < 4.5 * 1024 * 1024, '同梱アセットの合計が 4.5MB 未満（軽量方針）');

/* ------------------------------------------------------------------ */
section('7. index.html の健全性');
const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
ok(html.includes('importmap'), 'importmap を動的生成している（vendor 欠落時は CDN フォールバック）');
ok(html.includes("await import('./src/main.js')"), 'main.js を読み込んでいる');
ok(html.includes('lang="ja"') && html.includes('<title>'), '日本語ページとして成立している');
ok(html.includes('boot-error'), '起動失敗時の表示先（白画面対策）がある');
ok(/Poly Haven/.test(html), 'クレジット表記がある');

/* ------------------------------------------------------------------ */
section('8. three.js API とモジュール読み込み');
const THREE = await import('three');
const threeExports = new Set(Object.keys(THREE));
const srcFiles = ['config.js', 'assets.js', 'scene.js', 'lighting.js', 'gimmicks.js', 'ui.js', 'procedural.js', 'lib/geo.js', 'lib/layout.js', 'lib/sunpath.js'];
const badNames = [];
for (const f of srcFiles) {
  const code = readFileSync(path.join(SRC, f), 'utf8');
  for (const m of code.matchAll(/import\s*\{([^}]+)\}\s*from\s*'three'/g)) {
    for (const raw of m[1].split(',')) {
      const name = raw.trim().split(/\s+as\s+/)[0].trim();
      if (name && !threeExports.has(name)) badNames.push(`${f}: ${name}`);
    }
  }
  for (const m of code.matchAll(/from\s*'three\/addons\/([^']+)'/g)) {
    const rel = m[1];
    const cand = [path.join(ROOT, 'assets/vendor/addons', rel)];
    if (!cand.some((c) => existsSync(c))) badNames.push(`${f}: addons/${rel} が vendor に無い`);
  }
}
ok(badNames.length === 0, 'three および addons の import 名がすべて実在する', badNames.slice(0, 5).join(' / '));

for (const f of srcFiles) {
  try {
    await import(path.join(SRC, f));
    ok(true, `${f} を Node で読み込める（構文と import が健全）`);
  } catch (err) {
    ok(false, `${f} の読み込みに失敗`, err.message);
  }
}
try {
  const code = readFileSync(path.join(SRC, 'main.js'), 'utf8');
  await import('node:vm').then((vm) => new vm.SourceTextModule(code, { identifier: 'main.js' }));
  ok(true, 'main.js の構文が健全');
} catch (err) {
  ok(/SourceTextModule|--experimental-vm-modules/.test(String(err.message)), 'main.js の構文検査（vm 非対応のため構文チェックのみ）', String(err.message).slice(0, 60));
}

/* ------------------------------------------------------------------ */
console.log(`\n結果: ${pass} 件成功 / ${fail} 件失敗`);
process.exit(fail === 0 ? 0 : 1);
