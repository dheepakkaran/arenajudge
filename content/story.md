# ArenaJudge: the story

Source text for the website and the README. Plain English, short sentences.
Every number here also lives in `data/project.json`. Do not invent new numbers.

---

## In one line

I fine-tuned a small language model to predict **which of two chatbot answers a human would prefer**, placed in the **top ~21% of ~240 teams** on Kaggle, and made it run on a **free CPU in under half a second**.

---

## 1. The competition

**Chatbot Arena** is a website where people ask a question, two anonymous chatbots answer, and the person votes: **A is better, B is better, or tie**.

Kaggle's **LLM Classification Finetuning** competition gives ~57,000 of these votes.
The task: **given the question and both answers, predict the vote.**

- The model outputs three probabilities: A wins, B wins, tie.
- Score = **log loss**. Lower is better.
- Guessing 1/3 for everything scores **1.0986**. That's the line to beat.
- About **240 teams**. The leaderboard is **rolling**: only submissions from the last 2 months count.

**Why this competition?** I want to work in **LLM inference**: making models fast, small and cheap to serve. I needed a project where speed and memory matter, not just accuracy, and where a public leaderboard proves the model actually works.

---

## 2. Building the first model (Day 1–2)

- Started from **Qwen2.5-1.5B-Instruct**, a small open language model.
- Turned it into a **classifier**: a small output layer with 3 outputs (A wins, B wins, tie).
- Fine-tuned it with **LoRA**: instead of changing all 1.5 billion weights, it trains a small set of extra weights. Faster and fits on a free GPU.
- Each input looks like: `Prompt: … Response A: … Response B: … Which response is better?` The prompt is cut to 96 tokens and each answer to 200 tokens.
- Trained on Kaggle's free **NVIDIA T4** GPU in **fp16** (the T4 doesn't support bf16).

**Problems fixed along the way:**
- Library clashes (a pre-installed `torchao` broke `peft`; Transformers v5 removed some training options).
- Training blew up at a high learning rate and crawled at a low one. Fix: **separate learning rates**, 1e-4 for LoRA and 5e-5 for the output layer.

**Data rules (no leakage):** the data is shuffled once with a fixed seed.
- Rows 0–1,999: **validation** for every model.
- Rows 2,000–11,999: **never trained on**, kept for the stacker (section 3).
- Training uses rows from 12,000 onward.

**v1 result:** 20,000 training rows, 145 minutes on one T4, validation log loss **1.0167**.

---

## 3. Two tricks that helped

**Swap-TTA (test-time augmentation).** The model slightly favours one answer position. So it answers twice, once with A and B swapped, and averages.
→ Validation 1.0167 → **1.0075**. First submission: **1.01558, rank #53 of ~240**.

**A stacker on top.** Humans tend to prefer longer, nicely formatted answers. A **LightGBM** model takes the classifier's probabilities plus 28 simple features (length, markdown, style) and learns to combine them. It's trained on the 10,000 rows no model ever saw.
→ Leaderboard **1.01190, rank ~#48**.

---

## 4. Teamwork: the v2 model

My teammate **Karuniya Premnath** trained a bigger v2 model on her own Kaggle GPU quota: **30,000 rows** instead of 20,000.

- Her first 4-hour run **never learned**: the loss stayed flat.
- Diagnosis from her training logs: the output layer started at **exactly zero**, so no learning signal reached the LoRA weights (a "saddle point").
- Fix: start the output layer at **tiny random values** (std 0.001).
- Her rerun (~3.5 hours) reached validation log loss **0.9872**. With swap-TTA **0.9847**, with the stacker **0.9793**.

Submitted with my inference pipeline: **public leaderboard 1.00281, rank ~#48**.
Today the team is **#51**. Rank moves as other teams submit; the score is what we control.

---

## 5. Making it fast on a GPU

Same model, same 1,000 validation rows, 9 ways to run it:

| Setup | Time | Samples/sec | GPU memory | Speedup |
|---|---|---|---|---|
| fp32, one at a time (naive) | 422.8 s | 2.4 | 6.25 GB | 1.0× |
| fp16, one at a time | 106.8 s | 9.4 | 3.15 GB | 4.0× |
| fp16, batches of 16 | 105.8 s | 9.5 | 3.65 GB | 4.0× |
| fp16, batches of 16, sorted by length | 77.2 s | 13.0 | 3.89 GB | 5.5× |
| fp16, batches of 32, sorted | 78.6 s | 12.7 | 4.67 GB | 5.4× |
| 8-bit (bitsandbytes) | 92.5 s | 10.8 | 2.59 GB | 4.6× |
| 4-bit NF4 (bitsandbytes) | 78.8 s | 12.7 | **1.12 GB** | 5.4× |
| swap-TTA (2 passes, more accurate) | 155.6 s | 6.4 | 3.89 GB | 2.7× |
| **2 GPUs in parallel** | **40.0 s** | **25.0** | 3.90 GB | **10.6×** |

What I learned:
- **fp16** alone: 4× faster, half the memory, same accuracy.
- **Bigger batches alone didn't help.** One sample already kept the GPU ~100% busy, so the work was compute-bound.
- **Sorting by length** cut wasted padding: 5.5× total.
- **4-bit** cut memory 2.8× with almost no accuracy loss, but **wasn't faster**: the bottleneck was compute, not memory.
- **Two GPUs** with the data split between them: **10.6×** faster than naive.

