"""Export the SFT-trained model to GGUF format for Ollama"""
from unsloth import FastLanguageModel

model, tokenizer = FastLanguageModel.from_pretrained(
    model_name="./monarch_sft",
    max_seq_length=2048,
    dtype=None,
    load_in_4bit=True,
)

print("Exporting to Q6_K GGUF...")
model.save_pretrained_gguf(
    "/mnt/c/Projects/project-MONARCH/monarch-phi-3.5",
    tokenizer,
    quantization_method="q6_k",
)
print("✓ Export complete! monarch-phi-3.5-Q6_K.gguf ready.")
