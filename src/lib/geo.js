/**
 * geo.js — 教室・廊下・屋外の「部品リスト」を生成する純粋ビルダー。
 * DOM に依存しないので Node でも組み立てて寸法を検証できる（tools/test-scene.mjs）。
 *
 * 部品 = { geo, mat, pos?, rot?, scale? }
 *   geo  : THREE.BufferGeometry（原点基準）
 *   mat  : マテリアルキー。同一キーの部品は scene.js で結合されドローコールを削減する。
 *          '@' 始まりは「専用マテリアル（キャンバス板書など）」として分離する。
 */
import {
  BoxGeometry, CylinderGeometry, PlaneGeometry, SphereGeometry,
  ExtrudeGeometry, Shape, BufferGeometry, Float32BufferAttribute,
  Uint16BufferAttribute, Uint32BufferAttribute, Matrix4, Euler, Vector3, Quaternion,
} from 'three';

const _pos = new Vector3(), _quat = new Quaternion(), _euler = new Euler(), _scale = new Vector3();
/** pos/rot/scale → Matrix4（three の行列をそのまま使う） */
export function mat4From(pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  _pos.set(pos[0], pos[1], pos[2]);
  _euler.set(rot[0], rot[1], rot[2], 'XYZ');
  _quat.setFromEuler(_euler);
  _scale.set(scale[0], scale[1], scale[2]);
  return new Matrix4().compose(_pos, _quat, _scale);
}

const box = (w, h, d) => new BoxGeometry(w, h, d);
const cyl = (rt, rb, h, seg = 12, open = false) => new CylinderGeometry(rt, rb, h, seg, 1, open);
const plane = (w, h) => new PlaneGeometry(w, h);
const WALL_T = 0.18;

function part(geo, mat, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  return { geo, mat, pos, rot, scale };
}
const range = (n, fn) => { const a = []; for (let i = 0; i < n; i++) a.push(fn(i)); return a; };

/** BufferGeometry を自前で結合する（three/addons 非依存 = Node テスト可能） */
export function mergeSimple(geos) {
  const list = geos.filter(Boolean);
  if (list.length === 0) return new BufferGeometry();
  if (list.length === 1) return list[0];
  let vertexCount = 0, indexCount = 0;
  for (const g of list) {
    const p = g.getAttribute('position');
    vertexCount += p.count;
    indexCount += g.index ? g.index.count : p.count;
  }
  const position = new Float32Array(vertexCount * 3);
  const normal = new Float32Array(vertexCount * 3);
  const uv = new Float32Array(vertexCount * 2);
  const index = new Uint32Array(indexCount);
  let vo = 0, io = 0;
  for (const g of list) {
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const u = g.getAttribute('uv');
    position.set(p.array.subarray(0, p.count * 3), vo * 3);
    if (n) normal.set(n.array.subarray(0, p.count * 3), vo * 3);
    if (u) uv.set(u.array.subarray(0, p.count * 2), vo * 2);
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) index[io + i] = g.index.array[i] + vo;
      io += g.index.count;
    } else {
      for (let i = 0; i < p.count; i++) index[io + i] = i + vo;
      io += p.count;
    }
    vo += p.count;
    g.dispose?.();
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new Float32BufferAttribute(position, 3));
  out.setAttribute('normal', new Float32BufferAttribute(normal, 3));
  out.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  out.setIndex(new (indexCount > 65535 ? Uint32BufferAttribute : Uint16BufferAttribute)(index, 1));
  out.computeBoundingSphere();
  return out;
}

/** 部品リストを mat ごとに結合してジオメトリ辞書にする（scene.js から呼ぶ） */
export function mergePartsByMaterial(parts) {
  const groups = new Map();
  for (const p of parts) {
    if (!groups.has(p.mat)) groups.set(p.mat, []);
    const g = p.geo.clone();
    g.applyMatrix4(mat4From(p.pos, p.rot, p.scale));
    groups.get(p.mat).push(g);
  }
  const out = {};
  for (const [mat, list] of groups) out[mat] = mergeSimple(list);
  return out;
}

