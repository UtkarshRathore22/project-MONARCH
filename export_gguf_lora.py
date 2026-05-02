"""Export LoRA adapter only (smaller file, requires base model at inference time)"""
import torch
from unsloth import FastLanguageModel

max_seq_length = 2048
model, tokenizer = FastLanguageModel.from_pretrained(
    model_name = "monarch_final",  # Output from train_monarch.py Stage 2
    max_seq_length = max_seq_length,
    dtype = None,
    load_in_4bit = True,
)

print("Exporting LoRA adapter to GGUF...")
model.save_pretrained_gguf("monarch-phi-3.5-lora", tokenizer, save_method = "lora")
print("Export complete!")
