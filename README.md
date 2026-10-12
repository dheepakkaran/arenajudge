# ArenaJudge

Predicting which chatbot answer humans prefer, then making it run on a free CPU in under half a second.

A fine-tuned Qwen2.5-1.5B classifier for Kaggle's **LLM Classification Finetuning** competition (Chatbot Arena votes), followed by inference work on GPU, vLLM and CPU, and a live demo. By **Dheepak Karan** with **Karuniya Premnath**.

**[Live demo](https://huggingface.co/spaces/dheepakkaran/arenajudge)** · **[Website](https://dheepakkaran.github.io/arenajudge/)** · **[Model](https://huggingface.co/dheepakkaran/arenajudge-qwen2.5-1.5b-lora-onnx-w4)** · **[Competition](https://www.kaggle.com/competitions/llm-classification-finetuning)**

Every number below comes from [`data/project.json`](data/project.json) (and the live rank from [`data/leaderboard.json`](data/leaderboard.json)).

---

## Results at a glance

| What | Result |
|---|---|
| Best public leaderboard score | **1.00281** log loss (lower is better; guessing 1/3 scores 1.0986) |
| Leaderboard rank | **#51 of ~240 teams** as of 2026-10-11, top ~21%. Rolling leaderboard: the rank changes as other teams submit. The [website](https://dheepakkaran.github.io/arenajudge/) shows the daily-updated rank. |
| Best validation log loss | **0.9793** (v2 + swap-TTA + stacker) |
| GPU inference speedup | **10.6×** faster than naive (2× T4 data parallel) |
| CUDA attention fix | **7.6%** faster overall (23–24% on the affected batches) |
| CPU model | ONNX weight-only 4-bit: **1.76 GB**, log loss 1.0393 vs 1.0395 for fp32 |
| Live latency | **0.46 s** for a short example with swap-TTA (2 passes), down from 27.9 s |

### Leaderboard history

| Date | Stage | Public score (log loss) | Rank | Who |
|---|---|---|---|---|
| 2026-10-06 | Uniform baseline (1/3 each) | 1.0986 | | |
| 2026-10-07 | v1: Qwen2.5-1.5B LoRA (20k rows) + swap-TTA | 1.01558 | #53 | Dheepak |
| 2026-10-07 | v1 + LightGBM length/style stacker | 1.0119 | ~#48 | Dheepak |
| 2026-10-10 | v2: 30k rows + small-random head init (+ TTA + stacker) | **1.00281** | ~#48 | Karuniya (model) + Dheepak (pipeline) |
| 2026-10-11 | Same submission, rank as of today (other teams kept submitting) | 1.00281 | #51 | |

`~` marks an approximate rank.

### Validation (2,000 held-out rows)

| Model | Validation log loss |
|---|---|
| v1, no TTA | 1.0167 |
| v1 + swap-TTA | 1.0075 |
| v1 + TTA + stacker | 1.0022 |
| v2, no TTA | 0.9872 |
| v2 + swap-TTA | 0.9847 |
| v2 + TTA + stacker | **0.9793** |

---

## How it works

**The task.** Chatbot Arena shows a person two anonymous chatbot answers to their question, and they vote: A is better, B is better, or tie. The competition gives 57,477 of these votes. The model sees the prompt and both answers and outputs three probabilities (A wins, B wins, tie). The score is log loss.

**Model.** Qwen2.5-1.5B-Instruct turned into a 3-class sequence classifier and fine-tuned with **LoRA** (r=16, alpha=32, on all attention + MLP projections). Trained for 1 epoch in fp16 on one NVIDIA T4 (the T4 has no bf16), with separate learning rates: 1e-4 for LoRA, 5e-5 for the classification head. A single learning rate either blew up or crawled.

**Input format.** Each part is truncated separately: the prompt to 96 tokens, each answer to 200.

```
Prompt: {prompt}

Response A: {response_a}

Response B: {response_b}

Which response is better?
```

**Swap-TTA.** The model slightly favours one answer position, so it scores the pair twice, once with A and B swapped, maps the swapped probabilities back, and averages.

**Stacker.** Humans tend to prefer longer, nicely formatted answers. A LightGBM model takes 28 inputs: the classifier's 3 probabilities plus 25 style features. These cover length (characters, words, lines), markdown (headers, lists, bold, code blocks), empty answers, identical answers and prompt length. It is trained on 10,000 rows that no classifier ever saw, using normal and A/B-swapped copies, and it predicts both ways and averages.

**Data split (no leakage).** The data is shuffled once with seed 42.

| Rows | Use |
|---|---|
| 0–1,999 | validation for every model |
| 2,000–11,999 | never trained on; stacker training rows |
| 12,000–31,999 | v1 training (20,000 rows) |
| 12,000–41,999 | v2 training (30,000 rows) |

**v1 → v2.** v1 trained on 20,000 rows in 145 minutes on one T4. Karuniya trained v2 on 30,000 rows on her own Kaggle GPU quota. Her first run (about 4 hours) never learned: the loss stayed flat. Dheepak traced it in her training logs. The classification head started at exactly zero, so no learning signal reached the LoRA weights. Starting the head at small random values (`normal(mean=0, std=1e-3)`) fixed it, and her 210-minute rerun reached validation 0.9872.

---

## Making it fast on a GPU

v1 model, 1,000 validation rows, NVIDIA T4. Accuracy column = validation log loss.

| Setup | Time (s) | Samples/s | GPU memory (GB) | Log loss | Speedup |
|---|---|---|---|---|---|
| fp32, batch 1 (naive) | 422.8 | 2.4 | 6.25 | 1.0373 | 1.0× |
| fp16, batch 1 | 106.8 | 9.4 | 3.15 | 1.0373 | 4.0× |
| fp16, batch 16 | 105.8 | 9.5 | 3.65 | 1.0373 | 4.0× |
| fp16, batch 16, length-sorted | 77.2 | 13.0 | 3.89 | 1.0373 | 5.5× |
| fp16, batch 32, length-sorted | 78.6 | 12.7 | 4.67 | 1.0373 | 5.4× |
| INT8 (bitsandbytes) | 92.5 | 10.8 | 2.59 | 1.0384 | 4.6× |
| 4-bit NF4 (bitsandbytes) | 78.8 | 12.7 | 1.12 | 1.0375 | 5.4× |
| swap-TTA (2 passes) | 155.6 | 6.4 | 3.89 | 1.0236 | 2.7× |
| **2× T4 data parallel** | **40.0** | **25.0** | 3.90 | 1.0373 | **10.6×** |

- **fp16** alone: 4× faster, half the memory, same accuracy.
- **Bigger batches alone didn't help.** One sample already kept the GPU busy, so the work was compute-bound. **Sorting by length** cut wasted padding: 5.5× in total.
- **4-bit** cut memory 2.8× with almost no accuracy loss, but **wasn't faster**: the bottleneck was compute, not memory.
- **Two GPUs** with the data split between them: 10.6× faster than naive.

## Looking inside the GPU (CUDA profiling)

Experiments with `torch.profiler` and CUDA events:

| | Experiment | Finding | Result |
|---|---|---|---|
| E0 | Baseline timing | GPU 99.8% busy, CPU prep 0.2%: compute-bound | 16.0 samples/s |
| E1 | torch.profiler kernel breakdown | matmul 60.8%, element-wise 25.3%, attention 13.9% (8.2% on a slow fallback path) | found the attention fallback |
| E2 | Pinned memory + CUDA stream | CPU was never the bottleneck | 0.83–0.93× (no gain) |
| E3 | torch.compile | fusion only touches the 25% element-wise part | 0.94–1.04× (no reliable gain) |
| E4 | CUDA Graphs, batch 1 | removes per-kernel launch overhead; matters most for short inputs | 2.29× at 32 tokens, 1.27× at 512 tokens |
| E5 | Attention fallback fix | see below | 23–24% faster on affected batches, 7.6% overall |

**The bug hunt.** Some batches were about 3× slower per layer. Qwen2.5 uses grouped-query attention: 12 query heads share 2 key/value heads. When every sample in a batch hit the 515-token length cap, there was no padding. That took a different code path that skipped expanding the key/value heads, and PyTorch silently fell back from the fused attention kernel to a slow unfused one. **Fix:** pad every batch to a multiple of 8 tokens.

## vLLM

- vLLM 0.31.0 runs on Kaggle's NVIDIA T4 (compute capability 7.5). FlashAttention 2 isn't supported there, so it uses the Triton attention backend (`TRITON_ATTN`).
- The classifier served through vLLM's **pooling runner** reached **14.6 samples/s**, vs 13.0 for the best Hugging Face single-GPU setup. Predictions match: max probability difference 0.00111, log loss 1.0064.
- Also served a 7B AWQ model on 1 GPU, and with tensor parallelism across 2 GPUs. 6 of 6 feasibility tests passed.

## Making it small enough for a free CPU

80 validation rows, batch 1, ~350-token inputs, Kaggle CPU. p50 = median time per prediction. The pick rule is the fastest engine whose log loss stays within +0.01 of fp32.

| Engine | Log loss | p50, 4 threads (s) | p50, 2 threads (s) | Size (GB) | Accuracy |
|---|---|---|---|---|---|
| PyTorch fp32 (reference) | 1.0395 | 8.6 | | ~6.2 | OK |
| ONNX Runtime fp32 | 1.0395 | 6.2 | | ~6.2 | OK |
| ONNX dynamic INT8 | 1.0501 | 3.5 | | | broken |
| PyTorch dynamic INT8 | 1.0914 | 4.6 | | | broken |
| ONNX INT8 per-channel | 1.0987 | 3.5 | 2.9 | 1.55 | broken (random level) |
| ONNX weight-only 8-bit | 1.0400 | 8.3 | 8.5 | 2.41 | OK |
| **ONNX weight-only 4-bit (deployed)** | **1.0393** | 6.6 | **5.6** | **1.76** | OK |

The fp32 size (~6.2 GB) is an estimate: 1.5B parameters × 4 bytes.

- **ONNX Runtime** was 1.4× faster than PyTorch on CPU, with the same log loss.
- **Plain INT8 broke the model.** Dynamic INT8 also quantizes the *activations* (the numbers flowing between layers), and LLM activations have big outliers.
- **Weight-only 4-bit** (`MatMulNBits`, blocks of 32, 197 MatMul layers) quantizes only the weights and keeps activations at full precision. It matched fp32 accuracy at 3.5× smaller. That's the idea behind AWQ, GPTQ and llama.cpp.

## Going live (the 192-CPU bug)

The 4-bit model is on the Hugging Face Hub and runs in a Gradio app on a free Hugging Face Space. Free-tier Gradio Spaces run on ZeroGPU hardware, but this app runs the model on the CPU.

- The **first request took 27.9 s** (short example, 1 pass, 192 threads). `os.cpu_count()` returned 192, the host's CPU count, while the container's quota is far lower, so 192 threads fought over a few cores.
- **Fix:** read the cgroup CPU quota, cap threads (8), disable thread spinning, warm up at startup. See [`space/app.py`](space/app.py).
- **Now: 0.46 s** for a short example, even with swap-TTA (2 passes, 8 threads). Roughly ~60× faster (the before and after used different short examples).

---

## Team: who did what

**Dheepak Karan** ([LinkedIn](https://www.linkedin.com/in/dheepakkaran) · [Kaggle](https://www.kaggle.com/dheepakkaranes) · [GitHub](https://github.com/dheepakkaran)), inference + pipeline owner
- Chose the competition and planned the project
- Built the training pipeline and leak-free data split
- Built v1, swap-TTA and the LightGBM stacker
- Diagnosed the zero-init "never learns" bug
- GPU benchmarks, CUDA profiling, vLLM, quantization, ONNX
- Deployment: Hugging Face model, live Space, this website

**Karuniya Premnath** ([LinkedIn](https://www.linkedin.com/in/karuniya-premnath/) · [Kaggle](https://www.kaggle.com/karuniyapremnath)), training owner (v2 model)
- Trained the v2 model (30,000 rows) on her Kaggle GPU quota
- Ran the long training jobs, including the run that exposed the zero-init bug and the fixed rerun
- Her v2 model powers the team's best score (1.00281)

---

## Repo layout

```
index.html                 the website (one page)
assets/css/style.css       styles (all colors are tokens on :root)
assets/js/main.js          loads the JSON, fills in numbers, navigation, quiz, demo window
assets/js/charts.js        hand-built SVG/HTML charts + their data tables
assets/js/people.js        profile cards that open when you hover or tap a name
assets/js/util.js          small helpers (formatting, DOM, count-up, axis ticks)
assets/favicon.svg         site icon
assets/og-image.png        link-preview image (made by scripts/make_og_image.py)
data/project.json          every number on the site and in this README
data/leaderboard.json      live leaderboard snapshot, rewritten daily by the GitHub Action
content/story.md           the project story in plain English (source of the site text)
scripts/update_leaderboard.py   Kaggle leaderboard -> data/leaderboard.json
scripts/make_og_image.py        builds assets/og-image.png from project.json
.github/workflows/update-leaderboard.yml   daily leaderboard update
notebooks/                 the Kaggle notebooks (copies without outputs)
space/                     source of the Hugging Face Space (Gradio app)
docs/model-card.md         the model card published on Hugging Face
CLAUDE.md, KICKOFF_PROMPT.md   build instructions used to make the website
.nojekyll                  tells GitHub Pages to serve files as they are
```

The site is static: plain HTML, CSS and JavaScript modules, no build step. All paths are relative, so it works under `/arenajudge/` on GitHub Pages. To preview it locally, run this from the repo root and open http://localhost:8000/:

```bash
python3 -m http.server 8000
```

(Opening `index.html` straight from disk won't work, because browsers block `fetch()` of the JSON files from `file://`.)

---

## Reproduce it

The notebooks run on Kaggle's free hardware, in this order. The copies in [`notebooks/`](notebooks/) have no outputs; the Kaggle versions are linked where they are public.

| # | Notebook | What it does | Hardware |
|---|---|---|---|
| 1 | [`llm-cls-train.ipynb`](notebooks/llm-cls-train.ipynb) · [Kaggle](https://www.kaggle.com/code/dheepakkaranes/llm-cls-train) | Fine-tune Qwen2.5-1.5B (LoRA) as a 3-class classifier (v1) | GPU T4, Internet on |
| 1b | [Training v2 on Kaggle](https://www.kaggle.com/code/karuniyapremnath/llm-cls-train-v2) (Karuniya) | v2: 30,000 rows, small-random head init | GPU T4 |
| 2 | [`llm-cls-infer.ipynb`](notebooks/llm-cls-infer.ipynb) · [Kaggle](https://www.kaggle.com/code/dheepakkaranes/llm-cls-infer) | 9-way inference benchmark + competition submission | GPU T4 ×2 |
| 3 | [`llm-cls-stack.ipynb`](notebooks/llm-cls-stack.ipynb) · [Kaggle](https://www.kaggle.com/code/dheepakkaranes/llm-cls-stack) | LightGBM length/style stacker on the unseen rows | |
| 4 | [`cuda-profiling.ipynb`](notebooks/cuda-profiling.ipynb) | CUDA profiling E0–E5 (attention fallback fix, CUDA Graphs) | GPU |
| 5 | [`vllm-feasibility.ipynb`](notebooks/vllm-feasibility.ipynb) | vLLM on T4 (6 tests) | GPU T4 (×2 for tensor parallel) |
| 6 | [`onnx-export.ipynb`](notebooks/onnx-export.ipynb) · [Kaggle](https://www.kaggle.com/code/dheepakkaranes/onnx-export) | CPU engines: PyTorch / ONNX Runtime, fp32 / INT8 | CPU only |
| 7 | [`onnx-weightonly.ipynb`](notebooks/onnx-weightonly.ipynb) · [Kaggle](https://www.kaggle.com/code/dheepakkaranes/onnx-weightonly) | Weight-only 8-bit / 4-bit quantization; picks the demo engine | CPU only |

The demo app itself is in [`space/`](space/); the model card is [`docs/model-card.md`](docs/model-card.md).

---

## Live leaderboard (GitHub Action)

[`.github/workflows/update-leaderboard.yml`](.github/workflows/update-leaderboard.yml) runs once a day and can also be started by hand from the Actions tab. It:

1. installs the Kaggle CLI (version pinned in the workflow),
2. runs [`scripts/update_leaderboard.py`](scripts/update_leaderboard.py), which downloads the full public leaderboard, keeps each team's best score, finds team **Dk**, and writes `data/leaderboard.json`. The file holds the rank, team count, top %, score, leader's score, a score histogram, our own submissions and a rank history,
3. commits `data/leaderboard.json` only if it changed. GitHub Pages then serves the new file, and the website reads it on every visit.

The leaderboard is rolling (only the last 2 months of submissions count). If the team drops off, the script keeps the last known rank and sets `on_leaderboard: false`, and the site shows "Last ranked …".

**Secrets** (repo **Settings → Secrets and variables → Actions → New repository secret**). Use either:

- `KAGGLE_API_TOKEN`: a new-style API token from [kaggle.com/settings/api](https://www.kaggle.com/settings/api) ("Generate New Token"). Recommended.
- or the legacy pair `KAGGLE_USERNAME` + `KAGGLE_KEY` (the two values in a downloaded `kaggle.json`).

Use a team member's account so the script can also read the team's own submissions. The credentials live only in GitHub secrets; nothing secret is in the website.

---

## Limitations

- It predicts **what humans prefer**, not what's correct. Humans also like longer answers.
- It only sees the first **200 tokens** of each answer.
- Top teams use much larger models and ensembles; this is a 1.5B model built on free GPUs.
- CPU numbers come from an 80-row check; live latency depends on input length and the Space's hardware.
- The free Space sleeps when idle; the first visitor after a while waits ~1–3 minutes.

## Next steps

- **v2b:** longer answers (400 tokens) plus each answer's word count in the input.
- Resubmit the best version before the 2-month rolling window drops it.

---

## License

The code in this repository is released under the [Apache License 2.0](LICENSE). The Qwen2.5 base model has its own license (Apache-2.0, © Qwen team), and the competition data is subject to the Kaggle competition rules.
