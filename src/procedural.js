/**
 * procedural.js — すべてのキャンバス生成物（板書・掲示物・自販機・端末画面・
 * 代替PBRテクスチャ・スプライト）。外部アセットが取得できなくても質感が成立する土台。
 *
 * 方針: 日本語フォントスタックは OS 内蔵フォントにフォールバックさせる（外部フォント無し）。
 */
const JP_GOTHIC = '"Hiragino Kaku Gothic ProN","Yu Gothic","YuGothic","Noto Sans JP","Meiryo","MS PGothic",sans-serif';
const JP_MINCHO = '"Hiragino Mincho ProN","Yu Mincho","YuMincho","Noto Serif JP","MS PMincho",serif';

/** 決定的な擬似乱数（板書のチョークゆらぎ等を再現可能にする） */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  return { c, ctx };
}

/* ==================================================================
 *  黒板（板書）
 * ================================================================== */

/** 黒板の下地（スレート＋消し跡） */
export function makeBlackboardBase(w = 2048, h = 570) {
  const { c, ctx } = canvas(w, h);
  const rnd = mulberry32(20250413);
  ctx.fillStyle = '#22332c';
  ctx.fillRect(0, 0, w, h);
  // うっすらとした緑の濃淡（スレートのムラ）
  for (let i = 0; i < 900; i++) {
    const x = rnd() * w, y = rnd() * h, r = 20 + rnd() * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.02 + rnd() * 0.03;
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // 拭き残しの白い帯
  for (let i = 0; i < 26; i++) {
    const x = rnd() * w, y = rnd() * h;
    ctx.save();
    ctx.globalAlpha = 0.03 + rnd() * 0.05;
    ctx.translate(x, y); ctx.rotate((rnd() - 0.5) * 0.12);
    ctx.fillStyle = '#dfe9e2';
    ctx.fillRect(-140 - rnd() * 160, -6 - rnd() * 8, 280 + rnd() * 320, 12 + rnd() * 14);
    ctx.restore();
  }
  return c;
}

/**
 * チョーク描画エンジン。
 * items の座標は 0..1 の正規化値。
 *   { t:'text', s, x, y, size, font, align, w, color, underline, box, rot }
 *   { t:'line', x1, y1, x2, y2, w }
 *   { t:'rect', x, y, w, h, w2 }
 *   { t:'diagram', name }
 */
export function drawChalkScript(ctx, W, H, items, seed = 7) {
  const rnd = mulberry32(seed);
  const chalkStroke = (fn, width, color = 'rgba(255,255,255,0.92)', passes = 3) => {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    for (let p = 0; p < passes; p++) {
      ctx.globalAlpha = p === 0 ? 0.85 : 0.3 + rnd() * 0.3;
      ctx.lineWidth = width * (0.7 + rnd() * 0.6);
      ctx.translate((rnd() - 0.5) * width * 0.42, (rnd() - 0.5) * width * 0.42);
      fn();
      ctx.translate(-(rnd() - 0.5) * width * 0.42, -(rnd() - 0.5) * width * 0.42);
    }
    ctx.restore();
  };

  for (const it of items) {
    if (it.t === 'text') {
      const size = (it.size ?? 0.08) * H;
      const font = it.font === 'mincho' ? JP_MINCHO : JP_GOTHIC;
      ctx.font = `${it.weight ?? 500} ${size}px ${font}`;
      ctx.textAlign = it.align ?? 'left';
      ctx.textBaseline = 'alphabetic';
      const x = it.x * W, y = it.y * H;
      const color = it.color ?? 'rgba(255,255,255,0.93)';
      const passes = it.w && it.w < 2 ? 2 : 3;
      for (let p = 0; p < passes; p++) {
        ctx.save();
        ctx.globalAlpha = p === 0 ? 0.9 : 0.25 + rnd() * 0.3;
        ctx.fillStyle = color;
        ctx.translate(x + (rnd() - 0.5) * size * 0.035, y + (rnd() - 0.5) * size * 0.035);
        if (it.rot) ctx.rotate(it.rot);
        ctx.fillText(it.s, 0, 0);
        ctx.restore();
      }
      if (it.underline) {
        const wmet = ctx.measureText(it.s).width;
        const x0 = it.align === 'center' ? x - wmet / 2 : it.align === 'right' ? x - wmet : x;
        chalkStroke(() => { ctx.beginPath(); ctx.moveTo(x0, y + size * 0.16); ctx.lineTo(x0 + wmet, y + size * 0.16); ctx.stroke(); }, size * 0.045);
      }
      if (it.box) {
        const wmet = ctx.measureText(it.s).width;
        const x0 = it.align === 'center' ? x - wmet / 2 : it.align === 'right' ? x - wmet : x;
        chalkStroke(() => { ctx.strokeRect(x0 - size * 0.2, y - size * 0.85, wmet + size * 0.4, size * 1.15); }, size * 0.05);
      }
    } else if (it.t === 'line') {
      chalkStroke(() => {
        ctx.beginPath();
        ctx.moveTo(it.x1 * W, it.y1 * H);
        ctx.lineTo(it.x2 * W, it.y2 * H);
        ctx.stroke();
      }, (it.w ?? 0.006) * H, it.color ?? 'rgba(255,255,255,0.9)', 3);
    } else if (it.t === 'rect') {
      chalkStroke(() => {
        ctx.beginPath();
        ctx.rect(it.x * W, it.y * H, it.w * W, it.h * H);
        ctx.stroke();
      }, (it.w2 ?? 0.005) * H, it.color ?? 'rgba(255,255,255,0.85)', 3);
      if (it.fill) { ctx.save(); ctx.globalAlpha = 0.16; ctx.fillStyle = it.fill; ctx.fillRect(it.x * W, it.y * H, it.w * W, it.h * H); ctx.restore(); }
    } else if (it.t === 'diagram') {
      DIAGRAMS[it.name]?.(ctx, W, H, chalkStroke, rnd, it);
    }
  }
  return ctx;
}

/** 板書の図（河岸段丘の断面図など・すべてチョークの線で描く） */
const DIAGRAMS = {
  /** 河岸段丘: 「上から描く」勝也の描き方 = 今の地表から過去へ掘り下げる */
  terrace(ctx, W, H, stroke) {
    const x0 = 0.12, x1 = 0.62;
    const levels = [
      { y: 0.32, label: '今の地表（お前らが立ってる地面）' },
      { y: 0.5, label: '一段古い地面（元の河床）' },
      { y: 0.68, label: 'もっと古い地面' },
      { y: 0.84, label: 'さらに古い' },
    ];
    levels.forEach((lv, i) => {
      const xa = x0 + i * 0.03, xb = x1 - i * 0.06;
      stroke(() => { ctx.beginPath(); ctx.moveTo(xa * W, lv.y * H); ctx.lineTo(xb * W, lv.y * H); ctx.stroke(); }, H * 0.008);
      stroke(() => { ctx.beginPath(); ctx.moveTo(xb * W, lv.y * H); ctx.lineTo(xb * W, (lv.y + 0.16) * H); ctx.stroke(); }, H * 0.008);
      // 崖（段丘崖）
      stroke(() => { ctx.beginPath(); ctx.moveTo(xb * W + 0.06 * H, lv.y * H); ctx.lineTo(xb * W + 0.06 * H, (lv.y + 0.16) * H); ctx.stroke(); }, H * 0.006);
    });
    // 川
    stroke(() => {
      ctx.beginPath();
      ctx.moveTo(x1 * W + 0.12 * H, 0.3 * H);
      ctx.bezierCurveTo(x1 * W + 0.2 * H, 0.5 * H, x1 * W + 0.16 * H, 0.7 * H, x1 * W + 0.24 * H, 0.9 * H);
      ctx.stroke();
    }, H * 0.01);
    ctx.font = `${H * 0.055}px ${JP_GOTHIC}`;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText('川', x1 * W + 0.27 * H, 0.62 * H);
    // 下向き矢印（時間が下へ）
    stroke(() => {
      ctx.beginPath();
      ctx.moveTo(0.08 * W, 0.34 * H);
      ctx.lineTo(0.08 * W, 0.88 * H);
      ctx.lineTo(0.055 * W, 0.84 * H);
      ctx.moveTo(0.08 * W, 0.88 * H);
      ctx.lineTo(0.105 * W, 0.84 * H);
      ctx.stroke();
    }, H * 0.007);
    ctx.font = `${H * 0.05}px ${JP_GOTHIC}`;
    ctx.fillText('時間', 0.02 * W, 0.28 * H);
  },
  /** 糸魚川-静岡構造線と食文化（味噌・餅） */
  misoLine(ctx, W, H, stroke) {
    const x = 0.46;
    stroke(() => { ctx.beginPath(); ctx.moveTo(x * W, 0.14 * H); ctx.lineTo(x * W - 0.03 * W, 0.86 * H); ctx.stroke(); }, H * 0.012, 'rgba(255,170,170,0.95)');
    ctx.font = `${H * 0.055}px ${JP_GOTHIC}`;
    ctx.fillStyle = 'rgba(255,170,170,0.95)';
    ctx.fillText('糸魚川', x * W - 0.14 * W, 0.12 * H + H * 0.05);
    ctx.fillText('静岡', x * W - 0.19 * W, 0.9 * H);
    ctx.font = `${H * 0.06}px ${JP_GOTHIC}`;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillText('西 = 白味噌・丸餅', 0.5 * W, 0.34 * H);
    ctx.fillText('東 = 赤味噌・角餅', 0.5 * W, 0.62 * H);
    ctx.fillText('土壌 → 作物 → 味噌', 0.5 * W, 0.78 * H);
  },
  /** 数学（放課後・零の板書） */
  math(ctx, W, H, stroke) {
    ctx.font = `${H * 0.085}px ${JP_GOTHIC}`;
    ctx.fillStyle = 'rgba(255,255,255,0.93)';
    ctx.fillText('f(x) = x²', 0.06 * W, 0.24 * H);
    ctx.fillText("f'(x) = 2x", 0.06 * W, 0.4 * H);
    ctx.fillText('lim  f(x+h) − f(x)', 0.06 * W, 0.6 * H);
    ctx.fillText('h→0      h', 0.18 * W, 0.72 * H);
    // 放物線
    const ox = 0.62, oy = 0.78, s = 0.3;
    stroke(() => {
      ctx.beginPath();
      for (let t = -1; t <= 1.001; t += 0.05) {
        const px = (ox + t * 0.22) * W, py = (oy - t * t * s) * H;
        t === -1 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.stroke();
    }, H * 0.008);
    stroke(() => { ctx.beginPath(); ctx.moveTo(0.4 * W, 0.78 * H); ctx.lineTo(0.86 * W, 0.78 * H); ctx.moveTo(0.62 * W, 0.3 * H); ctx.lineTo(0.62 * W, 0.86 * H); ctx.stroke(); }, H * 0.005);
  },
  /** 等高線（地形図の板書） */
  contour(ctx, W, H, stroke) {
    const cx = 0.35, cy = 0.5;
    for (let i = 1; i <= 5; i++) {
      stroke(() => {
        ctx.beginPath();
        const r = i * 0.055 * Math.min(W, H) * 1.2;
        ctx.ellipse(cx * W, cy * H, r * 1.3, r, 0.3, 0, Math.PI * 2);
        ctx.stroke();
      }, H * 0.005, 'rgba(255,255,255,0.8)', 2);
    }
    ctx.font = `${H * 0.05}px ${JP_GOTHIC}`;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText('等高線の間隔 = 傾斜', 0.55 * W, 0.3 * H);
    ctx.fillText('線一本に人の判断', 0.55 * W, 0.44 * H);
    stroke(() => { ctx.beginPath(); ctx.moveTo(0.55 * W, 0.52 * H); ctx.bezierCurveTo(0.7 * W, 0.6 * H, 0.8 * W, 0.7 * H, 0.92 * W, 0.86 * H); ctx.stroke(); }, H * 0.007);
  },
};

/** 場面ごとの板書内容（原作の該当箇所から構成） */
export const BOARD_SCRIPTS = {
  morning: [
    { t: 'text', s: '四月　朝のショートホームルーム', x: 0.5, y: 0.2, size: 0.1, align: 'center', font: 'mincho', weight: 700 },
    { t: 'text', s: '・出席番号順に健康観察カードを提出', x: 0.08, y: 0.42, size: 0.062 },
    { t: 'text', s: '・火曜三限 地理（塀先生） 地形図を持参', x: 0.08, y: 0.56, size: 0.062 },
    { t: 'text', s: '・進路室だより　第3号 配布', x: 0.08, y: 0.7, size: 0.062 },
    { t: 'text', s: '日直：召野', x: 0.08, y: 0.86, size: 0.055 },
    { t: 'text', s: '✝本質✝', x: 0.83, y: 0.86, size: 0.07, rot: -0.06, color: 'rgba(255,180,180,0.95)' },
    { t: 'line', x1: 0.72, y1: 0.24, x2: 0.72, y2: 0.78, w: 0.004 },
    { t: 'text', s: '今日の一言', x: 0.73, y: 0.33, size: 0.045 },
    { t: 'text', s: '「見る側が', x: 0.73, y: 0.45, size: 0.05, font: 'mincho' },
    { t: 'text', s: '　変われば', x: 0.73, y: 0.55, size: 0.05, font: 'mincho' },
    { t: 'text', s: '　同じ地図も', x: 0.73, y: 0.65, size: 0.05, font: 'mincho' },
    { t: 'text', s: '　違って見える」', x: 0.73, y: 0.75, size: 0.05, font: 'mincho' },
  ],
  miso: [
    { t: 'text', s: '糸魚川 - 静岡構造線', x: 0.05, y: 0.2, size: 0.09, weight: 700, underline: true },
    { t: 'text', s: '石が違う → 土壌が違う → 作物が違う →', x: 0.05, y: 0.36, size: 0.06 },
    { t: 'text', s: '味噌が違う', x: 0.05, y: 0.48, size: 0.11, weight: 700, box: true },
    { t: 'diagram', name: 'misoLine' },
    { t: 'text', s: '朝飯は何億年前の地面で決まっている', x: 0.05, y: 0.94, size: 0.055, font: 'mincho' },
  ],
  lunch: [
    { t: 'text', s: '二限 数学 小テスト返却', x: 0.07, y: 0.24, size: 0.075 },
    { t: 'text', s: '平均 68.4　／　再提出 5名', x: 0.07, y: 0.4, size: 0.062 },
    { t: 'text', s: '昼休み　当番：北棟 購買まで', x: 0.07, y: 0.62, size: 0.062 },
    { t: 'text', s: '※ 教室で弁当（南棟の食堂は遠い）', x: 0.07, y: 0.78, size: 0.055, font: 'mincho' },
    { t: 'text', s: '✝', x: 0.92, y: 0.3, size: 0.12, rot: 0.1, color: 'rgba(255,160,160,0.8)' },
    { t: 'text', s: '✝', x: 0.86, y: 0.52, size: 0.08, rot: -0.2, color: 'rgba(255,160,160,0.7)' },
    { t: 'text', s: '✝', x: 0.5, y: 0.9, size: 0.06, rot: 0.3, color: 'rgba(255,160,160,0.6)' },
    { t: 'rect', x: 0.7, y: 0.6, w: 0.24, h: 0.22, w2: 0.004 },
    { t: 'text', s: '明日の', x: 0.72, y: 0.7, size: 0.045 },
    { t: 'text', s: '球技大会', x: 0.72, y: 0.79, size: 0.05, weight: 700 },
  ],
  friday: [
    { t: 'text', s: '金曜五限　地理　河岸段丘', x: 0.05, y: 0.18, size: 0.085, weight: 700 },
    { t: 'diagram', name: 'terrace' },
    { t: 'text', s: '上から描く = 今を起点に過去へ掘る', x: 0.66, y: 0.3, size: 0.055, font: 'mincho' },
    { t: 'text', s: '洪水のたびに川が下がる', x: 0.66, y: 0.42, size: 0.055, font: 'mincho' },
    { t: 'text', s: '元の河床が台地になる', x: 0.66, y: 0.52, size: 0.055, font: 'mincho' },
    { t: 'text', s: '段丘の上と下で集落が変わる', x: 0.66, y: 0.62, size: 0.055, font: 'mincho' },
    { t: 'text', s: '地理じゃなくて、人間学なんですよ', x: 0.05, y: 0.95, size: 0.05, color: 'rgba(190,220,255,0.9)' },
  ],
  afterSchool: [
    { t: 'text', s: '期末考査まで あと10日', x: 0.5, y: 0.16, size: 0.07, align: 'center', weight: 700 },
    { t: 'diagram', name: 'math' },
    { t: 'text', s: '全部はムリ。本質的なとこだけ。', x: 0.06, y: 0.9, size: 0.055, font: 'mincho' },
    { t: 'text', s: '（数学に本質的なところだけ、は無い）', x: 0.52, y: 0.9, size: 0.045, font: 'mincho', color: 'rgba(255,255,255,0.75)' },
    { t: 'text', s: '✝', x: 0.9, y: 0.66, size: 0.1, rot: -0.12, color: 'rgba(255,150,150,0.85)' },
    { t: 'text', s: '✝本質✝', x: 0.8, y: 0.78, size: 0.06, rot: 0.06, color: 'rgba(255,150,150,0.75)' },
    { t: 'line', x1: 0.55, y1: 0.2, x2: 0.55, y2: 0.86, w: 0.004 },
  ],
  corridor: [
    { t: 'text', s: '北棟 2F', x: 0.06, y: 0.25, size: 0.09, font: 'mincho', weight: 700 },
    { t: 'text', s: '自販機　コーンスープ　補充待ち', x: 0.06, y: 0.5, size: 0.07 },
    { t: 'text', s: '（三ヶ月前から）', x: 0.12, y: 0.64, size: 0.055, font: 'mincho' },
    { t: 'text', s: '＝「コーンスープの不在」', x: 0.06, y: 0.8, size: 0.055, font: 'mincho', color: 'rgba(255,220,180,0.9)' },
  ],
};

/** 黒板の板書テクスチャを生成（base に書き込んだ新しいキャンバスを返す） */
export function makeBlackboardTexture(sceneId, w = 2048, h = 570) {
  const { c, ctx } = canvas(w, h);
  const base = makeBlackboardBase(w, h);
  ctx.drawImage(base, 0, 0);
  const script = BOARD_SCRIPTS[sceneId] ?? BOARD_SCRIPTS.morning;
  drawChalkScript(ctx, w, h, script, 1337 + sceneId.length * 17);
  void base.width; void base.height;
  return c;
}

/* ==================================================================
 *  掲示物・小道具のテクスチャ
 * ================================================================== */

/** 後壁の掲示板（模試・球技大会・マラソン・落とし物） */
export function makeNoticeBoardTexture(w = 1024, h = 540, essence = false) {
  const { c, ctx } = canvas(w, h);
  const rnd = mulberry32(4242);
  ctx.fillStyle = '#6b5a43'; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 4000; i++) { // コルクの粒
    ctx.fillStyle = `rgba(${120 + rnd() * 80},${96 + rnd() * 60},${64 + rnd() * 40},${0.25 + rnd() * 0.4})`;
    ctx.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 3, 2 + rnd() * 3);
  }
  const paper = (x, y, pw, ph, rot, draw) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 4;
    ctx.fillStyle = essence ? '#f6efe0' : '#fcfbf6';
    ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
    ctx.shadowColor = 'transparent';
    if (draw) draw(pw, ph);
    ctx.restore();
  };
  const title = (s, size, color = '#22303a') => { ctx.fillStyle = color; ctx.font = `700 ${size}px ${JP_GOTHIC}`; ctx.textAlign = 'center'; ctx.fillText(s, 0, 0); };
  const lines = (arr, size, gap, color = '#3a4650') => {
    ctx.fillStyle = color; ctx.font = `${size}px ${JP_GOTHIC}`; ctx.textAlign = 'left';
    arr.forEach((s, i) => ctx.fillText(s, -0.42 * 220, 18 + i * gap));
  };

  paper(w * 0.22, h * 0.28, 240, 150, -0.02, () => {
    title('第3回 全統模試 成績上位者', 15);
    lines(['1位 数理 零（理数科）85.0', '2位 内藤 蘭（内進）  84.2', '3位 櫻 優（理数科）  83.9'], 13, 22);
  });
  paper(w * 0.55, h * 0.26, 190, 130, 0.03, () => {
    title('球技大会 組み合わせ', 15);
    lines(['1回戦 vs 2年A組', '2回戦 vs 内進コース', '場所：第2体育館'], 12, 20);
  });
  paper(w * 0.8, h * 0.3, 200, 140, -0.03, () => {
    title('翠湖マラソン大会', 15);
    // コース図（湖の周回）
    ctx.strokeStyle = '#2d6c5a'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.ellipse(0, 22, 58, 26, 0.15, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#2d6c5a'; ctx.font = `12px ${JP_GOTHIC}`; ctx.textAlign = 'center';
    ctx.fillText('翠湖 二周 10km', 0, 20);
    ctx.fillText('AM 9:00 スタート', 0, 40);
  });
  paper(w * 0.3, h * 0.72, 220, 150, 0.02, () => {
    title('落とし物のお知らせ', 15);
    lines(['・水筒（水色）　北棟2F 廊下', '・定期入れ　購買前', '・天文学の本　3年B組 後方'], 12, 20);
  });
  if (essence) {
    paper(w * 0.62, h * 0.72, 250, 160, -0.04, () => {
      title('✝本質✝ とは何か', 16, '#9c2b2b');
      lines(['・説明できたら✝本質✝じゃない', '・ないときの方が本質である（コーンスープ）', '・教室の窓から電線を撮る', '・102 名無しの地形図好き「時間の話をしてる」'], 11, 19, '#7a3030');
    });
    paper(w * 0.87, h * 0.72, 190, 120, 0.05, () => {
      title('北棟にコーンスープを', 15, '#9c2b2b');
      lines(['署名：理数科一同', '（補充は業者の判断による）', '※この掲示は許可を得ていない'], 11, 19, '#7a3030');
    });
  }
  return c;
}

