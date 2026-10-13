/**
 * scene.js — 教室（北棟2階・理数科B組）の構築。
 * 構造物はすべてプロシージャル造形（Box/Cylinder/Plane/Extrude）＋ Poly Haven の PBR テクスチャ。
 * 机・椅子は InstancedMesh（1ジオメトリ×N）で、マテリアルは全机椅で共有する。
 * 「キャラクターは作らない」方針に従い、引かれた椅子・置き忘れた物・開いた扉で物語を語る。
 */
import {
  Group, Mesh, MeshStandardMaterial, InstancedMesh, Object3D,
  MeshLambertMaterial, DoubleSide, CanvasTexture, SRGBColorSpace, Sprite,
  SpriteMaterial, RepeatWrapping, LineSegments, LineBasicMaterial, BufferGeometry,
  Float32BufferAttribute, NoColorSpace, BoxGeometry, PlaneGeometry, DynamicDrawUsage,
  Points, PointsMaterial, NormalBlending,
} from 'three';
import { ROOM } from './config.js';
import * as geo from './lib/geo.js';
import { deskLayout, chairLayout, roleSeats, sceneDeskModifiers } from './lib/layout.js';
import {
  makeBlackboardTexture, makeNoticeBoardTexture, makeCorridorBoardTexture,
  makeVendingTexture, makePhoneTexture, makeBookTexture, makeTopoMapTexture,
  makeNotebookTexture, makeSlipTexture, makeRamenTexture, makeBentoTexture, makeCrossSprite,
} from './procedural.js';

const SEAT_MAX = 40;

const canvasTex = (canvas, srgb = true) => {
  const t = new CanvasTexture(canvas);
  t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  t.needsUpdate = true;
  return t;
};
const cloneTex = (t, repeat = [1, 1]) => {
  const c = t.clone();
  c.wrapS = c.wrapT = RepeatWrapping;
  c.repeat.set(repeat[0], repeat[1]);
  c.needsUpdate = true;
  return c;
};

export class Classroom {
  constructor({ scene, assets, renderer }) {
    this.scene = scene;
    this.assets = assets;
    this.renderer = renderer;
    this.room = ROOM;
    this.group = new Group();
    this.group.name = 'classroom';
    scene.add(this.group);
    this.interactives = [];
    this.propGroups = new Map();
    this.lampMeshes = [];
    this.windows = [];
    this.materials = {};
    this._seatCount = 30;
    this._sceneId = 'morning';
    this._essence = false;
  }

  /* ---------- マテリアル ---------- */

  _std(map, opts = {}) {
    const m = new MeshStandardMaterial({ ...opts });
    if (map?.map) { m.map = map.map; }
    if (map?.normalMap) { m.normalMap = map.normalMap; m.normalScale.set(0.85, 0.85); }
    if (map?.roughnessMap) m.roughnessMap = map.roughnessMap;
    if (!map?.normalMap && !opts.__keepFlat) m.flatShading = false;
    return m;
  }

