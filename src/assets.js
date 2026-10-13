/**
 * assets.js — 外部アセットの取得。**失敗しても絶対に止まらない**設計。
 *
 *  - 取得はすべて fetch + parse（バイト数を実測してレポートに残す）
 *  - テクスチャ失敗 → プロシージャル代替（procedural.js）へ自動切替
 *  - HDRI 失敗   → 手続き的な空グラデーション（等間隔マップ）へ切替
 *  - GLB 失敗    → プロシージャル形状（水筒など）へ切替
 *  - 各失敗は console.warn に 【代替】 として記録し、処理は続行する
 */
import { TextureLoader, SRGBColorSpace, RepeatWrapping, EquirectangularReflectionMapping } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { ASSETS } from './config.js';
import { FALLBACK_TEXTURES, makeSkyTexture } from './procedural.js';

const texLoader = new TextureLoader();

export class AssetLoader {
  constructor({ base = './assets/', renderer = null } = {}) {
    this.base = base;
    this.renderer = renderer;
    this.report = { items: [], fallbacks: [], totalBytes: 0 };
    this.textures = {};
    this.envs = {};
    this.models = {};
    this.progress = { done: 0, total: 1 };
    this.onProgress = null;
  }

  _tick() {
    this.progress.done++;
    this.onProgress?.(Math.min(1, this.progress.done / this.progress.total), this.report);
  }

  /** fetch して ArrayBuffer を得る（失敗時は throw） */
  async _fetch(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { buf: await res.arrayBuffer(), size: Number(res.headers.get('content-length')) || undefined };
  }

  /**
   * PBR テクスチャ一式を読み込む。1マップでも失敗したら、そのグループは代替テクスチャに切り替える。
   * @returns {{map?:Texture, normalMap?:Texture, roughnessMap?:Texture, procedural:boolean}}
   */
  async loadTextureGroup(key) {
    const def = ASSETS.textures[key];
    const out = { procedural: false };
    for (const [slot, file] of Object.entries(def.maps)) {
      const url = `${this.base}${def.dir}/${file}`;
      try {
        const { buf, size } = await this._fetch(url);
        const blobUrl = URL.createObjectURL(new Blob([buf], { type: 'image/webp' }));
        const tex = await new Promise((res, rej) => texLoader.load(blobUrl, res, undefined, rej));
        URL.revokeObjectURL(blobUrl);
        tex.wrapS = tex.wrapT = RepeatWrapping;
        if (slot === 'map') tex.colorSpace = SRGBColorSpace;
        tex.anisotropy = this.renderer?.capabilities?.getMaxAnisotropy?.() ?? 4;
        out[slot] = tex;
        this.report.items.push({ id: `${key}/${slot}`, kind: 'texture', url, bytes: size ?? buf.byteLength, status: 'ok' });
        this.report.totalBytes += size ?? buf.byteLength;
      } catch (err) {
        console.warn(`【代替】テクスチャ取得失敗 → プロシージャルへ切替: ${url} (${err.message})`);
        this.report.fallbacks.push({ id: `${key}/${slot}`, url, reason: err.message });
        this.report.items.push({ id: `${key}/${slot}`, kind: 'texture', url, bytes: 0, status: 'fallback' });
      }
      this._tick();
    }
    // 1枚も読めなかった or 主要マップ欠落 → 代替を生成
    if (!out.map) {
      const fallback = FALLBACK_TEXTURES[key] ?? FALLBACK_TEXTURES.wall;
      const tex = new TextureLoader().load(fallback(512).toDataURL('image/webp'));
      tex.wrapS = tex.wrapT = RepeatWrapping;
      tex.colorSpace = SRGBColorSpace;
      out.map = tex;
      out.procedural = true;
    }
    if (!out.roughnessMap && out.map) out.roughnessMap = null;
    if (!out.normalMap) out.normalMap = null;
    return out;
  }

