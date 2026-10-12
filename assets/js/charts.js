// Hand-built charts (SVG + HTML bars). Every value comes from the JSON passed in.
// Colors live in style.css as custom properties; marks only carry class names here.
// Each chart has a text alternative: SVGs get an aria-label summary, and every chart
// can show its numbers in a table (dataTable) that keyboard and screen-reader users can open.
import { h, s, num, fmt, niceTicks, pct } from './util.js';

/* ---------- shared tooltip (pointer only; the data tables carry the same values) ---------- */
let tipEl = null;
function tipNode() {
  if (!tipEl) {
    tipEl = h('div', { class: 'tooltip', 'aria-hidden': 'true' });
    document.body.append(tipEl);
    addEventListener('scroll', hideTip, { passive: true });
  }
  return tipEl;
}
function hideTip() { if (tipEl) tipEl.classList.remove('on'); }
function placeTip(x, y) {
  const t = tipNode();
  const r = t.getBoundingClientRect();
  let left = x + 14, top = y + 14;
  if (left + r.width > innerWidth - 8) left = x - r.width - 14;
  if (top + r.height > innerHeight - 8) top = y - r.height - 14;
  t.style.left = `${Math.max(8, left)}px`;
  t.style.top = `${Math.max(8, top)}px`;
}
/** rows: [[value, label], …]; values lead, labels follow. */
function tip(target, title, rows) {
  target.addEventListener('pointerenter', (e) => {
    const t = tipNode();
    t.replaceChildren(h('div', { class: 'tip-title', text: title }),
      ...rows.map(([v, l]) => h('div', {}, h('strong', { text: v }), l ? h('span', { text: ` ${l}` }) : null)));
    t.classList.add('on');
    placeTip(e.clientX, e.clientY);
  });
  target.addEventListener('pointermove', (e) => placeTip(e.clientX, e.clientY));
  target.addEventListener('pointerleave', hideTip);
}

/** Re-draw at the container's real pixel width so text stays a readable size. */
function responsive(box, draw) {
  let last = 0;
  const run = () => {
    const w = Math.floor(box.clientWidth);
    if (w > 0 && Math.abs(w - last) > 1) { last = w; box.replaceChildren(draw(w)); }
  };
  new ResizeObserver(run).observe(box);
  run();
}

const svgRoot = (w, H, label) =>
  s('svg', { width: w, height: H, viewBox: `0 0 ${w} ${H}`, role: 'img', 'aria-label': label });

/* ---------- table view (the text alternative every chart shares) ---------- */
export function dataTable(caption, cols, rows) {
  return h('details', { class: 'data-table' },
    h('summary', { text: 'Show the numbers' }),
    h('div', { class: 'table-scroll', tabindex: '0', role: 'region', 'aria-label': caption },
      h('table', {},
        h('caption', { class: 'sr-only', text: caption }),
        h('thead', {}, h('tr', {}, cols.map((c) => h('th', { scope: 'col', class: c.n ? 'n' : null, text: c.label })))),
        h('tbody', {}, rows.map((r) => h('tr', {}, cols.map((c) => {
          const v = c.get(r);
          return h('td', { class: c.n ? 'n' : null, text: v == null || v === '' ? '—' : String(v) });
        })))))));
}