/* ================= 教室の殻 ================= */

export function buildRoomShell(room) {
  const { width: W, depth: D, height: H } = room;
  const hw = W / 2, hd = D / 2;
  const parts = [];

  parts.push(part(plane(W, D), 'floor', [0, 0, 0], [-Math.PI / 2, 0, 0]));
  parts.push(part(plane(W, D), 'ceiling', [0, H, 0], [Math.PI / 2, 0, 0]));

  /* --- +X 壁（窓壁・西） --- */
  const win = room.window;
  const span = win.count * win.width + (win.count - 1) * win.gap;
  const z0 = -span / 2;
  const winTop = win.sill + win.height;
  const wx = hw - WALL_T / 2;

  parts.push(part(box(WALL_T, win.sill, D), 'wall', [wx, win.sill / 2, 0]));
  parts.push(part(box(WALL_T, H - winTop, D), 'wall', [wx, (H + winTop) / 2, 0]));

  const piers = [[-hd, z0]];
  range(win.count - 1, (i) => piers.push([z0 + win.width + i * (win.width + win.gap), z0 + (i + 1) * (win.width + win.gap)]));
  piers.push([z0 + span, hd]);
  for (const [a, b] of piers) {
    if (b - a < 0.001) continue;
    parts.push(part(box(WALL_T, win.height, b - a), 'wall', [wx, win.sill + win.height / 2, (a + b) / 2]));
  }

  const openings = { windows: [], door: null };
  range(win.count, (i) => {
    const zc = z0 + win.width / 2 + i * (win.width + win.gap);
    openings.windows.push({ z: zc, y: win.sill + win.height / 2, w: win.width, h: win.height });
    parts.push(part(box(0.06, 0.05, win.width + 0.1), 'frame', [hw - 0.06, win.sill - 0.02, zc]));
    parts.push(part(box(0.06, 0.05, win.width + 0.1), 'frame', [hw - 0.06, winTop + 0.02, zc]));
    parts.push(part(box(0.06, win.height, 0.05), 'frame', [hw - 0.06, win.sill + win.height / 2, zc - win.width / 2]));
    parts.push(part(box(0.06, win.height, 0.05), 'frame', [hw - 0.06, win.sill + win.height / 2, zc + win.width / 2]));
    parts.push(part(box(0.04, win.height - 0.06, 0.04), 'frame', [hw - 0.08, win.sill + win.height / 2, zc]));
    parts.push(part(plane(win.width - 0.06, win.height - 0.06), 'glass',
      [hw - 0.05, win.sill + win.height / 2, zc], [0, -Math.PI / 2, 0]));
    parts.push(part(box(0.26, 0.04, win.width + 0.16), 'wood', [hw - 0.17, win.sill - 0.04, zc]));
  });

  /* --- −X 壁（廊下側） --- */
  const d = room.door, dz0 = d.offsetZ - d.width / 2, dz1 = d.offsetZ + d.width / 2;
  const ex = -hw + WALL_T / 2;
  parts.push(part(box(WALL_T, H, dz0 + hd), 'wall', [ex, H / 2, (-hd + dz0) / 2]));
  parts.push(part(box(WALL_T, H, hd - dz1), 'wall', [ex, H / 2, (dz1 + hd) / 2]));
  parts.push(part(box(WALL_T, H - d.height, d.width), 'wall', [ex, (H + d.height) / 2, d.offsetZ]));
  openings.door = { z: d.offsetZ, w: d.width, h: d.height };
  // 引き戸の枠とレール
  parts.push(part(box(WALL_T, 0.08, d.width + 0.14), 'frame', [ex, d.height + 0.02, d.offsetZ]));

  /* --- ±Z 壁 --- */
  parts.push(part(box(W, H, WALL_T), 'wall', [0, H / 2, -hd + WALL_T / 2]));
  parts.push(part(box(W, H, WALL_T), 'wall', [0, H / 2, hd - WALL_T / 2]));

  /* --- 腰壁（木の見切り・窓壁以外） --- */
  const dadoH = 0.92;
  parts.push(part(box(W - 0.1, dadoH, 0.03), 'dado', [0, dadoH / 2, -hd + WALL_T + 0.015]));
  parts.push(part(box(W - 0.1, dadoH, 0.03), 'dado', [0, dadoH / 2, hd - WALL_T - 0.015]));
  parts.push(part(box(0.03, dadoH, D - 0.1), 'dado', [ex + WALL_T / 2 + 0.015, dadoH / 2, 0]));

  return { parts, openings };
}

