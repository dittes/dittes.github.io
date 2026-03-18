(() => {
  'use strict';

  const DATA_URL = './data/occupations.json';
  const KEYS = {
    recent:    'occ-exp:recent',
    favorites: 'occ-exp:favorites',
    theme:     'occ-exp:theme',
    compare:   'occ-exp:compare'
  };

  const SCORE_FIELDS = [
    { key: 'old_frey_osborne_style_score',   label: 'Frey / Osborne style score' },
    { key: 'theoretical_ai_coverage',         label: 'Theoretical AI coverage'    },
    { key: 'observed_ai_coverage',            label: 'Observed AI coverage'       },
    { key: 'probability_of_computerisation',  label: 'Probability of computerisation' },
    { key: 'speed_of_replacement_score',      label: 'Replacement speed score'    }
  ];

  const state = {
    occupations:      [],
    filtered:         [],
    searchValue:      '',
    suggestions:      [],
    activeSugg:       -1,
    filters:          { risk_band: 'All', speed_category: 'All', confidence: 'All' },
    sortBy:           'probability_of_computerisation',
    sortDir:          'desc',
    currentSlug:      null,
    overlayOpen:      false,
    recent:           readStorage(KEYS.recent,    []),
    favorites:        readStorage(KEYS.favorites, []),
    compare:          readStorage(KEYS.compare,   [])
  };

  // ── DOM refs ─────────────────────────────────────────────────────
  const $app         = document.getElementById('app');
  const $overlay     = document.getElementById('searchOverlay');
  const $input       = document.getElementById('searchInput');
  const $resultsList = document.getElementById('overlayResultsList');
  const $idleArea    = document.getElementById('overlayIdleArea');
  const $clearBtn    = document.getElementById('clearSearchBtn');
  const $openBtn     = document.getElementById('openSearchBtn');
  const $closeBtn    = document.getElementById('closeSearchBtn');
  const $themeToggle = document.getElementById('themeToggle');
  const $shareBtn    = document.getElementById('sharePageButton');
  const $topCenter   = document.getElementById('topbarCenter');
  const $navLabel    = document.getElementById('navSearchLabel');

  // ── Boot ──────────────────────────────────────────────────────────
  boot();

  async function boot() {
    applyTheme(readStorage(KEYS.theme, preferredTheme()));
    wireGlobalEvents();
    initOverlay();
    renderSkeleton();

    try {
      const json = await fetch(DATA_URL).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      });
      // Support both a bare array and the workbook envelope format:
      // { sheets: { "Scored Occupations": { rows: [...] } } }
      const raw = Array.isArray(json)
        ? json
        : json?.sheets?.['Scored Occupations']?.rows ?? [];
      if (!raw.length) throw new Error('No occupation rows found in dataset.');
      state.occupations = raw.map(normalizeOccupation);
      state.filtered    = [...state.occupations];

      // Auto-open search on first visit to home
      const h = location.hash || '#/';
      if (!state.searchValue && (h === '#/' || h === '')) {
        openOverlay();
      }
      route();
    } catch (err) {
      $app.innerHTML = `
        <section class="panel empty-state fade-in">
          <h2>Dataset failed to load</h2>
          <p class="empty-copy">${esc(err.message || 'Unknown error')}</p>
          <p class="footer-note">Expected: <code>${DATA_URL}</code></p>
        </section>`;
    }
  }

  // ── Routing ───────────────────────────────────────────────────────
  function route() {
    const h = location.hash || '#/';
    const [, name, param] = h.split('/');
    if (name === 'occupation' && param) {
      state.currentSlug = decodeURIComponent(param);
      renderDetail();
    } else if (name === 'compare') {
      renderCompare();
    } else {
      state.currentSlug = null;
      renderHome();
    }
  }

  // ── Global events ─────────────────────────────────────────────────
  function wireGlobalEvents() {
    window.addEventListener('hashchange', () => { quietCloseOverlay(); route(); });

    $themeToggle.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      applyTheme(next);
      writeStorage(KEYS.theme, next);
    });

    $shareBtn.addEventListener('click', async () => {
      try {
        if (navigator.share) {
          await navigator.share({ title: document.title, url: location.href });
        } else {
          await navigator.clipboard.writeText(location.href);
          pulse($shareBtn, 'Copied!');
        }
      } catch (_) {}
    });

    // ⌘/Ctrl+K shortcut
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); openOverlay(); }
    });
  }

  // ════════════════════════════════════════════════════════════════
  // SEARCH OVERLAY
  // ════════════════════════════════════════════════════════════════
  function initOverlay() {
    $openBtn.addEventListener('click', openOverlay);
    $closeBtn.addEventListener('click', closeOverlay);

    // Click outside overlay-body to close
    $overlay.addEventListener('click', (e) => { if (e.target === $overlay) closeOverlay(); });

    // Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.overlayOpen) closeOverlay();
    });

    // Input events
    $input.addEventListener('input', onInputChange);
    $input.addEventListener('keydown', onInputKeydown);
    $input.addEventListener('focus', () => {
      state.suggestions = getSuggestions(state.searchValue, 8);
      renderOverlayResults();
    });
    $input.addEventListener('blur', () => {
      // Let click events fire first
      setTimeout(() => { if (!$overlay.contains(document.activeElement)) renderOverlayResults(); }, 160);
    });

    $clearBtn.addEventListener('click', () => {
      state.searchValue = '';
      $input.value = '';
      state.activeSugg = -1;
      $clearBtn.classList.add('hidden');
      state.suggestions = getSuggestions('', 8);
      renderOverlayResults();
      renderIdleArea();
      $input.focus();
    });
  }

  function onInputChange(e) {
    state.searchValue = e.target.value;
    state.activeSugg  = -1;
    $clearBtn.classList.toggle('hidden', !state.searchValue);
    state.suggestions = getSuggestions(state.searchValue, 8);
    renderOverlayResults();
    renderIdleArea();
  }

  function onInputKeydown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      state.activeSugg = Math.min(state.activeSugg + 1, state.suggestions.length - 1);
      renderOverlayResults();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      state.activeSugg = Math.max(state.activeSugg - 1, 0);
      renderOverlayResults();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = state.suggestions[state.activeSugg] || state.suggestions[0];
      if (hit) openOccupation(hit.item.slug);
      else closeOverlay();
    } else if (e.key === 'Escape') {
      closeOverlay();
    }
  }

  function openOverlay() {
    if (!state.occupations.length) return;
    state.overlayOpen = true;
    $overlay.classList.remove('is-closing');
    $overlay.classList.add('is-open');
    document.body.classList.add('overlay-open');
    $input.value = state.searchValue;
    $clearBtn.classList.toggle('hidden', !state.searchValue);
    state.suggestions = getSuggestions(state.searchValue, 8);
    renderOverlayResults();
    renderIdleArea();
    $openBtn.classList.add('active');
    setTimeout(() => { $input.focus(); if (state.searchValue) $input.select(); }, 50);
  }

  function closeOverlay() {
    // Spring close animation
    $overlay.classList.remove('is-open');
    $overlay.classList.add('is-closing');
    document.body.classList.remove('overlay-open');
    $openBtn.classList.remove('active');
    setTimeout(() => {
      $overlay.classList.remove('is-closing');
      state.overlayOpen = false;
    }, 280);
    // Re-render home if on home route
    const h = location.hash || '#/';
    if (h === '#/' || h === '') renderHome();
  }

  function quietCloseOverlay() {
    if (!state.overlayOpen) return;
    $overlay.classList.remove('is-open', 'is-closing');
    document.body.classList.remove('overlay-open');
    $openBtn.classList.remove('active');
    state.overlayOpen = false;
  }

  function renderOverlayResults() {
    if (!state.searchValue.trim() || !state.suggestions.length) {
      $resultsList.innerHTML = '';
      $resultsList.classList.add('hidden');
      return;
    }
    $resultsList.innerHTML = state.suggestions.map((entry, i) => `
      <button class="overlay-result ${i === state.activeSugg ? 'active' : ''}"
        type="button" data-slug="${escAttr(entry.item.slug)}">
        <span class="overlay-result-num">${i + 1}</span>
        <span class="overlay-result-body">
          <span class="overlay-result-title">${esc(entry.item.job_title)}</span>
          <span class="overlay-result-sub">${esc(entry.item['O*NET-SOC Code'] || '')} · ${esc(entry.item.risk_band || 'Unknown')} risk</span>
        </span>
        <span class="overlay-result-pct">${pct(entry.item.probability_of_computerisation)}</span>
      </button>
    `).join('');
    $resultsList.classList.remove('hidden');

    $resultsList.querySelectorAll('[data-slug]').forEach((btn) => {
      btn.addEventListener('mousedown', (e) => { e.preventDefault(); openOccupation(btn.dataset.slug); });
    });
  }

  function renderIdleArea() {
    if (state.searchValue.trim()) {
      $idleArea.innerHTML = '';
      return;
    }
    const recent    = state.recent.map(findBySlug).filter(Boolean);
    const favorites = state.favorites.map(findBySlug).filter(Boolean);
    const sections  = [];

    if (recent.length) {
      sections.push(`
        <div>
          <div class="overlay-section-label">Recent</div>
          <div class="overlay-chip-row">
            ${recent.slice(0, 8).map((o) => `
              <button class="overlay-chip" type="button" data-slug="${escAttr(o.slug)}">${esc(o.job_title)}</button>
            `).join('')}
          </div>
        </div>`);
    }
    if (favorites.length) {
      sections.push(`
        <div>
          <div class="overlay-section-label">Favorites</div>
          <div class="overlay-chip-row">
            ${favorites.slice(0, 8).map((o) => `
              <button class="overlay-chip" type="button" data-slug="${escAttr(o.slug)}">${esc(o.job_title)}</button>
            `).join('')}
          </div>
        </div>`);
    }
    if (!sections.length && state.occupations.length) {
      const top = [...state.occupations]
        .sort((a, b) => (b.probability_of_computerisation || 0) - (a.probability_of_computerisation || 0))
        .slice(0, 8);
      sections.push(`
        <div>
          <div class="overlay-section-label">Highest automation risk</div>
          <div class="overlay-chip-row">
            ${top.map((o) => `
              <button class="overlay-chip" type="button" data-slug="${escAttr(o.slug)}">${esc(o.job_title)}</button>
            `).join('')}
          </div>
        </div>`);
    }

    $idleArea.innerHTML = sections.join('');
    $idleArea.querySelectorAll('[data-slug]').forEach((btn) => {
      btn.addEventListener('click', () => openOccupation(btn.dataset.slug));
    });
  }

  // ── Topbar center ──────────────────────────────────────────────────
  function renderTopbarCenter() {
    if (!$topCenter) return;
    if (state.searchValue) {
      $navLabel.textContent = state.searchValue.length > 18
        ? state.searchValue.slice(0, 18) + '…'
        : state.searchValue;
      $topCenter.innerHTML = `
        <button class="topbar-query" id="topbarQ" type="button" title="Refine search">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <strong>"${esc(state.searchValue)}"</strong>
          <button class="topbar-query-x" id="topbarQX" type="button" title="Clear">×</button>
        </button>`;
      document.getElementById('topbarQ')?.addEventListener('click', (e) => {
        if (e.target.id !== 'topbarQX') openOverlay();
      });
      document.getElementById('topbarQX')?.addEventListener('click', (e) => {
        e.stopPropagation();
        state.searchValue = '';
        $navLabel.textContent = 'Search';
        renderTopbarCenter();
        renderHome();
      });
    } else {
      $navLabel.textContent = 'Search';
      $topCenter.innerHTML = '';
    }
  }

  // ════════════════════════════════════════════════════════════════
  // HOME VIEW
  // ════════════════════════════════════════════════════════════════
  function renderHome() {
    applyFiltersAndSort();
    renderTopbarCenter();

    const featured = [...state.occupations]
      .sort((a, b) => (num(b.probability_of_computerisation) || 0) - (num(a.probability_of_computerisation) || 0))
      .slice(0, 6);

    const recentList  = state.recent.map(findBySlug).filter(Boolean);
    const favList     = state.favorites.map(findBySlug).filter(Boolean);
    const results     = state.searchValue.trim()
      ? getSuggestions(state.searchValue, 30).map((e) => e.item)
      : state.filtered.slice(0, 30);

    $app.innerHTML = `
      <!-- Results bar -->
      <div class="results-bar fade-in">
        <span class="results-count">${state.occupations.length.toLocaleString()} occupations</span>
        ${state.searchValue ? `
          <span class="results-tag">
            "${esc(state.searchValue)}"
            <button id="clearTagBtn" title="Clear">×</button>
          </span>` : ''}
        <div class="sort-chips">
          <button class="chip ${state.sortBy === 'probability_of_computerisation' ? 'active' : ''}"
            type="button" data-sort-by="sortBy" data-sort-val="probability_of_computerisation">Automation</button>
          <button class="chip ${state.sortBy === 'speed_of_replacement_score' ? 'active' : ''}"
            type="button" data-sort-by="sortBy" data-sort-val="speed_of_replacement_score">Speed</button>
          <button class="chip ${state.sortBy === 'job_title' ? 'active' : ''}"
            type="button" data-sort-by="sortBy" data-sort-val="job_title">A–Z</button>
          <button class="chip" type="button" data-sort-by="sortDir"
            data-sort-val="${state.sortDir === 'desc' ? 'asc' : 'desc'}">
            ${state.sortDir === 'desc' ? '↓' : '↑'} ${state.sortDir === 'desc' ? 'Desc' : 'Asc'}
          </button>
        </div>
      </div>

      <!-- Dashboard grid -->
      <section class="dashboard-grid fade-in">

        <!-- Sidebar -->
        <aside class="sidebar">
          <section class="panel sidebar-card">
            <div class="section-head">
              <h2 class="section-label">Filters</h2>
              <button id="resetBtn" class="ghost-button" type="button">Reset</button>
            </div>
            <div class="filters-grid">
              ${filterSelect('risk_band',      'Risk band',       ['All', ...uniqVals('risk_band')])}
              ${filterSelect('speed_category', 'Speed category',  ['All', ...uniqVals('speed_category')])}
              ${filterSelect('confidence',     'Confidence',      ['All', ...uniqVals('confidence')])}
            </div>
          </section>

          <section class="panel sidebar-card">
            <div class="section-head"><h2 class="section-label">By risk</h2></div>
            <div class="overlay-chip-row">
              ${uniqVals('risk_band').map((v) => `
                <button class="tag" type="button"
                  data-fk="risk_band" data-fv="${escAttr(v)}">${esc(v)}</button>`).join('')}
            </div>
          </section>

          <section class="panel sidebar-card">
            <button class="primary-button" style="width:100%"
              type="button" data-nav="#/compare">Compare occupations →</button>
          </section>

          ${recentList.length ? `
            <section class="panel sidebar-card">
              <div class="section-head">
                <h2 class="section-label">Recent</h2>
                <button id="clearRecentBtn" class="ghost-button" type="button">Clear</button>
              </div>
              <div class="stack">
                ${recentList.map(miniLink).join('')}
              </div>
            </section>` : ''}

          ${favList.length ? `
            <section class="panel sidebar-card">
              <div class="section-head"><h2 class="section-label">Favorites</h2></div>
              <div class="stack">${favList.map(miniLink).join('')}</div>
            </section>` : ''}
        </aside>

        <!-- Content -->
        <div class="content-stack">
          <section class="panel content-card">
            <div class="section-head">
              <h2 class="section-label">Highest automation risk</h2>
            </div>
            <div class="featured-grid">
              ${featured.map(featuredCard).join('')}
            </div>
          </section>

          <section class="panel content-card">
            <div class="section-head">
              <h2 class="section-label">All occupations</h2>
              <span style="font-family:var(--f-mono);font-size:11px;color:var(--muted-2);">
                ${results.length.toLocaleString()} shown
              </span>
            </div>
            ${results.length ? `
              <div class="table-wrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Occupation</th>
                      <th>Risk</th>
                      <th>Speed</th>
                      <th>Automation</th>
                      <th>Observed AI</th>
                      <th>Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${results.map(tableRow).join('')}
                  </tbody>
                </table>
              </div>` : `
              <div class="empty-state">
                <h3>No results</h3>
                <p class="empty-copy">Try a different search or remove filters.</p>
              </div>`}
          </section>
        </div>
      </section>`;

    wireHome();
  }

  function wireHome() {
    document.querySelectorAll('[data-open]').forEach((el) =>
      el.addEventListener('click', () => openOccupation(el.dataset.open)));
    document.querySelectorAll('[data-nav]').forEach((btn) =>
      btn.addEventListener('click', () => { location.hash = btn.dataset.nav; }));
    document.querySelectorAll('[data-select-filter]').forEach((sel) =>
      sel.addEventListener('change', () => { state.filters[sel.dataset.selectFilter] = sel.value; renderHome(); }));
    document.querySelectorAll('[data-fk]').forEach((btn) =>
      btn.addEventListener('click', () => { state.filters[btn.dataset.fk] = btn.dataset.fv; renderHome(); }));
    document.querySelectorAll('[data-sort-by]').forEach((btn) =>
      btn.addEventListener('click', () => { state[btn.dataset.sortBy] = btn.dataset.sortVal; renderHome(); }));
    document.getElementById('resetBtn')?.addEventListener('click', () => {
      state.filters  = { risk_band: 'All', speed_category: 'All', confidence: 'All' };
      state.sortBy   = 'probability_of_computerisation';
      state.sortDir  = 'desc';
      renderHome();
    });
    document.getElementById('clearRecentBtn')?.addEventListener('click', () => {
      state.recent = []; writeStorage(KEYS.recent, []); renderHome();
    });
    document.getElementById('clearTagBtn')?.addEventListener('click', () => {
      state.searchValue = ''; renderHome();
    });
  }

  // ════════════════════════════════════════════════════════════════
  // DETAIL VIEW
  // ════════════════════════════════════════════════════════════════
  function renderDetail() {
    const o = findBySlug(state.currentSlug);
    if (!o) {
      $app.innerHTML = `
        <section class="panel empty-state fade-in">
          <h2>Occupation not found</h2>
          <p class="empty-copy">The URL doesn't match any occupation in the dataset.</p>
          <a class="primary-button" href="#/">← Back to search</a>
        </section>`;
      return;
    }

    rememberOcc(o.slug);
    renderTopbarCenter();

    const pctVal    = Math.round((num(o.probability_of_computerisation) || 0) * 100);
    const pctClass  = riskPctClass(o.risk_band);
    const percentile = percentileRank('probability_of_computerisation', o.probability_of_computerisation);
    const isFav     = state.favorites.includes(o.slug);
    const isCompare = state.compare.includes(o.slug);

    $app.innerHTML = `
      <section class="panel content-card fade-in">
        <!-- Nav row -->
        <div class="detail-nav">
          <a class="back-link" href="#/">← Back</a>
          <div class="inline-actions">
            <button id="favBtn" class="favorite-chip ${isFav ? 'active' : ''}" type="button">
              ${isFav ? '★ Favorited' : '☆ Favorite'}
            </button>
            <button id="cmpBtn" class="compare-chip ${isCompare ? 'active' : ''}" type="button">
              ${isCompare ? '✓ In compare' : '+ Compare'}
            </button>
            <button id="cpyBtn" class="ghost-button" type="button">Copy link</button>
            <button id="prtBtn" class="ghost-button" type="button">Print</button>
          </div>
        </div>

        <!-- Hero: italic serif title + big colored % -->
        <div class="occ-hero">
          <div class="occ-title-col">
            <div class="occ-tags">
              ${pill(o.risk_band, 'risk')}
              ${pill(o.speed_category, 'speed')}
              ${pill(o.confidence, 'conf')}
              <span class="risk-pill risk-unknown" style="font-size:10px;letter-spacing:.06em;">${esc(o['O*NET-SOC Code'] || '—')}</span>
            </div>
            <h1 class="occ-title">${esc(o.job_title)}</h1>
            <p class="occ-desc">${esc(o.job_description || 'No description available.')}</p>
          </div>
          <div class="occ-risk-hero">
            <div class="occ-risk-pct ${pctClass}">${pctVal}<span class="pct-sym">%</span></div>
            <div class="occ-risk-label">Automation risk</div>
          </div>
        </div>

        <!-- Body: scores + sidebar -->
        <div class="detail-body">
          <div class="detail-main">

            <!-- Score breakdown bars -->
            <div>
              <span class="reasoning-head">Score breakdown</span>
              <div class="score-breakdown">
                ${SCORE_FIELDS.map((f) => scoreBar(o, f)).join('')}
              </div>
            </div>

            <!-- Reasoning -->
            <div>
              <span class="reasoning-head">Why this score?</span>
              <p class="reasoning-text">${esc(o.reasoning_short || 'No short reasoning available.')}</p>
            </div>
            ${o.reasoning_detailed ? `
              <div>
                <span class="reasoning-head">Detailed reasoning</span>
                <div class="reasoning-bullets">
                  ${String(o.reasoning_detailed).split('\n').map((l) => l.trim()).filter(Boolean)
                    .map((l) => `<div class="reasoning-bullet">${esc(l)}</div>`).join('')}
                </div>
              </div>` : ''}
          </div>

          <!-- Sidebar -->
          <aside class="detail-sidebar">
            <!-- Percentile gauge -->
            <div class="dsc">
              <span class="dsc-label">Dataset percentile</span>
              <div class="radial-wrap" style="padding:8px 0;">
                <div class="radial" style="--v:${percentile / 100}">
                  <div class="radial-inner">
                    <span class="radial-val">${percentile}</span>
                    <span class="radial-sub">percentile</span>
                  </div>
                </div>
              </div>
              <div class="score-row" style="margin-top:4px;">
                <div class="score-head">
                  <span class="score-label">Automation percentile</span>
                  <span class="score-val">${percentile}%</span>
                </div>
                <div class="progress-track">
                  <div class="progress-fill ${riskFillClass(o.risk_band)}" style="width:${percentile}%"></div>
                </div>
              </div>
            </div>

            <!-- Key bottleneck -->
            ${o.key_bottleneck ? `
              <div class="dsc">
                <span class="dsc-label">Key bottleneck</span>
                <div class="dsc-value">${esc(o.key_bottleneck)}</div>
              </div>` : ''}

            <!-- Assumptions -->
            ${o.assumptions ? `
              <div class="dsc">
                <span class="dsc-label">Assumptions</span>
                <div class="dsc-value">${esc(o.assumptions)}</div>
              </div>` : ''}
          </aside>
        </div>
      </section>`;

    // Wire buttons
    document.getElementById('favBtn')?.addEventListener('click', () => {
      toggleStored('favorites', o.slug); renderDetail();
    });
    document.getElementById('cmpBtn')?.addEventListener('click', () => {
      toggleCompare(o.slug); renderDetail();
    });
    document.getElementById('cpyBtn')?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(location.href); pulse(document.getElementById('cpyBtn'), 'Copied!'); } catch (_) {}
    });
    document.getElementById('prtBtn')?.addEventListener('click', () => window.print());
  }

  // ════════════════════════════════════════════════════════════════
  // COMPARE VIEW
  // ════════════════════════════════════════════════════════════════
  function renderCompare() {
    const items = state.compare.map(findBySlug).filter(Boolean).slice(0, 2);
    $app.innerHTML = `
      <section class="panel content-card fade-in">
        <div class="detail-nav">
          <a class="back-link" href="#/">← Back</a>
          <button id="clearCmpBtn" class="ghost-button" type="button">Clear compare</button>
        </div>
        <div style="margin-bottom:16px;">
          <h2 style="font-family:var(--f-ui);font-weight:800;letter-spacing:-0.03em;margin:0 0 6px;">Compare occupations</h2>
          <p style="color:var(--muted);font-size:.88rem;margin:0;">Open any occupation and click "+ Compare" to add it here.</p>
        </div>
        ${items.length ? `
          <div class="compare-grid">
            ${items.map(compareCard).join('')}
          </div>` : `
          <div class="empty-state">
            <h3>Nothing selected yet</h3>
            <p class="empty-copy">Open any occupation and click "+ Compare".</p>
          </div>`}
      </section>`;

    document.getElementById('clearCmpBtn')?.addEventListener('click', () => {
      state.compare = []; writeStorage(KEYS.compare, []); renderCompare();
    });
    document.querySelectorAll('[data-open]').forEach((btn) =>
      btn.addEventListener('click', () => openOccupation(btn.dataset.open)));
  }

  // ════════════════════════════════════════════════════════════════
  // HTML RENDER HELPERS
  // ════════════════════════════════════════════════════════════════

  function featuredCard(o) {
    const v = num(o.probability_of_computerisation) ?? 0;
    const pctNum  = Math.round(v * 100);
    const fillCls = riskFillClass(o.risk_band);
    const bigCls  = fillCls === 'high' ? 'high' : fillCls === 'medium' ? 'med' : 'low';
    return `
      <article class="featured-card" data-open="${escAttr(o.slug)}">
        <div class="featured-title">${esc(o.job_title)}</div>
        <div>
          <span class="featured-big-num ${bigCls}">${pctNum}</span>
          <span class="featured-sub">% automation risk</span>
        </div>
        <div class="featured-bar-wrap">
          <div class="score-head">
            ${pill(o.risk_band, 'risk')}
            ${pill(o.speed_category, 'speed')}
          </div>
          <div class="progress-track" style="margin-top:6px;">
            <div class="progress-fill ${fillCls}" style="width:${pctNum}%"></div>
          </div>
        </div>
      </article>`;
  }

  function tableRow(o) {
    return `
      <tr data-open="${escAttr(o.slug)}">
        <td>
          <span class="t-occ-name">${esc(o.job_title)}</span>
          <span class="t-occ-code">${esc(o['O*NET-SOC Code'] || '')}</span>
        </td>
        <td>${pill(o.risk_band, 'risk')}</td>
        <td>${pill(o.speed_category, 'speed')}</td>
        <td class="mono-val">${pct(o.probability_of_computerisation)}</td>
        <td class="mono-val">${pct(o.observed_ai_coverage)}</td>
        <td>${esc(o.confidence || '—')}</td>
      </tr>`;
  }

  function scoreBar(o, field) {
    const v       = num(o[field.key]);
    const pctNum  = Math.round((v ?? 0) * 100);
    const fillCls = riskFillClass(o.risk_band);
    return `
      <div class="sb-item">
        <div class="sb-head">
          <span class="sb-label">${esc(field.label)}</span>
          <span class="sb-val">${v == null ? '—' : `${v.toFixed(2)} · ${pctNum}%`}</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill ${fillCls}" style="width:${pctNum}%"></div>
        </div>
      </div>`;
  }

  function compareCard(o) {
    return `
      <article class="compare-card">
        <div class="compare-header">
          <h3 class="compare-title">${esc(o.job_title)}</h3>
          <div class="compare-meta">
            ${pill(o.risk_band, 'risk')}
            ${pill(o.speed_category, 'speed')}
          </div>
          <p style="font-size:.88rem;color:var(--text-2);margin:0;line-height:1.6;">
            ${esc(o.job_description || 'No description.')}
          </p>
        </div>
        <div class="score-bars">
          ${SCORE_FIELDS.map((f) => {
            const v = num(o[f.key]);
            return `
              <div class="score-row">
                <div class="score-head">
                  <span class="score-label">${esc(f.label)}</span>
                  <span class="score-val">${v == null ? '—' : `${v.toFixed(2)}`}</span>
                </div>
                <div class="progress-track">
                  <div class="progress-fill ${riskFillClass(o.risk_band)}" style="width:${Math.round((v ?? 0) * 100)}%"></div>
                </div>
              </div>`;
          }).join('')}
        </div>
        <button class="ghost-button" type="button" data-open="${escAttr(o.slug)}" style="width:100%;justify-content:center;">
          Open profile →
        </button>
      </article>`;
  }

  function miniLink(o) {
    return `
      <button class="mini-occ-btn" type="button" data-open="${escAttr(o.slug)}">
        <span class="mini-occ-name">${esc(o.job_title)}</span>
        <span class="mini-occ-meta">${esc(o.risk_band || 'Unknown')} · ${pct(o.probability_of_computerisation)}</span>
      </button>`;
  }

  function filterSelect(key, label, values) {
    return `
      <label>
        <span class="field-label">${esc(label)}</span>
        <select data-select-filter="${escAttr(key)}">
          ${values.map((v) => `<option value="${escAttr(v)}" ${state.filters[key] === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}
        </select>
      </label>`;
  }

  function pill(value, kind) {
    const s   = String(value || 'Unknown');
    const cls = `${kind}-${normalizeText(s).replace(/\s+/g, '-')}`;
    return `<span class="${kind}-pill ${cls}">${esc(s)}</span>`;
  }

  // ════════════════════════════════════════════════════════════════
  // SEARCH LOGIC (unchanged core algorithm)
  // ════════════════════════════════════════════════════════════════
  function getSuggestions(query, limit) {
    const q = query.trim();
    const results = q
      ? state.occupations
          .map((item) => ({ item, score: searchScore(item, q) }))
          .filter((e) => e.score > 0)
          .sort((a, b) => b.score - a.score)
      : state.occupations.map((item, i) => ({ item, score: state.occupations.length - i }));
    return results.slice(0, limit);
  }

  function searchScore(item, query) {
    const q     = normalizeText(query);
    if (!q) return 0;
    const title = item.__titleNorm;
    const desc  = item.__descNorm;
    const blob  = item.__blob;

    if (title === q)          return 2000;
    if (title.startsWith(q))  return 1200 - title.length;
    if (title.includes(q))    return 900  - title.indexOf(q);

    const tw = title.split(' '), qw = q.split(' ');
    let score = 0;
    for (const w of qw) {
      if (tw.some((t) => t.startsWith(w))) score += 160;
      else if (blob.includes(w))           score += 70;
      else {
        const d = bestDist(w, tw);
        if (d <= 1) score += 60;
        else if (d === 2) score += 22;
      }
    }
    if (desc.includes(q)) score += 65;
    if (blob.includes(q)) score += 40;
    return score;
  }

  function bestDist(word, words) {
    let best = Infinity;
    for (const w of words) {
      if (Math.abs(w.length - word.length) > 2) continue;
      best = Math.min(best, levenshtein(word, w));
      if (best === 0) break;
    }
    return best;
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let prev = i - 1; dp[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = dp[j];
        dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = tmp;
      }
    }
    return dp[b.length];
  }

  function applyFiltersAndSort() {
    state.filtered = state.occupations.filter((o) => {
      if (state.filters.risk_band      !== 'All' && o.risk_band      !== state.filters.risk_band)      return false;
      if (state.filters.speed_category !== 'All' && o.speed_category !== state.filters.speed_category) return false;
      if (state.filters.confidence     !== 'All' && o.confidence     !== state.filters.confidence)     return false;
      return !state.searchValue.trim() || searchScore(o, state.searchValue) > 0;
    });
    const dir = state.sortDir === 'asc' ? 1 : -1;
    state.filtered.sort((a, b) => {
      const l = a[state.sortBy], r = b[state.sortBy];
      if (typeof l === 'string' || typeof r === 'string')
        return String(l || '').localeCompare(String(r || '')) * dir;
      return ((num(l) || 0) - (num(r) || 0)) * dir;
    });
  }

  // ════════════════════════════════════════════════════════════════
  // DATA / UTIL HELPERS
  // ════════════════════════════════════════════════════════════════
  function normalizeOccupation(item, index) {
    const title = item.job_title || `Untitled ${index + 1}`;
    const code  = item['O*NET-SOC Code'] || `occ-${index + 1}`;
    const slug  = `${slugify(title)}-${slugify(code)}`;
    const desc  = item.job_description || '';
    return {
      ...item,
      slug,
      __titleNorm: normalizeText(title),
      __descNorm:  normalizeText(desc),
      __blob: normalizeText([
        title, desc,
        item.reasoning_short, item.reasoning_detailed,
        item.key_bottleneck, code
      ].filter(Boolean).join(' '))
    };
  }

  function percentileRank(field, value) {
    const vals = state.occupations.map((o) => num(o[field])).filter((n) => n != null).sort((a, b) => a - b);
    if (!vals.length || value == null) return 0;
    let c = 0;
    for (const v of vals) if (v <= value) c++;
    return Math.round((c / vals.length) * 100);
  }

  function riskPctClass(band) {
    const b = normalizeText(String(band || ''));
    if (b.includes('high'))   return 'is-high';
    if (b.includes('med') || b.includes('mod')) return 'is-medium';
    if (b.includes('low'))    return 'is-low';
    return '';
  }

  function riskFillClass(band) {
    const b = normalizeText(String(band || ''));
    if (b.includes('high'))   return 'high';
    if (b.includes('med') || b.includes('mod')) return 'medium';
    if (b.includes('low'))    return 'low';
    return '';
  }

  function openOccupation(slug) {
    if (!slug) return;
    quietCloseOverlay();
    location.hash = `#/occupation/${encodeURIComponent(slug)}`;
  }

  function findBySlug(slug) { return state.occupations.find((o) => o.slug === slug) || null; }
  function uniqVals(key) { return [...new Set(state.occupations.map((o) => o[key]).filter(Boolean))].sort(); }

  function rememberOcc(slug) {
    state.recent = [slug, ...state.recent.filter((s) => s !== slug)].slice(0, 8);
    writeStorage(KEYS.recent, state.recent);
  }
  function toggleStored(type, slug) {
    const key  = type === 'favorites' ? KEYS.favorites : KEYS.recent;
    const list = type === 'favorites' ? state.favorites : state.recent;
    const next = list.includes(slug) ? list.filter((s) => s !== slug) : [slug, ...list].slice(0, 24);
    if (type === 'favorites') state.favorites = next;
    else state.recent = next;
    writeStorage(key, next);
  }
  function toggleCompare(slug) {
    state.compare = state.compare.includes(slug)
      ? state.compare.filter((s) => s !== slug)
      : [...state.compare, slug].slice(-2);
    writeStorage(KEYS.compare, state.compare);
  }

  // ── Formatting ────────────────────────────────────────────────────
  function pct(value) {
    const n = num(value);
    return n == null ? '—' : `${Math.round(n * 100)}%`;
  }
  function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  function normalizeText(v) {
    return String(v || '').toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function slugify(v) { return normalizeText(v).replace(/\s+/g, '-'); }
  function esc(v) {
    return String(v || '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }
  function escAttr(v) { return esc(v).replace(/`/g,'&#096;'); }

  // ── Theme ──────────────────────────────────────────────────────────
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    $themeToggle.textContent = theme === 'light' ? 'Dark' : 'Light';
  }
  function preferredTheme() {
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  // ── Misc ───────────────────────────────────────────────────────────
  function renderSkeleton() {
    const t = document.getElementById('skeletonTemplate');
    $app.innerHTML = '';
    $app.appendChild(t.content.cloneNode(true));
  }
  function pulse(btn, text) {
    if (!btn) return;
    const orig = btn.textContent;
    btn.textContent = text;
    setTimeout(() => { btn.textContent = orig; }, 1300);
  }
  function readStorage(key, fb) {
    try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fb; } catch { return fb; }
  }
  function writeStorage(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }
})();
