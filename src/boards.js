/**
 * boards.js — Canvas 2D で生成する「文字もの」
 * 黒板（3状態）・時計・掲示板・時間割・自販機の面板・スマホ画面・ノート・本の表紙。
 * すべて日本語フォントスタックで動的生成。ダウンロード量 0 バイト。
 */
import * as THREE from 'three';
import { makeCanvas, FONT, roundRect, wobblyPath, drawLines, makeRng, clamp } from './util.js';

function tex(canvas, srgb = true, aniso = 8) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

/* ================================================================== */
/* 黒板                                                                */
/* ================================================================== */
export const BOARD_W = 1560;
export const BOARD_H = 480;

function chalkBase(ctx) {
  // 濃い緑の板
  const g = ctx.createLinearGradient(0, 0, BOARD_W, BOARD_H);
  g.addColorStop(0, '#1f3629');
  g.addColorStop(0.5, '#1b3126');
  g.addColorStop(1, '#22402f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, BOARD_W, BOARD_H);

  // 消し跡（白いモヤ）
  const rng = makeRng(9001);
  for (let i = 0; i < 90; i++) {
    const x = rng() * BOARD_W, y = rng() * BOARD_H;
    const r = 30 + rng() * 130;
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `rgba(226,236,226,${0.030 + rng() * 0.055})`);
    rg.addColorStop(1, 'rgba(226,236,226,0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.ellipse(x, y, r * (0.7 + rng()), r * 0.42, rng() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // 粉
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = `rgba(240,246,238,${rng() * 0.10})`;
    ctx.fillRect(rng() * BOARD_W, rng() * BOARD_H, 1 + rng() * 2, 1);
  }
}

/** チョークで文字を書く（かすれ＋二重ストローク） */
function chalk(ctx, draw, color = 'rgba(244,248,242,0.94)', jitter = 1.1) {
  const rng = makeRng(1234);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(230,244,232,0.30)';
  ctx.shadowBlur = 4;
  draw(ctx, rng, jitter);
  ctx.restore();
}

function chalkText(ctx, text, x, y, size, opts = {}) {
  const { weight = '600', color = 'rgba(244,248,242,0.95)', align = 'left', maxWidth = null } = opts;
  ctx.save();
  ctx.font = `${weight} ${size}px ${FONT.chalk}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  ctx.shadowColor = 'rgba(226,240,228,0.35)';
  ctx.shadowBlur = 3;
  const lines = String(text).split('\n');
  lines.forEach((ln, i) => {
    if (maxWidth) ctx.fillText(ln, x, y + i * size * 1.35, maxWidth);
    else ctx.fillText(ln, x, y + i * size * 1.35);
  });
  ctx.restore();
  return y + lines.length * size * 1.35;
}

function chalkStroke(ctx, pts, width = 3, color = 'rgba(244,248,242,0.9)', closed = false) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(226,240,228,0.3)';
  ctx.shadowBlur = 3;
  const rng = makeRng(4242);
  for (let pass = 0; pass < 2; pass++) {
    ctx.globalAlpha = pass === 0 ? 0.55 : 0.9;
    wobblyPath(ctx, pts, pass === 0 ? 2.0 : 1.0, rng);
    if (closed) ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}

/** 右上の日付・時間割（全状態共通） */
function boardHeader(ctx, timeLabel) {
  ctx.save();
  ctx.globalAlpha = 0.72;
  chalkText(ctx, timeLabel, BOARD_W - 28, 46, 26, { align: 'right', weight: '500', color: 'rgba(238,246,238,0.82)' });
  ctx.restore();
  // 区切り
  chalkStroke(ctx, [[26, 62], [BOARD_W - 26, 62]], 1.6, 'rgba(238,246,238,0.35)');
}

/* --- 状態1: 味噌の地政学 -------------------------------------------- */
function drawMiso(ctx, timeLabel) {
  chalkBase(ctx);
  boardHeader(ctx, timeLabel);
  const rng = makeRng(55);

  // 左：でかい「味噌」
  chalkText(ctx, '味噌', 62, 300, 190, { weight: '700', color: 'rgba(248,250,244,0.97)' });
  chalkText(ctx, 'みそ ／ MISO', 68, 344, 30, { weight: '400', color: 'rgba(236,244,236,0.7)' });

  // 中央：日本列島の模式図
  const cx = 820, cy = 250, s = 1.0;
  const japan = [
    [0, -120], [46, -96], [72, -52], [58, -14], [96, 6], [78, 44],
    [104, 96], [58, 132], [22, 108], [-16, 132], [-46, 96], [-30, 56],
    [-62, 22], [-40, -30], [-18, -74],
  ].map(([x, y]) => [cx + x * s, cy + y * s]);
  chalkStroke(ctx, japan, 4, 'rgba(246,250,244,0.92)', true);

  // 糸魚川-静岡構造線（赤チョーク）
  chalkStroke(ctx, [[cx + 20, cy - 96], [cx - 6, cy - 20], [cx - 30, cy + 40], [cx - 52, cy + 104]], 5, 'rgba(255,182,150,0.95)');
  chalkText(ctx, '糸魚川', cx + 34, cy - 108, 26, { color: 'rgba(255,196,168,0.95)' });
  chalkText(ctx, '静岡', cx - 118, cy + 148, 26, { color: 'rgba(255,196,168,0.95)' });
  chalkText(ctx, '糸魚川–静岡構造線', cx + 96, cy - 150, 30, { color: 'rgba(255,196,168,0.92)' });

  // 東 / 西
  chalkText(ctx, '東', cx + 168, cy - 20, 42, { color: 'rgba(226,244,238,0.75)' });
  chalkText(ctx, '西', cx - 208, cy - 20, 42, { color: 'rgba(226,244,238,0.75)' });

  // 味噌の分布ラベル
  chalkText(ctx, '赤味噌', cx - 96, cy - 40, 26, { color: 'rgba(246,214,178,0.85)' });
  chalkText(ctx, '白味噌', cx - 150, cy + 66, 26, { color: 'rgba(240,246,240,0.85)' });
  chalkText(ctx, '合わせ', cx + 40, cy + 30, 24, { color: 'rgba(246,232,196,0.8)' });

  // 右：因果の矢印
  const rx = 1180;
  const chain = ['石', '土壌', '作物', '味噌'];
  chain.forEach((w, i) => {
    const y = 130 + i * 74;
    chalkText(ctx, w, rx, y, 40, { color: 'rgba(248,250,244,0.95)' });
    if (i < chain.length - 1) {
      chalkStroke(ctx, [[rx + 12, y + 14], [rx + 12, y + 50]], 3, 'rgba(240,248,240,0.7)');
      chalkStroke(ctx, [[rx + 5, y + 42], [rx + 12, y + 52], [rx + 19, y + 42]], 3, 'rgba(240,248,240,0.7)');
    }
  });
  chalkText(ctx, '地殻変動 → 境界 → 文化', rx - 8, 438, 27, { color: 'rgba(226,244,238,0.72)' });

  // 下段の補足
  chalkText(ctx, '・醤油も変わる　　・雑煮の餅の形も変わる（西＝丸／東＝角）', 470, 424, 30, { color: 'rgba(238,248,238,0.8)' });
  void rng;
}

/* --- 状態2: 河岸段丘の断面図 ---------------------------------------- */
function drawTerrace(ctx, timeLabel) {
  chalkBase(ctx);
  boardHeader(ctx, timeLabel);
  chalkText(ctx, '河岸段丘', 54, 130, 74, { weight: '700' });
  chalkText(ctx, '（上から描く）', 60, 176, 30, { color: 'rgba(255,200,170,0.85)' });

  // 断面図
  const x0 = 470, y0 = 108, w = 900;
  const steps = [
    { w: w * 0.40, h: 54, label: '今の地表', sub: 'いま' },
    { w: w * 0.28, h: 62, label: '一段目', sub: '少し古い' },
    { w: w * 0.20, h: 66, label: '二段目', sub: 'もっと古い' },
    { w: w * 0.12, h: 70, label: '三段目', sub: 'さらに古い' },
  ];
  let x = x0, y = y0;
  chalkStroke(ctx, [[x0 - 40, y0], [x0 + w + 30, y0]], 3, 'rgba(244,248,242,0.85)');
  steps.forEach((st, i) => {
    // 段の上面 → 垂直 → 次の段
    chalkStroke(ctx, [[x, y], [x + st.w, y]], 5, 'rgba(250,252,248,0.95)');
    chalkStroke(ctx, [[x + st.w, y], [x + st.w, y + st.h]], 4, 'rgba(244,248,242,0.85)');
    chalkText(ctx, st.label, x + 12, y - 16, 30, { color: 'rgba(248,250,244,0.95)' });
    ctx.save();
    ctx.globalAlpha = 0.6;
    chalkText(ctx, st.sub, x + 14, y + 34, 24, { color: 'rgba(226,244,238,0.8)' });
    ctx.restore();
    if (i === 0) {
      // 「上から描く」矢印
      chalkStroke(ctx, [[x + st.w * 0.5, y - 66], [x + st.w * 0.5, y - 22]], 3, 'rgba(255,196,168,0.9)');
      chalkStroke(ctx, [[x + st.w * 0.5 - 8, y - 30], [x + st.w * 0.5, y - 20], [x + st.w * 0.5 + 8, y - 30]], 3, 'rgba(255,196,168,0.9)');
      chalkText(ctx, 'ここから描き始める', x + st.w * 0.5 + 16, y - 46, 26, { color: 'rgba(255,200,170,0.9)' });
    }
    x += st.w;
    y += st.h;
  });
  // 川
  chalkStroke(ctx, [[x, y], [x + 190, y + 6]], 4, 'rgba(168,214,246,0.95)');
  chalkText(ctx, '川', x + 78, y + 46, 34, { color: 'rgba(178,220,248,0.95)' });
  for (let i = 0; i < 5; i++) {
    chalkStroke(ctx, [[x + 10 + i * 38, y + 16 + i * 3], [x + 34 + i * 38, y + 40 + i * 3]], 1.6, 'rgba(168,214,246,0.5)');
  }

  // 下向きの時間軸
  chalkStroke(ctx, [[x0 - 90, y0 + 6], [x0 - 90, y0 + 250]], 3, 'rgba(244,248,242,0.6)');
  chalkStroke(ctx, [[x0 - 99, y0 + 240], [x0 - 90, y0 + 252], [x0 - 81, y0 + 240]], 3, 'rgba(244,248,242,0.6)');
  ctx.save();
  ctx.translate(x0 - 106, y0 + 150);
  ctx.rotate(-Math.PI / 2);
  chalkText(ctx, '時 間 を 掘 る', 0, 0, 28, { align: 'center', color: 'rgba(238,248,238,0.8)' });
  ctx.restore();

  chalkText(ctx, '「時間を掘ってると思ってくれ」', 60, 300, 34, { color: 'rgba(248,250,244,0.92)' });
  chalkText(ctx, '洪水のたびに川が下がり、元の河床が台地になる。', 60, 356, 28, { color: 'rgba(232,244,236,0.78)' });
  chalkText(ctx, '段丘の上と下で、集落の性質が変わる。', 60, 398, 28, { color: 'rgba(232,244,236,0.78)' });
  chalkText(ctx, '台地の上に人が住む。', 60, 440, 28, { color: 'rgba(232,244,236,0.78)' });
}

/* --- 状態3: 零の数学 ------------------------------------------------ */
function drawMath(ctx, timeLabel) {
  chalkBase(ctx);
  boardHeader(ctx, timeLabel);
  chalkText(ctx, '数学・放課後', 54, 122, 46, { weight: '700' });

  const left = [
    'f(x) = ax² + bx + c',
    'x = ( −b ± √(b² − 4ac) ) / 2a',
    '',
    'Σ(k=1→n) k = n(n+1) / 2',
    '',
    'lim(x→0) sin x / x = 1',
    '',
    '∫₀¹ x² dx = 1/3',
  ];
  left.forEach((ln, i) => {
    chalkText(ctx, ln, 62, 200 + i * 46, 34, { color: i % 2 ? 'rgba(240,248,240,0.88)' : 'rgba(248,252,246,0.95)' });
  });

  // 放物線のグラフ
  const gx = 780, gy = 300, sc = 130;
  chalkStroke(ctx, [[gx - 200, gy], [gx + 220, gy]], 3, 'rgba(244,248,242,0.8)');
  chalkStroke(ctx, [[gx, gy + 130], [gx, gy - 170]], 3, 'rgba(244,248,242,0.8)');
  const pts = [];
  for (let t = -1.7; t <= 1.7; t += 0.06) pts.push([gx + t * sc, gy - t * t * sc * 0.55]);
  chalkStroke(ctx, pts, 4, 'rgba(255,206,170,0.95)');
  chalkText(ctx, 'y = x²', gx + 150, gy - 150, 28, { color: 'rgba(255,206,170,0.95)' });
  // 接線
  const t0 = 0.9;
  const ty = (t) => gy - t * t * sc * 0.55;
  chalkStroke(ctx, [[gx - 120, ty(t0) + (2 * t0 * sc * 0.55) * (120 / sc) * 1], [gx + 170, ty(t0) - (2 * t0 * sc * 0.55) * (170 / sc)]], 2.6, 'rgba(180,222,250,0.85)');
  chalkText(ctx, '接線', gx + 182, ty(t0) - 40, 26, { color: 'rgba(180,222,250,0.85)' });

  // 右：零のひとこと
  chalkText(ctx, '「ここはこう。', 1140, 180, 34, { color: 'rgba(248,250,244,0.94)' });
  chalkText(ctx, '  これはこういう理屈。', 1140, 226, 34, { color: 'rgba(248,250,244,0.94)' });
  chalkText(ctx, '  どこわかんない？」', 1140, 272, 34, { color: 'rgba(248,250,244,0.94)' });
  chalkText(ctx, '数学に本質的なところだけ', 1140, 350, 26, { color: 'rgba(232,244,236,0.72)' });
  chalkText(ctx, 'ってないよ。全部繋がってるから。', 1140, 386, 26, { color: 'rgba(232,244,236,0.72)' });
}

const BOARD_DRAW = { miso: drawMiso, terrace: drawTerrace, math: drawMath };

export function blackboardTexture(mode = 'miso', timeLabel = '') {
  const { canvas, ctx } = makeCanvas(BOARD_W, BOARD_H);
  (BOARD_DRAW[mode] || drawMiso)(ctx, timeLabel);
  return tex(canvas, true, 16);
}

/* ================================================================== */
/* 時計                                                                */
/* ================================================================== */
export function clockTexture(hour, minute, size = 256) {
  const { canvas, ctx } = makeCanvas(size, size);
  const c = size / 2;
  ctx.clearRect(0, 0, size, size);
  // 枠
  ctx.fillStyle = '#e8e6df';
  ctx.beginPath(); ctx.arc(c, c, c - 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fbfaf6';
  ctx.beginPath(); ctx.arc(c, c, c - 14, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#5a5f63'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(c, c, c - 3, 0, Math.PI * 2); ctx.stroke();

  // 目盛り
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
    const big = i % 5 === 0;
    const r1 = c - 22, r2 = c - (big ? 38 : 30);
    ctx.strokeStyle = big ? '#2c3033' : '#8b9095';
    ctx.lineWidth = big ? 5 : 2;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
    ctx.lineTo(c + Math.cos(a) * r2, c + Math.sin(a) * r2);
    ctx.stroke();
  }
  // 数字
  ctx.fillStyle = '#2c3033';
  ctx.font = `600 ${size * 0.12}px ${FONT.print}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].forEach((n, i) => {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const r = c - 58;
    ctx.fillText(String(n), c + Math.cos(a) * r, c + Math.sin(a) * r);
  });

  const hand = (angleDeg, len, w, color) => {
    const a = (angleDeg / 180) * Math.PI - Math.PI / 2;
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(c - Math.cos(a) * len * 0.16, c - Math.sin(a) * len * 0.16);
    ctx.lineTo(c + Math.cos(a) * len, c + Math.sin(a) * len);
    ctx.stroke();
  };
  hand(((hour % 12) + minute / 60) * 30, c * 0.48, size * 0.035, '#24282b');
  hand(minute * 6, c * 0.70, size * 0.024, '#24282b');
  hand(minute * 6, c * 0.74, size * 0.008, '#c0342f'); // 秒針（赤）

  ctx.fillStyle = '#24282b';
  ctx.beginPath(); ctx.arc(c, c, size * 0.022, 0, Math.PI * 2); ctx.fill();
  return tex(canvas, true, 4);
}