  buildMaterials() {
    const T = this.assets.textures;
    const M = this.materials;
    M.floor = this._std({ ...T.floor, map: cloneTex(T.floor.map, [4.2, 3.7]), normalMap: cloneTex(T.floor.normalMap, [4.2, 3.7]), roughnessMap: cloneTex(T.floor.roughnessMap, [4.2, 3.7]) },
      { roughness: 0.82, metalness: 0.02, color: 0xb9a891, envMapIntensity: 0.55 });
    M.wall = this._std({ ...T.wall, map: cloneTex(T.wall.map, [3.2, 1.7]), normalMap: cloneTex(T.wall.normalMap, [3.2, 1.7]), roughnessMap: cloneTex(T.wall.roughnessMap, [3.2, 1.7]) },
      { roughness: 0.9, metalness: 0.0, color: 0xece7dc, envMapIntensity: 0.45 });
    M.ceiling = this._std({ ...T.ceiling, map: cloneTex(T.ceiling.map, [4, 3.5]), roughnessMap: cloneTex(T.ceiling.roughnessMap, [4, 3.5]) },
      { roughness: 0.95, metalness: 0, color: 0xf6f4ee, envMapIntensity: 0.35 });
    M.dado = this._std({ map: cloneTex(T.deskWood.map, [2, 0.3]), roughnessMap: cloneTex(T.deskWood.roughnessMap, [2, 0.3]) },
      { roughness: 0.7, metalness: 0.03, color: 0x8f6b45 });
    M.wood = this._std({ map: cloneTex(T.deskWood.map, [2, 2]), roughnessMap: cloneTex(T.deskWood.roughnessMap, [2, 2]) },
      { roughness: 0.62, metalness: 0.04, color: 0xa4804f });
    M.deskWood = this._std({ map: T.deskWood.map, roughnessMap: T.deskWood.roughnessMap },
      { roughness: 0.58, metalness: 0.03, color: 0xcfae7d });
    M.deskMetal = this._std({ map: cloneTex(T.metal.map, [1, 2]), normalMap: cloneTex(T.metal.normalMap, [1, 2]), roughnessMap: cloneTex(T.metal.roughnessMap, [1, 2]) },
      { roughness: 0.52, metalness: 0.72, color: 0x9aa1a7 });
    M.frame = new MeshStandardMaterial({ color: 0xc4c8cc, metalness: 0.72, roughness: 0.34, envMapIntensity: 0.9 });
    M.metal = this._std({ map: cloneTex(T.metal.map, [2, 2]), normalMap: cloneTex(T.metal.normalMap, [2, 2]), roughnessMap: cloneTex(T.metal.roughnessMap, [2, 2]) },
      { roughness: 0.5, metalness: 0.7, color: 0xa9aeb2 });
    M.metalRust = this._std({ map: cloneTex(T.metalRust.map, [1, 1]), roughnessMap: cloneTex(T.metalRust.roughnessMap, [1, 1]) },
      { roughness: 0.68, metalness: 0.45, color: 0x9fa79b });
    M.glass = new MeshStandardMaterial({
      color: 0xa8c8dd, metalness: 0.0, roughness: 0.06, transparent: true, opacity: 0.16,
      side: DoubleSide, envMapIntensity: 1.2, depthWrite: false,
    });
    M.fixture = new MeshStandardMaterial({ color: 0xf1f0ea, roughness: 0.62, metalness: 0.05 });
    M.plastic = new MeshStandardMaterial({ color: 0xd6d9dc, roughness: 0.55, metalness: 0.06 });
    M.paper = new MeshStandardMaterial({ color: 0xf7f5ec, roughness: 0.95, metalness: 0 });
    M.eraser = new MeshStandardMaterial({ color: 0x39403f, roughness: 0.9, metalness: 0 });
    M.board = new MeshStandardMaterial({ roughness: 0.93, metalness: 0.04, color: 0xffffff, envMapIntensity: 0.35 });
    M.board.map = canvasTex(makeBlackboardTexture('morning'));
    // 屋外
    M.ground = new MeshLambertMaterial({ color: 0x9a968c });
    M.field = new MeshLambertMaterial({ color: 0x7d8a5c });
    M.ridge = new MeshLambertMaterial({ color: 0x8a8567 });
    M.paddy = new MeshLambertMaterial({ color: 0x6f8f45 });
    M.paddySpring = new MeshLambertMaterial({ color: 0x8d9a5e });
    M.paddyDeep = new MeshLambertMaterial({ color: 0x557f38 });
    M.paddyGold = new MeshLambertMaterial({ color: 0xa59447 });
    M.paddyDry = new MeshLambertMaterial({ color: 0x8f8a70 });
    M.road = new MeshLambertMaterial({ color: 0x6e6d68 });
    M.tunnel = new MeshLambertMaterial({ color: 0x2e2f2c });
    M.building = new MeshLambertMaterial({ color: 0xbfb9ad });
    M.buildingTrim = new MeshLambertMaterial({ color: 0x8d867c });
    M.windowDark = new MeshLambertMaterial({ color: 0x33414c });
    M.ridgeNear = new MeshLambertMaterial({ color: 0x4d5b48 });
    M.ridgeFar = new MeshLambertMaterial({ color: 0x6d7f8e });
    M.treeLeaf = new MeshLambertMaterial({ color: 0x5d8b46 });
    M.pylon = new MeshLambertMaterial({ color: 0x555b5e });
    // 特殊（キャンバス）
    M.bottle = new MeshStandardMaterial({ color: 0xdff0f5, roughness: 0.22, metalness: 0.05, transparent: true, opacity: 0.85 });
  }

  /* ---------- 部品の追加 ---------- */

  /** 部品リストを mat ごとに結合してメッシュ化する */
  addParts(parts, { name = 'parts', castShadow = true, receiveShadow = true, group = this.group, disableCast = [] } = {}) {
    const byMat = geo.mergePartsByMaterial(parts);
    const meshes = [];
    for (const [key, geometry] of Object.entries(byMat)) {
      const material = this._materialFor(key);
      const mesh = new Mesh(geometry, material);
      mesh.castShadow = castShadow && !disableCast.includes(key);
      mesh.receiveShadow = receiveShadow;
      mesh.name = `${name}:${key}`;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
      meshes.push(mesh);
      if (key === '@lamp') this.lampMeshes.push(mesh);
    }
    return meshes;
  }

  _materialFor(key) {
    if (key.startsWith('@')) {
      if (!this._specialKeys) this._specialKeys = {};
      if (!this._specialKeys[key]) this._specialKeys[key] = this._makeSpecialMaterial(key);
      return this._specialKeys[key];
    }
    return this.materials[key] ?? this.materials.plastic;
  }

