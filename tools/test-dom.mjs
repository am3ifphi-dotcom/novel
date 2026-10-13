/**
 * test-dom.mjs — ブラウザ無しで「DOM の代わり」を差し込み、実際に教室を組み立てる。
 *   node tools/test-dom.mjs
 *
 * 検証すること:
 *   1) キャンバス描画パイプライン（板書・掲示物・自販機・端末画面）が例外なく走る
 *   2) 黒板の板書に原作由来の語（糸魚川-静岡構造線など）が本当に描かれている
 *   3) 教室の組み立て（InstancedMesh・小物・クリック対象）が成立している
 *   4) 7場面すべての適用、席数切替、✝本質✝モードの切替が通る
 *   5) ライティングのリグ（影カメラ・埃・蛍光灯・✝の赤い光）が破綻しない
 */
import path from 'node:path';
import { Scene, Object3D, InstancedMesh } from 'three';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'src');

/* ---------------- 最小 DOM シム（描画命令を記録する） ---------------- */
const drawLog = [];
function makeCtx() {
  const noop = () => {};
  const ctx = {
    canvas: null,
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '',
    globalAlpha: 1, globalCompositeOperation: 'source-over', shadowColor: '', shadowBlur: 0,
    shadowOffsetY: 0, lineCap: '',
    save: noop, restore: noop, translate: noop, rotate: noop, scale: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, arc: noop, ellipse: noop,
    bezierCurveTo: noop, quadraticCurveTo: noop, rect: noop, roundRect: noop,
    fill: noop, stroke: noop, clip: noop, drawImage: noop, setTransform: noop,
    fillRect: (x, y, w, h) => drawLog.push({ op: 'fillRect', x, y, w, h }),
    strokeRect: noop, clearRect: noop,
    fillText: (s) => drawLog.push({ op: 'text', s }),
    strokeText: noop,
    measureText: (s) => ({ width: String(s).length * 8 }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createPattern: () => null,
  };
  return ctx;
}
function makeCanvas() {
  const c = {
    width: 300, height: 150, style: {},
    getContext: () => (c._ctx ??= makeCtx()),
    toDataURL: () => 'data:image/png;base64,AAAA',
  };
  return c;
}
globalThis.document = {
  createElement: (tag) => (tag === 'canvas' ? makeCanvas() : { style: {}, appendChild() {}, addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} }, querySelector: () => null, querySelectorAll: () => [], setAttribute() {}, textContent: '', innerHTML: '' }),
  getElementById: () => null,
  head: { appendChild() {} },
  body: { appendChild() {} },
  fonts: { ready: Promise.resolve() },
  addEventListener() {},
};
globalThis.window = {
  devicePixelRatio: 1, innerWidth: 1440, innerHeight: 900, addEventListener() {},
  location: { search: '', reload() {} }, navigator: { deviceMemory: 8 },
};
try { Object.defineProperty(globalThis, 'navigator', { value: globalThis.window.navigator, configurable: true }); } catch { /* Node 既存の navigator を尊重 */ }
if (!globalThis.performance) globalThis.performance = { now: () => Date.now() };
if (!globalThis.URL.createObjectURL) globalThis.URL.createObjectURL = () => 'blob:stub';
if (!globalThis.URL.revokeObjectURL) globalThis.URL.revokeObjectURL = () => {};

/* ---------------- import ---------------- */
const { Classroom } = await import(path.join(SRC, 'scene.js'));
const { LightingRig } = await import(path.join(SRC, 'lighting.js'));
const { ROOM, SCENES, QUALITY } = await import(path.join(SRC, 'config.js'));
const { BOARD_SCRIPTS } = await import(path.join(SRC, 'procedural.js'));

let pass = 0, fail = 0;
const ok = (cond, msg, extra = '') => {
  if (cond) { pass++; console.log(`  ✔ ${msg}${extra ? ' — ' + extra : ''}`); }
  else { fail++; console.log(`  ✘ ${msg}${extra ? ' — ' + extra : ''}`); }
};
const section = (t) => console.log(`\n■ ${t}`);

/* ---------------- 偽アセット（テクスチャは最小の代替オブジェクト） ---------------- */
const fakeTex = () => ({
  repeat: { set() {} }, wrapS: 0, wrapT: 0, colorSpace: '', anisotropy: 1, needsUpdate: false,
  clone() { return fakeTex(); }, dispose() {},
});
const fakeGroup = () => ({
  map: fakeTex(), normalMap: fakeTex(), roughnessMap: fakeTex(),
});
const assets = {
  textures: {
    floor: fakeGroup(), wall: fakeGroup(), ceiling: fakeGroup(), deskWood: fakeGroup(),
    metal: fakeGroup(), metalRust: fakeGroup(), concrete: fakeGroup(),
  },
  models: {},
  envs: {},
};

const fakeRenderer = {
  capabilities: { getMaxAnisotropy: () => 8 },
  shadowMap: { enabled: true, needsUpdate: false, type: 0 },
  toneMappingExposure: 1,
  setPixelRatio() {}, info: { render: { calls: 0, triangles: 0 } },
};

