"""
Monarch Architect v3 — Two-Stage Training Pipeline
Stage 1: SFT on 4,300 cleaned examples
Stage 2: DPO on 977 contrastive pairs
Export: Q6_K GGUF for Ollama deployment

Hardware target: RTX 4050 6GB VRAM
"""

import argparse
from unsloth import FastLanguageModel, PatchDPOTrainer
from datasets import load_dataset
from trl import SFTTrainer, DPOTrainer, DPOConfig
from transformers import TrainingArguments
import torch, os

# --- Configuration ---
BASE_MODEL = "unsloth/Phi-3.5-mini-instruct"
MAX_SEQ_LENGTH = 2048
DTYPE = None  # auto-detect
LOAD_IN_4BIT = True

# LoRA config
LORA_R_SFT = 32
LORA_R_DPO = 16
LORA_ALPHA = 32
LORA_DROPOUT = 0
TARGET_MODULES = [
    "q_proj", "k_proj", "v_proj", "o_proj",
    "gate_proj", "up_proj", "down_proj",
]

def stage1_sft(data_path="train_sft_combined.jsonl", output_dir="./monarch_sft"):
    """Stage 1: Supervised Fine-Tuning on correct examples"""
    print("\n" + "=" * 60)
    print("  STAGE 1: Supervised Fine-Tuning (SFT)")
    print("=" * 60)

    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=BASE_MODEL,
        max_seq_length=MAX_SEQ_LENGTH,
        dtype=DTYPE,
        load_in_4bit=LOAD_IN_4BIT,
    )

    model = FastLanguageModel.get_peft_model(
        model,
        r=LORA_R_SFT,
        lora_alpha=LORA_ALPHA,
        lora_dropout=LORA_DROPOUT,
        target_modules=TARGET_MODULES,
        bias="none",
        use_gradient_checkpointing="unsloth",
        random_state=42,
    )

    dataset = load_dataset("json", data_files=data_path, split="train")
    print(f"  SFT Dataset: {len(dataset)} examples")

    def formatting_func(examples):
        """Format messages into Phi-3.5 chat template.
        Handles both batched mode (list of message lists) and
        single-example mode (single message list) from TRL."""
        messages_data = examples["messages"]

        # Detect if single example (list of dicts) or batch (list of lists)
        if isinstance(messages_data, list) and len(messages_data) > 0 and isinstance(messages_data[0], dict):
            # Single example mode: messages_data is [{"role":..., "content":...}, ...]
            all_msg_lists = [messages_data]
        else:
            # Batched mode: messages_data is [[{"role":..., "content":...}, ...], ...]
            all_msg_lists = messages_data

        texts = []
        for msgs in all_msg_lists:
            text = ""
            for msg in msgs:
                role = msg["role"]
                content = msg.get("content", "")
                if role == "system":
                    text += f"<|system|>\n{content}<|end|>\n"
                elif role == "user":
                    text += f"<|user|>\n{content}<|end|>\n"
                elif role == "assistant":
                    text += f"<|assistant|>\n{content}<|end|>\n"
            texts.append(text)
        return texts

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset,
        formatting_func=formatting_func,
        max_seq_length=MAX_SEQ_LENGTH,
        dataset_num_proc=2,
        packing=True,
        args=TrainingArguments(
            output_dir=output_dir,
            per_device_train_batch_size=1,
            gradient_accumulation_steps=32,
            warmup_steps=10,
            num_train_epochs=3,
            learning_rate=2e-4,
            fp16=not torch.cuda.is_bf16_supported(),
            bf16=torch.cuda.is_bf16_supported(),
            logging_steps=10,
            save_steps=50,
            optim="adamw_8bit",
            weight_decay=0.01,
            lr_scheduler_type="cosine",
            seed=42,
        ),
    )

    print("  Training...")
    trainer.train()
    print("  Saving SFT model...")
    model.save_pretrained(output_dir)
    tokenizer.save_pretrained(output_dir)
    print(f"  ✓ Stage 1 complete. Model saved to {output_dir}")
    return model, tokenizer