/* ================================================================== */
/* 掲示板（後ろの壁）                                                    */
/* ================================================================== */
export function noticeTexture(w = 1024, h = 400) {
  const { canvas, ctx } = makeCanvas(w, h);
  const rng = makeRng(606);
  // コルクボード
  ctx.fillStyle = '#b99563';
  ctx.fillRect(0, 0, w, h);
  const n = (function () {
    let s = 99;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  })();
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = `rgba(${90 + n() * 60 | 0},${66 + n() * 44 | 0},${38 + n() * 30 | 0},${0.10 + n() * 0.18})`;
    ctx.fillRect(n() * w, n() * h, 1 + n() * 3, 1 + n() * 2);
  }
  ctx.strokeStyle = '#7d6038';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, w - 10, h - 10);

  // 紙を貼る
  const papers = [
    { x: 34, y: 34, w: 230, h: 300, rot: -0.02, head: '合格祈願', color: '#fdfaf0',
      body: '絶対合格して、\nみえみえしい高校\n生活を送るんだ！✝\n\nヘイカツ先生に会いに\n絶対合格するぞ！\n地理の✝本質✝を\n学ぶために！✝' },
    { x: 292, y: 46, w: 260, h: 280, rot: 0.015, head: '球技大会 組合せ', color: '#f7f6ef',
      body: '6月／バスケットボール\n\nA組 × B組\nC組 × D組\n\n※ 理数科は二年連続で\n　内進に負けている。\n三年目。最後。' },
    { x: 578, y: 30, w: 232, h: 310, rot: -0.01, head: '模試 上位者', color: '#fdfcf6',
      body: '1位　数理　零（理数科）\n2位　──（内進）\n3位　──（内進）\n\n「なんで理数科に\nいるんだ」\n\n※ 年に三回だけ\n　話題になる。' },
    { x: 838, y: 52, w: 152, h: 268, rot: 0.03, head: '係・連絡', color: '#f5f7f2',
      body: '日直　伊崎\n配信　寺地\n掲示　両馬\n\n忘れ物：\n・充電器 1\n・えんじネクタイ 1\n・消しゴム 1' },
  ];
  papers.forEach((p) => {
    ctx.save();
    ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
    ctx.rotate(p.rot);
    ctx.translate(-p.w / 2, -p.h / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fillRect(4, 6, p.w, p.h);
    ctx.fillStyle = p.color;
    ctx.fillRect(0, 0, p.w, p.h);
    ctx.fillStyle = '#2f3a44';
    ctx.font = `700 24px ${FONT.print}`;
    ctx.textAlign = 'center';
    ctx.fillText(p.head, p.w / 2, 40);
    ctx.strokeStyle = 'rgba(60,80,100,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(18, 54); ctx.lineTo(p.w - 18, 54); ctx.stroke();
    ctx.fillStyle = '#3a444d';
    ctx.font = `500 18px ${FONT.print}`;
    drawLines(ctx, p.body, p.w / 2, 84, 26, { align: 'center' });
    // 画鋲
    ctx.fillStyle = '#c8443c';
    ctx.beginPath(); ctx.arc(p.w / 2, 14, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.arc(p.w / 2 - 2, 12, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  });

  // ✝ の落書き（薄く）
  ctx.save();
  ctx.globalAlpha = 0.30;
  ctx.strokeStyle = '#26383c';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  const gx = 520, gy = 350, r = 26;
  ctx.beginPath();
  ctx.moveTo(gx - r, gy - r); ctx.lineTo(gx + r, gy + r);
  ctx.moveTo(gx + r, gy - r); ctx.lineTo(gx - r, gy + r);
  ctx.stroke();
  ctx.restore();
  void rng;
  return tex(canvas, true, 8);
}

/* ================================================================== */
/* 時間割（黒板わきの紙）                                               */
/* 火3＝地理、金5＝地理                                                 */
/* ================================================================== */
export function timetableTexture(w = 320, h = 420) {
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.fillStyle = '#fbfaf3';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#39424b';
  ctx.font = `700 26px ${FONT.print}`;
  ctx.textAlign = 'center';
  ctx.fillText('時 間 割', w / 2, 40);
  ctx.fillStyle = '#6d7781';
  ctx.font = `500 14px ${FONT.print}`;
  ctx.fillText('理数科B組', w / 2, 62);

  const days = ['月', '火', '水', '木', '金'];
  const grid = [
    ['数学', '国語', '英語', '数学', '理科'],
    ['英語', '数学', '数学', '英語', '国語'],
    ['理科', '地理', '理科', '地理', '体育'],
    ['国語', '理科', '国語', '理科', '数学'],
    ['体育', '英語', '体育', '英語', '地理'],
  ];
  const x0 = 26, y0 = 84, cw = (w - 52) / 5, ch = 60;
  ctx.font = `600 15px ${FONT.print}`;
  days.forEach((d, i) => {
    ctx.fillStyle = i === 1 || i === 4 ? '#2f6f8f' : '#5a636c';
    ctx.fillText(d, x0 + cw * (i + 0.5), y0 - 6);
  });
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const x = x0 + cw * c, y = y0 + ch * r;
      const isGeo = grid[r][c] === '地理';
      ctx.fillStyle = isGeo ? 'rgba(214,238,228,0.95)' : 'rgba(240,239,232,0.6)';
      ctx.fillRect(x, y, cw - 2, ch - 2);
      ctx.strokeStyle = 'rgba(120,132,144,0.45)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, cw - 2, ch - 2);
      ctx.fillStyle = isGeo ? '#1d6b4f' : '#39424b';
      ctx.font = `${isGeo ? 700 : 500} 15px ${FONT.print}`;
      ctx.fillText(grid[r][c], x + cw / 2 - 1, y + ch / 2 - 6);
    }
  }
  // 限
  ctx.fillStyle = '#8b949c';
  ctx.font = `600 12px ${FONT.print}`;
  for (let r = 0; r < 5; r++) ctx.fillText(String(r + 1), x0 - 14, y0 + ch * r + ch / 2 - 6);

  ctx.fillStyle = '#9aa3ab';
  ctx.font = `500 12px ${FONT.print}`;
  ctx.textAlign = 'left';
  ctx.fillText('※ 担当：塀 勝也（地理）', 26, h - 16);
  return tex(canvas, true, 8);
}