/** 廊下の掲示（進路・自習室案内） */
export function makeCorridorBoardTexture(w = 768, h = 480) {
  const { c, ctx } = canvas(w, h);
  ctx.fillStyle = '#c8c3b6'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#fbfaf4'; ctx.fillRect(24, 24, w - 48, h - 48);
  ctx.fillStyle = '#22303a'; ctx.font = `700 30px ${JP_MINCHO}`; ctx.textAlign = 'center';
  ctx.fillText('進路室だより　第4号', w / 2, 80);
  ctx.textAlign = 'left'; ctx.font = `17px ${JP_GOTHIC}`; ctx.fillStyle = '#3a4650';
  ['■ 三年生 二者面談の日程', '■ 冬季講習 申込（12/10 締切）', '■ 模試 返却と復習の手順', '■ 北棟 自習室 開放 18:00 まで', '　  （理数科は職員室前の机でも可）'].forEach((s, i) => ctx.fillText(s, 56, 140 + i * 38));
  ctx.fillStyle = '#9c2b2b'; ctx.font = `15px ${JP_GOTHIC}`;
  ctx.fillText('※ 南棟の掲示は 2F 渡り廊下', 56, h - 44);
  return c;
}

/** 自販機の前面（コーンスープの不在つき） */
export function makeVendingTexture(w = 640, h = 1024, withCornSoup = false) {
  const { c, ctx } = canvas(w, h);
  const rnd = mulberry32(99);
  ctx.fillStyle = '#e8e6e2'; ctx.fillRect(0, 0, w, h);
  // 商品棚
  const rows = 5;
  const colors = ['#7fb3e0', '#d9a25f', '#8fbf6a', '#d97b7b', '#b58fd0'];
  const names = ['ミネラルウォーター', 'カフェオレ', 'お～いお茶', '缶コーヒー', '炭酸水'];
  for (let r = 0; r < rows; r++) {
    const y = 90 + r * 150;
    ctx.fillStyle = 'rgba(0,0,0,0.06)'; ctx.fillRect(40, y + 118, w - 80, 10);
    for (let i = 0; i < 5; i++) {
      const x = 60 + i * 108;
      const isCorn = withCornSoup && r === rows - 1 && i < 3;
      ctx.fillStyle = isCorn ? '#f0b429' : colors[(r + i) % colors.length];
      ctx.beginPath();
      ctx.roundRect?.(x, y + 34, 62, 110, 8);
      if (!ctx.roundRect) ctx.rect(x, y + 34, 62, 110);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(x + 8, y + 44, 10, 90);
      if (isCorn) { ctx.fillStyle = '#8a5a00'; ctx.font = `700 20px ${JP_GOTHIC}`; ctx.textAlign = 'center'; ctx.fillText('濃', x + 31, y + 96); }
    }
    ctx.fillStyle = '#39424a'; ctx.font = `16px ${JP_GOTHIC}`; ctx.textAlign = 'left';
    ctx.fillText(withCornSoup && r === rows - 1 ? 'コーンスープ（冬期限定）' : names[r], 44, y + 26);
  }
  if (!withCornSoup) {
    // 最下段は空。品切れ札（原作の「コーンスープの不在」）
    const y = 90 + (rows - 1) * 150;
    ctx.fillStyle = '#dcd9d2'; ctx.fillRect(40, y + 20, w - 80, 128);
    ctx.save();
    ctx.translate(w / 2, y + 84); ctx.rotate(-0.06);
    ctx.fillStyle = '#fdf6e3'; ctx.strokeStyle = '#b23b3b'; ctx.lineWidth = 5;
    ctx.fillRect(-190, -46, 380, 92); ctx.strokeRect(-190, -46, 380, 92);
    ctx.fillStyle = '#8f2f2f'; ctx.font = `700 40px ${JP_GOTHIC}`; ctx.textAlign = 'center';
    ctx.fillText('補充待ち', 0, 6);
    ctx.font = `20px ${JP_GOTHIC}`;
    ctx.fillText('（三ヶ月前から）', 0, 36);
    ctx.restore();
    ctx.fillStyle = '#6b7280'; ctx.font = `18px ${JP_GOTHIC}`; ctx.textAlign = 'left';
    ctx.fillText('コーンスープ（冬期限定）', 44, y + 26);
  }
  // 価格ボタン
  ctx.fillStyle = '#2b3238'; ctx.fillRect(40, h - 150, w - 80, 110);
  ctx.fillStyle = '#f2f2f2'; ctx.font = `22px ${JP_GOTHIC}`; ctx.textAlign = 'center';
  for (let i = 0; i < 4; i++) ctx.fillText('¥130', 120 + i * 130, h - 90);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  for (let i = 0; i < 60; i++) ctx.fillRect(rnd() * w, rnd() * h, 2, 2);
  return c;
}

