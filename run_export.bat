@echo off
echo Executing final GGUF merge and export...
wsl bash -c "cd ~/monarch-train && source venv/bin/activate && python3 /mnt/c/Projects/project-MONARCH/export_gguf.py; echo ''; echo 'Export Process Ended. Press any key to close...'; read -n 1"
pause
