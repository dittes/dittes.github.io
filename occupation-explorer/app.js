const state = {
  occupations: [],
  filtered: [],
  selected: null,
  compare: [],
  favorites: loadLocal('occupation-favorites', []),
  recent: loadLocal('occupation-recent', []),
  filters: {
    risk: 'All',
    speed: 'All',
    confidence: 'All',
  },
  query: '',
  suggestionIndex: -1,
};

const SCORE_FIELDS = [
  { key: 'old_frey_osborne_style_score', label: 'Old Frey/Osborne score' },
  { key: 'theoretical_ai_coverage', label: 'Theoretical AI coverage' },
  { key: 'observed_ai_coverage', label: 'Observed AI coverage' },
  { key: 'probability_of_computerisation', label: 'Automation risk' },
  { key: 'speed_of_replacement_score', label: 'Replacement speed' },
];

const els = {};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  cacheElements();
  bindEvents();
  renderShellLoading();

  try {
    state.occupations = await loadOccupations();
    state.filtered = [...state.occupations];

    populateFilterOptions();
    renderFeatured();
    applyFiltersAndRender();
    restoreRoute();
  } catch (error) {
    console.error(error);
    renderFatalError(error);
  }
}

function cacheElements() {
  els.app = document.getElementById('app');
  els.search = document.getElementById('searchInput');
  els.clearSearch = document.getElementById('clearSearch');
  els.suggestions = document.getElementById('suggestions');
  els.resultsMeta = document.getElementById('resultsMeta');
  els.resultsList = document.getElementById('resultsList');
  els.detail = document.getElementById('detailView');
  els.featured = document.getElementById('featuredOccupations');
  els.riskFilters = document.getElementById('riskFilters');
  els.speedFilters = document.getElementById('speedFilters');
  els.confidenceFilter = document.getElementById('confidenceFilter');
  els.recent = document.getElementById('recentSearches');
  els.compare = document.getElementById('comparePanel');
  els.empty = document.getElementById('emptyState');
}

function bindEvents() {
  if (els.search) {
    els.search.addEventListener('input', onSearchInput);
    els.search.addEventListener('keydown', onSearchKeyDown);
  }

  if (els.clearSearch) {
    els.clearSearch.addEventListener('click', () => {
      state.query = '';
      state.suggestionIndex = -1;
      els.search.value = '';
      renderSuggestions([]);
      applyFiltersAndRender();
      updateHashFromSelection(state.selected);
    });
  }

  window.addEventListener('hashchange', restoreRoute);
}

async function loadOccupations() {
  const response = await fetch('./data/occupations.json');
  if (!response.ok) {
    throw new Error(`Failed to load dataset: ${response.status}`);
  }

  const raw = await response.json();
  const rows = extractRows(raw);

  return rows.map((record, index) => normalizeOccupation(record, index));
}

function extractRows(raw) {
  if (Array.isArray(raw)) {
    return raw;
  }

  if (
    raw &&
    typeof raw === 'object' &&
    raw.sheets &&
    raw.sheets['Scored Occupations'] &&
    Array.isArray(raw.sheets['Scored Occupations'].rows)
  ) {
    return raw.sheets['Scored Occupations'].rows;
  }

  if (raw && typeof raw === 'object' && raw.sheets) {
    const firstSheet = Object.values(raw.sheets).find(
      (sheet) => sheet && Array.isArray(sheet.rows)
    );
    if (firstSheet) return firstSheet.rows;
  }

  if (raw && typeof raw === 'object' && Array.isArray(raw.rows)) {
    return raw.rows;
  }

  throw new Error('Dataset format not supported. Expected array or workbook.sheets[*].rows');
}

