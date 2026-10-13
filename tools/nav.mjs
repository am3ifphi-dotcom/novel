/**
 * tools/nav.mjs — 一人称（歩行）モードの回帰テスト
 *
 *   node tools/nav.mjs
 *
 * 確認すること:
 *   [1] 当たり判定が机・教卓・棚・自販機・壁から生成されている
 *   [2] 視点プリセットの「立ち位置」がどこにも埋まっていない
 *   [3] 教室と廊下がつながっている（前扉を通って自販機まで歩ける）
 *   [4] 机の列の間を通り抜けられる（＝探索が成立する）
 *   [5] 主要な目的地（黒板／窓際最後列／棚／教卓／自販機）へ到達できる
 */
import { installDom } from './canvas-mock.mjs';
installDom();

const THREE = await import('three');
const { buildWorld } = await import('../src/world.js');
const { buildFurniture } = await import('../src/furniture.js');
const { buildProps } = await import('../src/props.js');
const { makeMaterials } = await import('../src/assets.js');
const { sunDirection } = await import('../src/util.js');
const { TIMES, VIEWS, ROOM, DESK, CORRIDOR } = await import('../src/spec.js');
const { buildColliders, createNav, EYE_STAND, PLAYER_R } = await import('../src/nav.js');

let failures = 0;
const ok = (cond, msg) => {
  console.log(`  ${cond ? '✔' : '✖'} ${msg}`);
  if (!cond) failures++;
};

/* ---------------- 組み立て ---------------- */
const procedural = {
  woodFloor: (rx, ry) => (await0 => await0)(null), // 置換用ダミー
};
void procedural;
const TX = await import('../src/textures.js');
const M = makeMaterials({ textures: {} }, {
  woodFloor: (rx, ry) => TX.woodFloorTexture(256, [rx, ry]),
  plaster: (rx, ry) => TX.plasterTexture(256, [rx, ry]),
  ceilingTex: (rx, ry) => TX.ceilingTexture(256, [rx, ry]),
  wood: (rx, ry) => TX.woodTexture(256, [rx, ry]),
  metal: (rx, ry) => TX.metalTexture(128, [rx, ry]),
  fabric: (rx, ry) => TX.fabricTexture(128, [rx, ry]),
  grayNoise: (rx, ry, bias, contrast) => TX.grayNoiseTexture(128, [rx, ry], bias, contrast),
  normalNoise: (rx, ry, s, d) => TX.normalFromNoise(128, [rx, ry], s, d),
  concrete: (rx, ry) => TX.concreteTexture(128, [rx, ry]),
});

const T = TIMES.find((x) => x.id === 'fri5');
const scene = new THREE.Scene();
const world = buildWorld(M, sunDirection(T.sun.elev, T.sun.azi, 12));
const furniture = buildFurniture(M);
const props = buildProps(M, {});
scene.add(world.root, furniture.root, props.root);
scene.updateMatrixWorld(true);

const colliders = buildColliders({ furniture, world });

console.log('=== [1] 当たり判定の生成 ===');
const byTag = {};
colliders.forEach((b) => { byTag[b.tag] = (byTag[b.tag] || 0) + 1; });
console.log('  内訳:', Object.entries(byTag).map(([k, v]) => `${k}=${v}`).join(' / '));
ok(colliders.length > 30, `当たり判定が生成された（${colliders.length} 件）`);
ok((byTag['机'] || 0) >= 29, `机の当たり判定が29件以上（${byTag['机'] || 0} 件）`);
ok((byTag['教卓'] || 0) === 1, '教卓の当たり判定が1件');
ok((byTag['棚'] || 0) === 1, '棚の当たり判定が1件');
ok((byTag['自販機'] || 0) === 1, '自販機の当たり判定が1件');
ok(colliders.every((b) => [b.x0, b.z0, b.x1, b.z1].every(Number.isFinite)), '全ての箱が有限値');

