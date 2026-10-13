/**
 * tools/views.mjs — 視点プリセットの検証（開発用）
 * 各プリセットのカメラ位置から注視点へレイを飛ばし、何に当たるかを一覧する。
 *   node tools/views.mjs
 */
import { mkdirSync, readdirSync, writeFileSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { readFileSync } from 'fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const work = path.join(here, '.tmp');
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
const shim = path.join(here, 'three-shim.mjs').replace(/\\/g, '/');
const threeRoot = path.join(here, '..', 'node_modules', 'three').replace(/\\/g, '/');
const srcDir = path.join(here, '..', 'src');
for (const f of readdirSync(srcDir)) {
  if (!f.endsWith('.js')) continue;
  let s = readFileSync(path.join(srcDir, f), 'utf8');
  s = s.replace(/from ['"]three['"]/g, `from '${shim}'`);
  s = s.replace(/from ['"]three\/addons\//g, `from '${threeRoot}/examples/jsm/`);
  writeFileSync(path.join(work, f), s);
}

/* DOM mock */
function makeCtx(canvas) {
  const noop = () => {}; const grad = { addColorStop: noop };
  return { canvas, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '',
    globalAlpha: 1, shadowColor: '', shadowBlur: 0, lineCap: '', lineJoin: '', filter: '',
    save: noop, restore: noop, beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, arc: noop,
    ellipse: noop, rect: noop, fill: noop, stroke: noop, fillRect: noop, strokeRect: noop, clearRect: noop,
    fillText: noop, strokeText: noop, translate: noop, rotate: noop, scale: noop, setTransform: noop,
    transform: noop, clip: noop, quadraticCurveTo: noop, bezierCurveTo: noop, setLineDash: noop, drawImage: noop, arcTo: noop,
    measureText: (t) => ({ width: String(t).length * 8 }),
    createLinearGradient: () => grad, createRadialGradient: () => grad, createPattern: () => null,
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }), putImageData: noop };
}
function makeCanvas(w = 300, h = 150) {
  const c = { width: w, height: h, style: {}, nodeType: 1, tagName: 'CANVAS', addEventListener() {},
    removeEventListener() {}, setAttribute() {}, getAttribute() { return null; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }), toDataURL: () => 'data:,' };
  c.getContext = (k) => (k === '2d' ? makeCtx(c) : null);
  return c;
}
globalThis.window = globalThis;
globalThis.document = { createElement: (t) => (t === 'canvas' ? makeCanvas() : { style: {}, appendChild() {}, setAttribute() {} }),
  getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} }, head: { appendChild() {} } };
try { Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node' }, configurable: true }); } catch (e) { void e; }
globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 16);
globalThis.performance = globalThis.performance || { now: () => Date.now() };
globalThis.fetch = async () => { throw new Error('offline'); };

const THREE = await import(shim);
const TX = await import(path.join(work, 'textures.js'));
const { buildWorld } = await import(path.join(work, 'world.js'));
const { buildFurniture } = await import(path.join(work, 'furniture.js'));
const { buildProps } = await import(path.join(work, 'props.js'));
const { makeMaterials } = await import(path.join(work, 'assets.js'));
const { sunDirection } = await import(path.join(work, 'util.js'));
const { TIMES, VIEWS, ROOM, HOTSPOTS } = await import(path.join(work, 'spec.js'));

const procedural = {
  woodFloor: (rx, ry) => TX.woodFloorTexture(512, [rx, ry]),
  plaster: (rx, ry) => TX.plasterTexture(512, [rx, ry]),
  ceilingTex: (rx, ry) => TX.ceilingTexture(512, [rx, ry]),
  wood: (rx, ry) => TX.woodTexture(512, [rx, ry]),
  metal: (rx, ry) => TX.metalTexture(256, [rx, ry]),
  fabric: (rx, ry) => TX.fabricTexture(256, [rx, ry]),
  grayNoise: (rx, ry, b, c) => TX.grayNoiseTexture(256, [rx, ry], b, c),
  normalNoise: (rx, ry, s, d) => TX.normalFromNoise(256, [rx, ry], s, d),
  concrete: (rx, ry) => TX.concreteTexture(256, [rx, ry]),
};
const M = makeMaterials({ textures: {} }, procedural);
const scene = new THREE.Scene();
const T0 = TIMES[0];
const world = buildWorld(M, sunDirection(T0.sun.elev, T0.sun.azi, 12));
scene.add(world.root);
const furn = buildFurniture(M);
scene.add(furn.root);
const props = buildProps(M, {});
scene.add(props.root);
scene.updateMatrixWorld(true);

/* 名前付け */
function label(o) {
  const parts = [];
  let p = o;
  while (p) { if (p.name) parts.unshift(p.name); p = p.parent; }
  const hs = (() => { let q = o; while (q) { if (q.userData && q.userData.hotspot) return q.userData.hotspot; q = q.parent; } return null; })();
  const mat = o.material && o.material.userData && o.material.userData.texSource;
  return `${o.type}${o.isInstancedMesh ? `[${o.count}]` : ''}${hs ? `<${hs}>` : ''}${mat ? `{${mat}}` : ''}`;
}

const ray = new THREE.Raycaster();
ray.far = 60;

console.log('=== 視点プリセットの検証 ===');
for (const v of VIEWS) {
  const pos = new THREE.Vector3(...v.pos);
  const tgt = new THREE.Vector3(...v.target);
  const dir = tgt.clone().sub(pos).normalize();
  ray.set(pos, dir);
  const hits = ray.intersectObject(scene, true).filter((h) => h.distance > 0.02);
  const dist = pos.distanceTo(tgt);
  const inside = Math.abs(pos.x) < ROOM.w / 2 && pos.y > 0.2 && pos.y < ROOM.h && Math.abs(pos.z) < ROOM.d / 2;
  console.log(`\n[${v.id}] ${v.label}`);
  console.log(`  pos=(${pos.x}, ${pos.y}, ${pos.z})  室内=${inside ? '○' : '×'}  注視点まで ${dist.toFixed(2)} m`);
  const first = hits.slice(0, 4).map((h) => `${h.distance.toFixed(2)}m ${label(h.object)}`).join('  |  ');
  console.log(`  最初のヒット: ${first || '（なし）'}`);
}

console.log('\n=== 主要ホットスポットの可視性（各視点から見えるか） ===');
const hotObjects = [];
scene.traverse((o) => { if (o.userData && o.userData.hotspot) hotObjects.push(o); });
const keys = [...new Set(hotObjects.map((o) => o.userData.hotspot))];
for (const v of VIEWS) {
  const pos = new THREE.Vector3(...v.pos);
  const seen = new Set();
  for (const o of hotObjects) {
    const box = new THREE.Box3().setFromObject(o);
    const c = box.getCenter(new THREE.Vector3());
    const dir = c.clone().sub(pos);
    const d = dir.length();
    dir.normalize();
    ray.set(pos, dir);
    ray.far = d - 0.03;
    const hits = ray.intersectObject(scene, true);
    // 遮蔽物が無ければ可視
    if (hits.length === 0) seen.add(o.userData.hotspot);
  }
  ray.far = 60;
  console.log(`  ${v.id.padEnd(9)} → ${[...seen].sort().join(', ') || '（直接見えるものなし）'}`);
}
console.log(`\n定義済みホットスポット (${keys.length}): ${keys.join(', ')}`);
const missing = keys.filter((k) => !HOTSPOTS[k]);
if (missing.length) console.error('!! HOTSPOTS に未定義のキー:', missing.join(', '));
else console.log('全ホットスポットに引用テキストが定義されています。');