  _makeSpecialMaterial(key) {
    switch (key) {
      case '@board': return this.materials.board;
      case '@lamp': return new MeshStandardMaterial({ color: 0xfff6e2, emissive: 0xfff2d8, emissiveIntensity: 1.1, roughness: 0.5, metalness: 0 });
      case '@vending': return new MeshStandardMaterial({ map: canvasTex(makeVendingTexture(640, 1024, false)), emissive: 0x2a2a26, emissiveIntensity: 0.35, roughness: 0.4, metalness: 0.1 });
      case '@phone': return new MeshStandardMaterial({ map: canvasTex(makePhoneTexture('game')), emissive: 0xffffff, emissiveMap: canvasTex(makePhoneTexture('game')), emissiveIntensity: 0.7, roughness: 0.3, metalness: 0.2 });
      case '@phoneBoard': return new MeshStandardMaterial({ map: canvasTex(makePhoneTexture('bulletin')), emissive: 0xffffff, emissiveMap: canvasTex(makePhoneTexture('bulletin')), emissiveIntensity: 0.55, roughness: 0.3, metalness: 0.2 });
      case '@bookQ': return new MeshStandardMaterial({ map: canvasTex(makeBookTexture('quantum')), roughness: 0.72, metalness: 0.02 });
      case '@bookAstro': return new MeshStandardMaterial({ map: canvasTex(makeBookTexture('astro')), roughness: 0.72, metalness: 0.02 });
      case '@bookEssence': return new MeshStandardMaterial({ map: canvasTex(makeBookTexture('essence')), roughness: 0.72, metalness: 0.02 });
      case '@notebook': return new MeshStandardMaterial({ map: canvasTex(makeNotebookTexture()), roughness: 0.95, metalness: 0 });
      case '@map': return new MeshStandardMaterial({ map: canvasTex(makeTopoMapTexture()), roughness: 0.94, metalness: 0 });
      case '@board2': return new MeshStandardMaterial({ map: canvasTex(makeNoticeBoardTexture(1024, 540, false)), roughness: 0.85, metalness: 0 });
      case '@ramen': return new MeshStandardMaterial({ map: canvasTex(makeRamenTexture()), roughness: 0.8, metalness: 0 });
      case '@bento': return new MeshStandardMaterial({ map: canvasTex(makeBentoTexture()), roughness: 0.6, metalness: 0.05 });
      case '@paperSlip': return new MeshStandardMaterial({ map: canvasTex(makeSlipTexture()), roughness: 0.95, metalness: 0 });
      case '@blazer': return new MeshStandardMaterial({ color: 0x232a3c, roughness: 0.86, metalness: 0.02 });
      case '@chalk0': return new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
      case '@chalk1': return new MeshStandardMaterial({ color: 0xffe9a8, roughness: 0.9 });
      case '@chalk2': return new MeshStandardMaterial({ color: 0xff9d9d, roughness: 0.9 });
      case '@blazerDark': return new MeshStandardMaterial({ color: 0x1c2130, roughness: 0.85 });
      default: return new MeshStandardMaterial({ color: 0xcecece, roughness: 0.8 });
    }
  }

  /* ---------- 構築 ---------- */

  build() {
    this.buildMaterials();
    const room = this.room;

    // 教室の殻（窓壁は +X＝西。午後の光が窓から差し込む）
    const shell = geo.buildRoomShell(room);
    this.addParts(shell.parts, { name: 'shell' });
    this.openings = shell.openings;

    // 黒板・教壇・教卓
    const bbMeshes = this.addParts(geo.buildBlackboard(room), { name: 'blackboard' });
    const boardMesh = bbMeshes.find((m) => m.name.includes('@board'));
    if (boardMesh) this.interactives.push({ mesh: boardMesh, id: 'blackboard', label: '黒板（板書）' });
    this.addParts(geo.buildPodium(room), { name: 'podium' });
    const tdesk = geo.teacherDeskGeometries();
    this.addParts([
      { geo: tdesk.wood, mat: 'deskWood', pos: [-0.1, 0.14, -3.05] },
      { geo: tdesk.metal, mat: 'deskMetal', pos: [-0.1, 0.14, -3.05] },
    ], { name: 'teacherDesk' });
    // 教卓の上の地形図と出席簿（ヘイカツの机）
    const mapMeshes = this.addParts(geo.mapParts().map((p) => ({ ...p, pos: [p.pos[0] - 0.28, p.pos[1] + 0.94, p.pos[2] - 3.02] })), { name: 'teacherMap' });
    const mapMesh = mapMeshes.find((m) => m.name.includes('@map'));
    if (mapMesh) this.interactives.push({ mesh: mapMesh, id: 'map', label: '教卓の地形図' });
    this.addParts([
      { geo: new BoxGeometry(0.3, 0.02, 0.22), mat: 'paper', pos: [0.42, 0.94, -3.0] },
      { geo: new BoxGeometry(0.26, 0.03, 0.19), mat: 'metalRust', pos: [0.42, 0.955, -3.0] },
    ], { name: 'attendanceBook' });

    // 天井の蛍光灯（6台）
    const fixture = geo.lightFixtureGeometries(1.22);
    const lampParts = [];
    for (const [x, z] of [[-2.6, -2.0], [1.4, -2.0], [-2.6, 1.8], [1.4, 1.8], [-2.6, 0], [1.4, 0]]) {
      for (const p of [...fixture.housing, ...fixture.reflector, ...fixture.lamp]) {
        lampParts.push({ ...p, pos: [p.pos[0] + x, p.pos[1] + room.height - 0.12, p.pos[2] + z] });
      }
    }
    this.addParts(lampParts, { name: 'lamps', castShadow: false });

    // エアコン（室内機は前壁上部・室外機は窓の真横＝原作 L15）
    const ac = geo.acGeometries();
    this.addParts([
      { geo: ac.indoor, mat: 'fixture', pos: [3.0, 2.6, -room.depth / 2 + 0.3] },
      { geo: ac.outdoor, mat: 'metalRust', pos: [room.width / 2 + 0.55, 1.05, -1.82], rot: [0, -Math.PI / 2, 0] },
      { geo: ac.rust, mat: 'metal', pos: [room.width / 2 + 0.72, 1.05, -1.82], rot: [0, -Math.PI / 2, 0] },
    ], { name: 'ac', castShadow: false });

    // 後方ロッカー（metal instanced）と掃除用具
    const locker = geo.lockerGeometries();
    this.lockers = new InstancedMesh(locker.metal, this.materials.metal, 5);
    this.lockers.castShadow = true; this.lockers.receiveShadow = true;
    const rustMesh = new InstancedMesh(locker.rust, this.materials.metalRust, 5);
    const dummy = new Object3D();
    for (let i = 0; i < 5; i++) {
      dummy.position.set(-3.2 + i * 0.82, 0, room.depth / 2 - 0.18);
      dummy.rotation.set(0, Math.PI, 0);
      dummy.updateMatrix();
      this.lockers.setMatrixAt(i, dummy.matrix);
      rustMesh.setMatrixAt(i, dummy.matrix);
    }
    this.group.add(this.lockers, rustMesh);

    const clean = geo.cleaningGeometries();
    this.addParts([
      { geo: clean.plastic, mat: 'plastic', pos: [-room.width / 2 + 0.55, 0, 3.3] },
      { geo: clean.wood, mat: 'wood', pos: [-room.width / 2 + 0.55, 0, 3.3] },
      { geo: clean.metal, mat: 'metal', pos: [-room.width / 2 + 0.55, 0, 3.3] },
    ], { name: 'cleaning' });

    // 後壁の掲示板（2枚・✝本質✝モードで貼り紙が増える）
    this.noticeBoards = [];
    const nb = geo.noticeBoardParts(1.9, 1.0);
    for (const [x, y] of [[2.4, 1.55], [0.2, 1.55]]) {
      const meshes = this.addParts(nb.map((p) => ({ ...p, pos: [p.pos[0] + x, p.pos[1] + y, p.pos[2] + room.depth / 2 - 0.12] })),
        { name: 'notice' });
      this.noticeBoards.push(meshes);
      const board = meshes.find((m) => m.name.includes('@board2'));
      if (board) this.interactives.push({ mesh: board, id: 'notice', label: '掲示板（貼り紙を読む）' });
    }

    // 窓（開閉ギミック用のサッシ）
    this._buildWindows();

    // 引き戸（廊下側・開いている＝人の気配）
    this._buildDoor();

    // 机と椅子（InstancedMesh × 4）
    this._buildSeats();

    // 小物（人の気配）
    this._buildProps();

    // 廊下・屋外
    this.buildCorridor();
    this.buildOutdoor();
    this.buildEssenceCrosses();

    return this;
  }

