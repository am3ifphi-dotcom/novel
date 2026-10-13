# 桐葉高校 北棟2階 理数科B組 ─ 3D Web シーン 実装レポート

`gensaku.txt` ＝『偏差値60の教室から✝本質✝が漏れ出している件について』の世界観を、
three.js r170 でインタラクティブ3D教室として実装したものです。

- 公開物: `index.html` / `styles.css` / `src/*.js`（静的ファイルのみ。ビルド不要）
- 開発用検証: `tools/*.mjs`（`npm i` → `npm run smoke`）

---

## 1. SCENE_SPEC（原作解析）

| 項目 | 判定 | 根拠（gensaku.txt） |
|---|---|---|
| 作品タイトル | **偏差値60の教室から✝本質✝が漏れ出している件について** | 1行目 |
| 時代／地域 | 現代日本・地方の進学校 | スマホ／匿名掲示板／YouTube配信が日常にある（L72, L43, L68） |
| 舞台 | **桐葉高校 北棟2階 理数科B組**（偏差値60／ネクタイえんじ／「教室はやや狭い」） | L15, L27, L1346 |
| 主時間帯 | **金曜五限＝午後〜夕** | 「教室の空気は死んでいる。窓際は午後の日差しで焼かれ、廊下側はモップの匂いが微かに漂う。」L260 |
| サブ時間帯 | 火曜三限（午前・地理「味噌」）／放課後（零が黒板で数学）／夜（「夜道に出ろ」） | L85, L767, L191 |
| 季節／天気 | **6月**（梅雨前）／快晴〜薄曇り | 「六月。」L1951／「雨の前の匂いを知っている人間は…」L209 |
| 黒板の板書 | 「**味噌**」→ **河岸段丘の断面図**（上から＝今→過去へ描く）→ 零の数式 | L100, L270, L768 |
| 固有小道具 | エアコンの室外機（窓の真横）／電線／コーンスープの**無い**自販機／天文学の本／スマホ／忘れた充電器／机の引き出しの紙束**21枚**／モップ／紺とえんじのネクタイ | L15, L45, L742, L367, L17 |
| トーン | 日常×青春。乾いたユーモア＋静かな余韻 | 全体 |
| 演出方針 | **キャラクターは作らない。引かれた椅子・置き忘れた物・開いた棚で「人の気配」だけを置く** | 指示事項 |

### 寸法と配置（原文から推定）

- 教室: 7.2m（廊下側 −3.6 → 窓側 +3.6）× 8.6m（黒板 −4.3 → 掲示板 +4.3）× 天井高 2.9m ＝「やや狭い」
- 机・椅子: 6列 × 5行 ＝ **30**（学級は32人＝「三十二人のうち十一人は身内だ」L4003）
- 窓: 5枚（腰高 0.85m〜2.35m）。**北棟2階**なので窓の外の地面は 4.2m 下
- 席: 砂糖＝窓際最後列（L1279「砂糖が窓際の最後列に移った」）／倉石＝窓際（L1328）／寺地＝紙束の机

---

## 2. 採用アセット一覧

### 2.1 Poly Haven（テクスチャ）

カタログ解決: `GET https://api.polyhaven.com/files/{asset_id}`
→ レスポンス内の実 URL（`dl.polyhaven.org`）を使用。解像度は **1k 固定**（軽量化）。

| スロット | 用途 | 候補 asset_id（先頭から順に解決） | マップ | 解像度 |
|---|---|---|---|---|
| `floor` | 床（木床） | `wood_floor_deck`, `oak_veneer_01`, `wood_table_001`, `parquet_wood_001`, `teak_wood_002`, `concrete_floor_worn_001` | diffuse / nor_gl / **arm**（rough+ao 兼用） | 1k jpg |
| `wall` | 壁（プラスター） | `plaster_wall_001`, `dirty_plaster`, `concrete_wall_008`, `painted_concrete_01`, `rough_concrete_02`, `concrete_floor_worn_001` | diffuse / nor_gl / arm | 1k jpg |
| `wood` | 机・椅子・棚の木部 | `wood_table_001`, `oak_veneer_01`, `wood_floor_deck`, `plywood_wood_001`, `mahogany_wood` | diffuse / nor_gl / arm | 1k jpg |
| `metal` | 椅子脚・窓枠 | `metal_plate`, `brushed_metal_001`, `rusty_metal_02`, `green_metal_rust`, `scratched_metal_01` | diffuse / nor_gl / arm | 1k jpg |