/** スマホ画面（ゲーム／掲示板） */
export function makePhoneTexture(mode = 'game', w = 256, h = 512) {
  const { c, ctx } = canvas(w, h);
  const rnd = mulberry32(mode === 'game' ? 5 : 6);
  if (mode === 'game') {
    ctx.fillStyle = '#0d1a2b'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `hsl(${rnd() * 360},70%,${45 + rnd() * 25}%)`;
      ctx.fillRect(rnd() * w, rnd() * h, 14 + rnd() * 26, 14 + rnd() * 26);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = `700 22px ${JP_GOTHIC}`; ctx.textAlign = 'center';
    ctx.fillText('RANK 12 → 11', w / 2, 40);
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = `14px ${JP_GOTHIC}`;
    ctx.fillText('砂糖のささやかな自尊心', w / 2, h - 24);
  } else {
    ctx.fillStyle = '#f4f4f4'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1f2a36'; ctx.font = `700 18px ${JP_GOTHIC}`; ctx.textAlign = 'left';
    ctx.fillText('名無しの地形図好き', 12, 30);
    ctx.font = `14px ${JP_GOTHIC}`; ctx.fillStyle = '#333';
    ['101：ヘイカツが地形図を', '上から描くの、今日気づいた。', '今から過去を掘っていく、', 'って描き方。あれ、', '時間の話をしてると思う。✝', '', '102：それ、ずっと', '思ってた。地理の授業なのに、', '時間と人間の話をしてる。'].forEach((s, i) => ctx.fillText(s, 12, 60 + i * 22));
    ctx.fillStyle = '#9c2b2b'; ctx.font = `14px ${JP_GOTHIC}`;
    ctx.fillText('（スレの五人目）', 12, h - 30);
  }
  return c;
}