/* ---------------- 到達性の判定（グリッド BFS） ---------------- */
const STEP = 0.05;
const X0 = CORRIDOR.x1 + 0.05, X1 = ROOM.w / 2 - 0.05;
const Z0 = -ROOM.d / 2 - 0.05, Z1 = ROOM.d / 2 + 0.05;
const NX = Math.ceil((X1 - X0) / STEP) + 1;
const NZ = Math.ceil((Z1 - Z0) / STEP) + 1;

function free(x, z) {
  for (const b of colliders) {
    if (x + PLAYER_R > b.x0 && x - PLAYER_R < b.x1 && z + PLAYER_R > b.z0 && z - PLAYER_R < b.z1) return false;
  }
  return true;
}
const idx = (i, j) => j * NX + i;
const seen = new Uint8Array(NX * NZ);
const near = (x, z) => {
  const i = Math.round((x - X0) / STEP);
  const j = Math.round((z - Z0) / STEP);
  if (i < 0 || j < 0 || i >= NX || j >= NZ) return null;
  return { i, j };
};

// 開始点：教室の中央通路
const start = near(DESK.cols[2] + 0.5, DESK.rows[2]);
const flood = () => {
  seen.fill(0);
  const q = [start];
  seen[idx(start.i, start.j)] = 1;
  let count = 0;
  while (q.length) {
    const p = q.pop();
    count++;
    const x = X0 + p.i * STEP;
    const z = Z0 + p.j * STEP;
    const nb = [
      [p.i + 1, p.j], [p.i - 1, p.j], [p.i, p.j + 1], [p.i, p.j - 1],
      [p.i + 1, p.j + 1], [p.i - 1, p.j - 1], [p.i + 1, p.j - 1], [p.i - 1, p.j + 1],
    ];
    for (const [i, j] of nb) {
      if (i < 0 || j < 0 || i >= NX || j >= NZ) continue;
      if (seen[idx(i, j)]) continue;
      if (!free(X0 + i * STEP, Z0 + j * STEP)) continue;
      seen[idx(i, j)] = 1;
      q.push({ i, j });
    }
    void x; void z;
  }
  return count;
};
const reach = (x, z, r = 0.20) => {
  // 目標点の周囲 r 以内に到達済みのセルがあれば「行ける」
  const rr = Math.ceil(r / STEP);
  const c = near(x, z);
  if (!c) return false;
  for (let dj = -rr; dj <= rr; dj++) {
    for (let di = -rr; di <= rr; di++) {
      const i = c.i + di;
      const j = c.j + dj;
      if (i < 0 || j < 0 || i >= NX || j >= NZ) continue;
      if (seen[idx(i, j)]) return true;
    }
  }
  return false;
};

console.log('=== [2] 視点プリセットの立ち位置 ===');
VIEWS.forEach((v) => {
  const fp = v.fp || { pos: [v.pos[0], EYE_STAND, v.pos[2]] };
  const p = fp.pos;
  const inside = !free(p[0], p[2]);
  ok(!inside, `${v.id}: (${p[0]}, ${p[2]}) は障害物に埋まっていない`);
});

console.log('=== [3] 歩行可能領域（教室 ＋ 廊下） ===');
const count = flood();
const areaM2 = count * STEP * STEP;
console.log(`  到達セル ${count} 件（≒ ${areaM2.toFixed(1)} ㎡）`);
ok(count > 2000, `十分な歩行領域がある（${count} セル）`);

console.log('=== [4] 机の列の間を抜けられるか ===');
// 列方向（X）の隙間：机の中心どうしのちょうど中間を通れるか
let colPass = 0;
for (let c = 0; c < DESK.cols.length - 1; c++) {
  const mx = (DESK.cols[c] + DESK.cols[c + 1]) / 2;
  if (free(mx, DESK.rows[2])) colPass++;
}
ok(colPass >= 5, `列の間（X方向）を抜けられる：${colPass}/${DESK.cols.length - 1}`);
// 行方向（Z）の隙間
let rowPass = 0;
for (let r = 0; r < DESK.rows.length - 1; r++) {
  const mz = (DESK.rows[r] + DESK.rows[r + 1]) / 2 - 0.1;
  if (free(DESK.cols[2], mz)) rowPass++;
}
ok(rowPass >= 4, `行の間（Z方向）を抜けられる：${rowPass}/${DESK.rows.length - 1}`);

