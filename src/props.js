/**
 * props.js — 「人の気配」を置く
 * 引かれた椅子／置き忘れた物／忘れ物／6月の傘。
 * glTF モデルは取得できたものだけ配置し、404 なら何も置かない（＝物語が欠けるだけ）。
 */
import * as THREE from 'three';
import { DESK, ROOM } from './spec.js';
import { boxAt, cylAt, cylZAt, mergeAll, deg, makeRng } from './util.js';
import * as B from './boards.js';

const TOPY = DESK.h + 0.019; // 天板の上面

/** glTF モデルを「高さ target メートル」に正規化して足元を y=0 に置く */
export function normalizeModel(obj, targetHeight) {
  const b = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3();
  b.getSize(size);
  const center = new THREE.Vector3();
  b.getCenter(center);
  const s = targetHeight / Math.max(size.y, 1e-6);
  obj.scale.multiplyScalar(s);
  // 底面を y=0 に、水平中心を原点に
  const b2 = new THREE.Box3().setFromObject(obj);
  const c2 = new THREE.Vector3();
  b2.getCenter(c2);
  obj.position.x -= c2.x;
  obj.position.z -= c2.z;
  obj.position.y -= b2.min.y;
  return { obj, size: size.multiplyScalar(s) };
}

/** 影を出す設定をまとめて適用 */
function shadowize(root, cast = true, receive = true) {
  root.traverse((o) => {
    if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; }
  });
  return root;
}

const HS = (obj, key) => { obj.userData.hotspot = key; return obj; };

