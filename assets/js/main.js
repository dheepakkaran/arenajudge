// ArenaJudge site: loads the two JSON files, fills every number slot, draws the charts,
// and runs the Typeform-style navigation (progress bar, arrows, keyboard, reveal-on-scroll).
// Paths are relative so the site works under /arenajudge/ on GitHub Pages.
import { $, $$, get, fmt, h, isUrl, relTime, richText, countUp, reduceMotion } from './util.js';
import * as charts from './charts.js';

window.__arenajudge = true;   // tells the inline failsafe in index.html that JS is running

const root = document.documentElement;
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
const syncMotion = () => root.classList.toggle('reduce-motion', motionQuery.matches);
syncMotion();
motionQuery.addEventListener('change', syncMotion);

const sections = $$('main > .screen');
let current = 0;

/* ---------- navigation: progress bar, current section, tint, arrows ---------- */
const progress = $('.progress span');
const prevBtn = $('#prev'), nextBtn = $('#next');

function update() {
  const line = innerHeight * 0.4;
  let idx = 0;
  sections.forEach((sec, i) => { if (sec.getBoundingClientRect().top <= line) idx = i; });
  if (idx !== current || !document.body.dataset.tint) {
    current = idx;
    document.body.dataset.tint = sections[idx].dataset.tint || '0';
  }
  const atBottom = innerHeight + scrollY >= root.scrollHeight - 4;
  prevBtn.disabled = scrollY < 4;
  nextBtn.disabled = atBottom;
  const max = root.scrollHeight - innerHeight;
  progress.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
}
let ticking = false;
const onScroll = () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => { ticking = false; update(); });
};
addEventListener('scroll', onScroll, { passive: true });
addEventListener('resize', onScroll);
update();

const behavior = () => (reduceMotion() ? 'auto' : 'smooth');

// While a smooth scroll is still moving, the next key press continues from where it is
// heading (a section index, or a scroll position inside a tall section), not from where it is now.
let pending = null, pendingTimer = 0;
let pageTarget = null, snapTimer = 0;
const settle = () => (reduceMotion() ? 60 : 800);

function goTo(i, moveFocus) {
  const idx = Math.max(0, Math.min(sections.length - 1, i));
  const sec = sections[idx];
  pending = idx;
  pageTarget = null;
  clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => { pending = null; }, settle());
  sec.scrollIntoView({ behavior: behavior(), block: 'start' });
  if (moveFocus) sec.focus({ preventScroll: true });
}

/**
 * Scroll inside a section taller than the screen. Proximity snapping would pull a short
 * scroll straight back to the section's start, so it is paused until the key presses stop.
 */
function pageTo(y) {
  pageTarget = y;
  root.style.scrollSnapType = 'none';
  clearTimeout(snapTimer);
  snapTimer = setTimeout(() => { pageTarget = null; root.style.scrollSnapType = ''; }, settle());
  scrollTo({ top: y, behavior: behavior() });
}

/** Next/previous section. Inside a section taller than the screen, page through it first. */
function step(dir, moveFocus = false) {
  if (pending !== null) { goTo(pending + dir, moveFocus); return; }
  update();
  const y = pageTarget ?? scrollY;                 // where the view is, or is about to be
  const r = sections[current].getBoundingClientRect();
  const top = scrollY + r.top, bottom = scrollY + r.bottom;
  const below = bottom - (y + innerHeight), above = y - top;
  const slack = 120;   // about the section's bottom padding: not worth a separate key press
  if (dir > 0 && below > slack) pageTo(y + Math.min(below, innerHeight * 0.8));
  else if (dir < 0 && above > slack) pageTo(y - Math.min(above, innerHeight * 0.8));
  else goTo(current + dir, moveFocus);
}
prevBtn.addEventListener('click', () => step(-1));
nextBtn.addEventListener('click', () => step(1));

/* ---------- keyboard: ↓ / Enter / Space = next, ↑ = previous, A/B/C in the quiz ---------- */
let quiz = null;
addEventListener('keydown', (e) => {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
  const t = e.target instanceof Element ? e.target : document.body;
  if (t.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]')) return;
  // On a link, button or other control, Enter/Space keep their normal meaning.
  const onControl = !!t.closest('a[href], button, summary, iframe, [role="button"], [tabindex]:not(.screen):not(main)');
  const key = e.key;
  if (key === 'ArrowDown' || ((key === 'Enter' || key === ' ') && !onControl && !e.shiftKey)) {
    e.preventDefault();
    step(1, true);
  } else if (key === 'ArrowUp' || (key === ' ' && e.shiftKey && !onControl)) {
    e.preventDefault();
    step(-1, true);
  } else if (quiz && sections[current].id === 'quiz' && !e.shiftKey) {
    const choice = { a: 'A', b: 'B', c: 'Tie' }[key.toLowerCase()];
    if (choice) { e.preventDefault(); quiz.pick(choice, true); }
  }
});

