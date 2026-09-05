@echo off
chcp 65001 > nul
title ASEA 업무 캘린더

:: Python 설치 확인
python --version > nul 2>&1
if errorlevel 1 (
    echo [오류] Python이 설치되어 있지 않습니다.
    echo https://www.python.org 에서 Python 3.11 이상을 설치해 주세요.
    pause
    exit /b 1
)

:: 패키지 설치 확인
python -c "import PyQt6.QtWebEngineWidgets" > nul 2>&1
if errorlevel 1 (
    echo [설치] 필요한 패키지를 설치합니다...
    pip install PyQt6 PyQt6-WebEngine
)

:: 실행
echo ASEA 업무 캘린더를 시작합니다...
python "%~dp0desktop_overlay.py"