/** 本の表紙（量子力学／天文学／✝本質✝のノート） */
export function makeBookTexture(kind = 'quantum', w = 256, h = 360) {
  const { c, ctx } = canvas(w, h);
  const data = {
    quantum: { bg: '#12203a', accent: '#2a4a7a', title: '量子力学', sub: 'QUANTUM MECHANICS', sub2: '基礎と応用', deco: 'atom' },
    astro: { bg: '#0e1a14', accent: '#1f4a34', title: '星と地面', sub: 'ASTRO & GEO', sub2: '観測ノート', deco: 'star' },
    essence: { bg: '#2a1a1a', accent: '#5a2020', title: '✝本質✝', sub: 'ESSENCE', sub2: '研究ノート', deco: 'cross' },
  }[kind];
  ctx.fillStyle = data.bg; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = data.accent; ctx.fillRect(0, 0, 14, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2; ctx.strokeRect(24, 24, w - 48, h - 48);
  ctx.fillStyle = '#f5f2ea'; ctx.textAlign = 'center';
  ctx.font = `700 34px ${JP_MINCHO}`;
  ctx.fillText(data.title, w / 2, h * 0.44);
  ctx.font = `13px ${JP_GOTHIC}`; ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText(data.sub, w / 2, h * 0.52);
  ctx.fillText(data.sub2, w / 2, h * 0.58);
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1.5;
  if (data.deco === 'atom') {
    ctx.beginPath(); ctx.arc(w / 2, h * 0.72, 26, 0, Math.PI * 2); ctx.stroke();
    for (const a of [0, 1.05, -1.05]) {
      ctx.beginPath(); ctx.ellipse(w / 2, h * 0.72, 34, 12, a, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,220,140,0.95)';
    ctx.beginPath(); ctx.arc(w / 2, h * 0.72, 3.5, 0, Math.PI * 2); ctx.fill();
  } else if (data.deco === 'star') {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 8 : 20, a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const px = w / 2 + Math.cos(a) * r, py = h * 0.72 + Math.sin(a) * r;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.stroke();
  } else {
    ctx.fillStyle = 'rgba(255,120,120,0.9)'; ctx.font = `700 48px ${JP_GOTHIC}`;
    ctx.fillText('✝', w / 2, h * 0.75);
  }
  return c;
}

/** 地形図（等高線・河川・集落記号）— Poly Haven の代わりに国土地理院風の紙を描く */
export function makeTopoMapTexture(w = 1024, h = 720) {
  const { c, ctx } = canvas(w, h);
  const rnd = mulberry32(20240101);
  ctx.fillStyle = '#f6f2e6'; ctx.fillRect(0, 0, w, h);
  // 等高線（ノイズ円の集合）
  ctx.strokeStyle = '#b9834a'; ctx.lineWidth = 1.2;
  for (let i = 0; i < 90; i++) {
    const cx = rnd() * w, cy = rnd() * h, r = 24 + rnd() * 90;
    ctx.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.22) {
      const rr = r * (0.78 + 0.34 * Math.sin(a * 3 + i) * Math.cos(a * 2.3 + i * 1.7));
      const px = cx + Math.cos(a) * rr * 1.25, py = cy + Math.sin(a) * rr;
      a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.stroke();
  }
  // 計曲線（太）
  ctx.strokeStyle = '#96682f'; ctx.lineWidth = 1.9;
  for (let i = 0; i < 18; i++) {
    const cx = rnd() * w, cy = rnd() * h, r = 60 + rnd() * 110;
    ctx.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.18) {
      const rr = r * (0.8 + 0.3 * Math.sin(a * 2 + i));
      const px = cx + Math.cos(a) * rr * 1.3, py = cy + Math.sin(a) * rr;
      a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.stroke();
  }
  // 河川
  ctx.strokeStyle = '#3f7fb5'; ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-20, h * 0.62);
  ctx.bezierCurveTo(w * 0.3, h * 0.5, w * 0.5, h * 0.78, w + 20, h * 0.44);
  ctx.stroke();
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(w * 0.42, -10); ctx.bezierCurveTo(w * 0.4, h * 0.3, w * 0.5, h * 0.5, w * 0.52, h * 0.66);
  ctx.stroke();
  // 集落・記号
  ctx.fillStyle = '#8a8f7a';
  for (let i = 0; i < 60; i++) ctx.fillRect(rnd() * w, rnd() * h, 5 + rnd() * 8, 4 + rnd() * 5);
  ctx.fillStyle = '#333'; ctx.font = `700 22px ${JP_GOTHIC}`;
  ctx.fillText('糸魚川 - 静岡構造線', w * 0.56, h * 0.2);
  ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(w * 0.62, h * 0.06); ctx.bezierCurveTo(w * 0.56, h * 0.4, w * 0.72, h * 0.6, w * 0.66, h * 0.95); ctx.stroke();
  ctx.fillStyle = '#2b4a8a'; ctx.font = `16px ${JP_GOTHIC}`;
  ctx.fillText('2万5千分の1 地形図', w * 0.05, h * 0.95);
  ctx.fillText('桐葉高校周辺', w * 0.05, h * 0.92);
  return c;
}

/** ノートの見開き（罫線＋手書きの走り書き） */
export function makeNotebookTexture(w = 512, h = 340) {
  const { c, ctx } = canvas(w, h);
  ctx.fillStyle = '#fbfaf3'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#e9eef4'; ctx.fillRect(0, 0, w / 2, h);
  ctx.strokeStyle = '#cfd6de'; ctx.lineWidth = 1;
  for (let x = 0; x <= w; x += 34) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y <= h; y += 34) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  ctx.strokeStyle = '#d38b8b'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();
  ctx.fillStyle = '#2b3a4a'; ctx.font = `20px ${JP_MINCHO}`;
  ['✝本質✝ ＝ 〈わからないが、ある〉', '恋愛の定義に近い？', '要検証', '→ G-07内 理解不能度の高い個体'].forEach((s, i) => ctx.fillText(s, 30 + (i > 2 ? w / 2 : 0), 60 + (i % 3) * 46));
  ctx.fillStyle = '#9c2b2b'; ctx.font = `700 26px ${JP_GOTHIC}`;
  ctx.fillText('✝', w * 0.82, h * 0.78);
  return c;
}