/* ---------- 1. Public score by stage (line, coin-flip reference) ---------- */
export function scoreChart(box, history, baseline) {
  const pts = history.filter((p) => Number.isFinite(p.score));
  const best = Math.min(...pts.map((p) => p.score));
  const bestIdx = pts.findIndex((p) => p.score === best);
  const rankTxt = (p) => (p.rank == null ? '' : `${p.rank_approx ? '~' : ''}#${p.rank}`);
  const summary = `Public leaderboard score (log loss, lower is better) by stage: ${pts
    .map((p) => `${p.short} ${p.score}${p.rank != null ? `, rank ${rankTxt(p)}` : ''}`).join('; ')}. Coin-flip line at ${baseline}.`;

  responsive(box, (w) => {
    const narrow = w < 520;
    const H = narrow ? 280 : 310;
    const m = { t: 30, r: 12, b: narrow ? 46 : 54, l: narrow ? 42 : 50 };
    const iw = w - m.l - m.r, ih = H - m.t - m.b;
    const vals = pts.map((p) => p.score).concat(baseline);
    const lo0 = Math.min(...vals), hi0 = Math.max(...vals), pad = (hi0 - lo0) * 0.12;
    const T = niceTicks(lo0 - pad, hi0 + pad, 5);
    const slot = iw / pts.length;
    const x = (i) => m.l + slot * (i + 0.5);
    const y = (v) => m.t + (ih * (T.hi - v)) / (T.hi - T.lo);
    const svg = svgRoot(w, H, summary);

    const grid = s('g', { class: 'grid' });
    for (const t of T.ticks) {
      grid.append(s('line', { x1: m.l, x2: w - m.r, y1: y(t), y2: y(t) }),
        s('text', { class: 'tick', x: m.l - 8, y: y(t) + 4, 'text-anchor': 'end', text: t.toFixed(T.dec) }));
    }
    svg.append(grid,
      s('line', { class: 'ref-line', x1: m.l, x2: w - m.r, y1: y(baseline), y2: y(baseline) }),
      s('text', { class: 'lbl-muted', x: w - m.r, y: y(baseline) - 8, 'text-anchor': 'end', text: `coin flip ${baseline}` }),
      s('path', { class: 'line draw', pathLength: 1, d: pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join('') }));

    const stagger = slot < 70;   // narrow: alternate label rows so stage names never overlap
    pts.forEach((p, i) => {
      const cx = x(i), cy = y(p.score);
      const g = s('g', { class: 'fade-in', style: `--i:${i}` },
        s('circle', { class: 'pt', cx, cy, r: 5 }));
      // Rank labels sit up and to the right of the point, clear of the line arriving from the
      // upper left; they flip to the left only if they would run past the chart edge.
      if (p.rank != null) {
        const txt = rankTxt(p), room = w - (cx + 9) >= txt.length * 8;
        g.append(s('text', { class: 'lbl', x: room ? cx + 9 : cx - 9, y: cy - 11, 'text-anchor': room ? 'start' : 'end', text: txt }));
      }
      if (i === bestIdx) g.append(s('text', { class: 'lbl', x: cx, y: cy + 22, 'text-anchor': 'middle', text: `${p.score} best` }));
      svg.append(g,
        s('text', { class: 'tick', x: cx, y: m.t + ih + (stagger && i % 2 ? 34 : 18), 'text-anchor': 'middle', text: p.short }));
      if (!stagger) svg.append(s('text', { class: 'tick tick-sub', x: cx, y: m.t + ih + 34, 'text-anchor': 'middle', text: fmt.date(p.date) }));
      const hit = s('rect', { class: 'hit', x: cx - slot / 2, y: m.t - 10, width: slot, height: ih + 10 });
      tip(hit, p.stage, [[String(p.score), 'log loss'], ...(p.rank != null ? [[rankTxt(p), 'rank']] : []),
        [fmt.date(p.date), p.owner ? `· ${p.owner}` : '']]);
      svg.append(hit);
    });
    return svg;
  });

  return dataTable('Public leaderboard score by stage', [
    { label: 'Date', get: (p) => p.date },
    { label: 'Stage', get: (p) => p.stage },
    { label: 'Score (log loss)', get: (p) => p.score, n: true },
    { label: 'Rank', get: (p) => rankTxt(p), n: true },
    { label: 'Who', get: (p) => p.owner },
  ], pts);
}

