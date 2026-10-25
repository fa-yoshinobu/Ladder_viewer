@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "%~dp0windows\LadderViewer.exe" (
  echo Windows版が見つかりません。windows\LadderViewer.exe を確認してください。
  exit /b 1
)
start "" "%~dp0windows\LadderViewer.exe"
exit /b 0