/* ---------- reveal on scroll + chart animations that play once ---------- */
const armed = new Set();
/** Start a chart's entry animation once its section is on screen. */
function arm(el) {
  if (!el) return;
  const sec = el.closest('.screen');
  if (sec && sec.classList.contains('is-visible')) {
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')));
  } else {
    armed.add(el);
  }
}
const countQueue = new Set();
function onVisible(sec) {
  for (const el of armed) {
    if (sec.contains(el)) { armed.delete(el); requestAnimationFrame(() => el.classList.add('on')); }
  }
  for (const el of countQueue) {
    if (sec.contains(el)) { countQueue.delete(el); countUp(el); }
  }
}
sections.forEach((sec) => $$('.reveal', sec).forEach((el, i) => el.style.setProperty('--i', String(Math.min(i, 8)))));
const io = new IntersectionObserver((entries) => {
  for (const en of entries) {
    if (!en.isIntersecting) continue;
    en.target.classList.add('is-visible');
    io.unobserve(en.target);
    if (en.target.classList.contains('screen')) onVisible(en.target);
  }
}, { rootMargin: '0px 0px -12% 0px' });
sections.forEach((sec) => io.observe(sec));
$$('.reveal-self').forEach((el) => io.observe(el));

/* ---------- live demo window: loading message and a fallback if it never loads ---------- */
(function demoWindow() {
  const frame = $('#demo-frame'), overlay = $('#demo-overlay');
  if (!frame || !overlay || frame.dataset.loaded) return;
  overlay.hidden = false;
  // After the timeout, a late "load" is usually the browser's own error page, so the message stays.
  frame.addEventListener('load', () => { if (!overlay.classList.contains('is-error')) overlay.hidden = true; });
  const watch = new IntersectionObserver(([en]) => {
    if (!en.isIntersecting) return;
    watch.disconnect();
    // A sleeping Space still serves its own "starting" page quickly, so a frame that
    // has not fired load after this long is most likely blocked.
    setTimeout(() => {
      if (frame.dataset.loaded) return;
      overlay.classList.add('is-error');
      overlay.replaceChildren(
        h('p', { text: "The demo window didn't load here. Your browser or network may be blocking embedded pages." }),
        h('a', { class: 'btn btn-primary', href: frame.dataset.app || frame.src, target: '_blank', rel: 'noopener', text: 'Open the full app ↗' }),
        h('button', { type: 'button', class: 'btn btn-small', text: 'Show the window anyway', onclick: () => { overlay.hidden = true; } }));
    }, 45000);
  }, { rootMargin: '400px 0px' });
  watch.observe(frame);
})();

