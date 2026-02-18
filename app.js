/**
 * Andreas Dittes — Portfolio App
 * ─────────────────────────────────────────────────────────────
 * To add/edit items: update /data/items.json
 *
 * Recommended image size for project/startup cards:
 *   1280 × 720 px JPEG, optimised to ~150–300 KB
 *
 * No build step required. Plain vanilla JS (ES2020+).
 * ─────────────────────────────────────────────────────────────
 */

'use strict';

/* ============================================================
   STATE
   ============================================================ */
const state = {
  items:      [],     // raw data from items.json
  view:       'all',  // 'all' | 'project' | 'startup'
  filter:     'all',  // startup status filter
  search:     '',
  sort:       'newest',
  modalItem:  null,
};

/* ============================================================
   DOM REFS
   ============================================================ */
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

let DOM = {};

function cacheDOM() {
  DOM = {
    grid:        $('#grid'),
    filterChips: $('.chips'),
    searchInput: $('#search'),
    sortSelect:  $('#sort'),
    overlay:     $('#modal-overlay'),
    modal:       $('#modal'),
    nav:         $('.nav'),
    statProjects: $('#stat-projects'),
    statStartups: $('#stat-startups'),
    statExited:   $('#stat-exited'),
  };
}

/* ============================================================
   DATA  ← edit /data/items.json
   ============================================================ */
async function loadData() {
  try {
    const res = await fetch('./data/items.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.items = await res.json();
    updateStats();
    render();
    injectStructuredData();
  } catch (err) {
    console.error('Failed to load items.json:', err);
    DOM.grid.innerHTML = `
      <div class="empty-state">
        <h3>Could not load portfolio data</h3>
        <p>Make sure /data/items.json exists and is valid JSON.</p>
      </div>`;
  }
}

/* ============================================================
   ANIMATED COUNTERS
   ============================================================ */
function updateStats() {
  animateCounter(DOM.statProjects, state.items.filter(i => i.type === 'project').length);
  animateCounter(DOM.statStartups, state.items.filter(i => i.type === 'startup').length);
  animateCounter(DOM.statExited,   state.items.filter(i => i.status === 'exited').length);
}

function animateCounter(el, target) {
  if (!el) return;
  const start = performance.now();
  const dur   = 1000;
  (function step(now) {
    const t    = Math.min((now - start) / dur, 1);
    const ease = 1 - Math.pow(1 - t, 4);
    el.textContent = Math.round(ease * target);
    if (t < 1) requestAnimationFrame(step);
  })(start);
}

/* ============================================================
   FILTER + SORT
   ============================================================ */
function getFiltered() {
  let items = [...state.items];

  if (state.view !== 'all')    items = items.filter(i => i.type === state.view);
  if (state.filter !== 'all')  items = items.filter(i => i.status === state.filter);

  if (state.search) {
    const q = state.search.toLowerCase();
    items = items.filter(i =>
      i.title.toLowerCase().includes(q) ||
      i.description.toLowerCase().includes(q) ||
      (i.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }

  items.sort(state.sort === 'newest'
    ? (a, b) => new Date(b.date) - new Date(a.date)
    : (a, b) => a.title.localeCompare(b.title)
  );

  return items;
}

/* ============================================================
   RENDER
   ============================================================ */
function render() {
  const items = getFiltered();

  if (!items.length) {
    DOM.grid.innerHTML = `
      <div class="empty-state">
        <h3>No results</h3>
        <p>Try a different search term or filter.</p>
      </div>`;
    return;
  }

  DOM.grid.innerHTML = items.map((item, idx) => buildCard(item, idx)).join('');

  $$('.card', DOM.grid).forEach(card => {
    card.addEventListener('click',   () => openModal(card.dataset.id));
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(card.dataset.id); }
    });
    card.querySelector('.js-visit')?.addEventListener('click', e => e.stopPropagation());
    card.querySelector('.js-details')?.addEventListener('click', e => {
      e.stopPropagation(); openModal(card.dataset.id);
    });
  });
}

/* ============================================================
   CARD TEMPLATE
   ============================================================ */
function buildCard(item, idx) {
  const delay  = Math.min(idx * 55, 360);
  const badge  = item.status
    ? `<span class="status-badge status-badge--${item.status}" aria-label="Status: ${item.status}">${item.status}</span>`
    : '';
  const tags   = (item.tags || []).slice(0, 3).map(t => `<span class="tag">${esc(t)}</span>`).join('');
  const date   = item.date
    ? new Date(item.date).toLocaleDateString('en-GB', { year: 'numeric', month: 'short' })
    : '';

  return `
  <article
    class="card"
    data-id="${item.id}"
    role="button"
    tabindex="0"
    aria-label="Open details for ${esc(item.title)}"
    style="animation-delay:${delay}ms"
  >
    <div class="card__img-wrap">
      <img
        class="card__img"
        src="${esc(item.image)}"
        alt="${esc(item.title)}"
        loading="lazy"
        decoding="async"
        width="1280"
        height="720"
      />
      <span class="card__type-badge">${item.type}</span>
    </div>
    <div class="card__body">
      <div class="card__meta">
        ${badge}
        <span class="card__date">${date}</span>
      </div>
      <h3 class="card__title">${esc(item.title)}</h3>
      <p class="card__desc">${esc(item.description)}</p>
      ${tags ? `<div class="card__tags">${tags}</div>` : ''}
    </div>
    <div class="card__footer">
      <a
        href="${esc(item.url)}"
        class="btn btn--card btn--card-ghost js-visit"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Visit ${esc(item.title)} (opens in new tab)"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        Visit
      </a>
      <button class="btn btn--card btn--card-primary js-details" aria-label="View details for ${esc(item.title)}">
        Details
      </button>
    </div>
  </article>`;
}