URL パターン（API が不通のときの推定直リンク）:
`https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/{id}/{id}_{diff|nor_gl|rough|ao}_1k.jpg`

### 2.2 Poly Haven（HDRI）

`scene.environment` 専用。**背景には描かない**（背景はプロシージャルのスカイドーム）。

| 用途 | 候補 asset_id | 解像度 / 形式 |
|---|---|---|
| 環境マップ（1枚） | `kloofendal_48d_partly_cloudy_puresky`, `kloppenheim_06`, `kloofendal_43d_clear_puresky`, `spruit_sunrise`, `sunflowers_puresky`, `venice_sunset` | **1k / .hdr** |

URL パターン: `https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/{id}_1k.hdr`

`envMapIntensity` は 0.40〜0.80、`scene.environmentIntensity` は 0.22〜0.75（時間帯で変化）。

### 2.3 Poly Haven（家具モデル）

→ **不採用**。候補（`bunk_bed` / `office_chair` / `armchair` / `grand_piano` / `decorative_plant`）は
いずれも原作の教室に置く理由がなく、glTF + .bin + 複数テクスチャで数 MB〜数十 MB になるため、
`Box` / `Cylinder` のプロシージャル造形で代替しました（机・椅子・棚・教卓・自販機・室外機・電柱）。

### 2.4 Khronos glTF-Sample-Assets（机上・部屋の小物）

直リンク: `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/{Name}/glTF-Binary/{Name}.glb`

| モデル | 原作との対応 | 概算サイズ | 容量上限 |
|---|---|---|---|
| `WaterBottle` | 水筒／ペットボトル。「自販機にミネラルウォーターとカフェオレがある」——北棟には、ない | ≈ 1.3 MB | 4 MB |
| `AntiqueCamera` | 寺地の**配信カメラ**（『星と地面とせいちちゃんねる』） | ≈ 6.5 MB | 8 MB |
| ~~`ABeautifulGame`~~ | ~~棋類（理数科の棚）~~ | ≈ 14 MB | **不採用**（重い・物語への寄与が小さい） |
| ~~`Lantern`~~ | ~~灯火（夜道に出ろ）~~ | ≈ 3.5 MB | **不採用**（教室に置く理由が薄い） |

実行時に `HEAD` で `content-length` を確認し、上限超過は**読み飛ばしてプロシージャル代替**します。

---

## 3. 推定総ダウンロード量

> **注記**: 開発サンドボックスは `registry.npmjs.org` 等のみ外向き通信が許可されており、
> `api.polyhaven.com` / `dl.polyhaven.org` / `raw.githubusercontent.com` へは到達できません。
> したがって下表は**一般的な Poly Haven 1k アセットの実測レンジに基づく推定値**です。
> 実測値は実行時にブラウザが解決し、画面右下 **「採用アセット一覧」** ボタン（および
> `console.info('[assets] …')`）で確認できます。

| 内訳 | 概算 | 備考 |
|---|---|---|
| テクスチャ 4スロット × 3枚（diffuse / nor_gl / arm） | **≈ 8〜11 MB** | 1k jpg。1枚 0.7〜1.1 MB 程度 |
| HDRI 1k .hdr × 1 | **≈ 2.0 MB** | RGBE・非圧縮 |
| glTF（WaterBottle + AntiqueCamera） | **≈ 1.3〜7.8 MB** | 上限超過時は 0 |
| three.js r170（CDN・モジュール） | ≈ 1.3 MB | jsdelivr → unpkg の順に到達確認 |
| **合計（three.js 除く）** | **≈ 11〜21 MB** | 上限 16 MB で自動クランプ |
| プロシージャル生成分 | **0 B** | 黒板・掲示板・時計・自販機・紙・本・ノート・地形図は全て Canvas 2D 生成 |

**軽量化のために効いている施策**

1. `arm` 1枚で `roughnessMap`(.g) と `aoMap`(.r) を兼用 → マップ枚数 4→3（`THREE.Cache.enabled` で同一 URL の二重取得も防止）
2. 解像度を **1k に固定**（`maxRes: 1`）
3. 天井（吸音ボード）と布（カーテン・座面）は低頻度面なので**実写テクスチャを諦めてプロシージャル固定**
4. 総転送量バジェット **16 MB**。超えたら HDRI → glTF の順に取得を打ち切り、プロシージャルへ
5. glTF は `HEAD` で容量確認してから取得（8 MB 超は不採用）
6. ロード画面の「取得を待たずに開始する」ボタン（9秒後に出現）で全外部取得を `AbortController` で中断可能