function normalizeOccupation(record, index) {
  const code = cleanString(record['O*NET-SOC Code']) || `occupation-${index}`;
  const title = cleanString(record.job_title) || `Untitled occupation ${index + 1}`;
  const slug = `${slugify(title)}-${slugify(code)}`;

  const normalized = {
    ...record,
    id: code,
    slug,
    'O*NET-SOC Code': code,
    job_title: title,
    job_description: cleanString(record.job_description),
    old_frey_osborne_style_score: normalizeScore(record.old_frey_osborne_style_score),
    theoretical_ai_coverage: normalizeScore(record.theoretical_ai_coverage),
    observed_ai_coverage: normalizeScore(record.observed_ai_coverage),
    probability_of_computerisation: normalizeScore(record.probability_of_computerisation),
    speed_of_replacement_score: normalizeScore(record.speed_of_replacement_score),
    risk_band: cleanString(record.risk_band),
    speed_category: cleanString(record.speed_category),
    key_bottleneck: cleanString(record.key_bottleneck),
    reasoning_short: cleanString(record.reasoning_short),
    reasoning_detailed: cleanString(record.reasoning_detailed),
    confidence: cleanString(record.confidence),
    assumptions: cleanString(record.assumptions),
  };

  normalized.searchableText = [
    normalized.job_title,
    normalized.job_description,
    normalized.key_bottleneck,
    normalized.reasoning_short,
    normalized.reasoning_detailed,
    normalized.assumptions,
    normalized['O*NET-SOC Code'],
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return normalized;
}

function onSearchInput(event) {
  state.query = event.target.value || '';
  state.suggestionIndex = -1;
  const suggestions = getSuggestions(state.query, 8);
  renderSuggestions(suggestions);
  applyFiltersAndRender();
}

function onSearchKeyDown(event) {
  const suggestions = getSuggestions(state.query, 8);

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    state.suggestionIndex = Math.min(state.suggestionIndex + 1, suggestions.length - 1);
    renderSuggestions(suggestions);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    state.suggestionIndex = Math.max(state.suggestionIndex - 1, 0);
    renderSuggestions(suggestions);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    const selectedSuggestion =
      suggestions[state.suggestionIndex] || suggestions[0] || state.filtered[0] || null;

    if (selectedSuggestion) {
      openOccupation(selectedSuggestion);
      renderSuggestions([]);
    }
  } else if (event.key === 'Escape') {
    renderSuggestions([]);
  }
}

function getSuggestions(query, limit = 8) {
  if (!query.trim()) {
    return state.occupations.slice(0, limit);
  }

  return rankOccupations(query, state.occupations).slice(0, limit);
}

