/**
 * gimmicks.js — 場面切替・クリック操作・時間スライダー・✝本質✝モードなどの演出をまとめる。
 * 「アセットが1つも取れなくても操作は全部動く」ことを優先し、常に教室側の状態を安全に更新する。
 */
import { Raycaster, Vector2, Vector3, MathUtils, Color } from 'three';
import { SCENES, QUALITY } from './config.js';
import { sunFromClock } from './lib/sunpath.js';
import { BOARD_SCRIPTS } from './procedural.js';

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class Gimmicks {
  constructor({ ui, classroom, lighting, camera, controls, renderer, scene, quality = 'high' }) {
    this.ui = ui;
    this.room = classroom;
    this.light = lighting;
    this.camera = camera;
    this.controls = controls;
    this.renderer = renderer;
    this.scene = scene;
    this.quality = quality;

    this.sceneIndex = 0;
    this.clockOverride = null;   // 太陽の時間スライダー
    this.essenceOn = false;
    this.essenceAmount = 0;
    this.tween = null;
    this.raycaster = new Raycaster();
    this.pointer = new Vector2();
    this.seatCount = 30;
    this.lowQuality = false;

    // 状態
    this.state = {
      lamps: true, windows: false, door: true, dust: true, petals: true,
      autorotate: false, seats40: false, lowQuality: false, essence: false,
    };

    this._bindUI();
    this._bindPointer();
  }

  _bindUI() {
    this.ui.on('scene', (i) => this.setScene(i));
    this.ui.on('gimmick', (id, value) => this.setGimmick(id, value));
  }

  _bindPointer() {
    const dom = this.renderer.domElement;
    let down = null;
    dom.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    dom.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const dt = performance.now() - down.t;
      down = null;
      if (moved > 6 || dt > 700) return;   // ドラッグ/長押しは視点操作として扱う
      this.handleClick(e);
    });
  }

  /* ---------- 場面 ---------- */

  setScene(index, { instant = false } = {}) {
    this.sceneIndex = (index + SCENES.length) % SCENES.length;
    const cfg = SCENES[this.sceneIndex];
    this.clockOverride = null;
    this.current = cfg;

    // 教室の差分（板書・小物・季節の色）
    try { this.room.applyScene(cfg, this.state.seats40 ? 40 : 30); } catch (e) { console.warn('【続行】場面の適用で一部失敗:', e.message); }

    // ライティング（HDRI は読み込めたものを使う。無ければ手続き的な空）
    const env = this._envTextureFor(cfg);
    try {
      this.light.apply(cfg, { envTexture: env });
      this.light.setLamps(this.state.lamps && cfg.lamp);
      this.light.buildPetals(this.state.petals && cfg.petals ? this.light.quality.petals : 0, 0xffc9dc);
      this.room.setWindows(this.state.windows);
      this.room.setDoorOpen(this.state.door);
      this.room.setEssence(this.essenceOn);
    } catch (e) { console.warn('【続行】ライティング適用で一部失敗:', e.message); }

    // カメラ（プリセットへトゥイーン）
    this._tweenCamera(cfg.camera, instant ? 0 : 1.5);

    // 窓を開けている場合の外光の補正（開＝外光＋・室内が少し明るい）
    if (this.state.windows) this.light.sun.intensity *= 1.06;

    this.ui.setScene(cfg, this.sceneIndex);
    this.ui.toastMessage(`${cfg.chapter}　—　${cfg.label}`, 3200);
  }

  _envTextureFor(cfg) {
    const entry = this.assets?.envs?.[cfg.hdri];
    if (entry?.texture) return entry.texture;
    return null;   // lighting.js が手続き的な空を環境光に使う
  }

  _tweenCamera({ pos, target }, duration = 1.5) {
    const from = { pos: this.camera.position.clone(), target: this.controls.target.clone() };
    const to = { pos: new Vector3(...pos), target: new Vector3(...target) };
    if (duration <= 0) {
      this.camera.position.copy(to.pos);
      this.controls.target.copy(to.target);
      this.controls.update();
      this.tween = null;
      return;
    }
    this.tween = { from, to, t: 0, duration };
  }

  /* ---------- ギミック ---------- */

  setGimmick(id, value) {
    this.state[id] = value;
    switch (id) {
      case 'essence':
        this.essenceOn = !!value;
        this.room.setEssence(this.essenceOn);
        this.ui.toastMessage(value
          ? '✝本質✝モード：教室のあちこちに赤い✝が漏れ出している（掲示板の貼り紙も入れ替わった）'
          : '✝本質✝モードを解除した');
        break;
      case 'lamps':
        this.light.setLamps(!!value);
        this.ui.toastMessage(value ? '蛍光灯をつけた' : '蛍光灯を消した（窓の外の光だけになる）');
        break;
      case 'windows':
        this.room.setWindows(!!value);
        this.ui.toastMessage(value
          ? '窓を開けた。室外機の唸りが教室に入ってくる（窓の真横にある）'
          : '窓を閉めた');
        break;
      case 'door':
        this.room.setDoorOpen(!!value);
        break;
      case 'dust':
        this.light.setDustVisible(!!value);
        break;
      case 'petals':
        this.light.buildPetals(value && this.current?.petals ? 130 : 0, 0xffc9dc);
        break;
      case 'seats40':
        this.seatCount = this.room.setSeatCount(value ? 40 : 30);
        this.ui.toastMessage(value
          ? '40人仕様（原作準拠）：三年間、同じ四十人。入れ替わりなし。'
          : '30人仕様に切り替えた');
        break;
      case 'autorotate':
        this.controls.autoRotate = !!value;
        this.controls.autoRotateSpeed = 0.35;
        break;
      case 'lowQuality':
        this.lowQuality = !!value;
        this.applyQuality();
        break;
      case 'clock':
        this.clockOverride = Number(value);
        this.ui.setClockLabel(this.clockOverride);
        this.applyClock(this.clockOverride);
        break;
      default: break;
    }
  }

  /** 太陽の時間スライダー（影も同時に動く） */
  applyClock(hour) {
    if (!this.current) return;
    const sun = sunFromClock(hour);
    this.light.apply(this.current, {
      sunOverride: sun,
      envTexture: this._envTextureFor(this.current),
    });
    this.light.setLamps(this.state.lamps && this.current.lamp);
  }

  applyQuality() {
    const preset = this.lowQuality ? QUALITY.low : (this.quality === 'mid' ? QUALITY.mid : QUALITY.high);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.lowQuality ? 1 : preset.pixelRatio));
    this.light.setQualities(preset);
    this.renderer.shadowMap.needsUpdate = true;
    this.ui.toastMessage(this.lowQuality ? '軽量モードに切り替えた（影と埃を簡素化）' : '品質を戻した');
  }

  setAssets(assets) { this.assets = assets; }

  /* ---------- クリック（物を調べる） ---------- */

  handleClick(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const targets = this.room.interactives.filter((i) => i.mesh.visible !== false).map((i) => i.mesh);
    const hits = this.raycaster.intersectObjects(targets, true);
    if (!hits.length) return;
    const hit = hits[0];
    const entry = [...this.room.interactives].reverse().find((i) => i.mesh === hit.object || i.mesh === hit.object.parent);
    const id = entry?.id;
    switch (id) {
      case 'window':
        this.setGimmick('windows', !this.state.windows);
        this.ui.gimmickInput('windows').checked = this.state.windows;
        break;
      case 'door':
        this.setGimmick('door', !this.state.door);
        this.ui.gimmickInput('door').checked = this.state.door;
        break;
      case 'blackboard': {
        const script = BOARD_SCRIPTS[this.current?.board ?? 'morning'] ?? [];
        const texts = script.filter((i) => i.t === 'text').map((i) => i.s).slice(0, 3).join(' ／ ');
        this.ui.toastMessage(`黒板：${texts}`, 4200);
        break;
      }
      case 'vending':
        this.ui.toastMessage('北棟の自販機：コーンスープの欄が「補充待ち」のまま三ヶ月経っている。理数科の生徒はこれを〈コーンスープの不在〉と呼んでいる。', 4600);
        break;
      case 'notice':
        this.ui.toastMessage(this.essenceOn
          ? '掲示板：『✝本質✝とは何か』『北棟にコーンスープを』——許可を得ていない貼り紙が増えている。'
          : '掲示板：模試の成績上位者、球技大会の組み合わせ、翠湖マラソンのコース、落とし物のお知らせ。', 4600);
        break;
      case 'map':
        this.ui.toastMessage('教卓の上の地形図。勝也はこれを上から描く——「時間を掘ってると思ってくれ」。', 4200);
        break;
      case 'phone':
        this.ui.toastMessage('スマートフォン：匿名掲示板のスレ。102 名無しの地形図好き「それ、ずっと思ってた。地理の授業なのに」', 4400);
        break;
      case 'book':
        this.ui.toastMessage('『量子力学 基礎と応用』——零の席は空いている。彼は今、黒板の前に立っている。', 4200);
        break;
      case 'ramen':
        this.ui.toastMessage('二郎系の袋。乳化度三段階（県外／臣民／両馬レベル）。', 3800);
        break;
      case 'astroBook':
        this.ui.toastMessage('天文学の本。寺地は地理の授業中もこれを読んでいる。', 3800);
        break;
      default:
        this.ui.toastMessage(entry?.label ?? '特に何もない。');
    }
  }

  /* ---------- 毎フレーム ---------- */

  update(dt, t) {
    // カメラのトゥイーン
    if (this.tween) {
      this.tween.t += dt / this.tween.duration;
      const k = easeInOut(Math.min(1, this.tween.t));
      this.camera.position.lerpVectors(this.tween.from.pos, this.tween.to.pos, k);
      this.controls.target.lerpVectors(this.tween.from.target, this.tween.to.target, k);
      if (this.tween.t >= 1) this.tween = null;
    }
    // ✝本質✝の強度をなめらかに（0→1）
    const target = this.essenceOn ? 1 : 0;
    if (Math.abs(this.essenceAmount - target) > 0.001) {
      this.essenceAmount += Math.sign(target - this.essenceAmount) * Math.min(Math.abs(target - this.essenceAmount), dt * 0.9);
      this.light.setEssence(this.essenceAmount);
    }
    this.room.update(dt, t, this.essenceAmount);
    this.light.update(dt, t);
  }
}
