/**
 * furniture.js — 机30・椅子30（InstancedMesh）＋ 教卓 ＋ 寺地の「英雄机」
 *
 * 机・椅子は 1ジオメトリ × N の InstancedMesh、マテリアル共有。
 * ドローコールは机2＋椅子2＋英雄机2＋教卓2 ＝ 8 本（30脚ぶん）。
 * ほぼ静的シーンなので instanceMatrix は StaticDrawUsage。
 */
import * as THREE from 'three';
import { DESK, CHAIR, SEATS, ROOM } from './spec.js';
import { box, boxAt, mergeAll, deg, makeRng } from './util.js';
import * as B from './boards.js';

/* ------------------------------------------------------------------ */
/* 机（木部 / 金属部）                                                 */
/* ------------------------------------------------------------------ */
function deskGeometries() {
  const W = DESK.w, D = DESK.d, H = DESK.h;
  const wood = [];
  const metal = [];

  // 天板
  wood.push(boxAt(W, 0.035, D, 0, H, 0));
  // 前の板（めくれ上がらない簡易版）
  wood.push(boxAt(W - 0.04, 0.20, 0.022, 0, H - 0.13, -D / 2 + 0.02));
  // 本棚
  wood.push(boxAt(W - 0.06, 0.022, D - 0.06, 0, 0.19, 0));

  // 脚（パイプ）
  const lx = W / 2 - 0.035, lz = D / 2 - 0.03;
  [[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]].forEach(([x, z]) => {
    metal.push(boxAt(0.030, H - 0.035, 0.030, x, (H - 0.035) / 2, z));
  });
  // 側面の横桟
  [-1, 1].forEach((s) => {
    metal.push(boxAt(0.022, 0.022, D - 0.06, s * lx, 0.16, 0));
    metal.push(boxAt(0.022, 0.022, D - 0.06, s * lx, H - 0.16, 0));
  });
  // 背面の横桟
  metal.push(boxAt(W - 0.07, 0.022, 0.022, 0, 0.16, lz));
  metal.push(boxAt(W - 0.07, 0.022, 0.022, 0, H - 0.22, -lz));
  // カバン掛け（前側）
  metal.push(boxAt(0.020, 0.020, D - 0.10, lx - 0.02, H - 0.30, 0.04));

  return { wood: mergeAll(wood), metal: mergeAll(metal) };
}

/* ------------------------------------------------------------------ */
/* 椅子（座面+背 / 脚）                                                */
/* ------------------------------------------------------------------ */
function chairGeometries() {
  const W = CHAIR.w, D = CHAIR.d, SH = CHAIR.seatH;
  const seat = [];
  const frame = [];

  // 座面（+Z が「後ろ」。生徒は -Z の黒板を向く）
  seat.push(boxAt(W, 0.032, D, 0, SH, 0));
  // 背板
  seat.push(boxAt(W - 0.04, 0.235, 0.030, 0, SH + 0.30, D / 2 - 0.02));

  // 脚
  const lx = W / 2 - 0.028, lz = D / 2 - 0.028;
  [[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]].forEach(([x, z]) => {
    frame.push(boxAt(0.024, SH - 0.03, 0.024, x, (SH - 0.03) / 2, z));
  });
  // 背の支柱
  [-1, 1].forEach((s) => {
    frame.push(boxAt(0.024, 0.30, 0.024, s * (W / 2 - 0.028), SH + 0.11, D / 2 - 0.02));
  });
  // 横桟
  [-1, 1].forEach((s) => frame.push(boxAt(0.020, 0.020, D - 0.05, s * lx, 0.12, 0)));
  frame.push(boxAt(W - 0.06, 0.020, 0.020, 0, 0.12, lz));

  return { seat: mergeAll(seat), frame: mergeAll(frame) };
}

