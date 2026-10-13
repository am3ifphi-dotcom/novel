#!/usr/bin/env node
/**
 * fetch-assets.mjs — Poly Haven (CC0) テクスチャを取得して軽量化し assets/ に配置する。
 *
 * このサンドボックスからは dl.polyhaven.org / raw.githubusercontent.com に直接到達できないため、
 * GitHub Contents API (api.github.com) 経由で CC0 ミラーから取得している。
 * 取得後は sharp で縮小・WebP 再圧縮し、アプリ同梱用の軽量版を作る。
 *
 * 使い方:  node tools/fetch-assets.mjs
 * 出力:    assets/textures/<group>/<map>.webp  +  assets/assets-manifest.json
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, statSync, readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const CACHE = path.join(ROOT, 'tools', '.cache');
const OUT = path.join(ROOT, 'assets', 'textures');

/** Poly Haven テクスチャ定義。src は CC0 ミラー (GitHub) */
const TEXTURES = [
  {
    group: 'floor_wood', asset: 'wood_floor_deck',
    src: 'alexbieber/GTA-mini', dir: 'assets/pbr/wood_floor_deck',
    maps: { diff: { size: 1024, q: 78 }, nor: { size: 1024, q: 80 }, rough: { size: 512, q: 78 } },
  },
  {
    group: 'wall_plaster', asset: 'painted_plaster_wall',
    src: 'alexbieber/GTA-mini', dir: 'assets/pbr/painted_plaster_wall',
    maps: { diff: { size: 1024, q: 78 }, nor: { size: 1024, q: 80 }, rough: { size: 512, q: 78 } },
  },
  {
    group: 'ceiling', asset: 'beige_wall_001',
    src: 'alexbieber/GTA-mini', dir: 'assets/pbr/beige_wall_001',
    maps: { diff: { size: 512, q: 76 }, rough: { size: 256, q: 76 } },
  },
  {
    group: 'metal_plate', asset: 'metal_plate',
    src: 'alexbieber/GTA-mini', dir: 'assets/pbr/metal_plate',
    maps: { diff: { size: 512, q: 78 }, nor: { size: 512, q: 80 }, rough: { size: 256, q: 78 } },
  },
  {
    group: 'metal_rust', asset: 'green_metal_rust',
    src: 'alexbieber/GTA-mini', dir: 'assets/pbr/green_metal_rust',
    maps: { diff: { size: 512, q: 78 }, rough: { size: 256, q: 76 } },
  },
  {
    group: 'wood_oak', asset: 'oak_veneer_01',
    src: 'dyeoh/furniture_placement_simulator', dir: 'game/assets/textures/oak_veneer_01',
    maps: { diff: { size: 1024, q: 78 }, nor: { size: 512, q: 80 }, rough: { size: 256, q: 76 } },
  },
  {
    group: 'concrete', asset: 'cracked_concrete_wall',
    src: 'alexbieber/GTA-mini', dir: 'assets/pbr/cracked_concrete_wall',
    maps: { diff: { size: 512, q: 76 }, rough: { size: 256, q: 76 } },
  },
];

/** gh api の生出力をファイルへ (execFileSync + maxBuffer) */
function ghDownload(repo, filePath, dest) {
  if (existsSync(dest) && statSync(dest).size > 2048) return dest;
  mkdirSync(path.dirname(dest), { recursive: true });
  const buf = execFileSync('gh', ['api', '-H', 'Accept: application/vnd.github.raw+json',
    `repos/${repo}/contents/${filePath}`], { maxBuffer: 1 << 28 });
  writeFileSync(dest, buf);
  return dest;
}

const manifest = { generatedAt: new Date().toISOString(), source: 'Poly Haven (CC0 1.0)', groups: {} };

for (const tex of TEXTURES) {
  manifest.groups[tex.group] = { asset: tex.asset, url: `https://polyhaven.com/a/${tex.asset}`, license: 'CC0 1.0', via: `${tex.src}/${tex.dir}`, maps: {} };
  for (const [map, opt] of Object.entries(tex.maps)) {
    const srcName = map === 'diff' ? 'diff' : map === 'nor' ? 'nor' : 'rough';
    const candidates = [
      `${tex.asset}_${srcName}_1k.jpg`,
      `${tex.asset}_${srcName}_2k.jpg`,
      `${tex.asset}_${srcName}_1k.png`,
    ];
    let rawBuf = null, usedName = null;
    for (const cand of candidates) {
      const cachePath = path.join(CACHE, tex.asset, cand);
      try {
        ghDownload(tex.src, `${tex.dir}/${cand}`, cachePath);
        const st = statSync(cachePath);
        if (st.size > 2048) { rawBuf = readFileSync(cachePath); usedName = cand; break; }
      } catch (err) { /* 404 等はスキップして次候補へ */ }
    }
    if (!rawBuf) { console.warn(`  ! skip (not found): ${tex.asset} ${map}`); continue; }
    const dstDir = path.join(OUT, tex.group);
    mkdirSync(dstDir, { recursive: true });
    const dst = path.join(dstDir, `${map}.webp`);
    const info = await sharp(rawBuf)
      .resize(opt.size, opt.size, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: opt.q })
      .toFile(dst);
    manifest.groups[tex.group].maps[map] = {
      file: `textures/${tex.group}/${map}.webp`, px: `${info.width}x${info.height}`,
      bytes: info.size, src: `${usedName} @${tex.src}`,
    };
    console.log(`${tex.group}/${map}.webp  ${info.width}x${info.height}  ${(info.size / 1024).toFixed(1)}KB`);
  }
}

writeFileSync(path.join(ROOT, 'assets', 'assets-manifest.json'), JSON.stringify(manifest, null, 2));
const total = Object.values(manifest.groups).flatMap(g => Object.values(g.maps)).reduce((a, m) => a + m.bytes, 0);
console.log(`\n合計 ${(total / 1024 / 1024).toFixed(2)} MB -> assets/textures/`);
