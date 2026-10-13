/**
 * ui.js — 画面UI（すべて日本語）。DOM を組み立て、状態を反映するだけの薄い層。
 * ローディング・トースト・エラー表示もここが担当し、**白画面を出さない**ことを保証する。
 */
import { SCENES } from './config.js';

const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};

export class UI {
  constructor(root) {
    this.root = root;
    this.handlers = {};
    this.build();
  }

  on(name, fn) { this.handlers[name] = fn; return this; }
  _emit(name, ...args) { this.handlers[name]?.(...args); }

  build() {
    const r = this.root;

    /* --- 上: タイトル --- */
    this.top = el('header', 'hud hud-top');
    this.top.innerHTML = `
      <div class="title-block">
        <h1>偏差値60の教室から<span class="cross">✝</span>本質<span class="cross">✝</span>が漏れ出している件について</h1>
        <p class="sub">桐葉高校 北棟2階 理数科B組 ── インタラクティブ3D教室</p>
      </div>`;
    r.appendChild(this.top);

    /* --- 左上: 場面解説 --- */
    this.note = el('aside', 'hud hud-note');
    r.appendChild(this.note);

    /* --- 左下: 視点プリセット --- */
    this.presets = el('nav', 'hud hud-presets');
    this.presets.appendChild(el('div', 'hud-label', '視点プリセット（原作の場面）'));
    const list = el('div', 'preset-list');
    SCENES.forEach((s, i) => {
      const b = el('button', 'preset', `<span class="k">${i + 1}</span><span class="t">${s.label}</span>`);
      b.title = `${s.chapter}（${s.time}）`;
      b.addEventListener('click', () => this._emit('scene', i));
      list.appendChild(b);
      s._button = b;
    });
    this.presets.appendChild(list);
    r.appendChild(this.presets);

    /* --- 右下: ギミック --- */
    this.gimmicks = el('section', 'hud hud-gimmicks');
    this.gimmicks.appendChild(el('div', 'hud-label', 'ギミック'));
    const mk = (label, id, opts = {}) => {
      const row = el('label', 'tgl');
      const input = el('input');
      input.type = opts.type === 'range' ? 'range' : 'checkbox';
      if (opts.type === 'range') {
        input.min = opts.min; input.max = opts.max; input.step = opts.step ?? 0.1; input.value = opts.value;
        row.classList.add('tgl-range');
      } else {
        input.checked = !!opts.checked;
      }
      row.appendChild(input);
      row.appendChild(el('span', 'tgl-label', label));
      if (opts.type === 'range') row.appendChild(el('span', 'tgl-val', opts.value));
      this.gimmicks.appendChild(row);
      input.addEventListener('input', () => this._emit('gimmick', id, opts.type === 'range' ? Number(input.value) : input.checked));
      return input;
    };
    mk('✝本質✝モード（赤い✝が漏れ出す）', 'essence');
    mk('蛍光灯', 'lamps', { checked: true });
    mk('窓を開ける', 'windows');
    mk('引き戸を開ける', 'door', { checked: true });
    mk('埃を舞わせる', 'dust', { checked: true });
    mk('桜の花びら', 'petals', { checked: true });
    mk('40人仕様（原作準拠）', 'seats40');
    mk('自動巡回カメラ', 'autorotate');
    mk('軽量モード（影を簡素化）', 'lowQuality');
    this.timeSlider = mk('太陽の時間（5:00〜19:00）', 'clock', { type: 'range', min: 5, max: 19, step: 0.25, value: 15.3 });
    r.appendChild(this.gimmicks);

    /* --- 右上: 計測・アセット状態 --- */
    this.stats = el('aside', 'hud hud-stats');
    r.appendChild(this.stats);

    /* --- 中央下: 操作方法 --- */
    this.help = el('div', 'hud hud-help');
    this.help.innerHTML = `
      <b>操作</b>：ドラッグ＝見回す／ホイール＝前後／<b>物をクリック</b>＝調べる（窓・引き戸・掲示板・自販機）／
      キー <b>1-7</b>=場面 <b>E</b>=✝本質✝ <b>L</b>=蛍光灯 <b>W</b>=窓 <b>H</b>=この表示`;
    r.appendChild(this.help);

    /* --- トースト --- */
    this.toast = el('div', 'toast');
    r.appendChild(this.toast);

    /* --- ローディング --- */
    this.loading = el('div', 'overlay loading');
    this.loading.innerHTML = `
      <div class="load-inner">
        <div class="load-title">偏差値60の教室から<span class="cross">✝</span>本質<span class="cross">✝</span>が漏れ出している件について</div>
        <div class="load-bar"><i></i></div>
        <div class="load-status">教室を組み立てています…</div>
        <div class="load-tip"></div>
      </div>`;
    r.appendChild(this.loading);
    this.loadBar = this.loading.querySelector('.load-bar i');
    this.loadStatus = this.loading.querySelector('.load-status');
    this.loadTip = this.loading.querySelector('.load-tip');

    /* --- 致命的エラー（白画面の代わり） --- */
    this.fatal = el('div', 'overlay fatal hidden');
    this.fatal.innerHTML = `
      <div class="load-inner">
        <div class="load-title">教室を表示できませんでした</div>
        <p class="fatal-msg"></p>
        <p class="load-tip">読み込めなかったアセットは自動でスキップし、プロシージャル形状で続行します。<br>
        それでも崩れる場合は「軽量モード」で再試行してください。</p>
        <div class="fatal-actions">
          <button id="retry">再試行</button>
          <button id="lowq">軽量モードで再試行</button>
        </div>
      </div>`;
    r.appendChild(this.fatal);
    this.fatal.querySelector('#retry').addEventListener('click', () => location.reload());
    this.fatal.querySelector('#lowq').addEventListener('click', () => { location.search = '?quality=low'; });

    // ヘルプのキーで表示切替
    this.helpVisible = true;
    window.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'h') this.toggleHelp();
      const n = Number(e.key);
      if (n >= 1 && n <= SCENES.length) this._emit('scene', n - 1);
      if (e.key.toLowerCase() === 'e') this._emit('gimmick', 'essence', !this.gimmickInput('essence')?.checked);
      if (e.key.toLowerCase() === 'l') this._emit('gimmick', 'lamps', !this.gimmickInput('lamps')?.checked);
      if (e.key.toLowerCase() === 'w') this._emit('gimmick', 'windows', !this.gimmickInput('windows')?.checked);
    });
  }

  gimmickInput(id) {
    return this.gimmicks.querySelectorAll('input')[['essence', 'lamps', 'windows', 'door', 'dust', 'petals', 'seats40', 'autorotate', 'lowQuality', 'clock'].indexOf(id)];
  }

  toggleHelp() {
    this.helpVisible = !this.helpVisible;
    this.help.classList.toggle('hidden', !this.helpVisible);
  }

  /* --- 状態の反映 --- */

  setScene(sceneCfg, index) {
    SCENES.forEach((s, i) => s._button?.classList.toggle('active', i === index));
    this.note.innerHTML = `
      <div class="note-time">${sceneCfg.time}　${sceneCfg.chapter}</div>
      <div class="note-quote">${sceneCfg.quote}</div>`;
    this.top.querySelector('.sub').textContent =
      `桐葉高校 北棟2階 理数科B組 ── ${sceneCfg.label}`;
    const clock = this.gimmickInput('clock');
    if (clock) {
      const h = Number(sceneCfg.time.split(':')[0]) + Number(sceneCfg.time.split(':')[1]) / 60;
      clock.value = String(h);
      clock.parentElement.querySelector('.tgl-val').textContent = `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
    }
  }

  setClockLabel(hour) {
    const row = this.gimmickInput('clock')?.parentElement;
    if (row) row.querySelector('.tgl-val').textContent = `${Math.floor(hour)}:${String(Math.round((hour % 1) * 60)).padStart(2, '0')}`;
  }

  setStats({ fps, calls, tris, seats, quality, assets }) {
    this.stats.innerHTML = `
      <div><b>${fps.toFixed(0)}</b> fps　／　コール ${calls}　／　三角形 ${(tris / 1000).toFixed(0)}k</div>
      <div>席数 ${seats}　／　品質 <b>${quality}</b></div>
      <div class="stats-assets">アセット：読込 ${assets.ok} 件 ／ 代替 ${assets.fallback} 件（${(assets.bytes / 1024 / 1024).toFixed(2)} MB）</div>`;
  }

  toastMessage(msg, ms = 2600) {
    this.toast.textContent = msg;
    this.toast.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this.toast.classList.remove('show'), ms);
  }

  loadingProgress(p, text) {
    this.loadBar.style.width = `${Math.round(p * 100)}%`;
    if (text) this.loadStatus.textContent = text;
    const tips = [
      '「コーンスープは、あるときより、ないときの方が本質である。」',
      '「教室の空気は死んでいる。窓際は午後の日差しで焼かれ、廊下側はモップの匂いが微かに漂う。」',
      '「勝也は黒板に〈味噌〉と書いた。」',
      '「放課後。教室。零が黒板の前に立って、数学を教え始めた。」',
      '「田んぼ。山。川。送電線。トンネル。」',
    ];
    this.loadTip.textContent = tips[Math.floor(p * tips.length) % tips.length];
  }

  hideLoading() { this.loading.classList.add('hidden'); }

  showFatal(err) {
    this.fatal.classList.remove('hidden');
    this.fatal.querySelector('.fatal-msg').textContent = String(err?.message ?? err);
    this.loading.classList.add('hidden');
  }
}
