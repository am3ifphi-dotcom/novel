/**
 * config.js — シーン全体の設定。
 * 値はすべて SCENE_SPEC.md（gensaku.txt の解析結果）に由来する。
 */

export const ROOM = {
  width: 9.0,   // X: 窓壁(+X=西) ⇄ 廊下壁(−X=東)
  depth: 8.0,   // Z: 前面(−Z=黒板) ⇄ 後面(+Z=ロッカー)
  height: 3.0,  // Y
  window: { sill: 0.86, height: 1.62, width: 1.5, gap: 0.32, count: 4 }, // 窓壁(+X)に4連窓
  door: { width: 1.02, height: 2.05, offsetZ: 1.4 },                     // 廊下壁の引き戸
  blackboard: { width: 4.2, height: 1.16, bottom: 0.82 },                // 前壁の黒板
  podium: { width: 4.8, depth: 1.3, height: 0.14 },                      // 教壇
  desk: { top: 0.65, depth: 0.45, height: 0.70, chair: 0.40 },
  corridor: { width: 2.6, length: 13.0 },  // 廊下(北棟2階) 教室の−X側
  floorY: -3.85,                           // 2階の床から見た地面の高さ
};

export const ASSETS = {
  textures: {
    floor: { dir: 'textures/floor_wood', maps: { map: 'diff.webp', normalMap: 'nor.webp', roughnessMap: 'rough.webp' } },
    wall: { dir: 'textures/wall_plaster', maps: { map: 'diff.webp', normalMap: 'nor.webp', roughnessMap: 'rough.webp' } },
    ceiling: { dir: 'textures/ceiling', maps: { map: 'diff.webp', roughnessMap: 'rough.webp' } },
    deskWood: { dir: 'textures/wood_oak', maps: { map: 'diff.webp', roughnessMap: 'rough.webp' } },
    metal: { dir: 'textures/metal_plate', maps: { map: 'diff.webp', normalMap: 'nor.webp', roughnessMap: 'rough.webp' } },
    metalRust: { dir: 'textures/metal_rust', maps: { map: 'diff.webp', roughnessMap: 'rough.webp' } },
    concrete: { dir: 'textures/concrete', maps: { map: 'diff.webp', roughnessMap: 'rough.webp' } },
  },
  hdri: {
    dawn: 'hdri/dawn.exr',
    sky: 'hdri/sky.exr',
    sunset: 'hdri/sunset.exr',
    apartment: 'hdri/apartment.exr',
    venice: 'hdri/venice.exr',
  },
  models: { waterBottle: 'models/water_bottle.glb' },
  /** オンライン時のみ試す Poly Haven の上位HDRI（失敗しても必ず続行する） */
  polyhaven: {
    base: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/',
    assets: { kloppenheim_06: 'kloppenheim_06_1k.hdr', venice_sunset: 'venice_sunset_1k.hdr' },
  },
};

/**
 * 場面プリセット。原作の象徴的な場面を7つ選び、太陽・色温度・フォグ・板書・小物を切り替える。
 * time は「作中時刻」、chapter は章題、quote は原文（gensaku.txt の行番号付き）。
 */