/* ================= 黒板・教壇 ================= */

export function buildBlackboard(room) {
  const bb = room.blackboard;
  const z = -room.depth / 2 + WALL_T + 0.05;
  const cy = bb.bottom + bb.height / 2;
  const parts = [];
  parts.push(part(box(bb.width + 0.1, 0.06, 0.09), 'frame', [0, cy + bb.height / 2 + 0.02, z]));
  parts.push(part(box(bb.width + 0.1, 0.06, 0.09), 'frame', [0, cy - bb.height / 2 - 0.02, z]));
  parts.push(part(box(0.06, bb.height + 0.1, 0.09), 'frame', [-bb.width / 2 - 0.02, cy, z]));
  parts.push(part(box(0.06, bb.height + 0.1, 0.09), 'frame', [bb.width / 2 + 0.02, cy, z]));
  parts.push(part(plane(bb.width, bb.height), '@board', [0, cy, z + 0.05]));
  parts.push(part(box(bb.width, 0.05, 0.11), 'wood', [0, bb.bottom - 0.03, z + 0.07]));
  [0xffffff, 0xffe9a8, 0xff9d9d].forEach((_, i) => {
    parts.push(part(cyl(0.006, 0.006, 0.075, 6), '@chalk' + i,
      [-bb.width / 2 + 0.4 + i * 0.11, bb.bottom - 0.002, z + 0.055], [0, 0, Math.PI / 2]));
  });
  parts.push(part(box(0.14, 0.05, 0.07), 'eraser', [bb.width / 2 - 0.55, bb.bottom, z + 0.055]));
  return parts;
}

export function buildPodium(room) {
  const p = room.podium, z = -room.depth / 2 + WALL_T + p.depth / 2 + 0.1;
  return [
    part(box(p.width, p.height, p.depth), 'wood', [0, p.height / 2, z]),
    part(box(p.width, 0.03, 0.05), 'wood', [0, p.height, z + p.depth / 2 - 0.03]),
  ];
}

/* ================= 家具（InstancedMesh 用ジオメトリ） ================= */

export function deskGeometries(room) {
  const { top, depth, height } = room.desk;
  const wood = [], metal = [];
  const legT = 0.026;
  wood.push({ geo: box(top, 0.03, depth), pos: [0, height - 0.015, 0] });
  wood.push({ geo: box(top, 0.26, 0.022), pos: [0, height - 0.17, depth / 2 - 0.011] });
  wood.push({ geo: box(0.022, 0.26, depth - 0.05), pos: [-top / 2 + 0.011, height - 0.17, 0] });
  wood.push({ geo: box(0.022, 0.26, depth - 0.05), pos: [top / 2 - 0.011, height - 0.17, 0] });
  wood.push({ geo: box(top - 0.08, 0.02, depth - 0.12), pos: [0, height - 0.36, 0] });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    metal.push({ geo: box(legT, height - 0.03, legT), pos: [sx * (top / 2 - 0.05), (height - 0.03) / 2, sz * (depth / 2 - 0.05)] });
  }
  metal.push({ geo: box(top - 0.1, 0.02, legT), pos: [0, 0.12, -(depth / 2 - 0.05)] });
  metal.push({ geo: box(top - 0.1, 0.02, legT), pos: [0, 0.12, depth / 2 - 0.05] });
  return { wood: toMerged(wood), metal: toMerged(metal) };
}

