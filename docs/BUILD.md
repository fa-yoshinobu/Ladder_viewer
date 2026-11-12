# ビルド・開発・テスト

[README](../README.md) · [変更履歴](../CHANGELOG.md) · [TODO](../TODO.md)

## 開発環境

- Windows 10/11、x64。
- Node.js：20系は20.19以降、または22.12以降。npmも必要です。
- .NET 10以降のSDK。
- 初回の依存物取得にはネット接続が必要です。

## EXEと配布ZIPを作る

リポジトリをcloneした後、Ladder Viewerを閉じ、プロジェクトルートの [build-viewer.cmd](../build-viewer.cmd) を実行してください。
開発用ライブラリがなければ準備し、内部画面・Windows版EXE・配布ZIPを順に作成します。テストは次の「テスト」で個別に実行します。

| 出力 | 用途 |
| --- | --- |
| `artifacts/release/LadderViewer.exe` | 起動用EXE（完成品） |
| `artifacts/release/LadderViewer-win-x64.zip` | EXEだけを格納した配布ZIP |

完成品は `artifacts/release/` にあります。`artifacts/build/` はビルド中に使うファイルです。

配布先に必要な実行環境は [READMEの起動欄](../README.md#起動) を参照してください。

## 入力の上限

1回の読込みはCSV/MNMと自動確認するコメントCSVを合わせて最大1,000ファイル、1ファイル16 MB、合計64 MBです（1 MB = 1,048,576バイト）。ファイルの内容を読む前に件数・ファイルサイズを確認し、上限を超える場合は件数またはMB数を含む日本語のエラーを表示します。フォルダーを分けて選択してください。比較モードで別々に読み込む比較元・比較先には、それぞれこの上限が適用されます。

## コマンドでビルドする

プロジェクトルートで実行します。

```powershell
npm ci
npm run windows:build
```

`npm run windows:build` は内部画面をビルドしてからWindows版を発行し、`artifacts/release/`へEXEを出力します。第三者ライセンス全文はEXEに埋め込み、「バージョン情報」から表示します。配布ZIPも作る場合は、上記のバッチを使います。

`npm run build` は内部画面だけを `artifacts/build/web/` に作成します。`dotnet publish` を直接使う場合も、先に内部画面をビルドしてください。

## 引数を指定して起動する

```powershell
LadderViewer.exe "プログラム.csv"
LadderViewer.exe --compare "比較元フォルダー" "比較先フォルダー"
LadderViewer.exe --compare "比較元.mnm" "比較先.mnm"
```

`--compare` の後は比較元・比較先の順に2件指定します。ファイルとフォルダーのどちらも指定できます。

## GitHub Releases

[Release Windows](../.github/workflows/release.yml) は `v0.6.0` のようなバージョンタグをpushすると実行されます。タグを付ける前に、リリースする変更をGitHubへ反映してください。以下は0.6.0をリリースする場合の例です。

```powershell
git tag v0.6.0
git push origin v0.6.0
```

テスト、内部画面のビルド、Windows版の発行が成功すると、GitHub Releaseを作成してEXEだけを格納した `LadderViewer-win-x64.zip` とSHA-256チェックサムを添付します。EXEのバージョンはタグの番号に合わせます。既存のReleaseや添付ファイルは上書きしません。

公開前に [CHANGELOG.md](../CHANGELOG.md) へ今回のバージョンと変更内容を追記し、[.github/release-notes.md](../.github/release-notes.md) のChanges欄も更新してください。リリースノートとVirusTotalのスキャン結果は英語で記載します。その他の文書は日本語のままで構いません。

公開後は配布したEXEをVirusTotalでスキャンします。スキャンを再実行する場合は、`Scan release with VirusTotal` ワークフローに対象のリリースタグを指定してください。[共通リリース標準](https://github.com/fa-yoshinobu/release_standard)も参照してください。

## テスト

```powershell
npm test
dotnet run --project tests/desktop/Check.csproj
```

テストは架空データを使用します。シンボリックリンクの作成権限がない環境では、C#チェックのリンク用fixtureがスキップされます。
残件は [TODO](../TODO.md) にまとめています。

## 構成と管理対象

| フォルダー | 内容 |
| --- | --- |
| `src/` | TypeScript・Preact・SVGによる画面とCSV解析 |
| `src-desktop/` | WinForms・WebView2によるWindowsホストのソース |
| `tests/` | 架空データによる検証 |
| `docs/` | 説明書・画面例 |
| `artifacts/release/` | 完成したEXE・配布ZIP |
| `artifacts/build/web/` | 内部画面。`npm run build`で再生成 |
| `artifacts/build/LadderViewer/`・`artifacts/build/Check/` | .NETの中間ファイル。ビルド・C#チェックで再生成 |
| `artifacts/manual/` | 手作業の検証資料・参考画像。Git管理外、ビルドでは再生成されない |
| `artifacts/reports/` | CIで作成するスキャン結果 |
| `node_modules/` | npmで取得した開発用ライブラリ |

三菱CSVとキーエンスMNMは拡張子で振り分け、メーカーごとに解析モデルと回路配置を分けています。基本記号と表示操作は共通です。

既存の`artifacts/build/reference-audit/`・`kvx-audit/`などには手作業の検証資料が含まれます。`artifacts/build/`全体を生成物として削除しないでください。今後の手作業の資料は`artifacts/manual/`に保存し、既存資料の移動・削除は個別に判断します。継続実行するUIテストは`tests/e2e/`で管理します。

アプリアイコンは `src/icon.svg`（画面・ファビコン）と `src-desktop/app.ico`（EXE・ウィンドウ）です。図柄を変える場合は両方を更新してください。

GitHubのコード反映には、アプリのソース・テスト・文書を含めます。入力CSV、表示確認用の参考HTML・画像、`node_modules/`、`artifacts/`は除外します。参考HTML・画像は開発時の表示確認にだけ使い、アプリからは読み込みません。純正画像を表示素材として流用しません。