  _buildWindows() {
    const win = this.room.window;
    const span = win.count * win.width + (win.count - 1) * win.gap;
    const x0 = this.room.width / 2 - 0.07;
    const frameMat = this.materials.frame, glassMat = this.materials.glass;
    this.windowSashes = [];
    for (let i = 0; i < win.count; i++) {
      const zc = -span / 2 + win.width / 2 + i * (win.width + win.gap);
      const g = new Group();                       // 窓枠（開かない側）
      g.position.set(x0, win.sill + win.height / 2, zc);
      const sash = new Group();                    // 引き違いの可動サッシ
      const w = win.width - 0.04, h = win.height - 0.04;
      const rail = (len) => new BoxGeometry(0.06, 0.05, len);
      const stile = (len) => new BoxGeometry(0.06, len, 0.045);
      const add = (mesh, pos) => { mesh.position.set(...pos); mesh.castShadow = true; sash.add(mesh); };
      add(new Mesh(rail(w), frameMat), [0, h / 2 - 0.02, 0]);
      add(new Mesh(rail(w), frameMat), [0, -h / 2 + 0.02, 0]);
      add(new Mesh(stile(h), frameMat), [0, 0, -w / 2 + 0.02]);
      add(new Mesh(stile(h), frameMat), [0, 0, w / 2 - 0.02]);
      add(new Mesh(stile(h - 0.08), frameMat), [0, 0, 0]);   // 中桟
      const glass = new Mesh(new PlaneGeometry(w - 0.06, h - 0.08), glassMat);
      glass.rotation.y = -Math.PI / 2;
      glass.castShadow = false;
      sash.add(glass);
      sash.userData.openOffset = -win.width * 0.54;
      g.add(sash);
      this.group.add(g);
      this.windowSashes.push({ group: g, sash, open: false });
      this.interactives.push({ mesh: glass, id: 'window', label: '窓（開ける／閉める）' });
    }
  }

  _buildDoor() {
    const d = this.room.door;
    const x = -this.room.width / 2 - 0.02;
    const g = new Group();
    g.position.set(x, 0, d.offsetZ + d.width / 2);
    const panel = new Mesh(new BoxGeometry(0.05, d.height - 0.06, d.width - 0.08), this.materials.wood);
    panel.position.set(0, (d.height - 0.06) / 2, -d.width / 2);
    panel.castShadow = true; panel.receiveShadow = true;
    const glass = new Mesh(new PlaneGeometry(d.width - 0.36, d.height * 0.42), this.materials.glass);
    glass.rotation.y = -Math.PI / 2;
    glass.position.set(-0.03, d.height * 0.68, -d.width / 2);
    g.add(panel, glass);
    this.group.add(g);
    this.door = { group: g, panel, open: true, target: 1.0, current: 1.0 };
    this.interactives.push({ mesh: panel, id: 'door', label: '引き戸（開ける／閉める）' });
  }

