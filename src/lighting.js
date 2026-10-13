/**
 * lighting.js — 3点セット（太陽・HDRI環境光・天井照明）＋光の筋・埃・フォグ。
 * ポストプロセスは使わず、ACESFilmic のトーンマッピングと露出で空気を作る。
 */
import {
  DirectionalLight, HemisphereLight, PointLight, Group, Mesh,
  PlaneGeometry, MeshBasicMaterial, AdditiveBlending, DoubleSide,
  CanvasTexture, SphereGeometry, BackSide, Points, PointsMaterial,
  BufferGeometry, Float32BufferAttribute, PMREMGenerator, FogExp2, Color,
  SRGBColorSpace, EquirectangularReflectionMapping, Vector3, Matrix4, Quaternion,
} from 'three';
import { sunVector, kelvinToRGB, shadowRadius, ambientFactor } from './lib/sunpath.js';
import { makeDustSprite, makeShaftTexture, makeSkyTexture } from './procedural.js';

const ROOM_CENTER = { x: -0.4, y: 1.2, z: 0 };

const canvasTex = (canvas, { srgb = true } = {}) => {
  const t = new CanvasTexture(canvas);
  if (srgb) t.colorSpace = SRGBColorSpace;
  t.needsUpdate = true;
  return t;
};

export class LightingRig {
  constructor(scene, renderer, room) {
    this.scene = scene;
    this.renderer = renderer;
    this.room = room;
    this.quality = { shadowMapSize: 2048, dust: 220, shafts: true, petals: 120 };
    this.envIntensity = 0.62;
    this.essenceAmount = 0;
    this.lampOn = true;
    this._altitude = 30;
    this._skin = {};   // 場面ごとの生成物キャッシュ

    // --- 1) 太陽（窓から差し込む光・影の主） ---
    this.sun = new DirectionalLight(0xfff2dd, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(this.quality.shadowMapSize, this.quality.shadowMapSize);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    this.sun.target.position.set(ROOM_CENTER.x, 0.9, ROOM_CENTER.z);
    scene.add(this.sun, this.sun.target);

    // --- 2) 空と地面からの反射（HDRI を補助する拡散光） ---
    this.hemi = new HemisphereLight(0xbfd6ea, 0x6b6052, 0.4);
    scene.add(this.hemi);
    this.ambient = new Group();
    scene.add(this.ambient);

    // --- 3) 天井照明（蛍光灯・最小限の PointLight） ---
    this.lampLights = [];
    for (const [x, z] of [[-2.6, -1.9], [1.4, -1.9], [-2.6, 1.7], [1.4, 1.7]]) {
      const pl = new PointLight(0xfff4e2, 0.55, 11, 2);
      pl.position.set(x, room.height - 0.2, z);
      scene.add(pl);
      this.lampLights.push(pl);
    }
    // ✝本質✝モードで灯る赤いリムライト（通常は強度0）
    this.essenceLight = new PointLight(0xff5a4a, 0.0, 14, 2);
    this.essenceLight.position.set(0, 2.2, 0.6);
    scene.add(this.essenceLight);

    // --- 空のドーム（背景。HDRI は environment 専用にして背景には描かない） ---
    this._skyTex = canvasTex(makeSkyTexture(0x84aed6, 0xeef2f0, 0.2, 0.5, 512, 256));
    this.skyDome = new Mesh(
      new SphereGeometry(340, 24, 16),
      new MeshBasicMaterial({ map: this._skyTex, side: BackSide, fog: false, depthWrite: false }),
    );
    scene.add(this.skyDome);

    // --- 光の筋 ---
    this.shafts = new Group();
    scene.add(this.shafts);
    this._shaftTex = canvasTex(makeShaftTexture(128, 512), { srgb: false });

    // --- 埃 ---
    this._dustTex = canvasTex(makeDustSprite(64));
    this.dust = null;

    // --- 桜 / 落ち葉（季節の粒子） ---
    this.petals = null;
  }

  /** 影カメラを教室の範囲に合わせる（解像度を無駄にしない） */
  _fitShadowCamera(dir, reach = 24) {
    const cam = this.sun.shadow.camera;
    const span = 12.5;
    cam.left = -span; cam.right = span; cam.top = span; cam.bottom = -span;
    cam.near = 1; cam.far = reach * 2.6;
    cam.updateProjectionMatrix();
    this.sun.shadow.radius = shadowRadius(this._altitude);
    this.sun.position.set(
      ROOM_CENTER.x + dir.x * reach,
      ROOM_CENTER.y + Math.max(0.5, dir.y) * reach,
      ROOM_CENTER.z + dir.z * reach,
    );
    this.sun.target.position.set(ROOM_CENTER.x, 0.85, ROOM_CENTER.z);
    this.sun.target.updateMatrixWorld();
  }

  /**
   * 場面プリセットを適用。
   * @param sceneCfg    SCENES の要素
   * @param envTexture  等間隔マップ（EXR/HDR）。null なら手続き的な空を環境光に使う
   */
  apply(sceneCfg, { sunOverride = null, envTexture = null } = {}) {
    const s = sunOverride ?? sceneCfg.sun;
    const dir = sunVector(s.azimuth, s.altitude);
    this._altitude = s.altitude;
    this._dir = dir;
    const { r, g, b } = kelvinToRGB(s.kelvin);
    this.sun.color.setRGB(r, g, b);
    this.sun.intensity = s.intensity;
    this._fitShadowCamera(dir);

    // フォグと露出（トーン）
    this.scene.fog = new FogExp2(sceneCfg.fog.color, sceneCfg.fog.density);
    this._baseFogDensity = sceneCfg.fog.density;
    this._baseExposure = sceneCfg.exposure;
    this.renderer.toneMappingExposure = sceneCfg.exposure;

    // 拡散光（空の色を反映）
    const amb = ambientFactor(s.altitude);
    this.hemi.color.set(new Color(sceneCfg.sky.horizon));
    this.hemi.groundColor.set(0x6b6052);
    this.hemi.intensity = 0.16 + 0.42 * amb;

    // 空ドームの色を先に差し替える（環境光のフォールバックが同じ空を使うため）
    const sky = makeSkyTexture(sceneCfg.sky.top, sceneCfg.sky.horizon, sceneCfg.sky.glow, 0.5, 512, 256);
    this._skyTex.image = sky;
    this._skyTex.needsUpdate = true;
    this.skyDome.rotation.y = -(s.azimuth - 180) * Math.PI / 180 * 0.5;

    // HDRI（environment のみ・背景には描かない）
    const tex = envTexture ?? this._skyTex;
    tex.mapping = EquirectangularReflectionMapping;
    tex.needsUpdate = true;
    const pmrem = new PMREMGenerator(this.renderer);
    const envRT = pmrem.fromEquirectangular(tex);
    this.scene.environment = envRT.texture;
    this.scene.environmentIntensity = this.envIntensity;
    if (this._envRT) this._envRT.dispose();
    this._envRT = envRT;
    pmrem.dispose();

    // 光の筋
    this._buildShafts(dir);
    if (this.dust) this.setDustVisible(this.quality.shafts);

    // 影は静的なので1回だけ描き直す
    this.renderer.shadowMap.needsUpdate = true;
  }

  _buildShafts(dir) {
    for (const child of this.shafts.children) child.geometry?.dispose();   // 場面切替でジオメトリを溜めない
    this.shafts.clear();
    if (!this.quality.shafts) return;
    const d = new Vector3(-dir.x, -dir.y, -dir.z).normalize(); // 窓 → 室内へ進む向き
    const up = new Vector3(0, 1, 0);
    const h = new Vector3().crossVectors(up, d).normalize();
    const n = new Vector3().crossVectors(h, d).normalize();
    const basis = new Matrix4().makeBasis(h, d, n);
    const q = new Quaternion().setFromRotationMatrix(basis);
    const q90 = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);

    const win = this.room.window;
    const span = win.count * win.width + (win.count - 1) * win.gap;
    const x0 = this.room.width / 2 - 0.02;
    const len = 7.6;
    const mat = new MeshBasicMaterial({
      map: this._shaftTex, transparent: true, blending: AdditiveBlending,
      depthWrite: false, side: DoubleSide, opacity: 0.36, fog: true,
    });
    for (let i = 0; i < win.count; i++) {
      const zc = -span / 2 + win.width / 2 + i * (win.width + win.gap);
      const yc = win.sill + win.height / 2;
      const g = new PlaneGeometry(win.width * 0.95, len);
      const origin = new Vector3(x0, yc, zc);
      const center = origin.clone().addScaledVector(d, len * 0.5);
      const a = new Mesh(g, mat);
      a.position.copy(center);
      a.quaternion.copy(q);
      this.shafts.add(a);
      const b2 = new Mesh(g, mat);
      b2.position.copy(center);
      b2.quaternion.copy(q).multiply(q90);
      this.shafts.add(b2);
    }
  }