/* ---------- 2. Rank over time (sparkline from leaderboard.json history) ---------- */
export function rankSpark(box, history) {
  const pts = history.filter((p) => Number.isFinite(p.rank)).map((p) => ({ ...p, t: Date.parse(p.date) }));
  const rk = (p) => `${p.approx ? '~' : ''}#${p.rank}`;
  const bestRank = Math.min(...pts.map((p) => p.rank));
  const summary = `Rank over time: ${pts.map((p) => `${fmt.date(p.date)} ${rk(p)}`).join(', ')}.`;
  responsive(box, (w) => {
    const H = 120, m = { t: 26, r: 26, b: 26, l: 26 };
    const iw = w - m.l - m.r, ih = H - m.t - m.b;
    const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
    const x = (p, i) => (t1 > t0 ? m.l + (iw * (p.t - t0)) / (t1 - t0) : m.l + (iw * i) / Math.max(1, pts.length - 1));
    const ranks = pts.map((p) => p.rank);
    const lo = Math.min(...ranks) - 2, hi = Math.max(...ranks) + 2;
    const y = (r) => m.t + (ih * (r - lo)) / (hi - lo);        // rank #1 at the top
    const svg = svgRoot(w, H, summary);
    svg.append(s('line', { class: 'axis-line', x1: m.l, x2: w - m.r, y1: H - m.b, y2: H - m.b }),
      s('path', { class: 'line draw', pathLength: 1, d: pts.map((p, i) => `${i ? 'L' : 'M'}${x(p, i).toFixed(1)},${y(p.rank).toFixed(1)}`).join('') }));
    const showAll = pts.length <= 12;
    const bestIdx = pts.findIndex((p) => p.rank === bestRank);
    pts.forEach((p, i) => {
      const end = i === 0 || i === pts.length - 1;
      const isBest = i === bestIdx && !end;
      if (!showAll && !end && !isBest) return;
      const cx = x(p, i), cy = y(p.rank);
      const g = s('g', { class: 'fade-in', style: `--i:${i}` }, s('circle', { class: 'pt', cx, cy, r: 4 }));
      if (end || isBest) {
        const anchor = i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle';
        g.append(s('text', { class: 'lbl', x: cx, y: cy - 10, 'text-anchor': anchor, text: rk(p) }));
      }
      if (end) g.append(s('text', { class: 'tick', x: cx, y: H - 8, 'text-anchor': i === 0 ? 'start' : 'end', text: fmt.date(p.date) }));
      const hit = s('circle', { class: 'hit', cx, cy, r: 14 });
      tip(hit, fmt.date(p.date), [[rk(p), p.teams ? `of ${num(p.teams)}` : ''], [String(p.score), 'score']]);
      svg.append(g, hit);
    });
    return svg;
  });
  return dataTable('Rank over time', [
    { label: 'Date', get: (p) => p.date },
    { label: 'Rank', get: rk, n: true },
    { label: 'Score', get: (p) => p.score, n: true },
    { label: 'Teams', get: (p) => p.teams, n: true },
  ], pts);
}

/* ---------- 3. All teams' scores (histogram, only when the Action has written one) ---------- */
export function histogram(box, hist, score, team) {
  const n = hist.counts.length, lo = hist.edges[0], hi = hist.edges[n];
  const summary = `Distribution of all teams' best public scores from ${lo} to ${hi}; ${team} scores ${score}.`;
  responsive(box, (w) => {
    const H = 150, m = { t: 30, r: 10, b: 26, l: 10 };
    const iw = w - m.l - m.r, ih = H - m.t - m.b;
    const maxC = Math.max(1, ...hist.counts), bw = iw / n;
    const x = (v) => m.l + (iw * (Math.min(hi, Math.max(lo, v)) - lo)) / (hi - lo);
    const svg = svgRoot(w, H, summary);
    hist.counts.forEach((c, i) => {
      const bh = (ih * c) / maxC;
      const r = s('rect', { class: 'hcol fade-in', style: `--i:${Math.min(i, 12)}`, x: m.l + i * bw + 1, y: m.t + ih - bh, width: Math.max(1, bw - 2), height: bh, rx: 2 });
      tip(r, `${hist.edges[i].toFixed(3)}–${hist.edges[i + 1].toFixed(3)}`, [[String(c), c === 1 ? 'team' : 'teams']]);
      svg.append(r);
    });
    const mx = x(score);
    svg.append(s('line', { class: 'axis-line', x1: m.l, x2: w - m.r, y1: m.t + ih, y2: m.t + ih }),
      s('line', { class: 'marker', x1: mx, x2: mx, y1: m.t - 6, y2: m.t + ih }),
      s('text', { class: 'lbl', x: mx, y: m.t - 12, 'text-anchor': mx > w * 0.75 ? 'end' : mx < w * 0.25 ? 'start' : 'middle', text: `${team} ${score}` }),
      s('text', { class: 'tick', x: m.l, y: H - 6, text: `${lo.toFixed(3)} (better)` }),
      s('text', { class: 'tick', x: w - m.r, y: H - 6, 'text-anchor': 'end', text: hi.toFixed(3) }));
    return svg;
  });
  return dataTable('Teams per score range', [
    { label: 'Score from', get: (r) => r.a.toFixed(5), n: true },
    { label: 'to', get: (r) => r.b.toFixed(5), n: true },
    { label: 'Teams', get: (r) => r.c, n: true },
  ], hist.counts.map((c, i) => ({ a: hist.edges[i], b: hist.edges[i + 1], c })));
}