---

## 6. Looking inside the GPU (CUDA profiling)

Five experiments with `torch.profiler` and CUDA events:

- **Where the time goes:** matrix multiplies 60.8%, small element-wise ops 25.3%, attention 13.9%. And **8.2% of all time was attention running on a slow fallback path.**
- **The bug hunt:** some batches were ~3× slower per layer. Qwen2.5 uses **grouped-query attention** (12 query heads share 2 key/value heads). When every sample in a batch hit the exact length cap (515 tokens), there was **no padding**. That took a different code path that skipped expanding the key/value heads, so PyTorch **silently fell back** from the fast fused attention kernel to a slow unfused one.
  **Fix:** pad every batch to a multiple of 8 tokens. Those batches got **23–24% faster**, **7.6% overall**.
- **CUDA Graphs** (record the GPU work once, replay it): **2.29× faster** on short inputs (32 tokens), 1.27× at 512 tokens.
- **Tried, didn't help, and why:** pinned memory + CUDA streams (0.83–0.93×: the CPU was never the bottleneck), `torch.compile` (0.94–1.04×: its fusion only touches the 25% element-wise part).

---

## 7. vLLM

- Got **vLLM 0.31** running on Kaggle's older T4 GPUs (FlashAttention 2 isn't supported there, so it uses Triton attention).
- Served our classifier through vLLM's **pooling runner**: **14.6 samples/sec** vs 13.0 for the best Hugging Face single-GPU setup, with matching predictions (max probability difference 0.0011).
- Also served a 7B model (AWQ 4-bit) on one GPU and split across two GPUs (tensor parallel).

---

## 8. Making it small enough for a free CPU

A live demo can't use a GPU for free, so the model had to run on a plain CPU.

| CPU engine | Log loss | Time per prediction (4 threads) | Size |
|---|---|---|---|
| PyTorch fp32 (reference) | 1.0395 | 8.6 s | ~6.2 GB |
| ONNX Runtime fp32 | 1.0395 | 6.2 s | ~6.2 GB |
| ONNX dynamic INT8 | 1.0501 ❌ | 3.5 s | — |
| PyTorch dynamic INT8 | 1.0914 ❌ | 4.6 s | — |
| ONNX INT8 per-channel | 1.0987 ❌ (random level) | 3.5 s | 1.55 GB |
| ONNX weight-only 8-bit | 1.0400 ✅ | 8.3 s | 2.41 GB |
| **ONNX weight-only 4-bit** | **1.0393 ✅** | 6.6 s | **1.76 GB** |

(80 validation rows, ~350-token inputs.)

What I learned:
- **ONNX Runtime** was 1.4× faster than PyTorch on CPU with identical predictions.
- **Plain INT8 broke the model.** It also squeezes the *activations* (the numbers flowing between layers), and LLM activations have big outliers.
- **Weight-only 4-bit** squeezes only the weights, in blocks of 32, and keeps activations at full precision. **Same accuracy as fp32 at 3.5× smaller.** That's the idea behind AWQ, GPTQ and llama.cpp.

---

## 9. Going live

- Uploaded the 4-bit model to the **Hugging Face Hub**.
- Built a **Gradio** app on a free **Hugging Face Space**. On the free tier, Gradio Spaces run on ZeroGPU hardware; this app runs the model on its CPU.
- **First request took 27.9 seconds.** The app asked how many CPUs it had and got **192**, the whole server's count. The container may only use a few, so 192 threads fought over them.
- **Fix:** read the container's real CPU limit (its cgroup quota) and cap the threads.
- **Now: 0.46 seconds** for a short example, even with swap-TTA (2 passes). Roughly **60× faster**.

---

## 10. Who did what

**Dheepak Karan**
- Chose the competition and planned the project
- Built the training pipeline and data split (no leakage)
- Built the v1 model, swap-TTA and the LightGBM stacker
- Diagnosed the zero-init "never learns" bug
- All inference work: GPU benchmarks, CUDA profiling, vLLM, quantization, ONNX
- Deployment: Hugging Face model, live Space, website

**Karuniya Premnath**
- Trained the v2 model (30,000 rows) on her Kaggle GPU quota
- Ran the long training jobs, including the run that exposed the zero-init bug and the fixed rerun
- Her v2 model powers the team's best score (1.00281)

---

## 11. What I learned

- **Measure first.** Most "obvious" speedups (bigger batches, pinned memory, torch.compile) did nothing here. The profiler showed why.
- **Silent slow paths are real.** A missing bit of padding sent attention to a 3× slower kernel with no warning.
- **Quantize weights, not activations**, for LLMs on CPU.
- **Containers lie about CPUs.** `os.cpu_count()` sees the host, not your quota.
- **Rank isn't fully in your control; score is.**

---

## 12. Honest limitations

- It predicts **what humans prefer**, not what's correct. Humans also like longer answers.
- It only sees the first **200 tokens** of each answer.
- Top teams use much larger models and ensembles; this is a 1.5B model built on free GPUs.
- CPU numbers come from an 80-row check; live latency depends on input length and the Space's hardware.
- The free Space sleeps when idle; the first visitor after a while waits ~1–3 minutes.

---

## 13. What's next

- **v2b:** longer answers (400 tokens) plus each answer's word count in the input.
- Resubmit the best version before the 2-month rolling window drops it.
