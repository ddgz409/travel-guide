@echo off
chcp 65001 >nul
REM 旅行攻略生成器 - 一键启动脚本（Windows）
REM 同时启动后端(8000)和前端(3000)

echo ========================================
echo   旅行攻略生成器 - 启动中...
echo ========================================

REM 检查 .env 是否配置了 key
cd /d "%~dp0backend"
findstr "your-amap-api-key-here" .env >nul 2>&1
if %errorlevel% equ 0 (
    echo [警告] 后端 .env 中 AMAP_API_KEY 仍是占位符，请先填入真实 key
    pause
)

cd /d "%~dp0frontend"
findstr "your-amap-js-api-key-here" .env.local >nul 2>&1
if %errorlevel% equ 0 (
    echo [提示] 前端 .env.local 中 NEXT_PUBLIC_AMAP_JS_KEY 仍是占位符，地图将不显示
)

echo.
echo [1/2] 启动后端 (http://127.0.0.1:8000) ...
start "travel-guide-backend" cmd /k "cd /d %~dp0backend && .venv\Scripts\activate && uvicorn app.main:app --reload --port 8000"

echo [2/2] 启动前端 (http://localhost:3000) ...
start "travel-guide-frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ========================================
echo   启动完成！
echo   后端 API: http://127.0.0.1:8000/docs
echo   前端页面: http://localhost:3000
echo ========================================
echo.
echo 关闭窗口或按任意键退出此启动器（前后端窗口需单独关闭）
pause >nul