/* ================================================================== */
/* 自販機の面板（コーンスープだけ「品切れ」）                            */
/* ================================================================== */
export function vendingTexture(w = 512, h = 768) {
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.fillStyle = '#1b2a3a';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#233448';
  ctx.fillRect(14, 14, w - 28, h - 28);

  // 上部のヘッダー
  ctx.fillStyle = '#e8f0f6';
  ctx.fillRect(28, 28, w - 56, 88);
  ctx.fillStyle = '#123';
  ctx.font = `700 40px ${FONT.print}`;
  ctx.textAlign = 'center';
  ctx.fillText('自 販 機', w / 2, 74);
  ctx.fillStyle = '#b8402f';
  ctx.font = `600 24px ${FONT.print}`;
  ctx.fillText('北棟', w / 2, 106);

  // 商品棚
  const rows = [
    { label: 'ミネラルウォーター', color: '#7ec8e8', sold: false },
    { label: 'カフェオレ', color: '#c89a6a', sold: false },
    { label: 'コーンスープ', color: '#f0c860', sold: true },
    { label: 'スポーツドリンク', color: '#9fdcc0', sold: false },
  ];
  const y0 = 148, rh = 128;
  rows.forEach((row, i) => {
    const y = y0 + i * rh;
    ctx.fillStyle = row.sold ? '#141d29' : '#0e1620';
    ctx.fillRect(28, y, w - 56, rh - 18);
    ctx.strokeStyle = 'rgba(120,150,180,0.30)';
    ctx.lineWidth = 2;
    ctx.strokeRect(28, y, w - 56, rh - 18);

    if (row.sold) {
      // 空のスロット
      for (let k = 0; k < 5; k++) {
        ctx.fillStyle = 'rgba(10,14,20,0.9)';
        roundRect(ctx, 44 + k * 88, y + 18, 66, rh - 54, 8);
        ctx.fill();
        ctx.strokeStyle = 'rgba(90,110,130,0.35)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.fillStyle = '#5c6a78';
      ctx.font = `600 22px ${FONT.print}`;
      ctx.fillText('品 切 れ', w / 2, y + 60);
      ctx.fillStyle = '#7c8a98';
      ctx.font = `500 16px ${FONT.print}`;
      ctx.fillText('（三ヶ月補充されていない）', w / 2, y + 86);
    } else {
      for (let k = 0; k < 5; k++) {
        ctx.fillStyle = row.color;
        roundRect(ctx, 44 + k * 88, y + 16, 66, rh - 52, 10);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.32)';
        roundRect(ctx, 50 + k * 88, y + 22, 20, rh - 66, 8);
        ctx.fill();
        ctx.fillStyle = '#0e1620';
        ctx.font = `700 14px ${FONT.print}`;
        ctx.fillText('150', 44 + k * 88 + 33, y + rh - 28);
      }
    }
    // ラベル
    ctx.fillStyle = row.sold ? '#6a7886' : '#dfe9f2';
    ctx.font = `600 18px ${FONT.print}`;
    ctx.textAlign = 'left';
    ctx.fillText(row.label, 34, y + rh - 26);
    ctx.textAlign = 'center';
  });

  // 下部
  ctx.fillStyle = '#0e1620';
  ctx.fillRect(28, y0 + rows.length * rh + 4, w - 56, 96);
  ctx.fillStyle = '#c8d4de';
  ctx.font = `600 18px ${FONT.print}`;
  ctx.fillText('＊ お金を入れてボタンを押してください ＊', w / 2, y0 + rows.length * rh + 58);
  return tex(canvas, true, 8);
}

