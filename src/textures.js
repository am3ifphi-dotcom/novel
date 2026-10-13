/**
 * textures.js — プロシージャル・テクスチャ
 * 外部アセットが1つも取れなくても、これだけで教室は成立する（障害耐性の要）。
 * すべて Canvas 2D で生成し、ダウンロード量は 0 バイト。
 */
import * as THREE from 'three';
import { makeCanvas, canvasTexture, dataTexture, makeNoise, fbm, makeRng, clamp } from './util.js';

const cache = new Map();
function cached(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

/* ------------------------------------------------------------------ */
/* 基材の色（原作のトーン：乾いた午後、彩度控えめ）                      */
/* ------------------------------------------------------------------ */
export const PALETTE = {
  floorWood: ['#8a6a45', '#6f5233', '#a28157'],
  wallPlaster: ['#ded8ca', '#cec7b7', '#e9e4d9'],
  ceiling: '#efece4',
  wood: ['#b08850', '#8d6a3c', '#c79b62'],
  metal: '#8f959b',
  darkMetal: '#4c5257',
  fabric: '#7f8a94',
  chalk: '#f4f6f2',
  blackboard: '#1d3229',
  navyTie: '#22305c',
  wineTie: '#6d2233',
};

/* ------------------------------------------------------------------ */
/* 1) 木の床（寄木張り／ワックスがけ）                                   */
/* ------------------------------------------------------------------ */
export function woodFloorTexture(size = 512, repeat = [6, 8]) {
  return cached(`floor:${size}:${repeat}`, () => {
    const { canvas, ctx } = makeCanvas(size, size);
    const n = makeNoise(11, 64);
    const rng = makeRng(2024);

    ctx.fillStyle = PALETTE.floorWood[1];
    ctx.fillRect(0, 0, size, size);

    // 板（U方向に流れる細長い板材）
    const planks = 8;
    const pw = size / planks;
    for (let i = 0; i < planks; i++) {
      const shade = 0.82 + rng() * 0.32;
      const base = [138, 106, 69].map((c) => clamp(c * shade, 0, 255) | 0);
      ctx.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
      ctx.fillRect(i * pw, 0, pw, size);

      // 木目
      ctx.save();
      ctx.beginPath();
      ctx.rect(i * pw, 0, pw, size);
      ctx.clip();
      for (let k = 0; k < 26; k++) {
        const y0 = rng() * size;
        const amp = 1.5 + rng() * 5;
        ctx.strokeStyle = `rgba(${base[0] * 0.72 | 0},${base[1] * 0.7 | 0},${base[2] * 0.68 | 0},${0.10 + rng() * 0.22})`;
        ctx.lineWidth = 0.6 + rng() * 1.7;
        ctx.beginPath();
        for (let x = 0; x <= pw; x += 8) {
          const y = y0 + Math.sin((x / pw) * Math.PI * (1 + rng() * 0.02) + k) * amp;
          x === 0 ? ctx.moveTo(i * pw + x, y) : ctx.lineTo(i * pw + x, y);
        }
        ctx.stroke();
      }
      // 節
      if (rng() > 0.6) {
        const kx = i * pw + pw * (0.25 + rng() * 0.5);
        const ky = rng() * size;
        for (let r = 7; r > 0; r--) {
          ctx.strokeStyle = `rgba(60,42,26,${0.05 + (7 - r) * 0.035})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.ellipse(kx, ky, r * 1.7, r, 0.4, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();

      // 板の継ぎ目
      ctx.fillStyle = 'rgba(40,28,16,0.42)';
      ctx.fillRect(i * pw, 0, 1.2, size);
      // 継ぎ目のハイライト
      ctx.fillStyle = 'rgba(255,240,214,0.08)';
      ctx.fillRect(i * pw + 1.2, 0, 1, size);
    }

    // 継ぎ手（V方向・ランダム位置）
    for (let i = 0; i < planks; i++) {
      const jy = Math.floor(rng() * 4) * (size / 4) + (i % 2) * (size / 8);
      ctx.fillStyle = 'rgba(40,28,16,0.34)';
      ctx.fillRect(i * pw, jy % size, pw, 1.2);
    }

    // ワックスのムラ・傷
    for (let y = 0; y < size; y += 2) {
      for (let x = 0; x < size; x += 2) {
        const v = fbm(n, (x / size) * 6, (y / size) * 6, 4);
        if (v > 0.62) {
          ctx.fillStyle = `rgba(255,246,226,${(v - 0.62) * 0.30})`;
          ctx.fillRect(x, y, 2, 2);
        } else if (v < 0.34) {
          ctx.fillStyle = `rgba(48,34,20,${(0.34 - v) * 0.42})`;
          ctx.fillRect(x, y, 2, 2);
        }
      }
    }
    // 通行による擦れ（教室の動線）
    ctx.globalAlpha = 0.10;
    ctx.fillStyle = '#f3e4c6';
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(0, size * (0.16 + i * 0.19) + (rng() - 0.5) * 20, size, 12 + rng() * 16);
    }
    ctx.globalAlpha = 1;

    return canvasTexture(canvas, repeat, 8);
  });
}

/* ------------------------------------------------------------------ */
/* 2) 塗り壁（プラスター）                                              */
/* ------------------------------------------------------------------ */
export function plasterTexture(size = 512, repeat = [4, 2], tint = null) {
  return cached(`plaster:${size}:${repeat}:${tint}`, () => {
    const { canvas, ctx } = makeCanvas(size, size);
    const n = makeNoise(37, 64);
    const rng = makeRng(88);
    const img = ctx.createImageData(size, size);
    const base = tint
      ? [parseInt(tint.slice(1, 3), 16), parseInt(tint.slice(3, 5), 16), parseInt(tint.slice(5, 7), 16)]
      : [222, 216, 202];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const v = fbm(n, (x / size) * 7, (y / size) * 7, 5);
        const fine = fbm(n, (x / size) * 40, (y / size) * 40, 2) * 0.35;
        const s = 0.88 + (v - 0.5) * 0.24 + (fine - 0.17) * 0.14;
        const i = (y * size + x) * 4;
        img.data[i] = clamp(base[0] * s, 0, 255);
        img.data[i + 1] = clamp(base[1] * s, 0, 255);
        img.data[i + 2] = clamp(base[2] * s, 0, 255);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // 腰板との境界の汚れ
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#8a7c62';
    for (let i = 0; i < 30; i++) ctx.fillRect(rng() * size, size - 60 - rng() * 60, 2 + rng() * 30, 60);
    ctx.globalAlpha = 1;
    return canvasTexture(canvas, repeat, 4);
  });
}

/* ------------------------------------------------------------------ */
/* 3) 天井（吸音ボードのグリッド）                                       */
/* ------------------------------------------------------------------ */
export function ceilingTexture(size = 512, repeat = [7, 9]) {
  return cached(`ceil:${size}:${repeat}`, () => {
    const { canvas, ctx } = makeCanvas(size, size);
    const n = makeNoise(53, 64);
    ctx.fillStyle = PALETTE.ceiling;
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 2)
      for (let x = 0; x < size; x += 2) {
        const v = fbm(n, (x / size) * 34, (y / size) * 34, 3);
        ctx.fillStyle = `rgba(140,132,116,${0.05 + v * 0.10})`;
        ctx.fillRect(x, y, 2, 2);
        if (v > 0.72) { ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(x, y, 2, 2); }
      }
    // 目地
    ctx.strokeStyle = 'rgba(150,144,130,0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, size - 2, size - 2);
    return canvasTexture(canvas, repeat, 4);
  });
}

/* ------------------------------------------------------------------ */
/* 4) 木（机・椅子・棚）                                                 */
/* ------------------------------------------------------------------ */
export function woodTexture(size = 512, repeat = [3, 3]) {
  return cached(`wood:${size}:${repeat}`, () => {
    const { canvas, ctx } = makeCanvas(size, size);
    const n = makeNoise(101, 64);
    const rng = makeRng(4242);
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // U方向に伸びる木目
        const warp = fbm(n, (x / size) * 3, (y / size) * 10, 3) * 2.2;
        const grain = Math.sin((y / size) * 46 + warp * 9) * 0.5 + 0.5;
        const v = fbm(n, (x / size) * 9, (y / size) * 3, 4);
        const g = Math.pow(grain, 2.1);
        const s = 0.80 + v * 0.24 + g * 0.16;
        const i = (y * size + x) * 4;
        img.data[i] = clamp(176 * s, 0, 255);
        img.data[i + 1] = clamp(136 * s, 0, 255);
        img.data[i + 2] = clamp(80 * s, 0, 255);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // 天板の傷
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = '#3a2a16';
    for (let i = 0; i < 40; i++) {
      ctx.lineWidth = 0.6 + rng() * 0.7;
      ctx.beginPath();
      const x0 = rng() * size, y0 = rng() * size, len = 8 + rng() * 60, a = rng() * Math.PI;
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + Math.cos(a) * len, y0 + Math.sin(a) * len);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return canvasTexture(canvas, repeat, 4);
  });
}

/* ------------------------------------------------------------------ */
/* 5) 金属（ヘアライン）                                                 */
/* ------------------------------------------------------------------ */
export function metalTexture(size = 256, repeat = [4, 4], base = '#8f959b') {
  return cached(`metal:${size}:${repeat}:${base}`, () => {
    const { canvas, ctx } = makeCanvas(size, size);
    const rng = makeRng(9);
    const c = [parseInt(base.slice(1, 3), 16), parseInt(base.slice(3, 5), 16), parseInt(base.slice(5, 7), 16)];
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 1400; i++) {
      const y = rng() * size;
      ctx.strokeStyle = `rgba(255,255,255,${rng() * 0.10})`;
      ctx.lineWidth = 0.5 + rng() * 0.6;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y + (rng() - 0.5) * 1.5);
      ctx.stroke();
    }
    for (let i = 0; i < 300; i++) {
      const y = rng() * size;
      ctx.strokeStyle = `rgba(0,0,0,${rng() * 0.10})`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }
    // 錆び（北棟の老朽感）
    ctx.globalAlpha = 0.10;
    for (let i = 0; i < 22; i++) {
      ctx.fillStyle = `rgb(${120 + rng() * 40 | 0},${70 + rng() * 30 | 0},${30})`;
      ctx.beginPath();
      ctx.ellipse(rng() * size, rng() * size, 2 + rng() * 9, 1 + rng() * 5, rng() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    void c;
    return canvasTexture(canvas, repeat, 4);
  });
}

/* ------------------------------------------------------------------ */
/* 6) 布（カーテン・椅子の座面）                                          */
/* ------------------------------------------------------------------ */
export function fabricTexture(size = 256, repeat = [3, 3], base = '#7f8a94') {
  return cached(`fabric:${size}:${repeat}:${base}`, () => {
    const { canvas, ctx } = makeCanvas(size, size);
    const rng = makeRng(31);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 3) {
      ctx.fillStyle = `rgba(0,0,0,${0.05 + rng() * 0.06})`;
      ctx.fillRect(0, y, size, 1.4);
    }
    for (let x = 0; x < size; x += 3) {
      ctx.fillStyle = `rgba(255,255,255,${0.03 + rng() * 0.05})`;
      ctx.fillRect(x, 0, 1.4, size);
    }
    const n = makeNoise(77, 64);
    for (let y = 0; y < size; y += 2)
      for (let x = 0; x < size; x += 2) {
        const v = fbm(n, (x / size) * 12, (y / size) * 12, 3);
        ctx.fillStyle = `rgba(0,0,0,${(1 - v) * 0.12})`;
        ctx.fillRect(x, y, 2, 2);
      }
    return canvasTexture(canvas, repeat, 4);
  });
}

/* ------------------------------------------------------------------ */
/* 7) グレースケールの汎用ラフネス／ノーマル                              */
/* ------------------------------------------------------------------ */
export function grayNoiseTexture(size = 256, repeat = [4, 4], bias = 0.62, contrast = 0.5) {
  return cached(`gray:${size}:${repeat}:${bias}:${contrast}`, () => {
    const { canvas, ctx } = makeCanvas(size, size);
    const n = makeNoise(199, 64);
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const v = clamp(bias + (fbm(n, (x / size) * 16, (y / size) * 16, 4) - 0.5) * contrast, 0, 1);
        const i = (y * size + x) * 4;
        const g = (v * 255) | 0;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = g;
        img.data[i + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    return dataTexture(canvas, repeat);
  });
}

/** 法線マップもどき（高さ場から簡易に生成） */
export function normalFromNoise(size = 256, repeat = [4, 4], strength = 1.6, detail = 18) {
  return cached(`nrm:${size}:${repeat}:${strength}:${detail}`, () => {
    const n = makeNoise(199, 64);
    const h = new Float32Array(size * size);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) h[y * size + x] = fbm(n, (x / size) * detail, (y / size) * detail, 4);
    const { canvas, ctx } = makeCanvas(size, size);
    const img = ctx.createImageData(size, size);
    const at = (x, y) => h[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
        const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
        let nx = -dx, ny = -dy, nz = 1;
        const l = Math.hypot(nx, ny, nz);
        nx /= l; ny /= l; nz /= l;
        const i = (y * size + x) * 4;
        img.data[i] = ((nx * 0.5 + 0.5) * 255) | 0;
        img.data[i + 1] = ((ny * 0.5 + 0.5) * 255) | 0;
        img.data[i + 2] = ((nz * 0.5 + 0.5) * 255) | 0;
        img.data[i + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    return dataTexture(canvas, repeat);
  });
}

/* ------------------------------------------------------------------ */
/* 8) 空のグラデーション（スカイドーム用）                                */
/* ------------------------------------------------------------------ */
export function skyTexture(stops, sunDir = null, w = 96, h = 384) {
  const { canvas, ctx } = makeCanvas(w, h);

  // グラデーションのストップは [色, 位置] ／ [位置, 色] のどちらの順序でも受け付ける。
  // 数値でない位置や空の色は黙って捨てる（Canvas の addColorStop は非有限値で例外になるため）。
  const parsed = (Array.isArray(stops) ? stops : [])
    .map((s) => {
      if (!Array.isArray(s) || s.length < 2) return null;
      const [a, b] = s;
      const numFirst = typeof a === 'number' && !Number.isNaN(a);
      const pos = numFirst ? a : b;
      const color = numFirst ? b : a;
      if (!Number.isFinite(pos) || typeof color !== 'string' || color === '') return null;
      return { pos: clamp(pos, 0, 1), color };
    })
    .filter(Boolean)
    .sort((m, n) => m.pos - n.pos);

  // 全部おかしかったときの保険（青空）
  const list = parsed.length >= 2
    ? parsed
    : [{ pos: 0, color: '#3f79c0' }, { pos: 0.5, color: '#a8c8e8' }, { pos: 1, color: '#dfe8ee' }];

  const g = ctx.createLinearGradient(0, 0, 0, h);
  list.forEach((s) => g.addColorStop(s.pos, s.color));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  if (sunDir && Number.isFinite(sunDir.x + sunDir.y + sunDir.z)) {
    const { x, y } = (function () {
      const d = sunDir.clone().normalize();
      const phi = Math.atan2(d.z, d.x);
      let u = (Math.PI - phi) / (2 * Math.PI);
      u -= Math.floor(u);
      const theta = Math.acos(clamp(d.y, -1, 1));
      return { x: u * w, y: (theta / Math.PI) * h };
    })();
    // 水平方向に巻き戻して3回描く（継ぎ目対策）
    if (!Number.isFinite(x) || !Number.isFinite(y)) return finalizeSky(canvas);
    for (const off of [-w, 0, w]) {
      const rg = ctx.createRadialGradient(x + off, y, 0, x + off, y, h * 0.55);
      rg.addColorStop(0, 'rgba(255,250,232,0.95)');
      rg.addColorStop(0.10, 'rgba(255,240,205,0.55)');
      rg.addColorStop(0.35, 'rgba(255,225,180,0.16)');
      rg.addColorStop(1, 'rgba(255,220,170,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);
    }
  }
  return finalizeSky(canvas);
}

function finalizeSky(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

/* ------------------------------------------------------------------ */
/* 9) 窓の外の遠景（山・田んぼ・送電線）                                  */
/* 第五章「田んぼ。山。川。送電線。トンネル。」                          */
/* ------------------------------------------------------------------ */
export function landscapeTexture(tint = '#ffffff', w = 1024, h = 512) {
  const { canvas, ctx } = makeCanvas(w, h);
  const rng = makeRng(1357);
  const horizon = h * 0.66;

  // 空は透明（スカイドームが担当）
  ctx.clearRect(0, 0, w, h);

  // --- 遠い山並み（3層） ---
  const layers = [
    { color: 'rgba(126,140,158,0.85)', base: 0.50, amp: 0.16, rough: 0.010, seed: 1 },
    { color: 'rgba(104,120,138,0.92)', base: 0.56, amp: 0.13, rough: 0.016, seed: 2 },
    { color: 'rgba(78,96,110,0.96)', base: 0.62, amp: 0.10, rough: 0.026, seed: 3 },
  ];
  layers.forEach((L) => {
    const n = makeNoise(L.seed * 17 + 5, 64);
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 4) {
      const v = fbm(n, (x / w) * 8, 0.5, 5, 2.1, 0.52);
      const ridge = Math.pow(Math.abs(Math.sin((x / w) * Math.PI * 2.2 + L.seed)), 1.6);
      const y = h * (L.base + L.amp * (0.5 - v) - ridge * 0.10);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = L.color;
    ctx.fill();
  });

  // --- 中景の丘陵（田んぼのパッチワーク） ---
  const g = ctx.createLinearGradient(0, horizon - 10, 0, h);
  g.addColorStop(0, 'rgba(126,140,96,1)');
  g.addColorStop(0.45, 'rgba(150,158,104,1)');
  g.addColorStop(1, 'rgba(112,124,80,1)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, horizon + 6);
  for (let x = 0; x <= w; x += 12) ctx.lineTo(x, horizon + 6 + Math.sin(x * 0.004 + 1.2) * 8);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  // 田んぼの区画（遠近で台形に）
  for (let i = 0; i < 130; i++) {
    const yy = horizon + 12 + Math.pow(rng(), 0.6) * (h - horizon - 12);
    const t = (yy - horizon) / (h - horizon);
    const ww = (18 + rng() * 60) * (0.35 + t * 2.0);
    const xx = rng() * w;
    const greens = ['rgba(150,168,96,0.55)', 'rgba(126,146,82,0.55)', 'rgba(168,176,110,0.5)', 'rgba(112,132,74,0.6)', 'rgba(186,190,140,0.45)'];
    ctx.fillStyle = greens[(rng() * greens.length) | 0];
    ctx.fillRect(xx, yy, ww, 4 + t * 16);
  }

  // --- 送電線（鉄塔のシルエット） ---
  ctx.strokeStyle = 'rgba(58,64,72,0.55)';
  ctx.lineWidth = 1.6;
  for (let k = 0; k < 4; k++) {
    const tx = 130 + k * 250 + rng() * 60;
    const th = 150 - k * 12;
    const ty = horizon - th + 42;
    ctx.beginPath();
    ctx.moveTo(tx - 26, horizon + 4);
    ctx.lineTo(tx - 8, ty);
    ctx.lineTo(tx + 8, ty);
    ctx.lineTo(tx + 26, horizon + 4);
    ctx.moveTo(tx - 26, horizon + 4);
    ctx.lineTo(tx + 26, horizon + 4);
    for (let j = 0; j < 4; j++) {
      const yy = ty + 10 + j * ((horizon - ty) / 5);
      ctx.moveTo(tx - 22 - j * 1.2, yy);
      ctx.lineTo(tx + 22 + j * 1.2, yy);
    }
    ctx.stroke();
  }
  // 送電線のワイヤー（たるみ）
  ctx.strokeStyle = 'rgba(48,54,62,0.42)';
  ctx.lineWidth = 1.3;
  for (let k = 0; k < 3; k++) {
    for (let j = 0; j < 4; j++) {
      const x0 = 130 + k * 250, x1 = 130 + (k + 1) * 250;
      const y0 = horizon - 150 + k * 12 + 52 + j * 24;
      const y1 = horizon - 150 + (k + 1) * 12 + 52 + j * 24;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + 26, x1, y1);
      ctx.stroke();
    }
  }

  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  t.userData.tintable = true;
  void tint;
  return t;
}

/* ------------------------------------------------------------------ */
/* 10) 田んぼの地面（窓の外・2階分下）                                   */
/* ------------------------------------------------------------------ */
export function fieldGroundTexture(size = 512, repeat = [8, 8]) {
  return cached(`field:${size}:${repeat}`, () => {
    const { canvas, ctx } = makeCanvas(size, size);
    const rng = makeRng(777);
    const n = makeNoise(13, 64);
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const v = fbm(n, (x / size) * 9, (y / size) * 9, 4);
        const i = (y * size + x) * 4;
        img.data[i] = clamp(96 + v * 74, 0, 255);
        img.data[i + 1] = clamp(112 + v * 66, 0, 255);
        img.data[i + 2] = clamp(70 + v * 44, 0, 255);
        img.data[i + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    // 畦道
    ctx.strokeStyle = 'rgba(150,142,112,0.5)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      const y = (i / 8) * size;
      ctx.moveTo(0, y + (rng() - 0.5) * 10);
      ctx.lineTo(size, y + (rng() - 0.5) * 10);
      ctx.stroke();
    }
    return canvasTexture(canvas, repeat, 4);
  });
}

/* ------------------------------------------------------------------ */
/* 11) 光の筋／埃のスプライト                                            */
/* ------------------------------------------------------------------ */
export function beamTexture(w = 128, h = 64) {
  return cached(`beam:${w}:${h}`, () => {
    const { canvas, ctx } = makeCanvas(w, h);
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = x / (w - 1);          // 窓→奥
        const v = Math.abs(y / (h - 1) - 0.5) * 2; // 中心からの距離
        const across = Math.pow(Math.cos((v * Math.PI) / 2), 1.4);
        const along = Math.pow(1 - u, 1.25);
        const a = across * along;
        const i = (y * w + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = clamp(a * 255, 0, 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.needsUpdate = true;
    return t;
  });
}

export function dustSprite(size = 64) {
  return cached(`dust:${size}`, () => {
    const { canvas, ctx } = makeCanvas(size, size);
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,252,240,1)');
    g.addColorStop(0.35, 'rgba(255,248,228,0.55)');
    g.addColorStop(1, 'rgba(255,244,220,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  });
}

/* ------------------------------------------------------------------ */
/* 12) コンクリート（廊下・室外機まわり）                                 */
/* ------------------------------------------------------------------ */
export function concreteTexture(size = 256, repeat = [3, 3]) {
  return cached(`concrete:${size}:${repeat}`, () => {
    const { canvas, ctx } = makeCanvas(size, size);
    const n = makeNoise(311, 64);
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const v = fbm(n, (x / size) * 6, (y / size) * 6, 5);
        const fine = fbm(n, (x / size) * 30, (y / size) * 30, 2);
        const s = 0.72 + v * 0.30 + fine * 0.10;
        const i = (y * size + x) * 4;
        img.data[i] = clamp(176 * s, 0, 255);
        img.data[i + 1] = clamp(172 * s, 0, 255);
        img.data[i + 2] = clamp(164 * s, 0, 255);
        img.data[i + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    return canvasTexture(canvas, repeat, 4);
  });
}

/** 生成済みテクスチャを破棄する（メモリ対策） */
export function disposeTextureCache() {
  cache.forEach((t) => t.dispose && t.dispose());
  cache.clear();
}
