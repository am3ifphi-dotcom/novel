/**
 * main.js — 起動・組み立て・ループ
 *
 * 最重要ルールへの対応:
 *   ・外部アセットは「API直リンク → 推定直リンク → プロシージャル」の3段フォールバック
 *   ・どこが失敗しても例外を外に出さず console に記録して続行（白画面・クラッシュしない）
 *   ・読み込みが長引く場合はスキップしてプロシージャルだけで開始できる
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { VIEWS, TIMES, BOARD_MODES, ROOM, WALL, DESK } from './spec.js';
import * as TX from './textures.js';
import * as B from './boards.js';
import {
  loadAll, abortAllAssets, onProgress, makeMaterials, ASSET_LOG,
} from './assets.js';
import { buildWorld } from './world.js';
import { buildFurniture } from './furniture.js';
import { buildProps } from './props.js';
import { createLighting } from './lighting.js';
import { createNav, buildColliders, EYE_STAND } from './nav.js';
import {
  initLoading, initPanels, initHotspotCard, initHoverLabel, initModal,
  buildHelpHTML, buildAssetReportHTML, wireReportCopy,
} from './ui.js';
import { sunDirection, clamp, smoothstep, deg } from './util.js';

/* ------------------------------------------------------------------ */
/* 0) 起動                                                             */
/* ------------------------------------------------------------------ */
const canvas = document.getElementById('scene');

/** タッチ端末では Pointer Lock が使えないので、ドラッグ＋タップ操作にする */
const isTouch = (window.matchMedia && window.matchMedia('(hover: none)').matches)
  || (navigator.maxTouchPoints || 0) > 0;
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, powerPreference: 'high-performance', alpha: false,
  });
} catch (e) {
  window.__showFatal && window.__showFatal('WebGL を初期化できませんでした。' + (e.message || ''));
  throw e;
}

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// ほぼ静的シーンなので、影は必要なときだけ更新する
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;

const scene = new THREE.Scene();
// 一人称（歩く）モードが既定。near は机に顔を近づけても破綻しないよう小さく
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.04, 400);
camera.position.set(-2.95, EYE_STAND, -3.45);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.target.set(1.90, 1.15, 1.25);
controls.minDistance = 0.55;
controls.maxDistance = 12;
controls.maxPolarAngle = Math.PI * 0.495;
controls.autoRotateSpeed = 0.32;
controls.zoomSpeed = 0.7;
controls.panSpeed = 0.6;
controls.enabled = false;   // 起動時は一人称モード
controls.update();

/* ------------------------------------------------------------------ */
/* 1) ローディング UI                                                   */
/* ------------------------------------------------------------------ */
const loading = initLoading(() => {
  abortAllAssets();
  skipped = true;
});
let skipped = false;

onProgress((p, label) => loading.setProgress(p * 0.92, label));

/* ------------------------------------------------------------------ */
/* 2) プロシージャル代替（外部アセットが全滅してもこれで成立する）        */
/* ------------------------------------------------------------------ */
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

