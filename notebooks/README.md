# Notebooks

Run on Kaggle (free GPUs). Order:

1. `llm-cls-train.ipynb`: fine-tune Qwen2.5-1.5B (LoRA) as a 3-class classifier. GPU T4, Internet ON.
2. `llm-cls-infer.ipynb`: 9-way inference benchmark + competition submission. GPU T4 x2.
3. `llm-cls-stack.ipynb`: LightGBM length/style stacker on unseen rows.
4. `cuda-profiling.ipynb`: E0–E5 CUDA profiling (attention fallback fix, CUDA Graphs).
5. `vllm-feasibility.ipynb`: vLLM on T4 (6 tests).
6. `onnx-export.ipynb`: CPU engines (PyTorch / ONNX Runtime, fp32 / INT8). CPU only.
7. `onnx-weightonly.ipynb`: weight-only 8-bit / 4-bit quantization, picks the demo engine. CPU only.

These copies have no outputs. The Kaggle versions (with outputs) are linked from the main README.
