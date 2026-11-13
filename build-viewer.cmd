@echo off
chcp 65001 >nul
setlocal
pushd "%~dp0"
if errorlevel 1 (
  echo ビルド用フォルダーを開けませんでした。
  pause
  exit /b 1
)

where node.exe >nul 2>&1
if errorlevel 1 (
  echo Node.js が見つかりません。Node.js と npm をインストールしてください。
  goto failed
)
where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo npm が見つかりません。Node.js のインストールを確認してください。
  goto failed
)
where dotnet.exe >nul 2>&1
if errorlevel 1 (
  echo .NET SDK が見つかりません。.NET 10 以降の SDK をインストールしてください。
  goto failed
)

echo Ladder Viewer を閉じてからビルドしてください。
if not exist "node_modules\.bin\vite.cmd" (
  echo 開発用ライブラリを準備しています...
  call npm ci
  if errorlevel 1 goto failed
)

echo Windows版を artifacts\release にビルドしています...
call npm run windows:build
if errorlevel 1 goto failed

echo 配布ZIPを作成しています...
powershell.exe -NoProfile -NonInteractive -Command "$ErrorActionPreference='Stop'; Compress-Archive -LiteralPath 'artifacts\release\LadderViewer.exe' -DestinationPath 'artifacts\release\LadderViewer-win-x64.zip' -Force; $zip='artifacts\release\LadderViewer-win-x64.zip'; $line=([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([IO.File]::ReadAllBytes($zip)))).Replace('-', '').ToLowerInvariant()+'  '+[IO.Path]::GetFileName($zip)+[char]10; [IO.File]::WriteAllText($zip+'.sha256',$line,[Text.UTF8Encoding]::new($false))"
if errorlevel 1 goto failed

echo.
echo ビルドが完了しました。
echo 完成品フォルダー: %~dp0artifacts\release
echo 起動用EXE: %~dp0artifacts\release\LadderViewer.exe
echo 配布用ZIP: %~dp0artifacts\release\LadderViewer-win-x64.zip
echo テストは実行していません。
popd
pause
endlocal
exit /b 0

:failed
echo.
echo ビルドに失敗しました。上のエラーを確認してください。
echo アプリ起動中の場合は閉じてから、もう一度実行してください。
popd
pause
endlocal
exit /b 1