function rankOccupations(query, occupations) {
  const q = query.trim().toLowerCase();
  if (!q) return occupations;

  return occupations
    .map((occupation) => ({
      occupation,
      score: searchScore(q, occupation),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.occupation);
}

function searchScore(query, occupation) {
  const title = (occupation.job_title || '').toLowerCase();
  const desc = (occupation.job_description || '').toLowerCase();
  const full = occupation.searchableText || '';

  if (title === query) return 2000;
  if (title.startsWith(query)) return 1400 - title.length * 0.1;
  if (title.includes(query)) return 1000 - title.indexOf(query);

  const titleWords = title.split(/\s+/);
  const queryWords = query.split(/\s+/);
  let wordScore = 0;

  for (const qw of queryWords) {
    for (const tw of titleWords) {
      if (tw === qw) wordScore += 180;
      else if (tw.startsWith(qw)) wordScore += 120;
      else if (levenshtein(qw, tw) <= 1) wordScore += 70;
      else if (levenshtein(qw, tw) === 2 && qw.length > 4) wordScore += 35;
    }
  }

  let textScore = 0;
  if (desc.includes(query)) textScore += 120;
  if (full.includes(query)) textScore += 80;

  return wordScore + textScore;
}

function applyFiltersAndRender() {
  let results = state.query.trim()
    ? rankOccupations(state.query, state.occupations)
    : [...state.occupations];

  results = results.filter((occupation) => {
    const matchesRisk =
      state.filters.risk === 'All' || (occupation.risk_band || 'Unknown') === state.filters.risk;
    const matchesSpeed =
      state.filters.speed === 'All' ||
      (occupation.speed_category || 'Unknown') === state.filters.speed;
    const matchesConfidence =
      state.filters.confidence === 'All' ||
      (occupation.confidence || 'Unknown') === state.filters.confidence;

    return matchesRisk && matchesSpeed && matchesConfidence;
  });

  state.filtered = results;
  renderResults(results);
  renderRecent();
  renderCompare();
  renderEmptyState(results);

  if (!state.selected && results.length > 0) {
    selectOccupation(results[0], false);
  }
}

function renderSuggestions(items) {
  if (!els.suggestions) return;
  if (!items.length || !state.query.trim()) {
    els.suggestions.innerHTML = '';
    els.suggestions.hidden = true;
    return;
  }

  els.suggestions.hidden = false;
  els.suggestions.innerHTML = items
    .map((item, index) => {
      const active = index === state.suggestionIndex ? 'is-active' : '';
      return `
        <button class="suggestion-item ${active}" data-slug="${escapeHtml(item.slug)}" type="button">
          <span class="suggestion-title">${escapeHtml(item.job_title || 'Untitled')}</span>
          <span class="suggestion-meta">${escapeHtml(item.risk_band || 'Unknown')} · ${formatPercent(item.probability_of_computerisation)}</span>
        </button>
      `;
    })
    .join('');

  els.suggestions.querySelectorAll('.suggestion-item').forEach((button) => {
    button.addEventListener('click', () => {
      const occupation = state.occupations.find((o) => o.slug === button.dataset.slug);
      if (occupation) {
        openOccupation(occupation);
        renderSuggestions([]);
      }
    });
  });
}

function renderResults(results) {
  if (!els.resultsList) return;

  if (!results.length) {
    els.resultsList.innerHTML = '';
    if (els.resultsMeta) els.resultsMeta.textContent = 'No occupations found';
    return;
  }

  if (els.resultsMeta) {
    els.resultsMeta.textContent = `${results.length} occupation${results.length === 1 ? '' : 's'}`;
  }

  els.resultsList.innerHTML = results
    .slice(0, 100)
    .map((occupation) => {
      const active = state.selected?.slug === occupation.slug ? 'is-selected' : '';
      const favorite = state.favorites.includes(occupation.slug) ? 'is-favorite' : '';
      return `
        <article class="result-card ${active}" data-slug="${escapeHtml(occupation.slug)}">
          <div class="result-card__top">
            <div>
              <h3>${escapeHtml(occupation.job_title || 'Untitled')}</h3>
              <p>${escapeHtml(occupation['O*NET-SOC Code'] || 'No code')}</p>
            </div>
            <button class="icon-button favorite-toggle ${favorite}" data-favorite="${escapeHtml(occupation.slug)}" type="button" aria-label="Toggle favorite">★</button>
          </div>
          <div class="pill-row">
            ${pill(occupation.risk_band || 'Unknown')}
            ${pill(occupation.speed_category || 'Unknown')}
            ${pill(occupation.confidence || 'Unknown')}
          </div>
          <div class="score-row">
            <div>
              <span>Automation risk</span>
              <strong>${formatPercent(occupation.probability_of_computerisation)}</strong>
            </div>
            <div>
              <span>Replacement speed</span>
              <strong>${formatPercent(occupation.speed_of_replacement_score)}</strong>
            </div>
          </div>
        </article>
      `;
    })
    .join('');

  els.resultsList.querySelectorAll('.result-card').forEach((card) => {
    card.addEventListener('click', (event) => {
      const favoriteButton = event.target.closest('.favorite-toggle');
      if (favoriteButton) return;
      const occupation = state.occupations.find((o) => o.slug === card.dataset.slug);
      if (occupation) openOccupation(occupation);
    });
  });

  els.resultsList.querySelectorAll('.favorite-toggle').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleFavorite(button.dataset.favorite);
    });
  });
}

function openOccupation(occupation) {
  state.query = occupation.job_title || '';
  if (els.search) els.search.value = state.query;
  rememberRecent(occupation.slug);
  selectOccupation(occupation, true);
  renderSuggestions([]);
}

function selectOccupation(occupation, updateHash = true) {
  state.selected = occupation;
  renderResults(state.filtered);
  renderDetail(occupation);
  if (updateHash) {
    location.hash = `#/occupation/${encodeURIComponent(occupation.slug)}`;
  }
}

