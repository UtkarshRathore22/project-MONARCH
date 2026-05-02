@echo off
echo Monitoring live download size... (Press Ctrl+C to stop)
:loop
wsl bash -c "du -sh ~/.cache/huggingface/hub/models--unsloth--Phi-3.5-mini-instruct 2>/dev/null || echo 'Starting download...'"
timeout /t 2 >nuloop
goto loop