/** 寺地の紙束（1枚ずつ：本質の言葉） */
export function makeSlipTexture(w = 256, h = 360, text = '機材の前で黙る時間が、いちばん本質に近い。') {
  const { c, ctx } = canvas(w, h);
  ctx.fillStyle = '#fdfcf6'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.strokeRect(1, 1, w - 2, h - 2);
  ctx.fillStyle = '#2b3a4a'; ctx.font = `18px ${JP_MINCHO}`;
  // 折り返し描画
  const per = 12; let line = 0;
  for (let i = 0; i < text.length; i += per) {
    ctx.fillText(text.slice(i, i + per), 22, 60 + line * 30); line++;
  }
  ctx.fillStyle = '#9c2b2b'; ctx.font = `700 22px ${JP_GOTHIC}`;
  ctx.textAlign = 'right'; ctx.fillText('✝', w - 20, h - 24);
  return c;
}

/** ラーメン袋（二郎系） */
export function makeRamenTexture(w = 512, h = 620) {
  const { c, ctx } = canvas(w, h);
  ctx.fillStyle = '#f0e2c8'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#b3271f'; ctx.fillRect(0, 0, w, 120);
  ctx.fillStyle = '#fff6e0'; ctx.font = `700 56px ${JP_GOTHIC}`; ctx.textAlign = 'center';
  ctx.fillText('ラーメン', w / 2, 84);
  ctx.fillStyle = '#2b2b2b'; ctx.font = `700 40px ${JP_GOTHIC}`;
  ctx.fillText('二郎系', w / 2, 200);
  ctx.font = `24px ${JP_GOTHIC}`; ctx.fillStyle = '#5a4a34';
  ctx.fillText('乳化度 三段階', w / 2, 260);
  ctx.fillText('一段目：県外の方に', w / 2, 310);
  ctx.fillText('二段目：臣民レベル', w / 2, 350);
  ctx.fillText('三段目：両馬レベル', w / 2, 390);
  ctx.fillStyle = '#9c2b2b'; ctx.font = `700 34px ${JP_GOTHIC}`;
  ctx.fillText('✝本質✝', w / 2, 480);
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  const rnd = mulberry32(31);
  for (let i = 0; i < 300; i++) ctx.fillRect(rnd() * w, rnd() * h, 3, 3);
  return c;
}