  /**
   * HDRI（環境光）。ローカルの EXR → （任意で）Poly Haven の 1k HDR → 手続き的空 の順に試す。
   * @returns {{texture:Texture|null, source:string}}
   */
  async loadEnv(id, { allowRemote = false } = {}) {
    const localUrl = `${this.base}${ASSETS.hdri[id] ?? ASSETS.hdri.sky}`;
    const local = await this._tryEnv(localUrl, 'exr', id);
    if (local) return local;

    if (allowRemote && ASSETS.polyhaven.assets[id]) {
      const remoteUrl = `${ASSETS.polyhaven.base}1k/${ASSETS.polyhaven.assets[id]}`;
      const remote = await this._tryEnv(remoteUrl, 'hdr', id);
      if (remote) return remote;
    }
    console.warn(`【代替】HDRI を取得できないため手続き的な環境光を使います: ${id}`);
    this.report.fallbacks.push({ id: `hdri/${id}`, url: localUrl, reason: 'unavailable' });
    return { texture: null, source: 'procedural-sky' };
  }

  async _tryEnv(url, kind, id) {
    try {
      const { buf, size } = await this._fetch(url);
      const loader = kind === 'exr' ? new EXRLoader() : new RGBELoader();
      const tex = loader.parse(buf);
      tex.mapping = EquirectangularReflectionMapping;
      this.report.items.push({ id: `hdri/${id}`, kind: 'hdri', url, bytes: size ?? buf.byteLength, status: 'ok' });
      this.report.totalBytes += size ?? buf.byteLength;
      return { texture: tex, source: url };
    } catch (err) {
      console.warn(`【スキップ】HDRI 取得失敗（続行します）: ${url} (${err.message})`);
      return null;
    } finally {
      this._tick();
    }
  }

  /** 手続き的空テクスチャ（環境光の最終フォールバック） */
  proceduralSky(scene) {
    const c = makeSkyTexture(scene.sky.top, scene.sky.horizon, scene.sky.glow, 0.5, 512, 256);
    const tex = new TextureLoader().load(c.toDataURL('image/webp'));
    tex.mapping = EquirectangularReflectionMapping;
    return tex;
  }

  /**
   * GLB モデル。失敗したら null を返し、呼び出し側がプロシージャル形状を使う。
   */
  async loadModel(key) {
    const url = `${this.base}${ASSETS.models[key]}`;
    try {
      const { buf, size } = await this._fetch(url);
      const loader = new GLTFLoader();
      const gltf = await new Promise((res, rej) => loader.parse(buf, `${this.base}models/`, res, rej));
      this.report.items.push({ id: `model/${key}`, kind: 'model', url, bytes: size ?? buf.byteLength, status: 'ok' });
      this.report.totalBytes += size ?? buf.byteLength;
      return gltf.scene;
    } catch (err) {
      console.warn(`【代替】モデル取得失敗 → プロシージャル形状で続行: ${url} (${err.message})`);
      this.report.fallbacks.push({ id: `model/${key}`, url, reason: err.message });
      this.report.items.push({ id: `model/${key}`, kind: 'model', url, bytes: 0, status: 'fallback' });
      return null;
    } finally {
      this._tick();
    }
  }

  /** 全アセット読み込み（並列。1つ失敗しても全体は続行） */
  async loadAll({ scenes, textureKeys, envIds, modelKeys = [], allowRemoteHdri = false, onProgress }) {
    this.onProgress = onProgress;
    const jobs = [];
    for (const k of textureKeys) jobs.push(this.loadTextureGroup(k).then((t) => { this.textures[k] = t; }));
    for (const id of envIds) jobs.push(this.loadEnv(id, { allowRemote: allowRemoteHdri }).then((e) => { this.envs[id] = e; }));
    for (const k of modelKeys) jobs.push(this.loadModel(k).then((m) => { this.models[k] = m; }));
    this.progress.total = Math.max(1, countTextureMaps(textureKeys) + envIds.length + modelKeys.length);
    await Promise.allSettled(jobs);   // 失敗は各ローダ内で処理済み
    this.onProgress?.(1, this.report);
    return this.report;
  }
}

function countTextureMaps(keys) {
  return keys.reduce((a, k) => a + Object.keys(ASSETS.textures[k].maps).length, 0);
}