/* ---------- data ---------- */
async function load(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

/** Values the story quotes that are ratios or picks of JSON values (computed, not typed). */
function derive(p) {
  const d = {};
  const scored = p.leaderboard_history.filter((x) => Number.isFinite(x.score));
  d.bestScore = Math.min(...scored.map((x) => x.score));

  const gpu = p.gpu_benchmark.rows;
  const byVariant = (v) => gpu.find((r) => r.variant === v);
  const fp16 = byVariant('fp16, batch 1'), nf4 = gpu.find((r) => /NF4/.test(r.variant));
  d.gpuCount = gpu.length;
  d.fp16Speedup = fp16 && fp16.speedup;
  d.sortedSpeedup = byVariant('fp16, batch 16, length-sorted')?.speedup;
  d.nf4MemShrink = fp16 && nf4 ? fp16.vram_gb / nf4.vram_gb : undefined;
  d.bestSpeedup = Math.max(...gpu.map((r) => r.speedup));

  const cpu = p.cpu_engines.rows;
  const chosen = cpu.find((r) => r.chosen), ref = cpu.find((r) => /reference/i.test(r.engine));
  const ortFp32 = cpu.find((r) => r.engine === 'ONNX Runtime fp32');
  d.cpuCount = cpu.length;
  d.deployedSize = chosen && chosen.size_gb;
  d.cpuShrink = ref && chosen ? ref.size_gb / chosen.size_gb : undefined;
  d.onnxVsTorch = ref && ortFp32 ? ref.p50_ms_4threads / ortFp32.p50_ms_4threads : undefined;
  d.cpuRows = Number(/(\d+) validation rows/.exec(p.cpu_engines._setup)?.[1]) || undefined;
  d.tol = parseFloat(/\+\s*([\d.]+)/.exec(p.cpu_engines.pick_rule)?.[1]);

  const k = p.cuda_profiling.kernel_breakdown_pct;
  d.attnNormal = +(k.attention_total - k.attention_fallback_part).toFixed(1);

  const v2 = p.training_runs.find((r) => r.model === 'v2');
  d.v2Minutes = v2 && v2.minutes;
  d.v2FailedHours = v2 && v2.failed_first_run_hours_approx;
  d.v2val = p.validation.find((v) => v.model === 'v2, no TTA')?.val_log_loss;

  d.hostCpus = Number(/returned (\d+)/.exec(p.deployment.bug)?.[1]) || undefined;
  const sx = /^(~?\d+(?:\.\d+)?)x\s*(?:\((.*)\))?/.exec(p.deployment.speedup_approx || '');
  d.liveSpeedup = sx ? `${sx[1]}×` : undefined;
  d.liveSpeedupNote = sx ? sx[2] : undefined;
  return d;
}

/** Fill every [data-bind] slot. Prefix p. = project.json, lb. = leaderboard.json, d. = derived. */
function bindAll(ctx) {
  for (const el of $$('[data-bind]')) {
    const [ns, ...rest] = el.dataset.bind.split('.');
    const src = { p: ctx.p, lb: ctx.lb, d: ctx.d }[ns];
    if (!src) continue;                          // that file failed to load: slot keeps "—"
    const v = get(src, rest.join('.'));
    const f = fmt[el.dataset.fmt || 'num'];
    el.textContent = v == null || (typeof v === 'number' && !Number.isFinite(v)) ? '—' : f(v, ctx);
    if (el.hasAttribute('data-count') && el.textContent !== '—') {
      const sec = el.closest('.screen');
      if (sec && sec.classList.contains('is-visible')) countUp(el); else countQueue.add(el);
    }
  }
  for (const a of $$('[data-href]')) {
    const [ns, ...rest] = a.dataset.href.split('.');
    const u = ctx[ns] ? get(ctx[ns], rest.join('.')) : undefined;
    if (isUrl(u)) a.href = u;
  }
}

/* Deep links (#cpu, #demo, …): charts and web fonts arrive after the browser has jumped to the
   anchor and push it down, so land on it again, unless the visitor has already started moving. */
let visitorMoved = false;
for (const ev of ['wheel', 'touchstart', 'keydown', 'pointerdown']) {
  addEventListener(ev, () => { visitorMoved = true; }, { once: true, passive: true });
}
function realign() {
  if (visitorMoved || !location.hash) return;
  const el = document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
}
if (document.fonts) document.fonts.ready.then(realign);
addEventListener('load', realign);

function safe(name, fn) {
  try { fn(); } catch (err) { console.error(`[arenajudge] ${name} failed:`, err); }
}

/* ---------- 1. quiz ---------- */
function initQuiz(p) {
  const ex = p.demo_examples && p.demo_examples[0];
  if (!ex) return null;
  richText($('#quiz-prompt'), ex.prompt);
  richText($('#quiz-a'), ex.response_a);
  richText($('#quiz-b'), ex.response_b);
  const order = ['A wins', 'B wins', 'Tie'];
  const keyOf = { A: 'A wins', B: 'B wins', Tie: 'Tie' };
  const out = ex.model_output;
  const top = order.reduce((a, k) => (out[k] > out[a] ? k : a), order[0]);
  const buttons = $$('.choice');
  const result = $('#quiz-result'), live = $('#quiz-live'), head = $('#quiz-head');
  let drawn = false;

  function pick(choice, fromKey) {
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.choice === choice)));
    result.hidden = false;
    if (!drawn) {
      drawn = true;
      const box = $('#quiz-bars');
      charts.hbars(box, order.map((k) => ({ label: k, value: out[k], text: fmt.prob(out[k]), cls: k === top ? 'is-best' : 'is-cool' })), { max: 1 });
      arm(box);
    }
    const mine = keyOf[choice];
    head.textContent = mine === top
      ? `You picked “${mine}”. The model agrees: that's its top pick.`
      : `You picked “${mine}”. The model leans “${top}”.`;
    live.textContent = `${head.textContent} Model probabilities: ${order.map((k) => `${k} ${fmt.prob(out[k])}`).join(', ')}.`;
    if (fromKey) $('#quiz-next').focus();
  }
  buttons.forEach((b) => {
    b.disabled = false;
    b.addEventListener('click', () => pick(b.dataset.choice, false));
  });
  return { pick };
}

