/**
 * ui.js — ローディング・視点プリセット・時間帯・ギミック・引用カード
 * 文言はすべて日本語。
 */
import { VIEWS, TIMES, BOARD_MODES, HOTSPOTS, SCENE_SPEC } from './spec.js';
import { ASSET_LOG, ASSET_PLAN, HDRI_PLAN, GLTF_PLAN, BUDGET_BYTES } from './assets.js';

const $ = (id) => document.getElementById(id);

/* ------------------------------------------------------------------ */
/* 操作ヒント（移動モードで中身を差し替える）                            */
/* ------------------------------------------------------------------ */
const HINTS = {
  walk: [
    ['WASD／矢印', '歩く'], ['マウス', '見回す'], ['Shift', '小走り'],
    ['C', 'しゃがむ'], ['E／クリック', '調べる'], ['Esc', '視点を離す'],
  ],
  orbit: [
    ['ドラッグ', '見回す'], ['ホイール', '寄る／引く'], ['右ドラッグ', '移動'],
    ['クリック', '調べる'],
  ],
};

function setHint(mode) {
  const el = $('hint');
  if (!el) return;
  const list = HINTS[mode] || HINTS.walk;
  el.innerHTML = list.map(([k, v], i) =>
    `<span${i === list.length - 1 ? ' class="accent"' : ''}>${k}＝${v}</span>`).join('');
}

/* ------------------------------------------------------------------ */
/* ローディング                                                        */
/* ------------------------------------------------------------------ */
export function initLoading(onSkip) {
  const fill = $('bar-fill');
  const status = $('load-status');
  const skip = $('load-skip');
  const overlay = $('loading');

  let skipTimer = setTimeout(() => { skip.hidden = false; }, 9000);

  skip.addEventListener('click', () => {
    clearTimeout(skipTimer);
    onSkip && onSkip();
  });

  return {
    setProgress(p, label) {
      fill.style.width = `${Math.round(Math.min(1, Math.max(0, p)) * 100)}%`;
      if (label) status.textContent = label;
    },
    setLabel(text) { status.textContent = text; },
    finish() {
      clearTimeout(skipTimer);
      fill.style.width = '100%';
      status.textContent = '入室';
      overlay.classList.add('done');
      setTimeout(() => { overlay.hidden = true; }, 750);
    },
    fail(msg) {
      clearTimeout(skipTimer);
      status.innerHTML = `<span style="color:#c07a6a">${msg}</span>`;
    },
  };
}