/* ------------------------------------------------------------------ */
/* 3) 「見えない壁」ギミック                                            */
/* ------------------------------------------------------------------ */
function buildInvisibleWall() {
  const w = 512, h = 256;
  const { canvas: c, ctx } = (function () {
    const cc = document.createElement('canvas');
    cc.width = w; cc.height = h;
    return { canvas: cc, ctx: cc.getContext('2d') };
  })();
  c.width = w; c.height = h;
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, 'rgba(34,48,92,0.55)');
  g.addColorStop(0.46, 'rgba(34,48,92,0.10)');
  g.addColorStop(0.5, 'rgba(230,220,190,0.75)');
  g.addColorStop(0.54, 'rgba(109,34,51,0.10)');
  g.addColorStop(1, 'rgba(109,34,51,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // 中央線
  ctx.strokeStyle = 'rgba(240,232,208,0.9)';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();
  ctx.setLineDash([]);
  // 文字
  ctx.font = '700 26px "Hiragino Sans","Yu Gothic","Noto Sans JP",sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(220,232,255,0.92)';
  ctx.fillText('南 棟 ／ 内 進 ／ 紺', w * 0.25, 60);
  ctx.fillStyle = 'rgba(255,226,232,0.92)';
  ctx.fillText('北 棟 ／ 理 数 科 ／ え ん じ', w * 0.75, 60);
  ctx.font = '500 17px "Hiragino Sans","Yu Gothic","Noto Sans JP",sans-serif';
  ctx.fillStyle = 'rgba(240,236,220,0.85)';
  ctx.fillText('偏差値 七十', w * 0.25, 92);
  ctx.fillText('偏差値 六十', w * 0.75, 92);
  ctx.font = '700 20px "Hiragino Sans","Yu Gothic","Noto Sans JP",sans-serif';
  ctx.fillStyle = 'rgba(255,240,210,0.95)';
  ctx.fillText('十', w / 2, 130);
  ctx.font = '500 12px "Hiragino Sans","Yu Gothic","Noto Sans JP",sans-serif';
  ctx.fillStyle = 'rgba(240,236,220,0.6)';
  ctx.fillText('この「十」が、ネクタイの色の差と重なって、見えない壁を作っている。', w / 2, h - 30);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, opacity: 0, depthWrite: false,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.d, ROOM.h), mat);
  mesh.rotation.y = Math.PI / 2;
  mesh.position.set(-0.05, ROOM.h / 2, 0);
  mesh.visible = false;
  mesh.renderOrder = 8;
  return { mesh, mat };
}

/* ------------------------------------------------------------------ */
/* 4) アセット読み込み → 組み立て                                        */
/* ------------------------------------------------------------------ */
const state = {
  time: TIMES.find((t) => t.id === 'fri5'),
  board: 'miso',
  toggles: { light: false, shaft: true, dust: true, orbit: false, grid: false },
  screenMats: [],
  nightLights: [],
  hotspots: [],
  mode: 'walk',          // 'walk' = 一人称（歩く） / 'orbit' = 俯瞰（見渡す）
};

let world, furniture, props, lighting, invWall, nav;