---

## 4. 障害耐性（最重要ルール3）

外部アセットは**3段構え**で、どの段階で失敗しても例外を外に出さず `console` に記録して続行します。

```
① Poly Haven API で実 URL 解決        GET https://api.polyhaven.com/files/{id}
      ↓ 失敗（CORS / オフライン / 404）
② 既定パターンの直リンクを推定         dl.polyhaven.org/file/ph-assets/…
      ↓ 失敗
③ プロシージャル（Canvas 2D 生成）      src/textures.js ／ src/boards.js
```

- `scene.environment` も同様。HDRI が全滅した場合は `PMREMGenerator.fromScene()` で
  グラデーション天球＋地面＋疑似太陽の環境マップを生成します（`lighting.js`）。
- glTF は 404／容量超過／9秒タイムアウトで「その小道具が無いだけ」になります（水筒はペットボトルに、カメラはスマホ三脚に差し替え）。
- さらに three.js 本体も **jsdelivr → unpkg** の順に到達確認して importmap を動的生成。
  25秒経っても起動しなければ白画面ではなく予備画面を出し、WebGL 初期化失敗・コンテキストロスト・
  `window.onerror` / `unhandledrejection` も同様に可視化します。
- **全外部アセットが取れなくても、教室は完成します。** 質感は全てプロシージャルで担保済みです。

---

## 5. 実装仕様

| 項目 | 内容 |
|---|---|
| three.js | **0.170.0**（importmap で `three` と `three/addons/`。`GLTFLoader` / `RGBELoader` / `OrbitControls` / `BufferGeometryUtils`） |
| renderer | `outputColorSpace = SRGBColorSpace`、`toneMapping = ACESFilmicToneMapping`、`pixelRatio = min(dpr, 2)`、`shadowMap = PCFSoftShadowMap` |
| 影 | `shadowMap.autoUpdate = false`。初回と、時間帯・ライト切り替え時のみ1フレーム更新。mapSize 2048、影カメラは教室にぴったり（±7.0m） |
| 机・椅子 | `InstancedMesh`（1ジオメトリ × N）。机 木部/金属、椅子 座面/脚 ＝ **計4本のドローコール**で30脚ぶん。`instanceMatrix` は `StaticDrawUsage` |
| ポストプロセス | **不使用**。ACESFilmic + `FogExp2` + ライトのみで雰囲気を作る |
| ローディング | 進捗バー（原作トーンのダークUI）。取得中のアセット名を日本語表示 |
| UI | 左下＝移動モード2種＋視点プリセット6種、右下＝時間帯4種／黒板3種／ギミック5種＋レポート |
| 一人称モード | `src/nav.js`。WASD／矢印＝歩く、マウス＝見回す（Pointer Lock）、Shift＝小走り、C＝しゃがむ、E＝調べる。目の高さ 1.62m／しゃがみ 1.04m |
| 文字もの | 黒板・掲示板・時間割・時計・自販機面板・スマホ画面・ノート・本・紙21枚・室名札 ＝ すべて `CanvasTexture` 動的生成（日本語フォントスタック） |

### 一人称（歩行）モード

「眺める」ではなく「中を歩く」ためのモードで、起動時の既定です。

| 項目 | 内容 |
|---|---|
| 移動 | WASD／矢印キー。歩行 1.45 m/s、小走り（Shift）2.60 m/s、しゃがみ（C）0.75 m/s。加減速は指数追従で急停止しない |
| 視線 | Pointer Lock。使えない環境では**ドラッグ**にフォールバック（最重要ルール3）。タッチ端末は画面ドラッグ＋移動スティック |
| 目の高さ | 立ち 1.62m ／ しゃがみ 1.04m（机 0.72m・天井 2.90m のあいだ） |
| 歩行感 | 速度に比例した上下動とわずかなロール（振幅 14mm 程度） |
| 当たり判定 | 円（半径 0.19m）と AABB。**X と Z を分離して押し出す**ので壁ずりが自然に効く |
| 判定の元 | 机＝`InstancedMesh` の各インスタンス行列から実寸で自動生成（29＋英雄机）。教卓・棚・自販機＝`Box3.setFromObject`。壁＝教室4面＋廊下（扉の開口をくり抜く） |
| 椅子 | 軽いので**押しのける想定で当たらない**。机の列の間（0.43m）を抜けられる寸法にしてある |
| 廊下 | 黒板わきの前扉（−28° 開いている）を通って廊下へ出られ、自販機の前まで歩ける |
| 調べる | 照準を合わせると名前が出て、`E` またはクリックで引用カード。俯瞰モード従来どおりのマウスホバーでも調べられる |