/* ------------------------------------------------------------------ */
/* 視点／時間帯／黒板／ギミック                                         */
/* ------------------------------------------------------------------ */
export function initPanels(handlers) {
  /* --- 移動モード（一人称＝歩く ／ 俯瞰＝見渡す） --- */
  const mwrap = $('mode-buttons');
  const modes = [
    { id: 'walk', label: '歩く（一人称）' },
    { id: 'orbit', label: '見渡す（俯瞰）' },
  ];
  const mbtns = modes.map((m) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'bbtn';
    b.textContent = m.label;
    b.addEventListener('click', () => {
      mbtns.forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      handlers.onMode(m.id);
    });
    mwrap.appendChild(b);
    return b;
  });
  mbtns[0].classList.add('active');

  /* --- 視点 --- */
  const vwrap = $('view-buttons');
  const vbtns = VIEWS.map((v) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'vbtn';
    b.textContent = v.label;
    b.title = v.quote;
    b.addEventListener('click', () => {
      vbtns.forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      handlers.onView(v);
    });
    vwrap.appendChild(b);
    return b;
  });

  /* --- 時間帯 --- */
  const twrap = $('time-buttons');
  const tbtns = TIMES.map((t) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tbtn';
    b.innerHTML = `${t.label}<small>${t.sub}</small>`;
    b.addEventListener('click', () => {
      tbtns.forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      handlers.onTime(t);
    });
    twrap.appendChild(b);
    return b;
  });

  /* --- 黒板 --- */
  const bwrap = $('board-buttons');
  const bbtns = BOARD_MODES.map((m) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'bbtn';
    b.textContent = m.label;
    b.addEventListener('click', () => {
      bbtns.forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      handlers.onBoard(m);
    });
    bwrap.appendChild(b);
    return b;
  });

  /* --- ギミック --- */
  const gwrap = $('toggle-buttons');
  const toggles = [
    { id: 'light', label: '蛍光灯', on: false },
    { id: 'shaft', label: '光の筋', on: true },
    { id: 'dust', label: '埃', on: true },
    { id: 'orbit', label: '自動巡回', on: false },
    { id: 'grid', label: '見えない壁', on: false },
  ];
  const gbtns = toggles.map((t) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'bbtn';
    b.textContent = t.label;
    b.addEventListener('click', () => {
      t.on = !t.on;
      b.classList.toggle('active', t.on);
      handlers.onToggle(t.id, t.on);
    });
    gwrap.appendChild(b);
    return b;
  });
  gbtns[1].classList.add('active');
  gbtns[2].classList.add('active');

  return {
    setMode(id) {
      const i = modes.findIndex((m) => m.id === id);
      mbtns.forEach((b, k) => b.classList.toggle('active', k === i));
      setHint(id);
    },
    setView(id) {
      const i = VIEWS.findIndex((v) => v.id === id);
      vbtns.forEach((b, k) => b.classList.toggle('active', k === i));
    },
    setTime(id) {
      const i = TIMES.findIndex((t) => t.id === id);
      tbtns.forEach((b, k) => b.classList.toggle('active', k === i));
      const t = TIMES[i];
      if (t) $('tc-time').textContent = t.sub;
    },
    setBoard(id) {
      const i = BOARD_MODES.findIndex((m) => m.id === id);
      bbtns.forEach((b, k) => b.classList.toggle('active', k === i));
    },
    setToggle(id, on) {
      const i = toggles.findIndex((t) => t.id === id);
      if (i >= 0) { toggles[i].on = on; gbtns[i].classList.toggle('active', on); }
    },
  };
}

/* ------------------------------------------------------------------ */
/* ホットスポットの引用カード                                           */
/* ------------------------------------------------------------------ */
export function initHotspotCard() {
  const card = $('hotspot-card');
  const close = $('hc-close');
  let hideTimer = null;

  const hide = () => {
    card.classList.remove('show');
    hideTimer = setTimeout(() => { card.hidden = true; }, 300);
  };
  close.addEventListener('click', hide);

  return {
    show(key) {
      const h = HOTSPOTS[key];
      if (!h) return false;
      clearTimeout(hideTimer);
      $('hc-name').textContent = h.name;
      $('hc-title').textContent = h.title;
      $('hc-body').textContent = h.body;
      $('hc-src').textContent = `— gensaku.txt ／ ${h.src}`;
      card.hidden = false;
      requestAnimationFrame(() => card.classList.add('show'));
      return true;
    },
    hide,
    isVisible: () => !card.hidden,
  };
}

/* ------------------------------------------------------------------ */
/* ホバーラベル                                                        */
/* ------------------------------------------------------------------ */
export function initHoverLabel() {
  const el = $('hover-label');
  return {
    show(text, x, y) {
      el.hidden = false;
      el.textContent = text;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    },
    hide() { el.hidden = true; },
  };
}

/* ------------------------------------------------------------------ */
/* モーダル                                                            */
/* ------------------------------------------------------------------ */
export function initModal(onClose) {
  const modal = $('modal');
  const body = $('modal-body');
  const close = () => {
    modal.hidden = true;
    onClose && onClose();
  };
  $('modal-close').addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  return {
    open(html) {
      body.innerHTML = html;
      modal.hidden = false;
    },
    close,
  };
}

