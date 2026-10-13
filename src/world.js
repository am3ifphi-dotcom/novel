/**
 * world.js — 教室の器
 * 床・壁・天井・窓枠・ガラス・扉・廊下・自販機・窓の外（電柱/電線/室外機/田んぼ）
 * 黒板・時計・掲示板・棚・天井照明。
 * 構造物はすべて Box / Cylinder / Plane の組合せ（プロシージャル造形）。
 */
import * as THREE from 'three';
import { ROOM, WALL, WINDOW } from './spec.js';
import {
  box, boxAt, cylAt, cylZAt, planeAt, mergeAll, scaleUV, makeRng, deg,
} from './util.js';
import * as B from './boards.js';
import {
  landscapeTexture, fieldGroundTexture, skyTexture, concreteTexture, fabricTexture,
} from './textures.js';

const HS = (obj, key) => { obj.userData.hotspot = key; return obj; };

/* ================================================================== */
/* 教室のシェル                                                        */
/* ================================================================== */
function buildShell(M) {
  const g = new THREE.Group();
  g.name = 'shell';
  const { w, d, h, wallT } = ROOM;

  // 大きな面の UV は「2m = 1タイル」に正規化する（建築面と家具でテクスチャ密度を揃えるため）
  const U = 0.5;

  // --- 床 ---
  const floor = new THREE.Mesh(planeAt(w, d, 0, 0, 0, { x: -Math.PI / 2 }), M.floor);
  floor.receiveShadow = true;
  scaleUV(floor.geometry, w * U, d * U);
  g.add(floor);

  // --- 天井 ---
  const ceil = new THREE.Mesh(planeAt(w, d, 0, h, 0, { x: Math.PI / 2 }), M.ceiling);
  scaleUV(ceil.geometry, w * U, d * U);
  g.add(ceil);

  // --- 前壁（黒板側・+Z 向き）---
  const front = new THREE.Mesh(planeAt(w, h, 0, h / 2, WALL.front), M.wall);
  scaleUV(front.geometry, w * U, h * U);
  front.receiveShadow = true;
  g.add(front);
  // 腰板（黒板の下は色を変える）
  const wainscot = new THREE.Mesh(boxAt(w, 1.0, 0.03, 0, 0.5, WALL.front + 0.02), M.painted);
  wainscot.receiveShadow = true;
  g.add(wainscot);

  // --- 後壁（-Z 向き）---
  const back = new THREE.Mesh(planeAt(w, h, 0, h / 2, WALL.back, { y: Math.PI }), M.wall);
  scaleUV(back.geometry, w * U, h * U);
  back.receiveShadow = true;
  g.add(back);
  const wainscotB = new THREE.Mesh(boxAt(w, 1.0, 0.03, 0, 0.5, WALL.back - 0.02), M.painted);
  wainscotB.receiveShadow = true;
  g.add(wainscotB);

  // --- 廊下側の壁（+X 向き。扉2つ＋窓帯）---
  const cw = new THREE.Group();
  const cx = WALL.corridor - wallT / 2;
  const seg = (ww, hh, zz, yy) => {
    const geo = boxAt(wallT, hh, ww, cx, yy, zz);
    scaleUV(geo, U, U);
    const m = new THREE.Mesh(geo, M.wall);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  };
  // 扉の位置
  const doorZ = [-3.0, 3.0], doorW = 0.92, doorH = 2.10;
  // ① 前端（-4.3 → -3.46）
  cw.add(seg(0.84, h, -3.87, h / 2));
  // ② 前扉 -3.46 → -2.54 : 開口（上に欄間）
  cw.add(seg(doorW, h - doorH, doorZ[0], doorH + (h - doorH) / 2));
  // ③ 中央 -2.54 → 2.54 : 窓帯
  const bandZ0 = -2.54, bandZ1 = 2.54, bandY0 = 1.15, bandY1 = 2.15;
  cw.add(seg(bandZ1 - bandZ0, bandY0, (bandZ0 + bandZ1) / 2, bandY0 / 2));
  cw.add(seg(bandZ1 - bandZ0, h - bandY1, (bandZ0 + bandZ1) / 2, bandY1 + (h - bandY1) / 2));
  // ④ 後扉 2.54 → 3.46
  cw.add(seg(doorW, h - doorH, doorZ[1], doorH + (h - doorH) / 2));
  // ⑤ 後端 3.46 → 4.3
  cw.add(seg(0.84, h, 3.87, h / 2));
  g.add(cw);

  // --- 廊下側の窓（4枚の嵌め殺し）---
  const bw = 0.70, bm = 0.10, bn = 4;
  const bspan = bn * bw + (bn - 1) * bm;
  const bz0 = (bandZ0 + bandZ1) / 2 - bspan / 2;
  const glassParts = [];
  const frameParts = [];
  for (let i = 0; i < bn; i++) {
    const pz = bz0 + bw / 2 + i * (bw + bm);
    glassParts.push(planeAt(bw, bandY1 - bandY0, WALL.corridor + 0.01, (bandY0 + bandY1) / 2, pz, { y: Math.PI / 2 }));
    frameParts.push(boxAt(0.05, 0.05, bw + 0.04, WALL.corridor - 0.01, bandY0 + 0.02, pz));
    frameParts.push(boxAt(0.05, 0.05, bw + 0.04, WALL.corridor - 0.01, bandY1 - 0.02, pz));
    frameParts.push(boxAt(0.05, bandY1 - bandY0, 0.05, WALL.corridor - 0.01, (bandY0 + bandY1) / 2, pz - bw / 2));
    frameParts.push(boxAt(0.05, bandY1 - bandY0, 0.05, WALL.corridor - 0.01, (bandY0 + bandY1) / 2, pz + bw / 2));
  }
  const cGlass = new THREE.Mesh(mergeAll(glassParts), M.glass);
  g.add(cGlass);
  g.add(new THREE.Mesh(mergeAll(frameParts), M.trim));

  // 廊下側のカーテン（半分下りている）
  {
    const curtainMat = new THREE.MeshStandardMaterial({
      map: fabricTexture(256, [4, 2], '#8d9aa4'), roughness: 0.95, side: THREE.DoubleSide,
    });
    const rng = makeRng(4242);
    const parts = [];
    for (let i = 0; i < 2; i++) {
      const pz = bz0 + bw / 2 + i * (bw + bm);
      const drop = 0.55 + rng() * 0.35;
      const geo = planeAt(bw * 1.04, (bandY1 - bandY0) * drop, WALL.corridor + 0.06, bandY1 - ((bandY1 - bandY0) * drop) / 2, pz, { y: Math.PI / 2 });
      // 波うち
      const pos = geo.attributes.position;
      for (let v = 0; v < pos.count; v++) {
        const x = pos.getX(v), y = pos.getY(v);
        pos.setZ(v, pos.getZ(v) + Math.sin(y * 12 + i) * 0.012);
        void x;
      }
      geo.computeVertexNormals();
      parts.push(geo);
    }
    const curtain = new THREE.Mesh(mergeAll(parts), curtainMat);
    curtain.castShadow = true;
    g.add(curtain);
  }

  // --- 扉（前扉だけ少し開いている＝「人の気配」）---
  const doorMat = new THREE.MeshStandardMaterial({ color: 0xcbbfa8, roughness: 0.72 });
  const makeDoor = (z, openDeg) => {
    const pivot = new THREE.Group();
    pivot.position.set(WALL.corridor + 0.02, 0, z - doorW / 2);
    const leaf = new THREE.Mesh(boxAt(0.05, doorH - 0.04, doorW - 0.04, 0, doorH / 2, doorW / 2), doorMat);
    leaf.castShadow = true; leaf.receiveShadow = true;
    pivot.add(leaf);
    // 扉の小窓
    const win = new THREE.Mesh(planeAt(0.36, 0.52, -0.035, 1.52, doorW / 2, { y: -Math.PI / 2 }), M.glass);
    pivot.add(win);
    // ノブ
    const knob = new THREE.Mesh(cylAt(0.032, 0.032, 0.14, -0.05, 1.02, doorW - 0.12, 10), M.trim);
    knob.rotation.x = Math.PI / 2;
    pivot.add(knob);
    pivot.rotation.y = deg(openDeg);
    return pivot;
  };
  const doorA = makeDoor(doorZ[0], -28);
  const doorB = makeDoor(doorZ[1], 0);
  g.add(doorA, doorB);

  // --- 窓側の壁（開口部つき）---
  const wx = WALL.window + wallT / 2;
  const parts = [];
  const total = WINDOW.totalW;
  const z0 = -total / 2;
  // 腰（窓の下）・欄間（窓の上）
  parts.push(boxAt(wallT, WINDOW.sillY, d, wx, WINDOW.sillY / 2, 0));
  parts.push(boxAt(wallT, h - WINDOW.topY, d, wx, WINDOW.topY + (h - WINDOW.topY) / 2, 0));
  // 両端の壁
  const pier = (d - total) / 2;
  parts.push(boxAt(wallT, WINDOW.height, pier, wx, (WINDOW.sillY + WINDOW.topY) / 2, -d / 2 + pier / 2));
  parts.push(boxAt(wallT, WINDOW.height, pier, wx, (WINDOW.sillY + WINDOW.topY) / 2, d / 2 - pier / 2));
  // 方立（マリオン）
  const paneZ = [], mullZ = [];
  for (let i = 0; i < WINDOW.panes; i++) {
    paneZ.push(z0 + WINDOW.paneW / 2 + i * (WINDOW.paneW + WINDOW.mullion));
    if (i < WINDOW.panes - 1) mullZ.push(z0 + WINDOW.paneW + i * (WINDOW.paneW + WINDOW.mullion) + WINDOW.mullion / 2);
  }
  mullZ.forEach((mz) => parts.push(boxAt(wallT, WINDOW.height, WINDOW.mullion, wx, (WINDOW.sillY + WINDOW.topY) / 2, mz)));
  parts.forEach((p) => scaleUV(p, 1 / 2, 1 / 2));
  const winWall = new THREE.Mesh(mergeAll(parts), M.wall);
  winWall.castShadow = true; winWall.receiveShadow = true;
  g.add(winWall);

  // --- 窓のガラスと枠 ---
  const glassG = [], frameG = [];
  const winH = WINDOW.height;
  const midY = (WINDOW.sillY + WINDOW.topY) / 2;
  paneZ.forEach((pz) => {
    glassG.push(planeAt(WINDOW.paneW - 0.04, winH - 0.04, WALL.window - 0.01, midY, pz, { y: -Math.PI / 2 }));
    frameG.push(boxAt(0.06, 0.055, WINDOW.paneW, WALL.window - 0.02, WINDOW.topY - 0.03, pz));
    frameG.push(boxAt(0.06, 0.055, WINDOW.paneW, WALL.window - 0.02, WINDOW.sillY + 0.03, pz));
    frameG.push(boxAt(0.06, winH, 0.055, WALL.window - 0.02, midY, pz - WINDOW.paneW / 2 + 0.02));
    frameG.push(boxAt(0.06, winH, 0.055, WALL.window - 0.02, midY, pz + WINDOW.paneW / 2 - 0.02));
    // 中桟
    frameG.push(boxAt(0.05, 0.035, WINDOW.paneW - 0.04, WALL.window - 0.02, midY + 0.10, pz));
  });
  const winGlass = new THREE.Mesh(mergeAll(glassG), M.glass);
  g.add(winGlass);
  g.add(new THREE.Mesh(mergeAll(frameG), M.trim));

  // 窓台（木）
  const sill = new THREE.Mesh(boxAt(0.30, 0.045, total + 0.6, WALL.window - 0.13, WINDOW.sillY + 0.02, 0), M.wood);
  sill.castShadow = true; sill.receiveShadow = true;
  scaleUV(sill.geometry, 1 / 2, 1 / 2);
  g.add(sill);

  // 窓の外側の手すり
  const railG = [];
  railG.push(cylZAt(0.022, total + 0.4, WALL.window + 0.22, 1.05, 0, 8));
  railG.push(cylZAt(0.018, total + 0.4, WALL.window + 0.10, 1.02, 0, 8));
  for (let i = 0; i <= 6; i++) {
    const rz = -total / 2 - 0.2 + (i / 6) * (total + 0.4);
    railG.push(boxAt(0.14, 0.035, 0.035, WALL.window + 0.16, 1.035, rz));
  }
  g.add(new THREE.Mesh(mergeAll(railG), M.darkMetal));

  return { group: g, paneZ, winGlass, doorA, doorB };
}

