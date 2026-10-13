/**
 * tools/smoke.mjs — Node 側のスモークテスト（開発用。ブラウザでは実行されない）
 * DOM / Canvas2D を最小モックし、WebGL を触らない範囲で組み立てが通るか確認する。
 *   node tools/smoke.mjs
 */
import { createRequire } from 'module';

/* ---------------- DOM / Canvas の最小モック ---------------- */
function makeCtx2D(canvas) {
  const noop = () => {};
  const grad = { addColorStop: noop };
  const ctx = {
    canvas,
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '10px sans-serif',
    textAlign: 'left', textBaseline: 'alphabetic', globalAlpha: 1, globalCompositeOperation: 'source-over',
    shadowColor: '#000', shadowBlur: 0, lineCap: 'butt', lineJoin: 'miter', filter: 'none',
    save: noop, restore: noop, beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
    arc: noop, ellipse: noop, rect: noop, fill: noop, stroke: noop, fillRect: noop, strokeRect: noop,
    clearRect: noop, fillText: noop, strokeText: noop, translate: noop, rotate: noop, scale: noop,
    setTransform: noop, transform: noop, clip: noop, quadraticCurveTo: noop, bezierCurveTo: noop,
    setLineDash: noop, drawImage: noop, arcTo: noop,
    measureText: (t) => ({ width: String(t).length * 8 }),
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    createPattern: () => null,
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData: noop,
  };
  return ctx;
}

function makeCanvas(w = 300, h = 150) {
  const c = {
    width: w, height: h, style: {}, nodeType: 1, tagName: 'CANVAS',
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute() { return null; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h, right: w, bottom: h }),
    toDataURL: () => 'data:,',
  };
  c.getContext = (kind) => (kind === '2d' ? makeCtx2D(c) : null);
  return c;
}

globalThis.self = globalThis;
globalThis.window = globalThis;
globalThis.document = {
  createElement: (tag) => (tag === 'canvas' ? makeCanvas() : { style: {}, appendChild() {}, setAttribute() {} }),
  createElementNS: () => makeCanvas(),
  getElementById: () => null,
  querySelector: () => null,
  addEventListener() {}, removeEventListener() {},
  body: { appendChild() {} }, head: { appendChild() {} },
  documentElement: { style: {} },
};
try { Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node', clipboard: { writeText: async () => {} } }, configurable: true }); } catch (e) { void e; }
globalThis.performance = globalThis.performance || { now: () => Date.now() };
globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.HTMLCanvasElement = function () {};
globalThis.OffscreenCanvas = undefined;
globalThis.ImageData = function (w, h) { this.data = new Uint8ClampedArray(w * h * 4); this.width = w; this.height = h; };
globalThis.createImageBitmap = undefined;
globalThis.fetch = async () => { throw new Error('offline (smoke test)'); };
globalThis.AbortController = globalThis.AbortController || class { constructor() { this.signal = {}; } abort() {} };

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
console.log('SMOKE OK');
