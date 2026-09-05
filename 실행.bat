@echo off
chcp 65001 > nul
title ASEA 업무 캘린더

:: py 런처 우선, 없으면 python 시도
set PYTHON_CMD=

py --version > nul 2>&1
if not errorlevel 1 (
    set PYTHON_CMD=py
    goto :found_python
)

python --version > nul 2>&1
if not errorlevel 1 (
    set PYTHON_CMD=python
    goto :found_python
)

python3 --version > nul 2>&1
if not errorlevel 1 (
    set PYTHON_CMD=python3
    goto :found_python
)

echo [오류] Python이 설치되어 있지 않거나 PATH에 추가되지 않았습니다.
echo.
echo 해결 방법:
echo  1. https://www.python.org/downloads/ 에서 Python 3.11 이상 설치
echo  2. 설치 시 "Add Python to PATH" 체크박스 반드시 선택
echo  3. 설치 후 PowerShell/명령 프롬프트 새로 열고 다시 실행
echo.
pause
exit /b 1

:found_python
echo [확인] Python 발견: %PYTHON_CMD%

:: 패키지 설치 확인
%PYTHON_CMD% -c "import PyQt6.QtWebEngineWidgets" > nul 2>&1
if errorlevel 1 (
    echo [설치] 필요한 패키지를 설치합니다...
    %PYTHON_CMD% -m pip install PyQt6 PyQt6-WebEngine
    if errorlevel 1 (
        echo [오류] 패키지 설치 실패. 인터넷 연결을 확인하거나 관리자 권한으로 실행해 주세요.
        pause
        exit /b 1
    )
)

:: keyboard 패키지 확인
%PYTHON_CMD% -c "import keyboard" > nul 2>&1
if errorlevel 1 (
    %PYTHON_CMD% -m pip install keyboard
)

:: 실행
echo ASEA 업무 캘린더를 시작합니다...
%PYTHON_CMD% "%~dp0desktop_overlay.py"