async function boot() {
  /* --- アセット --- */
  loading.setLabel('外部アセットを解決しています…');
  let assets = { textures: {}, hdri: null, gltf: {} };
  try {
    assets = await Promise.race([
      loadAll(),
      new Promise((r) => setTimeout(() => { abortAllAssets(); r({ textures: {}, hdri: null, gltf: {} }); }, 28000)),
    ]);
  } catch (e) {
    console.warn('[main] アセット読み込みで例外（プロシージャルで続行）:', e);
  }
  if (skipped) console.info('[main] ユーザーの指示で外部アセット取得をスキップしました。');

  loading.setProgress(0.94, 'マテリアルを生成しています…');
  const M = makeMaterials(assets, procedural);

  /* --- 世界 --- */
  loading.setProgress(0.955, '教室を組み立てています…');
  const sunDir0 = sunDirection(state.time.sun.elev, state.time.sun.azi, 12);
  world = buildWorld(M, sunDir0);
  scene.add(world.root);

  furniture = buildFurniture(M);
  scene.add(furniture.root);

  props = buildProps(M, assets.gltf || {});
  scene.add(props.root);
  state.screenMats = props.screenMats;
  state.nightLights = props.nightLights;

  invWall = buildInvisibleWall();
  scene.add(invWall.mesh);

  /* --- 照明 --- */
  loading.setProgress(0.975, '照明を設定しています…');
  lighting = createLighting(scene, renderer, world, assets.hdri ? assets.hdri.texture : null);
  applyTime(state.time, true);

  /* --- ホットスポット収集 --- */
  scene.traverse((o) => {
    if (o.userData && o.userData.hotspot) state.hotspots.push(o);
  });

  /* --- 一人称ナビゲーション（当たり判定つき）--- */
  let colliders = [];
  try {
    colliders = buildColliders({ furniture, world });
  } catch (e) {
    console.warn('[main] 当たり判定を生成できませんでした（すり抜け可のまま続行）:', e);
  }
  nav = createNav({
    camera, dom: canvas, colliders, controls,
    onLockChange: (locked) => setLockUI(locked),
    onInteract: () => { interact(); },
    onModeChange: (m) => {
      state.mode = m;
      if (ui) ui.setMode(m);
      setLockUI(m === 'walk' && nav ? nav.locked : false);
      if (m !== 'walk') hideGaze();
    },
  });
  console.info(`[nav] 当たり判定 ${colliders.length} 件（机・教卓・棚・自販機・壁）`);

  /* --- UI --- */
  loading.setProgress(0.99, '入室しています…');
  wireUI();
  applyView(VIEWS.find((v) => v.id === 'dead'), true);

  loading.setProgress(1, '');
  loading.finish();
  window.__bootOK && window.__bootOK();
  console.info(
    '%c✝本質✝ 教室へようこそ%c\n桐葉高校 北棟2階 理数科B組 / 机' + furniture.count.desks + '・椅子' + furniture.count.chairs,
    'color:#c8a45a;font-weight:700', 'color:inherit'
  );
  console.info('[assets] 取得ログ:', ASSET_LOG);
  renderer.compile(scene, camera);
  lighting.requestShadowUpdate();
  renderer.render(scene, camera);
  const info = renderer.info;
  console.info(
    `[perf] ドローコール=${info.render.calls}  三角形=${info.render.triangles}  ` +
    `ジオメトリ=${info.memory.geometries}  テクスチャ=${info.memory.textures}`
  );
}

/* ------------------------------------------------------------------ */
/* 5) 状態の適用                                                       */
/* ------------------------------------------------------------------ */
function applyTime(T, silent) {
  state.time = T;
  lighting.applyTime(T);

  // 時計の針
  world.board.clockMat.map.dispose();
  world.board.clockMat.map = B.clockTexture(T.clock[0], T.clock[1]);
  world.board.clockMat.needsUpdate = true;

  // 黒板（時間帯に応じた既定の板書。日付・時限の表示も更新される）
  setBoard(T.board, true);

  // ギミックの状態を時間帯より優先して再適用
  applyCeiling();

  // スマホ画面の明るさ
  const nf = lighting.nightFactor ?? 0;
  state.screenMats.forEach((m) => { m.emissiveIntensity = 0.22 + nf * 0.85; });
  state.nightLights.forEach((n) => { n.light.intensity = nf * n.max; });

  ui && ui.setTime(T.id);
  lighting.requestShadowUpdate();
}

/** 蛍光灯＝時間帯の既定値 ＋ 手動トグルの上書き */
function applyCeiling() {
  if (!world || !lighting) return;
  const on = state.toggles.light;
  const v = on ? Math.max(state.time.ceiling, 0.9) : state.time.ceiling;
  world.lights.tubeMat.emissiveIntensity = v * 2.4;
  lighting.ceilLights.forEach((p) => { p.intensity = v * 9.0; });
  lighting.shaftMat.opacity = state.toggles.shaft ? 0.11 * (state.time.shaft ?? 1) : 0;
}

function setBoard(modeId, silent) {
  state.board = modeId;
  const t = state.time;
  const label = `${t.label} ${String(t.clock[0]).padStart(2, '0')}:${String(t.clock[1]).padStart(2, '0')}`;
  const old = world.board.boardMat.map;
  world.board.boardMat.map = B.blackboardTexture(modeId, label);
  world.board.boardMat.needsUpdate = true;
  if (old) old.dispose();
  const m = BOARD_MODES.find((x) => x.id === modeId);
  if (m) world.board.board.userData.hotspot = m.hotspot;
  if (!silent) ui && ui.setBoard(modeId);
}