/** 弁当の蓋 */
export function makeBentoTexture(w = 512, h = 360) {
  const { c, ctx } = canvas(w, h);
  ctx.fillStyle = '#2f3a44'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#e8e4d8'; ctx.fillRect(24, 24, w - 48, h - 48);
  ctx.fillStyle = '#c9a86a'; ctx.beginPath(); ctx.arc(w / 2, h / 2, 96, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8fb36a'; ctx.fillRect(60, 60, 90, 60);
  ctx.fillStyle = '#d98a6a'; ctx.fillRect(w - 170, 70, 110, 54);
  ctx.fillStyle = '#f0e0a0'; ctx.beginPath(); ctx.ellipse(w / 2, h / 2, 60, 40, 0.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3a3a3a'; ctx.font = `700 22px ${JP_GOTHIC}`; ctx.textAlign = 'center';
  ctx.fillText('弁当（北棟は弁当派が多い）', w / 2, h - 40);
  return c;
}

/* ==================================================================
 *  スプライト・空・代替PBRテクスチャ
 * ================================================================== */

export function makeDustSprite(size = 64) {
  const { c, ctx } = canvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.35, 'rgba(255,250,235,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  return c;
}

export function makePetalSprite(size = 64) {
  const { c, ctx } = canvas(size, size);
  ctx.translate(size / 2, size / 2); ctx.rotate(0.5);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.45);
  g.addColorStop(0, 'rgba(255,236,244,0.98)');
  g.addColorStop(0.6, 'rgba(255,196,216,0.9)');
  g.addColorStop(1, 'rgba(255,180,205,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, 0, size * 0.34, size * 0.2, 0, 0, Math.PI * 2); ctx.fill();
  return c;
}

export function makeCrossSprite(size = 128) {
  const { c, ctx } = canvas(size, size);
  ctx.translate(size / 2, size / 2);
  ctx.shadowColor = 'rgba(255,60,60,0.95)'; ctx.shadowBlur = 22;
  ctx.fillStyle = 'rgba(255,86,86,0.96)';
  ctx.font = `700 ${size * 0.72}px ${JP_GOTHIC}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('✝', 0, 4);
  return c;
}

/** 雷・光の筋用のソフトグラデーション（加算合成） */
export function makeShaftTexture(w = 128, h = 512) {
  const { c, ctx } = canvas(w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255,246,220,0.85)');
  g.addColorStop(0.35, 'rgba(255,240,210,0.35)');
  g.addColorStop(1, 'rgba(255,235,200,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // 幅方向の減衰
  const g2 = ctx.createLinearGradient(0, 0, w, 0);
  g2.addColorStop(0, 'rgba(0,0,0,1)');
  g2.addColorStop(0.5, 'rgba(0,0,0,0.55)');
  g2.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = g2; ctx.fillRect(0, 0, w, h);
  return c;
}

/** 空（天球用の縦グラデ＋太陽の光暈） */
export function makeSkyTexture(top, horizon, glow = 0.3, sunU = 0.5, w = 1024, h = 512) {
  const { c, ctx } = canvas(w, h);
  const hex = (v) => '#' + v.toString(16).padStart(6, '0');
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, hex(top));
  g.addColorStop(0.62, hex(horizon));
  g.addColorStop(0.78, hex(horizon));
  g.addColorStop(1, hex(horizon));
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // 太陽の光暈（地平線寄り）
  const sx = sunU * w, sy = h * 0.72;
  const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, w * 0.34);
  sg.addColorStop(0, `rgba(255,250,230,${0.55 + glow * 0.4})`);
  sg.addColorStop(0.12, `rgba(255,236,196,${0.35 + glow * 0.35})`);
  sg.addColorStop(1, 'rgba(255,220,180,0)');
  ctx.fillStyle = sg; ctx.fillRect(0, 0, w, h);
  // 雲（横長のぼかし）
  const rnd = mulberry32(8);
  ctx.globalAlpha = 0.22;
  for (let i = 0; i < 40; i++) {
    const x = rnd() * w, y = h * (0.18 + rnd() * 0.5), cw = 90 + rnd() * 260, ch = 12 + rnd() * 30;
    const cg = ctx.createLinearGradient(x - cw / 2, 0, x + cw / 2, 0);
    cg.addColorStop(0, 'rgba(255,255,255,0)');
    cg.addColorStop(0.5, 'rgba(255,255,255,0.9)');
    cg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.ellipse(x, y, cw / 2, ch / 2, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  return c;
}

/* ---------- プロシージャル代替 PBR テクスチャ（外部取得失敗時） ---------- */

const noiseFill = (ctx, w, h, base, count, spread, alpha = 0.5) => {
  const rnd = mulberry32(1234 + count);
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < count; i++) {
    const v = 128 + (rnd() - 0.5) * spread;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * rnd()})`;
    const s = 1 + rnd() * 3;
    ctx.fillRect(rnd() * w, rnd() * h, s, s);
  }
};

export const FALLBACK_TEXTURES = {
  /** 木の床板 */
  floor(size = 512) {
    const { c, ctx } = canvas(size, size);
    const rnd = mulberry32(21);
    ctx.fillStyle = '#8a5a34'; ctx.fillRect(0, 0, size, size);
    const planks = 6, ph = size / planks;
    for (let i = 0; i < planks; i++) {
      const l = 22 + rnd() * 16;
      ctx.fillStyle = `hsl(${26 + rnd() * 10},${42 + rnd() * 14}%,${l}%)`;
      ctx.fillRect(0, i * ph, size, ph - 2);
      for (let g = 0; g < 60; g++) {
        ctx.strokeStyle = `rgba(60,32,14,${0.05 + rnd() * 0.14})`;
        ctx.lineWidth = 0.6 + rnd();
        ctx.beginPath();
        const y = i * ph + rnd() * ph;
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(size * 0.3, y + (rnd() - 0.5) * 5, size * 0.7, y + (rnd() - 0.5) * 5, size, y + (rnd() - 0.5) * 4);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(30,16,6,0.5)'; ctx.fillRect(0, i * ph + ph - 2, size, 2);
    }
    return c;
  },
  /** 漆喰の壁 */
  wall(size = 512) {
    const { c, ctx } = canvas(size, size);
    noiseFill(ctx, size, size, '#e6e2da', 9000, 40, 0.35);
    const rnd = mulberry32(77);
    for (let i = 0; i < 120; i++) {
      ctx.fillStyle = `rgba(190,186,178,${0.05 + rnd() * 0.1})`;
      ctx.beginPath(); ctx.arc(rnd() * size, rnd() * size, 6 + rnd() * 26, 0, Math.PI * 2); ctx.fill();
    }
    return c;
  },
  /** 天井（ほぼ無地） */
  ceiling(size = 256) {
    const { c, ctx } = canvas(size, size);
    noiseFill(ctx, size, size, '#eeece6', 1500, 14, 0.25);
    return c;
  },
  /** オーク突板 */
  deskWood(size = 512) {
    const { c, ctx } = canvas(size, size);
    const rnd = mulberry32(303);
    ctx.fillStyle = '#c8a06a'; ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 240; i++) {
      ctx.strokeStyle = `rgba(${130 + rnd() * 60},${95 + rnd() * 40},${50 + rnd() * 30},${0.08 + rnd() * 0.2})`;
      ctx.lineWidth = 0.8 + rnd() * 2.4;
      ctx.beginPath();
      const x = rnd() * size;
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + (rnd() - 0.5) * 26, size * 0.3, x + (rnd() - 0.5) * 26, size * 0.7, x + (rnd() - 0.5) * 18, size);
      ctx.stroke();
    }
    return c;
  },
  /** 縞鋼板 */
  metal(size = 512) {
    const { c, ctx } = canvas(size, size);
    noiseFill(ctx, size, size, '#6b6a66', 6000, 30, 0.4);
    const rnd = mulberry32(51);
    for (let i = 0; i < 900; i++) {
      ctx.strokeStyle = `rgba(255,255,255,${0.03 + rnd() * 0.08})`;
      ctx.lineWidth = 0.7; ctx.beginPath();
      const y = rnd() * size;
      ctx.moveTo(0, y); ctx.lineTo(size, y + (rnd() - 0.5) * 3);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(40,40,40,0.35)';
    for (let i = 0; i < 8; i++) {
      const y = i * size / 8;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
    }
    return c;
  },
  /** 錆びた金属 */
  metalRust(size = 256) {
    const { c, ctx } = canvas(size, size);
    noiseFill(ctx, size, size, '#4d6b4a', 4000, 44, 0.5);
    return c;
  },
  /** コンクリート */
  concrete(size = 512) {
    const { c, ctx } = canvas(size, size);
    noiseFill(ctx, size, size, '#b6ada0', 8000, 34, 0.4);
    const rnd = mulberry32(9);
    ctx.strokeStyle = 'rgba(90,82,72,0.5)'; ctx.lineWidth = 1.4;
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      let x = rnd() * size, y = rnd() * size;
      ctx.moveTo(x, y);
      for (let s = 0; s < 6; s++) { x += (rnd() - 0.5) * 60; y += (rnd() - 0.5) * 60; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    return c;
  },
};

export const FONTS = { JP_GOTHIC, JP_MINCHO };