/* ------------------------------------------------------------------ */
/* 寺地の「英雄机」——引き出しが開いていて、紙束21枚が入っている            */
/* ------------------------------------------------------------------ */
function buildHeroDesk(M) {
  const g = new THREE.Group();
  const W = DESK.w, D = DESK.d, H = DESK.h;
  const wood = [];
  const metal = [];

  wood.push(boxAt(W, 0.035, D, 0, H, 0));
  wood.push(boxAt(W - 0.06, 0.022, D - 0.06, 0, 0.19, 0));
  // 引き出しの箱（手前 -Z に引き出されている）
  const drawer = new THREE.Group();
  drawer.position.set(0, H - 0.20, D / 2 - 0.02);
  const dw = W - 0.10, dd = D - 0.12, dh = 0.13;
  const dg = [];
  dg.push(boxAt(dw, 0.018, dd, 0, 0, dd / 2 - 0.02));                    // 底板
  dg.push(boxAt(dw, dh, 0.018, 0, dh / 2, dd / 2 - 0.02));               // 前板（生徒側）
  dg.push(boxAt(dw, dh, 0.018, 0, dh / 2, -dd / 2 + 0.02));              // 後板
  dg.push(boxAt(0.018, dh, dd, -dw / 2 + 0.02, dh / 2, 0));              // 側板
  dg.push(boxAt(0.018, dh, dd, dw / 2 - 0.02, dh / 2, 0));
  const drawerBody = new THREE.Mesh(mergeAll(dg), M.wood);
  drawerBody.castShadow = true; drawerBody.receiveShadow = true;
  drawer.add(drawerBody);
  // 取っ手
  const handle = new THREE.Mesh(boxAt(0.16, 0.022, 0.022, 0, dh * 0.55, dd / 2 + 0.01), M.trim);
  drawer.add(handle);
  g.add(drawer);

  // 引き出しの中の紙束（二十一枚）
  const papers = new THREE.Group();
  const rng = makeRng(20240);
  // テクスチャは5枚だけ作って使い回す（VRAM節約）
  const sheetMats = [];
  for (let k = 0; k < 5; k++) {
    sheetMats.push(new THREE.MeshStandardMaterial({
      map: B.paperSheetTexture(k * 2), roughness: 0.94, side: THREE.DoubleSide,
    }));
  }
  const sheetGeo = new THREE.PlaneGeometry(dw - 0.05, dd - 0.05);
  for (let i = 0; i < 21; i++) {
    const p = new THREE.Mesh(sheetGeo, sheetMats[i % 5]);
    p.rotation.x = -Math.PI / 2;
    p.rotation.z = deg((rng() - 0.5) * 7);
    p.position.set((rng() - 0.5) * 0.012, 0.012 + i * 0.0022, (rng() - 0.5) * 0.012);
    p.receiveShadow = true;
    papers.add(p);
  }
  // 一番上だけ少しめくれている
  papers.position.set(0, 0.02, 0);
  drawer.add(papers);
  drawer.position.z += 0.19; // 引き出しが開いた状態（手前＝生徒側へ）
  g.userData.hotspot = 'drawer';

  const lx = W / 2 - 0.035, lz = D / 2 - 0.03;
  [[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]].forEach(([x, z]) => {
    metal.push(boxAt(0.030, H - 0.035, 0.030, x, (H - 0.035) / 2, z));
  });
  [-1, 1].forEach((s) => metal.push(boxAt(0.022, 0.022, D - 0.06, s * lx, 0.16, 0)));
  metal.push(boxAt(W - 0.07, 0.022, 0.022, 0, 0.16, lz));

  const metalMesh = new THREE.Mesh(mergeAll(metal), M.metal);
  metalMesh.castShadow = true; metalMesh.receiveShadow = true;
  g.add(metalMesh);

  // 天板・棚・前板（木部）
  const woodMesh = new THREE.Mesh(mergeAll(wood), M.wood);
  woodMesh.castShadow = true; woodMesh.receiveShadow = true;
  g.add(woodMesh);

  return g;
}