  /** 机・椅子: 1ジオメトリ × N（InstancedMesh）。マテリアルは全席で共有 */
  _buildSeats() {
    const desk = geo.deskGeometries(this.room);
    const chair = geo.chairGeometries(this.room);
    this.deskWoodIM = new InstancedMesh(desk.wood, this.materials.deskWood, SEAT_MAX);
    this.deskMetalIM = new InstancedMesh(desk.metal, this.materials.deskMetal, SEAT_MAX);
    this.chairWoodIM = new InstancedMesh(chair.wood, this.materials.deskWood, SEAT_MAX);
    this.chairMetalIM = new InstancedMesh(chair.metal, this.materials.deskMetal, SEAT_MAX);
    for (const im of [this.deskWoodIM, this.deskMetalIM, this.chairWoodIM, this.chairMetalIM]) {
      im.castShadow = true; im.receiveShadow = true;
      im.instanceMatrix.setUsage(35048); // DynamicDrawUsage
      this.group.add(im);
    }
    this.setSeatCount(this._seatCount);
  }

  /** 席数（30 = 規定 / 40 = 原作の理数科B組）を反映する */
  setSeatCount(count) {
    this._seatCount = count;
    this.seats = deskLayout(count, this.room);
    this.chairs = chairLayout(this.seats);
    const mods = sceneDeskModifiers(this._sceneId, this.seats);
    const dummy = new Object3D();
    this.seats.forEach((s, i) => {
      const m = mods.get(s.index) ?? { yaw: 0, dx: 0, dz: 0 };
      dummy.position.set(s.x + m.dx, 0, s.z + m.dz);
      dummy.rotation.set(0, s.yaw + m.yaw, 0);
      dummy.updateMatrix();
      this.deskWoodIM.setMatrixAt(i, dummy.matrix);
      this.deskMetalIM.setMatrixAt(i, dummy.matrix);
    });
    this.chairs.forEach((s, i) => {
      const m = mods.get(s.index) ?? { yaw: 0, dx: 0, dz: 0 };
      dummy.position.set(s.x + m.dx, 0, s.z + m.dz);
      dummy.rotation.set(0, s.yaw + m.yaw * 1.35, 0);
      dummy.updateMatrix();
      this.chairWoodIM.setMatrixAt(i, dummy.matrix);
      this.chairMetalIM.setMatrixAt(i, dummy.matrix);
    });
    for (const im of [this.deskWoodIM, this.deskMetalIM, this.chairWoodIM, this.chairMetalIM]) {
      im.count = this.seats.length;
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
    }
    return this.seats.length;
  }

  /* ---------- 小物（人の気配） ---------- */

  _addProp(name, parts, opts = {}) {
    const g = new Group();
    g.name = `prop:${name}`;
    const meshes = this.addParts(parts, { name, group: g, ...opts });
    this.group.add(g);
    this.propGroups.set(name, g);
    return meshes;
  }

  /** 机の上の座標（座席 index の天板中心） */
  _deskSurface(index, offset = [0, 0, 0]) {
    const s = this.seats.find((x) => x.index === index) ?? this.seats[0];
    return [s.x + offset[0], this.room.desk.height + offset[1], s.z + offset[2]];
  }