export function chairGeometries(room) {
  const w = 0.4, d = 0.38, h = room.desk.chair;
  const wood = [], metal = [];
  wood.push({ geo: box(w, 0.03, d), pos: [0, h - 0.015, 0] });
  wood.push({ geo: box(w, 0.30, 0.025), pos: [0, h + 0.16, -d / 2 + 0.02], rot: [-0.09, 0, 0] });
  for (const sx of [-1, 1]) {
    metal.push({ geo: box(0.022, h - 0.03, 0.022), pos: [sx * (w / 2 - 0.03), (h - 0.03) / 2, d / 2 - 0.04] });
    metal.push({ geo: box(0.022, h - 0.03, 0.022), pos: [sx * (w / 2 - 0.03), (h - 0.03) / 2, -d / 2 + 0.04] });
  }
  metal.push({ geo: box(w - 0.06, 0.018, 0.018), pos: [0, 0.1, d / 2 - 0.04] });
  return { wood: toMerged(wood), metal: toMerged(metal) };
}

export function teacherDeskGeometries() {
  const w = 1.7, d = 0.72, h = 0.78;
  const wood = [], metal = [];
  wood.push({ geo: box(w, 0.04, d), pos: [0, h - 0.02, 0] });
  wood.push({ geo: box(w, 0.5, 0.02), pos: [0, h - 0.29, d / 2 - 0.01] });
  wood.push({ geo: box(0.02, 0.5, d - 0.02), pos: [-w / 2 + 0.01, h - 0.29, 0] });
  wood.push({ geo: box(0.02, 0.5, d - 0.02), pos: [w / 2 - 0.01, h - 0.29, 0] });
  wood.push({ geo: box(0.42, 0.12, d - 0.1), pos: [-0.55, h - 0.2, 0.14] });   // 半開きの引き出し
  wood.push({ geo: box(0.42, 0.02, 0.34), pos: [-0.55, h - 0.14, 0.3] });
  metal.push({ geo: box(0.1, 0.02, 0.02), pos: [-0.55, h - 0.19, d / 2 - 0.02] });
  return { wood: toMerged(wood), metal: toMerged(metal) };
}

export function lockerGeometries() {
  const w = 0.78, h = 1.86, d = 0.42;
  const metal = [], rust = [];
  metal.push({ geo: box(w, h, d), pos: [0, h / 2, 0] });
  for (const sx of [-1, 1]) {
    metal.push({ geo: box(w / 2 - 0.03, h - 0.1, 0.02), pos: [sx * w / 4, h / 2, d / 2 + 0.011] });
    metal.push({ geo: box(0.04, 0.12, 0.03), pos: [sx * 0.06, h * 0.55, d / 2 + 0.03] });
  }
  rust.push({ geo: box(w, 0.06, d + 0.01), pos: [0, 0.03, 0] });
  return { metal: toMerged(metal), rust: toMerged(rust) };
}

export function lightFixtureGeometries(len = 1.22) {
  return {
    housing: [part(box(0.15, 0.08, len), 'fixture')],
    reflector: [part(box(0.3, 0.02, len + 0.05), 'fixture', [0, -0.05, 0])],
    lamp: [part(plane(0.26, len - 0.06), '@lamp', [0, -0.062, 0], [Math.PI / 2, 0, 0])],
  };
}

