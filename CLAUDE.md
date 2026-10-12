# CLAUDE.md: ArenaJudge portfolio site

You are building a one-page portfolio website and README for **ArenaJudge**, Dheepak Karan's Kaggle + LLM-inference project. It is hosted on **GitHub Pages** at `https://dheepakkaran.github.io/arenajudge/`.

Read these first, in this order:
1. `content/story.md`: the story in plain English. Use its wording as the base for all page text (you may shorten it).
2. `data/project.json`: **every number** on the site comes from here.
3. `data/leaderboard.json`: live leaderboard snapshot, refreshed daily by GitHub Actions.
4. `scripts/update_leaderboard.py` + `.github/workflows/update-leaderboard.yml`: the daily leaderboard updater (already written and tested offline).

---

## Hard rules

- **No invented numbers.** Every number on the page or in the README comes from `data/project.json` or `data/leaderboard.json`. If something isn't there, leave it out.
- **Charts read the JSON at runtime** (`fetch("data/project.json")`), so numbers live in one place. If a fetch fails, show a short fallback message, never fake data.
- **Honest labels.** Keep "approx" markers (`rank_approx`, `teams_approx`), say "~240 teams", and label the demo examples as examples. Label the rank as "rolling leaderboard, changes as other teams submit".
- **Credit the teammate.** Karuniya Premnath trained the v2 model that produced the best score. Her section must be clear and respectful, not a footnote.
- **No brand logos or mascots** (Kaggle, Hugging Face, GitHub, etc.). Use text labels and simple generic icons (inline SVG you draw, e.g. arrow, chart, chip, bolt).
- **No secrets in the frontend.** Kaggle credentials exist only as GitHub Actions secrets.
- **Static only.** Plain HTML5 + CSS + vanilla JS (ES modules). No framework, no bundler, no build step. It must work when served from the `/arenajudge/` sub-path, so use **relative paths** everywhere (`data/project.json`, not `/data/project.json`).
- Dependencies: none needed. If you truly need a library, load it from `https://cdn.jsdelivr.net/npm/` with an **exact pinned version**. Prefer hand-built SVG charts.
- Keep the page fast: no image heavier than ~200 KB, fonts with `display=swap`, total JS under ~60 KB unminified if possible.

---

## Design: Typeform-style

The feel: **one idea per screen, big friendly type, calm colors, smooth motion, keyboard-first.**

**Layout**
- Each section is a full-viewport "card" (`min-height: 100svh`), content left-aligned in a column of max ~760px, vertically centered.
- Every section headline starts with a small numbered label in the accent color, Typeform-style: `3 →`.
- Headline: `clamp(2rem, 4.5vw, 3.4rem)`, weight 600–700. Body: `1.15–1.25rem`, line-height 1.6. Numbers use `font-variant-numeric: tabular-nums`.
- Font: **Inter** from Google Fonts (`display=swap`) with a full system fallback stack.
- Use `scroll-snap-type: y proximity` (not mandatory, so tall sections never trap the user).

**Color (black-and-white theme)**
- Background black (`#000000`), surface `#111111`, text `#FFFFFF`, muted `#A3A3A3`.
- White is the accent for numbers, buttons, highlights. Charts use gray steps `#FFFFFF`, `#BDBDBD`, `#808080`, `#646464` (never `#808080` next to `#646464`); "good / broken" is shown with shapes and labels (e.g. circle vs ✕), not color.
- Each section may shift the background tint slightly; animate the change (`transition: background-color .6s`).
- Define all colors as CSS custom properties on `:root`.