  _buildProps() {
    const roles = roleSeats(this.seats, this._seatCount);
    this.roles = roles;

    // 両馬のスマホ（掲示板を開いている）
    this._addProp('phoneRyouma', geo.phoneParts().map((p) => ({ ...p, pos: this._offsetFrom(this._deskSurface(roles.ryouma?.index ?? 0), p.pos) })).map((p) => (p.mat === '@phone' ? { ...p, mat: '@phoneBoard' } : p)));
    // 砂糖のスマホ（ゲーム画面）
    this._addProp('phoneSugar', geo.phoneParts().map((p) => ({ ...p, pos: this._offsetFrom(this._deskSurface(roles.sugar?.index ?? 5), p.pos) })));
    // 寺地: 天文学の本＋紙束（21枚）＋開いたノート
    this._addProp('terachi', [
      ...geo.bookParts({ cover: '@bookAstro' }).map((p) => ({ ...p, pos: this._offsetFrom(this._deskSurface(roles.terachi?.index ?? 12, [-0.16, 0, 0.06]), p.pos) })),
      ...geo.paperStackParts(21).map((p) => ({ ...p, pos: this._offsetFrom(this._deskSurface(roles.terachi?.index ?? 12, [0.14, 0, -0.02]), p.pos) })),
      ...geo.notebookParts().map((p) => ({ ...p, pos: this._offsetFrom(this._deskSurface(roles.terachi?.index ?? 12, [0.15, 0, 0.16]), p.pos) })),
    ]);
    // 三重: ペットボトル（GLB 水筒 or プロシージャル）
    this._addProp('mieBottle', geo.bottleParts().map((p) => ({ ...p, pos: this._offsetFrom(this._deskSurface(roles.mie?.index ?? 1, [0.2, 0, -0.08]), p.pos) })));
    // 零の席（放課後は空席）: 『量子力学』を置いたまま
    this._addProp('reiBook', geo.bookParts({ cover: '@bookQ', w: 0.17, h: 0.24, t: 0.035 })
      .map((p) => ({ ...p, pos: this._offsetFrom(this._deskSurface(roles.rei?.index ?? 15), p.pos) })));
    // 忘れ物（消しゴムとペン）
    this._addProp('stationary', geo.stationaryParts().map((p) => ({ ...p, pos: this._offsetFrom(this._deskSurface(roles.izumi?.index ?? 9, [-0.12, 0, 0.1]), p.pos) })));
    // 弁当（昼休みのみ）
    const bentoXs = [roles.ryouma, roles.izaki, roles.izumi].filter(Boolean);
    this._addProp('bento', bentoXs.flatMap((s) => geo.bentoParts().map((p) => ({ ...p, pos: this._offsetFrom(this._deskSurface(s.index, [-0.12, 0, 0.05]), p.pos) }))));
    // 二郎系ラーメンの袋（両馬の机の横）
    this._addProp('ramen', geo.ramenBagParts().map((p) => ({ ...p, pos: this._offsetFrom(this._deskSurface(roles.ryouma?.index ?? 0, [0.42, -0.7, 0.2]), p.pos) })));
    // 椅子に掛けた上着（放課後・砂糖）
    const sc = this.chairs.find((c) => c.index === (roles.sugar?.index ?? 5));
    this._addProp('blazer', [
      { geo: new BoxGeometry(0.44, 0.52, 0.07), mat: '@blazerDark', pos: [sc.x, this.room.desk.chair + 0.16, sc.z - 0.14], rot: [0.08, sc.yaw, 0] },
      { geo: new BoxGeometry(0.22, 0.18, 0.06), mat: '@blazerDark', pos: [sc.x, this.room.desk.chair + 0.4, sc.z - 0.16], rot: [0.1, sc.yaw, 0] },
    ]);
    // 鞄（椅子の横）
    const bagSeats = [roles.terachi, roles.izaki].filter(Boolean);
    this._addProp('bags', bagSeats.flatMap((s) => geo.bagParts().map((p) => ({ ...p, pos: this._offsetFrom([s.x - 0.44, 0, s.z + 0.3], p.pos) }))));
    // クリックで調べられる小物を登録（人の気配を触れるようにする）
    const reg = (prop, key, id, label) => {
      const g = this.propGroups.get(prop);
      if (!g) return;
      const m = g.children.find((c) => c.name.includes(':' + key)) ?? g.children[0];
      if (m) this.interactives.push({ mesh: m, id, label });
    };
    reg('phoneRyouma', '@phoneBoard', 'phone', '両馬のスマホ（匿名掲示板）');
    reg('phoneSugar', '@phone', 'phone', '砂糖のスマホ（ゲーム画面）');
    reg('reiBook', '@bookQ', 'book', '『量子力学 基礎と応用』');
    reg('terachi', '@bookAstro', 'astroBook', '天文学の本（寺地）');
    reg('ramen', '@ramen', 'ramen', '二郎系ラーメンの袋');
    reg('mieBottle', 'plastic', 'bottle', '水筒（自販機のミネラルウォーター）');

    this.setPropVisibility('morning');
  }

  _offsetFrom(base, off) {
    return [base[0] + (off[0] ?? 0), base[1] + (off[1] ?? 0), base[2] + (off[2] ?? 0)];
  }

  /** 場面ごとの小物の出し分け（＝時間帯による「人の気配」の変化） */
  setPropVisibility(sceneId) {
    const show = (name, v) => { const g = this.propGroups.get(name); if (g) g.visible = v; };
    show('bento', sceneId === 'lunch');
    show('ramen', ['lunch', 'friday', 'morning'].includes(sceneId));
    show('blazer', sceneId === 'after' || sceneId === 'friday');
    show('reiBook', true);
    show('phoneRyouma', sceneId !== 'corridor');
    show('phoneSugar', sceneId !== 'corridor');
    show('terachi', true);
    show('mieBottle', true);
    show('bags', true);
    show('stationary', true);
  }