export function acGeometries() {
  const indoor = [], outdoor = [], rust = [];
  indoor.push({ geo: box(0.82, 0.28, 0.22), pos: [0, 0, 0] });
  indoor.push({ geo: box(0.76, 0.04, 0.07), pos: [0, -0.15, 0.09], rot: [0.5, 0, 0] });
  outdoor.push({ geo: box(0.78, 0.54, 0.3), pos: [0, 0, 0] });
  outdoor.push({ geo: box(0.86, 0.04, 0.34), pos: [0, -0.29, 0] });
  rust.push({ geo: cyl(0.23, 0.23, 0.02, 16, true), pos: [0, 0.05, 0.16], rot: [Math.PI / 2, 0, 0] });
  rust.push({ geo: cyl(0.06, 0.06, 0.03, 10), pos: [0, 0.05, 0.17], rot: [Math.PI / 2, 0, 0] });
  return { indoor: toMerged(indoor), outdoor: toMerged(outdoor), rust: toMerged(rust) };
}

export function cleaningGeometries() {
  const plastic = [], wood = [], metal = [];
  plastic.push({ geo: cyl(0.15, 0.12, 0.26, 14), pos: [0, 0.13, 0] });
  wood.push({ geo: cyl(0.014, 0.014, 1.35, 8), pos: [0.22, 0.68, 0], rot: [0.12, 0, 0.06] });
  plastic.push({ geo: box(0.22, 0.09, 0.1), pos: [0.25, 0.06, 0.07] });
  wood.push({ geo: cyl(0.012, 0.012, 1.15, 8), pos: [-0.18, 0.58, 0.1], rot: [0.1, 0, -0.08] });
  metal.push({ geo: box(0.18, 0.05, 0.03), pos: [-0.2, 0.03, 0.12] });
  return { plastic: toMerged(plastic), wood: toMerged(wood), metal: toMerged(metal) };
}

export function vendingGeometries() {
  const w = 0.98, h = 1.86, d = 0.72;
  const body = [], frame = [];
  body.push({ geo: box(w, h, d), pos: [0, h / 2, 0] });
  frame.push({ geo: box(w + 0.05, 0.07, d + 0.03), pos: [0, h + 0.02, 0] });
  frame.push({ geo: box(w + 0.05, 0.06, d + 0.03), pos: [0, 0.03, 0] });
  frame.push({ geo: box(0.52, 0.17, 0.03), pos: [0.06, 0.44, d / 2 + 0.016] });
  return { body: toMerged(body), frame: toMerged(frame), glow: [part(plane(w - 0.1, h - 0.62), '@vending', [0, h - 0.44, d / 2 + 0.012])] };
}

/** 部品リスト（geo+pos+rot）を1ジオメトリへ */
export function toMerged(list) {
  return mergeSimple(list.map(({ geo, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1] }) => {
    const g = geo.clone();
    g.applyMatrix4(mat4From(pos, rot, scale));
    return g;
  }));
}

/* ================= 小物（机の上・人の気配） ================= */

export function bookParts({ w = 0.15, h = 0.21, t = 0.03, cover = '@bookQ' } = {}) {
  return [
    part(box(w, t, h), 'paper', [0, t / 2, 0]),
    part(box(w * 0.96, t * 0.35, h * 0.95), cover, [0, t * 1.05, 0]),
    part(box(w, t, h), 'paper', [0, t * 1.6, 0.012]),
  ];
}

export function notebookParts() {
  return [
    part(box(0.17, 0.008, 0.11), '@notebook', [0, 0.004, 0]),
    part(box(0.17, 0.006, 0.11), 'paper', [0, 0.012, 0.002], [0, 0.05, 0]),
  ];
}

export function phoneParts() {
  return [
    part(box(0.072, 0.009, 0.145), 'plastic', [0, 0.005, 0]),
    part(plane(0.066, 0.135), '@phone', [0, 0.0102, 0], [-Math.PI / 2, 0, 0]),
  ];
}

export function bentoParts() {
  return [
    part(box(0.2, 0.05, 0.14), 'plastic', [0, 0.025, 0]),
    part(box(0.208, 0.012, 0.148), '@bento', [0, 0.056, 0.02], [0, 0.06, 0]),
    part(box(0.16, 0.006, 0.008), 'wood', [0, 0.017, -0.14], [0, 0.3, 0]),
  ];
}