  /** 蛍光灯のON/OFF（朝と放課後は点灯している＝原作の手がかり） */
  setLamps(on, intensity = 1) {
    this.lampOn = on;
    this.lampLights.forEach((l) => { l.intensity = on ? 0.6 * intensity : 0; });
    if (this.lampMeshes) this.lampMeshes.forEach((m) => { m.material.emissiveIntensity = on ? 1.15 * intensity : 0.05; });
  }

  /** 蛍光灯の発光面（scene.js から渡す） */
  registerLampMeshes(meshes) { this.lampMeshes = meshes; }

  /** ✝本質✝モード（赤い光・フォグ・露出） */
  setEssence(amount) {
    this.essenceAmount = amount;
    this.essenceLight.intensity = amount * 2.6;
    this.hemi.color.lerp(new Color(0xff8080), amount * 0.3);
    if (this.scene.fog) {
      this.scene.fog.color.lerp(new Color(0xff4d4d), amount * 0.16);
      this.scene.fog.density = this._baseFogDensity * (1 + amount * 0.45);
    }
    this.renderer.toneMappingExposure = this._baseExposure * (1 + amount * 0.08);
    this.scene.environmentIntensity = this.envIntensity * (1 - amount * 0.25);
  }

  /** 埃（Points 1ドローコール・窓際に6割を集中） */
  buildDust(count = null) {
    const n = count ?? this.quality.dust;
    if (this.dust) { this.scene.remove(this.dust); this.dust.geometry.dispose(); this.dust.material.dispose(); }
    if (n <= 0) { this.dust = null; return; }
    const pos = new Float32Array(n * 3);
    const size = this.room.width / 2 - 0.6;
    for (let i = 0; i < n; i++) {
      const nearWindow = i < n * 0.6;
      pos[i * 3] = nearWindow ? Math.random() * 3.4 : -size + Math.random() * (size * 1.6);
      pos[i * 3 + 1] = 0.25 + Math.random() * 2.6;
      pos[i * 3 + 2] = -3.7 + Math.random() * 7.4;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    this.dust = new Points(g, new PointsMaterial({
      size: 0.032, map: this._dustTex, transparent: true, opacity: 0.42,
      depthWrite: false, blending: AdditiveBlending, sizeAttenuation: true,
    }));
    this.scene.add(this.dust);
  }

  setDustVisible(v) { if (this.dust) this.dust.visible = v; }

  /** 桜の花びら（春のみ・窓の外を舞う） */
  buildPetals(count = 120, color = 0xffc9dc) {
    if (this.petals) { this.scene.remove(this.petals); this.petals.geometry.dispose(); this.petals = null; }
    if (count <= 0) return;
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = 6 + Math.random() * 12;
      pos[i * 3 + 1] = -3 + Math.random() * 7;
      pos[i * 3 + 2] = -8 + Math.random() * 16;
      seed[i] = Math.random() * Math.PI * 2;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    this._petalSeed = seed;
    const tex = canvasTex(makeDustSprite(32));
    this.petals = new Points(g, new PointsMaterial({ size: 0.16, color, map: tex, transparent: true, opacity: 0.9, depthWrite: false }));
    this.scene.add(this.petals);
  }

  setQualities(q = {}) {
    Object.assign(this.quality, q);
    this.sun.shadow.mapSize.set(this.quality.shadowMapSize, this.quality.shadowMapSize);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.renderer.shadowMap.needsUpdate = true;
    if (this._dir) this._buildShafts(this._dir);
    this.buildDust();
  }

  /** 毎フレーム: 埃と花びらの漂い（CPU は軽く） */
  update(dt, t) {
    if (this.dust) {
      this.dust.rotation.y += dt * 0.01;
      this.dust.position.y = Math.sin(t * 0.11) * 0.05;
    }
    if (this.petals) {
      const arr = this.petals.geometry.getAttribute('position');
      const seed = this._petalSeed;
      for (let i = 0; i < arr.count; i++) {
        let y = arr.getY(i) - dt * (0.35 + (seed[i] % 0.3));
        let x = arr.getX(i) - dt * 0.5;
        if (y < -4) { y = 4.5; }
        if (x < 4) { x = 18; }
        arr.setY(i, y);
        arr.setX(i, x);
        arr.setZ(i, arr.getZ(i) + Math.sin(t * 1.2 + seed[i]) * dt * 0.35);
      }
      arr.needsUpdate = true;
    }
  }
}