/* ------------------------------------------------------------------ */
/* 6) カメラ                                                           */
/* ------------------------------------------------------------------ */
const tween = {
  active: false, t: 0, dur: 1.5,
  fromP: new THREE.Vector3(), toP: new THREE.Vector3(),
  fromT: new THREE.Vector3(), toT: new THREE.Vector3(),
};

function flyTo(pos, target, dur = 1.5) {
  tween.fromP.copy(camera.position);
  tween.fromT.copy(controls.target);
  tween.toP.set(pos[0], pos[1], pos[2]);
  tween.toT.set(target[0], target[1], target[2]);
  tween.t = 0;
  tween.dur = dur;
  tween.active = true;
}

function applyView(v, instant) {
  if (!v) return;
  if (v.time && (!state.time || state.time.id !== v.time)) {
    const T = TIMES.find((t) => t.id === v.time) || state.time;
    applyTime(T, true);
  }
  if (nav && nav.mode === 'walk') {
    // 一人称：その場面の「立ち位置」と「向き」へ移る（fp が無い preset は俯瞰用から推定）
    const fp = v.fp || { pos: [v.pos[0], EYE_STAND, v.pos[2]], look: v.target };
    nav.teleport(fp.pos, fp.look);
    tween.active = false;
    lastWallSide = wallSideOf(nav.position.x);
  } else if (instant) {
    camera.position.set(v.pos[0], v.pos[1], v.pos[2]);
    controls.target.set(v.target[0], v.target[1], v.target[2]);
    controls.update();

    // 注視点が教室の外へ飛ばないように（「やや狭い」教室の外側へは行かせない）
    const t2 = controls.target;
    t2.x = clamp(t2.x, -ROOM.w / 2 + 0.3, ROOM.w / 2 + 1.2);
    t2.y = clamp(t2.y, 0.15, ROOM.h - 0.15);
    t2.z = clamp(t2.z, -ROOM.d / 2 - 0.2, ROOM.d / 2 + 0.2);
    tween.active = false;
  } else {
    flyTo(v.pos, v.target, 1.6);
  }
  ui && ui.setView(v.id);
}

/* ------------------------------------------------------------------ */
/* 7) UI 結線                                                          */
/* ------------------------------------------------------------------ */
let ui = null;
let hotspotCard = null;
let hoverLabel = null;
let modal = null;

function wireUI() {
  ui = initPanels({
    onView: (v) => applyView(v, false),
    onTime: (t) => applyTime(t),
    onBoard: (m) => setBoard(m.id),
    onToggle: (id, on) => setToggle(id, on),
    onMode: (m) => setMode(m),
  });
  hotspotCard = initHotspotCard();
  hoverLabel = initHoverLabel();
  modal = initModal(() => {
    // モーダルを閉じたら歩行操作を戻す
    if (nav) nav.setEnabled(true);
    setLockUI(nav ? nav.locked : false);
  });

  ui.setTime(state.time.id);
  ui.setBoard(state.board);
  ui.setView('dead');
  ui.setMode(state.mode);

  /* --- 一人称用の UI 結線 --- */
  const lp = document.getElementById('lock-prompt');
  lp.addEventListener('click', () => { if (nav) nav.requestLock(); });
  setLockUI(false);

  // タッチ端末では移動スティックを出す
  if (isTouch && nav) {
    const ts = document.getElementById('touch-stick');
    if (ts) { ts.hidden = false; nav.wireStick(ts); }
  }

  const openModal = (html) => {
    if (nav) { nav.releaseLock(); nav.setEnabled(false); }
    hideGaze();
    modal.open(html);
    setLockUI(false);
  };
  document.getElementById('btn-help').addEventListener('click', () => {
    openModal(buildHelpHTML());
  });
  document.getElementById('btn-report').addEventListener('click', () => {
    openModal(buildAssetReportHTML());
    wireReportCopy();
  });

  // 初回の操作でヒントを消す
  const hint = document.getElementById('hint');
  const killHint = () => { hint.classList.add('fade'); window.removeEventListener('pointerdown', killHint); };
  setTimeout(killHint, 9000);
  window.addEventListener('pointerdown', killHint);
}