export function ramenBagParts() {
  return [
    part(box(0.2, 0.24, 0.13), '@ramen', [0, 0.12, 0]),
    part(box(0.21, 0.03, 0.14), '@ramen', [0, 0.245, 0], [0, 0.1, 0.05]),
    part(cyl(0.03, 0.035, 0.06, 10), 'paper', [0.08, 0.31, 0], [0, 0, 0.2]),
  ];
}

export function bottleParts() {
  return [
    part(cyl(0.033, 0.033, 0.19, 14), 'plastic', [0, 0.095, 0]),
    part(cyl(0.022, 0.03, 0.04, 14), 'plastic', [0, 0.21, 0]),
    part(cyl(0.024, 0.024, 0.018, 14), 'frame', [0, 0.235, 0]),
  ];
}

export function paperStackParts(n = 21) {
  const parts = [];
  const shown = Math.min(n, 14);
  for (let i = 0; i < shown; i++) {
    parts.push(part(box(0.15, 0.006, 0.21), i % 3 === 0 ? '@paperSlip' : 'paper',
      [(i % 4) * 0.002 - 0.003, 0.004 + i * 0.0065, (i % 3) * 0.002], [0, (i % 5) * 0.02, 0]));
  }
  return parts;
}

export function bagParts() {
  return [
    part(box(0.3, 0.34, 0.14), 'plastic', [0, 0.17, 0]),
    part(box(0.31, 0.03, 0.15), 'plastic', [0, 0.35, 0]),
    part(cyl(0.012, 0.012, 0.1, 6), 'metal', [0, 0.4, 0], [0, 0, Math.PI / 2]),
  ];
}

export function stationaryParts() {
  return [
    part(box(0.05, 0.014, 0.026), 'eraser', [0, 0.007, 0]),
    part(cyl(0.004, 0.004, 0.13, 6), 'plastic', [0.06, 0.006, 0.02], [0, 0, Math.PI / 2]),
  ];
}

export function mapParts() {
  return [
    part(plane(0.5, 0.36), '@map', [0, 0.004, 0], [-Math.PI / 2, 0.06, 0]),
    part(box(0.5, 0.003, 0.36), 'paper', [0, 0.001, 0.001], [0, 0.06, 0]),
  ];
}

export function noticeBoardParts(w = 1.9, h = 1.0) {
  return [
    part(box(w + 0.06, h + 0.06, 0.04), 'wood'),
    part(plane(w, h), '@board2', [0, 0, 0.024]),
  ];
}

/* ================= 廊下 ================= */

export function buildCorridor(room) {
  const cw = room.corridor.width, cl = room.corridor.length, H = room.height;
  const parts = [];
  const xIn = -room.width / 2 - WALL_T;
  const xOut = xIn - cw;
  const cx = (xIn + xOut) / 2, halfL = cl / 2, endZ = -halfL + 0.12;

  parts.push(part(plane(cw, cl), 'floor', [cx, 0, 0], [-Math.PI / 2, 0, 0]));
  parts.push(part(plane(cw, cl), 'ceiling', [cx, H, 0], [Math.PI / 2, 0, 0]));
  parts.push(part(box(WALL_T, H, cl), 'wall', [xOut + WALL_T / 2, H / 2, 0]));
  // 廊下の外壁にも窓（光の源）
  for (const z of [2.6, -0.4]) {
    parts.push(part(box(WALL_T, 1.0, 1.7), 'wall', [xOut + WALL_T / 2, 0.5, z]));
    parts.push(part(plane(1.6, 1.2), 'glass', [xOut + WALL_T, 1.9, z], [0, Math.PI / 2, 0]));
    parts.push(part(box(0.06, 1.24, 1.7), 'frame', [xOut + WALL_T + 0.02, 1.9, z]));
  }
  // 奥の窓
  parts.push(part(box(cw + 0.4, 0.92, WALL_T), 'wall', [cx, 0.46, endZ]));
  parts.push(part(box(cw + 0.4, 0.34, WALL_T), 'wall', [cx, H - 0.17, endZ]));
  parts.push(part(plane(cw - 0.12, H - 1.3), 'glass', [cx, 0.92 + (H - 1.3) / 2, endZ + 0.02]));
  parts.push(part(box(cw, 0.06, 0.1), 'frame', [cx, 0.92, endZ + 0.04]));
  parts.push(part(box(cw, 0.06, 0.1), 'frame', [cx, H - 0.35, endZ + 0.04]));

  // 掃除ロッカー（扉が開いている＝人の気配）
  const lz = halfL - 1.6;
  parts.push(part(box(0.5, 1.7, 1.05), 'metal', [xOut + 0.35, 0.85, lz]));
  parts.push(part(box(0.03, 1.6, 0.5), 'metal', [xOut + 0.62, 0.86, lz - 0.76], [0, -1.0, 0]));

  return { parts, xIn, xOut, halfL, endZ, cx };
}

