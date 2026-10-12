// Small helpers shared by main.js and charts.js. No numbers live here: every value
// shown on the page is read from data/project.json or data/leaderboard.json.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const reduceMotion = () => document.documentElement.classList.contains('reduce-motion');

/** Read a dotted path ("a.b.0.c") from an object; undefined if any step is missing. */
export function get(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export const isUrl = (u) => typeof u === 'string' && /^https:\/\//.test(u);

/** Numbers print exactly as stored in the JSON; integers >= 1000 get thousands commas. */
export function num(v) {
  if (typeof v !== 'number') return v == null ? '—' : String(v);
  return Number.isInteger(v) && Math.abs(v) >= 1000 ? v.toLocaleString('en-US') : String(v);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Named formatters for data-fmt="…". Each gets (value, ctx) where ctx = { p, lb, d }. */
export const fmt = {
  num,
  text: (v) => String(v),
  cap: (v) => String(v).charAt(0).toUpperCase() + String(v).slice(1),
  f1: (v) => v.toFixed(1),
  f2: (v) => v.toFixed(2),
  s1: (v) => (v / 1000).toFixed(1),                 // ms -> seconds
  s2: (v) => (v / 1000).toFixed(2),
  h1: (v) => (v / 60).toFixed(1),                   // minutes -> hours
  x: (v) => `${num(v)}×`,
  x1: (v) => `${v.toFixed(1)}×`,
  pct: (v) => `${num(v)}%`,
  prob: (v) => `${Math.round(v * 100)}%`,
  rank: (v) => `#${v}`,
  approxInt: (v) => `~${num(v)}`,
  teams: (v, c) => `${c.lb && c.lb.teams_approx ? '~' : ''}${num(v)}`,
  topPct: (v, c) => (c.lb && c.lb.teams_approx ? `~${Math.round(v)}%` : `${v}%`),
  date: (v) => {
    const [, m, d] = String(v).split('-').map(Number);
    return m && d ? `${MONTHS[m - 1]} ${d}` : String(v);
  },
};

/** "3 hours ago"; a timestamp in the future (clock skew) reads as "just now". */
export function relTime(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const secs = (t - now) / 1000;
  if (secs > -60) return 'just now';
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [unit, size] of units) {
    if (Math.abs(secs) >= size) return rtf.format(Math.round(secs / size), unit);
  }
  return 'just now';
}

/** Build an HTML element. Text always goes in via textContent, never innerHTML. */
export function h(tag, attrs = {}, ...kids) {
  return build(document.createElement(tag), attrs, kids);
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function s(tag, attrs = {}, ...kids) {
  return build(document.createElementNS(SVG_NS, tag), attrs, kids);
}

function build(el, attrs, kids) {
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'text') el.textContent = v;
    else if (k === 'class') el.setAttribute('class', v);
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(2)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : String(kid));
  }
  return el;
}

/** Text with `inline code` segments, safely split into text nodes and <code>. */
export function richText(el, text) {
  el.replaceChildren(...String(text).split(/(`[^`]+`)/).filter(Boolean).map((part) =>
    part.startsWith('`') && part.endsWith('`') ? h('code', { text: part.slice(1, -1) }) : document.createTextNode(part)));
}

/**
 * Count a number up to the value already printed in `el` (e.g. "#51", "0.46").
 * The final text is kept in a screen-reader-only span so assistive tech never hears
 * the in-between values.
 */
export function countUp(el, duration = 900) {
  const final = el.textContent.trim();
  const m = /^([^\d]*)([\d,]*\.?\d+)(.*)$/.exec(final);
  if (!m || reduceMotion()) return;
  const [, pre, digits, post] = m;
  const target = parseFloat(digits.replace(/,/g, ''));
  const dec = (digits.split('.')[1] || '').length;
  const vis = h('span', { 'aria-hidden': 'true' });
  el.replaceChildren(vis, h('span', { class: 'sr-only', text: final }));
  const t0 = performance.now();
  const ease = (t) => 1 - (1 - t) ** 3;
  const frame = (now) => {
    const t = Math.min(1, (now - t0) / duration);
    const v = target * ease(t);
    vis.textContent = t < 1 ? pre + v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + post : final;
    if (t < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** Nice round axis ticks covering [min, max]. */
export function niceTicks(min, max, count = 5) {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  const step = (f >= 7.07 ? 10 : f >= 3.16 ? 5 : f >= 1.41 ? 2 : 1) * mag;
  const dec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  const lo = Math.floor(min / step + 1e-9) * step;
  const hi = Math.ceil(max / step - 1e-9) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(dec + 2));
  return { lo: ticks[0], hi: ticks[ticks.length - 1], ticks, dec, step };
}

export const pct = (f) => `${(Math.max(0, Math.min(1, f)) * 100).toFixed(2)}%`;