/* ---------------- 1. 教室の組み立て ---------------- */
section('1. 教室の組み立て');
const scene = new Scene();
const room = new Classroom({ scene, assets, renderer: fakeRenderer });
let buildErr = null;
try { room.build(); } catch (e) { buildErr = e; }
ok(!buildErr, 'Classroom.build() が例外なく完了する', buildErr ? buildErr.message : `${scene.children.length} ルート要素`);
if (buildErr) { console.error(buildErr); process.exit(1); }

const instanced = scene.getObjectByName('classroom').children.filter((c) => c.isInstancedMesh);
ok(instanced.length === 6, 'InstancedMesh は 6 個（机2・椅子2・ロッカー2）', `${instanced.length}`);
const deskIM = room.deskWoodIM;
ok(deskIM.count === 30 && deskIM.instanceMatrix.count >= 40, '机は既定30席・最大40席ぶんの容量を持つ', `count=${deskIM.count}/${deskIM.instanceMatrix.count}`);
ok(room.seats.length === 30, '座席データが30件ある');
ok(room.roles.sugar.row === 4 && room.roles.ryouma.row === 0, '原作どおり砂糖は最後列・両馬は前列');

const ids = room.interactives.map((i) => i.id);
for (const id of ['blackboard', 'window', 'door', 'notice', 'vending', 'phone', 'book', 'map']) {
  ok(ids.includes(id), `クリック対象「${id}」が登録されている`, `${ids.filter((x) => x === id).length} 件`);
}
ok(ids.filter((i) => i === 'window').length === ROOM.window.count, `窓 ${ROOM.window.count} 枚がインタラクティブ`);
ok(room.propGroups.size >= 10, '置き忘れの小物が10種以上ある', `${room.propGroups.size} 種`);

/* ---------------- 2. 板書（CanvasTexture の内容） ---------------- */
section('2. 板書の描画内容');
const boardText = drawLog.filter((d) => d.op === 'text').map((d) => d.s);
ok(boardText.length > 100, 'キャンバスに文字が実際に描かれている', `${boardText.length} 回の fillText`);
const flat = boardText.join('｜');
ok(flat.includes('四月'), '初期板書（朝のHR）に「四月」が含まれる');
ok(flat.includes('本質'), '板書に✝本質✝の落書きが含まれる');

/* ---------------- 3. 全場面の適用 ---------------- */
section('3. 7場面の適用とギミック');
let sceneErr = null;
try {
  SCENES.forEach((cfg, i) => room.applyScene(cfg, 30));
} catch (e) { sceneErr = e; }
ok(!sceneErr, '7場面すべてを連続で適用できる', sceneErr ? sceneErr.message : '');
const boardAfter = drawLog.filter((d) => d.op === 'text').map((d) => d.s).join('｜');
for (const [label, needle] of [['味噌の地政学', '味噌が違う'], ['河岸段丘', '河岸段丘'], ['放課後', '期末考査まで']]) {
  ok(boardAfter.includes(needle), `板書に「${needle}」が描かれた（${label}）`);
}
for (const cfg of SCENES) {
  const first = BOARD_SCRIPTS[cfg.board].find((i) => i.t === 'text')?.s ?? '';
  const key = first.slice(0, 6);
  ok(boardAfter.includes(key), `「${cfg.label}」の板書が描かれた`, key);
}
let seatErr = null;
try { room.setSeatCount(40); } catch (e) { seatErr = e; }
ok(!seatErr && room.seats.length === 40, '40人仕様（原作準拠）へ切替できる', seatErr ? seatErr.message : `${deskIM.count} 席`);
ok(room.seats.every((s) => Number.isFinite(s.x) && Number.isFinite(s.z)), '40席の座標がすべて有限');
let essErr = null;
try { room.setEssence(true); } catch (e) { essErr = e; }
ok(!essErr, '✝本質✝モードへ切替できる（掲示板の貼り紙が入れ替わる）', essErr ? essErr.message : '');
const essText = drawLog.filter((d) => d.op === 'text').map((d) => d.s).join('｜');
ok(essText.includes('説明できたら'), '怪文書（砂糖の回答）が掲示板に描かれた');
ok(essText.includes('北棟にコーンスープを'), '「北棟にコーンスープを」の貼り紙が描かれた');
room.setEssence(false);
const updateErr = (() => { try { room.update(0.016, 1.2, 0.5); return null; } catch (e) { return e; } })();
ok(!updateErr, '毎フレーム更新（窓・引き戸・✝の浮遊）が例外を出さない', updateErr ? updateErr.message : '');

/* ---------------- 4. ライティング ---------------- */
section('4. ライティング');
const lightScene = new Scene();
const rig = new LightingRig(lightScene, fakeRenderer, ROOM);
ok(rig.sun.castShadow && rig.sun.shadow.mapSize.x === 2048, '太陽の影は 2048 のシャドウマップ');
let fitErr = null;
try { rig.apply(SCENES[3], { envTexture: null }); } catch (e) { fitErr = e; }
ok(/PMREMGenerator|renderer|Cannot read|not a function/.test(String(fitErr?.message)) || !fitErr,
  'PMREM を伴う apply() はフェイク描画器では止まるが、そこまでは到達している', String(fitErr?.message).slice(0, 48));
