@echo off
chcp 65001 >nul 2>&1
title QuickSend - 一键构建
echo.
echo ========================================
echo   QuickSend 一键构建脚本
echo ========================================
echo.

:: 检查 Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装: https://nodejs.org/
    pause
    exit /b 1
)
echo [√] Node.js 已安装

:: 检查 Rust
if exist "%USERPROFILE%\.cargo\bin\cargo.exe" (
    set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
)

where rustc >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] 未检测到 Rust，正在自动安装...
    echo     下载 rustup-init.exe ...
    curl -L -o "%TEMP%\rustup-init.exe" https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe 2>nul
    if exist "%TEMP%\rustup-init.exe" (
        echo     运行安装程序（默认选项即可）...
        "%TEMP%\rustup-init.exe" -y --default-toolchain stable
        call "%USERPROFILE%\.cargo\bin\cargo" --version >nul 2>&1
        if %errorlevel% neq 0 (
            echo [错误] Rust 安装失败，请手动安装: https://rustup.rs/
            pause
            exit /b 1
        )
        set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
        echo [√] Rust 安装完成
    ) else (
        echo [错误] 下载 Rust 安装程序失败
        echo     请手动安装: https://rustup.rs/
        start https://rustup.rs/
        pause
        exit /b 1
    )
) else (
    echo [√] Rust 已安装
)

:: 安装前端依赖
echo.
echo [1/3] 安装前端依赖...
call npm install
if %errorlevel% neq 0 (
    echo [错误] npm install 失败
    pause
    exit /b 1
)
echo [√] 前端依赖安装完成

:: 构建
echo.
echo [2/3] 正在构建 QuickSend（首次编译需要几分钟，请耐心等待）...
echo.
call npx tauri build --no-bundle
if %errorlevel% neq 0 (
    echo [错误] 构建失败，请查看上方错误信息
    pause
    exit /b 1
)

echo.
echo [3/3] 构建完成！
echo.
echo ========================================
echo   构建成功！
echo ========================================
echo.
echo   可执行文件位置:
echo   src-tauri\target\release\quicksend.exe
echo.

:: 打开输出目录
if exist "src-tauri\target\release\quicksend.exe" (
    echo   正在打开程序...
    start "" "src-tauri\target\release\quicksend.exe"
)

explorer /select,"src-tauri\target\release\quicksend.exe"
pause