/* ------------------------------------------------------------------ */
/* 8-b) 一人称モードの UI・視線・ギミック                                */
/* ------------------------------------------------------------------ */

/** 移動モードを切り替える（UI ボタンから） */
function setMode(m) {
  if (!nav) return;
  nav.setMode(m);
}

/** 照準・ロック案内・カーソルの表示をまとめて更新 */
function setLockUI(locked) {
  const ch = document.getElementById('crosshair');
  const lp = document.getElementById('lock-prompt');
  const walk = !!nav && nav.mode === 'walk';
  const modalOpen = modal && !document.getElementById('modal').hidden;
  const cardOpen = !!hotspotCard && hotspotCard.isVisible();
  // タッチ端末では Pointer Lock が使えないので、照準を常に出してタップで調べる
  if (ch) ch.hidden = !(walk && (locked || isTouch));
  // 引用カードが出ている間はロック案内を隠す（場所が重なるため）
  if (lp) lp.hidden = !(walk && !locked) || !!modalOpen || cardOpen || isTouch;
  canvas.style.cursor = walk && locked ? 'none' : '';
  if (!walk || !locked) hideGaze();
}

/* --- 視線（画面中央）でホットスポットを拾う --- */
const gazeRay = new THREE.Raycaster();
const gazeDir = new THREE.Vector3();
let gazeCooldown = 0;
let gazeKey = null;
let lastWallSide = 0;

function hideGaze() {
  const el = document.getElementById('gaze-label');
  const ch = document.getElementById('crosshair');
  gazeKey = null;
  if (el) el.hidden = true;
  if (ch) ch.classList.remove('over');
}

function updateGaze(now) {
  if (!nav || nav.mode !== 'walk' || (!nav.locked && !isTouch)) { hideGaze(); return; }
  if (now < gazeCooldown) return;
  gazeCooldown = now + 90;
  camera.getWorldDirection(gazeDir);
  gazeRay.set(camera.position, gazeDir);
  gazeRay.far = 3.6;          // 手が届く範囲だけ
  const hits = gazeRay.intersectObjects(state.hotspots, true);
  let found = null;
  for (const h of hits) {
    if (h.object.visible === false) continue;
    const k = findHotspot(h.object);
    if (k) { found = k; break; }
  }
  if (found === gazeKey) return;
  gazeKey = found;
  const el = document.getElementById('gaze-label');
  const ch = document.getElementById('crosshair');
  if (found) {
    el.innerHTML = `${HOTSPOT_NAMES[found] || found}<span class="gk">E</span>`;
    el.hidden = false;
    ch.classList.add('over');
  } else {
    hideGaze();
  }
}

/** 「調べる」操作（E キー、またはロック中のクリック） */
function interact() {
  if (!nav || nav.mode !== 'walk') return false;
  if (gazeKey) { hotspotCard.show(gazeKey); setLockUI(nav.locked); return true; }
  // 照準が合っていなくても、目の前のホットスポットを探してみる
  camera.getWorldDirection(gazeDir);
  gazeRay.set(camera.position, gazeDir);
  gazeRay.far = 3.6;
  const hits = gazeRay.intersectObjects(state.hotspots, true);
  for (const h of hits) {
    if (h.object.visible === false) continue;
    const k = findHotspot(h.object);
    if (k) { hotspotCard.show(k); setLockUI(nav.locked); return true; }
  }
  hotspotCard.hide();
  setLockUI(nav.locked);
  return false;
}

/* --- 「見えない壁」を横切ったときのギミック --- */
const WALL_X = -0.05;   // buildInvisibleWall() の位置
let wallCooldown = 0;

