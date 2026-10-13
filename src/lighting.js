/**
 * lighting.js — 3点セットの照明と演出
 *
 *   1) DirectionalLight ＝ 窓から差す太陽（時間帯・季節で角度と色温度を決定）
 *   2) HDRI             ＝ scene.environment 専用（背景には描かない）
 *   3) 天井照明          ＝ emissive 平面 ＋ 最小限の PointLight
 *   演出: 窓から漏れる光の筋（加算カード）／埃パーティクル／FogExp2
 *   ポストプロセスは使わない。トーンマッピングとライトだけで雰囲気を作る。
 */
import * as THREE from 'three';
import { ROOM, WALL, WINDOW } from './spec.js';
import { clamp, sunDirection } from './util.js';
import { beamTexture, dustSprite, skyTexture } from './textures.js';

/* ------------------------------------------------------------------ */
/* 光の筋（カメラ-facing の加算カード）                                  */
/* ------------------------------------------------------------------ */
class LightShaft {
  constructor(paneZ, material) {
    const L = 8.2, w0 = 1.14, w1 = 1.78;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array([
      0, -w0 / 2, 0,
      0, w0 / 2, 0,
      L, w1 / 2, 0,
      L, -w1 / 2, 0,
    ]);
    const uv = new Float32Array([0, 0, 0, 1, 1, 1, 1, 0]);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.origin = new THREE.Vector3(WALL.window - 0.06, (WINDOW.sillY + WINDOW.topY) / 2, paneZ);
    this.center = new THREE.Vector3();
    this.axis = new THREE.Vector3(-1, 0, 0);
  }

  /** 太陽方向とカメラ位置に合わせてカードを回す */
  update(dir, cameraPos) {
    const m = this.mesh;
    m.position.copy(this.origin);
    this.axis.copy(dir).normalize();
    this.center.copy(this.origin).addScaledVector(this.axis, 4.1);

    const toCam = new THREE.Vector3().subVectors(cameraPos, this.center);
    // 軸に垂直な成分だけを取り出して法線にする
    const n = toCam.clone().addScaledVector(this.axis, -toCam.dot(this.axis));
    if (n.lengthSq() < 1e-6) n.set(0, 1, 0);
    n.normalize();

    const X = this.axis.clone();
    const Z = n;
    const Y = new THREE.Vector3().crossVectors(Z, X).normalize();
    Z.crossVectors(X, Y).normalize();

    const mat = new THREE.Matrix4().makeBasis(X, Y, Z);
    m.quaternion.setFromRotationMatrix(mat);
  }
}