/* ------------------------------------------------------------------ */
/* 教卓（「地形図を小脇に抱えた中年の地理教師」の机）                      */
/* ------------------------------------------------------------------ */
function buildTeacherDesk(M) {
  const g = new THREE.Group();
  const W = 1.74, D = 0.68, H = 0.76;
  const wood = [];
  const metal = [];

  wood.push(boxAt(W, 0.045, D, 0, H, 0));
  wood.push(boxAt(W - 0.08, H - 0.10, D - 0.08, 0, (H - 0.10) / 2, 0));
  // 引き出しの前板（黒板側＝-Z）
  [0.14, 0.36, 0.58].forEach((y) => {
    wood.push(boxAt(W - 0.20, 0.18, 0.02, 0, y, -D / 2 + 0.01));
    const knob = new THREE.Mesh(boxAt(0.14, 0.02, 0.022, 0, y + 0.02, -D / 2 - 0.015), M.trim);
    g.add(knob);
  });
  // 幕板
  metal.push(boxAt(W - 0.10, 0.06, 0.02, 0, 0.06, D / 2 - 0.01));

  const woodMesh = new THREE.Mesh(mergeAll(wood), M.wood);
  woodMesh.castShadow = true; woodMesh.receiveShadow = true;
  g.add(woodMesh);
  g.add(new THREE.Mesh(mergeAll(metal), M.darkMetal));

  // --- 教卓の上 ---
  // 出席簿
  const rollBook = new THREE.Mesh(boxAt(0.24, 0.014, 0.32, -0.62, H + 0.03, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x3d4c5a, roughness: 0.85 }));
  rollBook.rotation.y = deg(-8);
  rollBook.castShadow = true;
  g.add(rollBook);
  // 開いた地形図（勝也の持ち物）
  const mapMat = new THREE.MeshStandardMaterial({
    map: (function () {
      // 簡易な地形図：
      const c = document.createElement('canvas');
      c.width = 512; c.height = 340;
      const x = c.getContext('2d');
      x.fillStyle = '#e8e2cd'; x.fillRect(0, 0, 512, 340);
      const rng = makeRng(4004);
      // 等高線
      x.strokeStyle = 'rgba(140,110,70,0.55)';
      for (let k = 0; k < 16; k++) {
        x.lineWidth = k % 5 === 0 ? 1.8 : 0.9;
        x.beginPath();
        for (let a = 0; a <= 64; a++) {
          const t = (a / 64) * Math.PI * 2;
          const r = 40 + k * 12 + Math.sin(t * 3 + k) * 12 + Math.sin(t * 5 - k) * 6 + (rng() - 0.5) * 3;
          const px = 200 + Math.cos(t) * r * 1.35;
          const py = 170 + Math.sin(t) * r * 0.85;
          a === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
        }
        x.closePath();
        x.stroke();
      }
      // 水系
      x.strokeStyle = 'rgba(90,140,190,0.8)';
      x.lineWidth = 4;
      x.beginPath();
      x.moveTo(20, 300);
      x.bezierCurveTo(140, 250, 200, 320, 330, 210);
      x.bezierCurveTo(400, 150, 450, 120, 500, 60);
      x.stroke();
      // 赤い線（糸魚川-静岡構造線）
      x.strokeStyle = 'rgba(200,60,50,0.85)';
      x.lineWidth = 3;
      x.setLineDash([9, 6]);
      x.beginPath();
      x.moveTo(250, 20);
      x.bezierCurveTo(230, 130, 190, 220, 120, 330);
      x.stroke();
      x.setLineDash([]);
      x.fillStyle = '#5a4a30';
      x.font = '600 18px "Hiragino Sans","Yu Gothic","Noto Sans JP",sans-serif';
      x.fillText('地形図', 24, 34);
      x.font = '500 13px "Hiragino Sans","Yu Gothic","Noto Sans JP",sans-serif';
      x.fillText('1:25,000', 24, 54);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })(),
    roughness: 0.92, side: THREE.DoubleSide,
  });
  const mapL = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.37), mapMat);
  mapL.rotation.x = -Math.PI / 2;
  mapL.rotation.z = deg(6);
  mapL.position.set(0.16, H + 0.026, -0.03);
  mapL.receiveShadow = true;
  g.add(mapL);
  // 地形図の折り目（半分めくれている）
  const mapR = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.37), mapMat);
  mapR.rotation.x = -Math.PI / 2;
  mapR.rotation.z = deg(6);
  mapR.rotation.y = deg(150);
  mapR.position.set(0.52, H + 0.030, -0.01);
  g.add(mapR);

  // チョークの箱
  const chalkBox = new THREE.Mesh(boxAt(0.16, 0.06, 0.11, 0.66, H + 0.05, -0.10),
    new THREE.MeshStandardMaterial({ color: 0xc9b38a, roughness: 0.9 }));
  chalkBox.castShadow = true;
  g.add(chalkBox);

  g.userData.hotspot = 'teacherDesk';
  return g;
}

