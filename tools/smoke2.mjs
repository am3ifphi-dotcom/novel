/**
 * tools/smoke2.mjs — lighting.js まで含めたスモークテスト（開発用）
 *   node tools/smoke2.mjs
 * 一時ディレクトリに src/ をコピーし、'three' をスタブへ差し替えて実行する。
 */
import { mkdirSync, readdirSync, copyFileSync, writeFileSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const work = path.join(here, '.tmp');
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

const shim = path.join(here, 'three-shim.mjs').replace(/\\/g, '/');
const threeRoot = path.join(here, '..', 'node_modules', 'three').replace(/\\/g, '/');

const srcDir = path.join(here, '..', 'src');
for (const f of readdirSync(srcDir)) {
  if (!f.endsWith('.js')) continue;
  let s = path.join(srcDir, f) && (await import('fs')).readFileSync(path.join(srcDir, f), 'utf8');
  s = s.replace(/from ['"]three['"]/g, `from '${shim}'`);
  s = s.replace(/from ['"]three\/addons\//g, `from '${threeRoot}/examples/jsm/`);
  writeFileSync(path.join(work, f), s);
}

/* ---- DOM / Canvas（厳格モック：canvas-mock.mjs に一本化） ---- */
import { installDom } from './canvas-mock.mjs';
installDom();

/* ---- 実行 ---- */
const THREE = await import(shim);
const TX = await import(path.join(work, 'textures.js'));
const { buildWorld } = await import(path.join(work, 'world.js'));
const { buildFurniture } = await import(path.join(work, 'furniture.js'));
const { buildProps } = await import(path.join(work, 'props.js'));
const { makeMaterials } = await import(path.join(work, 'assets.js'));
const { createLighting } = await import(path.join(work, 'lighting.js'));
const { sunDirection } = await import(path.join(work, 'util.js'));
const { TIMES } = await import(path.join(work, 'spec.js'));

const procedural = {
  woodFloor: (rx, ry) => TX.woodFloorTexture(512, [rx, ry]),
  plaster: (rx, ry) => TX.plasterTexture(512, [rx, ry]),
  ceilingTex: (rx, ry) => TX.ceilingTexture(512, [rx, ry]),
  wood: (rx, ry) => TX.woodTexture(512, [rx, ry]),
  metal: (rx, ry) => TX.metalTexture(256, [rx, ry]),
  fabric: (rx, ry) => TX.fabricTexture(256, [rx, ry]),
  grayNoise: (rx, ry, b, c) => TX.grayNoiseTexture(256, [rx, ry], b, c),
  normalNoise: (rx, ry, s, d) => TX.normalFromNoise(256, [rx, ry], s, d),
  concrete: (rx, ry) => TX.concreteTexture(256, [rx, ry]),
};
const M = makeMaterials({ textures: {} }, procedural);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1.6, 0.05, 400);
const renderer = { toneMappingExposure: 1, shadowMap: { needsUpdate: false } };

const T0 = TIMES[0];
const world = buildWorld(M, sunDirection(T0.sun.elev, T0.sun.azi, 12));
scene.add(world.root);
scene.add(buildFurniture(M).root);
scene.add(buildProps(M, {}).root);

const lighting = createLighting(scene, renderer, world, null);
console.log('createLighting: OK (env=' + (scene.environment ? 'procedural-stub' : 'none') + ')');

for (const T of TIMES) {
  lighting.applyTime(T);
  lighting.update(1.23, camera);
  lighting.tick(renderer);
  console.log(
    `  ${T.id.padEnd(6)} sun=(${lighting.sun.position.x.toFixed(1)},${lighting.sun.position.y.toFixed(1)},${lighting.sun.position.z.toFixed(1)})` +
    ` I=${T.sunIntensity} exp=${renderer.toneMappingExposure.toFixed(2)}` +
    ` fog=${T.fogDensity} shaft=${lighting.shaftMat.opacity.toFixed(3)} night=${lighting.nightFactor.toFixed(2)}`
  );
}

// 光の筋の向きが、実際に窓（+X）から部屋（-X）へ向いているか検証
const T1 = TIMES.find((t) => t.id === 'fri5');
lighting.applyTime(T1);
camera.position.set(1.55, 1.3, 2.45);
lighting.update(0, camera);
const s0 = lighting.shafts[0];
const axis = s0.axis.clone();
console.log(`beam axis = (${axis.x.toFixed(2)}, ${axis.y.toFixed(2)}, ${axis.z.toFixed(2)}) — x<0 なら窓から室内へ`);
if (axis.x >= 0) { console.error('!! 光の筋が窓から室内に向いていません'); process.exitCode = 1; }
if (axis.y >= 0) { console.error('!! 光の筋が上向きです'); process.exitCode = 1; }

console.log('SMOKE2 OK');