  /** GLB（水筒）が取得できた場合は、プロシージャル形状と差し替える */
  applyBottleModel(gltfScene) {
    const g = this.propGroups.get('mieBottle');
    if (!g || !gltfScene) return false;
    const s = this.seats.find((x) => x.index === (this.roles.mie?.index ?? 1));
    const model = gltfScene.clone(true);
    model.scale.setScalar(0.62);           // 元モデルは 0.25m 前後 → 実寸の水筒に合わせる
    model.position.set(s.x + 0.2, this.room.desk.height, s.z - 0.08);
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        if (o.material) {
          o.material.envMapIntensity = 0.8;
          o.material.needsUpdate = true;
        }
      }
    });
    g.clear();
    g.add(model);
    model.updateMatrixWorld(true);
    // プロシージャル形状を消したので、クリック対象をモデル本体へ差し替える
    const entry = this.interactives.find((i) => i.id === 'bottle');
    if (entry) entry.mesh = model;
    return true;
  }

  /* ---------- 廊下（北棟2階・自販機） ---------- */

  buildCorridor() {
    const c = geo.buildCorridor(this.room);
    this.corridor = c;
    this.addParts(c.parts, { name: 'corridor' });

    // 廊下の掲示（進路室だより）
    const xb = -this.room.width / 2 - 0.2;
    const boardMesh = new Mesh(new PlaneGeometry(1.5, 0.94), new MeshStandardMaterial({ map: canvasTex(makeCorridorBoardTexture()), roughness: 0.9 }));
    boardMesh.rotation.set(0, -Math.PI / 2, 0);
    boardMesh.position.set(xb, 1.5, 0.9);
    this.group.add(boardMesh);
    this.interactives.push({ mesh: boardMesh, id: 'corridorBoard', label: '廊下の掲示（進路室だより）' });

    // 自販機2台（1台はコーンスープの不在・1台は在庫あり）
    const vg = geo.vendingGeometries();
    this.vendingMeshes = [];
    [[-2.1, false], [-3.25, true]].forEach(([z, hasSoup], idx) => {
      const parts = [
        { geo: vg.body, mat: 'metal', pos: [c.xOut + 0.42, 0, z], rot: [0, Math.PI / 2, 0] },
        { geo: vg.frame, mat: 'frame', pos: [c.xOut + 0.42, 0, z], rot: [0, Math.PI / 2, 0] },
      ];
      const glows = this.addParts([
        ...parts,
        ...vg.glow.map((p) => ({ ...p, mat: `@vending${idx}`, pos: [p.pos[0] + c.xOut + 0.42, p.pos[1], p.pos[2] + z], rot: [0, Math.PI / 2, 0] })),
      ], { name: 'vending' + idx });
      this.vendingMeshes.push(...glows);
    });
    // 特殊マテリアルを差し替え（@vending0 = 補充待ち / @vending1 = 在庫あり）
    this._specialKeys['@vending0'] = new MeshStandardMaterial({
      map: canvasTex(makeVendingTexture(640, 1024, false)), emissive: 0xffffff,
      emissiveMap: canvasTex(makeVendingTexture(640, 1024, false)), emissiveIntensity: 0.32, roughness: 0.42, metalness: 0.08,
    });
    this._specialKeys['@vending1'] = new MeshStandardMaterial({
      map: canvasTex(makeVendingTexture(640, 1024, true)), emissive: 0xffffff,
      emissiveMap: canvasTex(makeVendingTexture(640, 1024, true)), emissiveIntensity: 0.28, roughness: 0.42, metalness: 0.08,
    });
    for (const m of this.vendingMeshes) {
      if (m.name.includes('@vending0')) m.material = this._specialKeys['@vending0'];
      if (m.name.includes('@vending1')) m.material = this._specialKeys['@vending1'];
      this.interactives.push({ mesh: m, id: 'vending', label: '北棟の自販機（コーンスープの不在）' });
    }

    // 廊下のLED照明（発光面）
    const ledMat = new MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e6, emissiveIntensity: 1.0, roughness: 0.6 });
    for (const z of [-5, -2.5, 0, 2.5, 5]) {
      const led = new Mesh(new PlaneGeometry(0.32, 1.2), ledMat);
      led.rotation.x = Math.PI / 2;
      led.position.set(c.cx, this.room.height - 0.03, z);
      this.group.add(led);
    }
  }

  /* ---------- 屋外（田んぼ・山・送電線・トンネル） ---------- */

  buildOutdoor() {
    const out = geo.buildOutdoor(this.room, 'spring');
    // 1階の躯体（2階の教室を地面に繋ぐ＝窓から見下ろした先の壁）
    const xOut = this.corridor?.xOut ?? -this.room.width / 2 - 2.8;
    const xIn = this.room.width / 2 + 0.1;
    const lowerH = -this.room.floorY;
    const lowerParts = [
      { geo: new BoxGeometry(xIn - xOut, lowerH, 15), mat: 'concrete',
        pos: [(xIn + xOut) / 2, -lowerH / 2, 0] },
    ];
    for (let i = 0; i < 5; i++) {
      lowerParts.push({ geo: new BoxGeometry(0.24, 1.3, 1.5), mat: 'windowDark',
        pos: [xIn + 0.06, -1.5, -5.4 + i * 2.7] });
    }
    this.addParts(lowerParts, { name: 'lowerFloor', castShadow: false, receiveShadow: true });
    this.outdoorParts = out.parts;
    this.outdoorMeshes = this.addParts(out.parts, { name: 'outdoor', castShadow: false, receiveShadow: false });

    // 送電線（架線は LineSegments で 1ドローコール）
    const y0 = this.room.floorY;
    const verts = geo.powerLineVertices([
      { x: 18, y: y0 + 17 * 0.72, z: -6 },
      { x: 46, y: y0 + 17 * 0.72, z: -8 },
      { x: 74, y: y0 + 17 * 0.72, z: -10 },
    ]);
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(verts, 3));
    this.powerLines = new LineSegments(g, new LineBasicMaterial({ color: 0x2a2f33, fog: true }));
    this.group.add(this.powerLines);
  }

  /* ---------- ✝本質✝のしるし ---------- */

  buildEssenceCrosses(count = 26) {
    // 26個の✝は Points 1ドローコール（スプライトを並べるより軽い）
    const tex = canvasTex(makeCrossSprite(128));
    const pos = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    let seed = 4321;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = -this.room.width / 2 + 0.7 + rnd() * (this.room.width - 1.4);
      pos[i * 3 + 1] = 0.55 + rnd() * (this.room.height - 1.1);
      pos[i * 3 + 2] = -this.room.depth / 2 + 0.5 + rnd() * (this.room.depth - 1.0);
      seeds[i] = rnd() * 6.28;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    this._essenceSeeds = seeds;
    this._essenceBase = Float32Array.from(pos);
    this.essenceMaterial = new PointsMaterial({
      map: tex, size: 0.17, transparent: true, opacity: 0, depthWrite: false,
      blending: NormalBlending, sizeAttenuation: true, alphaTest: 0.02,
    });
    this.essenceGroup = new Group();
    this.essenceGroup.name = 'essence';
    this.essenceGroup.visible = false;
    this.essencePoints = new Points(g, this.essenceMaterial);
    this.essencePoints.frustumCulled = false;
    this.essenceGroup.add(this.essencePoints);
    this.group.add(this.essenceGroup);
  }

  /* ---------- 場面の適用 ---------- */

  /**
   * 場面プリセットを反映する（板書・小物・季節の色・席の向き）。
   * @param sceneCfg SCENES の要素
   * @param seatOverride 席数（省略時は現在値）
   */
  applyScene(sceneCfg, seatOverride = null) {
    this._sceneId = sceneCfg.id;
    // 板書の差し替え（キャンバス再生成）
    this.materials.board.map?.dispose();
    this.materials.board.map = canvasTex(makeBlackboardTexture(sceneCfg.board));
    this.materials.board.needsUpdate = true;

    // 掲示板（✝本質✝モードで貼り紙が増える）
    if (this._specialKeys['@board2']) {
      this._specialKeys['@board2'].map?.dispose();
      this._specialKeys['@board2'].map = canvasTex(makeNoticeBoardTexture(1024, 540, this._essence));
      this._specialKeys['@board2'].needsUpdate = true;
    }

    // 季節による屋外の色（稲・山・木）
    const season = sceneCfg.season;
    const leaf = { spring: 0xe0aec0, summer: 0x3f6b32, earlySummer: 0x4f7f3c, autumn: 0xa07c33, winter: 0x6a6e62 }[season] ?? 0x4f7f3c;
    this.materials.treeLeaf.color.set(leaf);
    const paddyCol = {
      spring: 0x8d9a5e, earlySummer: 0x73954a, summer: 0x557f38, autumn: 0xa59447, winter: 0x8f8a70,
    }[season] ?? 0x73954a;
    for (const key of ['paddy', 'paddySpring', 'paddyDeep', 'paddyGold', 'paddyDry']) {
      if (this.materials[key]) this.materials[key].color.set(paddyCol);
    }
    this.materials.field.color.set(season === 'autumn' ? 0x8b8455 : season === 'winter' ? 0x7a7d6c : 0x7d8a5c);
    this.materials.ridgeNear.color.set(season === 'autumn' ? 0x55603f : season === 'winter' ? 0x5b6157 : 0x4d5b48);
    this.materials.ground.color.set(season === 'winter' ? 0xa5a29a : 0x9a968c);

    // 小物と席の向き
    this.setPropVisibility(sceneCfg.id);
    this.setSeatCount(seatOverride ?? this._seatCount);
    return this;
  }

  /** ✝本質✝モードのON/OFF（赤い✝が浮かび、掲示板が怪文書に変わる） */
  setEssence(on) {
    this._essence = on;
    this.essenceGroup.visible = on;
    if (!on) this.essenceMaterial.opacity = 0;
    if (this._specialKeys['@board2']) {
      this._specialKeys['@board2'].map?.dispose();
      this._specialKeys['@board2'].map = canvasTex(makeNoticeBoardTexture(1024, 540, on));
      this._specialKeys['@board2'].needsUpdate = true;
    }
  }

  /** 窓の開閉（0=閉 / 1=開）を目標値へ */
  setWindows(open) {
    for (const w of this.windowSashes) { w.open = open; w.target = open ? 1 : 0; }
  }

  /** 引き戸の開閉 */
  setDoorOpen(open) {
    if (this.door) { this.door.open = open; this.door.target = open ? 1 : 0; }
  }

  update(dt, t, essenceAmount = 0) {
    // 窓サッシのスライド（Inspector ではなく手動補間）
    for (const w of this.windowSashes) {
      const cur = w.sash.position.z;
      const tgt = w.open ? w.sash.userData.openOffset : 0;
      const next = cur + (tgt - cur) * Math.min(1, dt * 4);
      w.sash.position.z = next;
      // 開いていると外気の分だけ明るくなる演出（ガラスの不透明度）
      for (const c of w.sash.children) if (c.material === this.materials.glass) c.material.opacity = 0.16;
    }
    if (this.door) {
      const cur = this.door.group.rotation.y;
      const tgt = this.door.target * -1.02;   // 開いている＝人の気配
      this.door.group.rotation.y = cur + (tgt - cur) * Math.min(1, dt * 3);
    }
    // ✝の浮遊（Points の頂点を直接ゆらす・1ドローコール）
    if (this.essenceGroup.visible && this.essencePoints) {
      const target = essenceAmount * (0.45 + Math.sin(t * 1.6) * 0.22);
      this.essenceMaterial.opacity += (Math.max(0, target) - this.essenceMaterial.opacity) * Math.min(1, dt * 2.2);
      if (essenceAmount > 0.01) {
        const attr = this.essencePoints.geometry.getAttribute('position');
        for (let i = 0; i < attr.count; i++) {
          const base = this._essenceBase;
          attr.setY(i, base[i * 3 + 1] + Math.sin(t * 0.85 + this._essenceSeeds[i]) * 0.04);
          attr.setX(i, base[i * 3] + Math.sin(t * 0.42 + this._essenceSeeds[i] * 1.7) * 0.02);
        }
        attr.needsUpdate = true;
      }
    }
  }
}
