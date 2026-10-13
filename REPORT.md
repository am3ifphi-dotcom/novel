# アセットレポート —『偏差値60の教室から✝本質✝が漏れ出している件について』3D教室

最終更新: 2026-10-13 / 実装: `index.html` + `src/*.js` / 解析: `SCENE_SPEC.md`

---

## 1. サマリ

| 項目 | 値 |
|---|---|
| 初回ダウンロード（同梱ぶんの合計） | **2.63 MB**（three.js + addons 1,005 KB / テクスチャ 723 KB / HDRI 706 KB / GLB 90 KB / HTML + 自作JS 166 KB） |
| 取得元の生サイズ（最適化前） | 20.7 MB（テクスチャ 12.2 MB ＋ 水筒 GLB 8.55 MB） |
| 削減率 | テクスチャ **94% 減**（12.2 MB → 723 KB）／ GLB **99.0% 減**（8.55 MB → 90 KB） |
| 代替（プロシージャル）へ切り替えた項目 | **0 件**（全アセット取得成功）※全アセットに代替経路を実装済み |
| 同梱ファイル数（assets/） | 32 |
| 外部CDN依存 | **なし**（three.js は `assets/vendor/` に同梱。CDN はローカル欠落時の保険のみ） |

> 補足: このサンドボックスから `dl.polyhaven.org` / `raw.githubusercontent.com` へは直接到達できない（TLS で遮断）。
> そのため **Poly Haven の CC0 ファイルを GitHub ミラー（`api.github.com` 経由）から取得**し、
> 実装側は「**実行時に Poly Haven の API / dl URL を叩ける**」コードパスも保持している（§5）。

---

## 2. 採用アセット一覧

### 2.1 テクスチャ（Poly Haven / CC0 1.0）

ミラーは 1k（1024px）を収録。Poly Haven 本家は最大 8k まで提供だが、教室用途では 1k で十分（法線・粗さは更に縮小）。

| 用途 | Poly Haven ID | 元ファイル | 同梱ファイル（WebP） | 元サイズ | 同梱サイズ | 取得元（ミラー） |
|---|---|---|---|---|---|---|
| 床（木床） | `wood_floor_deck` | diff / nor / rough 1k | `textures/floor_wood/{diff,nor,rough}.webp` 1024/1024/512 | 2,249 KB | **241 KB** | `alexbieber/GTA-mini` `assets/pbr/wood_floor_deck` |
| 壁（漆喰） | `painted_plaster_wall` | diff / nor / rough 1k | `textures/wall_plaster/*` 1024/1024/512 | 1,942 KB | **272 KB** | 同上 |
| 天井（ベージュ） | `beige_wall_001` | diff / rough 1k | `textures/ceiling/*` 512/256 | 180 KB | **1.4 KB** | 同上 |
| 金属（縞鋼板） | `metal_plate` | diff / nor / rough 1k | `textures/metal_plate/*` 512/512/256 | 2,238 KB | **67 KB** | 同上 |
| 古い金属（緑錆） | `green_metal_rust` | diff / rough 1k | `textures/metal_rust/*` 512/256 | 329 KB | **5.6 KB** | 同上 |
| 机の木目（オーク） | `oak_veneer_01` | diff / nor_gl / rough 1k | `textures/wood_oak/{diff,rough}.webp` 1024/256 ※nor は 404 のため無し | 1,472 KB | **86 KB** | `dyeoh/furniture_placement_simulator` `game/assets/textures/oak_veneer_01` |
| 外壁（ひび割れコンクリ） | `cracked_concrete_wall` | diff / rough 1k | `textures/concrete/*` 512/256 | 1,625 KB | **66 KB** | `alexbieber/GTA-mini` |

ライセンス: **CC0 1.0（パブリックドメイン）**。ミラー側の `assets/pbr/LICENSE.txt` に
「Photoscanned textures and HDRIs from Poly Haven — License: CC0 1.0」と明記されていることを確認済み。
Poly Haven のアセットページ: `https://polyhaven.com/a/wood_floor_deck` など（ID から直引き）。

### 2.2 HDRI（環境光専用 / scene.environment のみ。背景には描画しない）

| 使用場面 | 同梱ファイル | 解像度 | サイズ | 出典 |
|---|---|---|---|---|
| 四月・朝のHR | `assets/hdri/dawn.exr` | 512 × 256 (Equirectangular, DWAB) | 178 KB | Poly Haven 由来（`@pmndrs/assets` v1.7.0 の最適化版。原版より約 7 倍小さい） |
| 火曜三限・窓の外 | `assets/hdri/sky.exr` | 512 × 256 | 105 KB | 同上 |
| 昼休み | `assets/hdri/venice.exr` | 512 × 256 | 180 KB | 同上 |
| 金曜五限・放課後 | `assets/hdri/sunset.exr` | 512 × 256 | 145 KB | 同上 |
| 廊下 | `assets/hdri/apartment.exr` | 512 × 256 | 98 KB | 同上 |