/* ---------- 3. journey: nothing to draw, dates/values are bound ---------- */

/* ---------- 4. leaderboard ---------- */
function renderLeaderboard(p, lb) {
  if (lb) {
    if (lb.on_leaderboard === false) {
      $('#lb-prefix').hidden = false;
      $('#lb-off').hidden = false;
    }
    const rel = relTime(lb.updated_at);
    const when = new Date(lb.updated_at);
    $('#lb-updated').replaceChildren('Updated ',
      h('time', { datetime: lb.updated_at, title: Number.isNaN(when.getTime()) ? null : when.toUTCString(), text: rel || lb.updated_at }),
      lb.source === 'kaggle-cli' ? ' · refreshed daily from Kaggle' : ' · manual snapshot (daily refresh from Kaggle once the updater runs)');
    const hist = Array.isArray(lb.history) ? lb.history.filter((x) => Number.isFinite(x.rank)) : [];
    if (hist.length >= 3) {
      const fig = $('#rank-fig');
      fig.hidden = false;
      fig.append(charts.rankSpark($('#rank-chart'), hist));
      arm($('#rank-chart'));
    }
    if (lb.histogram && Array.isArray(lb.histogram.counts) && lb.histogram.counts.length) {
      const fig = $('#hist-fig');
      fig.hidden = false;
      fig.append(charts.histogram($('#hist-chart'), lb.histogram, lb.score, lb.team));
      arm($('#hist-chart'));
    }
  } else {
    $('#lb-hero').replaceChildren(h('p', { class: 'fallback', text: "The live leaderboard snapshot couldn't load. The Kaggle link below has the current standings." }));
  }
  if (p) {
    $('#score-fig').append(charts.scoreChart($('#score-chart'), p.leaderboard_history, p.competition.uniform_baseline));
    arm($('#score-chart'));
  }
}

/* ---------- 5. team ---------- */
function renderTeam(p) {
  const L = p.links;
  const linksFor = (name) => (name === p.project.author
    ? [['LinkedIn', L.author_linkedin], ['Kaggle', L.author_kaggle], ['GitHub', L.author_github]]
    : name === p.project.teammate ? [['LinkedIn', L.teammate_linkedin], ['Kaggle', L.teammate_kaggle]] : []);
  $('#team-cards').replaceChildren(...p.team.map((m, i) =>
    h('article', { class: 'team-card', 'aria-labelledby': `team-${i}` },
      h('h3', { id: `team-${i}`, text: m.name }),
      h('p', { class: 'role', text: m.role }),
      h('ul', {}, m.did.map((t) => h('li', { text: t }))),
      h('p', { class: 'card-links' }, linksFor(m.name).filter(([, u]) => isUrl(u)).map(([label, u]) =>
        h('a', { href: u, target: '_blank', rel: 'noopener', text: `${label} ↗`, 'aria-label': `${m.name} on ${label} (opens in a new tab)` }))))));
}

/* ---------- 6. GPU ---------- */
function renderGpu(p) {
  const box = $('#gpu-chart');
  const chart = charts.gpuChart(box, p.gpu_benchmark.rows);
  $('#gpu-fig').append(chart.table);
  const note = $('#gpu-note');
  const buttons = $$('#gpu-toggle button');
  const show = (name) => {
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.metric === name)));
    note.textContent = chart.set(name);
  };
  buttons.forEach((b) => { b.disabled = false; b.addEventListener('click', () => show(b.dataset.metric)); });
  show('speed');
  arm(box);
}

/* ---------- 7. CUDA ---------- */
function renderCuda(p, d) {
  const cp = p.cuda_profiling, k = cp.kernel_breakdown_pct;
  charts.stackedBar($('#kernel-chart'), [
    { label: 'matrix multiplies', value: k.matmul, cls: 'seg-a' },
    { label: 'element-wise ops', value: k.elementwise, cls: 'seg-b' },
    { label: 'attention, normal path', value: d.attnNormal, cls: 'seg-c' },
    { label: 'attention on the slow fallback path', value: k.attention_fallback_part, cls: 'seg-bad', callout: true },
  ]);
  arm($('#kernel-chart'));

  const graphs = cp.cuda_graphs_speedup;
  const best = Math.max(...graphs.map((g) => g.speedup));
  charts.hbars($('#graphs-chart'), graphs.map((g) => ({
    label: `${g.tokens} tokens`, value: g.speedup, text: `${g.speedup}×`, cls: g.speedup === best ? 'is-best' : 'is-cool',
  })), { ref: { value: 1 } });
  arm($('#graphs-chart'));

  $('#tried-list').replaceChildren(...cp.experiments.filter((x) => x.id === 'E2' || x.id === 'E3').map((x) =>
    h('li', {}, h('b', { text: x.name }), `: ${x.result}. `, h('span', { class: 'muted', text: `${fmt.cap(x.finding)}.` }))));
}

