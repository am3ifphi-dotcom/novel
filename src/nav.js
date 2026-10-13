/**
 * nav.js — 一人称（歩行）モードの移動・視線・当たり判定
 *
 * 「見る」ではなく「中を歩く」ためのモジュール。
 *  ・WASD / 矢印キーで歩く、Shift で小走り、C でしゃがむ
 *  ・マウス（Pointer Lock）で見回す。ロックしていないときはドラッグで見回す
 *  ・机・教卓・棚・壁・自販機に当たると止まる（椅子は軽いので押しのける想定＝当たらない）
 *  ・教室から廊下へは「少し開いている前扉」を通って出られる
 *
 * 最重要ルール3: Pointer Lock が使えない環境・触れない環境でも例外を出さず、
 * ドラッグ／タッチ操作にフォールバックする。
 */
import * as THREE from 'three';
import { ROOM, DOOR, CORRIDOR } from './spec.js';

/* ------------------------------------------------------------------ */
/* 体格と速度                                                          */
/* ------------------------------------------------------------------ */
export const EYE_STAND = 1.62;   // 立ったときの目の高さ（天井 2.90 / 机 0.72）
export const EYE_CROUCH = 1.04;  // しゃがんだとき
export const PLAYER_R = 0.19;    // 体の半径。机の列の間（0.43m）を抜けられる寸法

const SPD = { walk: 1.45, run: 2.60, crouch: 0.75 }; // m/秒
const ACCEL = 12;        // 加減速の追従速度
const SENS_MOUSE = 0.0023;
const SENS_TOUCH = 0.0042;
const PITCH_MAX = 1.45;  // ≈83°（真上・真下は見ない）

/* 全体の非常用クランプ（コリジョンから飛び出しても世界の外へは行かせない） */
const WORLD = { x0: CORRIDOR.x1 - 1.0, x1: ROOM.w / 2 + 0.5, z0: -CORRIDOR.z - 1.0, z1: CORRIDOR.z + 1.0 };

/* ------------------------------------------------------------------ */
/* 当たり判定（XZ 平面の AABB リスト）                                  */
/* ------------------------------------------------------------------ */

/**
 * @param {{furniture:object, world:object}} refs
 * @returns {Array<{x0:number,z0:number,x1:number,z1:number,tag:string}>}
 */