def stage2_dpo(model=None, tokenizer=None, data_path="train_dpo.jsonl", sft_dir="./monarch_sft", output_dir="./monarch_final"):
    """Stage 2: Direct Preference Optimization on contrastive pairs"""
    print("\n" + "=" * 60)
    print("  STAGE 2: Direct Preference Optimization (DPO)")
    print("=" * 60)

    # Always reload from the saved SFT checkpoint to get a clean base model
    # (the in-memory model from stage1 already has LoRA adapters that conflict)
    print("  Loading SFT model from disk...")
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=sft_dir,
        max_seq_length=MAX_SEQ_LENGTH,
        dtype=DTYPE,
        load_in_4bit=LOAD_IN_4BIT,
    )

    # The SFT checkpoint includes LoRA adapters. We need to merge them
    # into the base weights before applying fresh DPO LoRA adapters.
    try:
        model = model.merge_and_unload()
        print("  Merged SFT LoRA into base weights.")
    except Exception as e:
        print(f"  Note: Could not merge LoRA ({e}), attempting direct DPO adapter attach...")

    model = FastLanguageModel.get_peft_model(
        model,
        r=LORA_R_DPO,
        lora_alpha=LORA_R_DPO,
        lora_dropout=LORA_DROPOUT,
        target_modules=TARGET_MODULES,
        bias="none",
        use_gradient_checkpointing="unsloth",
        random_state=42,
    )

    PatchDPOTrainer()

    dataset = load_dataset("json", data_files=data_path, split="train")
    print(f"  DPO Dataset: {len(dataset)} pairs")

    dpo_config = DPOConfig(
        output_dir=output_dir,
        per_device_train_batch_size=1,
        gradient_accumulation_steps=8,
        warmup_steps=5,
        num_train_epochs=1,
        learning_rate=5e-5,
        fp16=not torch.cuda.is_bf16_supported(),
        bf16=torch.cuda.is_bf16_supported(),
        logging_steps=5,
        save_steps=50,
        optim="adamw_8bit",
        beta=0.1,
        max_length=1024,
        max_prompt_length=512,
        seed=42,
    )

    trainer = DPOTrainer(
        model=model,
        ref_model=None,  # Use implicit reference
        tokenizer=tokenizer,
        train_dataset=dataset,
        args=dpo_config,
    )

    print("  Training...")
    trainer.train()
    print("  Saving DPO model...")
    model.save_pretrained(output_dir)
    tokenizer.save_pretrained(output_dir)
    print(f"  ✓ Stage 2 complete. Model saved to {output_dir}")
    return model, tokenizer


def export_gguf(model=None, tokenizer=None, model_dir="./monarch_final"):
    """Export to Q6_K GGUF for Ollama deployment"""
    print("\n" + "=" * 60)
    print("  EXPORT: Q6_K GGUF")
    print("=" * 60)

    if model is None:
        model, tokenizer = FastLanguageModel.from_pretrained(
            model_name=model_dir,
            max_seq_length=MAX_SEQ_LENGTH,
            dtype=DTYPE,
            load_in_4bit=LOAD_IN_4BIT,
        )

    model.save_pretrained_gguf(
        "monarch-phi-3.5",
        tokenizer,
        quantization_method="q6_k",
    )
    print("  ✓ Exported: monarch-phi-3.5-Q6_K.gguf")
    print("  Next: ollama create monarch-architect -f Modelfile")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Monarch Training Pipeline")
    parser.add_argument("--stage", choices=["sft", "dpo", "export", "all"], default="all")
    parser.add_argument("--sft-data", default="train_sft_combined.jsonl")
    parser.add_argument("--dpo-data", default="train_dpo.jsonl")
    args = parser.parse_args()

    if args.stage in ("sft", "all"):
        model, tokenizer = stage1_sft(data_path=args.sft_data)

    if args.stage in ("dpo", "all"):
        if args.stage == "dpo":
            model, tokenizer = None, None
        model, tokenizer = stage2_dpo(model=model if args.stage == "all" else None,
                                       tokenizer=tokenizer if args.stage == "all" else None,
                                       data_path=args.dpo_data)

    if args.stage in ("export", "all"):
        if args.stage == "export":
            model, tokenizer = None, None
        export_gguf(model=model if args.stage == "all" else None,
                    tokenizer=tokenizer if args.stage == "all" else None)
