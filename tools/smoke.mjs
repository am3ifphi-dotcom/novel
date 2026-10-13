/**
 * tools/smoke.mjs — Node 側のスモークテスト（開発用。ブラウザでは実行されない）
 * DOM / Canvas2D を最小モックし、WebGL を触らない範囲で組み立てが通るか確認する。
 *   node tools/smoke.mjs
 */
import { createRequire } from 'module';

/* ---- DOM / Canvas（厳格モック：canvas-mock.mjs に一本化） ---- */
import { installDom } from './canvas-mock.mjs';
installDom();

/* ---------------- 実行 ---------------- */
const require = createRequire(import.meta.url);
void require;

const THREE = await import('three');
const { mergeGeometries } = await import('three/examples/jsm/utils/BufferGeometryUtils.js');
// addons を 'three/addons/' で解決できるよう、テスト対象は相対 import なので問題なし
void mergeGeometries;

const TX = await import('../src/textures.js');
const B = await import('../src/boards.js');
const { buildWorld } = await import('../src/world.js');
const { buildFurniture } = await import('../src/furniture.js');
const { buildProps } = await import('../src/props.js');
const { makeMaterials } = await import('../src/assets.js');
const { sunDirection } = await import('../src/util.js');
const { TIMES } = await import('../src/spec.js');

console.log('three:', THREE.REVISION);

/* マテリアル（プロシージャル全面） */
const procedural = {
  woodFloor: (rx, ry) => TX.woodFloorTexture(512, [rx, ry]),
  plaster: (rx, ry) => TX.plasterTexture(512, [rx, ry]),
  ceilingTex: (rx, ry) => TX.ceilingTexture(512, [rx, ry]),
  wood: (rx, ry) => TX.woodTexture(512, [rx, ry]),
  metal: (rx, ry) => TX.metalTexture(256, [rx, ry]),
  fabric: (rx, ry) => TX.fabricTexture(256, [rx, ry]),
  grayNoise: (rx, ry, bias, contrast) => TX.grayNoiseTexture(256, [rx, ry], bias, contrast),
  normalNoise: (rx, ry, s, d) => TX.normalFromNoise(256, [rx, ry], s, d),
  concrete: (rx, ry) => TX.concreteTexture(256, [rx, ry]),
};
const M = makeMaterials({ textures: {} }, procedural);
console.log('materials:', Object.keys(M).join(', '));

/* 黒板3状態 */
['miso', 'terrace', 'math'].forEach((m) => { B.blackboardTexture(m, '金曜五限 14:50'); });
B.clockTexture(14, 50); B.noticeTexture(); B.timetableTexture(); B.vendingTexture();
B.phoneScreenTexture(); B.notebookCoverTexture(); B.openNotebookTexture();
B.astroBookTexture(); B.bookSpinesTexture(); B.roomPlateTexture();
for (let i = 0; i < 5; i++) B.paperSheetTexture(i * 2);
console.log('canvas textures: OK');

/* 世界 */
const t0 = Date.now();
const T = TIMES.find((x) => x.id === 'fri5');
const world = buildWorld(M, sunDirection(T.sun.elev, T.sun.azi, 12));
const furniture = buildFurniture(M);
const props = buildProps(M, {});
console.log(`build: ${Date.now() - t0} ms`);

function stats(root, label) {
  let meshes = 0, tris = 0, inst = 0, instCount = 0;
  root.traverse((o) => {
    if (o.isInstancedMesh) { inst++; instCount += o.count; }
    else if (o.isMesh) meshes++;
    const g = o.geometry;
    if (g && g.index) tris += (g.index.count / 3) * (o.isInstancedMesh ? o.count : 1);
    else if (g && g.attributes.position) tris += (g.attributes.position.count / 3) * (o.isInstancedMesh ? o.count : 1);
  });
  console.log(`${label}: mesh=${meshes} instancedMesh=${inst}(x${instCount}) tris≈${Math.round(tris)}`);
  return { meshes, inst, tris };
}
const a = stats(world.root, 'world');
const b = stats(furniture.root, 'furniture');
const c = stats(props.root, 'props');

const hotspots = [];
[world.root, furniture.root, props.root].forEach((r) => r.traverse((o) => {
  if (o.userData && o.userData.hotspot) hotspots.push(o.userData.hotspot);
}));
console.log('hotspots:', [...new Set(hotspots)].join(', '));
console.log(`TOTAL: meshes≈${a.meshes + b.meshes + c.meshes + a.inst + b.inst + c.inst} tris≈${Math.round(a.tris + b.tris + c.tris)}`);
console.log('desks/chairs:', furniture.count.desks, '/', furniture.count.chairs);

// ジオメトリに NaN / Infinity が混入していないか（NaN 頂点は描画が壊れる）
let badGeo = 0, checked = 0;
[world.root, furniture.root, props.root].forEach((r) => r.traverse((o) => {
  const g = o.geometry;
  if (!g || !g.attributes || !g.attributes.position) return;
  checked++;
  const a = g.attributes.position.array;
  for (let i = 0; i < a.length; i++) {
    if (!Number.isFinite(a[i])) { badGeo++; console.error(`  !! NaN 頂点: ${o.name || o.type} index=${i}`); break; }
  }
  if (g.attributes.uv) {
    const u = g.attributes.uv.array;
    for (let i = 0; i < u.length; i++) {
      if (!Number.isFinite(u[i])) { badGeo++; console.error(`  !! NaN UV: ${o.name || o.type} index=${i}`); break; }
    }
  }
}));
console.log(`geometry sanity: ${checked} 件チェック / 異常 ${badGeo} 件`);
if (badGeo > 0) process.exitCode = 1;
console.log('SMOKE OK');
