@echo off
chcp 65001 >nul
title 旅行攻略 · 启动器

echo.
echo ============================================
echo   旅行攻略生成器 ^| 启动中...
echo ============================================
echo.

REM ---- 检查 API Key ----
cd /d "%~dp0backend"
findstr /c:"your-amap-api-key-here" .env >nul 2>&1
if %errorlevel% equ 0 (
    echo [警告] 后端 AMAP_API_KEY 仍是占位符
    echo        请先编辑 backend\.env 填入高德 Key
    echo.
)
findstr /c:"your-zhipu-api-key-here" .env >nul 2>&1
if %errorlevel% equ 0 (
    echo [警告] 后端 ZHIPU_API_KEY 仍是占位符
    echo        请先编辑 backend\.env 填入智谱 Key
    echo.
)

cd /d "%~dp0frontend"
findstr /c:"your-amap-js-api-key-here" .env.local >nul 2>&1
if %errorlevel% equ 0 (
    echo [提示] 前端地图 Key 未配置，地图将不显示
    echo        （不影响其他功能）
    echo.
)

REM ---- 检查 venv ----
if not exist "%~dp0backend\.venv\Scripts\python.exe" (
    echo [错误] 后端虚拟环境不存在，请先执行：
    echo         cd backend
    echo         python -m venv .venv
    echo         .venv\Scripts\pip install -r requirements.txt
    pause
    exit /b 1
)

REM ---- 检查 node_modules ----
if not exist "%~dp0frontend
ode_modules\" (
    echo [提示] 正在安装前端依赖...
    cd /d "%~dp0frontend"
    call npm install
    if %errorlevel% neq 0 (
        echo [错误] npm install 失败
        pause
        exit /b 1
    )
)

echo [√] 环境检查完成
echo.

REM ---- 启动后端 ----
echo [1/2] 启动后端 (http://127.0.0.1:8000) ...
cd /d "%~dp0backend"
start "Backend" cmd /k ".venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000"
timeout /t 3 /nobreak >nul

REM ---- 启动前端 ----
echo [2/2] 启动前端 (http://localhost:3000) ...
cd /d "%~dp0frontend"
start "Frontend" cmd /k "npm run dev"

echo.
echo ============================================
echo   启动完成！
echo   后端 API 文档：http://127.0.0.1:8000/docs
echo   前端页面    ：http://localhost:3000
echo ============================================
echo.
echo   关闭弹出的两个窗口即可停止
echo   本窗口可以关闭了
echo.
timeout /t 8 /nobreak >nul
