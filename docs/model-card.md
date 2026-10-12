---
license: apache-2.0
base_model: Qwen/Qwen2.5-1.5B-Instruct
pipeline_tag: text-classification
library_name: onnxruntime
language:
- en
tags:
- onnx
- quantized
- 4-bit
- lora
- reward-model
- preference-modeling
- chatbot-arena
- kaggle
---

# ArenaJudge: Qwen2.5-1.5B preference classifier (ONNX, 4-bit weight-only)

Predicts which of two chatbot responses a human would prefer: **A wins / B wins / tie**.
Trained for Kaggle's [LLM Classification Finetuning](https://www.kaggle.com/competitions/llm-classification-finetuning) competition (Chatbot Arena human votes), then quantized for **CPU** serving.

**Live demo:** [ArenaJudge Space](https://huggingface.co/spaces/dheepakkaran/arenajudge)

## Model
| | |
|---|---|
| Base model | Qwen2.5-1.5B-Instruct |
| Fine-tuning | LoRA (r=16, alpha=32) on all attention + MLP projections; 3-class sequence-classification head |
| Training data | 30,000 rows of the competition's `train.csv` (shuffled with seed 42; rows 12,000–42,000) |
| Training | 1 epoch, fp16 on 1× NVIDIA T4, LR 1e-4 (LoRA) / 5e-5 (head), head initialized with small random values (std 1e-3) |
| This export | ONNX, **weight-only 4-bit** (`MatMulNBits`, block size 32, symmetric), 197 MatMul layers quantized, 1.76 GB |

## Results
| Setting | Log loss (lower is better) |
|---|---|
| Validation, 2,000 held-out rows, GPU fp16 | 0.9872 |
| + swap test-time augmentation | 0.9847 |
| + LightGBM length/style stacker | 0.9793 |
| **Kaggle public leaderboard** (with TTA + stacker) | **1.00281** |
| Uniform 1/3 baseline | 1.0986 |

### CPU engines (80 validation rows, batch size 1, ~350-token inputs)
| Engine | Log loss | p50 latency, 4 threads | p50 latency, 2 threads | Size |
|---|---|---|---|---|
| PyTorch fp32 | 1.0395 | 8.6 s | | ~6.2 GB |
| ONNX Runtime fp32 | 1.0395 | 6.2 s | | ~6.2 GB |
| ONNX dynamic INT8 | 1.0501 | 3.5 s | | |
| ONNX dynamic INT8, per-channel | 1.0987 | 3.5 s | 2.9 s | 1.55 GB |
| ONNX weight-only 8-bit | 1.0400 | 8.3 s | 8.5 s | 2.41 GB |
| **ONNX weight-only 4-bit (this model)** | **1.0393** | 6.6 s | **5.6 s** | **1.76 GB** |

Dynamic INT8 also quantizes **activations**, and activation outliers in LLMs broke accuracy. Weight-only quantization keeps activations in fp32 and matched fp32 accuracy. 80 rows is a small sample, so treat small differences as noise.

## Input format
The model expects exactly this layout (each part truncated separately), and outputs `probs` = [A wins, B wins, tie]:
```
Prompt: {prompt, max 96 tokens}

Response A: {response_a, max 200 tokens}

Response B: {response_b, max 200 tokens}

Which response is better?
```
`demo_config.json` holds the exact headers and limits.

## Usage
```python
import json, numpy as np, onnxruntime as ort
from huggingface_hub import snapshot_download
from transformers import AutoTokenizer

path = snapshot_download("dheepakkaran/arenajudge-qwen2.5-1.5b-lora-onnx-w4")
cfg = json.load(open(f"{path}/demo_config.json"))
tok = AutoTokenizer.from_pretrained(path)
sess = ort.InferenceSession(f"{path}/{cfg['onnx_file']}", providers=["CPUExecutionProvider"])

H = {k: tok(v, add_special_tokens=False)["input_ids"] for k, v in cfg["headers"].items()}
T = lambda s, n: tok(s, add_special_tokens=False, truncation=True, max_length=n)["input_ids"]
def predict(prompt, a, b):
    ids = H["prompt"] + T(prompt, cfg["max_p"]) + H["a"] + T(a, cfg["max_r"]) + H["b"] + T(b, cfg["max_r"]) + H["q"]
    x = np.array([ids], dtype=np.int64)
    return dict(zip(cfg["labels"], sess.run(["probs"], {"input_ids": x, "attention_mask": np.ones_like(x)})[0][0]))

print(predict("How do I reverse a list in Python?",
              "Use my_list.reverse() or my_list[::-1].", "You can't reverse lists in Python."))
```

## Limitations
- Sees at most 200 tokens of each response, so very long answers are judged on their beginning.
- Learned from Chatbot Arena votes: it reflects those users' preferences (including a preference for longer, formatted answers), not ground-truth quality.
- Slight position bias; use swap test-time augmentation (score A/B and B/A, then average) for fairer results.
- Not intended for high-stakes decisions.

## Team
Team "Dk" on Kaggle: **Dheepak Karan** (training pipeline, inference optimization, CUDA profiling, quantization, deployment) and **Karuniya Premnath** (v2 model training).

Base model © Qwen team (Apache-2.0). Competition data is subject to the Kaggle competition rules.