/* ================================================================== */
export function buildProps(M, gltf) {
  const root = new THREE.Group();
  root.name = 'props';
  const rng = makeRng(24680);
  const screenMats = [];   // 時間帯で光らせるもの
  const nightLights = [];  // 夜に灯るもの

  const at = (c, r) => new THREE.Vector3(DESK.cols[c], TOPY, DESK.rows[r]);

  /* ---------------------------------------------------------------- */
  /* 1) 両馬のスマートフォン（画面に掲示板）                            */
  /* ---------------------------------------------------------------- */
  {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x23282d, roughness: 0.35, metalness: 0.5 });
    const body = new THREE.Mesh(boxAt(0.076, 0.009, 0.152, 0, 0.0045, 0), bodyMat);
    g.add(body);
    const screenMat = new THREE.MeshStandardMaterial({
      map: B.phoneScreenTexture(),
      emissiveMap: B.phoneScreenTexture(),
      emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.18,
    });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.068, 0.140), screenMat);
    screen.rotation.x = -Math.PI / 2;
    screen.position.y = 0.0096;
    g.add(screen);
    screenMats.push(screenMat);
    g.position.copy(at(4, 1));
    g.rotation.y = deg(24 + rng() * 10);
    root.add(HS(shadowize(g), 'phone'));
  }

  /* ---------------------------------------------------------------- */
  /* 2) 砂糖が忘れた充電器（窓際最後列＝砂糖の席）                       */
  /* ---------------------------------------------------------------- */
  {
    const g = new THREE.Group();
    const chargerMat = new THREE.MeshStandardMaterial({ color: 0xf0efe8, roughness: 0.55 });
    const plug = new THREE.Mesh(boxAt(0.055, 0.028, 0.045, 0, 0.014, 0), chargerMat);
    g.add(plug);
    const blade = new THREE.Mesh(boxAt(0.008, 0.020, 0.014, -0.018, 0.010, -0.030), M.trim);
    const blade2 = blade.clone(); blade2.position.x = 0.018;
    g.add(blade, blade2);
    // ケーブル（垂れている）
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      pts.push(new THREE.Vector3(
        0.028 + t * 0.17 + Math.sin(t * 6) * 0.012,
        0.012 - Math.sin(t * Math.PI) * 0.035,
        0.022 + t * 0.10 + Math.cos(t * 4) * 0.014
      ));
    }
    const cable = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 22, 0.0045, 4, false),
      new THREE.MeshStandardMaterial({ color: 0xe8e6dd, roughness: 0.7 })
    );
    g.add(cable);
    g.position.copy(at(5, 4));
    g.rotation.y = deg(-18);
    root.add(HS(shadowize(g), 'charger'));
  }

  /* ---------------------------------------------------------------- */
  /* 3) 寺地の天文学の本（英雄机の上／開いた自習ノートも）                */
  /* ---------------------------------------------------------------- */
  {
    const g = new THREE.Group();
    const coverMat = new THREE.MeshStandardMaterial({ map: B.astroBookTexture(), roughness: 0.72 });
    const pageMat = new THREE.MeshStandardMaterial({ color: 0xf6f2e6, roughness: 0.95 });
    const pages = new THREE.Mesh(boxAt(0.198, 0.030, 0.272, 0, 0.015, 0), pageMat);
    const cover = new THREE.Mesh(boxAt(0.210, 0.006, 0.284, 0, 0.032, 0), coverMat);
    const coverB = new THREE.Mesh(boxAt(0.210, 0.006, 0.284, 0, -0.002, 0), coverMat);
    const spine = new THREE.Mesh(boxAt(0.012, 0.030, 0.272, -0.104, 0.015, 0), coverMat);
    g.add(pages, cover, coverB, spine);
    g.position.copy(at(3, 2));
    g.position.x -= 0.20;
    g.rotation.y = deg(14);
    root.add(HS(shadowize(g), 'astroBook'));

    // 開いたノート（自習の痕跡）
    const nb = new THREE.Group();
    const nbMat = new THREE.MeshStandardMaterial({ map: B.openNotebookTexture(), roughness: 0.94, side: THREE.DoubleSide });
    const nbGeo = new THREE.PlaneGeometry(0.44, 0.29, 12, 1);
    const pos = nbGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      pos.setZ(i, -Math.abs(x) * 0.06 + 0.006); // 中央が少し浮く
    }
    nbGeo.computeVertexNormals();
    const nbMesh = new THREE.Mesh(nbGeo, nbMat);
    nbMesh.rotation.x = -Math.PI / 2;
    nb.add(nbMesh);
    nb.position.copy(at(3, 2));
    nb.position.x += 0.13;
    nb.position.z += 0.03;
    nb.rotation.y = deg(-8);
    nbMesh.receiveShadow = true;
    root.add(nb);
  }

  /* ---------------------------------------------------------------- */
  /* 4) ネクタイ二本（紺＝内進／えんじ＝理数科）＝「見えない壁」          */
  /* ---------------------------------------------------------------- */
  const makeTie = (color, len = 0.42) => {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.05 });
    // 結び目
    const knot = new THREE.Mesh(boxAt(0.045, 0.055, 0.028, 0, 0, 0), mat);
    g.add(knot);
    // 大剣・小剣
    const big = new THREE.Mesh(boxAt(0.062, len * 0.72, 0.010, 0, -len * 0.36 - 0.02, 0.004), mat);
    const small = new THREE.Mesh(boxAt(0.050, len * 0.58, 0.010, 0, -len * 0.29 - 0.02, -0.014), mat);
    g.add(big, small);
    shadowize(g);
    return g;
  };
  {
    // えんじ：椅子の背に掛けられている（理数科の生徒が脱いだ）
    // 椅子の背に掛ける（この列の椅子はしまわれている位置なので座標が安定する）
    const tie = makeTie(0x6d2233);
    tie.position.set(DESK.cols[3], 0.795, DESK.rows[3] + DESK.chairOffsetZ - 0.03);
    tie.rotation.set(deg(4), deg(6), deg(2));
    root.add(HS(tie, 'tieWine'));

    // 紺：最前列の机に置かれている（内進生が来た痕跡）
    const tie2 = makeTie(0x22305c, 0.40);
    tie2.rotation.set(-Math.PI / 2, 0, deg(-32));
    tie2.position.set(DESK.cols[1] + 0.06, TOPY + 0.007, DESK.rows[0] + 0.02);
    root.add(HS(tie2, 'tieNavy'));
  }

  /* ---------------------------------------------------------------- */
  /* 5) カバン（机のフックと床）                                        */
  /* ---------------------------------------------------------------- */
  {
    const bagMat = [0x3f4d5c, 0x6b4a3c, 0x4a5c47].map((c) =>
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.92 }));
    const spots = [
      { c: 2, r: 1, hang: true, i: 0 },
      { c: 4, r: 2, hang: true, i: 1 },
      { c: 1, r: 3, hang: false, i: 2 },
    ];
    spots.forEach(({ c, r, hang, i }) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(boxAt(0.28, 0.30, 0.11, 0, -0.15, 0), bagMat[i]);
      g.add(body);
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.011, 5, 14, Math.PI), M.trim);
      handle.position.y = 0.0;
      g.add(handle);
      if (hang) {
        g.position.set(DESK.cols[c] + 0.30, 0.50, DESK.rows[r] + 0.06);
        g.rotation.y = deg((rng() - 0.5) * 16);
      } else {
        g.position.set(DESK.cols[c] - 0.42, 0.30, DESK.rows[r] + 0.30);
        g.rotation.set(deg(84), deg((rng() - 0.5) * 30), 0);
        g.position.y = 0.11;
      }
      root.add(shadowize(g));
    });
  }

  /* ---------------------------------------------------------------- */
  /* 6) 落ちた消しゴム（「あ、消しゴム落ちてます」）                     */
  /* ---------------------------------------------------------------- */
  {
    const e = new THREE.Mesh(boxAt(0.044, 0.019, 0.022, 0, 0.0095, 0),
      new THREE.MeshStandardMaterial({ color: 0xf2f0e6, roughness: 0.95 }));
    e.position.set(-1.28, 0.0, 0.42);
    e.rotation.y = deg(38);
    root.add(shadowize(e));
  }

  /* ---------------------------------------------------------------- */
  /* 7) 6月の傘立て（梅雨前／「雨の前の匂い」）                          */
  /* ---------------------------------------------------------------- */
  {
    const g = new THREE.Group();
    g.position.set(-3.36, 0, -3.86);
    const stand = new THREE.Mesh(cylAt(0.15, 0.13, 0.42, 0, 0.21, 0, 14, true), M.darkMetal);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.012, 5, 18), M.darkMetal);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.42;
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.13, 16), M.darkMetal);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = 0.005;
    g.add(stand, rim, bottom);

    const umbColors = [0x2f4a6b, 0x7a3b3b, 0x3c5a44];
    // 畳んだ傘2本
    [0, 1].forEach((i) => {
      const u = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: umbColors[i], roughness: 0.6 });
      const shaft = new THREE.Mesh(cylAt(0.010, 0.010, 0.62, 0, 0.31, 0, 6), M.darkMetal);
      const wrap = new THREE.Mesh(cylAt(0.026, 0.020, 0.50, 0, 0.28, 0, 8), mat);
      u.add(shaft, wrap);
      u.position.set(-0.045 + i * 0.075, 0, 0.02 - i * 0.05);
      u.rotation.z = deg(-6 + i * 11);
      u.rotation.x = deg(-4 + i * 7);
      g.add(u);
    });
    // 開いて干してある傘
    {
      const u = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: umbColors[2], roughness: 0.65, side: THREE.DoubleSide });
      const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.30, 0.20, 12, 1, true), mat);
      canopy.position.y = 0.60;
      const shaft = new THREE.Mesh(cylAt(0.009, 0.009, 0.62, 0, 0.31, 0, 6), M.darkMetal);
      u.add(canopy, shaft);
      u.position.set(0.05, 0, -0.02);
      u.rotation.z = deg(9);
      g.add(u);
    }
    root.add(shadowize(g));
  }

  /* ---------------------------------------------------------------- */
  /* 8) 窓際の机に置かれた水筒（glTF / 取得失敗時はプロシージャル）      */
  /* ---------------------------------------------------------------- */
  {
    let placed = false;
    const bottle = gltf && gltf.WaterBottle && gltf.WaterBottle.scene;
    if (bottle) {
      try {
        const inst = bottle.clone(true);
        const { obj } = normalizeModel(inst, 0.23);
        const wrap = new THREE.Group();
        wrap.add(obj);
        wrap.position.copy(at(4, 3));
        wrap.rotation.y = deg(rng() * 360);
        root.add(HS(shadowize(wrap), 'bottle'));
        placed = true;
      } catch (e) {
        console.warn('[props] WaterBottle の配置に失敗:', e);
      }
    }
    if (!placed) {
      // 代替：ペットボトル
      const g = new THREE.Group();
      const body = new THREE.Mesh(cylAt(0.033, 0.033, 0.16, 0, 0.08, 0, 14),
        new THREE.MeshPhysicalMaterial({ color: 0xdfeef2, roughness: 0.18, transmission: 0.55, transparent: true, opacity: 0.75 }));
      const neck = new THREE.Mesh(cylAt(0.015, 0.022, 0.035, 0, 0.178, 0, 10),
        new THREE.MeshStandardMaterial({ color: 0xdfeef2, roughness: 0.3 }));
      const cap = new THREE.Mesh(cylAt(0.018, 0.018, 0.022, 0, 0.202, 0, 10),
        new THREE.MeshStandardMaterial({ color: 0x2f6fa8, roughness: 0.5 }));
      const label = new THREE.Mesh(cylAt(0.034, 0.034, 0.07, 0, 0.085, 0, 14),
        new THREE.MeshStandardMaterial({ color: 0xe8f4fa, roughness: 0.7 }));
      g.add(body, neck, cap, label);
      g.position.copy(at(4, 3));
      root.add(HS(shadowize(g), 'bottle'));
    }
  }

  /* ---------------------------------------------------------------- */
  /* 9) 配信カメラ（せいちちゃんねる）＝零の数学を黒板側から撮る         */
  /* ---------------------------------------------------------------- */
  {
    const cam = gltf && gltf.AntiqueCamera && gltf.AntiqueCamera.scene;
    const g = new THREE.Group();
    if (cam) {
      try {
        const inst = cam.clone(true);
        const { obj } = normalizeModel(inst, 0.17);
        const wrap = new THREE.Group();
        wrap.add(obj);
        wrap.rotation.y = deg(182); // 黒板（-Z）を向く
        g.add(wrap);
      } catch (e) {
        console.warn('[props] AntiqueCamera の配置に失敗:', e);
      }
    } else {
      // 代替：スマホを縦に立てた簡易三脚
      const stand = new THREE.Mesh(cylAt(0.006, 0.006, 0.16, 0, 0.08, 0, 6), M.darkMetal);
      const phone = new THREE.Mesh(boxAt(0.075, 0.008, 0.145, 0, 0.17, 0),
        new THREE.MeshStandardMaterial({ color: 0x23282d, roughness: 0.4 }));
      phone.rotation.x = deg(-78);
      g.add(stand, phone);
    }
    // 教科書の山の上に置く
    const stack = new THREE.Group();
    const bookMat = [0x3d5a72, 0x6a4535, 0x4a5c47].map((c) =>
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.88 }));
    [[0.030, 0], [0.026, 1], [0.022, 2]].forEach(([hh, i], k) => {
      const bk = new THREE.Mesh(boxAt(0.20, hh, 0.27, (rng() - 0.5) * 0.012, hh / 2 + k * 0.026, (rng() - 0.5) * 0.012), bookMat[i]);
      bk.rotation.y = deg((rng() - 0.5) * 8);
      stack.add(bk);
    });
    g.add(stack);
    g.children.forEach((c) => { c.position.y += 0.078; });
    g.position.set(DESK.cols[2] + 0.02, TOPY, DESK.rows[0] + 0.10);
    g.rotation.y = deg(6);
    root.add(HS(shadowize(g), 'camera'));
  }

  /* ---------------------------------------------------------------- */
  /* 10) 棚の上：棋類とランタン（取れたときだけ）                        */
  /* ---------------------------------------------------------------- */
  {
    const shelfTopY = [0.66, 1.26];
    const chess = gltf && gltf.ABeautifulGame && gltf.ABeautifulGame.scene;
    if (chess) {
      try {
        const inst = chess.clone(true);
        const { obj } = normalizeModel(inst, 0.20);
        const wrap = new THREE.Group();
        wrap.add(obj);
        wrap.position.set(-2.35 + 0.30, shelfTopY[1] + 0.01, ROOM.d / 2 - 0.24);
        root.add(shadowize(wrap));
      } catch (e) { console.warn('[props] ABeautifulGame の配置に失敗:', e); }
    }
    const lantern = gltf && gltf.Lantern && gltf.Lantern.scene;
    if (lantern) {
      try {
        const inst = lantern.clone(true);
        const { obj } = normalizeModel(inst, 0.26);
        const wrap = new THREE.Group();
        wrap.add(obj);
        wrap.position.set(-2.35 + 0.34, 1.86, ROOM.d / 2 - 0.24);
        wrap.rotation.y = deg(24);
        root.add(shadowize(wrap));
        // 夜に灯る
        const bulb = new THREE.PointLight(0xffb066, 0.0, 3.2, 2);
        bulb.position.set(wrap.position.x, wrap.position.y + 0.20, wrap.position.z);
        root.add(bulb);
        nightLights.push({ light: bulb, max: 2.2 });
      } catch (e) { console.warn('[props] Lantern の配置に失敗:', e); }
    }
  }

  /* ---------------------------------------------------------------- */
  /* 11) 窓の外に置かれた植木鉢（窓際の定番）                            */
  /* ---------------------------------------------------------------- */
  {
    const g = new THREE.Group();
    const pot = new THREE.Mesh(cylAt(0.085, 0.065, 0.13, 0, 0.065, 0, 12),
      new THREE.MeshStandardMaterial({ color: 0x9c6b4a, roughness: 0.9 }));
    const soil = new THREE.Mesh(new THREE.CircleGeometry(0.082, 12),
      new THREE.MeshStandardMaterial({ color: 0x3a2c1e, roughness: 1 }));
    soil.rotation.x = -Math.PI / 2;
    soil.position.y = 0.128;
    g.add(pot, soil);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x4a6b3c, roughness: 0.85, side: THREE.DoubleSide });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rng();
      const h = 0.14 + rng() * 0.16;
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.055, h), leafMat);
      leaf.position.set(Math.cos(a) * 0.03, 0.13 + h / 2, Math.sin(a) * 0.03);
      leaf.rotation.set(deg(-18 + rng() * 36), -a, deg(14 + rng() * 22));
      g.add(leaf);
    }
    g.position.set(ROOM.w / 2 - 0.28, TOPY, -3.05);
    root.add(shadowize(g));
  }

  /* ---------------------------------------------------------------- */
  /* 12) 黒板の前に落ちたチョークの粉（白い点）                          */
  /* ---------------------------------------------------------------- */
  {
    const n = 60;
    const rng2 = makeRng(555);
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = (rng2() - 0.5) * 3.6 - 0.45;
      arr[i * 3 + 1] = 0.003;
      arr[i * 3 + 2] = -ROOM.d / 2 + 0.16 + rng2() * 0.55;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const dust = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xf2f5ee, size: 0.012, sizeAttenuation: true, transparent: true, opacity: 0.55, depthWrite: false,
    }));
    root.add(dust);
  }

  return { root, screenMats, nightLights };
}
