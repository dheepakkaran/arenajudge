"""ArenaJudge: Chatbot Arena preference judge, CPU demo (Hugging Face Space).

Loads the exported classifier from the Hub and predicts which of two chatbot
responses a human would prefer. The same /predict endpoint is called by the
GitHub Pages site through Gradio's JavaScript client.
"""
import json, os, time
import numpy as np
import gradio as gr
from huggingface_hub import snapshot_download
from transformers import AutoTokenizer

# Free-tier Gradio Spaces run on ZeroGPU hardware. ZeroGPU expects at least one
# @spaces.GPU function at startup; this one is never called, so the model runs on
# the CPU (ONNX 4-bit) and visitors' GPU quota is not used.
try:
    import spaces
    @spaces.GPU(duration=10)
    def _zerogpu_placeholder():
        return True
except ImportError:          # not on ZeroGPU (local run / CPU hardware)
    pass

MODEL_REPO = os.getenv("MODEL_REPO", "dheepakkaran/arenajudge-qwen2.5-1.5b-lora-onnx-w4")
def available_cpus():
    """CPUs this container may actually use. os.cpu_count() reports the whole host
    (192 on ZeroGPU machines), and using that many threads on a few allowed cores
    makes inference ~10x slower, so read the container's CPU quota instead."""
    try:                                                     # cgroup v2: "quota period" or "max period"
        quota, period = open("/sys/fs/cgroup/cpu.max").read().split()
        if quota != "max":
            return max(1, int(quota) // int(period))
    except Exception:
        pass
    try:                                                     # cgroup v1
        quota = int(open("/sys/fs/cgroup/cpu/cpu.cfs_quota_us").read())
        period = int(open("/sys/fs/cgroup/cpu/cpu.cfs_period_us").read())
        if quota > 0:
            return max(1, quota // period)
    except Exception:
        pass
    try:
        return len(os.sched_getaffinity(0))
    except Exception:
        return os.cpu_count() or 2

# THREADS can be overridden from the Space settings (Variables) without a code change
THREADS = int(os.getenv("THREADS", "0")) or min(available_cpus(), 8)
print(f"host cpus={os.cpu_count()}, usable cpus={available_cpus()}, using THREADS={THREADS}", flush=True)

path = snapshot_download(MODEL_REPO)
CFG = json.load(open(os.path.join(path, "demo_config.json")))
tok = AutoTokenizer.from_pretrained(path)
H = {k: tok(v, add_special_tokens=False)["input_ids"] for k, v in CFG["headers"].items()}

def encode(prompt, a, b):
    T = lambda s, n: tok(s, add_special_tokens=False, truncation=True, max_length=n)["input_ids"]
    return (H["prompt"] + T(prompt, CFG["max_p"]) + H["a"] + T(a, CFG["max_r"])
            + H["b"] + T(b, CFG["max_r"]) + H["q"])

if CFG["engine"] == "onnxruntime":
    import onnxruntime as ort
    so = ort.SessionOptions(); so.intra_op_num_threads = THREADS; so.inter_op_num_threads = 1
    so.add_session_config_entry("session.intra_op.allow_spinning", "0")   # no busy-waiting on shared CPUs
    SESS = ort.InferenceSession(os.path.join(path, CFG["onnx_file"]), so, providers=["CPUExecutionProvider"])
    def run(ids):
        x = np.array([ids], dtype=np.int64)
        return SESS.run(["probs"], {"input_ids": x, "attention_mask": np.ones_like(x)})[0][0]
else:                                   # fallback: PyTorch dynamic INT8, quantized at startup
    import torch
    from transformers import AutoModelForSequenceClassification
    torch.set_num_threads(THREADS)
    MODEL = AutoModelForSequenceClassification.from_pretrained(path, dtype=torch.float32, attn_implementation="eager").eval()
    torch.ao.quantization.quantize_dynamic(MODEL, {torch.nn.Linear}, dtype=torch.qint8, inplace=True)
    @torch.inference_mode()
    def run(ids):
        return torch.softmax(MODEL(input_ids=torch.tensor([ids]), use_cache=False).logits.float(), -1)[0].numpy()

LABELS = CFG["labels"]                  # ["Response A wins", "Response B wins", "Tie"]

t0 = time.perf_counter(); run(encode("Hi", "Hello!", "Hey.")); print(f"warm-up {time.perf_counter() - t0:.1f}s", flush=True)

def predict(prompt, response_a, response_b, swap_tta=False):
    if not (prompt or "").strip() or not (response_a or "").strip() or not (response_b or "").strip():
        raise gr.Error("Please fill in the prompt and both responses.")
    t = time.perf_counter()
    p = run(encode(prompt, response_a, response_b))
    if swap_tta:                        # ask again with A and B swapped, map back, average: removes position bias
        p2 = run(encode(prompt, response_b, response_a))[[1, 0, 2]]
        p = (p + p2) / 2
    ms = (time.perf_counter() - t) * 1000
    return {LABELS[i]: float(p[i]) for i in range(3)}, f"{ms:.0f} ms on CPU ({CFG['source_engine']}, {THREADS} threads)"

EXAMPLES = [
    ["How do I reverse a list in Python?",
     "Use `my_list.reverse()` to reverse it in place, or `my_list[::-1]` to get a reversed copy.",
     "You can't reverse lists in Python.", False],
    ["Write a haiku about autumn.",
     "Crimson leaves drifting\nwhispers of the cooling wind\nthe year exhales slow",
     "Autumn is a season that comes after summer and before winter. Leaves fall.", True],
]

demo = gr.Interface(
    fn=predict,
    inputs=[gr.Textbox(label="User prompt", lines=3),
            gr.Textbox(label="Response A", lines=6),
            gr.Textbox(label="Response B", lines=6),
            gr.Checkbox(label="Swap-TTA (2× slower, removes position bias)", value=False)],
    outputs=[gr.Label(num_top_classes=3, label="Predicted human preference"),
             gr.Textbox(label="Latency")],
    title="ArenaJudge: which chatbot answer would a human prefer?",
    description=("Fine-tuned Qwen2.5-1.5B classifier (LoRA) trained on Chatbot Arena votes. "
                 "Runs on CPU as a 4-bit weight-only ONNX model (1.76 GB, same accuracy as fp32)."),
    examples=EXAMPLES,
    api_name="predict",
)

if __name__ == "__main__":
    demo.queue(max_size=16).launch()