/* ---------- HTML horizontal bars (quiz, CUDA Graphs, vLLM, latency) ---------- */
/** items: [{ label, value, text, cls, note }]; opts: { max, ref: { value } } */
export function hbars(box, items, opts = {}) {
  const top = opts.max ?? Math.max(...items.map((i) => i.value));
  const wrap = h('div', { class: 'hbars' }, items.map((it, i) =>
    h('div', { class: `hbar-row ${it.cls || ''}`, style: `--i:${i};--w:${pct(it.value / top)}` },
      h('span', { class: 'hbar-label' }, it.label, it.note ? h('small', { text: it.note }) : null),
      h('span', { class: 'hbar-track' },
        h('span', { class: 'hbar-fill' }),
        opts.ref ? h('span', { class: 'hbar-ref', style: `--r:${pct(opts.ref.value / top)}` }) : null,
        h('span', { class: 'hbar-value', text: it.text })))));
  box.replaceChildren(wrap);
  return wrap;
}

/* ---------- GPU benchmark: bars with a metric toggle; accuracy switches to dots ---------- */
export function gpuChart(box, rows) {
  const naive = rows.find((r) => r.speedup === 1) || rows[0];
  const wrap = h('div', { class: 'hbars gpu' });
  const els = rows.map((r, i) => {
    const val = h('span', { class: 'hbar-value' });
    const row = h('div', { class: `hbar-row${r === naive ? ' is-naive' : ''}`, style: `--i:${i}` },
      h('span', { class: 'hbar-label', text: r.variant }),
      h('span', { class: 'hbar-track' }, h('span', { class: 'hbar-fill' }), h('span', { class: 'hbar-dot' }), val));
    wrap.append(row);
    return { r, row, val };
  });
  const axis = h('div', { class: 'hbar-axis', 'aria-hidden': 'true' });
  wrap.append(h('div', { class: 'hbar-row hbar-axis-row', 'aria-hidden': 'true' }, h('span', { class: 'hbar-label' }), axis));
  box.replaceChildren(wrap);

  const METRICS = {
    speed: { key: 'samples_per_s', best: 'max', text: (v) => `${v.toFixed(1)}/s`, note: 'Samples per second. Higher is better.' },
    memory: { key: 'vram_gb', best: 'min', text: (v) => `${v.toFixed(2)} GB`, note: 'Peak GPU memory. Lower is better.' },
    accuracy: { key: 'log_loss', best: 'min', text: (v) => v.toFixed(4), dots: true },
  };
  function set(name) {
    const M = METRICS[name];
    const vals = rows.map((r) => r[M.key]);
    const best = M.best === 'max' ? Math.max(...vals) : Math.min(...vals);
    let pos, note = M.note;
    if (M.dots) {
      const T = niceTicks(Math.min(...vals), Math.max(...vals), 4);
      pos = (v) => (v - T.lo) / (T.hi - T.lo);
      axis.replaceChildren(...T.ticks.map((t) => h('span', { style: `--p:${pct(pos(t))}`, text: t.toFixed(T.dec) })));
      note = `Validation log loss. Lower is better. Zoomed axis (${T.lo.toFixed(T.dec)} to ${T.hi.toFixed(T.dec)}): bars from zero would all look the same.`;
    } else {
      const mx = Math.max(...vals);
      pos = (v) => v / mx;
    }
    wrap.classList.toggle('mode-dots', !!M.dots);
    for (const { r, row, val } of els) {
      const v = r[M.key];
      row.style.setProperty('--w', M.dots ? '0%' : pct(pos(v)));
      row.style.setProperty('--p', pct(pos(v)));
      row.classList.toggle('is-best', v === best);
      val.textContent = M.text(v);
    }
    return note;
  }
  const table = dataTable('GPU benchmark, all setups', [
    { label: 'Setup', get: (r) => r.variant },
    { label: 'Time (s)', get: (r) => r.seconds.toFixed(1), n: true },
    { label: 'Samples/s', get: (r) => r.samples_per_s.toFixed(1), n: true },
    { label: 'GPU memory (GB)', get: (r) => r.vram_gb.toFixed(2), n: true },
    { label: 'Log loss', get: (r) => r.log_loss.toFixed(4), n: true },
    { label: 'Speedup', get: (r) => `${r.speedup.toFixed(1)}×`, n: true },
  ], rows);
  return { set, table };
}