/* ------------------------------------------------------------------ */
/* 埃パーティクル                                                       */
/* ------------------------------------------------------------------ */
class Dust {
  constructor(count = 200) {
    this.count = count;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * (ROOM.w - 0.4);
      pos[i * 3 + 1] = 0.25 + Math.random() * (ROOM.h - 0.5);
      pos[i * 3 + 2] = (Math.random() - 0.5) * (ROOM.d - 0.4);
      seed[i] = Math.random() * Math.PI * 2;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.seeds = seed;
    this.base = pos.slice();
    this.mat = new THREE.PointsMaterial({
      map: dustSprite(),
      color: 0xfff6e2,
      size: 0.020,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
  }

  update(t, factor) {
    this.mat.opacity = 0.60 * factor;
    this.points.visible = factor > 0.02;
    if (!this.points.visible) return;
    const attr = this.points.geometry.attributes.position;
    const a = attr.array;
    for (let i = 0; i < this.count; i++) {
      const s = this.seeds[i];
      const i3 = i * 3;
      a[i3] = this.base[i3] + Math.sin(t * 0.18 + s) * 0.16;
      a[i3 + 1] = this.base[i3 + 1] + Math.sin(t * 0.11 + s * 1.7) * 0.20 + ((t * 0.012 + s) % 1) * 0.0;
      a[i3 + 2] = this.base[i3 + 2] + Math.cos(t * 0.14 + s * 0.7) * 0.16;
    }
    attr.needsUpdate = true;
  }
}

/* ------------------------------------------------------------------ */
/* プロシージャル環境マップ（HDRI が取れなかったときの代替）              */
/* ------------------------------------------------------------------ */
function buildProceduralEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const envScene = new THREE.Scene();
  // 空（上から下へ）
  const skyGeo = new THREE.SphereGeometry(10, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      top: { value: new THREE.Color(0x6d9ed4) },
      mid: { value: new THREE.Color(0xd8e4ea) },
      bot: { value: new THREE.Color(0x8b8375) },
    },
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP;
      void main(){
        float h = clamp(vP.y / 10.0 * 0.5 + 0.5, 0.0, 1.0);
        vec3 c = mix(bot, mid, smoothstep(0.35, 0.55, h));
        c = mix(c, top, smoothstep(0.55, 1.0, h));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  envScene.add(new THREE.Mesh(skyGeo, skyMat));
  // 地面
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshBasicMaterial({ color: 0x6a6558 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -3;
  envScene.add(ground);
  // 疑似太陽
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(1.6, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xfff2d8 })
  );
  sun.position.set(6, 5, -2);
  envScene.add(sun);

  const rt = pmrem.fromScene(envScene, 0.04);
  pmrem.dispose();
  skyGeo.dispose();
  ground.geometry.dispose();
  return rt.texture;
}

/* ------------------------------------------------------------------ */
/* まとめ                                                              */
/* ------------------------------------------------------------------ */
export function createLighting(scene, renderer, world, hdriTex) {
  const api = {};

  /* --- 1) 太陽 --- */
  const sun = new THREE.DirectionalLight(0xfff3e0, 3.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -7.0; sc.right = 7.0; sc.top = 7.0; sc.bottom = -7.0;
  sc.near = 0.5; sc.far = 42;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.022;
  sun.shadow.radius = 1.6;
  sun.target.position.set(0, 0.9, 0);
  scene.add(sun, sun.target);
  api.sun = sun;

  /* --- 環境光（空／地面の半球光） --- */
  const hemi = new THREE.HemisphereLight(0xc7d8e6, 0x6b6055, 0.4);
  scene.add(hemi);
  api.hemi = hemi;

  /* --- 2) HDRI（environment 専用。背景には使わない） --- */
  let envRT = null;
  if (hdriTex) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    envRT = pmrem.fromEquirectangular(hdriTex);
    pmrem.dispose();
    hdriTex.dispose();
    scene.environment = envRT.texture;
  } else {
    scene.environment = buildProceduralEnvironment(renderer);
  }
  api.envTexture = scene.environment;

  /* --- 3) 天井照明（蛍光灯） --- */
  const ceilLights = [];
  [[-1.7, -1.0], [1.7, 1.6]].forEach(([x, z]) => {
    const p = new THREE.PointLight(0xf4f8ff, 0.0, 9.0, 2.0);
    p.position.set(x, ROOM.h - 0.22, z);
    scene.add(p);
    ceilLights.push(p);
  });
  api.ceilLights = ceilLights;

  /* --- 光の筋 --- */
  const shaftMat = new THREE.MeshBasicMaterial({
    map: beamTexture(),
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    color: 0xffe6bd,
    fog: false,
  });
  const shafts = world.paneZ.map((z) => new LightShaft(z, shaftMat));
  const shaftGroup = new THREE.Group();
  shafts.forEach((s) => shaftGroup.add(s.mesh));
  scene.add(shaftGroup);
  api.shafts = shafts;
  api.shaftMat = shaftMat;

  /* --- 埃 --- */
  const dust = new Dust(200);
  scene.add(dust.points);
  api.dust = dust;

  /* --- フォグ --- */
  scene.fog = new THREE.FogExp2(0xc8d5dd, 0.012);
  api.fog = scene.fog;

  /* ---------------------------------------------------------------- */
  /* 時間帯の適用                                                      */
  /* ---------------------------------------------------------------- */
  let current = null;
  let shadowDirty = true;

  api.requestShadowUpdate = () => { shadowDirty = true; };

  api.applyTime = (T) => {
    current = T;
    // 太陽
    const dir = sunDirection(T.sun.elev, T.sun.azi, 14);
    sun.position.copy(sun.target.position).add(dir);
    sun.color.setHex(T.sunColor);
    sun.intensity = T.sunIntensity;
    // 影カメラは教室範囲にぴったり
    sc.updateProjectionMatrix();

    // 環境
    hemi.color.setHex(T.ambient);
    hemi.intensity = T.ambientIntensity;
    scene.environmentIntensity = T.envIntensity;

    // 天井照明
    world.lights.tubeMat.emissiveIntensity = T.ceiling * 2.4;
    ceilLights.forEach((p) => { p.intensity = T.ceiling * 9.0; });

    // 光の筋・埃
    api.shaftFactor = T.shaft;
    api.dustFactor = T.dust;
    shaftMat.opacity = 0.11 * T.shaft;
    shaftMat.color.setHex(T.sunColor);

    // 露出とフォグ
    renderer.toneMappingExposure = T.exposure;
    scene.fog.color.setHex(T.fog);
    scene.fog.density = T.fogDensity;
    scene.background = new THREE.Color(T.fog);

    // 空と遠景
    if (world.outdoors) {
      const om = world.outdoors.skyMat;
      if (om.map) om.map.dispose();
      om.map = skyTexture(T.sky, dir, 96, 384);
      om.needsUpdate = true;
      world.outdoors.landMat.color.setHex(T.tint);
      world.outdoors.landMat.opacity = 1.0;
    }

    // 夜だけ自販機の面板が光る
    const nightF = clamp((1 - T.sunIntensity / 3.0) * 0.9 + T.ceiling * 0.35, 0, 1);
    api.nightFactor = nightF;
    if (world.corridor) {
      const vp = world.corridor.vendingPanel;
      vp.emissiveIntensity = 0.15 + nightF * 1.05;
      world.corridor.ledMat.emissiveIntensity = 0.9 + nightF * 0.9;
    }

    shadowDirty = true;
  };

  api.update = (t, camera) => {
    if (current) {
      const dir = sunDirection(current.sun.elev, current.sun.azi, 1).normalize();
      // dir は「太陽→原点」なので、光が進む向きは -dir
      const travel = dir.clone().negate();
      shafts.forEach((s) => s.update(travel, camera.position));
    }
    dust.update(t, api.dustFactor ?? 0.6);
  };

  api.tick = (rendererRef) => {
    // shadowMap.autoUpdate = false なので、必要なときだけ1フレーム更新する
    if (shadowDirty) {
      rendererRef.shadowMap.needsUpdate = true;
      shadowDirty = false;
    } else {
      rendererRef.shadowMap.needsUpdate = false;
    }
  };

  return api;
}