export const SCENES = [
  {
    id: 'morning', label: '四月・朝のHR', short: '朝',
    time: '7:45', chapter: '序　四月、全員続投',
    quote: '「教室の配置が少し変わった。砂糖が窓際の最後列に移った。通学路で見る山と同じ角度で窓の外が見えるポジションだ。」（L1279）',
    sun: { azimuth: 98, altitude: 14, kelvin: 5400, intensity: 2.1 },
    lamp: true, exposure: 1.0, hdri: 'dawn',
    fog: { color: 0xa8b7c4, density: 0.010 },
    sky: { top: 0x5f86c0, horizon: 0xdfe3e2, glow: 0.35 },
    season: 'spring', ground: 'spring', petals: true, rain: false,
    board: 'morning',
    camera: { pos: [-3.45, 1.56, 3.35], target: [0.7, 1.05, -2.8] },
  },
  {
    id: 'miso', label: '火曜三限・味噌の地政学', short: '三限',
    time: '11:05', chapter: '第二章　火曜三限、味噌の地政学',
    quote: '「塀勝也が教室に入ってきた。火曜三限。地理。……勝也は黒板に〈味噌〉と書いた。」（L88, L100）',
    sun: { azimuth: 158, altitude: 54, kelvin: 5800, intensity: 2.5 },
    lamp: false, exposure: 1.02, hdri: 'sky',
    fog: { color: 0xc3c8c8, density: 0.0085 },
    sky: { top: 0x7ba4cd, horizon: 0xe8ecec, glow: 0.2 },
    season: 'earlySummer', ground: 'green', petals: false, rain: false,
    board: 'miso',
    camera: { pos: [3.55, 1.5, -1.5], target: [-1.1, 1.32, -3.95] },
  },
  {
    id: 'lunch', label: '昼休み・弁当の力学', short: '昼',
    time: '12:40', chapter: '第九章　昼休みの力学と、零の話',
    quote: '「全員が弁当を食べながらこちらを見ている。」（L421）／「昼休み。教室。」',
    sun: { azimuth: 186, altitude: 63, kelvin: 6000, intensity: 2.6 },
    lamp: false, exposure: 1.04, hdri: 'venice',
    fog: { color: 0xccd3d0, density: 0.008 },
    sky: { top: 0x84aed6, horizon: 0xeef2f0, glow: 0.18 },
    season: 'summer', ground: 'green', petals: false, rain: false,
    board: 'lunch',
    camera: { pos: [-0.95, 1.14, 0.5], target: [2.4, 1.02, 1.9] },
  },
  {
    id: 'friday', label: '金曜五限・死んでいる教室', short: '五限',
    time: '15:20', chapter: '第四章　金曜五限はいつも死んでいる',
    quote: '「教室の空気は死んでいる。窓際は午後の日差しで焼かれ、廊下側はモップの匂いが微かに漂う。生徒の脳は省エネモードに入っている。」（L260）',
    sun: { azimuth: 244, altitude: 24, kelvin: 3800, intensity: 3.0 },
    lamp: false, exposure: 1.06, hdri: 'sunset',
    fog: { color: 0xd8c3a2, density: 0.0135 },
    sky: { top: 0x9db2c8, horizon: 0xf0d8ae, glow: 0.55 },
    season: 'autumn', ground: 'dry', petals: false, rain: false,
    board: 'friday',
    camera: { pos: [-3.15, 1.62, -3.1], target: [2.5, 0.98, 2.1] },
  },
  {
    id: 'after', label: '放課後・零の数学', short: '放課後',
    time: '16:55', chapter: '第七章　三重県臣が冷笑を失う日',
    quote: '「放課後。教室。零が黒板の前に立って、数学を教え始めた。伊崎、伊豆見、両馬、砂糖、三重が席についている。寺地は自習している。」（L767–768）',
    sun: { azimuth: 262, altitude: 7, kelvin: 2900, intensity: 2.6 },
    lamp: true, exposure: 1.12, hdri: 'sunset',
    fog: { color: 0xc99a76, density: 0.019 },
    sky: { top: 0x3f5a86, horizon: 0xf0a45c, glow: 0.85 },
    season: 'winter', ground: 'dry', petals: false, rain: false,
    board: 'afterSchool',
    camera: { pos: [-0.62, 1.34, 2.55], target: [0.25, 1.5, -3.95] },
  },
  {
    id: 'corridor', label: '北棟の廊下・コーンスープの不在', short: '廊下',
    time: '15:05', chapter: '第十二章　三学期・コーンスープの帰還',
    quote: '「自販機はあるが、コーンスープが三ヶ月前から補充されていない。……理数科の生徒はこの問題を〈コーンスープの不在〉と呼んでいる。」（L15）',
    sun: { azimuth: 250, altitude: 30, kelvin: 4200, intensity: 1.2 },
    lamp: true, exposure: 1.0, hdri: 'apartment',
    fog: { color: 0xb3b7bb, density: 0.02 },
    sky: { top: 0x8fa4b8, horizon: 0xe6e2d8, glow: 0.25 },
    season: 'winter', ground: 'dry', petals: false, rain: false,
    board: 'corridor',
    camera: { pos: [-5.15, 1.62, 3.1], target: [-7.05, 1.15, -2.6] },
  },
  {
    id: 'outside', label: '窓の外・田んぼと送電線', short: '窓外',
    time: '16:10', chapter: '第五章　砂糖東洋は窓の外を見ない',
    quote: '「田んぼ。山。川。送電線。トンネル。……山の稜線が、先日の地理の授業で勝也が見せた地形図の等高線と、なんとなく対応しているように見えた。」（L369, L375）',
    sun: { azimuth: 258, altitude: 15, kelvin: 4000, intensity: 3.2 },
    lamp: false, exposure: 1.05, hdri: 'sky',
    fog: { color: 0xd9cdb6, density: 0.0055 },
    sky: { top: 0x6f92bf, horizon: 0xf2d9ae, glow: 0.6 },
    season: 'autumn', ground: 'gold', petals: false, rain: false,
    board: 'morning',
    camera: { pos: [5.4, 3.35, 0.9], target: [46, 2.2, -17] },
  },
];

/** Poly Haven 取得失敗時に使うプロシージャル HDRI 相当（等間隔グレー）*/
export const FALLBACK = {
  envIntensity: { default: 0.62, lamp: 0.5 },
};

export const QUALITY = {
  high: { pixelRatio: 2.0, shadowMapSize: 2048, dust: 260, petals: 130, shafts: true },
  mid: { pixelRatio: 1.5, shadowMapSize: 1536, dust: 170, petals: 90, shafts: true },
  low: { pixelRatio: 1.0, shadowMapSize: 1024, dust: 80, petals: 50, shafts: false },
};