### 3点セットのライティング

1. **DirectionalLight（太陽）** — 窓（+X）から差す。時間帯で仰角・方位角・色温度を変更
   - 火曜三限 10:50 … 仰角54°／方位 −34°／`0xfff3e0`／3.1
   - 金曜五限 14:50 … 仰角33°／方位 +42°／`0xffd9a8`／3.6
   - 放課後 16:30 … 仰角 9°／方位 +68°／`0xff9d55`／3.2
   - 夜 20:00 … 仰角32°／方位 −18°／`0x9fbaff`／0.55（月明かり）
2. **HDRI** — `scene.environment` 専用。背景はプロシージャルのスカイドーム
3. **天井照明** — emissive 平面 × 6 本 ＋ PointLight × 2 のみ

### 安価・高効果な演出

- 窓から漏れる**光の筋**: 窓5枚ぶんの加算ブレンド・カメラ facing カード（計10三角形）。太陽方向に追従
- **埃パーティクル**: `Points` 200個、加算ブレンド
- **FogExp2**: 奥行き用。時間帯で色と密度を変更（0.012〜0.030）

---

## 6. ギミック一覧

| ギミック | 内容 |
|---|---|
| **視点プリセット** | 火曜三限・味噌の地政学／金曜五限はいつも死んでいる／放課後・零が黒板に立つ／窓際最後列・砂糖の席／廊下側・コーンスープの不在／教室全景（6種。原作の引用つき） |
| **時間帯切替** | 火曜三限 → 金曜五限 → 放課後 → 夜。太陽角度・色温度・露出・スカイドーム・フォグ・蛍光灯・光の筋・埃・時計の針・自販機の灯りが連動 |
| **黒板切替** | 「味噌」／河岸段丘の断面図（上から描く）／零の数学 |
| **クリックで調べる** | 16箇所のホットスポット。クリックすると原作の引用が出ます（黒板／窓＝今日の電線／室外機／自販機／**机の引き出しの紙束21枚**／スマホ／忘れた充電器／紺とえんじのネクタイ／天文学の本／モップ／掲示板／開いた棚／時計／教卓／水筒／配信カメラ） |
| **歩いて回る** | 一人称モード。机の間を抜け、黒板の前・窓際最後列・開いた棚・教卓の前まで自分の足で行ける |
| **廊下へ出る** | 少し開いた前扉から廊下へ。コーンスープの「無い」自販機の前に立てる |
| **見えない壁を横切る** | 一人称で教室の中央（x = −0.05）を横切ると、「偏差値、十」についての一文が差し込まれる |
| **見えない壁** | 「偏差値十の差」＝内進（紺）と理数科（えんじ）の境界を可視化するギミック |
| 蛍光灯 / 光の筋 / 埃 / 自動巡回 | オン・オフ切替 |

### 「人の気配」（キャラクターは不在）

- 最前列5脚だけ**座られている位置**に椅子があり、4脚が**引かれて斜め**になっている
- 寺地の机は**引き出しが開き**、中に**紙束21枚**。椅子は「今しがた立った」ように斜めに押し出されている
- 窓際最後列（砂糖の席）に**忘れた充電器**とケーブル
- 椅子の背に**えんじのネクタイ**、最前列の机に**紺のネクタイ**（内進生が来た痕跡）
- 開いた自習ノート／膝の上の**天文学の本**／**配信カメラ**（黒板に向いている）
- 後ろの棚は**扉が1枚開いたまま**。中に本・書類・段ボール
- 廊下側の隅にモップとバケツ（「廊下側はモップの匂い」）
- 6月なので**傘立て**と傘3本（うち1本は開いて干してある）
- 床に落ちた消しゴム／黒板の前に散ったチョークの粉／カバン3つ
- 教卓には**開いた地形図**（糸魚川–静岡構造線が赤い点線で引いてある）と出席簿

---