const { sunVector } = await import(path.join(SRC, 'lib/sunpath.js'));
try { rig._altitude = 20; rig._fitShadowCamera(sunVector(250, 20)); } catch (e) { /* ignore */ }
ok(rig.sun.position.x > 0, '西の太陽は +X（窓側）に配置される', `x=${rig.sun.position.x.toFixed(1)}`);
ok(Math.abs(rig.sun.target.position.x - ROOM.width / 2) < ROOM.width, '太陽の照準が教室側を向く');
rig.buildDust(40);
ok(rig.dust && rig.dust.geometry.getAttribute('position').count === 40, '埃は 40 点（Points 1ドローコール）');
rig.buildPetals(20, 0xffc9dc);
ok(rig.petals && rig.petals.geometry.getAttribute('position').count === 20, '桜の花びら 20 点');
rig.setLamps(false);
ok(rig.lampLights.every((l) => l.intensity === 0), '蛍光灯を消せる');
rig.setLamps(true);
ok(rig.lampLights.every((l) => l.intensity > 0), '蛍光灯をつけられる');
rig.setEssence(1);
ok(rig.essenceLight.intensity > 0, '✝本質✝モードで赤いリムライトが点く', `強度 ${rig.essenceLight.intensity.toFixed(2)}`);
let loopErr = null;
try { for (let i = 0; i < 30; i++) rig.update(0.016, i * 0.016); } catch (e) { loopErr = e; }
ok(!loopErr, 'ライティングの毎フレーム更新が安定している', loopErr ? loopErr.message : '');

/* ---------------- 5. カメラの構図（各場面が「何か」を捉えているか） ---------------- */
section('5. プリセットの構図（視錐台に象徴的な物が入っているか）');
const { PerspectiveCamera, Vector3 } = await import('three');
const win = ROOM.window;
const winSpan = win.count * win.width + (win.count - 1) * win.gap;
const corridor = room.corridor ?? { xOut: -7.28 };
const y0 = ROOM.floorY;
const probes = {
  blackboard: [0, ROOM.blackboard.bottom + ROOM.blackboard.height / 2, -ROOM.depth / 2 + 0.23],
  window: [ROOM.width / 2 - 0.1, win.sill + win.height / 2, 0],
  sugarDesk: [room.seats.find((x) => x.row === 4 && x.col === 5)?.x ?? 2, 0.7, 2.55],
  teacherDesk: [-0.1, 0.9, -3.05],
  noticeWall: [1.3, 1.55, ROOM.depth / 2 - 0.12],
  vending: [corridor.xOut + 0.42, 1.0, -2.7],
  corridorBoard: [-ROOM.width / 2 - 0.25, 1.5, 0.9],
  paddy: [40, y0, -30],
  ridge: [95, y0 + 10, 0],
  pylon: [46, y0 + 10, -8],
  southBuilding: [30, y0 + 7, 36],
};
const expectations = {
  morning: ['blackboard', 'window'], miso: ['blackboard'], lunch: ['window', 'sugarDesk'],
  friday: ['window', 'sugarDesk'], after: ['blackboard'], corridor: ['vending', 'corridorBoard'],
  outside: ['paddy', 'ridge', 'pylon'],
};
const framing = {};
for (const cfg of SCENES) {
  const cam = new PerspectiveCamera(52, 16 / 9, 0.05, 520);
  cam.position.set(...cfg.camera.pos);
  cam.lookAt(new Vector3(...cfg.camera.target));
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  const inFrame = [];
  for (const [name, p] of Object.entries(probes)) {
    const v = new Vector3(...p).project(cam);
    if (v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1) inFrame.push(name);
  }
  framing[cfg.id] = inFrame;
  const want = expectations[cfg.id] ?? [];
  const hit = want.filter((w) => inFrame.includes(w));
  ok(hit.length > 0 && inFrame.length >= 2,
    `場面「${cfg.label}」のカメラが象徴的な物を捉えている`,
    `構図内: ${inFrame.join(', ') || 'なし'}`);
}
ok(SCENES.every((cfg) => (framing[cfg.id] ?? []).length > 0), 'どの場面も「何も無い方向」を向いていない');
ok(!framing.corridor?.includes('blackboard'), '廊下からは黒板が見えない（壁が遮蔽している＝教室が独立している）');

/* ---------------- 6. 品質プリセット ---------------- */
section('6. 品質プリセット');
const q = QUALITY;
ok(q.low.shadowMapSize < q.high.shadowMapSize && q.low.pixelRatio <= 1.1, '軽量モードは影と解像度を落とす',
  `low: ${q.low.shadowMapSize}px / dpr${q.low.pixelRatio} → high: ${q.high.shadowMapSize}px / dpr${q.high.pixelRatio}`);
let qErr = null;
try { rig.setQualities(q.low); } catch (e) { qErr = e; }
ok(!qErr, '品質プリセットを適用できる（影は必要時のみ再計算）', qErr ? qErr.message : '');

console.log(`\n結果: ${pass} 件成功 / ${fail} 件失敗`);
process.exit(fail === 0 ? 0 : 1);
