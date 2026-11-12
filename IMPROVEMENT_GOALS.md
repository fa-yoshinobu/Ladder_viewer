# Ladder Viewer 改善ゴール

[README](../README.md) · [ビルド・テスト](BUILD.md) · [TODO](../TODO.md)

v0.6.6 時点のコードレビューに基づく改善項目です。1ゴール＝1つの独立した作業単位で、上から順に着手することを想定しています。

## 共通ルール

- 1ゴールにつき1コミット（または1 PR）。ゴールをまたぐ変更を混ぜない。
- 表示結果（回路の位置・寸法・配色）を変えない。変える場合はゴールに明記されたものだけ。
- 入力CSV/MNMの実データをリポジトリに入れない。テストは架空データを使う。
- 各ゴールの完了時に、次の共通検証がすべて成功すること。

```powershell
npm run build
npm test
dotnet run --project tests/desktop/Check.csproj
```

## 進捗

| # | ゴール | 優先度 | 状態 |
| --- | --- | --- | --- |
| G1 | push/PRでテストと型検査が走る | 高 | ローカル検証済み |
| G2 | コード書式を統一しCIで検査する | 高 | ローカル検証済み |
| G3 | 3画面の重複処理を共通化する | 高 | ローカル検証済み |
| G4 | 入力サイズに上限を設ける | 高 | ローカル検証済み |
| G5 | 文書を実態に合わせる | 中 | 未着手 |
| G6 | UI検証スクリプトをリポジトリのテストにする | 中 | 未着手 |
| G7 | バージョンを一元管理する | 中 | 未着手 |
| G8 | 形式判定・文字コード判定の重複をなくす | 中 | 未着手 |
| G9 | 大きなプログラムでも操作が重くならない | 中 | 未着手 |
| G10 | 古い画面データを自動で片付ける | 中 | 未着手 |
| G11 | 表示設定を次回起動に引き継ぐ | 中 | 未着手 |
| G12 | 細かな堅牢化・使い勝手 | 低 | 未着手 |

---

## G1: push/PRでテストと型検査が走る

**Goal**: main へのpushとPull Requestのたびに、TypeScriptの型検査（tests含む）・`npm test`・C#チェックが自動で実行され、失敗が分かる。

**背景**: 現在テストが走るのはタグpush時（`release.yml`）だけ。`tsconfig.json` の `include` が `src` のみで、`tsx` は型検査をしないため、`tests/` は型エラーがあっても通る。

**対象**: `.github/workflows/`（新規 `ci.yml`）、`tsconfig.json`、`package.json`

**完了条件**
- [x] `.github/workflows/ci.yml` が `push`（main）と `pull_request` で起動する。
- [x] ワークフローが `npm ci` → 型検査 → `npm test` → `npm run build` → `dotnet run --project tests/desktop/Check.csproj -c Release` を実行する。
- [x] 型検査の対象に `tests/` が含まれる（例: `tsconfig.json` の `include` に追加、または検査用tsconfigを追加し `npm run typecheck` を用意）。
- [x] 既存の `release.yml` と同じく、Actionはコミットハッシュで固定し `persist-credentials: false` にする。
- [x] `permissions: contents: read` のみ。

**検証**: `npm run typecheck` がローカルで成功する。わざと `tests/` に型エラーを入れると失敗する。

**確認結果**: 型検査成功。`tests/` の意図的な型エラーが失敗することを確認して検証用ファイルを削除。共通検証はビルド成功、TypeScript 363件成功、C# 58件成功（reparse関連1グループは環境理由でスキップ）。GitHub上のCI実行は未確認。

**対象外**: リリース手順の変更。

---

## G2: コード書式を統一しCIで検査する

**Goal**: すべてのTypeScript/TSX/CSSが整形ツールで自動整形され、整形されていないコードはCIで落ちる。

**背景**: 300文字を超える行が79行あり、JSXが1行2,000文字を超える箇所もある。差分レビューと競合解消が難しい。ESLint・Prettierの設定がない。

**対象**: `src/`、`tests/`、`package.json`、設定ファイル（新規）、`ci.yml`

**完了条件**
- [x] Prettierを開発用依存に追加し、設定ファイルと `npm run format` / `npm run format:check` がある。
- [x] `src/` と `tests/` 全体を整形した結果が、整形だけの単独コミットになっている（ロジック変更を含まない）。
- [x] そのコミットを `.git-blame-ignore-revs` に登録している。
- [x] CI（G1）で `npm run format:check` を実行する。
- [x] `tsconfig.json` で `noUnusedLocals`・`noUnusedParameters` を有効にし、エラーを解消している。

**検証**: `npm run format:check` が成功。整形前後で `npm test` の結果と `artifacts/build/web` の動作が変わらない。

