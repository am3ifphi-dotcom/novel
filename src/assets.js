/**
 * assets.js — 外部アセットの調達（三重のフォールバック付き）
 *
 *   1) Poly Haven API  : GET https://api.polyhaven.com/files/{id}  → 実 URL を解決
 *   2) 直リンク推定     : dl.polyhaven.org / raw.githubusercontent.com の既定パターン
 *   3) プロシージャル   : src/textures.js の Canvas 生成テクスチャ
 *
 * どの段階で失敗しても例外を外に出さず、 console に記録して次へ進む。
 * （最重要ルール3「どの外部アセットが取得失敗しても白画面・クラッシュしない」）
 */
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { withTimeout } from './util.js';

/* ログ（最後にレポートとして取り出せるよう蓄積する） */
export const ASSET_LOG = [];
function log(entry) {
  ASSET_LOG.push(entry);
  const tag = entry.status === 'ok' ? '✔' : entry.status === 'skip' ? '－' : '✖';
  const size = entry.bytes ? ` (${(entry.bytes / 1024).toFixed(0)} KB)` : '';
  // eslint-disable-next-line no-console
  console.info(`[assets] ${tag} ${entry.slot} ← ${entry.source}${size}${entry.note ? ' — ' + entry.note : ''}`, entry.url || '');
}

/** 総転送量の上限（軽量化の数値目標。超えたら HDRI / glTF を見送る） */
export const BUDGET_BYTES = 16 * 1024 * 1024;
let spentBytes = 0;
const countedUrls = new Set();
/** 同じ URL は二重に数えない（arm を rough と ao で共有するため） */
function addBytes(url, bytes) {
  if (url && countedUrls.has(url)) return;
  if (url) countedUrls.add(url);
  spentBytes += bytes || 0;
}

let abortCtl = null;
export function abortAllAssets() {
  if (abortCtl) abortCtl.abort();
}