/* ================================================================== */
/* 黒板まわり                                                          */
/* ================================================================== */
function buildBlackboard(M) {
  const g = new THREE.Group();
  g.name = 'blackboard';
  const bw = 4.20, bh = 1.30;
  const cy = 1.68, cz = WALL.front + 0.03;

  const boardMat = new THREE.MeshStandardMaterial({
    map: B.blackboardTexture('miso', '火曜三限 10:50'),
    roughness: 0.90, metalness: 0.0,
  });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), boardMat);
  board.position.set(-0.45, cy, cz);
  board.receiveShadow = true;
  g.add(HS(board, 'board'));

  // 枠
  const fr = [];
  fr.push(boxAt(bw + 0.10, 0.07, 0.05, -0.45, cy + bh / 2 + 0.03, cz));
  fr.push(boxAt(bw + 0.10, 0.07, 0.05, -0.45, cy - bh / 2 - 0.03, cz));
  fr.push(boxAt(0.07, bh + 0.14, 0.05, -0.45 - bw / 2 - 0.03, cy, cz));
  fr.push(boxAt(0.07, bh + 0.14, 0.05, -0.45 + bw / 2 + 0.03, cy, cz));
  g.add(new THREE.Mesh(mergeAll(fr), M.trim));

  // チョーク置き
  const tray = [];
  tray.push(boxAt(bw + 0.14, 0.04, 0.13, -0.45, cy - bh / 2 - 0.10, cz + 0.05));
  tray.push(boxAt(bw + 0.14, 0.055, 0.02, -0.45, cy - bh / 2 - 0.075, cz + 0.115));
  const trayMesh = new THREE.Mesh(mergeAll(tray), M.wood);
  trayMesh.castShadow = true;
  g.add(trayMesh);

  // チョーク3本と黒板消し
  const chalkMat = new THREE.MeshStandardMaterial({ color: 0xf6f7f2, roughness: 0.95 });
  const eraserMat = new THREE.MeshStandardMaterial({ color: 0x4a4f52, roughness: 0.9 });
  const feltMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: 1.0 });
  [-1.4, -1.15, -0.9].forEach((x) => {
    const c = new THREE.Mesh(cylZAt(0.012, 0.085, -0.45 + x, cy - bh / 2 - 0.058, cz + 0.055, 8), chalkMat);
    c.castShadow = true;
    g.add(c);
  });
  const eraserBody = new THREE.Mesh(boxAt(0.17, 0.045, 0.075, -0.10, cy - bh / 2 - 0.062, cz + 0.055), eraserMat);
  const eraserPad = new THREE.Mesh(boxAt(0.16, 0.022, 0.068, -0.10, cy - bh / 2 - 0.093, cz + 0.055), feltMat);
  eraserBody.castShadow = true;
  g.add(eraserBody, eraserPad);
  // 赤チョーク（「味噌」の構造線の色）
  const redChalk = new THREE.Mesh(cylZAt(0.011, 0.07, 0.62, cy - bh / 2 - 0.058, cz + 0.055, 8),
    new THREE.MeshStandardMaterial({ color: 0xe8836a, roughness: 0.95 }));
  g.add(redChalk);

  // 時間割の紙（黒板の左）
  const ttMat = new THREE.MeshStandardMaterial({
    map: B.timetableTexture(), roughness: 0.95, side: THREE.DoubleSide,
  });
  const tt = new THREE.Mesh(planeAt(0.42, 0.55, -3.05, 1.72, WALL.front + 0.025), ttMat);
  tt.rotation.z = deg(1.2);
  g.add(tt);

  // 時計
  const clockMat = new THREE.MeshStandardMaterial({ map: B.clockTexture(14, 50), roughness: 0.5 });
  const clock = new THREE.Mesh(new THREE.CircleGeometry(0.185, 40), clockMat);
  clock.position.set(-0.45, 2.52, cz);
  g.add(HS(clock, 'clock'));
  const clockRim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.018, 6, 32), M.trim);
  clockRim.position.copy(clock.position);
  g.add(clockRim);

  return { group: g, board, boardMat, clock, clockMat };
}