function renderDetail(occupation) {
  if (!els.detail || !occupation) return;

  const comparisonRank = getPercentile(
    occupation.probability_of_computerisation,
    state.occupations.map((item) => item.probability_of_computerisation)
  );

  const scoreCards = SCORE_FIELDS.map(
    (field) => `
      <div class="score-card">
        <div class="score-card__header">
          <span>${escapeHtml(field.label)}</span>
          <strong>${formatPercent(occupation[field.key])}</strong>
        </div>
        <div class="progress">
          <div class="progress__bar" style="width:${clamp01(occupation[field.key]) * 100}%"></div>
        </div>
        <div class="score-card__foot">${formatDecimal(occupation[field.key])}</div>
      </div>
    `
  ).join('');

  const benchmarkRows = SCORE_FIELDS.map(
    (field) => `
      <div class="benchmark-row">
        <div class="benchmark-row__label">${escapeHtml(field.label)}</div>
        <div class="benchmark-row__track">
          <div class="benchmark-row__fill" style="width:${clamp01(occupation[field.key]) * 100}%"></div>
        </div>
        <div class="benchmark-row__value">${formatPercent(occupation[field.key])}</div>
      </div>
    `
  ).join('');

  const radial = radialMeter(
    occupation.probability_of_computerisation,
    occupation.risk_band || 'Unknown'
  );

  const isFavorite = state.favorites.includes(occupation.slug);
  const compareIncluded = state.compare.includes(occupation.slug);

  els.detail.innerHTML = `
    <section class="detail-card">
      <div class="detail-hero">
        <div class="detail-hero__main">
          <div class="pill-row">
            ${pill(occupation.risk_band || 'Unknown')}
            ${pill(occupation.speed_category || 'Unknown')}
            ${pill(occupation.confidence || 'Unknown')}
          </div>
          <h1>${escapeHtml(occupation.job_title || 'Untitled')}</h1>
          <p class="detail-code">${escapeHtml(occupation['O*NET-SOC Code'] || 'No code')}</p>
          <p class="detail-description">${escapeHtml(occupation.job_description || 'No description available.')}</p>
          <div class="detail-actions">
            <button class="button" id="shareButton" type="button">Share</button>
            <button class="button" id="favoriteButton" type="button">${isFavorite ? 'Remove favorite' : 'Save favorite'}</button>
            <button class="button" id="compareButton" type="button">${compareIncluded ? 'Remove from compare' : 'Add to compare'}</button>
          </div>
        </div>
        <div class="detail-hero__side">
          ${radial}
          <div class="context-card">
            <span>Dataset position</span>
            <strong>Higher than ${comparisonRank}% of occupations</strong>
            <small>Based on automation risk score.</small>
          </div>
        </div>
      </div>

      <div class="detail-grid">
        <div class="detail-section">
          <h2>Scores</h2>
          <div class="score-grid">${scoreCards}</div>
        </div>

        <div class="detail-section">
          <h2>Score benchmark</h2>
          <div class="benchmark-chart">${benchmarkRows}</div>
        </div>

        <div class="detail-section">
          <h2>Why this score?</h2>
          <div class="info-list">
            ${infoRow('Core bottleneck', occupation.key_bottleneck)}
            ${infoRow('Short reasoning', occupation.reasoning_short)}
            ${infoRow('Detailed reasoning', formatMultiline(occupation.reasoning_detailed))}
            ${infoRow('Assumptions', formatMultiline(occupation.assumptions))}
          </div>
        </div>
      </div>
    </section>
  `;

  const shareButton = document.getElementById('shareButton');
  const favoriteButton = document.getElementById('favoriteButton');
  const compareButton = document.getElementById('compareButton');

  if (shareButton) {
    shareButton.addEventListener('click', async () => {
      const url = new URL(location.href);
      url.hash = `#/occupation/${occupation.slug}`;
      try {
        await navigator.clipboard.writeText(url.toString());
        shareButton.textContent = 'Copied';
        setTimeout(() => {
          shareButton.textContent = 'Share';
        }, 1200);
      } catch {
        shareButton.textContent = 'Copy failed';
        setTimeout(() => {
          shareButton.textContent = 'Share';
        }, 1200);
      }
    });
  }

  if (favoriteButton) {
    favoriteButton.addEventListener('click', () => toggleFavorite(occupation.slug));
  }

  if (compareButton) {
    compareButton.addEventListener('click', () => toggleCompare(occupation.slug));
  }
}

