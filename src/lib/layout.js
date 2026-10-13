/**
 * layout.js — 座席配置の純粋計算（DOM / three 非依存・Node でテスト可能）
 *
 * 原作の理数科B組は40人（三年間同じ四十人）。要求仕様の「机×30・椅子×30」を既定にし、
 * UI のギミックで 40人仕様（原作準拠）へ切り替えられるようにする。
 */

export const ROWS = 5;

/** 列の X 座標。机は「2人掛けの島」で並び、島の間に通路ができる */
export function columnX(count) {
  const pairs = count > 30 ? 4 : 3;
  const centers = pairs === 4 ? [-2.25, -0.75, 0.75, 2.25] : [-2.0, 0, 2.0];
  const xs = [];
  for (const c of centers) { xs.push(c - 0.34, c + 0.34); }
  return xs; // 6列 or 8列
}

/** 行の Z 座標（−Z が黒板側） */
export function rowZ(i) {
  return -1.85 + i * 1.1;
}

/**
 * 机の配置。count = 30 / 40 など（rows*cols に収まる範囲で z 側から埋める）
 * @returns {Array<{index:number, row:number, col:number, x:number, z:number, yaw:number}>}
 */
export function deskLayout(count = 30, room = null) {
  const cols = columnX(count).length;
  const seats = [];
  const rows = Math.max(1, Math.ceil(count / cols));
  for (let r = 0; r < Math.min(ROWS, rows); r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (i >= count) break;
      seats.push({ index: i, row: r, col: c, x: columnX(count)[c], z: rowZ(r), yaw: 0 });
    }
  }
  return seats;
}

/** 椅子の配置（机の後ろ＝+Z 側） */
export function chairLayout(seats, offsetZ = 0.62) {
  return seats.map((s) => ({ ...s, z: s.z + offsetZ }));
}

/** 座席の同定: row / col から座席を引く */
export function seatAt(seats, row, col, fromWindow = true) {
  const cols = columnX(seats.length).length;
  const c = fromWindow ? cols - 1 - col : col;
  return seats.find((s) => s.row === row && s.col === c) ?? null;
}

/** 原作の人物 → 座席（担当地は props の配置決めに使う） */
export function roleSeats(seats, count = seats.length) {
  const cols = columnX(count).length;
  const pick = (row, col) => seats.find((s) => s.row === row && s.col === col) ?? null;
  return {
    sugar: pick(4, cols - 1),      // 砂糖東洋: 窓際の最後列（L1279）
    terachi: pick(2, cols - 2),    // 寺地星: 窓側の中段（自習・天文学の本）
    ryouma: pick(0, 0),            // 両馬二郎: 廊下側の前列（スマホ）
    mie: pick(0, 1),               // 三重県臣: 前列
    izaki: pick(0, 2),             // 伊崎: 前列まとめ役
    izumi: pick(1, 2),             // 伊豆見
    rei: pick(2, 3),               // 数理零（放課後は黒板の前に立つ＝空席）
    sakura: pick(3, cols - 1),     // 櫻優: 窓側
  };
}

/**
 * 場面ごとの机・椅子の「ずれ」＝人の気配。
 * 放課後の補習では前列の机が黒板の方を向く。金曜五限は皆がだらけている。
 */
export function sceneDeskModifiers(sceneId, seats) {
  const mods = new Map();
  const set = (index, patch) => mods.set(index, { yaw: 0, dx: 0, dz: 0, ...patch });
  if (sceneId === 'after') {
    // 零の補習: 前列の5席が黒板側へ向きを変える（椅子だけ回る＝座っている）
    seats.filter((s) => s.row === 0).forEach((s) => set(s.index, { yaw: -0.38, dx: -0.12, dz: -0.06 }));
    set(seats[Math.min(6, seats.length - 1)].index, { yaw: 0.24, dx: 0.1, dz: 0.05 });
  } else if (sceneId === 'friday') {
    seats.forEach((s) => {
      if (s.row >= 3) set(s.index, { yaw: (s.col % 2 ? 1 : -1) * 0.06, dz: 0.03 });
    });
  } else if (sceneId === 'lunch') {
    seats.filter((s) => s.row <= 1).forEach((s, i) => set(s.index, { yaw: (i % 2 ? 1 : -1) * 0.22, dz: -0.05 }));
  } else if (sceneId === 'morning') {
    seats.filter((s) => s.row === 4).forEach((s) => set(s.index, { yaw: 0.04 }));
  }
  return mods;
}

/** 教室の内寸に対して配置が収まっているかを検証する（テスト用） */
export function validateLayout(seats, room) {
  const problems = [];
  const halfW = room.width / 2 - 0.12, halfD = room.depth / 2 - 0.12;
  const deskMarginX = room.desk.top / 2, deskMarginZ = room.desk.depth / 2;
  for (const s of seats) {
    if (Math.abs(s.x) + deskMarginX > halfW) problems.push(`席${s.index}: X が壁に干渉 (${s.x.toFixed(2)})`);
    if (s.z - deskMarginZ < -2.9) problems.push(`席${s.index}: 教壇に干渉 (${s.z.toFixed(2)})`);
    if (s.z + deskMarginZ > halfD - 0.5) problems.push(`席${s.index}: 後方ロッカーに干渉 (${s.z.toFixed(2)})`);
  }
  return problems;
}