/* ================= 屋外 ================= */

const PADDY_MAT = { spring: 'paddySpring', earlySummer: 'paddy', summer: 'paddyDeep', autumn: 'paddyGold', winter: 'paddyDry' };

export function buildOutdoor(room, season = 'spring') {
  const y0 = room.floorY;
  const parts = [];

  parts.push(part(plane(64, 50), 'ground', [12, y0, 0], [-Math.PI / 2, 0, 0]));
  parts.push(part(plane(420, 420), 'field', [60, y0 - 0.04, -20], [-Math.PI / 2, 0, 0]));

  const paddyMat = PADDY_MAT[season] || 'paddy';
  for (let ix = 0; ix < 6; ix++) {
    for (let iz = 0; iz < 5; iz++) {
      const x = 30 + ix * 19, z = -60 + iz * 16;
      parts.push(part(plane(17.4, 14.4), paddyMat, [x, y0 + 0.02, z], [-Math.PI / 2, 0, 0]));
      parts.push(part(box(18, 0.26, 0.5), 'ridge', [x, y0 + 0.11, z + 7.4]));
      parts.push(part(box(0.5, 0.26, 15), 'ridge', [x + 8.8, y0 + 0.11, z]));
    }
  }

  parts.push(part(ridgeGeometry(150, 26, 0.9), 'ridgeNear', [95, y0, 0], [0, -Math.PI / 2, 0]));
  parts.push(part(ridgeGeometry(200, 40, 1.7), 'ridgeFar', [130, y0, 0], [0, -Math.PI / 2, 0]));

  parts.push(part(tunnelGeometry(4.2, 5.4), 'tunnel', [72, y0, -26], [0, -Math.PI / 2, 0]));
  parts.push(part(plane(6, 70), 'road', [78, y0 + 0.05, -10], [-Math.PI / 2, 0.12, 0]));

  [18, 46, 74].forEach((x, i) => parts.push(part(pylonGeometry(17), 'pylon', [x, y0, -6 - i * 2])));

  [-16, -8, 0, 8, 16, 24].forEach((z, i) => {
    const x = 17 + (i % 2) * 3.5;
    parts.push(part(treeGeometry(), 'treeLeaf', [x + i * 0.6, y0, -22 + z * 1.6]));
  });

  // 南棟（国境の向こう側・遠景）
  parts.push(part(box(46, 13, 16), 'building', [30, y0 + 6.5, 36]));
  parts.push(part(box(46.4, 1.1, 16.4), 'buildingTrim', [30, y0 + 13.2, 36]));
  for (let i = 0; i < 7; i++) {
    parts.push(part(box(0.2, 1.6, 15.6), 'windowDark', [30 - 21 + i * 7, y0 + 8.4, 36]));
    parts.push(part(box(0.2, 1.6, 15.6), 'windowDark', [30 - 21 + i * 7, y0 + 5.0, 36]));
  }

  return { parts, y0 };
}