* three r170 の `EXRLoader` が DWAB 圧縮に対応していることを確認して採用（`assets/vendor/addons/loaders/EXRLoader.js`）。
* 環境光の強さは `scene.environmentIntensity = 0.62`（要求仕様の 0.4〜0.8 の範囲）。

### 2.3 モデル（Khronos glTF-Sample-Assets）

| 用途 | モデル | 元サイズ | 同梱サイズ | 最適化 | 出典 |
|---|---|---|---|---|---|
| 三重の机の水筒（自販機のミネラルウォーター） | `WaterBottle` | 8,966,700 B (8.55 MB) | **92,308 B** | `gltf-transform optimize --compress quantize --texture-compress webp --texture-size 512 --simplify-error 0.0005` | `KhronosGroup/glTF-Sample-Assets/Models/WaterBottle/glTF-Binary/WaterBottle.glb` |

### 2.4 ライブラリ（同梱 = オフラインでも動作）

| ファイル | サイズ | ライセンス |
|---|---|---|
| `assets/vendor/three.module.js` | 691,648 B | MIT（`three-LICENSE.txt` 同梱） |
| `addons/loaders/GLTFLoader.js` | 110,273 B | MIT |
| `addons/loaders/EXRLoader.js` | 61,180 B | MIT |
| `addons/loaders/RGBELoader.js` | 11,377 B | MIT |
| `addons/controls/OrbitControls.js` | 32,134 B | MIT |
| `addons/utils/BufferGeometryUtils.js` | 31,768 B | MIT |
| `addons/libs/fflate.module.js` | 89,384 B | MIT（EXRLoader の依存） |

---

## 3. 代替（プロシージャル）機構 — 全アセットに用意

「どの外部アセットが取得失敗しても白画面・クラッシュしない」ための実装。失敗時は `console.warn('【代替】…')` を残して続行する。

| アセット | 失敗したときの挙動 | 実装 |
|---|---|---|
| テクスチャ（7種×最大3枚） | そのマテリアルだけプロシージャル生成（木床／漆喰／天井／オーク／縞鋼板／緑錆／コンクリート）へ切替 | `src/procedural.js` `FALLBACK_TEXTURES` ↔ `src/assets.js` `loadTextureGroup()` |
| HDRI（5本） | 手続き的な空グラデーション（等間隔マップ）を `PMREMGenerator` で環境光に変換 | `src/lighting.js` `apply()`（`envTexture ?? this._skyTex.clone()`） |
| 水筒 GLB | 円柱＋口＋リングのプロシージャル水筒（`bottleParts()`）に自動で戻す | `src/scene.js` `applyBottleModel()` が false を返す経路 |
| three.js 本体（vendor） | importmap を動的生成し CDN（unpkg）へフォールバック。両方失敗時は起動エラー画面を表示 | `index.html` の importmap ブートストラップ |
| キャンバス（板書・掲示物・自販機・端末画面・地形図） | **すべて実行時生成**なので失敗要因が無い（外部フォントも使わず OS 内蔵フォントへフォールバック） | `src/procedural.js` |
| WebGL コンテキストロスト | 復帰を試み、失敗しても他のUIは生きる | `src/main.js` `webglcontextlost/restored` |
| 想定外の例外 | 起動前＝エラー画面／起動後＝トーストで通知して続行（`window.__novelReady` で切替） | `src/main.js` の error / unhandledrejection |

### 採用を見送った候補（スキップした項目）

| 候補 | 見送り理由 |
|---|---|
| `StainedGlassLamp.glb` | リポジトリに存在しない（404／候補リストの誤り） |
| `Lantern.glb` 9.56 MB / `AntiqueCamera.glb` 17.5 MB / `ABeautifulGame.glb` 43.0 MB / `ToyCar.glb` 5.4 MB | 教室（現代日本の高校）に合わない、または最適化後も重い。原作に該当する小物が無い |
| Poly Haven 家具モデル（`ArmChair_01` 5,626tri / `ClassicNightstand_01` 2,002tri / `GothicCabinet_01` 12,170tri 等） | CC0 で軽量だが**ゴシック／ヴィクトリア調**で教室に不整合（原作は「やや狭い北棟の教室」）。机・椅子は InstancedMesh のプロシージャル造形を採用 |
| `laminate_floor_02`（dyeoh ミラー） | 法線・粗さマップがほぼ平坦（stdev 1〜3）で品質不足 → 木床 `wood_floor_deck` に一本化 |
| `plaster_grey_04` | `painted_plaster_wall` と用途が重複し、差が無い |
| Poly Haven 本家の 2k/4k テクスチャ | 1k（法線・粗さは 512/256）で十分な見え方。通信量を優先 |

---

## 4. 推定総ダウンロード量

