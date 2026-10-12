---
title: ArenaJudge
emoji: ⚖️
colorFrom: indigo
colorTo: pink
sdk: gradio
app_file: app.py
pinned: false
short_description: Predict which chatbot answer humans prefer (1.5B, CPU)
---

# ArenaJudge

Paste a prompt and two chatbot responses; the model predicts which one a human would prefer (A, B, or tie).

- **Model:** [`dheepakkaran/arenajudge-qwen2.5-1.5b-lora-onnx-w4`](https://huggingface.co/dheepakkaran/arenajudge-qwen2.5-1.5b-lora-onnx-w4): Qwen2.5-1.5B-Instruct fine-tuned with LoRA as a 3-way classifier on Kaggle's LLM Classification Finetuning data (Chatbot Arena votes)
- **Serving:** CPU (ONNX Runtime), 4-bit weight-only quantization (accuracy unchanged vs fp32 on our CPU check)
- **API:** `/predict` (prompt, response_a, response_b, swap_tta) → probabilities for "Response A wins", "Response B wins", "Tie"
- **Swap-TTA:** asks twice with A and B swapped and averages, which removes position bias (2× slower)
