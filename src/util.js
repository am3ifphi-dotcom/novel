/**
 * util.js — 幾何・数学・ノイズ・Canvas の共通ヘルパー
 * 外部アセットに依存しない「プロシージャル代替」の土台。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ------------------------------------------------------------------ */
/* 数学                                                                */
/* ------------------------------------------------------------------ */

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => t * t * (3 - 2 * t);
export const deg = (d) => (d * Math.PI) / 180;

/** 決定論的乱数（毎回同じ見た目にするため） */
export function makeRng(seed = 1) {
  let s = (seed >>> 0) || 1;
  return function rng() {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/* ノイズ                                                              */
/* ------------------------------------------------------------------ */

function hash2i(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** タイル可能なバリューノイズ */
export function makeNoise(seed = 7, period = 64) {
  const wrap = (a) => ((a % period) + period) % period;
  return function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = hash2i(wrap(xi), wrap(yi), seed);
    const b = hash2i(wrap(xi + 1), wrap(yi), seed);
    const c = hash2i(wrap(xi), wrap(yi + 1), seed);
    const d = hash2i(wrap(xi + 1), wrap(yi + 1), seed);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };
}

/** fBm（フラクタルブラウン運動） */
export function fbm(noise, x, y, oct = 4, lac = 2, gain = 0.5) {
  let sum = 0, amp = 0.5, freq = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * noise(x * freq, y * freq);
    norm += amp;
    amp *= gain;
    freq *= lac;
  }
  return sum / norm;
}

/* ------------------------------------------------------------------ */
/* Canvas                                                              */
/* ------------------------------------------------------------------ */

/** 2D コンテキスト付きキャンバスを作る */
export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { canvas: c, ctx: c.getContext('2d') };
}

/** 日本語フォントスタック（チョーク・手書き・活字の3系統） */
export const FONT = {
  chalk: '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans JP", "Meiryo", sans-serif',
  hand: '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans JP", "Meiryo", sans-serif',
  print: '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans JP", "Meiryo", sans-serif',
  mono: '"SFMono-Regular", "Menlo", "Consolas", "Noto Sans Mono CJK JP", monospace',
};

/** Canvas から sRGB の CanvasTexture を作る */
export function canvasTexture(canvas, repeat = [1, 1], aniso = 4) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

/** Canvas から線形（データ用）テクスチャを作る */
export function dataTexture(canvas, repeat = [1, 1]) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.needsUpdate = true;
  return t;
}

/** 台形にゆがんだ矩形を塗る（遠近つき紙など） */
export function fillQuad(ctx, p0, p1, p2, p3, style) {
  ctx.beginPath();
  ctx.moveTo(p0[0], p0[1]);
  ctx.lineTo(p1[0], p1[1]);
  ctx.lineTo(p2[0], p2[1]);
  ctx.lineTo(p3[0], p3[1]);
  ctx.closePath();
  ctx.fillStyle = style;
  ctx.fill();
}

/** 角丸矩形 */
export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** 折れ線を手ぶれさせて描く（チョーク／手書き風） */
export function wobblyPath(ctx, pts, jitter = 1.4, rng = Math.random) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i];
    const jx = x + (rng() - 0.5) * jitter * 2;
    const jy = y + (rng() - 0.5) * jitter * 2;
    if (i === 0) ctx.moveTo(jx, jy);
    else ctx.lineTo(jx, jy);
  }
}

/** 複数行テキスト（\n 対応） */
export function drawLines(ctx, text, x, y, lineHeight, opts = {}) {
  const { maxWidth = null, align = 'left' } = opts;
  ctx.textAlign = align;
  const lines = String(text).split('\n');
  lines.forEach((ln, i) => {
    if (maxWidth) ctx.fillText(ln, x, y + i * lineHeight, maxWidth);
    else ctx.fillText(ln, x, y + i * lineHeight);
  });
  return y + lines.length * lineHeight;
}

