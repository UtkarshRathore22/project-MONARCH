"""Export the final Monarch model to GGUF for Ollama deployment"""
import torch
from unsloth import FastLanguageModel

max_seq_length = 2048
model, tokenizer = FastLanguageModel.from_pretrained(
    model_name = "monarch_final",  # Output from train_monarch.py Stage 2
    max_seq_length = max_seq_length,
    dtype = None,
    load_in_4bit = True,
)

print("Exporting to GGUF (Q6_K)...")
model.save_pretrained_gguf("monarch-phi-3.5", tokenizer, quantization_method = "q6_k")
print("Export complete!")
print("Next: ollama create monarch-architect -f Modelfile")