/* ================================================================== */
/* スマホの画面（両馬の掲示板書き込み）                                  */
/* ================================================================== */
export function phoneScreenTexture(w = 256, h = 512) {
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.fillStyle = '#0b0f14';
  ctx.fillRect(0, 0, w, h);
  // ヘッダー
  ctx.fillStyle = '#15202c';
  ctx.fillRect(0, 0, w, 54);
  ctx.fillStyle = '#dfe7ee';
  ctx.font = `700 20px ${FONT.print}`;
  ctx.textAlign = 'left';
  ctx.fillText('ヘイカツ雑談スレ', 14, 34);
  ctx.fillStyle = '#6d7d8c';
  ctx.font = `500 13px ${FONT.print}`;
  ctx.fillText('4人しかいない過疎スレ', 14, 50);

  const posts = [
    { n: '87', t: '今日のヘイカツまじやばかった。', s: '1分前' },
    { n: '88', t: '味噌の分布が地殻変動で決まるって。', s: '1分前' },
    { n: '89', t: '朝飯が何億年前の地面で決まってるって。\nこれまじ✝本質✝', s: '1分前', hl: true },
    { n: '90', t: '＞89\n入れるな', s: '58秒前' },
    { n: '91', t: '今日の電線✝本質✝感ある', s: '41秒前', hl: true },
    { n: '92', t: '＞91\n意味がわからない', s: '30秒前' },
    { n: '93', t: 'コーンスープは、あるときより\nないときの方が本質である。', s: '12秒前', hl: true },
  ];
  let y = 82;
  posts.forEach((p) => {
    ctx.fillStyle = p.hl ? 'rgba(228,196,120,0.12)' : 'rgba(255,255,255,0.035)';
    roundRect(ctx, 10, y - 20, w - 20, p.t.includes('\n') ? 62 : 44, 6);
    ctx.fill();
    ctx.font = `600 13px ${FONT.mono}`;
    ctx.fillStyle = '#5c6b79';
    ctx.fillText(p.n, 18, y - 4);
    ctx.font = `500 14px ${FONT.print}`;
    ctx.fillStyle = p.hl ? '#f0e2ba' : '#cfd9e2';
    drawLines(ctx, p.t, 48, y - 2, 19);
    ctx.font = `400 11px ${FONT.print}`;
    ctx.fillStyle = '#4c5a67';
    ctx.textAlign = 'right';
    ctx.fillText(p.s, w - 16, y - 4);
    ctx.textAlign = 'left';
    y += p.t.includes('\n') ? 70 : 52;
  });
  return tex(canvas, true, 4);
}

