/**
 * tools/canvas-regression.mjs — Canvas 2D の引数バリデーション回帰テスト
 *
 * かつて world.js が skyTexture() へ [位置, 色] の順で渡し、
 * addColorStop(NaN) → 「The provided double value is non-finite.」で起動していた事故の再発防止。
 *
 *   1) 厳格モックそのものが、おかしい引数で例外を投げること（＝テストが武装できているか）
 *   2) skyTexture() が順序の違い・NaN・欠損を吸収して、決して落ちないこと
 *   3) 全時間帯・全黒板状態・主要テクスチャを生成しても例外が出ないこと
 *
 *   node tools/canvas-regression.mjs
 */
import { installDom, makeCanvas } from './canvas-mock.mjs';

installDom();

let failed = 0;
const ok = (name, fn) => {
  try {
    fn();
    console.log(`  ✔ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✖ ${name}\n      ${e.message}`);
  }
};
const throws = (name, fn, needle) => {
  try {
    fn();
    failed++;
    console.error(`  ✖ ${name} — 例外が投げられませんでした（モックが武装できていない）`);
  } catch (e) {
    if (needle && !String(e.message).includes(needle)) {
      failed++;
      console.error(`  ✖ ${name} — 期待と違う例外: ${e.message}`);
      return;
    }
    console.log(`  ✔ ${name}`);
  }
};

/* ---------------------------------------------------------------- */
console.log('[1] 厳格モックが本物の Canvas 同様に例外を投げること');
{
  const ctx = makeCanvas(8, 8).getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 8);
  throws('addColorStop(NaN) で例外', () => g.addColorStop(NaN, '#fff'), 'non-finite');
  throws('addColorStop(undefined) で例外', () => g.addColorStop(undefined, '#fff'), 'non-finite');
  throws('addColorStop("#3f79c0") で例外（色と位置の取り違え）',
    () => g.addColorStop('#3f79c0', 0), 'non-finite');
  throws('addColorStop(1.5) で例外（範囲外）', () => g.addColorStop(1.5, '#fff'), 'range');
  throws('createLinearGradient(NaN) で例外', () => ctx.createLinearGradient(0, 0, 0, NaN), 'non-finite');
  throws('createRadialGradient(負の半径) で例外', () => ctx.createRadialGradient(0, 0, -1, 0, 0, 5), 'negative');
  throws('arc(負の半径) で例外', () => ctx.arc(0, 0, -2, 0, 1), 'negative');
}

/* ---------------------------------------------------------------- */
console.log('[2] skyTexture() が不正入力を吸収して落ちないこと');
{
  const { skyTexture } = await import('../src/textures.js');
  const THREE = await import('three');
  const dir = new THREE.Vector3(1, 1, 1);

  ok('正しい形式 [色, 位置]', () => {
    const t = skyTexture([['#000', 0], ['#fff', 1]], dir);
    if (!t || !t.isTexture) throw new Error('テクスチャが返ってこない');
  });
  ok('逆順 [位置, 色] でも落ちない（事故の再発防止）', () => {
    const t = skyTexture([[0, '#000'], [1, '#fff']], dir);
    if (!t || !t.isTexture) throw new Error('テクスチャが返ってこない');
  });
  ok('混在（数値始まりと文字列始まり）でも落ちない', () => {
    skyTexture([['#000', 0], [0.5, '#888'], ['#fff', 1]], dir);
  });
  ok('NaN / null / undefined を含むストップでも落ちない', () => {
    skyTexture([['#000', NaN], [null, 0.5], [undefined, 1], ['#fff', 0.9]], dir);
  });
  ok('空配列・null・undefined でも落ちない（保険の青空になる）', () => {
    skyTexture([], dir); skyTexture(null, dir); skyTexture(undefined, dir);
  });
  ok('sunDir が null / 零ベクトル / NaN でも落ちない', () => {
    skyTexture([['#000', 0], ['#fff', 1]], null);
    skyTexture([['#000', 0], ['#fff', 1]], new THREE.Vector3(0, 0, 0));
    skyTexture([['#000', 0], ['#fff', 1]], new THREE.Vector3(NaN, 1, 1));
  });
  ok('全時間帯の sky 定義を通しても落ちない', async () => {
    const { TIMES } = await import('../src/spec.js');
    TIMES.forEach((T) => {
      const d = new THREE.Vector3(...Object.values(T.sun)).setLength(1);
      skyTexture(T.sky, d);
      skyTexture(T.sky, null);
    });
  });
}

