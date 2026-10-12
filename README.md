# ArenaJudge

A small language model that predicts which of two chatbot answers a person would prefer. It runs on a free CPU in under half a second.

**[Website](https://dheepakkaran.github.io/arenajudge/)** · **[Live demo](https://huggingface.co/spaces/dheepakkaran/arenajudge)** · **[Model](https://huggingface.co/dheepakkaran/arenajudge-qwen2.5-1.5b-lora-onnx-w4)** · **[Competition](https://www.kaggle.com/competitions/llm-classification-finetuning)**

## Results

| | |
|---|---|
| Kaggle score | **1.00281** log loss (lower is better; random guessing scores 1.0986) |
| Kaggle rank | **#51 of 250** teams on Oct 12, 2026 ([live rank](https://dheepakkaran.github.io/arenajudge/#leaderboard)) |
| GPU speed | **10.6×** faster than the naive setup |
| CPU model | **1.76 GB**, same accuracy as the full-size model |
| Live demo | **0.46 s** per prediction on a free CPU |

## How it works

- **Model:** Qwen2.5-1.5B-Instruct, fine-tuned with LoRA to give three probabilities: A wins, B wins, or tie.
- **Input:** the question (up to 96 tokens) and each answer (up to 200 tokens).
- **Swap test:** each pair is scored twice, with A and B swapped, and the results are averaged. This removes the model's bias toward one position.
- **Stacker:** a small LightGBM model adds simple style signals, like answer length and formatting.
- **Data:** v1 trained on 20,000 rows. Karuniya's v2 trained on 30,000 rows and gave the best score. Validation rows were never used for training.

## Making it fast and small

- **GPU:** fp16, length-sorted batches and two GPUs made it 10.6× faster.
- **CUDA profiling:** attention was silently using a slow fallback kernel. Padding batches to a multiple of 8 tokens fixed it: 7.6% faster overall.
- **vLLM:** served the model at 14.6 samples/s, vs 13.0 with Hugging Face.
- **CPU:** plain INT8 broke the accuracy. Weight-only 4-bit kept it, at 1.76 GB.
- **Live demo:** the app saw 192 CPUs (the whole server, not its share) and took 27.9 s. Limiting threads to the real CPU quota brought it to 0.46 s.

Charts and full details are on the [website](https://dheepakkaran.github.io/arenajudge/).

## Team

- **Dheepak Karan** ([LinkedIn](https://www.linkedin.com/in/dheepakkaran)): training pipeline, v1 model, swap test, stacker, all inference work, deployment.
- **Karuniya Premnath** ([LinkedIn](https://www.linkedin.com/in/karuniya-premnath/)): trained the v2 model (30,000 rows) behind the team's best score.

## Repo

```
index.html, assets/   website (plain HTML, CSS, JS; no build step)
data/                 project.json (every number) and leaderboard.json (updated daily)
notebooks/            Kaggle notebooks, in run order
space/                Hugging Face demo app
scripts/              leaderboard updater and preview-image script
docs/                 model card
```

## Run it

- **Website:** run `python3 -m http.server 8000` in the repo folder, then open http://localhost:8000.
- **Notebooks:** run on Kaggle in this order: train → infer → stack → CUDA profiling → vLLM → ONNX export → weight-only. GPU settings are in [notebooks/README.md](notebooks/README.md).
- **Leaderboard:** a GitHub Action updates `data/leaderboard.json` every day. It needs one repo secret: `KAGGLE_API_TOKEN`.

## Limitations

- It predicts what people *prefer*, not what is *correct*. People also tend to like longer answers.
- It reads only the first 200 tokens of each answer.
- It is a 1.5B model trained on free GPUs. Top teams use much larger models.

## License

Code is under [Apache 2.0](LICENSE). The Qwen2.5 base model and the Kaggle data have their own terms.