function wallSideOf(x) {
  return x < WALL_X ? -1 : 1;
}

function checkInvisibleWall(t) {
  if (!nav || nav.mode !== 'walk') return;
  const p = nav.position;
  if (p.x < WALL.corridor) return;         // 廊下にいるときは対象外
  const side = wallSideOf(p.x);
  if (side === lastWallSide) return;
  lastWallSide = side;
  if (t < wallCooldown) return;
  wallCooldown = t + 14;
  hotspotCard.show('wall');
  setLockUI(nav.locked);
}

function setToggle(id, on) {
  state.toggles[id] = on;
  if (id === 'orbit') controls.autoRotate = on && state.mode !== 'walk';
  if (id === 'shaft') {
    lighting.shaftMat.opacity = on ? 0.11 * (state.time.shaft ?? 1) : 0;
  }
  if (id === 'dust') {
    lighting.dustFactor = on ? (state.time.dust ?? 0.6) : 0;
  }
  if (id === 'light') {
    applyCeiling();
    lighting.requestShadowUpdate();
  }
  if (id === 'grid') {
    invWall.mesh.visible = true;
    state._gridTarget = on ? 0.45 : 0;
  }
}

/* ------------------------------------------------------------------ */
/* 8) レイキャスト（クリックで調べる）                                   */
/* ------------------------------------------------------------------ */
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downPos = null;

function findHotspot(obj) {
  let o = obj;
  while (o) {
    if (o.userData && o.userData.hotspot) return o.userData.hotspot;
    o = o.parent;
  }
  return null;
}

canvas.addEventListener('pointerdown', (e) => { downPos = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerup', (e) => {
  if (!downPos) return;
  const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
  downPos = null;
  if (moved > 6) return; // ドラッグ中は無視

  // 一人称モード：ロック前のクリックは「ロック要求」なので inspected しない。
  // ロック中は画面中央（照準）で判定する
  if (nav && nav.mode === 'walk') {
    if (!nav.locked) return;
    interact();
    return;
  }

  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(state.hotspots, true);
  for (const h of hits) {
    if (h.object.visible === false) continue;
    const key = findHotspot(h.object);
    if (key) { hotspotCard.show(key); return; }
  }
  hotspotCard.hide();
});

/* タッチ端末：軽くタップしたら「調べる」（Pointer Lock が無いぶんの代替） */
let tapStart = null;
canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch') return;
  tapStart = { x: e.clientX, y: e.clientY, t: performance.now() };
});
canvas.addEventListener('pointerup', (e) => {
  if (!tapStart || e.pointerType !== 'touch') return;
  const moved = Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y);
  const held = performance.now() - tapStart.t;
  tapStart = null;
  if (moved < 14 && held < 320 && nav && nav.mode === 'walk') interact();
});

let hoverCooldown = 0;
canvas.addEventListener('pointermove', (e) => {
  const now = performance.now();
  // 一人称でロック中はマウスカーソルが動かないので、ホバー判定はしない
  if (nav && nav.mode === 'walk' && nav.locked) return;
  if (now < hoverCooldown) return;
  hoverCooldown = now + 60;
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(state.hotspots, true);
  let found = null;
  for (const h of hits) {
    const key = findHotspot(h.object);
    if (key) { found = key; break; }
  }
  if (found) {
    const h = (HOTSPOT_NAMES[found] || found);
    hoverLabel.show(h, e.clientX, e.clientY);
    canvas.style.cursor = 'pointer';
  } else {
    hoverLabel.hide();
    canvas.style.cursor = '';
  }
});
canvas.addEventListener('pointerleave', () => { hoverLabel.hide(); canvas.style.cursor = ''; });