function renderFeatured() {
  if (!els.featured) return;

  const featured = [...state.occupations]
    .sort((a, b) => b.probability_of_computerisation - a.probability_of_computerisation)
    .slice(0, 6);

  els.featured.innerHTML = featured
    .map(
      (occupation) => `
      <button class="featured-card" type="button" data-slug="${escapeHtml(occupation.slug)}">
        <span class="featured-card__eyebrow">${escapeHtml(occupation.risk_band || 'Unknown')}</span>
        <strong>${escapeHtml(occupation.job_title || 'Untitled')}</strong>
        <small>${formatPercent(occupation.probability_of_computerisation)} automation risk</small>
      </button>
    `
    )
    .join('');

  els.featured.querySelectorAll('.featured-card').forEach((button) => {
    button.addEventListener('click', () => {
      const occupation = state.occupations.find((o) => o.slug === button.dataset.slug);
      if (occupation) openOccupation(occupation);
    });
  });
}

function populateFilterOptions() {
  populateButtonFilter(
    els.riskFilters,
    ['All', ...uniqueValues(state.occupations.map((item) => item.risk_band || 'Unknown'))],
    'risk'
  );

  populateButtonFilter(
    els.speedFilters,
    ['All', ...uniqueValues(state.occupations.map((item) => item.speed_category || 'Unknown'))],
    'speed'
  );

  if (els.confidenceFilter) {
    const options = ['All', ...uniqueValues(state.occupations.map((item) => item.confidence || 'Unknown'))];
    els.confidenceFilter.innerHTML = options
      .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
      .join('');

    els.confidenceFilter.value = state.filters.confidence;
    els.confidenceFilter.addEventListener('change', (event) => {
      state.filters.confidence = event.target.value;
      applyFiltersAndRender();
    });
  }
}

function populateButtonFilter(container, values, filterKey) {
  if (!container) return;

  container.innerHTML = values
    .map((value) => {
      const active = state.filters[filterKey] === value ? 'is-active' : '';
      return `<button class="filter-pill ${active}" type="button" data-filter-key="${filterKey}" data-value="${escapeHtml(value)}">${escapeHtml(value)}</button>`;
    })
    .join('');

  container.querySelectorAll('.filter-pill').forEach((button) => {
    button.addEventListener('click', () => {
      state.filters[filterKey] = button.dataset.value;
      populateFilterOptions();
      applyFiltersAndRender();
    });
  });
}

function renderRecent() {
  if (!els.recent) return;
  const recentOccupations = state.recent
    .map((slug) => state.occupations.find((item) => item.slug === slug))
    .filter(Boolean)
    .slice(0, 6);

  if (!recentOccupations.length) {
    els.recent.innerHTML = `<p class="muted">No recent searches yet.</p>`;
    return;
  }

  els.recent.innerHTML = recentOccupations
    .map(
      (occupation) => `
      <button class="recent-item" type="button" data-slug="${escapeHtml(occupation.slug)}">
        <span>${escapeHtml(occupation.job_title || 'Untitled')}</span>
        <small>${formatPercent(occupation.probability_of_computerisation)}</small>
      </button>
    `
    )
    .join('');

  els.recent.querySelectorAll('.recent-item').forEach((button) => {
    button.addEventListener('click', () => {
      const occupation = state.occupations.find((item) => item.slug === button.dataset.slug);
      if (occupation) openOccupation(occupation);
    });
  });
}

function toggleFavorite(slug) {
  if (!slug) return;
  const exists = state.favorites.includes(slug);

  state.favorites = exists
    ? state.favorites.filter((item) => item !== slug)
    : [...state.favorites, slug];

  saveLocal('occupation-favorites', state.favorites);
  renderResults(state.filtered);
  if (state.selected) renderDetail(state.selected);
}

function toggleCompare(slug) {
  if (!slug) return;
  const exists = state.compare.includes(slug);

  if (exists) {
    state.compare = state.compare.filter((item) => item !== slug);
  } else {
    state.compare = [...state.compare, slug].slice(0, 2);
  }

  renderCompare();
  if (state.selected) renderDetail(state.selected);
}