function ridgeGeometry(length, height, roughness) {
  const seg = 26, pos = [], idx = [], base = -4;
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, x = (t - 0.5) * length;
    const h = height * (0.4 + 0.6 * Math.abs(Math.sin(t * 7.3 * roughness + roughness)) * (0.62 + 0.38 * Math.sin(t * 19.1)));
    pos.push(x, base, 0, x, h, 0);
  }
  for (let i = 0; i < seg; i++) {
    const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function tunnelGeometry(w, h) {
  const s = new Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(-w / 2, h - w / 2);
  s.absarc(0, h - w / 2, w / 2, Math.PI, 0, true);
  s.lineTo(w / 2, 0);
  s.lineTo(-w / 2, 0);
  return new ExtrudeGeometry(s, { depth: 0.8, bevelEnabled: false });
}

/** 鉄塔（4脚＋腕金・遠景用の簡略形） */
function pylonGeometry(h) {
  const geos = [];
  const spread = 1.4, top = 0.3;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const g = cyl(0.05, 0.08, h, 5);
      const lean = Math.atan2(spread - top, h);
      g.rotateX(sz * lean * (sx > 0 ? 0 : 0));
      g.rotateZ(-sx * lean);
      g.translate(sx * (spread + top) / 2, h / 2, sz * (spread + top) / 2);
      geos.push(g);
    }
  }
  for (const [y, wl] of [[h * 0.7, 3.0], [h * 0.83, 2.6], [h * 0.96, 2.0]]) {
    geos.push(box(wl * 2, 0.13, 0.13).translate(0, y, 0));
    geos.push(box(0.09, 0.6, 0.09).translate(-wl + 0.2, y + 0.32, 0));
    geos.push(box(0.09, 0.6, 0.09).translate(wl - 0.2, y + 0.32, 0));
    geos.push(box(0.09, 0.6, 0.09).translate(0, y + 0.32, 0));
  }
  for (const y of [h * 0.25, h * 0.48]) {
    geos.push(box(spread * 2, 0.09, 0.09).translate(0, y, -spread * 0.75));
    geos.push(box(spread * 2, 0.09, 0.09).translate(0, y, spread * 0.75));
  }
  return mergeSimple(geos);
}

/** 木（桜 or 落葉樹・季節で色はマテリアル側が担当） */
function treeGeometry() {
  const geos = [cyl(0.12, 0.18, 3.4, 7).translate(0, 1.7, 0)];
  const blobs = [[0, 3.8, 0, 1.5], [0.85, 3.4, 0.4, 1.1], [-0.75, 3.5, -0.5, 1.2], [0.2, 4.6, -0.3, 1.05], [-0.4, 4.3, 0.6, 0.92]];
  for (const [x, y, z, r] of blobs) geos.push(new SphereGeometry(r, 8, 6).translate(x, y, z));
  return mergeSimple(geos);
}

/** 送電線の架線（たわみ＝カテナリ）。LineSegments 用の頂点を作る */
export function powerLineVertices(pylons, offsets = [-2.6, -1.9, -1.2, 1.2, 1.9, 2.6]) {
  const verts = [];
  for (let i = 0; i < pylons.length - 1; i++) {
    const a = pylons[i], b = pylons[i + 1];
    for (const off of offsets) {
      const span = Math.abs(b.x - a.x);
      const sag = Math.min(3.2, span * 0.055);
      const seg = 14;
      for (let s = 0; s < seg; s++) {
        const t0 = s / seg, t1 = (s + 1) / seg;
        for (const t of [t0, t1]) {
          const x = a.x + (b.x - a.x) * t;
          const z = a.z + (b.z - a.z) * t + off;
          const y = b.y * 0.72 - Math.sin(Math.PI * t) * sag;
          verts.push(x, y, z);
        }
      }
    }
  }
  return new Float32Array(verts);
}
