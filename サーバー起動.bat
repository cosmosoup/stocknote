@echo off
cd /d "%~dp0"
echo ポートフォリオレポート サーバーを起動中...
echo ブラウザで http://localhost:3000 を開いてください
echo.
echo 終了するには このウィンドウを閉じてください
echo.
node start-dev.js
pause
