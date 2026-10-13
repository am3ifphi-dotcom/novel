# 偏差値60の教室から✝本質✝が漏れ出している件について — インタラクティブ3D教室

`gensaku.txt`（原作・全4021行）の記述だけを根拠に、**桐葉高校 北棟2階 理数科B組の教室**を three.js で再構成したもの。
キャラクターは造形せず、**引かれた椅子・置き忘れた物・開いた扉**で「人の気配」を表現している。

```
index.html           画面の殻（UI・ローディング・importmap ブートストラップ）
src/config.js        SCENE_SPEC を数値化した場面プリセット（7場面）と教室寸法
src/lib/layout.js    座席配置（30席/40席）・原作の人物→座席の対応（純計算）
src/lib/sunpath.js   太陽位置・色温度・影の柔らかさ（純計算）
src/lib/geo.js       教室・廊下・屋外・小物の「部品リスト」ビルダー（three のみ・DOM 非依存）
src/procedural.js    板書・掲示物・自販機・端末画面・地形図・代替PBRテクスチャ（Canvas 生成）
src/assets.js        PBR/HDRI/GLB の取得と**必ず代替へ落ちる**フォールバック
src/scene.js         教室の組み立て（InstancedMesh・小物・クリック対象）
src/lighting.js      太陽＋HDRI環境光＋蛍光灯＋光の筋＋埃＋フォグ
src/gimmicks.js      場面切替・クリック操作・時間スライダー・✝本質✝モード
src/ui.js            日本語UI（視点プリセット・ギミック・ローディング・エラー表示）
assets/              同梱アセット（Poly Haven CC0 テクスチャ / HDRI / 水筒GLB / three.js）
SCENE_SPEC.md        原作解析の成果物（行番号付きの根拠）
REPORT.md            採用アセット一覧・代替一覧・推定ダウンロード量・検証結果
```

## 動かす

`fetch` を使うため **必ずHTTPで開く**（`file://` では読み込めない）。

```bash
python3 -m http.server 8080      # リポジトリ直下で
# → http://localhost:8080/
```

軽量モードで開く場合は `?quality=low`（`?quality=mid|high` も可）。

## 操作

| 操作 | 内容 |
|---|---|
| ドラッグ / ホイール | 見回す / 前後（OrbitControls） |
| 左下のボタン（または 1〜7） | 原作の象徴的な場面へ移動（朝のHR・味噌の地政学・昼休み・金曜五限・放課後の数学・廊下の自販機・窓の外） |
| 物をクリック | 黒板・窓・引き戸・掲示板・自販機・スマホ・本・地形図を調べる（日本語のトーストで解説） |
| **E** | ✝本質✝モード（赤い✝が26個浮き、掲示板が怪文書に入れ替わる） |
| **L** / **W** | 蛍光灯 / 窓の開閉 |
| **H** | 操作説明の表示切替 |
| 右下のパネル | 太陽の時間スライダー（5:00〜19:00で影と色温度が動く）・40人仕様（原作準拠）・自動巡回カメラ・軽量モード |

## 設計の要点

* **時間帯を7場面で**（`SCENE_SPEC.md` §2 の表が根拠）。窓は +X＝西向きにして、
  原作の「窓際は午後の日差しで焼かれ」（L260）と夕方の放課後（L767）が成立するようにした。
* **板書は場面ごとに CanvasTexture を生成**。チョークのゆらぎ（多重描画＋微小オフセット）で手書き感を出し、
  河岸段丘の断面図（上から描く＝勝也の描き方・L270）や糸魚川-静岡構造線（L100）を図として描いている。
* **机・椅子は InstancedMesh**（1ジオメトリ×N・マテリアル共有）。30席＝規定、40席＝原作準拠に切替可。
* **影は静的**（`shadowMap.autoUpdate = false`、変化時のみ更新）。ポストプロセスは使わず、
  `ACESFilmicToneMapping` ＋ 露出 ＋ `FogExp2` で空気を作る。
* **失敗しても止まらない**: テクスチャ／HDRI／GLB のすべてに代替経路があり、
  失敗は `console.warn('【代替】…')` に残して続行する。`index.html` は vendor が無ければ CDN に倒れ、
  それも失敗すれば起動エラー画面（白画面にしない）。

## テスト

```bash
node tools/test-scene.mjs    # ジオメトリ寸法・座席配置・太陽計算・アセット実在・API名（116 checks）
node tools/test-dom.mjs      # 最小DOMシムで実際に教室を組み立て、板書内容まで検証（47 checks）
```

## クレジット

* テクスチャ・HDRI: [Poly Haven](https://polyhaven.com/)（**CC0 1.0**）— 取得経緯は `REPORT.md` §2
* 3Dモデル: [Khronos glTF-Sample-Assets](https://github.com/KhronosGroup/glTF-Sample-Assets) `WaterBottle`
* ライブラリ: [three.js](https://threejs.org/) r170（MIT）
* 原作: 『偏差値60の教室から✝本質✝が漏れ出している件について』（`gensaku.txt`）