/* ================================================================== */
/* 後ろの壁：掲示板と開いた棚                                           */
/* ================================================================== */
function buildBackWall(M) {
  const g = new THREE.Group();
  g.name = 'backwall';
  const cz = WALL.back - 0.03;

  // --- 掲示板 ---
  const nbMat = new THREE.MeshStandardMaterial({ map: B.noticeTexture(), roughness: 0.95 });
  const nb = new THREE.Mesh(planeAt(2.9, 1.10, 1.15, 1.78, cz, { y: Math.PI }), nbMat);
  g.add(HS(nb, 'notice'));
  const nbFrame = [];
  nbFrame.push(boxAt(3.06, 0.07, 0.045, 1.15, 2.36, cz - 0.02));
  nbFrame.push(boxAt(3.06, 0.07, 0.045, 1.15, 1.20, cz - 0.02));
  nbFrame.push(boxAt(0.07, 1.26, 0.045, -0.30, 1.78, cz - 0.02));
  nbFrame.push(boxAt(0.07, 1.26, 0.045, 2.60, 1.78, cz - 0.02));
  g.add(new THREE.Mesh(mergeAll(nbFrame), M.trim));

  // --- 開いた棚（掃除用具・資料・棋類）---
  const shelf = new THREE.Group();
  shelf.position.set(-2.35, 0, 0);
  const sw = 1.70, sh = 1.85, sd = 0.40;
  const sz = cz - 0.02 - sd / 2 + 0.02;
  const bodyG = [];
  bodyG.push(boxAt(0.04, sh, sd, -sw / 2 + 0.02, sh / 2, sz));
  bodyG.push(boxAt(0.04, sh, sd, sw / 2 - 0.02, sh / 2, sz));
  bodyG.push(boxAt(sw, 0.04, sd, 0, 0.02, sz));
  bodyG.push(boxAt(sw, 0.04, sd, 0, sh - 0.02, sz));
  bodyG.push(boxAt(sw, sh, 0.03, 0, sh / 2, sz - sd / 2));
  [0.62, 1.22].forEach((y) => bodyG.push(boxAt(sw - 0.10, 0.03, sd - 0.02, 0, y, sz)));
  const shelfBody = new THREE.Mesh(mergeAll(bodyG), M.wood);
  shelfBody.castShadow = true; shelfBody.receiveShadow = true;
  shelf.add(shelfBody);

  // 中身：本の背（3段）
  const spineMat = new THREE.MeshStandardMaterial({ map: B.bookSpinesTexture(), roughness: 0.9 });
  [[0.07, 0.50], [0.66, 0.42], [1.26, 0.46]].forEach(([y, hh]) => {
    const b = new THREE.Mesh(boxAt(0.62, hh, 0.24, -0.42, y + hh / 2, sz + 0.02), spineMat);
    b.castShadow = true;
    shelf.add(b);
  });
  // 書類の束
  [[0.66, 0.10]].forEach(([y, hh]) => {
    const p = new THREE.Mesh(boxAt(0.34, hh, 0.26, 0.30, y + hh / 2, sz + 0.02), M.paper);
    p.castShadow = true;
    shelf.add(p);
  });
  // 段ボール箱
  const carton = new THREE.Mesh(boxAt(0.44, 0.30, 0.30, 0.28, 0.17, sz + 0.02),
    new THREE.MeshStandardMaterial({ color: 0xb08a5c, roughness: 0.95 }));
  carton.castShadow = true;
  shelf.add(carton);

  // 扉（右だけ開いている＝「開いた棚」）
  const doorMat = new THREE.MeshStandardMaterial({ color: 0xa88a5f, roughness: 0.85 });
  const mkDoor = (x, sign, openDeg) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0, sz + sd / 2);
    const leaf = new THREE.Mesh(boxAt(sw / 2 - 0.04, sh - 0.06, 0.03, sign * (sw / 4 - 0.02), sh / 2, 0), doorMat);
    leaf.castShadow = true;
    pivot.add(leaf);
    const knob = new THREE.Mesh(cylAt(0.018, 0.018, 0.09, sign * (sw / 2 - 0.10), sh / 2 - 0.10, -0.03, 8), M.trim);
    pivot.add(knob);
    pivot.rotation.y = deg(openDeg);
    return pivot;
  };
  shelf.add(mkDoor(-sw / 2 + 0.02, +1, 0));
  shelf.add(mkDoor(sw / 2 - 0.02, -1, -108));
  g.add(HS(shelf, 'shelf'));

  // --- モップとバケツ（「廊下側はモップの匂い」）---
  const cleaning = new THREE.Group();
  cleaning.position.set(-3.15, 0, 3.35);
  const bucket = new THREE.Mesh(cyl(0.19, 0.15, 0.30, 16, true),
    new THREE.MeshStandardMaterial({ color: 0x3f7f6f, roughness: 0.7, side: THREE.DoubleSide }));
  bucket.position.y = 0.15;
  bucket.castShadow = true;
  cleaning.add(bucket);
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.175, 20),
    new THREE.MeshStandardMaterial({ color: 0x6f9c96, roughness: 0.2 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.24;
  cleaning.add(water);
  const mopHandle = new THREE.Mesh(cylAt(0.018, 0.018, 1.35, 0.16, 0.70, 0.06, 8), M.wood);
  mopHandle.rotation.z = deg(-13);
  mopHandle.rotation.x = deg(-6);
  mopHandle.position.set(0.14, 0.72, 0.06);
  mopHandle.castShadow = true;
  cleaning.add(mopHandle);
  const mopHead = new THREE.Mesh(cylAt(0.075, 0.055, 0.20, 0.02, 0.10, 0.06, 10),
    new THREE.MeshStandardMaterial({ color: 0xd8d2be, roughness: 1.0 }));
  mopHead.castShadow = true;
  cleaning.add(mopHead);
  g.add(HS(cleaning, 'mop'));

  return { group: g, shelf };
}

/* ================================================================== */
/* 廊下と自販機                                                        */
/* ================================================================== */
function buildCorridor(M) {
  const g = new THREE.Group();
  g.name = 'corridor';
  const x0 = WALL.corridor - ROOM.wallT; // -3.76
  const x1 = x0 - 2.55;                  // -6.31
  const conc = new THREE.MeshStandardMaterial({ map: concreteTexture(256, [1, 1]), roughness: 0.85 });

  // 床・天井・奥壁
  const floor = new THREE.Mesh(boxAt(Math.abs(x1 - x0), 0.16, 14, (x0 + x1) / 2, -0.08, 0), conc);
  floor.receiveShadow = true;
  g.add(floor);
  const ceil = new THREE.Mesh(boxAt(Math.abs(x1 - x0), 0.16, 14, (x0 + x1) / 2, ROOM.h + 0.08, 0), conc);
  g.add(ceil);
  const far = new THREE.Mesh(boxAt(0.16, ROOM.h, 14, x1, ROOM.h / 2, 0), conc);
  far.receiveShadow = true;
  g.add(far);

  // 廊下の窓（奥壁に3枚）
  {
    const gg = [], ff = [];
    for (let i = 0; i < 3; i++) {
      const z = -3.6 + i * 3.6;
      gg.push(planeAt(2.0, 1.5, x1 + 0.09, 1.55, z, { y: -Math.PI / 2 }));
      ff.push(boxAt(0.05, 1.64, 0.05, x1 + 0.07, 1.55, z - 1.02));
      ff.push(boxAt(0.05, 1.64, 0.05, x1 + 0.07, 1.55, z + 1.02));
      ff.push(boxAt(0.05, 0.05, 2.10, x1 + 0.07, 2.34, z));
      ff.push(boxAt(0.05, 0.05, 2.10, x1 + 0.07, 0.76, z));
    }
    g.add(new THREE.Mesh(mergeAll(gg), M.glass.clone()));
    g.add(new THREE.Mesh(mergeAll(ff), M.trim));
  }

  // 廊下のLED（「廊下の照明はLED」）
  const ledMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0xdcefff, emissiveIntensity: 1.6, roughness: 0.4,
  });
  const leds = [];
  [-4.2, -1.0, 2.2].forEach((z) => {
    leds.push(boxAt(0.16, 0.05, 1.5, (x0 + x1) / 2 + 0.35, ROOM.h - 0.04, z));
  });
  const ledMesh = new THREE.Mesh(mergeAll(leds), ledMat);
  g.add(ledMesh);

  // --- 自販機（コーンスープが「無い」）---
  const vg = new THREE.Group();
  vg.position.set(x1 + 0.42, 0, 1.85);
  vg.rotation.y = Math.PI / 2; // 面板を +X（教室側）に向ける
  const panel = new THREE.MeshStandardMaterial({
    map: B.vendingTexture(), emissiveMap: B.vendingTexture(), emissive: 0xffffff,
    emissiveIntensity: 0.0, roughness: 0.35,
  });
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x243243, roughness: 0.5, metalness: 0.35 });
  const vBody = new THREE.Mesh(box(1.30, 1.95, 0.78), bodyMat);
  vBody.position.y = 0.975;
  vBody.castShadow = true; vBody.receiveShadow = true;
  vg.add(vBody);
  const vFace = new THREE.Mesh(planeAt(1.16, 1.72, 0, 1.02, 0.395), panel);
  vg.add(vFace);
  const vTop = new THREE.Mesh(boxAt(1.24, 0.10, 0.72, 0, 1.98, 0), bodyMat);
  vg.add(vTop);
  // 取り出し口
  const slot = new THREE.Mesh(boxAt(0.62, 0.14, 0.05, 0, 0.34, 0.40),
    new THREE.MeshStandardMaterial({ color: 0x101820, roughness: 0.8 }));
  vg.add(slot);
  // 足元の影よけの台
  const base = new THREE.Mesh(boxAt(1.34, 0.06, 0.82, 0, 0.03, 0), M.darkMetal);
  vg.add(base);
  g.add(HS(vg, 'vending'));

  return { group: g, vendingPanel: panel, ledMat };
}

