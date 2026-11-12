# 保存した大会配信の参考画面

保存日: 2026-09-18。画像は完成デザインの参考として使用します。OCRの実運用入力は合成前のゲーム画面です。以下のOCR記録は開発時の固定画像によるエンジン回帰試験であり、実ゲームでの精度を示すものではありません。サイト上の数値データはアプリに取り込んでいません。

原画像は改変せず保存しています。`profiles.json` に画像URL・掲載ページ・SHA-256・回帰試験用の読取枠を記録しています。ゲーム用の読取ひな形は別ファイル `config/ocr-profiles.json` にあります。参考画像は完成参考パネル専用で、本番オーバーレイには出力しません。

## Worlds 2018 決勝 / FNC vs IG / 試合中

- ファイル: [worlds2018-game.jpg](worlds2018-game.jpg)
- [掲載元](https://www.reddit.com/r/leagueoflegends/comments/9tszu7/fnatic_vs_invictus_gaming_2018_world_championship/)
- [取得画像URL](https://i.imgur.com/Fq9FcEG.jpg)

## Worlds 2018 準決勝 / IG vs G2 / BAN・PICK

- ファイル: [worlds2018-draft.jpg](worlds2018-draft.jpg)
- [掲載元](https://ol.3dmgame.com/esports/10437.html)
- [取得画像URL](https://ol.3dmgame.com/uploads/images/gamenews/20181027/1540636170_301080.jpg)

## Worlds 2024 スイス / BLG vs T1 / 終了後（推奨）

- ファイル: [worlds2024-result.png](worlds2024-result.png)
- [掲載元](https://www.reddit.com/r/leagueoflegends/comments/1fxgmd2/bilibili_gaming_vs_t1_2024_world_championship/)
- [取得画像URL](https://i.imgur.com/WJlrn6d.png)

## Worlds 2023 決勝 / WBG vs T1 / 終了後

- ファイル: [worlds2023-result.png](worlds2023-result.png)
- [掲載元](https://www.reddit.com/r/leagueoflegends/comments/17yux8f/weibo_gaming_vs_t1_2023_world_championship_final/)
- [取得画像URL](https://i.imgur.com/DjrYjua.png)

## 配置の根拠

- 試合中: Worlds 2018の上部スコア領域を1920×1080へ換算し、X=390 / Y=0 / 幅1140に配置。左右HUD、下部中央スコアボード、右下ミニマップを残す。演出はX=710 / Y=124 / 幅500。
- BAN/PICK: 左右386px・上200px・下228pxを表示領域とし、中央1148×652pxのカメラ映像を透過で残す。選手・PICKを左右5段、BANを下部へ配置。
- 終了後: Worlds 2024・2023を参考に、勝者・両チームのKDA表・最終ゴールド差・10選手の対比ダメージ棒を全面表示。元画像の時系列グラフは取得しない。

## OCRの確認範囲

- Worlds 2018試合中: キル2、ゴールド2、KDA10の計14項目を目視値と照合済み。
- Worlds 2024終了後: ゴールド2、ダメージ10、blueチームキル1、red勝利表記1の計14項目を照合済み。redチームKDAはスラッシュが読めず不採用。
- Worlds 2018 BAN/PICK: 選手名の文字が背景に重なり、英語OCRでは誤読・読取不能が多い。手動入力を推奨。チャンピオン肖像・BANアイコンの認識は未実装。
- Worlds 2023終了後: 圧縮が強く、ダメージ数値を安定して読めない。比較・レイアウト用に残しています。
- この確認は固定画像の回帰試験。別大会、動く映像、現行UIに対する認識精度を保証するものではない。連続一致や2方式一致でも誤読し得るため、採用チェックは初期状態で全てオフ。

## エンジン資料

- [Microsoft Windows OCR](https://learn.microsoft.com/en-us/uwp/api/windows.media.ocr.ocrengine?view=winrt-26100)
- [PyWinRT documentation](https://pywinrt.readthedocs.io/en/latest/types.html)
