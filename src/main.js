/**
 * main.js — 起動・描画ループ・エラー境界。
 *
 *  - renderer: outputColorSpace=SRGB / ACESFilmic / PCFSoft / pixelRatio=min(dpr,2)
 *  - ほぼ静的シーンなので shadowMap.autoUpdate=false（変化時だけ needsUpdate=true）
 *  - 例外は必ず捕捉し、INFO パネルとトーストに出す（白画面・無言停止を禁止）
 */
import {
  Scene, PerspectiveCamera, WebGLRenderer, SRGBColorSpace, ACESFilmicToneMapping,
  PCFSoftShadowMap, Color, Vector3, Clock, FogExp2,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ROOM, SCENES, QUALITY } from './config.js';
import { AssetLoader } from './assets.js';
import { Classroom } from './scene.js';
import { LightingRig } from './lighting.js';
import { Gimmicks } from './gimmicks.js';
import { UI } from './ui.js';

const TEXTURE_KEYS = ['floor', 'wall', 'ceiling', 'deskWood', 'metal', 'metalRust', 'concrete'];
const MODEL_KEYS = ['waterBottle'];

function pickQuality() {
  const q = new URLSearchParams(location.search).get('quality');
  if (q === 'low' || q === 'mid' || q === 'high') return q;
  const dpr = window.devicePixelRatio || 1;
  const mem = navigator.deviceMemory || 8;
  if (dpr >= 2.5 || mem <= 4) return 'mid';
  return 'high';
}

