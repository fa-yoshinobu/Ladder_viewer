# ビルド・開発・テスト

[README](../README.md) · [変更履歴](CHANGELOG.md) · [TODO](TODO.md)

## 開発環境

- Windows 10/11、x64。
- Node.js：20系は20.19以降、または22.12以降。npmも必要です。
- .NET 8以降のSDK。
- 初回の依存物取得にはネット接続が必要です。

## EXEと配布ZIPを作る

リポジトリをcloneした後、Ladder Viewerを閉じ、プロジェクトルートの [build-viewer.cmd](../build-viewer.cmd) を実行してください。
開発用ライブラリがなければ準備し、内部画面・Windows版EXE・配布ZIPを順に作成します。テストは次の「テスト」で個別に実行します。

| 出力 | 用途 |
| --- | --- |
| `windows/LadderViewer.exe` | 起動用EXE |
| `windows/LadderViewer-win-x64.zip` | EXEだけを格納した配布ZIP |

配布先に必要な実行環境は [READMEの起動欄](../README.md#起動) を参照してください。

## コマンドでビルドする

プロジェクトルートで実行します。

```powershell
npm ci
npm run windows:build
```

`npm run windows:build` は内部画面をビルドしてからWindows版を発行し、`windows/`へEXEを出力します。第三者ライセンス全文はEXEに埋め込み、「バージョン情報」から表示します。配布ZIPも作る場合は、上記のバッチを使います。

`npm run build` は内部画面だけを作成します。`dotnet publish` を直接使う場合も、先に内部画面をビルドしてください。

## GitHub Releases

[Release Windows](../.github/workflows/release.yml) は `v0.1.0` 形式のタグをpushすると実行されます。タグを付ける前に、リリースする変更をGitHubへ反映してください。

```powershell
git tag v0.1.0
git push origin v0.1.0
```

テスト、内部画面のビルド、Windows版の発行が成功すると、GitHub Releaseを作成して `LadderViewer.exe` とEXEだけを格納した `LadderViewer-win-x64.zip` を添付します。EXEのバージョンはタグの番号に合わせます。既存のReleaseや添付ファイルは上書きしません。

## テスト

```powershell
npm test
dotnet run --project tests/desktop/Check.csproj
```

テストは架空データを使用します。シンボリックリンクの作成権限がない環境では、C#チェックのリンク用fixtureがスキップされます。
未実行チェックと画面確認の残件は [TODO](TODO.md) にまとめています。

## 構成と管理対象

| フォルダー | 内容 |
| --- | --- |
| `src/` | TypeScript・Preact・SVGによる画面とCSV解析 |
| `desktop/` | WinForms・WebView2によるWindowsホスト |
| `tests/` | 架空データによる検証 |

GitHubのコード反映には、アプリのソース・テスト・文書を含めます。入力CSV、参照HTML・画像、`node_modules/`、`dist/`、`windows/`、`bin/obj/`は除外します。純正画像を表示素材として流用しません。