**Typeform touches**
- **Progress bar** pinned at the very top (thin, accent color) showing how far down the page you are.
- **Up/down arrow buttons** fixed bottom-right (desktop) to jump to the previous/next section.
- **Keyboard:** `↓`/`Enter`/`Space` = next section, `↑` = previous. Show a hint under primary buttons: `press Enter ↵`.
- **OK ✓ buttons**: rounded, accent background, subtle lift on hover.
- **Choice buttons with key badges** (`A`, `B`, `C`) for the interactive quiz; pressing the letter key selects.
- No top bar (removed at Dheepak's request); the hero has the "Try the live demo" button.

**Motion**
- When a section enters the viewport (IntersectionObserver), its children fade in and rise 24px, staggered ~80ms.
- Charts animate in once (bars grow, lines draw via `stroke-dashoffset`, big numbers count up).
- Easing `cubic-bezier(.2,.8,.2,1)`, 400–700ms.
- **Respect `prefers-reduced-motion`:** no movement, just instant display.

**Accessibility**
- Semantic landmarks (`header`, `main`, `section` with `aria-labelledby`, `footer`), visible focus rings, color contrast AA.
- Every chart has a text alternative (an `aria-label` summary and/or a visually-hidden data table).
- Interactive quiz and toggles work with keyboard and screen readers (`aria-pressed`, `aria-live="polite"` for results).

**Responsive**
- Works from 360px wide up. On mobile: hide the fixed arrow buttons, keep the progress bar, stack everything, tables scroll horizontally inside their own container.

---

## Page sections (in order)

Use the matching parts of `content/story.md` for text. Keep each screen short; link to the README for full detail.

**0. Intro (hero)**
- Big title "ArenaJudge". One-line tagline from `project.tagline`.
- "by Dheepak Karan · with Karuniya Premnath · October 2026".
- 4 stat chips (from data): leaderboard rank `#51` and `top ~21%` (from `leaderboard.json`), best score `1.00281`, live latency `0.46 s`, model size `1.76 GB`.
- Primary button "Start ✓" (press Enter ↵), secondary "Try the live demo".

**1. "Which answer would a human pick?"** (interactive quiz)
- Show `demo_examples[0]`: the prompt and the two responses as two cards.
- Choices A / B / Tie with key badges. After a pick, reveal the model's real output as animated probability bars (`model_output`), plus one line: "That's what ArenaJudge does: it predicts the human vote." Then a "Next ✓" button.
- Small note: "Example written for this demo; probabilities are real outputs from the live model."

**2. The competition**
- What Chatbot Arena is, what Kaggle asks, how scoring works (log loss, the 1.0986 coin-flip line), ~240 teams, rolling 2-month leaderboard. Keep it to ~5 short lines plus one simple visual: three pills "A wins / B wins / Tie".

**3. The journey** (timeline)
- Horizontal (desktop) / vertical (mobile) timeline from `leaderboard_history` + story sections: Day 1 start, v1 + TTA (#53), stacker (~#48), Karuniya's v2 and the zero-init bug, best score 1.00281, CUDA profiling, vLLM, ONNX + 4-bit, live Space. Each step reveals as you scroll.

**4. Leaderboard (live)**
- Big animated rank `#{rank}` with "of {teams} teams" (add "~" when `teams_approx`), "top {top_percent}%", score `{score}`, and "Updated {relative time} · refreshed daily from Kaggle".
- Score progression chart from `project.leaderboard_history`: line/step chart, y-axis = log loss with a dashed line at 1.0986 ("coin flip"), a note "lower is better ↓", points labeled with stage + rank.
- If `leaderboard.json.histogram` exists: a small distribution chart of all teams' scores with a marker for "Dk". If `history` has 3+ entries, a small rank-over-time sparkline.
- If `on_leaderboard` is false: show "Last ranked #{rank} (rolling leaderboard: older submissions drop off after 2 months)".
- Link: "See the leaderboard on Kaggle ↗" (`links.competition_leaderboard`).

**5. The team: who did what**
- Two cards side by side from `project.team`: name, role, bullet list. Equal visual weight.
- Under them, the zero-init story in 2–3 lines (her run exposed it, he diagnosed it, her rerun fixed it).

**6. Making it fast on a GPU**
- Chart from `gpu_benchmark.rows`: horizontal bars. A Typeform-style toggle switches the metric: **Speed (samples/s)** · **Memory (GB)** · **Accuracy (log loss)**. Highlight the naive row and the best rows.
- 3–4 takeaways from story section 5 (fp16 4×, batching alone didn't help, 4-bit memory 2.8× not faster, 2 GPUs 10.6×).

**7. Inside the GPU (CUDA profiling)**
- Kernel-time breakdown (`kernel_breakdown_pct`) as a single stacked bar, with the 8.2% fallback slice called out.
- "The bug hunt" as a 3-step mini story: symptom → cause (GQA, 12 query heads vs 2 K/V heads, no padding at the 515-token cap → silent fallback) → fix (pad to multiple of 8: 23–24% faster on those batches, 7.6% overall).
- CUDA Graphs: two bars (32 tokens 2.29×, 512 tokens 1.27×).
- "Tried, didn't help, and why" list from `cuda_profiling.experiments` E2/E3.

**8. vLLM**
- Short: vLLM 0.31 on T4 (Triton attention since FlashAttention 2 isn't supported), classifier via pooling runner 14.6 vs 13.0 samples/s, matching predictions, plus a 7B AWQ model on 1 and 2 GPUs.

**9. Shrinking it for a free CPU**
- Scatter chart from `cpu_engines.rows`: x = time per prediction (4 threads, ms), y = log loss. Shade the "acceptable" band (≤ fp32 + 0.01). Broken engines in red, OK in green, the deployed 4-bit engine highlighted with a label. Show size in the tooltip/label.
- One-sentence lesson: quantize weights, not activations.

**10. Going live**
- Before/after bar: 27,868 ms → 457 ms, with the notes from `deployment` (1 pass vs 2 passes, different short examples, ~60×).
- The 192-CPUs story in 3 lines.

**11. Try it live** (embedded demo window)
- A styled "app window" frame (rounded corners, small top bar with three dots and the title "ArenaJudge · live on Hugging Face").
- Inside: an `<iframe src="https://dheepakkaran-arenajudge.hf.space/?__theme=dark">` with `loading="lazy"`, `title`, `allow="clipboard-write"`, and a sensible height (desktop ~760px, scrolls internally; mobile ~900px).
- Above it: "First load can take 1–3 minutes if the demo was asleep. After that, predictions take about half a second."
- Below it: "Open the full app ↗" (`links.live_demo_space`) and "Model on Hugging Face ↗" (`links.hf_model`).
- Fallback: if the iframe can't load, a clear message and the two links still work.

**12. What I learned + honest limitations**
- Two short columns from story sections 11 and 12.

**13. The end (links)**
- "Thanks for reading." Buttons: GitHub repo, live demo, model, Kaggle notebooks (list from `notebooks.items`; only link those marked public, see below), LinkedIn, Kaggle profile.
- Skills chips from `project.skills`.
- Footer: "Built by Dheepak Karan · Numbers from data/project.json · Leaderboard auto-updated daily".

---

## Notebook links

Kaggle notebooks are private until made public. Before linking each notebook, **ask Dheepak which ones are public** and add `"public": true` to those items in `data/project.json`. Only render links for public ones. The `.ipynb` files in `notebooks/` are always linkable on GitHub.

---

## README.md (repo front page)

Write a clear README in plain English:
1. Title + one-line summary + links: **Live demo**, **Website**, **Model**, **Competition**.
2. "Results at a glance" table: leaderboard history (from `project.json`), best validation numbers, GPU 10.6×, CUDA attention fix 7.6%, CPU 4-bit 1.76 GB same accuracy, live latency 0.46 s.
3. "How it works": model, input format, swap-TTA, stacker, data split.
4. Sections mirroring the story: GPU benchmark table, CUDA profiling, vLLM, CPU quantization table, deployment bug.
5. Team: who did what (both people).
6. Repo layout (folders and what's in them).
7. "Reproduce it": Kaggle notebooks in order (train → infer → stack → profiling → vLLM → ONNX → weight-only), with GPU settings.
8. Live leaderboard: how the GitHub Action works and how to set the secrets.
9. Limitations + next steps.
10. License: Apache-2.0 for the code (create `LICENSE`).

---

## GitHub Pages + leaderboard setup (tell Dheepak these steps at the end)

1. Repo **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)`**.
2. Add an empty `.nojekyll` file at the repo root.
3. Kaggle → Settings → **API → Create New Token** (downloads `kaggle.json` with `username` and `key`).
4. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**: `KAGGLE_USERNAME` and `KAGGLE_KEY`.
5. **Actions → Update Kaggle leaderboard → Run workflow** once to test. It commits `data/leaderboard.json` if anything changed.
6. Note: GitHub may pause scheduled workflows in repos with no activity for a long time; re-enable it in the Actions tab if that happens.

Before relying on the workflow, check the installed Kaggle CLI's flags (`kaggle competitions leaderboard -h`, `kaggle competitions submissions -h`) and, if they differ from what `scripts/update_leaderboard.py` uses (`--download --path`, `-v`), update the script. Also check Kaggle's current docs for the auth method: if Kaggle now issues a different token type, support it in the workflow env.

---

## Work order

1. Read the files above. Then show Dheepak a short plan (file list + section list) and wait for OK.
2. Build `index.html`, `assets/css/style.css`, `assets/js/main.js` (+ small modules if cleaner, e.g. `assets/js/charts.js`), a favicon (inline SVG), and Open Graph meta tags (title, description, `og:image` if you create a simple 1200×630 PNG).
3. Serve locally (`python3 -m http.server 8000`) and test: no console errors, all JSON loads, keyboard navigation, reduced motion, 360px mobile width, iframe fallback.
4. Write `README.md`, `LICENSE`, `.nojekyll`.
5. Commit with clear messages. Then give Dheepak the Pages + secrets steps above.

## Checklist before finishing
- [ ] Every number traceable to a JSON file
- [ ] Teammate credited clearly
- [ ] Works under `/arenajudge/` (relative paths)
- [ ] Keyboard: ↓ ↑ Enter, A/B/C in the quiz
- [ ] `prefers-reduced-motion` respected
- [ ] Mobile 360px looks right
- [ ] Charts have text alternatives
- [ ] No brand logos, no secrets, no console errors