async function boot() {
  const root = document.getElementById('app');
  const ui = new UI(root);
  const quality = pickQuality();

  /* --- レンダラ --- */
  const canvas = document.getElementById('scene');
  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance', stencil: false });
  } catch (err) {
    ui.showFatal(new Error('この環境では WebGL を利用できません（' + err.message + '）'));
    return;
  }
  const preset = QUALITY[quality] ?? QUALITY.high;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, preset.pixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;   // 静的シーン: 影は必要時のみ再計算
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  /* --- シーン / カメラ / 操作 --- */
  const scene = new Scene();
  scene.background = new Color(0x9fb0bd);
  const camera = new PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.05, 520);
  const start = SCENES[0].camera;
  camera.position.set(...start.pos);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...start.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 0.35;
  controls.maxDistance = 120;
  controls.maxPolarAngle = Math.PI * 0.52;   // 真下〜わずかに見上げる程度まで
  controls.autoRotateSpeed = 0.35;

  /* --- アセット読み込み（失敗しても必ず前へ進む） --- */
  const loader = new AssetLoader({ base: './assets/', renderer });
  ui.loadingProgress(0.02, 'アセットを確認しています…');
  let report = { items: [], fallbacks: [], totalBytes: 0 };
  try {
    report = await loader.loadAll({
      scenes: SCENES,
      textureKeys: TEXTURE_KEYS,
      envIds: [...new Set(SCENES.map((s) => s.hdri))],
      modelKeys: MODEL_KEYS,
      allowRemoteHdri: false,   // ローカルEXR優先。オンライン時は true にすると Poly Haven の 1k HDR を試す
      onProgress: (p, rep) => {
        ui.loadingProgress(0.05 + p * 0.85, `テクスチャとHDRIを読み込み中… (${rep.items.length} 件)`);
      },
    });
  } catch (err) {
    console.warn('【続行】アセット読み込みで想定外の失敗:', err);
  }

  /* --- 教室の構築 --- */
  ui.loadingProgress(0.92, '教室を組み立てています…');
  const classroom = new Classroom({ scene, assets: loader, renderer });
  try {
    classroom.build();
  } catch (err) {
    console.error(err);
    ui.showFatal(err);
    return;
  }
  if (loader.models.waterBottle) {
    try { classroom.applyBottleModel(loader.models.waterBottle); } catch (e) { console.warn('【代替】水筒モデルの適用に失敗:', e.message); }
  }

  /* --- ライティング --- */
  const lighting = new LightingRig(scene, renderer, ROOM);
  lighting.setQualities(preset);
  lighting.registerLampMeshes(classroom.lampMeshes);
  lighting.buildDust(preset.dust);

  /* --- 演出（ギミック） --- */
  const gimmicks = new Gimmicks({ ui, classroom, lighting, camera, controls, renderer, scene, quality });
  gimmicks.setAssets(loader);
  // HDRI はシーンごとに差し替えるので、ここで環境マップの入力を渡す
  loader.envs = loader.envs || {};

  // 起動時は最初の場面（四月・朝のHR）
  gimmicks.setScene(0, { instant: true });
  ui.loadingProgress(1, '完了');

  /* --- リサイズ --- */
  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, gimmicks.lowQuality ? 1 : preset.pixelRatio));
  };
  window.addEventListener('resize', onResize);

  /* --- WebGL コンテキストロスト（白画面にしない） --- */
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    ui.toastMessage('描画コンテキストが失われました。復帰を試みます…', 6000);
    window.__contextLost = true;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    window.__contextLost = false;
    renderer.shadowMap.needsUpdate = true;
    ui.toastMessage('描画を再開しました。');
  });

  /* --- 描画ループ --- */
  const clock = new Clock();
  let frames = 0, fps = 60, statTimer = 0, tAccum = 0;
  const info = renderer.info;

  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, clock.getDelta());
    tAccum += dt;
    if (window.__contextLost) return;
    try {
      gimmicks.update(dt, tAccum);
      controls.update();
      lighting.update(dt, tAccum);
      renderer.render(scene, camera);
    } catch (err) {
      console.error('【描画エラー】', err);
      ui.toastMessage('描画中にエラーが発生しました（コンソールを確認）。軽量モードで再試行できます。', 6000);
      return;   // ループ自体は止めない
    }
    frames++; statTimer += dt;
    if (statTimer > 0.5) {
      fps = frames / statTimer;
      frames = 0; statTimer = 0;
      const ok = report.items.filter((i) => i.status === 'ok').length;
      ui.setStats({
        fps, calls: info.render.calls, tris: info.render.triangles,
        seats: classroom.seats.length, quality: gimmicks.lowQuality ? 'low' : quality,
        assets: { ok, fallback: report.fallbacks.length, bytes: report.totalBytes },
      });
    }
  }

  ui.hideLoading();
  window.__novelReady = true;   // 以降のエラーは「続行」として扱う（教室は描けている）
  ui.toastMessage('ようこそ。北棟2階 理数科B組です。左下の視点プリセットから原作の場面へ移動できます。', 6000);
  frame();

  // デバッグ用（コンソールから触れるようにしておく）
  window.__novel = { scene, camera, renderer, classroom, lighting, gimmicks, loader, report, ui, maxAniso };
}

/* --- 例外は必ず拾って表示する（無言の白画面を避ける） --- */
window.addEventListener('error', (e) => {
  console.error('【捕捉】', e.error ?? e.message);
  const msg = String(e.error?.message ?? e.message);
  if (window.__novelReady) {
    // 教室は描けているので、止めずに知らせるだけ
    window.__novel?.ui?.toastMessage(`一部の処理に失敗しました（続行）: ${msg}`, 6000);
  } else {
    window.__novel?.ui?.showFatal(e.error ?? new Error(e.message));
  }
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('【捕捉: Promise】', e.reason);
  const msg = String(e.reason?.message ?? e.reason);
  if (/WebGL|context/i.test(msg) && !window.__novelReady) window.__novel?.ui?.showFatal(e.reason);
  else window.__novel?.ui?.toastMessage(`一部の処理に失敗しました（続行）: ${msg}`, 5000);
});

boot().catch((err) => {
  console.error(err);
  const ui = window.__novel?.ui;
  if (ui) ui.showFatal(err);
  else {
    const box = document.getElementById('boot-error');
    if (box) { box.textContent = String(err?.message ?? err); box.classList.remove('hidden'); }
  }
});