function renderCompare() {
  if (!els.compare) return;

  const items = state.compare
    .map((slug) => state.occupations.find((item) => item.slug === slug))
    .filter(Boolean);

  if (!items.length) {
    els.compare.innerHTML = `<p class="muted">Add up to two occupations to compare.</p>`;
    return;
  }

  els.compare.innerHTML = `
    <div class="compare-grid">
      ${items
        .map(
          (occupation) => `
          <div class="compare-card">
            <div class="compare-card__top">
              <strong>${escapeHtml(occupation.job_title || 'Untitled')}</strong>
              <button class="icon-button compare-remove" data-slug="${escapeHtml(occupation.slug)}" type="button">×</button>
            </div>
            ${SCORE_FIELDS.map(
              (field) => `
              <div class="compare-row">
                <span>${escapeHtml(field.label)}</span>
                <strong>${formatPercent(occupation[field.key])}</strong>
              </div>
            `
            ).join('')}
          </div>
        `
        )
        .join('')}
    </div>
  `;

  els.compare.querySelectorAll('.compare-remove').forEach((button) => {
    button.addEventListener('click', () => toggleCompare(button.dataset.slug));
  });
}

function renderEmptyState(results) {
  if (!els.empty) return;
  els.empty.hidden = results.length > 0;
}

function restoreRoute() {
  const hash = location.hash || '';
  const match = hash.match(/^#\/occupation\/(.+)$/);

  if (!match) {
    if (!state.selected && state.filtered.length) {
      selectOccupation(state.filtered[0], false);
    }
    return;
  }

  const slug = decodeURIComponent(match[1]);
  const occupation = state.occupations.find((item) => item.slug === slug);

  if (occupation) {
    state.selected = occupation;
    renderDetail(occupation);
    renderResults(state.filtered);
  }
}

function updateHashFromSelection(selected) {
  if (!selected) {
    history.replaceState(null, '', location.pathname + location.search);
    return;
  }
  location.hash = `#/occupation/${encodeURIComponent(selected.slug)}`;
}

function renderShellLoading() {
  if (els.detail) {
    els.detail.innerHTML = `
      <section class="detail-card skeleton">
        <div class="skeleton-line lg"></div>
        <div class="skeleton-line md"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line"></div>
      </section>
    `;
  }
}

function renderFatalError(error) {
  if (!els.detail) return;
  els.detail.innerHTML = `
    <section class="detail-card">
      <h2>Failed to load dataset</h2>
      <p>${escapeHtml(error?.message || 'Unknown error')}</p>
      <p>Check that <code>./data/occupations.json</code> exists and is valid JSON.</p>
    </section>
  `;
}

function rememberRecent(slug) {
  state.recent = [slug, ...state.recent.filter((item) => item !== slug)].slice(0, 8);
  saveLocal('occupation-recent', state.recent);
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
}

function normalizeScore(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return clamp01(num);
}

function clamp01(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(1, num));
}

function formatPercent(value) {
  return `${Math.round(clamp01(value) * 100)}%`;
}

function formatDecimal(value) {
  return clamp01(value).toFixed(2);
}

function cleanString(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function pill(value) {
  return `<span class="pill">${escapeHtml(value)}</span>`;
}

function infoRow(label, value) {
  return `
    <div class="info-row">
      <div class="info-row__label">${escapeHtml(label)}</div>
      <div class="info-row__value">${value ? value : '<span class="muted">Not available</span>'}</div>
    </div>
  `;
}

function formatMultiline(text) {
  if (!text) return '';
  return escapeHtml(text).replace(/\n/g, '<br>');
}

function radialMeter(value, label) {
  const pct = clamp01(value);
  const angle = pct * 360;
  return `
    <div class="radial-wrap">
      <div class="radial" style="--angle:${angle}deg;">
        <div class="radial__inner">
          <strong>${formatPercent(pct)}</strong>
          <span>${escapeHtml(label)}</span>
        </div>
      </div>
    </div>
  `;
}

function getPercentile(value, values) {
  const valid = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!valid.length) return 0;
  const count = valid.filter((v) => v <= value).length;
  return Math.round((count / valid.length) * 100);
}

function loadLocal(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function saveLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}
