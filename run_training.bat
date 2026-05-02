@echo off
echo Starting Monarch Fine-Tuning Pipeline (SFT + DPO + GGUF Export)...
echo.
wsl bash -c "cd ~/monarch-train && source venv/bin/activate && python3 /mnt/c/Projects/project-MONARCH/train_monarch.py --stage all --sft-data /mnt/c/Projects/project-MONARCH/train_sft_combined.jsonl --dpo-data /mnt/c/Projects/project-MONARCH/train_dpo.jsonl 2>&1 | tee /mnt/c/Projects/project-MONARCH/training.log; echo ''; echo 'Training Process Ended. Press any key to close...'; read -n 1"
pause
i