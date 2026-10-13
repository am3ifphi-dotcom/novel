/**
 * sunpath.js — 太陽位置と色温度の純粋計算（DOM / three に依存しない = Node でテスト可能)
 *
 * 方位角はコンパス角: 0=北(−Z), 90=東(−X), 180=南(+Z), 270=西(+X)
 * 教室の窓は +X（西）面なので、午後の光が窓から差し込む＝原作の「午後の日差しで焼かれ」に対応する。
 */

const DEG = Math.PI / 180;

/** コンパス角+高度から、原点→太陽 の単位ベクトル */
export function sunVector(azimuthDeg, altitudeDeg) {
  const a = azimuthDeg * DEG, h = altitudeDeg * DEG;
  const cosH = Math.cos(h);
  return { x: -Math.sin(a) * cosH, y: Math.sin(h), z: -Math.cos(a) * cosH };
}

/**
 * 色温度(K) → 線形RGB(0..1)。Tanner Helland 近似を sRGB で返す。
 * three 側で setRGB(..., SRGBColorSpace) して使う。
 */
export function kelvinToRGB(kelvin) {
  const t = Math.max(1000, Math.min(40000, kelvin)) / 100;
  let r, g, b;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  }
  if (t >= 66) b = 255;
  else if (t <= 19) b = 0;
  else b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const cl = (v) => Math.max(0, Math.min(255, v)) / 255;
  return { r: cl(r), g: cl(g), b: cl(b) };
}

/** 大気の拡散具合から、影の柔らかさ（半径）を決める: 低い太陽ほど柔らかい */
export function shadowRadius(altitudeDeg) {
  const h = Math.max(2, altitudeDeg);
  return Math.max(0.8, Math.min(6.5, 14 / h));
}

/** 正午からの距離で周辺光の強さを決める（低い太陽＝青い空気光が強い） */
export function ambientFactor(altitudeDeg) {
  const h = Math.max(-5, Math.min(90, altitudeDeg));
  return 0.35 + 0.65 * Math.sin(Math.max(0, h) * DEG);
}

/** 日中の経過時間(0..1)を 5:00〜19:00 の太陽高度・方位に変換する（時間スライダー用） */
export function sunFromClock(hour) {
  const t = Math.max(0, Math.min(1, (hour - 5) / 14)); // 5時→0, 19時→1
  const altitude = Math.sin(Math.PI * t) * 62 - 2;
  const azimuth = 96 + 176 * t; // 東(96°)から西(272°)へ
  // 色温度: 朝夕は低く、正午に高い
  const midday = Math.sin(Math.PI * t);
  const kelvin = 2400 + 3800 * Math.pow(midday, 0.55);
  const intensity = 0.5 + 2.7 * Math.max(0, Math.sin(Math.PI * t));
  return { altitude: Math.max(-2, altitude), azimuth, kelvin, intensity };
}