/* ------------------------------------------------------------------ */
/* 進行状況                                                            */
/* ------------------------------------------------------------------ */
const progress = { total: 0, done: 0, label: '' };
const listeners = new Set();
export function onProgress(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emitProgress() {
  const p = progress.total ? progress.done / progress.total : 0;
  listeners.forEach((fn) => fn(p, progress.label));
}
export function setTotal(n) { progress.total = n; emitProgress(); }
export function tick(label) {
  progress.done++;
  if (label) progress.label = label;
  emitProgress();
}
export function setLabel(label) { progress.label = label; emitProgress(); }

/* ------------------------------------------------------------------ */
/* Poly Haven API                                                      */
/* ------------------------------------------------------------------ */
const PH_API = 'https://api.polyhaven.com/files/';

/** JSON から「マップ種 → 解像度 → 形式」をたどって URL を拾う総当たり抽出 */
function pickFromFiles(json, mapKeys, maxRes = 2) {
  // json 例: { "diffuse": { "1k": { "jpg": { url, size } } }, "nor_gl": {...}, ... }
  for (const key of mapKeys) {
    const node = json[key];
    if (!node || typeof node !== 'object') continue;
    // 解像度の小さい順に試す（1k → 2k）
    const resKeys = Object.keys(node).sort((a, b) => {
      const pa = parseInt(a, 10), pb = parseInt(b, 10);
      if (Number.isFinite(pa) && Number.isFinite(pb)) return pa - pb;
      return a.localeCompare(b);
    });
    for (const res of resKeys) {
      const rn = parseInt(res, 10);
      if (Number.isFinite(rn) && rn > maxRes) continue;
      const formats = node[res];
      if (!formats || typeof formats !== 'object') continue;
      for (const fmt of ['jpg', 'png', 'webp', 'exr', 'hdr']) {
        const f = formats[fmt];
        if (f && f.url) return { url: f.url, bytes: f.size || 0, res, fmt, mapKey: key };
      }
      // 形式名が想定外の場合は先頭を使う
      const first = Object.values(formats).find((v) => v && v.url);
      if (first) return { url: first.url, bytes: first.size || 0, res, fmt: Object.keys(formats)[0], mapKey: key };
    }
  }
  return null;
}

/** HDRI 用（json.hdri 以下） */
function pickHdriFromFiles(json, maxRes = 1) {
  const node = json.hdri || json.HDRI;
  if (!node) return null;
  return pickFromFiles({ hdri: node }, ['hdri'], maxRes);
}

async function fetchJson(url, ms, signal) {
  const res = await withTimeout(fetch(url, { signal, mode: 'cors', cache: 'force-cache' }), ms, url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/* ------------------------------------------------------------------ */
/* テクスチャ                                                          */
/* ------------------------------------------------------------------ */
const RES_PREF = ['1k', '2k'];

/**
 * 1つのテクスチャスロットを埋める。
 * @param {object} cfg
 *   slot      : '床' などの表示名
 *   candidates: Poly Haven の asset_id 候補（先頭から順に解決を試す）
 *   maps      : { diffuse:['diffuse'], normal:['nor_gl'], rough:['rough','arm'], ao:['ao'] }
 * @returns {Promise<{diffuse?:Texture, normal?:Texture, rough?:Texture, ao?:Texture, source:string, id:string, urls:[]}>}
 */
export async function loadTextureSet(cfg) {
  const result = { source: 'procedural', id: null, urls: [], bytes: 0 };
  const signal = abortCtl ? abortCtl.signal : undefined;

  for (const id of cfg.candidates) {
    if (signal && signal.aborted) break;
    setLabel(`Poly Haven: ${id}`);
    try {
      const json = await fetchJson(PH_API + id, 9000, signal);
      const out = {};
      let got = false;
      for (const [outKey, mapKeys] of Object.entries(cfg.maps)) {
        const picked = pickFromFiles(json, mapKeys, cfg.maxRes || 2);
        if (!picked) continue;
        const url = picked.url;
        const t = await loadTextureURL(url, signal);
        if (!t) continue;
        if (outKey === 'diffuse') t.colorSpace = THREE.SRGBColorSpace;
        out[outKey] = t;
        result.urls.push({ id, map: outKey, url, bytes: picked.bytes, res: picked.res });
        result.bytes += picked.bytes || 0;
        got = true;
      }
      if (got) {
        result.source = 'polyhaven-api';
        result.id = id;
        result.urls.forEach((u) => addBytes(u.url, u.bytes));
        log({ slot: cfg.slot, status: 'ok', source: `Poly Haven(${id})`, bytes: result.bytes, url: PH_API + id, note: Object.keys(out).join('+') });
        return { ...out, ...result };
      }
      log({ slot: cfg.slot, status: 'fail', source: `Poly Haven(${id})`, note: 'マップが見つからない' });
    } catch (e) {
      log({ slot: cfg.slot, status: 'fail', source: `Poly Haven(${id})`, note: String(e.message || e) });
    }
  }

  // --- 直リンク推定 ---
  for (const id of cfg.candidates) {
    if (signal && signal.aborted) break;
    const urls = [];
    for (const [outKey, suffix] of Object.entries({ diffuse: 'diff', normal: 'nor_gl', rough: 'rough', ao: 'ao' })) {
      if (!cfg.maps[outKey]) continue;
      urls.push([outKey, `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/${id}/${id}_${suffix}_1k.jpg`]);
    }
    const out = {};
    let got = false;
    for (const [outKey, url] of urls) {
      const t = await loadTextureURL(url, signal);
      if (!t) continue;
      if (outKey === 'diffuse') t.colorSpace = THREE.SRGBColorSpace;
      out[outKey] = t;
      result.urls.push({ id, map: outKey, url, bytes: 0, res: '1k' });
      got = true;
    }
    if (got) {
      result.source = 'polyhaven-direct';
      result.id = id;
      result.urls.forEach((u) => addBytes(u.url, u.bytes));
      log({ slot: cfg.slot, status: 'ok', source: `Poly Haven 直リンク(${id})`, url: urls[0][1], note: 'API 不通のため推定 URL' });
      return { ...out, ...result };
    }
  }

  log({ slot: cfg.slot, status: 'skip', source: 'procedural', note: '外部取得成功せず／プロシージャルで代替' });
  return result;
}

// 同じ URL を二重に取りに行かない（arm を rough と ao で共有するため）
THREE.Cache.enabled = true;
const texLoader = new THREE.TextureLoader();
function loadTextureURL(url, signal) {
  return new Promise((resolve) => {
    texLoader.load(
      url,
      (t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 8;
        resolve(t);
      },
      undefined,
      () => { if (!(signal && signal.aborted)) resolve(null); else resolve(null); }
    );
  });
}

/* ------------------------------------------------------------------ */
/* HDRI（scene.environment 専用／背景には描かない）                      */
/* ------------------------------------------------------------------ */
export async function loadHdri(candidates, maxRes = 1) {
  const signal = abortCtl ? abortCtl.signal : undefined;

  for (const id of candidates) {
    if (signal && signal.aborted) break;
    setLabel(`HDRI: ${id}`);
    let url = null, bytes = 0, res = null;
    try {
      const json = await fetchJson(PH_API + id, 12000, signal);
      const picked = pickHdriFromFiles(json, maxRes) || pickFromFiles(json, ['hdri'], maxRes);
      if (picked) { url = picked.url; bytes = picked.bytes; res = picked.res; }
    } catch (e) {
      /* API 不通 → 直リンクへ */
    }
    if (!url) {
      for (const r of RES_PREF.slice(0, maxRes)) {
        url = `https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/${r}/${id}_${r}.hdr`;
        res = r;
        const ok = await headOk(url, signal);
        if (ok) break;
        url = null;
      }
    }
    if (!url) { log({ slot: 'HDRI', status: 'fail', source: `Poly Haven(${id})`, note: 'URL 解決不能' }); continue; }
    try {
      const tex = await new Promise((resolve, reject) => {
        new RGBELoader().load(url, resolve, undefined, reject);
      });
      tex.mapping = THREE.EquirectangularReflectionMapping;
      addBytes(url, bytes);
      log({ slot: 'HDRI', status: 'ok', source: `Poly Haven(${id})`, bytes, url, note: `${res} HDR` });
      return { texture: tex, id, url, bytes, source: 'polyhaven' };
    } catch (e) {
      log({ slot: 'HDRI', status: 'fail', source: `Poly Haven(${id})`, note: String(e.message || e), url });
    }
  }
  log({ slot: 'HDRI', status: 'skip', source: 'procedural', note: 'プロシージャル環境マップで代替' });
  return null;
}

function headOk(url, signal) {
  return withTimeout(
    fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' }, signal, mode: 'cors' })
      .then((r) => r.ok || r.status === 206)
      .catch(() => false),
    6000,
    url
  ).catch(() => false);
}

/* ------------------------------------------------------------------ */
/* glTF（Khronos glTF-Sample-Assets）                                  */
/* ------------------------------------------------------------------ */
const GLTF_BASE = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/';

export async function loadGltfModel(name, opts = {}) {
  const { file = `${name}.glb`, scale = 1, timeout = 9000, maxBytes = 8 * 1024 * 1024 } = opts;
  const url = `${GLTF_BASE}${name}/glTF-Binary/${file}`;
  const signal = abortCtl ? abortCtl.signal : undefined;
  setLabel(`glTF: ${name}`);
  if (signal && signal.aborted) {
    log({ slot: `glTF:${name}`, status: 'skip', source: 'aborted' });
    return null;
  }

  // 容量の事前チェック（軽量化の数値目標を守るため。HEAD が蹴られた場合はそのまま読みに行く）
  try {
    const r = await withTimeout(fetch(url, { method: 'HEAD', signal, mode: 'cors' }), 6000, url);
    const len = parseInt(r.headers.get('content-length') || '0', 10);
    if (len > maxBytes) {
      log({
        slot: `glTF:${name}`, status: 'skip', source: 'Khronos glTF-Sample-Assets', url,
        bytes: len, note: `容量上限 ${(maxBytes / 1048576).toFixed(1)}MB 超過のため不採用（プロシージャル代替）`,
      });
      return null;
    }
  } catch (e) {
    /* HEAD が使えない環境では無視して続行 */
  }

  try {
    const gltf = await withTimeout(
      new Promise((resolve, reject) => new GLTFLoader().load(url, resolve, undefined, reject)),
      timeout,
      url
    );
    const bytes = estimateBytes(gltf);
    addBytes(url, bytes);
    log({ slot: `glTF:${name}`, status: 'ok', source: 'Khronos glTF-Sample-Assets', url, bytes, note: `${countMeshes(gltf)} mesh` });
    gltf.scene.scale.setScalar(scale);
    return { scene: gltf.scene, url, bytes, name };
  } catch (e) {
    log({ slot: `glTF:${name}`, status: 'fail', source: 'Khronos glTF-Sample-Assets', url, note: String(e.message || e) });
    return null;
  }
}

function countMeshes(gltf) {
  let n = 0;
  gltf.scene.traverse((o) => { if (o.isMesh) n++; });
  return n;
}
function estimateBytes(gltf) {
  let b = 0;
  gltf.scene.traverse((o) => {
    if (o.isMesh && o.geometry) {
      const g = o.geometry;
      for (const k in g.attributes) b += g.attributes[k].array.byteLength || 0;
      if (g.index) b += g.index.array.byteLength || 0;
    }
  });
  return b;
}

/* ------------------------------------------------------------------ */
/* アセット要求の定義（ここが「採用アセット一覧」の元になる）             */
/* ------------------------------------------------------------------ */
export const ASSET_PLAN = {
  floor: {
    slot: '床（木床／リノリウム系）',
    candidates: ['wood_floor_deck', 'oak_veneer_01', 'wood_table_001', 'parquet_wood_001', 'teak_wood_002', 'concrete_floor_worn_001'],
    // arm 1枚で rough(.g) と ao(.r) を賄う＝ダウンロード半減
    maps: { diffuse: ['diffuse', 'diff', 'col'], normal: ['nor_gl', 'normal', 'nrm'], rough: ['arm', 'rough'], ao: ['arm', 'ao'] },
    maxRes: 1,
  },
  wall: {
    slot: '壁（プラスター／塗り壁）',
    candidates: ['plaster_wall_001', 'dirty_plaster', 'concrete_wall_008', 'painted_concrete_01', 'rough_concrete_02', 'concrete_floor_worn_001'],
    maps: { diffuse: ['diffuse', 'diff', 'col'], normal: ['nor_gl', 'normal', 'nrm'], rough: ['arm', 'rough'], ao: ['arm', 'ao'] },
    maxRes: 1,
  },
  wood: {
    slot: '机・椅子・棚（木部）',
    candidates: ['wood_table_001', 'oak_veneer_01', 'wood_floor_deck', 'plywood_wood_001', 'mahogany_wood'],
    maps: { diffuse: ['diffuse', 'diff', 'col'], normal: ['nor_gl', 'normal', 'nrm'], rough: ['arm', 'rough'], ao: ['arm', 'ao'] },
    maxRes: 1,
  },
  metal: {
    slot: '椅子脚・窓枠（金属）',
    candidates: ['metal_plate', 'brushed_metal_001', 'rusty_metal_02', 'green_metal_rust', 'scratched_metal_01'],
    maps: { diffuse: ['diffuse', 'diff', 'col'], normal: ['nor_gl', 'normal', 'nrm'], rough: ['arm', 'rough'] },
    maxRes: 1,
  },
};

export const HDRI_PLAN = {
  slot: 'HDRI（環境マップ専用／背景には描かない）',
  candidates: [
    'kloofendal_48d_partly_cloudy_puresky',
    'kloppenheim_06',
    'kloofendal_43d_clear_puresky',
    'spruit_sunrise',
    'sunflowers_puresky',
    'venice_sunset',
  ],
  maxRes: 1, // 1k
};

/**
 * 軽量化方針: モデルは「原作の物語に効くもの」だけ採用し、さらに容量上限で足切りする。
 * ABeautifulGame(約14MB) や Lantern は物語への寄与が小さく重いため不採用。
 */
export const GLTF_PLAN = [
  { name: 'WaterBottle', label: '水筒（コーンスープの代わりに置かれた飲み物）', maxBytes: 4 * 1024 * 1024 },
  { name: 'AntiqueCamera', label: '配信カメラ（せいちちゃんねる）', maxBytes: 8 * 1024 * 1024 },
];

/* ------------------------------------------------------------------ */
/* 一括ロード                                                          */
/* ------------------------------------------------------------------ */
export async function loadAll() {
  abortCtl = new AbortController();
  spentBytes = 0;
  progress.total = Object.keys(ASSET_PLAN).length + 1 + GLTF_PLAN.length;
  progress.done = 0;

  const out = { textures: {}, hdri: null, gltf: {}, log: ASSET_LOG };

  // テクスチャ（並列）
  await Promise.all(
    Object.entries(ASSET_PLAN).map(async ([key, cfg]) => {
      const r = await loadTextureSet(cfg);
      if (spentBytes > BUDGET_BYTES) {
        log({ slot: cfg.slot, status: 'skip', source: 'budget', note: `総転送量が上限 ${(BUDGET_BYTES / 1048576).toFixed(0)}MB を超過したため破棄（プロシージャル代替）` });
        out.textures[key] = { source: 'procedural', id: null, urls: [], bytes: 0 };
      } else {
        out.textures[key] = r;
      }
      tick(cfg.slot);
    })
  );

  // HDRI（バジェット内なら）
  if (spentBytes <= BUDGET_BYTES) {
    out.hdri = await loadHdri(HDRI_PLAN.candidates, HDRI_PLAN.maxRes);
  } else {
    log({ slot: 'HDRI', status: 'skip', source: 'budget', note: '総転送量上限のため不採用（プロシージャル環境マップ）' });
  }
  tick('HDRI');

  // glTF（原作の雰囲気に合うものだけ。404 / 容量超過は読み飛ばす）
  if (spentBytes <= BUDGET_BYTES) {
    await Promise.all(
      GLTF_PLAN.map(async (m) => {
        out.gltf[m.name] = await loadGltfModel(m.name, { maxBytes: m.maxBytes });
        tick(`glTF:${m.label}`);
      })
    );
  } else {
    GLTF_PLAN.forEach((m) => {
      out.gltf[m.name] = null;
      log({ slot: `glTF:${m.name}`, status: 'skip', source: 'budget', note: '総転送量上限のため不採用（プロシージャル代替）' });
      tick(`glTF:${m.label}`);
    });
  }

  setLabel('完了');
  return out;
}

/* ------------------------------------------------------------------ */
/* マテリアル生成（外部テクスチャが来ればそれを、来なければプロシージャル） */
/* ------------------------------------------------------------------ */
export function makeMaterials(set, procedural) {
  const T = (set && set.textures) || {};
  const use = (slotKey, procFn, repeat, tint) => {
    const rep = repeat;
    const got = T[slotKey];
    const mat = new THREE.MeshStandardMaterial({ color: tint || 0xffffff });
    if (got && got.diffuse) {
      const d = got.diffuse.clone();
      d.needsUpdate = true;
      d.wrapS = d.wrapT = THREE.RepeatWrapping;
      d.repeat.set(repeat[0], repeat[1]);
      d.colorSpace = THREE.SRGBColorSpace;
      d.anisotropy = 8;
      mat.map = d;
      if (got.normal) {
        const n = got.normal.clone();
        n.needsUpdate = true;
        n.wrapS = n.wrapT = THREE.RepeatWrapping;
        n.repeat.set(repeat[0], repeat[1]);
        mat.normalMap = n;
        mat.normalScale.set(0.7, 0.7);
      }
      if (got.rough) {
        const r = got.rough.clone();
        r.needsUpdate = true;
        r.wrapS = r.wrapT = THREE.RepeatWrapping;
        r.repeat.set(repeat[0], repeat[1]);
        mat.roughnessMap = r;
      }
      if (got.ao) {
        const a = got.ao.clone();
        a.needsUpdate = true;
        a.wrapS = a.wrapT = THREE.RepeatWrapping;
        a.repeat.set(repeat[0], repeat[1]);
        a.channel = 0; // UV を共有（uv1 が無いジオメトリ対策）
        mat.aoMap = a;
        mat.aoMapIntensity = 0.7;
      }
      mat.userData.texSource = got.source;
    } else {
      const p = procFn(rep[0], rep[1]);
      mat.map = p.map;
      if (p.normalMap) mat.normalMap = p.normalMap;
      if (p.roughnessMap) mat.roughnessMap = p.roughnessMap;
      if (p.aoMap) { p.aoMap.channel = 0; mat.aoMap = p.aoMap; }
      mat.userData.texSource = 'procedural';
    }
    return mat;
  };

  const P = procedural;
  const M = {};
  // 大きな面（床・壁・天井）の UV は「2m = 1タイル」に正規化済み。
  // 家具は box() が「1m = 1UV」で焼いているので repeat で 0.5m タイルにする。

  M.floor = use('floor', (rx, ry) => ({
    map: P.woodFloor(rx, ry),
    normalMap: P.normalNoise(rx, ry, 1.1, 26),
    roughnessMap: P.grayNoise(rx, ry, 0.44, 0.5),
  }), [1, 1], 0xffffff);
  M.floor.roughness = 0.62;
  M.floor.metalness = 0.0;

  M.wall = use('wall', (rx, ry) => ({
    map: P.plaster(rx, ry),
    normalMap: P.normalNoise(rx, ry, 0.6, 14),
    roughnessMap: P.grayNoise(rx, ry, 0.86, 0.28),
  }), [1, 1], 0xffffff);
  M.wall.roughness = 0.92;

  M.ceiling = use('ceiling', (rx, ry) => ({
    map: P.ceilingTex(rx, ry),
    roughnessMap: P.grayNoise(rx, ry, 0.90, 0.22),
  }), [1, 1], 0xffffff);
  M.ceiling.roughness = 0.95;

  M.wood = use('wood', (rx, ry) => ({
    map: P.wood(rx, ry),
    normalMap: P.normalNoise(rx, ry, 0.8, 20),
    roughnessMap: P.grayNoise(rx, ry, 0.58, 0.5),
  }), [2, 2], 0xffffff);
  M.wood.roughness = 0.68;

  M.metal = use('metal', (rx, ry) => ({
    map: P.metal(rx, ry),
    roughnessMap: P.grayNoise(rx, ry, 0.42, 0.5),
  }), [2, 2], 0xffffff);
  M.metal.roughness = 0.44;
  M.metal.metalness = 0.72;

  M.fabric = use('fabric', (rx, ry) => ({
    map: P.fabric(rx, ry),
    roughnessMap: P.grayNoise(rx, ry, 0.88, 0.2),
  }), [2, 2], 0xffffff);
  M.fabric.roughness = 0.94;

  // HDRI は environment 専用。envMapIntensity は 0.4〜0.8 の控えめ設定（トーンを濁らせない）
  M.floor.envMapIntensity = 0.45;
  M.wall.envMapIntensity = 0.60;
  M.ceiling.envMapIntensity = 0.40;
  M.wood.envMapIntensity = 0.55;
  M.metal.envMapIntensity = 0.80;
  M.fabric.envMapIntensity = 0.50;

  // 単色系
  M.blackboard = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0.0 });
  M.painted = new THREE.MeshStandardMaterial({ color: 0xdfe3e0, roughness: 0.78 });
  M.trim = new THREE.MeshStandardMaterial({ color: 0xb9bec2, roughness: 0.5, metalness: 0.5 });
  M.darkMetal = new THREE.MeshStandardMaterial({ color: 0x3f4549, roughness: 0.45, metalness: 0.8 });
  M.white = new THREE.MeshStandardMaterial({ color: 0xf2f4f2, roughness: 0.7 });
  M.paper = new THREE.MeshStandardMaterial({ color: 0xfdfaf1, roughness: 0.92 });
  M.glass = new THREE.MeshPhysicalMaterial({
    color: 0xdff0ff, roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.10,
    transmission: 0.0, side: THREE.DoubleSide, depthWrite: false,
  });

  [M.blackboard, M.painted, M.white, M.paper].forEach((m) => { m.envMapIntensity = 0.45; });
  [M.trim, M.darkMetal].forEach((m) => { m.envMapIntensity = 0.80; });
  M.glass.envMapIntensity = 0.9;

  return M;
}