console.log('=== [5] 目的地への到達 ===');
const goals = [
  ['黒板の前', -0.45, ROOM.d / 2 * -1 + 0.55],
  ['窓際・最後列（砂糖の席）', DESK.cols[5] - 0.35, DESK.rows[4] + 0.45],
  ['開いた棚の前', -2.35, ROOM.d / 2 - 0.75],
  ['教卓の前', -0.10, -3.42 + 0.85],
  ['廊下の自販機の前', -5.00, 1.85],
  ['窓側の壁ぎわ', ROOM.w / 2 - 0.45, 0.0],
  ['廊下側の壁ぎわ', ROOM.w / 2 * -1 + 0.45, 0.0],
];
goals.forEach(([name, x, z]) => ok(reach(x, z, 0.28), `${name} (${x.toFixed(2)}, ${z.toFixed(2)}) へ到達できる`));

console.log('=== [6] コントローラの挙動 ===');
const camera = new THREE.PerspectiveCamera(58, 1.6, 0.04, 400);
camera.position.set(-2.95, EYE_STAND, -3.45);
const nav = createNav({ camera, dom: { addEventListener() {}, requestPointerLock() {} }, colliders });

nav.teleport([-2.95, EYE_STAND, -3.45], [1.90, 1.05, 1.25]);
ok(Math.abs(camera.position.y - EYE_STAND) < 0.001, `目の高さが ${EYE_STAND} m になった`);
{
  // 黒板（z=-4.30）へ向かって2秒歩き、壁を抜けないことを確認
  nav.teleport([-0.45, EYE_STAND, -3.0], [-0.45, 1.60, -4.30]);
  nav._debug.keys.add('KeyW');
  for (let i = 0; i < 120; i++) nav.update(1 / 60);
  nav._debug.keys.clear();
  const p = nav.position;
  ok(p.z > -ROOM.d / 2, `前進しても黒板の壁を抜けない（z=${p.z.toFixed(3)} > ${(-ROOM.d / 2).toFixed(2)}）`);
  ok(p.z < -3.6, `実際に前へ進んだ（z=${p.z.toFixed(3)}）`);
}
{
  // 机に突っ込んでも止まる
  nav.teleport([DESK.cols[2], EYE_STAND, DESK.rows[2] + 0.9], [DESK.cols[2], 1.0, DESK.rows[2]]);
  nav._debug.keys.add('KeyW');
  for (let i = 0; i < 180; i++) nav.update(1 / 60);
  nav._debug.keys.clear();
  const stuckIn = nav._debug.boxesAt(nav.position.x, nav.position.z);
  ok(stuckIn.length === 0, `机に当たって止まる（埋まり 0 件 / 位置 ${nav.position.x.toFixed(2)}, ${nav.position.z.toFixed(2)}）`);
}
{
  // 廊下まで歩ける（前扉 z=-3.0 を通る）
  nav.teleport([-3.2, EYE_STAND, -3.0], [-6.0, 1.5, -3.0]);
  nav._debug.keys.add('KeyW');
  for (let i = 0; i < 300; i++) nav.update(1 / 60);
  nav._debug.keys.clear();
  ok(nav.position.x < -3.9, `廊下へ出られた（x=${nav.position.x.toFixed(2)}）`);
}

/* ---------------- 結果 ---------------- */
console.log('');
if (failures) {
  console.error(`NAV テスト失敗: ${failures} 件`);
  process.exit(1);
}
console.log('NAV OK');