**確認結果**: Prettier検査・AST検査・型検査・共通検証成功。TypeScript 363件、C# 58件成功（reparse関連1グループは環境理由でスキップ）。整形コミットを独立させ、blame除外に登録。

**対象外**: ESLintルールの本格導入、`noUncheckedIndexedAccess`（G12）。

---

## G3: 3画面の重複処理を共通化する

**Goal**: 通常表示（三菱）・キーエンス表示・比較モードが、同じ部品とフックでツールバー・ズーム・検索・右クリックメニュー・詳細パネルを実現している。

**背景**: `src/main.tsx`（`App`）、`src/keyence/Viewer.tsx`、`src/DirectComparisonWorkspace.tsx` が同じ処理を別々に実装している。配色リストは3か所にコピーがある。拡大ボタンの丸めが `toFixed(1)` と `toFixed(2)` で混在し、87%から＋を押すと通常表示は100%、比較モードは97%になる。`App` は1関数にstate/refが30個以上ある。

**対象**: 上記3ファイル、`src/` 配下の新規ファイル

**完了条件**
- [x] 配色リスト（`ladderPalettes`）の定義が1か所だけになっている。
- [x] ズーム処理が1つのフック（例 `useZoom`）にまとまり、3画面とも同じ丸め・同じ上下限規則で動く。＋/−は常に10%刻みの値に揃う。
- [x] 表示ツールバー（コメント・配色・長い回路・幅に合わせる・ズーム）が1つのコンポーネントになっている。
- [x] Ctrl+Fで検索欄へ移動する処理が1か所になっている（キーエンス側だけ `metaKey` を見る差もなくす）。
- [x] ブラウザ用の右クリックメニュー（コピー／コメントリスト）が1つの実装になっている。
- [x] `App` 関数が200行未満になっている（読込み処理・検索・画面内移動を別フック／部品へ分離）。
- [x] ズーム丸めの単体テストが `tests/` にある。

**検証**: 共通検証に加え、3画面それぞれで「幅に合わせる→＋→−」「検索→次へ」「右クリック→コピー」を手動確認する（G6完了後は自動）。

**確認結果**: 共通検証、型検査、書式検査成功。TypeScript 364件、C# 58件成功（reparse関連1グループは環境理由でスキップ）。架空データの実ブラウザで3画面の幅合わせ→拡大→縮小、Ctrl+F→検索→次へ、右クリック→コピーを確認。配色定義と検索キー判定は各1か所。App関数58行。

**対象外**: 画面デザインの変更、機能追加。

---

## G4: 入力サイズに上限を設ける

**Goal**: 巨大なフォルダーやファイルを選んでも、アプリが固まらず、理由の分かるメッセージを出す。