/* ------------------------------------------------------------------ */
/* レポート類                                                          */
/* ------------------------------------------------------------------ */
export function buildHelpHTML() {
  return `
    <h2>この scene について</h2>
    <p class="lead">gensaku.txt を解析して組み立てた、桐葉高校 北棟2階・理数科B組の教室です。</p>
    <h3>SCENE_SPEC</h3>
    <table>
      <tr><th>作品</th><td>${SCENE_SPEC.title}</td></tr>
      <tr><th>舞台</th><td>${SCENE_SPEC.place}</td></tr>
      <tr><th>時代／地域</th><td>${SCENE_SPEC.era}</td></tr>
      <tr><th>時間帯</th><td>${SCENE_SPEC.time}</td></tr>
      <tr><th>季節／天気</th><td>${SCENE_SPEC.season}／${SCENE_SPEC.weather}</td></tr>
      <tr><th>トーン</th><td>${SCENE_SPEC.tone}</td></tr>
      <tr><th>方針</th><td>${SCENE_SPEC.note}</td></tr>
    </table>
    <h3>遊び方</h3>
    <ul>
      <li><b>歩く（一人称）</b>… 既定のモードです。教室の中を自分の足で歩けます。
        <br><span class="mono">WASD／矢印キー</span>＝歩く　<span class="mono">マウス</span>＝見回す　<span class="mono">Shift</span>＝小走り　<span class="mono">C</span>＝しゃがむ　<span class="mono">E</span>＝調べる　<span class="mono">Esc</span>＝視点を離す</li>
      <li><b>見渡す（俯瞰）</b>… ドラッグで見回す従来の観察モードです。全景を見たいときに切り替えてください。</li>
      <li><b>廊下に出られます</b>… 黒板わきの前扉は少し開いています。廊下まで歩くと、コーンスープの「無い」自販機の前に立てます。</li>
      <li><b>視点</b>（左下）… 原作の象徴的な場面へ移動します。時間帯も連動します。</li>
      <li><b>時間帯</b>（右下）… 火曜三限 → 金曜五限 → 放課後 → 夜。太陽の角度・色温度・露出が変わります。</li>
      <li><b>黒板</b>（右下）… 「味噌」／河岸段丘の断面図／零の数学の3状態を切り替えます。</li>
      <li><b>調べる</b> … 机の引き出し・自販機・電線・忘れ物など、原作に出てくる物に照準を合わせて
        <span class="mono">E</span>（またはクリック）すると引用が出ます。</li>
      <li><b>見えない壁</b> … 内進（紺）と理数科（えんじ）の「偏差値十の差」を可視化します。
        <br>一人称モードで教室の中央を横切ると、そのことについての一文が差し込まれます。</li>
    </ul>
    <h3>「人の気配」</h3>
    <p>キャラクターは配置していません。代わりに——引かれた椅子、忘れた充電器、開いた棚、
    机の引き出しにしまわれた二十一枚の紙、落ちた消しゴム、6月の傘、そして窓の外の電線——で、
    教室に人がいたことを語らせています。</p>
    <h3>技術</h3>
    <p>three.js r170 ／ importmap ／ InstancedMesh（机・椅子）／ shadowMap.autoUpdate=false ／
    ポストプロセスなし（ACESFilmicToneMapping + FogExp2 のみ）。
    机・椅子・建具・黒板・窓枠はすべて Box / Cylinder / Extrude 相当のプロシージャル造形で、
    黒板・掲示板・自販機・時計・紙は CanvasTexture の動的生成です。</p>
  `;
}