/* ================================================================== */
/* ノート（倉石の「✝」／開いた自習ノート）                              */
/* ================================================================== */
export function notebookCoverTexture(w = 320, h = 440) {
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.fillStyle = '#2b3a4a';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 3;
  ctx.strokeRect(16, 16, w - 32, h - 32);
  // 太いマジックの「✝」
  ctx.strokeStyle = '#f4f7f4';
  ctx.lineWidth = 22;
  ctx.lineCap = 'round';
  const cx = w / 2, cy = h / 2 - 10, r = 68;
  ctx.beginPath();
  ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r);
  ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = `700 34px ${FONT.print}`;
  ctx.textAlign = 'center';
  ctx.fillText('本 質', cx, h - 66);
  ctx.font = `500 16px ${FONT.print}`;
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillText('THE ESSENCE', cx, h - 38);
  return tex(canvas, true, 4);
}

export function openNotebookTexture(w = 512, h = 340) {
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.fillStyle = '#fbf9f0';
  ctx.fillRect(0, 0, w, h);
  // 中央の綴じ
  const g = ctx.createLinearGradient(w / 2 - 22, 0, w / 2 + 22, 0);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.5, 'rgba(0,0,0,0.14)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(w / 2 - 22, 0, 44, h);

  const rng = makeRng(313);
  const write = (x0, y0, ww, lines, title) => {
    ctx.fillStyle = '#3f5f7a';
    ctx.font = `700 22px ${FONT.hand}`;
    ctx.textAlign = 'left';
    ctx.fillText(title, x0, y0);
    ctx.strokeStyle = 'rgba(63,95,122,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x0, y0 + 8); ctx.lineTo(x0 + ww, y0 + 8); ctx.stroke();
    ctx.font = `500 19px ${FONT.hand}`;
    ctx.fillStyle = 'rgba(46,60,72,0.9)';
    lines.forEach((ln, i) => ctx.fillText(ln, x0 + (rng() - 0.5) * 3, y0 + 40 + i * 32 + (rng() - 0.5) * 2));
  };
  // 罫線
  for (let y = 60; y < h; y += 32) {
    ctx.strokeStyle = 'rgba(120,140,160,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(18, y); ctx.lineTo(w - 18, y); ctx.stroke();
  }
  write(34, 46, 190, ['二次関数の整理', '・平方完成', '・判別式 D', '  D = b²−4ac', '・頂点 (p, q)'], '数学');
  write(w / 2 + 34, 46, 190, ['今日の授業', '地質 → 土壌', '土壌 → 作物', '作物 → 味噌', '（面白い接続）'], 'メモ');
  return tex(canvas, true, 4);
}