/* ---------------------------------------------------------------- */
console.log('[3] 主要な Canvas 生成物がすべて例外なく作れること');
{
  const TX = await import('../src/textures.js');
  const B = await import('../src/boards.js');
  ok('プロシージャル・テクスチャ一式', () => {
    TX.woodFloorTexture(256, [1, 1]);
    TX.plasterTexture(256, [1, 1]);
    TX.ceilingTexture(256, [1, 1]);
    TX.woodTexture(256, [1, 1]);
    TX.metalTexture(128, [1, 1]);
    TX.fabricTexture(128, [1, 1]);
    TX.grayNoiseTexture(128, [1, 1], 0.6, 0.4);
    TX.normalFromNoise(128, [1, 1], 1, 16);
    TX.concreteTexture(128, [1, 1]);
    TX.landscapeTexture();
    TX.fieldGroundTexture(128, [1, 1]);
    TX.beamTexture();
    TX.dustSprite();
  });
  ok('黒板3状態・時計・掲示板など', () => {
    ['miso', 'terrace', 'math'].forEach((m) => B.blackboardTexture(m, '金曜五限 14:50'));
    [[10, 50], [14, 50], [16, 30], [20, 0]].forEach(([h, m]) => B.clockTexture(h, m));
    B.noticeTexture(); B.timetableTexture(); B.vendingTexture();
    B.phoneScreenTexture(); B.notebookCoverTexture(); B.openNotebookTexture();
    B.astroBookTexture(); B.bookSpinesTexture(); B.roomPlateTexture();
    for (let i = 0; i < 21; i++) B.paperSheetTexture(i);
  });
}

/* ---------------------------------------------------------------- */
console.log('[4] 教室まるごと組み立て（厳格モック配下）');
{
  const THREE = await import('three');
  const { buildWorld } = await import('../src/world.js');
  const { buildFurniture } = await import('../src/furniture.js');
  const { buildProps } = await import('../src/props.js');
  const { makeMaterials } = await import('../src/assets.js');
  const { sunDirection } = await import('../src/util.js');
  const { TIMES } = await import('../src/spec.js');

  const procedural = {
    woodFloor: (rx, ry) => TX_woodFloor(rx, ry), plaster: (rx, ry) => TX_plaster(rx, ry),
    ceilingTex: (rx, ry) => TX_ceiling(rx, ry), wood: (rx, ry) => TX_wood(rx, ry),
    metal: (rx, ry) => TX_metal(rx, ry), fabric: (rx, ry) => TX_fabric(rx, ry),
    grayNoise: (rx, ry, b, c) => TX_gray(rx, ry, b, c),
    normalNoise: (rx, ry, s, d) => TX_nrm(rx, ry, s, d),
    concrete: (rx, ry) => TX_conc(rx, ry),
  };
  const TXM = await import('../src/textures.js');
  const TX_woodFloor = (a, b) => TXM.woodFloorTexture(256, [a, b]);
  const TX_plaster = (a, b) => TXM.plasterTexture(256, [a, b]);
  const TX_ceiling = (a, b) => TXM.ceilingTexture(256, [a, b]);
  const TX_wood = (a, b) => TXM.woodTexture(256, [a, b]);
  const TX_metal = (a, b) => TXM.metalTexture(128, [a, b]);
  const TX_fabric = (a, b) => TXM.fabricTexture(128, [a, b]);
  const TX_gray = (a, b, c, d) => TXM.grayNoiseTexture(128, [a, b], c, d);
  const TX_nrm = (a, b, c, d) => TXM.normalFromNoise(128, [a, b], c, d);
  const TX_conc = (a, b) => TXM.concreteTexture(128, [a, b]);

  ok('buildWorld + buildFurniture + buildProps', () => {
    const M = makeMaterials({ textures: {} }, procedural);
    const world = buildWorld(M, sunDirection(33, 42, 12));
    const furn = buildFurniture(M);
    const props = buildProps(M, {});
    const n = [world.root, furn.root, props.root].reduce((s, r) => {
      let k = 0; r.traverse(() => k++); return s + k;
    }, 0);
    if (n < 100) throw new Error('オブジェクト数が少なすぎる: ' + n);
  });

  ok('全時間帯のスカイドームを作り直しても落ちない', () => {
    const M = makeMaterials({ textures: {} }, procedural);
    const world = buildWorld(M, sunDirection(33, 42, 12));
    TIMES.forEach((T) => {
      const d = sunDirection(T.sun.elev, T.sun.azi, 1).normalize();
      world.outdoors.skyMat.map = TXM.skyTexture(T.sky, d, 96, 384);
    });
    void THREE;
  });
}

console.log(failed === 0 ? '\nCANVAS REGRESSION OK' : `\n!! ${failed} 件失敗`);
process.exitCode = failed === 0 ? 0 : 1;