export function buildColliders(refs) {
  const out = [];
  const add = (x0, z0, x1, z1, tag) => {
    if (![x0, z0, x1, z1].every(Number.isFinite)) return;
    if (x1 - x0 > 0.002 && z1 - z0 > 0.002) out.push({ x0, z0, x1, z1, tag: tag || '' });
  };
  const addBox3 = (b, inset, tag) => {
    if (!b || b.isEmpty() || ![b.min.x, b.max.x, b.min.z, b.max.z].every(Number.isFinite)) return;
    add(b.min.x + inset, b.min.z + inset, b.max.x - inset, b.max.z - inset, tag);
  };

  const hx = ROOM.w / 2;
  const hz = ROOM.d / 2;
  const t = ROOM.wallT;

  /* ---- 教室の四方の壁 ---- */
  add(-hx - t, -hz - t, hx + t, -hz, '壁・黒板側');
  add(-hx - t, hz, hx + t, hz + t, '壁・背面');
  add(hx, -hz - t, hx + t, hz + t, '壁・窓側');

  // 廊下側は扉の開口をくり抜く（前扉 z=-3.0／後扉 z=+3.0、幅 0.92）
  {
    const holes = DOOR.z.map((z) => [z - DOOR.w / 2, z + DOOR.w / 2]).sort((a, b) => a[0] - b[0]);
    let z = -hz - t;
    for (const [a, b] of holes) {
      add(-hx - t, z, -hx, a, '壁・廊下側');
      z = b;
    }
    add(-hx - t, z, -hx, hz + t, '壁・廊下側');
  }

  /* ---- 廊下の外壁と両端 ---- */
  const CZ = CORRIDOR.z;
  add(CORRIDOR.x1 - 0.16, -CZ - 0.6, CORRIDOR.x1 + 0.08, CZ + 0.6, '廊下・外壁');
  add(CORRIDOR.x1 - 0.16, -CZ - 0.6, -hx + 0.02, -CZ, '廊下・奥');
  add(CORRIDOR.x1 - 0.16, CZ, -hx + 0.02, CZ + 0.6, '廊下・手前');

  /* ---- 机（InstancedMesh の各インスタンスから実寸で生成）---- */
  try {
    const im = refs.furniture && refs.furniture.instanced && refs.furniture.instanced.deskWood;
    if (im && im.geometry) {
      im.updateWorldMatrix(true, false);
      im.geometry.computeBoundingBox();
      const gb = im.geometry.boundingBox;
      const m = new THREE.Matrix4();
      const b = new THREE.Box3();
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, m);
        m.premultiply(im.matrixWorld);
        b.copy(gb).applyMatrix4(m);
        addBox3(b, 0.05, '机');
      }
    }
  } catch (e) {
    console.warn('[nav] 机の当たり判定を生成できませんでした（机すり抜け可のまま続行）:', e);
  }

  /* ---- 大きな家具（実体のバウンディングボックスから生成）---- */
  const roots = [
    [refs.furniture && refs.furniture.heroDesk, 0.05, '寺地の机'],
    [refs.furniture && refs.furniture.teacher, 0.04, '教卓'],
    [refs.world && refs.world.back && refs.world.back.shelf, 0.02, '棚'],
    [refs.world && refs.world.corridor && refs.world.corridor.vending, 0.02, '自販機'],
  ];
  for (const [obj, inset, tag] of roots) {
    try {
      if (!obj) continue;
      obj.updateWorldMatrix(true, true);
      addBox3(new THREE.Box3().setFromObject(obj), inset, tag);
    } catch (e) {
      console.warn(`[nav] ${tag} の当たり判定を生成できませんでした:`, e);
    }
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* 円（プレイヤー）と AABB の押し出し                                   */
/* ------------------------------------------------------------------ */
function hits(x, z, b) {
  return x + PLAYER_R > b.x0 && x - PLAYER_R < b.x1 && z + PLAYER_R > b.z0 && z - PLAYER_R < b.z1;
}

/** X 方向だけ押し出す（Z は動かさない）→ 壁ずりが自然に効く */
function pushX(x, z, boxes) {
  for (const b of boxes) {
    if (hits(x, z, b)) x = x < (b.x0 + b.x1) * 0.5 ? b.x0 - PLAYER_R : b.x1 + PLAYER_R;
  }
  return x;
}
/** Z 方向だけ押し出す */
function pushZ(x, z, boxes) {
  for (const b of boxes) {
    if (hits(x, z, b)) z = z < (b.z0 + b.z1) * 0.5 ? b.z0 - PLAYER_R : b.z1 + PLAYER_R;
  }
  return z;
}
function stuck(x, z, boxes) {
  for (const b of boxes) if (hits(x, z, b)) return true;
  return false;
}

/* ------------------------------------------------------------------ */
/* コントローラ                                                        */
/* ------------------------------------------------------------------ */
export function createNav(opts) {
  const {
    camera,
    dom,                  // canvas
    colliders = [],
    controls = null,      // OrbitControls（俯瞰モードで使う）
    onLockChange = null,  // (locked:boolean) => void
    onInteract = null,    // 「調べる」操作
    onModeChange = null,  // (mode) => void
  } = opts;

  const boxes = colliders;

  const pos = new THREE.Vector2(camera.position.x, camera.position.z);
  const vel = new THREE.Vector2(0, 0);
  let yaw = 0;
  let pitch = 0;
  let eye = camera.position.y;
  let eyeTarget = EYE_STAND;
  let crouch = false;
  let bob = 0;
  let mode = 'walk';
  let enabled = true;
  let locked = false;

  const keys = new Set();
  const stick = { active: false, x: 0, y: 0, id: null };
  let dragging = false;
  let lastDrag = { x: 0, y: 0 };

  /* ---- 入力ベクトル ---- */
  function inputVector() {
    let ix = 0;
    let iz = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) iz += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) iz -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
    if (stick.active) { ix += stick.x; iz += -stick.y; }
    const len = Math.hypot(ix, iz);
    if (len > 1) { ix /= len; iz /= len; }
    return { x: ix, z: iz, len: Math.min(1, len) };
  }

  /* ---- 向きの更新 ---- */
  function clampPitch() {
    pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, pitch));
  }
  function applyLook(dx, dy, sens) {
    yaw -= dx * sens;
    pitch -= dy * sens;
    clampPitch();
  }

  /* ---- 更新 ---- */
  function update(dt) {
    if (mode !== 'walk') return;

    if (enabled) {
      const inp = inputVector();
      const running = keys.has('ShiftLeft') || keys.has('ShiftRight');
      crouch = keys.has('KeyC') || keys.has('ControlLeft') || keys.has('ControlRight');

      // 向きから前後左右のベクトルを作る（yaw=0 で -Z を向く）
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      const rx = Math.cos(yaw);
      const rz = -Math.sin(yaw);

      const spd = crouch ? SPD.crouch : running ? SPD.run : SPD.walk;
      const wantX = (fx * inp.z + rx * inp.x) * spd;
      const wantZ = (fz * inp.z + rz * inp.x) * spd;

      // 加減速（急停止・急発進を避けて歩いている感じを出す）
      const k = 1 - Math.exp(-ACCEL * dt);
      vel.x += (wantX - vel.x) * k;
      vel.y += (wantZ - vel.y) * k;

      // 移動 → X/Z を分離して押し出す
      let nx = pushX(pos.x + vel.x * dt, pos.y, boxes);
      let nz = pushZ(nx, pos.y + vel.y * dt, boxes);
      if (stuck(nx, nz, boxes)) {
        nz = pos.y;
        if (stuck(nx, nz, boxes)) { nx = pos.x; nz = pos.y; vel.set(0, 0); }
      }
      pos.set(
        Math.max(WORLD.x0, Math.min(WORLD.x1, nx)),
        Math.max(WORLD.z0, Math.min(WORLD.z1, nz)),
      );

      // 歩行の上下動（頭を揺らす）。止まっているときは揺らさない
      const speed = vel.length();
      bob += dt * speed * 5.4;
    } else {
      vel.multiplyScalar(Math.max(0, 1 - dt * 10));
    }

    // 目の高さ（しゃがみはゆっくり）
    eyeTarget = crouch ? EYE_CROUCH : EYE_STAND;
    eye += (eyeTarget - eye) * Math.min(1, dt * 8);

    const moving = Math.min(1, vel.length() / SPD.walk);
    const bobY = Math.sin(bob * 2) * 0.014 * moving;
    const bobX = Math.cos(bob) * 0.010 * moving;
    const roll = Math.cos(bob) * 0.0055 * moving;

    camera.position.set(pos.x + bobX * Math.cos(yaw), eye + bobY, pos.y - bobX * Math.sin(yaw));
    camera.rotation.set(pitch, yaw, roll, 'YXZ');
  }

  /* ---- モード ---- */
  function setMode(next) {
    if (next === mode) return;
    if (next === 'walk') {
      // 俯瞰モードのカメラ位置・向きを引き継ぐ
      const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
      yaw = e.y;
      pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, e.x));
      pos.set(camera.position.x, camera.position.z);
      if (boxes.length) {
        const nx = pushX(pos.x, pos.y, boxes);
        const nz = pushZ(nx, pos.y, boxes);
        pos.set(nx, nz);
      }
      eye = Math.max(EYE_CROUCH, Math.min(EYE_STAND, camera.position.y));
      eyeTarget = EYE_STAND;
      crouch = false;
      vel.set(0, 0);
      if (controls) controls.enabled = false;
    } else {
      // 一人称の位置・向きから OrbitControls の注視点を作る
      if (controls) {
        controls.enabled = true;
        const f = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
        controls.target.copy(camera.position).addScaledVector(f, 2.2);
        controls.update();
      }
      releaseLock();
    }
    mode = next;
    keys.clear();
    stick.active = false;
    stick.x = stick.y = 0;
    onModeChange && onModeChange(mode);
  }

  /** 視点プリセット：立ち位置と注視点を一気に適用する */
  function teleport(p, look) {
    pos.set(p[0], p[2]);
    if (boxes.length) {
      const nx = pushX(pos.x, pos.y, boxes);
      const nz = pushZ(nx, pos.y, boxes);
      if (!stuck(nx, nz, boxes)) pos.set(nx, nz);
    }
    const dx = look[0] - pos.x;
    const dy = look[1] - p[1];
    const dz = look[2] - pos.y;
    yaw = Math.atan2(-dx, -dz);
    pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, Math.atan2(dy, Math.hypot(dx, dz))));
    eye = p[1];
    eyeTarget = p[1] < EYE_CROUCH + 0.1 ? EYE_CROUCH : EYE_STAND;
    crouch = eyeTarget === EYE_CROUCH;
    vel.set(0, 0);
    bob = 0;
    camera.position.set(pos.x, eye, pos.y);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
  }

  /** 視線（画面中央）のレイを返す */
  function centerRay() {
    return new THREE.Raycaster(
      camera.position.clone(),
      new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ')),
    );
  }

  /* ---- Pointer Lock ---- */
  function requestLock() {
    try {
      const r = dom.requestPointerLock && dom.requestPointerLock();
      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch (e) {
      console.info('[nav] Pointer Lock を使えません。ドラッグ操作で続行します。');
    }
  }
  function releaseLock() {
    try { if (document.pointerLockElement === dom) document.exitPointerLock(); } catch (e) { /* 無視 */ }
  }

  function onLockChangeEvent() {
    locked = document.pointerLockElement === dom;
    if (!locked) { dragging = false; keys.clear(); }
    onLockChange && onLockChange(locked);
  }
  document.addEventListener('pointerlockchange', onLockChangeEvent);

  /* ---- キーボード ---- */
  function onKeyDown(e) {
    if (mode !== 'walk' || !enabled) return;
    // 入力欄がないので問答無用で拾う（モーダル表示中は enabled=false で止める）
    if (e.code === 'KeyE') { onInteract && onInteract(); return; }
    if (e.code === 'Space') e.preventDefault();
    keys.add(e.code);
  }
  function onKeyUp(e) { keys.delete(e.code); }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => { keys.clear(); stick.active = false; stick.x = stick.y = 0; });

  /* ---- マウス（ロック時）/ ドラッグ（非ロック時）---- */
  function onMouseMove(e) {
    if (mode !== 'walk' || !enabled) return;
    if (locked) {
      applyLook(e.movementX || 0, e.movementY || 0, SENS_MOUSE);
    } else if (dragging) {
      applyLook(e.clientX - lastDrag.x, e.clientY - lastDrag.y, SENS_MOUSE * 1.6);
      lastDrag.x = e.clientX;
      lastDrag.y = e.clientY;
    }
  }
  function onPointerDown(e) {
    if (mode !== 'walk' || !enabled) return;
    if (e.pointerType === 'touch') {
      // タッチ：右側をドラッグすると見回す
      lastDrag.x = e.clientX;
      lastDrag.y = e.clientY;
      dragging = true;
      return;
    }
    if (!locked) { requestLock(); return; }
    dragging = true;
    lastDrag.x = e.clientX;
    lastDrag.y = e.clientY;
  }
  function onPointerUp() { dragging = false; }

  dom.addEventListener('mousemove', onMouseMove);
  dom.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  dom.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerType !== 'touch' || mode !== 'walk' || !enabled) return;
    applyLook(e.clientX - lastDrag.x, e.clientY - lastDrag.y, SENS_TOUCH);
    lastDrag.x = e.clientX;
    lastDrag.y = e.clientY;
  });

  /* ---- タッチの移動スティック ---- */
  function wireStick(el) {
    if (!el) return;
    const setFrom = (e) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const max = r.width / 2;
      let dx = (e.clientX - cx) / max;
      let dy = (e.clientY - cy) / max;
      const l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; }
      stick.x = dx;
      stick.y = dy;
      const knob = el.querySelector('.ts-knob');
      if (knob) {
        knob.style.transform = `translate(${dx * max * 0.62}px, ${dy * max * 0.62}px)`;
      }
    };
    el.addEventListener('pointerdown', (e) => {
      stick.active = true;
      stick.id = e.pointerId;
      el.setPointerCapture && el.setPointerCapture(e.pointerId);
      setFrom(e);
      e.preventDefault();
    });
    el.addEventListener('pointermove', (e) => { if (stick.active && e.pointerId === stick.id) setFrom(e); });
    const end = (e) => {
      if (e.pointerId !== stick.id) return;
      stick.active = false;
      stick.x = stick.y = 0;
      const knob = el.querySelector('.ts-knob');
      if (knob) knob.style.transform = 'translate(0px, 0px)';
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  /* ---- 公開 API ---- */
  return {
    get mode() { return mode; },
    get locked() { return locked; },
    get position() { return { x: pos.x, z: pos.y }; },
    get crouching() { return crouch; },
    get speed() { return vel.length(); },
    update,
    setMode,
    teleport,
    centerRay,
    requestLock,
    releaseLock,
    wireStick,
    setEnabled(v) {
      enabled = !!v;
      if (!enabled) { keys.clear(); stick.active = false; stick.x = stick.y = 0; dragging = false; }
    },
    /** デバッグ・テスト用 */
    _debug: { boxes, pos, keys, boxesAt: (x, z) => boxes.filter((b) => hits(x, z, b)) },
  };
}