const HOTSPOT_NAMES = {
  board: '黒板', boardTerrace: '河岸段丘の断面図', window: '窓（今日の電線）',
  outdoorUnit: 'エアコンの室外機', vending: '自販機', drawer: '机の引き出し',
  phone: 'スマートフォン', charger: '充電器', tieNavy: '紺のネクタイ',
  tieWine: 'えんじのネクタイ', astroBook: '天文学の本', mop: 'モップとバケツ',
  notice: '掲示板', shelf: '開いた棚', clock: '時計', teacherDesk: '教卓',
  bottle: '水筒', camera: '配信カメラ', wall: '見えない壁',
};

/* 窓そのものもホットスポットにする（窓ガラスには直接 userData を付けていないため） */
function registerWindowHotspot() {
  if (!world || !world.shell || !world.shell.winGlass) return;
  world.shell.winGlass.userData.hotspot = 'window';
  if (!state.hotspots.includes(world.shell.winGlass)) state.hotspots.push(world.shell.winGlass);
}

/* ------------------------------------------------------------------ */
/* 9) リサイズ                                                         */
/* ------------------------------------------------------------------ */
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    lighting && lighting.requestShadowUpdate();
  }, 120);
});

/* ------------------------------------------------------------------ */
/* 10) ループ                                                          */
/* ------------------------------------------------------------------ */
const clock = new THREE.Clock();
let frames = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;

  // カメラのトゥイーン
  if (tween.active) {
    tween.t += dt / tween.dur;
    if (tween.t >= 1) {
      tween.t = 1;
      tween.active = false;
    }
    const e = smoothstep(tween.t);
    camera.position.lerpVectors(tween.fromP, tween.toP, e);
    controls.target.lerpVectors(tween.fromT, tween.toT, e);
  }

  if (nav && nav.mode === 'walk') {
    // 一人称：歩行・視線・「見えない壁」の判定
    nav.update(dt);
    updateGaze(performance.now());
    checkInvisibleWall(t);
  } else if (controls.enabled) {
    controls.update();

    // 注視点が教室の外へ飛ばないように（「やや狭い」教室の外側へは行かせない）
    const t2 = controls.target;
    t2.x = clamp(t2.x, -ROOM.w / 2 + 0.3, ROOM.w / 2 + 1.2);
    t2.y = clamp(t2.y, 0.15, ROOM.h - 0.15);
    t2.z = clamp(t2.z, -ROOM.d / 2 - 0.2, ROOM.d / 2 + 0.2);
  }

  // 見えない壁のフェード
  if (invWall) {
    const cur = invWall.mat.opacity;
    const tgt = state._gridTarget ?? 0;
    invWall.mat.opacity = cur + (tgt - cur) * Math.min(1, dt * 5);
    invWall.mesh.visible = invWall.mat.opacity > 0.004;
  }

  if (lighting) {
    lighting.dustFactor = (state.toggles.dust ? 1 : 0) * (state.time.dust ?? 0.6);
    lighting.update(t, camera);
    lighting.tick(renderer);
  }

  renderer.render(scene, camera);

  frames++;
  if (frames === 3) registerWindowHotspot();
}

/* ------------------------------------------------------------------ */
/* 11) 開始                                                            */
/* ------------------------------------------------------------------ */
// WebGL コンテキスト脱落時も白画面にしない
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  console.error('[main] WebGL コンテキストが失われました');
  window.__showFatal && window.__showFatal('WebGL コンテキストが失われました。ページを再読み込みしてください。');
});

window.addEventListener('error', (e) => {
  console.error('[main] 実行時エラー:', e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[main] 未処理の拒否:', e.reason);
});

animate();

boot().catch((e) => {
  console.error('[main] 起動に失敗:', e);
  loading.fail('一部の生成に失敗しました。リロードすると直る場合があります。');
  window.__showFatal && window.__showFatal(String(e && e.message ? e.message : e));
});

/* デバッグ用：コンソールから触れるようにしておく */
window.__scene = () => ({ scene, camera, controls, renderer, world, furniture, props, lighting, nav, state });
void deg; void clamp; void DESK;