/* ================================================================== */
/* 窓の外（2階なので地面は groundDrop 分だけ下）                         */
/* ================================================================== */
function buildOutdoors(M, sunDir) {
  const g = new THREE.Group();
  g.name = 'outdoors';
  const gy = -ROOM.groundDrop;

  // --- 空のドーム ---
  const skyMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, depthWrite: false, fog: false });
  skyMat.map = skyTexture(
    [[0, '#3f79c0'], [0.42, '#8fbde4'], [0.72, '#dbe7ec'], [1, '#e9e4d8']],
    sunDir, 96, 384
  );
  const dome = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 20), skyMat);
  dome.name = 'skydome';
  dome.renderOrder = -10;
  g.add(dome);

  // --- 遠景（山・田んぼ・送電線）のビルボード ---
  const landMat = new THREE.MeshBasicMaterial({
    map: landscapeTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  const land = new THREE.Mesh(new THREE.PlaneGeometry(130, 52), landMat);
  land.rotation.y = -Math.PI / 2;
  land.position.set(44, 6, 0);
  g.add(land);

  // --- 地面（田んぼ）---
  const ground = new THREE.Mesh(planeAt(320, 320, 60, gy, 0, { x: -Math.PI / 2 }),
    new THREE.MeshStandardMaterial({ map: fieldGroundTexture(512, [10, 10]), roughness: 0.95 }));
  ground.receiveShadow = true;
  g.add(ground);

  // --- 電柱と電線（「今日の電線✝本質✝感ある」）---
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x9a9a94, roughness: 0.9 });
  const wireMat = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.7 });
  const poles = [];
  const poleX = 7.0;
  [-9.5, -0.5, 8.5].forEach((z) => poles.push({ x: poleX, z }));
  const poleH = 9.6;
  const poleG = [];
  poles.forEach((p) => {
    poleG.push(cylAt(0.13, 0.17, poleH, p.x, gy + poleH / 2, p.z - 0.42, 10));
    poleG.push(cylAt(0.13, 0.17, poleH, p.x, gy + poleH / 2, p.z + 0.42, 10));
    // 腕木
    [0.0, -0.75, 0.75].forEach((dy) => {
      poleG.push(boxAt(0.09, 0.09, 2.6, p.x, gy + poleH - 0.55 + dy, p.z));
    });
    // 腕木のブレース
    poleG.push(boxAt(0.06, 1.5, 0.06, p.x, gy + poleH - 1.3, p.z - 0.42));
    poleG.push(boxAt(0.06, 1.5, 0.06, p.x, gy + poleH - 1.3, p.z + 0.42));
    // がいし
    [-1.2, -0.6, 0, 0.6, 1.2].forEach((dz) => {
      poleG.push(cylAt(0.055, 0.055, 0.14, p.x, gy + poleH - 0.40, p.z + dz, 6));
    });
  });
  const poleMesh = new THREE.Mesh(mergeAll(poleG), poleMat);
  poleMesh.castShadow = true;
  g.add(poleMesh);

  // 電線（たるみ付き）
  const wireG = [];
  const tops = [0.0, -0.75, 0.75];
  const addWire = (a, b, sag) => {
    const N = 22;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const x = a[0] + (b[0] - a[0]) * t;
      const y = a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * sag;
      const z = a[2] + (b[2] - a[2]) * t;
      pts.push(new THREE.Vector3(x, y, z));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    wireG.push(new THREE.TubeGeometry(curve, 26, 0.018, 3, false));
  };
  for (let i = 0; i < poles.length - 1; i++) {
    const a = poles[i], b = poles[i + 1];
    tops.forEach((dy) => {
      const ay = gy + poleH - 0.32 + dy, by = ay;
      [-1.2, -0.6, 0, 0.6, 1.2].forEach((dz) => {
        addWire([a.x, ay, a.z + dz], [b.x, by, b.z + dz], 0.45);
      });
    });
  }
  // 両端から先へ伸びる電線
  const endZ0 = poles[0].z, endZ2 = poles[poles.length - 1].z;
  tops.forEach((dy) => {
    const y = gy + poleH - 0.32 + dy;
    [-1.2, -0.6, 0, 0.6, 1.2].forEach((dz) => {
      addWire([poleX, y, endZ0 + dz], [poleX, y - 0.8, endZ0 - 26 + dz], 1.2);
      addWire([poleX, y, endZ2 + dz], [poleX, y - 0.8, endZ2 + 26 + dz], 1.2);
    });
  });
  // 建物への引き込み線
  addWire([poleX, gy + poleH - 0.32, -0.5], [WALL.window + 0.35, 2.62, -2.2], 0.5);
  addWire([poleX, gy + poleH - 0.32, -0.5], [WALL.window + 0.35, 2.72, -1.9], 0.5);
  const wireMesh = new THREE.Mesh(mergeAll(wireG), wireMat);
  g.add(wireMesh);

  // --- エアコンの室外機（「窓の真横」）---
  const ou = new THREE.Group();
  ou.position.set(WALL.window + 0.34, 1.42, -2.62);
  const ouMat = new THREE.MeshStandardMaterial({ color: 0xd6d3c8, roughness: 0.72 });
  const box1 = new THREE.Mesh(box(0.88, 0.62, 0.34), ouMat);
  box1.castShadow = true; box1.receiveShadow = true;
  ou.add(box1);
  // ファン
  const fanRing = new THREE.Mesh(new THREE.TorusGeometry(0.20, 0.025, 6, 24), M.darkMetal);
  fanRing.position.set(-0.46, 0, 0);
  fanRing.rotation.y = Math.PI / 2;
  ou.add(fanRing);
  const fan = new THREE.Group();
  fan.position.set(-0.455, 0, 0);
  fan.rotation.y = Math.PI / 2;
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Mesh(boxAt(0.012, 0.30, 0.075, 0, 0, 0), M.darkMetal);
    blade.rotation.x = (i / 4) * Math.PI * 2;
    blade.rotation.z = deg(18);
    fan.add(blade);
  }
  ou.add(fan);
  // 配管とブラケット
  const pipe = new THREE.Mesh(cylAt(0.035, 0.035, 0.9, 0.30, -0.34, 0.08, 8), M.darkMetal);
  pipe.rotation.x = deg(72);
  ou.add(pipe);
  [[-0.32, 0.10], [0.32, 0.10]].forEach(([dz, dy]) => {
    const br = new THREE.Mesh(boxAt(0.30, 0.05, 0.06, 0.20, -0.34 + dy, dz), M.darkMetal);
    ou.add(br);
  });
  g.add(HS(ou, 'outdoorUnit'));

  // --- 隣の校舎の壁（遠景の手前に少しだけ）---
  const nbMat = new THREE.MeshStandardMaterial({ color: 0xb9b4a8, roughness: 0.9 });
  const nb = new THREE.Mesh(boxAt(0.4, 9.0, 26, 24, gy + 4.5, -20), nbMat);
  g.add(nb);

  return { group: g, skyMat, landMat, dome };
}