/* ------------------------------------------------------------------ */
/* ジオメトリ                                                          */
/* ------------------------------------------------------------------ */

/**
 * 実寸スケールで UV を張れる BoxGeometry。
 * マージしても木目のスケールが破綻しないように、面ごとに UV を実寸へ伸縮する。
 */
export function box(w, h, d, uvScale = 1) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // BoxGeometry の面順: +X, -X, +Y, -Y, +Z, -Z（各4頂点）
  const dims = [
    [d, h], // +X : u=奥行き v=高さ
    [d, h], // -X
    [w, d], // +Y
    [w, d], // -Y
    [w, h], // +Z
    [w, h], // -Z
  ];
  for (let f = 0; f < 6; f++) {
    const [su, sv] = dims[f];
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i;
      uv.setXY(idx, uv.getX(idx) * (su / uvScale), uv.getY(idx) * (sv / uvScale));
    }
  }
  uv.needsUpdate = true;
  return g;
}

export function boxAt(w, h, d, x, y, z, uvScale = 1) {
  const g = box(w, h, d, uvScale);
  g.translate(x, y, z);
  return g;
}

export function cyl(rt, rb, h, seg = 12, openEnded = false) {
  return new THREE.CylinderGeometry(rt, rb, h, seg, 1, openEnded);
}

export function cylAt(rt, rb, h, x, y, z, seg = 12, openEnded = false) {
  const g = cyl(rt, rb, h, seg, openEnded);
  g.translate(x, y, z);
  return g;
}

/** 横向き（Z軸）シリンダ */
export function cylZAt(r, len, x, y, z, seg = 10) {
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

/** 平面（既定で -Y / +Z 向きを選べる） */
export function planeAt(w, h, x, y, z, rot = {}) {
  const g = new THREE.PlaneGeometry(w, h);
  if (rot.x) g.rotateX(rot.x);
  if (rot.y) g.rotateY(rot.y);
  if (rot.z) g.rotateZ(rot.z);
  g.translate(x, y, z);
  return g;
}

/** まとめてマージ（属性セットは Box/Plane/Cyl で一致済み） */
export function mergeAll(list) {
  const filtered = list.filter(Boolean);
  if (!filtered.length) return new THREE.BufferGeometry();
  if (filtered.length === 1) return filtered[0];
  const g = mergeGeometries(filtered, false);
  filtered.forEach((x) => x.dispose && x.dispose());
  return g || new THREE.BufferGeometry();
}

/** ジオメトリの UV を一律スケールする */
export function scaleUV(geo, su, sv) {
  const uv = geo.attributes.uv;
  if (!uv) return geo;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
  return geo;
}

/* ------------------------------------------------------------------ */
/* 太陽方向まわり                                                      */
/* ------------------------------------------------------------------ */

/** 仰角・方位角から太陽位置（原点基準）を得る。azi=0 が +X（窓側） */
export function sunDirection(elevDeg, aziDeg, radius = 12) {
  const e = deg(elevDeg);
  const a = deg(aziDeg);
  return new THREE.Vector3(
    radius * Math.cos(e) * Math.cos(a),
    radius * Math.sin(e),
    radius * Math.cos(e) * Math.sin(a)
  );
}

/** スカイドーム上の太陽 UV（Canvas 座標）を求める */
export function sunCanvasUV(dir, w, h) {
  const d = dir.clone().normalize();
  const phi = Math.atan2(d.z, d.x); // -π..π
  let u = (Math.PI - phi) / (2 * Math.PI);
  u = u - Math.floor(u);
  const theta = Math.acos(clamp(d.y, -1, 1));
  return { x: u * w, y: (theta / Math.PI) * h };
}

/* ------------------------------------------------------------------ */
/* その他                                                              */
/* ------------------------------------------------------------------ */

/** 配列から決定論的に1つ選ぶ */
export function pick(arr, rng) {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

/** Promise にタイムアウトを付ける */
export function withTimeout(promise, ms, label = 'task') {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout: ${label}`)), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}