/* ============================================================
   MODAL
   ============================================================ */
function openModal(id) {
  const item = state.items.find(i => i.id === id);
  if (!item) return;
  state.modalItem = item;

  const badge = item.status
    ? `<span class="status-badge status-badge--${item.status}">${item.status}</span>`
    : '';
  const tags  = (item.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('');
  const date  = item.date
    ? new Date(item.date).toLocaleDateString('en-GB', { year: 'numeric', month: 'long' })
    : '';

  DOM.modal.innerHTML = `
    <img class="modal__img" src="${esc(item.image)}" alt="${esc(item.title)}" loading="lazy" decoding="async" width="680" height="383" />
    <div class="modal__body">
      <div class="modal__header">
        <h2 class="modal__title" id="modal-title">${esc(item.title)}</h2>
        <button class="modal__close" id="modal-close" aria-label="Close modal">
          <svg viewBox="0 0 24 24" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modal__badges">
        <span class="modal__category">${item.type}</span>
        ${badge}
        ${date ? `<span class="tag" style="margin-left:auto">${date}</span>` : ''}
      </div>
      <p class="modal__desc">${esc(item.description)}</p>
      ${tags ? `<div class="modal__tags">${tags}</div>` : ''}
      <div class="modal__actions">
        <a href="${esc(item.url)}" class="btn btn--primary" target="_blank" rel="noopener noreferrer">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          Visit Site
        </a>
        <button class="btn btn--ghost" id="modal-close-btn">Close</button>
      </div>
    </div>`;

  DOM.overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  DOM.overlay.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => $('#modal-close', DOM.modal)?.focus());

  $('#modal-close',     DOM.modal)?.addEventListener('click', closeModal);
  $('#modal-close-btn', DOM.modal)?.addEventListener('click', closeModal);
}

function closeModal() {
  DOM.overlay.classList.remove('open');
  document.body.style.overflow = '';
  DOM.overlay.setAttribute('aria-hidden', 'true');
  state.modalItem = null;
}

/* ============================================================
   EVENTS
   ============================================================ */
function initEvents() {
  // Category tabs
  $$('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.view = btn.dataset.tab;
      if (state.view === 'project') state.filter = 'all';
      $$('[data-tab]').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === state.view);
        b.setAttribute('aria-selected', b.dataset.tab === state.view);
      });
      DOM.filterChips?.classList.toggle('hidden', state.view === 'project');
      render();
    });
  });

  // Status chips
  $$('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      state.filter = chip.dataset.filter;
      $$('.chip').forEach(c => {
        c.classList.toggle('active', c.dataset.filter === state.filter);
        c.setAttribute('aria-pressed', c.dataset.filter === state.filter);
      });
      render();
    });
  });

  // Search
  DOM.searchInput?.addEventListener('input', debounce(e => {
    state.search = e.target.value.trim();
    render();
  }, 240));

  // Sort
  DOM.sortSelect?.addEventListener('change', e => {
    state.sort = e.target.value;
    render();
  });

  // Modal overlay backdrop
  DOM.overlay?.addEventListener('click', e => {
    if (e.target === DOM.overlay) closeModal();
  });

  // Escape key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && state.modalItem) closeModal();
  });

  // Nav scroll effect
  const hero = document.querySelector('.hero');
  if (hero) {
    new IntersectionObserver(([e]) => {
      DOM.nav?.classList.toggle('scrolled', !e.isIntersecting);
    }, { threshold: 0, rootMargin: '-72px 0px 0px 0px' }).observe(hero);
  }

  // Reveal animations
  new IntersectionObserver((entries) => {
    entries.forEach(({ target, isIntersecting }) => {
      if (isIntersecting) { target.classList.add('visible'); }
    });
  }, { threshold: 0.1 }).observe && $$('.reveal').forEach(el => {
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { e.target.classList.add('visible'); }
    }, { threshold: 0.1 }).observe(el);
  });
}

/* ============================================================
   STRUCTURED DATA (dynamic, injected after data loads)
   ============================================================ */
function injectStructuredData() {
  const schema = [
    {
      "@context": "https://schema.org",
      "@type": "Person",
      "name": "Andreas Dittes",
      "url": "https://andreasdittes.com",
      "jobTitle": "Full Stack Entrepreneur",
      "image": "https://andreasdittes.com/assets/ad-profile.jpg",
      "address": {
        "@type": "PostalAddress",
        "addressLocality": "Berlin",
        "addressCountry": "DE"
      },
      // ↓ Update with real social URLs
      "sameAs": [
        "https://github.com/andreasdittes",
        "https://linkedin.com/in/andreasdittes",
        "https://twitter.com/andreasdittes"
      ]
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      "name": "Andreas Dittes Portfolio",
      "itemListElement": state.items.map((item, idx) => ({
        "@type": "ListItem",
        "position": idx + 1,
        "item": {
          "@type": item.type === 'project' ? 'CreativeWork' : 'Organization',
          "name": item.title,
          "description": item.description,
          "url": item.url,
          "dateCreated": item.date,
        }
      }))
    }
  ];

  const old = document.getElementById('json-ld-dynamic');
  if (old) old.remove();
  const s = document.createElement('script');
  s.id = 'json-ld-dynamic';
  s.type = 'application/ld+json';
  s.textContent = JSON.stringify(schema);
  document.head.appendChild(s);
}

/* ============================================================
   HELPERS
   ============================================================ */
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
  cacheDOM();
  initEvents();
  await loadData();
});