| ケース | 通信量 | 内訳 |
|---|---|---|
| **既定（オフラインでも同一）** | **約 2.63 MB** | HTML+JS 166 KB / three+addons 1,005 KB / テクスチャ 723 KB / HDRI 706 KB / GLB 90 KB |
| オンライン上位HDRI を有効化（`allowRemoteHdri: true`） | 約 4.05 MB（+1.42 MB） | Poly Haven `kloppenheim_06_1k.hdr` = 1,485,234 B（`https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloppenheim_06_1k.hdr`） |
| 最適化しなかった場合（参考） | 約 20.7 MB | テクスチャ 12.2 MB ＋ 水筒 GLB 8.55 MB |

キャッシュ後の再訪時は約 0.3 MB（HTML/JS のみ、`assets/` はブラウザキャッシュ）。

---

## 5. Poly Haven API の扱い（実装メモ）

* カタログ取得: `GET https://api.polyhaven.com/assets?type=textures|hdris|models`（実務では `categories=` / `tags` で絞る）
* 実URL解決: `GET https://api.polyhaven.com/files/{asset_id}` → `dl.polyhaven.org` の URL（1k/2k/4k）
* 実装は **ローカル EXR →（任意で）Poly Haven の 1k HDR → 手続き的な空** の三段構え。
  `src/main.js` の `allowRemoteHdri` を `true` にすると 2 段目が有効になる（CORS 等で失敗しても 3 段目に落ちるので止まらない）。
* このサンドボックスからの直取得は不可（§1 の補足）だったため、**同梱ファイルは CC0 ミラー経由**で用意した。

---

## 6. 性能設計（統合GPUで 60fps を狙う）

| 施策 | 内容 |
|---|---|
| 机・椅子 | `InstancedMesh` ×4（机=木/金属、椅子=木/金属）。30席（最大40席）で **4 ドローコール**、マテリアルは全席共有 |
| ロッカー | `InstancedMesh` ×2（本体・錆）で 5 台 |
| ✝本質✝の26個の✝ | `Points` で **1 ドローコール**（スプライトを並べない） |
| 埃・桜 | `Points` 各 1 ドローコール |
| 送電線 | `LineSegments` 1 ドローコール（14分割のカテナリ×6本×2スパン） |
| 影 | `renderer.shadowMap.autoUpdate = false`、変化時のみ `needsUpdate`（`shadow.mapSize = 2048`、影カメラは教室±12.5m に固定） |
| ポストプロセス | **不使用**。`ACESFilmicToneMapping` ＋ 露出（0.98〜1.12）＋ `FogExp2` で空気を作る |
| テクスチャ | 合計 17 枚（最大 1024px）。`anisotropy` は実行時に最大値へ |
| ピクセル比 | `min(devicePixelRatio, 2)`、軽量モードは 1 |
| 三角形 | 教室の殻 約 2.5k、屋外・廊下込みでも 20k 前後（机椅子はインスタンス） |
| 品質切替 | 高/中/低（影 2048/1536/1024、埃 260/170/80、光の筋 ON/OFF）。`?quality=low` でも起動可 |

---

## 7. 検証結果（ブラウザ無しで可能な範囲を自動化）

| テスト | 内容 | 結果 |
|---|---|---|
| `node tools/test-scene.mjs` | 教室・廊下・屋外ジオメトリの寸法と NaN、座席30/40の干渉、太陽と色温度、7場面プリセットと板書データの整合、アセット実在、three の import 名が実在すること、全モジュールの読み込み | **116 件成功 / 0 失敗** |
| `node tools/test-dom.mjs` | 最小 DOM シムで実際に `Classroom.build()` を実行。板書に原作語（四月／味噌が違う／河岸段丘／期末考査まで）が描かれたことを記録から確認、7場面の適用、40人切替、✝本質✝切替（掲示板の怪文書）、ライティングのリグ・埃・蛍光灯・赤いリムライト、毎フレーム更新の安定性 | **47 件成功 / 0 失敗** |
| HTTP 配信 | `python3 -m http.server 8080` で `index.html` / `src/*` / vendor / テクスチャ / HDRI / GLB がすべて **200** | 確認済み |

※ ヘッドレスブラウザ（chromium / playwright）はこのサンドボックスに無く、`apt` も権限が無いため導入できない。
そのため **実機での目視確認は未実施**。上記2つのテストが「例外が出ないこと」「原作由来の内容がキャンバスに描かれていること」を保証し、
見た目（露出・色温度・構図）は `SCENE_SPEC.md` の数値設計に基づいて調整している。

---

## 8. 再生成手順（アセットを取り直す場合）

```bash
cd tools && npm install                 # three@0.170.0 / gltf-transform / sharp
node fetch-assets.mjs                   # Poly Haven CC0 テクスチャを取得 → sharp で WebP 化
npx gltf-transform optimize /path/to/WaterBottle.glb ../assets/models/water_bottle.glb \
  --compress quantize --texture-compress webp --texture-size 512 --simplify-error 0.0005
cd .. && node tools/test-scene.mjs && node tools/test-dom.mjs
```

HDRI は `@pmndrs/assets`（`npm pack @pmndrs/assets`）の `hdri/*.exr.js` から base64 を展開して `assets/hdri/` に置く。
