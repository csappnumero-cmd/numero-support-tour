@echo off
cd /d "%~dp0"
python APPLY_FINAL_UI_CACHE_FIX.py
if errorlevel 1 (
  echo.
  echo PATCH FAILED - send a screenshot of this window.
) else (
  echo.
  echo PATCH FINISHED SUCCESSFULLY.
)
pause