**背景**: `src-desktop/CsvFileSelection.cs` はフォルダーを再帰的にたどり、すべての `*.csv` を `File.ReadAllBytes` で読み、Base64にしてJSON 1通で画面へ送る。画面側 `src/nativeCsv.ts` は `atob` 後に `btoa` で再エンコードして検証し、1バイトずつ詰め直す。`D:\` のようなフォルダーを選ぶとメモリを使い切る。

**対象**: `src-desktop/CsvFileSelection.cs`、`src-desktop/Program.cs`、`src/nativeCsv.ts`、`tests/desktop/Program.cs`、`tests/nativeCsv.test.ts`

**完了条件**
- [x] ファイル件数・1ファイルのサイズ・合計サイズに上限の定数があり、超過時は読込み前に日本語のエラーを返す（何件／何MBで上限を超えたかを含む）。
- [x] 上限の判定は中身を読む前（列挙時のファイルサイズ）に行う。
- [x] `decodeNativeCsvFiles` の `btoa` 往復検証をやめ、より軽い検証に置き換えている。
- [x] 上限超過のケースが C# チェックに追加されている。
- [x] READMEまたはBUILDに上限値を記載している。

**検証**: 共通検証。上限を一時的に小さくして、超過メッセージが画面に出ることを確認する。

**確認結果**: ビルド・型検査・書式検査成功。TypeScript 365件、C# 63件成功（reparse関連1グループは環境理由でスキップ）。ネイティブ版で17 MBの架空CSVに16 MB上限エラーを確認。検証専用ビルドで上限を1 MBに下げ、2 MBの架空CSVのエラーを確認後、製品ソースは16 MBへ復元。

**対象外**: `CoreWebView2SharedBuffer` などへの転送方式の変更（効果は大きいが別ゴールにする）。

---

## G5: 文書を実態に合わせる

**Goal**: README・BUILD・CHANGELOG・TODOの記述が、リポジトリの実際の状態と一致している。

**背景**: `CHANGELOG.md` と `TODO.md` は見出しだけだが、READMEとBUILDは「残件はTODOに」と案内している。変更内容は `.github/release-notes.md` を毎回上書きするため履歴が残らない。BUILDは `artifacts/build/` を「削除後は再ビルドで生成」と説明するが、実際は再生成できない検証物（Playwrightスクリプト、`reference-audit/`、`kvx-audit/` など）が入っている。

**対象**: `CHANGELOG.md`、`TODO.md`、`docs/BUILD.md`、`README.md`

**完了条件**
- [ ] `CHANGELOG.md` に v0.6.0〜v0.6.6 の変更が載っている（GitHub Releasesの内容から転記）。
- [ ] BUILDのリリース手順に「`CHANGELOG.md` へ追記する」が入っている。
- [ ] `TODO.md` に残件が載っている。本書を残件一覧とするなら、`TODO.md` から本書へリンクする。
- [ ] BUILDの「構成と管理対象」で、`artifacts/build/` のうち再生成できるもの（`web/`、`LadderViewer/`、`Check/`）と、手作業の検証物を区別して説明している。
- [ ] 再生成できない検証物の置き場所を `artifacts/build/` の外に決めている（G6と整合させる）。

**検証**: 文書内のリンクがすべて開ける。

**対象外**: 英語版文書の追加。

---

## G6: UI検証スクリプトをリポジトリのテストにする

**Goal**: 画面の回帰（回路の重なり、コメントリスト、スクリプト展開など）を、誰のPCでも1コマンドで検証できる。

**背景**: `artifacts/build/verify-comment-list.cjs`、`verify-script-ui.cjs` などのPlaywrightスクリプトがあるが、`artifacts/` はGit管理外で、個人PCの絶対パス（`C:/Users/.../codex-runtimes/...`）に依存している。v0.6.6で直した「Preact更新後に回路が重なる」不具合は、この種のテストで防げる。

**対象**: `tests/e2e/`（新規）、`package.json`、`ci.yml`

**完了条件**
- [ ] Playwrightが開発用依存に入り、絶対パスの `require` がない。
- [ ] 既存の検証スクリプトが `tests/e2e/` に移され、`npm run test:e2e` で実行できる（開発サーバーの起動も含めて自動）。
- [ ] 架空データだけを使う。
- [ ] 回路同士が重ならないこと（隣り合う回路の矩形が交差しない）を確認するテストが、三菱・キーエンスそれぞれにある。
- [ ] CIで `npm run test:e2e` を実行する。

**検証**: `npm run test:e2e` が成功。`layout.ts` の高さ計算をわざと壊すと失敗する。

**対象外**: WinFormsホスト（ネイティブのコメントリスト窓など）の自動テスト。

---

## G7: バージョンを一元管理する

**Goal**: バージョン番号を書く場所が1か所になり、ローカルビルドでもCIでも同じ番号のEXEができる。

**背景**: `package.json` と `src-desktop/LadderViewer.csproj` の両方に 0.6.6 がある。CIはタグで上書きするが、`build-viewer.cmd` は手動同期。パッケージ名は `ladder-viewer-prototype` のまま。

**対象**: `package.json`、`src-desktop/LadderViewer.csproj`、`build-viewer.cmd`、`docs/BUILD.md`

**完了条件**
- [ ] `package.json` の `version` を唯一の定義とし、csprojはそこから読む（または `npm run windows:build` が `-p:Version` を渡す）。
- [ ] `package.json` の `name` が `ladder-viewer` になっている。
- [ ] BUILDのリリース手順に、バージョンを上げる場所が1か所だけ書かれている。

**検証**: `package.json` のバージョンを仮に変えて `npm run windows:build` し、EXEの製品バージョンが一致する。

**対象外**: 自動バージョン採番。

---

## G8: 形式判定・文字コード判定の重複をなくす

**Goal**: 「コメントCSVかどうか」と「文字コード」の判定規則が、仕様として1か所に定義され、C#とTypeScriptが同じ結果を返すことをテストで保証している。

**背景**: コメントCSVの判定がC#（`CsvFileSelection.ReadCommentFormat`）とTypeScript（`src/batch.ts`、`src/keyence/comments.ts`）の両方にある。C#側はカンマを単純分割しており、片方だけ直すとずれる。文字コード判定も `decodeCsv`（`src/model.ts`）と `decodeKeyenceText`（`src/keyence/encoding.ts`）でほぼ同じ。

**対象**: 上記ファイル、`tests/`、`tests/desktop/Program.cs`

**完了条件**
- [ ] TypeScript側の文字コード判定が1つの関数になっている。
- [ ] コメントCSV判定用の共通fixture（架空データ、判定結果つき）があり、TypeScriptのテストとC#チェックの両方が同じfixtureを読んで同じ結果になる。
- [ ] 引用符つきカンマを含むヘッダー行のケースがfixtureに入っている。

**検証**: 共通検証。

**対象外**: 判定をC#側に一本化するなどの構成変更。

---

## G9: 大きなプログラムでも操作が重くならない

**Goal**: 数千回路のプログラムでも、スクロールと回路一覧の操作が引っかからない。

**背景**: 左の回路一覧は全件をDOMに出している（三菱・キーエンスとも）。三菱側の表示範囲の計算（`main.tsx` の `visible`）は、スクロールのたびに全回路を `filter` する。キーエンス側は二分探索。

**対象**: `src/main.tsx`、`src/keyence/Viewer.tsx`、新規の共通部品

**完了条件**
- [ ] 回路一覧が仮想スクロールになり、DOMに出る項目は画面に見える分＋前後の余白だけ。
- [ ] 選択中の回路へ一覧が追従する動作（`scrollIntoView` 相当）が維持されている。
- [ ] 三菱側の表示範囲の計算が二分探索になり、キーエンス側と同じ関数を使う。
- [ ] 5,000回路の架空プログラムで、表示範囲の計算の単体テストがある。

**検証**: 共通検証。5,000回路の架空データを開き、一覧のDOM要素数が数百以下であることを確認する。

**対象外**: SVG描画そのものの最適化。

---

## G10: 古い画面データを自動で片付ける

**Goal**: アプリを更新し続けても、`%LOCALAPPDATA%\LadderViewer\app` に旧バージョンのフォルダーが溜まらない。

**背景**: `src-desktop/Program.cs` は起動のたびに `app\<ハッシュ>` へ画面データを展開するが、旧ハッシュのフォルダーを消さない。

**対象**: `src-desktop/Program.cs`

**完了条件**
- [ ] 起動時、現在のハッシュ以外の `app\*` フォルダーを削除する。
- [ ] 別バージョンが同時に起動中でも壊れない（削除失敗は無視して続行する）。
- [ ] すでに同じハッシュのフォルダーが完全に展開済みなら、再展開を省く（完了マーカーなどで判定）。

**検証**: 旧ハッシュ名のダミーフォルダーを置いて起動し、消えることを確認する。

**対象外**: WebView2のユーザーデータ（`WebView2\`）の整理。

---

## G11: 表示設定を次回起動に引き継ぐ

**Goal**: ズーム以外の表示設定とウィンドウの位置・サイズが、次回起動時に前回のまま復元される。

**背景**: 保存されるのはテーマ・配色・ST色分けだけ。折り返し／横スクロール、コメント表示、ウィンドウの位置とサイズは毎回初期値に戻る。

**対象**: `src/`（設定の読み書きを1か所に集約）、`src-desktop/Program.cs`

**完了条件**
- [ ] 「長い回路」「コメント」の選択が `localStorage` に保存され、3画面で共有される。
- [ ] `localStorage` の読み書きが1つのモジュールにまとまっている（現在は `main.tsx` と `StColorToggle.tsx` に分散）。
- [ ] ウィンドウの位置・サイズ・最大化状態を保存し、復元する。保存位置が現在のモニター構成の外なら既定位置に戻す。
- [ ] ズームは保存しない（開くたびに幅へ合わせる現在の動作を維持）。

**検証**: 設定を変えて再起動し、復元されることを確認する。モニターを外した状態でも画面内に表示される。

**対象外**: 最近開いたファイルの履歴。

---

## G12: 細かな堅牢化・使い勝手

**Goal**: 下記の小さな問題がそれぞれ解消されている。項目ごとに独立して着手できる。

**完了条件**
- [ ] **F5で読込み内容が消えない**: `Program.cs` で `AreBrowserAcceleratorKeysEnabled = false` にし、Ctrl+Fなど必要なキーが引き続き動く。
- [ ] **CSP**: `index.html` に Content-Security-Policy を設定し、Workerとインラインスタイルを含めて動作する。
- [ ] **エラー表示**: 警告（読込みは成功）とエラーを見た目で区別し、閉じるボタンがある。
- [ ] **検索**: 入力のたびに先頭の結果へ飛ぶ動作を、短い待ち時間（デバウンス）つきにする。表示（比較元のみ／比較先のみ）やコメントの切替では、現在位置を保つ。
- [ ] **型検査の強化**: `noUncheckedIndexedAccess` を有効にし、エラーを解消する。
- [ ] **配布**: .NETランタイム不要のself-contained版を追加で配布するかを決め、決定を `BUILD.md` に記録する。

**検証**: 共通検証と、各項目の手動確認。