/* ================================================================== */
/* 本の表紙（天文学の本）                                               */
/* ================================================================== */
export function astroBookTexture(w = 256, h = 360) {
  const { canvas, ctx } = makeCanvas(w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0b1430');
  g.addColorStop(1, '#1b2a52');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const rng = makeRng(77);
  for (let i = 0; i < 220; i++) {
    const a = 0.2 + rng() * 0.8;
    ctx.fillStyle = `rgba(255,255,255,${a * 0.7})`;
    ctx.fillRect(rng() * w, rng() * h * 0.72, 1 + rng() * 1.6, 1 + rng() * 1.6);
  }
  // 星座
  ctx.strokeStyle = 'rgba(180,210,255,0.5)';
  ctx.lineWidth = 1;
  const pts = [[40, 60], [78, 40], [116, 72], [92, 110], [56, 96]];
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  pts.forEach(([x, y]) => { ctx.fillStyle = '#cfe2ff'; ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill(); });

  ctx.fillStyle = '#e8effa';
  ctx.font = `700 30px ${FONT.print}`;
  ctx.textAlign = 'center';
  ctx.fillText('宇 宙 の', w / 2, 210);
  ctx.fillText('構 造', w / 2, 250);
  ctx.fillStyle = 'rgba(200,220,255,0.6)';
  ctx.font = `500 14px ${FONT.print}`;
  ctx.fillText('ASTRONOMY', w / 2, 282);
  ctx.fillStyle = 'rgba(160,190,230,0.5)';
  ctx.font = `500 12px ${FONT.print}`;
  ctx.fillText('図書室／理数科', w / 2, 320);
  return tex(canvas, true, 4);
}

/* ================================================================== */
/* 本の背表紙（棚用）                                                   */
/* ================================================================== */
export function bookSpinesTexture(w = 256, h = 128) {
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.fillStyle = '#20242a';
  ctx.fillRect(0, 0, w, h);
  const rng = makeRng(21);
  const colors = ['#7a5f3c', '#3d5a72', '#6a3b46', '#4a5c3c', '#5b4a6a', '#7b6a3a', '#2f4a54', '#63413a'];
  let x = 4;
  while (x < w - 6) {
    const bw = 6 + rng() * 16;
    ctx.fillStyle = colors[(rng() * colors.length) | 0];
    ctx.fillRect(x, 8 + rng() * 6, bw, h - 16 - rng() * 10);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x, 8 + rng() * 6, bw, 3);
    x += bw + 1 + rng() * 2;
  }
  return tex(canvas, true, 4);
}

