(() => {
  const DATA_URL = './data/occupations.json';
  const STORAGE_KEYS = {
    recent: 'occupation-explorer:recent',
    favorites: 'occupation-explorer:favorites',
    theme: 'occupation-explorer:theme',
    compare: 'occupation-explorer:compare'
  };

  const SCORE_FIELDS = [
    { key: 'old_frey_osborne_style_score', label: 'Old Frey/Osborne score' },
    { key: 'theoretical_ai_coverage', label: 'Theoretical AI coverage' },
    { key: 'observed_ai_coverage', label: 'Observed AI coverage' },
    { key: 'probability_of_computerisation', label: 'Probability of computerisation' },
    { key: 'speed_of_replacement_score', label: 'Replacement speed' }
  ];

  const state = {
    occupations: [],
    filtered: [],
    searchValue: '',
    suggestions: [],
    activeSuggestion: -1,
    filters: {
      risk_band: 'All',
      speed_category: 'All',
      confidence: 'All'
    },
    sortBy: 'probability_of_computerisation',
    sortDir: 'desc',
    currentSlug: null,
    recent: readStorage(STORAGE_KEYS.recent, []),
    favorites: readStorage(STORAGE_KEYS.favorites, []),
    compare: readStorage(STORAGE_KEYS.compare, [])
  };

  const app = document.getElementById('app');
  const themeToggle = document.getElementById('themeToggle');
  const sharePageButton = document.getElementById('sharePageButton');

  boot();

  async function boot() {
    applyTheme(readStorage(STORAGE_KEYS.theme, detectPreferredTheme()));
    renderSkeleton();
    wireGlobalEvents();

    try {
      const raw = await fetch(DATA_URL).then((r) => {
        if (!r.ok) throw new Error(`Failed to load dataset (${r.status})`);
        return r.json();
      });

      state.occupations = raw.map((item, index) => normalizeOccupation(item, index));
      state.filtered = [...state.occupations];
      route();
    } catch (error) {
      renderError(error);
    }
  }

  function wireGlobalEvents() {
    window.addEventListener('hashchange', route);
    themeToggle.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      applyTheme(next);
      writeStorage(STORAGE_KEYS.theme, next);
    });

    sharePageButton.addEventListener('click', async () => {
      const url = location.href;
      try {
        if (navigator.share) {
          await navigator.share({ title: document.title, url });
        } else {
          await navigator.clipboard.writeText(url);
          pulseButton(sharePageButton, 'Copied');
        }
      } catch (_) {}
    });
  }

  function route() {
    const hash = location.hash || '#/';
    const [_, routeName, routeParam] = hash.split('/');

    if (routeName === 'occupation' && routeParam) {
      state.currentSlug = decodeURIComponent(routeParam);
      renderDetailView();
      return;
    }

    if (routeName === 'compare') {
      renderCompareView();
      return;
    }

    state.currentSlug = null;
    renderHomeView();
  }

  function renderSkeleton() {
    const template = document.getElementById('skeletonTemplate');
    app.innerHTML = '';
    app.appendChild(template.content.cloneNode(true));
  }

  function renderError(error) {
    app.innerHTML = `
      <section class="panel empty-state fade-in">
        <h2>Dataset failed to load</h2>
        <p class="empty-copy">${escapeHtml(error.message || 'Unknown error')}</p>
        <p class="footer-note">Expected file: <code>${DATA_URL}</code></p>
      </section>
    `;
  }

  function renderHomeView() {
    applyFiltersAndSort();

    const featured = [...state.occupations]
      .sort((a, b) => (safeNum(b.probability_of_computerisation) || 0) - (safeNum(a.probability_of_computerisation) || 0))
      .slice(0, 6);

    const recent = state.recent.map(findBySlug).filter(Boolean);
    const favorites = state.favorites.map(findBySlug).filter(Boolean);
    const searchResults = state.searchValue.trim()
      ? getSuggestions(state.searchValue, 30).map((entry) => entry.item)
      : state.filtered.slice(0, 30);

    app.innerHTML = `
      <section class="panel hero fade-in">
        <div class="hero-inner">
          <div class="eyebrow">Static browser app · local JSON · no backend</div>
          <h1>Search occupations</h1>
          <p>Explore automation risk, AI coverage, replacement speed, bottlenecks, and reasoning for each occupation from a local dataset.</p>
          <div class="search-shell">
            <div class="search-box">
              <button class="icon-button" type="button" aria-hidden="true">⌕</button>
              <input id="searchInput" type="search" placeholder="Accountant, Nurse, Software Engineer…" autocomplete="off" spellcheck="false" />
              <button id="clearSearchButton" class="ghost-button ${state.searchValue ? '' : 'hidden'}" type="button">Clear</button>
            </div>
            <div id="searchDropdown" class="search-dropdown hidden"></div>
          </div>
          <div class="hero-actions">
            <button class="primary-button" type="button" data-nav="#/compare">Compare occupations</button>
            <span class="helper-copy">${state.occupations.length.toLocaleString()} occupations loaded</span>
          </div>
        </div>
      </section>

      <section class="dashboard-grid fade-in">
        <aside class="sidebar stack">
          <section class="panel sidebar-card stack">
            <div class="section-head">
              <h2>Filters</h2>
              <button id="resetFiltersButton" class="ghost-button" type="button">Reset</button>
            </div>
            <div class="filters-grid">
              ${renderFilterSelect('risk_band', ['All', ...uniqueValues('risk_band')], state.filters.risk_band, 'Risk band')}
              ${renderFilterSelect('speed_category', ['All', ...uniqueValues('speed_category')], state.filters.speed_category, 'Speed category')}
              ${renderFilterSelect('confidence', ['All', ...uniqueValues('confidence')], state.filters.confidence, 'Confidence')}
            </div>
            <div class="filter-row">
              ${renderFilterChip('sortBy', 'probability_of_computerisation', 'Sort: automation', state.sortBy === 'probability_of_computerisation')}
              ${renderFilterChip('sortBy', 'speed_of_replacement_score', 'Sort: speed', state.sortBy === 'speed_of_replacement_score')}
              ${renderFilterChip('sortBy', 'job_title', 'Sort: title', state.sortBy === 'job_title')}
              ${renderFilterChip('sortDir', state.sortDir === 'desc' ? 'asc' : 'desc', state.sortDir === 'desc' ? 'Descending' : 'Ascending', false)}
            </div>
          </section>

          <section class="panel sidebar-card stack">
            <h3>Browse by risk band</h3>
            <div class="quick-filters">
              ${uniqueValues('risk_band').map((value) => `<button class="tag" type="button" data-filter-key="risk_band" data-filter-value="${escapeAttr(value)}">${escapeHtml(value)}</button>`).join('')}
            </div>
            <h3>Browse by speed category</h3>
            <div class="quick-filters">
              ${uniqueValues('speed_category').map((value) => `<button class="tag" type="button" data-filter-key="speed_category" data-filter-value="${escapeAttr(value)}">${escapeHtml(value)}</button>`).join('')}
            </div>
          </section>

          ${recent.length ? `
            <section class="panel sidebar-card stack">
              <div class="section-head"><h3>Recent searches</h3><button id="clearRecentButton" class="ghost-button" type="button">Clear</button></div>
              <div class="stack">${recent.map(renderMiniOccupationLink).join('')}</div>
            </section>
          ` : ''}

          ${favorites.length ? `
            <section class="panel sidebar-card stack">
              <h3>Favorites</h3>
              <div class="stack">${favorites.map(renderMiniOccupationLink).join('')}</div>
            </section>
          ` : ''}
        </aside>

        <div class="content-stack">
          <section class="panel content-card stack">
            <div class="section-head">
              <h2>Featured occupations</h2>
              <span class="muted">Highest automation probability in the dataset</span>
            </div>
            <div class="featured-grid">
              ${featured.map(renderFeaturedCard).join('')}
            </div>
          </section>

          <section class="panel content-card stack">
            <div class="section-head">
              <h2>All occupations</h2>
              <span class="muted">${searchResults.length.toLocaleString()} shown</span>
            </div>
            ${searchResults.length ? `
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
                    ${searchResults.map(renderTableRow).join('')}
                  </tbody>
                </table>
              </div>
            ` : `
              <div class="empty-state">
                <h3>No results</h3>
                <p class="empty-copy">Try a different title, remove filters, or browse by risk band.</p>
              </div>
            `}
          </section>
        </div>
      </section>
    `;

    wireHomeView(searchResults);
  }

  function wireHomeView(searchResults) {
    const input = document.getElementById('searchInput');
    const dropdown = document.getElementById('searchDropdown');
    const clearButton = document.getElementById('clearSearchButton');

    if (input) {
      input.value = state.searchValue;
      input.focus({ preventScroll: true });
      input.addEventListener('input', (event) => {
        state.searchValue = event.target.value;
        state.activeSuggestion = -1;
        state.suggestions = getSuggestions(state.searchValue, 8);
        renderSearchDropdown(dropdown);
        renderHomeView();
      });

      input.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          state.activeSuggestion = Math.min(state.activeSuggestion + 1, state.suggestions.length - 1);
          renderSearchDropdown(dropdown);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          state.activeSuggestion = Math.max(state.activeSuggestion - 1, 0);
          renderSearchDropdown(dropdown);
        } else if (event.key === 'Enter') {
          event.preventDefault();
          if (state.suggestions[state.activeSuggestion]) {
            openOccupation(state.suggestions[state.activeSuggestion].item.slug);
          } else if (searchResults[0]) {
            openOccupation(searchResults[0].slug);
          }
        } else if (event.key === 'Escape') {
          dropdown.classList.add('hidden');
        }
      });

      input.addEventListener('focus', () => {
        state.suggestions = getSuggestions(state.searchValue, 8);
        renderSearchDropdown(dropdown);
      });
    }

    if (clearButton) {
      clearButton.addEventListener('click', () => {
        state.searchValue = '';
        renderHomeView();
      });
    }

    renderSearchDropdown(dropdown);

    document.querySelectorAll('[data-open]').forEach((button) => {
      button.addEventListener('click', () => openOccupation(button.dataset.open));
    });

    document.querySelectorAll('[data-nav]').forEach((button) => {
      button.addEventListener('click', () => { location.hash = button.dataset.nav; });
    });

    document.querySelectorAll('[data-filter-key]').forEach((button) => {
      button.addEventListener('click', () => {
        state.filters[button.dataset.filterKey] = button.dataset.filterValue;
        renderHomeView();
      });
    });

    document.querySelectorAll('[data-select-filter]').forEach((select) => {
      select.addEventListener('change', () => {
        state.filters[select.dataset.selectFilter] = select.value;
        renderHomeView();
      });
    });

    document.querySelectorAll('[data-sort-by]').forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.dataset.sortBy;
        const value = button.dataset.sortValue;
        state[mode] = value;
        renderHomeView();
      });
    });

    const resetFiltersButton = document.getElementById('resetFiltersButton');
    if (resetFiltersButton) {
      resetFiltersButton.addEventListener('click', () => {
        state.filters = { risk_band: 'All', speed_category: 'All', confidence: 'All' };
        state.sortBy = 'probability_of_computerisation';
        state.sortDir = 'desc';
        renderHomeView();
      });
    }

    const clearRecentButton = document.getElementById('clearRecentButton');
    if (clearRecentButton) {
      clearRecentButton.addEventListener('click', () => {
        state.recent = [];
        writeStorage(STORAGE_KEYS.recent, []);
        renderHomeView();
      });
    }
  }

  function renderSearchDropdown(dropdown) {
    if (!dropdown) return;
    const show = document.activeElement && document.activeElement.id === 'searchInput' && state.suggestions.length > 0;
    dropdown.innerHTML = show
      ? state.suggestions.map((entry, index) => `
          <button class="dropdown-item ${index === state.activeSuggestion ? 'active' : ''}" type="button" data-open="${escapeAttr(entry.item.slug)}">
            <strong>${escapeHtml(entry.item.job_title)}</strong>
            <small>${escapeHtml(entry.item['O*NET-SOC Code'] || 'No code')} · ${escapeHtml(entry.item.risk_band || 'Unknown')} risk · ${asPercent(entry.item.probability_of_computerisation)}</small>
          </button>
        `).join('')
      : '';
    dropdown.classList.toggle('hidden', !show);
    dropdown.querySelectorAll('[data-open]').forEach((button) => {
      button.addEventListener('click', () => openOccupation(button.dataset.open));
    });
  }

  function renderDetailView() {
    const occupation = findBySlug(state.currentSlug);
    if (!occupation) {
      app.innerHTML = `
        <section class="panel empty-state fade-in">
          <h2>Occupation not found</h2>
          <p class="empty-copy">The URL slug does not match any occupation in the local dataset.</p>
          <a class="primary-button" href="#/">Back to search</a>
        </section>
      `;
      return;
    }

    rememberOccupation(occupation.slug);
    const percentile = percentileRank('probability_of_computerisation', occupation.probability_of_computerisation);
    const compareActive = state.compare.includes(occupation.slug);
    const favoriteActive = state.favorites.includes(occupation.slug);

    app.innerHTML = `
      <section class="panel content-card fade-in stack">
        <div class="detail-header">
          <a class="muted" href="#/">← Back to search</a>
          <div class="profile-header">
            <h1 class="occupation-title">${escapeHtml(occupation.job_title)}</h1>
            <div class="tag-row">
              ${pill(occupation.risk_band, 'risk')}
              ${pill(occupation.speed_category, 'speed')}
              ${pill(occupation.confidence, 'conf')}
              <span class="tag">${escapeHtml(occupation['O*NET-SOC Code'] || 'No code')}</span>
            </div>
            <p class="muted">${escapeHtml(occupation.job_description || 'No description available.')}</p>
            <div class="inline-actions">
              <button id="favoriteButton" class="favorite-chip ${favoriteActive ? 'active' : ''}" type="button">${favoriteActive ? 'Favorited' : 'Favorite'}</button>
              <button id="compareButton" class="compare-chip ${compareActive ? 'active' : ''}" type="button">${compareActive ? 'In compare' : 'Add to compare'}</button>
              <button id="copyLinkButton" class="ghost-button" type="button">Copy link</button>
              <button id="printViewButton" class="ghost-button" type="button">Export / print</button>
            </div>
          </div>
        </div>

        <div class="profile-grid">
          <article class="profile-card main stack">
            <div class="section-head"><h2>Score overview</h2><span class="muted">All scores normalized from 0.00 to 1.00</span></div>
            <div class="metrics-grid">
              ${SCORE_FIELDS.map((field, index) => renderMetricCard(occupation, field, index)).join('')}
            </div>
            <div class="benchmark-card stack">
              <h3>Score benchmark</h3>
              <div class="benchmark-grid">
                ${SCORE_FIELDS.map((field) => renderScoreBar(occupation, field)).join('')}
              </div>
            </div>
          </article>

          <aside class="profile-card side stack">
            <div class="section-head"><h2>Distribution context</h2><span class="muted">Relative position in dataset</span></div>
            <div class="radial-wrap">
              <div class="radial" style="--value:${percentile / 100}">
                <div class="stack" style="justify-items:center; gap:2px;">
                  <strong>${percentile}</strong>
                  <span>percentile</span>
                </div>
              </div>
            </div>
            <div class="score-row">
              <div class="score-head"><span class="score-label">Automation risk percentile</span><span>${percentile}%</span></div>
              <div class="progress-track"><div class="progress-fill" style="width:${percentile}%"></div></div>
            </div>
            <div class="stat-row"><span class="muted">Core bottleneck</span><strong>${escapeHtml(occupation.key_bottleneck || 'Unknown')}</strong></div>
            <div class="stat-row"><span class="muted">Assumptions</span><strong>${escapeHtml(occupation.assumptions || 'None provided')}</strong></div>
          </aside>
        </div>

        <div class="reasoning-grid">
          <section class="panel content-card stack">
            <h2>Why this score?</h2>
            <div class="score-row">
              <span class="muted-label">Short reasoning</span>
              <div>${formatParagraphs(occupation.reasoning_short || 'No short reasoning available.')}</div>
            </div>
            <div class="score-row">
              <span class="muted-label">Detailed reasoning</span>
              <div>${formatBulletish(occupation.reasoning_detailed || 'No detailed reasoning available.')}</div>
            </div>
          </section>
        </div>
      </section>
    `;

    document.getElementById('favoriteButton')?.addEventListener('click', () => {
      toggleStoredSlug('favorites', occupation.slug);
      renderDetailView();
    });

    document.getElementById('compareButton')?.addEventListener('click', () => {
      toggleCompare(occupation.slug);
      renderDetailView();
    });

    document.getElementById('copyLinkButton')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(location.href);
        pulseButton(document.getElementById('copyLinkButton'), 'Copied');
      } catch (_) {}
    });

    document.getElementById('printViewButton')?.addEventListener('click', () => window.print());
  }

  function renderCompareView() {
    const items = state.compare.map(findBySlug).filter(Boolean).slice(0, 2);
    app.innerHTML = `
      <section class="panel content-card fade-in stack">
        <div class="compare-header">
          <a class="muted" href="#/">← Back to search</a>
          <h2>Compare occupations</h2>
          <p class="muted">Pick up to two occupations. Comparison is stored locally in your browser.</p>
          <div class="compare-meta">
            <button id="clearCompareButton" class="ghost-button" type="button">Clear compare</button>
          </div>
        </div>
        ${items.length ? `
          <div class="compare-grid">
            ${items.map(renderCompareCard).join('')}
          </div>
        ` : `
          <div class="empty-state">
            <h3>No occupations selected</h3>
            <p class="empty-copy">Open any occupation and click “Add to compare”.</p>
          </div>
        `}
      </section>
    `;

    document.getElementById('clearCompareButton')?.addEventListener('click', () => {
      state.compare = [];
      writeStorage(STORAGE_KEYS.compare, state.compare);
      renderCompareView();
    });

    document.querySelectorAll('[data-open]').forEach((button) => {
      button.addEventListener('click', () => openOccupation(button.dataset.open));
    });
  }

  function renderCompareCard(occupation) {
    return `
      <article class="compare-card stack">
        <div class="compare-header">
          <h3>${escapeHtml(occupation.job_title)}</h3>
          <div class="tag-row">
            ${pill(occupation.risk_band, 'risk')}
            ${pill(occupation.speed_category, 'speed')}
          </div>
          <p class="muted">${escapeHtml(occupation.job_description || 'No description available.')}</p>
        </div>
        <div class="score-bars">
          ${SCORE_FIELDS.map((field) => renderScoreBar(occupation, field)).join('')}
        </div>
        <div class="inline-actions">
          <button class="ghost-button" type="button" data-open="${escapeAttr(occupation.slug)}">Open profile</button>
        </div>
      </article>
    `;
  }

  function renderMetricCard(occupation, field, index) {
    const value = safeNum(occupation[field.key]);
    return `
      <div class="metric-card stack">
        <div class="score-head">
          <span class="metric-title">${escapeHtml(field.label)}</span>
          <span class="muted">${value == null ? '—' : value.toFixed(2)}</span>
        </div>
        <div class="radial-wrap">
          <div class="radial" style="--value:${Math.max(0, Math.min(1, value ?? 0))}">
            <div class="stack" style="justify-items:center; gap:2px;">
              <strong>${value == null ? '—' : Math.round(value * 100)}</strong>
              <span>${value == null ? '' : '%'}</span>
            </div>
          </div>
        </div>
        <div class="score-row">
          <div class="score-head">
            <span class="score-label">${escapeHtml(field.label)}</span>
            <span>${asPercent(value)}</span>
          </div>
          <div class="progress-track"><div class="progress-fill" style="width:${(value ?? 0) * 100}%"></div></div>
        </div>
      </div>
    `;
  }

  function renderScoreBar(occupation, field) {
    const value = safeNum(occupation[field.key]);
    return `
      <div class="score-row">
        <div class="score-head">
          <span class="score-label">${escapeHtml(field.label)}</span>
          <strong>${value == null ? '—' : `${value.toFixed(2)} · ${Math.round(value * 100)}%`}</strong>
        </div>
        <div class="progress-track"><div class="progress-fill" style="width:${(value ?? 0) * 100}%"></div></div>
      </div>
    `;
  }

  function renderFeaturedCard(occupation) {
    return `
      <article class="featured-card stack">
        <div class="list-card-header">
          <h3>${escapeHtml(occupation.job_title)}</h3>
          <div class="tag-row">
            ${pill(occupation.risk_band, 'risk')}
            ${pill(occupation.speed_category, 'speed')}
          </div>
        </div>
        <div class="score-row">
          <div class="score-head"><span class="score-label">Automation risk</span><span>${asPercent(occupation.probability_of_computerisation)}</span></div>
          <div class="progress-track"><div class="progress-fill" style="width:${safePct(occupation.probability_of_computerisation)}%"></div></div>
        </div>
        <p class="muted">${escapeHtml(shorten(occupation.reasoning_short || occupation.job_description || '', 120))}</p>
        <div class="inline-actions">
          <button class="primary-button" type="button" data-open="${escapeAttr(occupation.slug)}">Open</button>
        </div>
      </article>
    `;
  }

  function renderTableRow(occupation) {
    return `
      <tr data-open="${escapeAttr(occupation.slug)}">
        <td><strong>${escapeHtml(occupation.job_title)}</strong><br /><span class="muted">${escapeHtml(occupation['O*NET-SOC Code'] || 'No code')}</span></td>
        <td>${pill(occupation.risk_band, 'risk')}</td>
        <td>${pill(occupation.speed_category, 'speed')}</td>
        <td>${asPercent(occupation.probability_of_computerisation)}</td>
        <td>${asPercent(occupation.observed_ai_coverage)}</td>
        <td>${escapeHtml(occupation.confidence || 'Unknown')}</td>
      </tr>
    `;
  }

  function renderMiniOccupationLink(occupation) {
    return `
      <button class="dropdown-item" type="button" data-open="${escapeAttr(occupation.slug)}">
        <strong>${escapeHtml(occupation.job_title)}</strong>
        <small>${escapeHtml(occupation.risk_band || 'Unknown')} risk · ${asPercent(occupation.probability_of_computerisation)}</small>
      </button>
    `;
  }

  function renderFilterSelect(key, values, selected, label) {
    return `
      <label class="stack">
        <span class="muted-label">${escapeHtml(label)}</span>
        <select data-select-filter="${escapeAttr(key)}">
          ${values.map((value) => `<option value="${escapeAttr(value)}" ${selected === value ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('')}
        </select>
      </label>
    `;
  }

  function renderFilterChip(mode, value, label, active) {
    return `<button class="filter-chip ${active ? 'active' : ''}" type="button" data-sort-by="${escapeAttr(mode)}" data-sort-value="${escapeAttr(value)}">${escapeHtml(label)}</button>`;
  }

  function applyFiltersAndSort() {
    state.filtered = state.occupations.filter((item) => {
      if (state.filters.risk_band !== 'All' && item.risk_band !== state.filters.risk_band) return false;
      if (state.filters.speed_category !== 'All' && item.speed_category !== state.filters.speed_category) return false;
      if (state.filters.confidence !== 'All' && item.confidence !== state.filters.confidence) return false;
      if (!state.searchValue.trim()) return true;
      return searchScore(item, state.searchValue) > 0;
    });

    const dir = state.sortDir === 'asc' ? 1 : -1;
    state.filtered.sort((a, b) => {
      const left = a[state.sortBy];
      const right = b[state.sortBy];
      if (typeof left === 'string' || typeof right === 'string') {
        return String(left || '').localeCompare(String(right || '')) * dir;
      }
      return ((safeNum(left) || 0) - (safeNum(right) || 0)) * dir;
    });
  }

  function getSuggestions(query, limit) {
    const trimmed = query.trim();
    const results = trimmed
      ? state.occupations
          .map((item) => ({ item, score: searchScore(item, trimmed) }))
          .filter((entry) => entry.score > 0)
          .sort((a, b) => b.score - a.score)
      : state.occupations.map((item, index) => ({ item, score: state.occupations.length - index }));
    return results.slice(0, limit);
  }

  function searchScore(item, query) {
    const q = normalizeText(query);
    if (!q) return 0;
    const title = item.__titleNormalized;
    const desc = item.__descriptionNormalized;
    const blob = item.__searchBlob;

    if (title === q) return 2000;
    if (title.startsWith(q)) return 1200 - title.length;
    if (title.includes(q)) return 900 - title.indexOf(q);

    const titleWords = title.split(' ');
    const queryWords = q.split(' ');
    let score = 0;

    for (const word of queryWords) {
      if (titleWords.some((titleWord) => titleWord.startsWith(word))) score += 160;
      else if (blob.includes(word)) score += 70;
      else {
        const fuzzy = bestWordDistance(word, titleWords);
        if (fuzzy <= 1) score += 60;
        else if (fuzzy === 2) score += 22;
      }
    }

    if (desc.includes(q)) score += 65;
    if (blob.includes(q)) score += 40;
    return score;
  }

  function bestWordDistance(word, words) {
    let best = Infinity;
    for (const candidate of words) {
      if (Math.abs(candidate.length - word.length) > 2) continue;
      best = Math.min(best, levenshtein(word, candidate));
      if (best === 0) break;
    }
    return best;
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let prev = i - 1;
      dp[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const temp = dp[j];
        dp[j] = Math.min(
          dp[j] + 1,
          dp[j - 1] + 1,
          prev + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
        prev = temp;
      }
    }
    return dp[b.length];
  }

  function normalizeOccupation(item, index) {
    const title = item.job_title || `Untitled occupation ${index + 1}`;
    const code = item['O*NET-SOC Code'] || `occupation-${index + 1}`;
    const slug = `${slugify(title)}-${slugify(code)}`;
    const description = item.job_description || '';
    return {
      ...item,
      slug,
      __titleNormalized: normalizeText(title),
      __descriptionNormalized: normalizeText(description),
      __searchBlob: normalizeText([
        item.job_title,
        item.job_description,
        item.reasoning_short,
        item.reasoning_detailed,
        item.key_bottleneck,
        item['O*NET-SOC Code']
      ].filter(Boolean).join(' '))
    };
  }

  function openOccupation(slug) {
    if (!slug) return;
    location.hash = `#/occupation/${encodeURIComponent(slug)}`;
  }

  function findBySlug(slug) {
    return state.occupations.find((item) => item.slug === slug) || null;
  }

  function uniqueValues(key) {
    return [...new Set(state.occupations.map((item) => item[key]).filter(Boolean))].sort();
  }

  function rememberOccupation(slug) {
    state.recent = [slug, ...state.recent.filter((item) => item !== slug)].slice(0, 8);
    writeStorage(STORAGE_KEYS.recent, state.recent);
  }

  function toggleStoredSlug(type, slug) {
    const key = type === 'favorites' ? STORAGE_KEYS.favorites : STORAGE_KEYS.recent;
    const list = type === 'favorites' ? state.favorites : state.recent;
    const next = list.includes(slug) ? list.filter((item) => item !== slug) : [slug, ...list].slice(0, 24);
    if (type === 'favorites') state.favorites = next;
    else state.recent = next;
    writeStorage(key, next);
  }

  function toggleCompare(slug) {
    if (state.compare.includes(slug)) {
      state.compare = state.compare.filter((item) => item !== slug);
    } else {
      state.compare = [...state.compare, slug].slice(-2);
    }
    writeStorage(STORAGE_KEYS.compare, state.compare);
  }

  function percentileRank(field, value) {
    const values = state.occupations.map((item) => safeNum(item[field])).filter((n) => n != null).sort((a, b) => a - b);
    if (!values.length || value == null) return 0;
    let count = 0;
    for (const item of values) if (item <= value) count += 1;
    return Math.round((count / values.length) * 100);
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    themeToggle.textContent = theme === 'light' ? 'Dark' : 'Light';
  }

  function detectPreferredTheme() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  function pill(value, kind) {
    const safe = String(value || 'Unknown');
    const cls = `${kind}-${normalizeText(safe).replace(/\s+/g, '-')}`;
    return `<span class="${kind}-pill ${cls}">${escapeHtml(safe)}</span>`;
  }

  function formatParagraphs(text) {
    return `<p>${escapeHtml(text)}</p>`;
  }

  function formatBulletish(text) {
    const parts = String(text)
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);
    if (!parts.length) return '<p>No detailed reasoning available.</p>';
    return `<div class="stack">${parts.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div>`;
  }

  function safeNum(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function safePct(value) {
    return Math.round((safeNum(value) || 0) * 100);
  }

  function asPercent(value) {
    const n = safeNum(value);
    return n == null ? '—' : `${Math.round(n * 100)}%`;
  }

  function normalizeText(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function slugify(value) {
    return normalizeText(value).replace(/\s+/g, '-');
  }

  function shorten(text, max) {
    const value = String(text || '');
    return value.length > max ? `${value.slice(0, max - 1)}…` : value;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#096;');
  }

  function readStorage(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }

  function pulseButton(button, text) {
    if (!button) return;
    const original = button.textContent;
    button.textContent = text;
    setTimeout(() => { button.textContent = original; }, 1200);
  }
})();