/* ---------- 8. vLLM ---------- */
function renderVllm(p) {
  const c = p.vllm.classifier_pooling_runner;
  charts.hbars($('#vllm-chart'), [
    { label: 'vLLM pooling runner', value: c.samples_per_s, text: `${c.samples_per_s.toFixed(1)}/s`, cls: 'is-best' },
    { label: 'Best Hugging Face setup, 1 GPU', value: c.hf_best_single_gpu_samples_per_s, text: `${c.hf_best_single_gpu_samples_per_s.toFixed(1)}/s`, cls: 'is-cool' },
  ]);
  arm($('#vllm-chart'));
}

/* ---------- 9. CPU ---------- */
function renderCpu(p, d) {
  $('#cpu-fig').append(charts.cpuScatter($('#cpu-chart'), p.cpu_engines.rows, d.tol, p.competition.uniform_baseline));
  arm($('#cpu-chart'));
}

/* ---------- 10. going live ---------- */
function renderLive(p) {
  const dep = p.deployment;
  charts.hbars($('#latency-chart'), [
    { label: 'Before the fix', note: dep.latency_before_note, value: dep.latency_before_ms, text: `${fmt.s1(dep.latency_before_ms)} s`, cls: 'is-bad' },
    { label: 'After the fix', note: dep.latency_after_note, value: dep.latency_after_ms, text: `${fmt.s2(dep.latency_after_ms)} s`, cls: 'is-good' },
  ]);
  arm($('#latency-chart'));
}

/* ---------- 13. the end ---------- */
function renderEnd(p) {
  const repo = p.links.github_repo;
  const nbs = p.notebooks.items.filter((n) => n.public === true);
  $('#nb-list').replaceChildren(...nbs.map((n) =>
    h('li', {},
      h('span', { class: 'nb-title' }, n.title, h('small', { text: ` · ${n.owner}` })),
      h('span', { class: 'nb-links' },
        isUrl(n.url) ? h('a', { href: n.url, target: '_blank', rel: 'noopener', text: 'Kaggle ↗', 'aria-label': `${n.title} on Kaggle (opens in a new tab)` }) : null,
        n.file && isUrl(repo) ? h('a', { href: `${repo}/blob/main/${n.file}`, target: '_blank', rel: 'noopener', text: 'GitHub ↗', 'aria-label': `${n.title} notebook file on GitHub (opens in a new tab)` }) : null))));
  $('#skills').replaceChildren(...p.skills.map((sk) => h('li', { text: sk })));
}

function dataFailed(which) {
  const banner = $('#data-error');
  banner.hidden = false;
  banner.replaceChildren(
    h('p', { text: `Some numbers couldn't load (${which}). Charts are left empty rather than shown with made-up values.` }),
    h('button', { type: 'button', class: 'banner-close', 'aria-label': 'Dismiss this message', text: '×', onclick: () => { banner.hidden = true; } }));
  for (const el of $$('[data-chart]')) {
    if (!el.childElementCount) el.replaceChildren(h('p', { class: 'fallback', text: "Chart data couldn't load." }));
  }
}

(async function main() {
  const [pr, lr] = await Promise.allSettled([load('data/project.json'), load('data/leaderboard.json')]);
  const p = pr.status === 'fulfilled' ? pr.value : null;
  const lb = lr.status === 'fulfilled' ? lr.value : null;
  if (!p) console.error('[arenajudge] data/project.json:', pr.reason);
  if (!lb) console.error('[arenajudge] data/leaderboard.json:', lr.reason);

  let d = null;
  if (p) safe('derive', () => { d = derive(p); });
  bindAll({ p, lb, d });

  safe('leaderboard', () => renderLeaderboard(p, lb));
  if (p) {
    safe('quiz', () => { quiz = initQuiz(p); });
    safe('team', () => renderTeam(p));
    safe('gpu', () => renderGpu(p));
    if (d) {
      safe('cuda', () => renderCuda(p, d));
      safe('cpu', () => renderCpu(p, d));
    }
    safe('vllm', () => renderVllm(p));
    safe('live', () => renderLive(p));
    safe('end', () => renderEnd(p));
  } else {
    $('#quiz-fallback').hidden = false;
  }
  if (!p || !lb) dataFailed([!p && 'data/project.json', !lb && 'data/leaderboard.json'].filter(Boolean).join(', '));
  requestAnimationFrame(realign);
  update();
})();