/* ================================================================== */
/* 天井照明（蛍光灯）                                                   */
/* ================================================================== */
function buildCeilingLights(M) {
  const g = new THREE.Group();
  g.name = 'ceilingLights';
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0xf2f6ff, emissiveIntensity: 0.0, roughness: 0.4,
  });
  const parts = [];
  const housing = [];
  const spots = [[-1.7, -2.3], [1.7, -2.3], [-1.7, 1.0], [1.7, 1.0], [-1.7, 3.4], [1.7, 3.4]];
  spots.forEach(([x, z]) => {
    parts.push(boxAt(0.22, 0.05, 1.15, x, ROOM.h - 0.06, z));
    housing.push(boxAt(0.30, 0.07, 1.22, x, ROOM.h - 0.025, z));
  });
  const tubes = new THREE.Mesh(mergeAll(parts), mat);
  g.add(tubes);
  const housings = new THREE.Mesh(mergeAll(housing), M.white);
  g.add(housings);
  return { group: g, tubeMat: mat };
}

/* ================================================================== */
/* まとめ                                                              */
/* ================================================================== */
export function buildWorld(M, sunDir) {
  const root = new THREE.Group();
  root.name = 'world';

  const shell = buildShell(M);
  const board = buildBlackboard(M);
  const back = buildBackWall(M);
  const corridor = buildCorridor(M);
  const outdoors = buildOutdoors(M, sunDir);
  const lights = buildCeilingLights(M);

  root.add(shell.group, board.group, back.group, corridor.group, outdoors.group, lights.group);

  // ドアプレート
  const plate = new THREE.Mesh(planeAt(0.34, 0.13, WALL.corridor - 0.20, 2.30, -3.0, { y: -Math.PI / 2 }),
    new THREE.MeshStandardMaterial({ map: B.roomPlateTexture(), roughness: 0.8 }));
  root.add(plate);

  return {
    root,
    shell, board, back, corridor, outdoors, lights,
    paneZ: shell.paneZ,
  };
}

/* 小道具用に cyl / scaleUV を再エクスポート */
export { cyl, scaleUV };
function cyl(rt, rb, h, seg = 12, openEnded = false) {
  return new THREE.CylinderGeometry(rt, rb, h, seg, 1, openEnded);
}