## 7. 性能（推定／Node側での静的計測）

| 指標 | 値 |
|---|---|
| 三角形 | **≈ 25,400**（机・椅子の Instanced 分を含む） |
| メッシュ数（≒ドローコール） | **≈ 178**（うち机・椅子30脚ぶんは InstancedMesh 4本） |
| 影 | 2048×2048 × 1灯。`autoUpdate = false` で初回＋更新時のみ |
| 透過 | ガラス・光の筋・埃のみ。`depthWrite = false` |
| 期待fps | 統合GPUでも 60fps 見込み（≈25k 三角形／≈180 ドローコール／ポストプロセス無し／影は静的1回） |

`npm run smoke` で上記の内訳を、`npm run smoke:views` で各視点プリセットの遮蔽チェック、
`npm run smoke:canvas` で Canvas 引数の回帰テストを再実行できます。

### 開発時の検証について

Node 側スモークテストの Canvas モックは、**本物の Canvas API と同じようにおかしい引数で例外を投げる**
厳格実装（`tools/canvas-mock.mjs`）です。`addColorStop` の非有限オフセット／範囲外、
`createLinearGradient` / `createRadialGradient` の NaN・負の半径、`arc` / `ellipse` の負の半径を検出します。
加えて `npm run smoke` は**全ジオメトリの頂点・UV に NaN が混入していないか**も検査します（179件／異常0件）。

### Canvas 2D の防御層

`index.html` の先頭で `CanvasGradient.prototype.addColorStop` と
`createLinearGradient` / `createRadialGradient` をラップし、非有限のオフセットや座標を
**0 / 範囲内に丸めて続行**します。万が一呼び出し側にミスがあっても、
Canvas の `DOMException` でシーン生成が止まることはなく、
原因箇所は `[canvas-guard]` として console にスタックトレース付きで記録されます。

### ローカル配信

`python3 serve.py [port]`（Python 標準ライブラリのみ）。
開発中に「直したのに古い JS が読まれる」を防ぐため、全レスポンスに
`Cache-Control: no-store` を付けています。

---

## 8. ファイル構成

```
index.html          importmap の動的生成（CDNフォールバック）＋ 起動監視 ／ UI のマークアップ
styles.css          原作トーンに合わせたダーク UI
src/
  spec.js           SCENE_SPEC・寸法・時間帯・視点プリセット・ホットスポット（引用）の一元管理
  util.js           幾何／ノイズ／Canvas ヘルパー（実寸UVつき box()、fBm、太陽方向）
  textures.js       プロシージャル・テクスチャ（木床・塗り壁・天井・木・金属・布・空・遠景・光の筋・埃）
  boards.js         Canvas 2D の「文字もの」（黒板3状態・時計・掲示板・時間割・自販機・スマホ・ノート・本・紙）
  assets.js         Poly Haven 解決／glTF 取得／3段フォールバック／容量バジェット／マテリアル生成
  world.js          教室の器（床壁天井・窓・扉・廊下・自販機・窓の外＝電柱電線室外機田んぼ・黒板・掲示板・棚）
  furniture.js      机30・椅子30（InstancedMesh）／寺地の英雄机（開いた引き出し＋紙束21枚）／教卓
  props.js          「人の気配」の小道具全般
  lighting.js       太陽・HDRI環境・天井照明・光の筋・埃・フォグ・時間帯の適用
  nav.js            一人称（歩行）モード＝移動・視線・当たり判定・タッチ操作
  ui.js             ローディング／各パネル／引用カード／レポート
  main.js           起動・状態管理・カメラ（一人称／俯瞰）・レイキャスト・ループ
tools/              開発用スモークテスト（本番配信には含まれません）
  nav.mjs           一人称の回帰テスト（当たり判定・到達性・机の間を抜けられるか・廊下へ出られるか）
serve.py            ローカル配信サーバ（依存なし。全レスポンス no-store）
REPORT.md           このファイル
```

### 開発時の検証コマンド

```
npm run smoke          # シーン全体の組み立て ＋ ジオメトリの NaN／UV 検査
npm run smoke:light    # ライティングと光の筋
npm run smoke:canvas   # Canvas 2D の厳格モックによる回帰（addColorStop 系）
npm run smoke:views    # 視点プリセットとホットスポットの対応
npm run smoke:nav      # 一人称モード（当たり判定・到達性）
npm start              # python3 serve.py 8000
```