/* ------------------------------------------------------------------ */
/* まとめ                                                              */
/* ------------------------------------------------------------------ */
export function buildFurniture(M) {
  const root = new THREE.Group();
  root.name = 'furniture';
  const rng = makeRng(31337);

  const dg = deskGeometries();
  const cg = chairGeometries();

  // 寺地の席は英雄机にするのでインスタンスから外す
  const heroSeat = SEATS.terachi;
  const heroIdx = heroSeat.row * DESK.cols.length + heroSeat.col;

  const positions = [];
  for (let r = 0; r < DESK.rows.length; r++) {
    for (let c = 0; c < DESK.cols.length; c++) {
      positions.push({ r, c, x: DESK.cols[c], z: DESK.rows[r], idx: r * DESK.cols.length + c });
    }
  }
  const instancedSeats = positions.filter((p) => p.idx !== heroIdx);
  const N = instancedSeats.length; // 29

  const dummy = new THREE.Object3D();

  /* --- 机 --- */
  const deskWood = new THREE.InstancedMesh(dg.wood, M.wood, N);
  const deskMetal = new THREE.InstancedMesh(dg.metal, M.metal, N);
  [deskWood, deskMetal].forEach((im) => {
    im.castShadow = true;
    im.receiveShadow = true;
    im.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  });
  instancedSeats.forEach((p, i) => {
    // ごく僅かなガタつき・位置ズレ（「人の気配」）
    dummy.position.set(p.x + (rng() - 0.5) * 0.035, 0, p.z + (rng() - 0.5) * 0.04);
    dummy.rotation.set(0, deg((rng() - 0.5) * 5), 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    deskWood.setMatrixAt(i, dummy.matrix);
    deskMetal.setMatrixAt(i, dummy.matrix);
  });

  /* --- 椅子（いくつか引かれている／斜めを向いている） --- */
  const chairSeat = new THREE.InstancedMesh(cg.seat, M.fabric, N);
  const chairFrame = new THREE.InstancedMesh(cg.frame, M.metal, N);
  [chairSeat, chairFrame].forEach((im) => {
    im.castShadow = true;
    im.receiveShadow = true;
    im.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  });

  // 放課後：最前列の5脚が黒板のほうを向いて座られている
  const occupied = new Set();
  for (let c = 0; c < 5; c++) occupied.add(0 * DESK.cols.length + (5 - c)); // 窓側5つ

  // 引かれている椅子（廊下側の4番列と、窓際の2つ）
  const pulled = new Set([1 * 6 + 1, 2 * 6 + 4, 3 * 6 + 0, 4 * 6 + 3]);

  instancedSeats.forEach((p, i) => {
    let ox = 0, oz = DESK.chairOffsetZ, ry = deg((rng() - 0.5) * 9);
    if (occupied.has(p.idx)) {
      // 座られている：椅子は机に近く、まっすぐ
      oz = DESK.chairOffsetZ - 0.14;
      ry = deg((rng() - 0.5) * 5);
    } else if (pulled.has(p.idx)) {
      // 引かれている：後ろに下がって少し斜め
      oz = DESK.chairOffsetZ + 0.26 + rng() * 0.10;
      ox = (rng() - 0.5) * 0.34;
      ry = deg((rng() - 0.5) * 42);
    } else {
      // しまわれている：天板の下に半分入っている
      oz = DESK.chairOffsetZ - 0.20 + rng() * 0.05;
    }
    dummy.position.set(p.x + ox, 0, p.z + oz);
    dummy.rotation.set(0, ry, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    chairSeat.setMatrixAt(i, dummy.matrix);
    chairFrame.setMatrixAt(i, dummy.matrix);
  });

  root.add(deskWood, deskMetal, chairSeat, chairFrame);

  /* --- 英雄机（寺地の机） --- */
  const heroDesk = buildHeroDesk(M);
  heroDesk.position.set(DESK.cols[heroSeat.col], 0, DESK.rows[heroSeat.row]);
  heroDesk.rotation.y = deg(-3);
  root.add(heroDesk);
  // 英雄机の椅子（座られている状態：机に近く、斜め）
  const heroChairSeat = new THREE.Mesh(cg.seat, M.fabric);
  const heroChairFrame = new THREE.Mesh(cg.frame, M.metal);
  [heroChairSeat, heroChairFrame].forEach((m) => {
    m.castShadow = true; m.receiveShadow = true;
  });
  // 今しがた立ったように、斜め後ろへ押し出されている
  heroChairSeat.position.set(DESK.cols[heroSeat.col] + 0.46, 0, DESK.rows[heroSeat.row] + 0.02);
  heroChairFrame.position.copy(heroChairSeat.position);
  heroChairSeat.rotation.y = heroChairFrame.rotation.y = deg(-54);
  root.add(heroChairSeat, heroChairFrame);

  /* --- 教卓 --- */
  const teacher = buildTeacherDesk(M);
  teacher.position.set(-0.10, 0, -3.42);
  teacher.rotation.y = deg(2);
  root.add(teacher);

  /* --- 教員用の椅子 --- */
  const tChairSeat = new THREE.Mesh(cg.seat, M.fabric);
  const tChairFrame = new THREE.Mesh(cg.frame, M.metal);
  tChairSeat.castShadow = tChairFrame.castShadow = true;
  tChairSeat.position.set(-0.05, 0, -3.86);
  tChairFrame.position.copy(tChairSeat.position);
  tChairSeat.rotation.y = tChairFrame.rotation.y = deg(168);
  root.add(tChairSeat, tChairFrame);

  return {
    root,
    instanced: { deskWood, deskMetal, chairSeat, chairFrame },
    heroDesk,
    teacher,
    count: { desks: N + 1, chairs: N + 2, triangles: (N + 1) * 2 },
  };
}

export { ROOM };