/* ---------- CUDA kernel-time breakdown: one stacked bar ---------- */
export function stackedBar(box, parts) {
  const label = `Share of GPU kernel time: ${parts.map((p) => `${p.label} ${p.value}%`).join(', ')}.`;
  box.replaceChildren(
    h('div', { class: 'stack', role: 'img', 'aria-label': label },
      parts.map((p) => h('span', { class: p.cls, style: `--v:${p.value}` }))),
    h('ul', { class: 'legend legend-stack' }, parts.map((p) =>
      h('li', { class: p.callout ? 'is-callout' : null },
        h('span', { class: `sw ${p.cls}`, 'aria-hidden': 'true' }),
        h('span', {}, h('b', { text: `${p.value}%` }), ` ${p.label}`)))));
}

/* ---------- CPU engines: time vs accuracy scatter with the acceptable band ---------- */
export function cpuScatter(box, rows, tol, baseline) {
  const ref = rows.find((r) => /reference/i.test(r.engine)) || rows[0];
  const limit = ref.log_loss + tol;
  const pts = rows.filter((r) => Number.isFinite(r.p50_ms_4threads) && Number.isFinite(r.log_loss));
  const worst = pts.filter((r) => !r.ok).sort((a, b) => b.log_loss - a.log_loss)[0];
  const status = (r) => (r.chosen ? 'deployed' : r.ok ? 'accuracy OK' : 'accuracy broken');
  // fp32 sizes are estimates (parameters x 4 bytes, see cpu_engines.size_note), so they carry "~"
  const size = (r) => (r.size_gb == null ? null : `${/fp32/.test(r.engine) ? '~' : ''}${r.size_gb}`);
  const summary = `CPU engines, time per prediction (4 threads) against log loss. Acceptable band: log loss up to ${+limit.toFixed(4)} (fp32 plus ${tol}). ${pts
    .map((r) => `${r.engine}: ${fmt.s1(r.p50_ms_4threads)} s, ${r.log_loss}, ${status(r)}`).join('; ')}.`;

  responsive(box, (w) => {
    const narrow = w < 520;
    const H = narrow ? 320 : 360;
    const m = { t: 30, r: 16, b: 46, l: narrow ? 46 : 54 };
    const iw = w - m.l - m.r, ih = H - m.t - m.b;
    const xs = pts.map((r) => r.p50_ms_4threads / 1000);
    const ys = pts.map((r) => r.log_loss).concat(baseline);
    const X = niceTicks(Math.min(...xs), Math.max(...xs), narrow ? 4 : 6);
    const ypad = (Math.max(...ys) - Math.min(...ys)) * 0.1;
    const Y = niceTicks(Math.min(...ys) - ypad, Math.max(...ys) + ypad, 4);
    const x = (v) => m.l + (iw * (v - X.lo)) / (X.hi - X.lo);
    const y = (v) => m.t + (ih * (Y.hi - v)) / (Y.hi - Y.lo);
    const svg = svgRoot(w, H, summary);

    svg.append(s('rect', { class: 'band', x: m.l, y: y(limit), width: iw, height: y(Y.lo) - y(limit) }));
    const grid = s('g', { class: 'grid' });
    for (const t of Y.ticks) {
      grid.append(s('line', { x1: m.l, x2: w - m.r, y1: y(t), y2: y(t) }),
        s('text', { class: 'tick', x: m.l - 8, y: y(t) + 4, 'text-anchor': 'end', text: t.toFixed(Y.dec) }));
    }
    for (const t of X.ticks) {
      grid.append(s('text', { class: 'tick', x: x(t), y: m.t + ih + 18, 'text-anchor': 'middle', text: `${t} s` }));
    }
    svg.append(grid,
      s('text', { class: 'band-lbl', x: m.l + 8, y: y(Y.lo) - 8, text: `acceptable: within ${tol} of fp32` }),
      s('line', { class: 'ref-line', x1: m.l, x2: w - m.r, y1: y(baseline), y2: y(baseline) }),
      s('text', { class: 'lbl-muted', x: w - m.r, y: y(baseline) - 8, 'text-anchor': 'end', text: `coin flip ${baseline}` }),
      s('text', { class: 'tick', x: m.l + iw / 2, y: H - 6, 'text-anchor': 'middle', text: 'time per prediction, 4 threads (median)' }),
      s('text', { class: 'tick', x: 4, y: 14, text: 'log loss, lower is better' }));

    pts.forEach((r, i) => {
      const cx = x(r.p50_ms_4threads / 1000), cy = y(r.log_loss);
      const g = s('g', { class: 'fade-in', style: `--i:${i}` });
      if (r.ok) {
        g.append(s('circle', { class: r.chosen ? 'pt pt-chosen' : 'pt pt-ok', cx, cy, r: r.chosen ? 7 : 5 }));
      } else {
        const d = `M${cx - 5},${cy - 5}L${cx + 5},${cy + 5}M${cx + 5},${cy - 5}L${cx - 5},${cy + 5}`;
        g.append(s('path', { class: 'pt-bad-ring', d }), s('path', { class: 'pt-bad', d }));
      }
      if (r.chosen) {
        const anchor = cx > m.l + iw * 0.7 ? 'end' : cx < m.l + iw * 0.3 ? 'start' : 'middle';
        g.append(s('text', { class: 'lbl', x: cx, y: cy - 14, 'text-anchor': anchor, text: `deployed · ${r.size_gb} GB` }));
      } else if (r === ref) {
        g.append(s('text', { class: 'lbl-muted', x: cx, y: cy + 22, 'text-anchor': 'end', text: 'fp32 reference' }));
      } else if (r === worst) {
        g.append(s('text', { class: 'lbl-muted', x: cx + 10, y: cy - 9, text: r.engine.replace(/^ONNX\s+/, '') }));
      }
      const hit = s('circle', { class: 'hit', cx, cy, r: 14 });
      tip(hit, r.engine, [
        [String(r.log_loss), `log loss · ${status(r)}`],
        [`${fmt.s1(r.p50_ms_4threads)} s`, '4 threads'],
        ...(r.p50_ms_2threads != null ? [[`${fmt.s1(r.p50_ms_2threads)} s`, '2 threads']] : []),
        ...(r.size_gb != null ? [[`${size(r)} GB`, 'size']] : []),
      ]);
      svg.append(g, hit);
    });
    return svg;
  });

  return dataTable('CPU engines', [
    { label: 'Engine', get: (r) => r.engine },
    { label: 'Log loss', get: (r) => r.log_loss, n: true },
    { label: 'Time, 4 threads (s)', get: (r) => fmt.s1(r.p50_ms_4threads), n: true },
    { label: 'Time, 2 threads (s)', get: (r) => (r.p50_ms_2threads == null ? null : fmt.s1(r.p50_ms_2threads)), n: true },
    { label: 'Size (GB)', get: size, n: true },
    { label: 'Accuracy', get: (r) => (r.ok ? 'OK' : 'broken') },
  ], pts);
}