/* ================================================================== */
/* 紙（寺地の二十一枚）                                                 */
/* ================================================================== */
export function paperSheetTexture(index = 0, w = 256, h = 340) {
  const lines = [
    '本質は、黙っているときに来る。',
    '電柱の影を踏んで歩いたことがある人間は、少しだけ本質に近い。',
    '恋愛は、うまくいっていないときの方が本質に近い。',
    'ヘイカツ先生の窓を見る目。あそこに全部ある。',
    'みえけんじんの将来。',
    '本質とは何か、という問いに答えが出た瞬間、それはもう本質ではない。',
    '夜道に出ろ。昼には見えなかった本質が、そこにある。',
    'コーンスープは、あるときより、ないときの方が本質である。',
    '良い山に登った日の夜は、必ず福来る。',
    '雨の前の匂いを知っている人間は、すでに本質の入口に立っている。',
  ];
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.fillStyle = '#fdfaf1';
  ctx.fillRect(0, 0, w, h);
  const rng = makeRng(100 + index * 7);
  for (let y = 56; y < h - 20; y += 30) {
    ctx.strokeStyle = 'rgba(120,150,170,0.30)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(18, y); ctx.lineTo(w - 18, y); ctx.stroke();
  }
  ctx.fillStyle = '#2f3a44';
  ctx.font = `600 20px ${FONT.hand}`;
  ctx.textAlign = 'left';
  const text = lines[index % lines.length];
  let y = 46;
  // 折り返し
  let buf = '';
  for (const ch of text) {
    buf += ch;
    if (ctx.measureText(buf).width > w - 44) {
      ctx.fillText(buf, 20, y + (rng() - 0.5) * 2);
      y += 30;
      buf = '';
    }
  }
  if (buf) ctx.fillText(buf, 20, y + (rng() - 0.5) * 2);
  // 日付
  ctx.fillStyle = 'rgba(90,110,128,0.6)';
  ctx.font = `400 12px ${FONT.print}`;
  ctx.textAlign = 'right';
  ctx.fillText(`No.${String(index + 1).padStart(2, '0')}`, w - 20, h - 16);
  return tex(canvas, true, 4);
}

/* ================================================================== */
/* 廊下のプレート                                                       */
/* ================================================================== */
export function roomPlateTexture(w = 256, h = 96) {
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.fillStyle = '#e9e6dc';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#9aa0a4';
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, w - 8, h - 8);
  ctx.fillStyle = '#2f3a44';
  ctx.font = `700 30px ${FONT.print}`;
  ctx.textAlign = 'center';
  ctx.fillText('2年B組', w / 2, 44);
  ctx.fillStyle = '#78828b';
  ctx.font = `500 16px ${FONT.print}`;
  ctx.fillText('理数科 ／ 北棟', w / 2, 70);
  return tex(canvas, true, 4);
}

/** clamp の再エクスポート（boards 内でも使うため） */
export { clamp };
