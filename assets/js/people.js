// Profile cards: hovering, focusing or tapping a person's name opens a small card with
// their role and profile links. Names are marked up as <span class="person" data-person="author|teammate">,
// or as a wrapper around a heading (<div class="person" data-person="…"><h3>Name</h3></div>).
import { $$, h, isUrl } from './util.js';

const OPEN_DELAY = 120, CLOSE_DELAY = 220;
let openOne = null;   // only one card open at a time

const shortUrl = (u) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
const initials = (name) => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

function people(p) {
  const L = p.links;
  const member = (name) => p.team.find((t) => t.name === name) || {};
  const a = member(p.project.author), t = member(p.project.teammate);
  return {
    author: { name: p.project.author, role: a.role, photo: a.photo,
      links: [['LinkedIn', L.author_linkedin], ['Kaggle', L.author_kaggle], ['GitHub', L.author_github]] },
    teammate: { name: p.project.teammate, role: t.role, photo: t.photo,
      links: [['LinkedIn', L.teammate_linkedin], ['Kaggle', L.teammate_kaggle]] },
  };
}

/** Photo (relative path from project.json) with the initials as a fallback if it is missing or fails. */
function avatar(info) {
  const fallback = () => h('span', { class: 'pc-avatar', 'aria-hidden': 'true', text: initials(info.name) });
  if (!info.photo || /^[a-z]+:|^\//i.test(info.photo)) return fallback();   // relative paths only
  const img = h('img', { class: 'pc-avatar pc-photo', src: info.photo, alt: '', width: 56, height: 56, decoding: 'async' });
  img.addEventListener('error', () => img.replaceWith(fallback()), { once: true });
  return img;
}

function upgrade(wrap, info, n) {
  const id = `person-card-${n}`;
  const btn = h('button', { type: 'button', class: 'person-name', 'aria-expanded': 'false', 'aria-controls': id, text: info.name });
  const card = h('span', { class: 'person-card', id, role: 'group', 'aria-label': `${info.name}, profile` },
    h('span', { class: 'pc-head' },
      avatar(info),
      h('span', { class: 'pc-who' },
        h('span', { class: 'pc-name', text: info.name }),
        info.role ? h('span', { class: 'pc-role', text: info.role }) : null)),
    h('span', { class: 'pc-links' }, info.links.filter(([, u]) => isUrl(u)).map(([label, u]) =>
      h('a', { class: 'pc-link', href: u, target: '_blank', rel: 'noopener', 'aria-label': `${info.name} on ${label} (opens in a new tab)` },
        h('span', { class: 'pc-label', text: label }),
        h('span', { class: 'pc-url', text: `${shortUrl(u)} ↗` })))));
  // A wrapper around a heading keeps the card outside the heading, so the heading's name stays just the name.
  const heading = wrap.querySelector('h1, h2, h3, h4');
  if (heading) { heading.replaceChildren(btn); wrap.append(card); } else wrap.replaceChildren(btn, card);
  wrap.classList.add('is-ready');

  let via = null, timer = 0;
  // The card is position: fixed, so opening it never changes the page's layout (a layout change
  // would make scroll snapping jump). Place it under the name, or above it if there's no room below.
  const place = () => {
    const n = btn.getBoundingClientRect(), r = card.getBoundingClientRect();
    const below = n.bottom + 10, above = n.top - 10 - r.height;
    const up = below + r.height > innerHeight - 12 && above >= 12;
    wrap.classList.toggle('up', up);
    card.style.top = `${up ? above : below}px`;
    card.style.left = `${Math.max(12, Math.min(n.left, innerWidth - 12 - r.width))}px`;
  };
  const open = (how) => {
    clearTimeout(timer);
    if (openOne && openOne !== api) openOne.close();
    via = how;
    wrap.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    place();
    api.y0 = scrollY;
    openOne = api;
  };
  const close = () => {
    clearTimeout(timer);
    via = null;
    wrap.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    if (openOne === api) openOne = null;
  };
  const api = { close, place, wrap };

  // Mouse: open on hover, stay open while the pointer is over the name or the card.
  wrap.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(timer);
    if (!wrap.classList.contains('open')) timer = setTimeout(() => open('hover'), OPEN_DELAY);
  });
  wrap.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse' || via === 'click') return;
    clearTimeout(timer);
    timer = setTimeout(close, CLOSE_DELAY);
  });
  // Click or tap pins it open; a second click closes it.
  btn.addEventListener('click', () => (wrap.classList.contains('open') && via === 'click' ? close() : open('click')));
  // Keyboard: open when the name gets keyboard focus, close when focus leaves name + card.
  let refocusing = false;   // Escape hands focus back to the name without reopening the card
  btn.addEventListener('focus', () => { if (!refocusing && btn.matches(':focus-visible')) open('focus'); });
  wrap.addEventListener('focusout', (e) => { if (e.relatedTarget && !wrap.contains(e.relatedTarget)) close(); });
  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && wrap.classList.contains('open')) {
      e.stopPropagation();
      close();
      refocusing = true; btn.focus(); refocusing = false;
    }
  });
  return api;
}

export function initPeople(p) {
  const info = people(p);
  const cards = $$('.person[data-person]:not(.is-ready)').map((wrap, n) =>
    (info[wrap.dataset.person] ? upgrade(wrap, info[wrap.dataset.person], n) : null)).filter(Boolean);
  if (!cards.length) return;
  // Tap or click anywhere else closes the open card.
  document.addEventListener('pointerdown', (e) => {
    if (openOne && !openOne.wrap.contains(e.target)) openOne.close();
  });
  // A real scroll away closes it; a small one (e.g. focus bringing the name into view) just moves it along.
  addEventListener('scroll', () => {
    if (!openOne) return;
    if (Math.abs(scrollY - openOne.y0) > 60) openOne.close(); else openOne.place();
  }, { passive: true });
  addEventListener('resize', () => { if (openOne) openOne.close(); });
}