function fmtBytes(n) {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function buildAssetReportHTML() {
  const rows = ASSET_LOG.map((e) => {
    const cls = e.status === 'ok' ? 'ok' : e.status === 'skip' ? '' : 'ng';
    const mark = e.status === 'ok' ? '✔' : e.status === 'skip' ? '－' : '✖';
    return `<tr>
      <td>${e.slot}</td>
      <td class="${cls}">${mark} ${e.source}</td>
      <td class="mono">${e.url ? e.url.replace(/^https:\/\//, '') : '（プロシージャル生成）'}</td>
      <td>${fmtBytes(e.bytes)}</td>
      <td>${e.note || ''}</td>
    </tr>`;
  }).join('');

  const total = ASSET_LOG.reduce((s, e) => s + (e.bytes || 0), 0);
  const ok = ASSET_LOG.filter((e) => e.status === 'ok');
  const gltfBytes = Object.values(ASSET_LOG).filter((e) => e.slot && e.slot.startsWith('glTF:') && e.status === 'ok')
    .reduce((s, e) => s + (e.bytes || 0), 0);

  const planRows = Object.entries(ASSET_PLAN).map(([k, v]) =>
    `<tr><td>${k}</td><td>${v.slot}</td><td class="mono">${v.candidates.join(', ')}</td></tr>`).join('');

  const spent = ASSET_LOG.filter((e) => e.status === 'ok').reduce((s, e) => s + (e.bytes || 0), 0);
  return `
    <h2>採用アセット一覧</h2>
    <p class="lead">実際にこのブラウザで解決された結果です。外部アセットが1つも取れない場合は、すべてプロシージャル（Canvas生成）に差し替わります。</p>
    <h3>実測サマリ</h3>
    <table>
      <tr><th>解決成功</th><td>${ok.length} 件 / ${ASSET_LOG.length} 件</td></tr>
      <tr><th>実測転送量（HTTP メタデータ記載分）</th><td>${fmtBytes(spent)}</td></tr>
      <tr><th>転送量の上限（バジェット）</th><td>${fmtBytes(BUDGET_BYTES)} ／ 超過分は自動的にプロシージャルへ</td></tr>
      <tr><th>ログ上の合計（重複除く前）</th><td>${fmtBytes(total)}</td></tr>
      <tr><th>うち glTF（GPU上の頂点バッファ概算）</th><td>${fmtBytes(gltfBytes)}</td></tr>
      <tr><th>プロシージャル生成テクスチャ</th><td>転送量 0 B（Canvas 2D で生成）</td></tr>
    </table>
    <h3>取得ログ</h3>
    <table>
      <tr><th>スロット</th><th>結果</th><th>URL</th><th>サイズ</th><th>備考</th></tr>
      ${rows}
    </table>
    <h3>候補リスト（先頭から順に解決を試行）</h3>
    <table>
      <tr><th>キー</th><th>用途</th><th>候補 asset_id</th></tr>
      ${planRows}
      <tr><td>HDRI</td><td>${HDRI_PLAN.slot}</td><td class="mono">${HDRI_PLAN.candidates.join(', ')}</td></tr>
      <tr><td>glTF</td><td>Khronos glTF-Sample-Assets</td><td class="mono">${GLTF_PLAN.map((g) => g.name).join(', ')}</td></tr>
    </table>
    <h3>フォールバック設計</h3>
    <p>① Poly Haven API（<code>/files/{id}</code> で実 URL 解決）→ ② <code>dl.polyhaven.org</code> の既定パターン直リンク →
    ③ プロシージャル生成、の3段構えです。どの段階で失敗しても例外は外に出さず、
    <code>console</code> に記録して次へ進みます（白画面・クラッシュしません）。</p>
    <p><button type="button" class="ghost" id="copy-report" style="width:auto;padding:8px 18px">このログをクリップボードにコピー</button></p>
  `;
}

export function wireReportCopy() {
  const b = document.getElementById('copy-report');
  if (!b) return;
  b.addEventListener('click', async () => {
    const text = ASSET_LOG.map((e) =>
      `${e.status}\t${e.slot}\t${e.source}\t${e.url || '-'}\t${e.bytes || 0}\t${e.note || ''}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      b.textContent = 'コピーしました';
      setTimeout(() => { b.textContent = 'このログをクリップボードにコピー'; }, 1800);
    } catch (err) {
      console.log(text);
      b.textContent = 'コンソールに出力しました';
    }
  });
}
