import { cssConfidenceClass } from './utils/score.js';
import { copyText, downloadTextFile, escapeHtml } from './utils/dom.js';

function emptyCard(title, body) {
  return `
    <h4>${title}</h4>
    <div class="empty-card">
      <p>${body}</p>
    </div>
  `;
}

function badge(confidence = 'Low') {
  return `<span class="card-label ${cssConfidenceClass(confidence)}">${escapeHtml(confidence)}</span>`;
}

function renderLogoCard(result) {
  const logo = result?.logo;
  if (!logo?.selected) {
    return emptyCard('Logo', 'No logo candidate is selected yet. Current-page mode usually performs best here.');
  }
  const selected = logo.selected;
  return `
    <h4>Logo ${badge(logo.confidence)}</h4>
    <div class="logo-preview">${selected.previewUrl ? `<img src="${selected.previewUrl}" alt="Detected logo candidate" />` : '<span class="tiny-note">No preview available</span>'}</div>
    <dl class="key-value-list" style="margin-top:0.8rem;">
      <div class="key-value"><dt>Source</dt><dd>${escapeHtml(selected.source || 'unknown')}</dd></div>
      <div class="key-value"><dt>Selector</dt><dd>${escapeHtml(selected.selector || 'n/a')}</dd></div>
      <div class="key-value"><dt>Reasoning</dt><dd>${escapeHtml((selected.reasons || []).slice(0, 2).join(', ') || 'heuristic')}</dd></div>
    </dl>
    ${logo.candidates?.length > 1 ? `
      <div class="candidate-grid">
        ${logo.candidates.map((candidate) => `
          <div class="candidate-tile">
            ${candidate.previewUrl ? `<img src="${candidate.previewUrl}" alt="Candidate" />` : '<div class="logo-preview tiny-note">No preview</div>'}
            <div class="tiny-note" style="margin-top:0.45rem;">${escapeHtml(candidate.source || 'candidate')} · ${escapeHtml(candidate.confidence || 'Low')}</div>
          </div>
        `).join('')}
      </div>
    ` : ''}
  `;
}

function fontBlock(label, data) {
  if (!data) {
    return `<div class="font-sample"><div class="font-sample__role">${escapeHtml(label)}</div><div class="tiny-note">Not detected</div></div>`;
  }
  const style = [
    data.stack ? `font-family:${data.stack};` : '',
    data.fontSize ? `font-size:${Math.min(28, Math.max(15, Number(data.fontSize)))}px;` : '',
    data.fontWeight ? `font-weight:${data.fontWeight};` : '',
    data.letterSpacing ? `letter-spacing:${data.letterSpacing};` : '',
    data.textTransform ? `text-transform:${data.textTransform};` : '',
  ].join('');
  return `
    <div class="font-sample">
      <div class="font-sample__role">${escapeHtml(label)} · ${escapeHtml(data.confidence || 'Low')}</div>
      <div class="font-sample__text" style="${style}">${escapeHtml(data.preview || data.family || data.stack || 'Sample')}</div>
      <div class="tiny-note" style="margin-top:0.45rem;">${escapeHtml(data.family || data.stack || 'Unknown')}</div>
    </div>
  `;
}

function renderFontsCard(result) {
  const fonts = result?.fonts;
  if (!fonts) return emptyCard('Fonts', 'No font information available.');
  return `
    <h4>Fonts ${badge(fonts.heading?.confidence || fonts.body?.confidence || 'Low')}</h4>
    ${fontBlock('Heading', fonts.heading)}
    ${fontBlock('Body', fonts.body)}
    ${fontBlock('UI / Buttons', fonts.ui)}
  `;
}

function swatch(token) {
  return `
    <div class="swatch">
      <div class="swatch__tone" style="background:${token.hex};"></div>
      <div class="swatch__meta">
        <div class="swatch__name">${escapeHtml(token.label || 'Color')}</div>
        <div class="swatch__hex">${escapeHtml(token.hex)}</div>
        <div class="tiny-note">${escapeHtml(token.confidence || 'Low')} · ${escapeHtml(token.source || 'heuristic')}</div>
      </div>
    </div>
  `;
}

function renderColorsCard(result) {
  const colors = result?.colors;
  if (!colors) return emptyCard('Colors', 'No color analysis available.');
  const rows = [
    ...(colors.background || []),
    ...(colors.surface || []),
    ...(colors.text || []),
    ...(colors.accent || []),
    ...(colors.secondary || []),
    ...(colors.border || []),
  ].slice(0, 8);
  return `
    <h4>Colors ${badge(colors.accent?.[0]?.confidence || colors.background?.[0]?.confidence || 'Low')}</h4>
    <div class="swatch-grid">
      ${rows.length ? rows.map(swatch).join('') : '<div class="tiny-note">No colors detected.</div>'}
    </div>
  `;
}

function iconChip(url, label = 'icon') {
  return `
    <div class="icon-chip" title="${escapeHtml(label)}">
      <img src="${url}" alt="${escapeHtml(label)}" />
    </div>
  `;
}

function renderSignalsCard(result) {
  const signals = result?.brandSignals;
  if (!signals) return emptyCard('Brand Signals', 'No brand signal metadata found.');
  const confidence = signals.themeColor?.confidence || (signals.schemaLogo || signals.ogImage || (signals.icons || []).length ? 'Medium' : 'Low');
  return `
    <h4>Brand Signals ${badge(confidence)}</h4>
    <dl class="key-value-list">
      <div class="key-value"><dt>Title</dt><dd>${escapeHtml(result?.page?.title || 'Unknown')}</dd></div>
      <div class="key-value"><dt>Theme color</dt><dd>${escapeHtml(signals.themeColor?.value || 'None')}</dd></div>
      <div class="key-value"><dt>OG image</dt><dd>${signals.ogImage?.url ? 'Found' : 'None'}</dd></div>
      <div class="key-value"><dt>Schema logo</dt><dd>${signals.schemaLogo?.url ? 'Found' : 'None'}</dd></div>
      <div class="key-value"><dt>CSS variables</dt><dd>${signals.cssVariables?.length || 0}</dd></div>
    </dl>
    ${(signals.icons?.length || signals.manifestIcons?.length) ? `
      <div class="icon-row">
        ${(signals.icons || []).slice(0, 4).map((icon) => icon.url ? iconChip(icon.url, icon.rel || 'icon') : '').join('')}
        ${(signals.manifestIcons || []).slice(0, 2).map((icon) => icon.url ? iconChip(icon.url, 'manifest icon') : '').join('')}
      </div>
    ` : ''}
  `;
}

function renderConfidenceCard(result) {
  const blocked = result?.blocked || [];
  const warnings = result?.warnings || [];
  const confidenceItems = [
    result?.logo?.confidence,
    result?.fonts?.heading?.confidence || result?.fonts?.body?.confidence,
    result?.colors?.accent?.[0]?.confidence || result?.colors?.background?.[0]?.confidence,
  ].filter(Boolean);
  const topConfidence = confidenceItems[0] || 'Low';
  return `
    <h4>Confidence / Limitations ${badge(topConfidence)}</h4>
    <div class="notice ${blocked.length ? 'notice--warn' : 'notice--info'} compact">
      <strong>${blocked.length ? 'Blocked steps detected' : 'No blocked steps in current result'}</strong>
      <p>${blocked.length ? `${blocked.length} step(s) were blocked by browser or network restrictions.` : 'The current result was assembled without a hard browser block.'}</p>
    </div>
    ${warnings.length ? `<div class="pill-row">${warnings.slice(0, 4).map((warning) => `<span class="card-label">${escapeHtml(warning)}</span>`).join('')}</div>` : ''}
    ${blocked.length ? `<div class="tiny-note" style="margin-top:0.8rem;">${escapeHtml(blocked[0].step)} — ${escapeHtml(blocked[0].reason)}</div>` : ''}
  `;
}

function renderExportCard(result, exports) {
  if (!result) return emptyCard('Export', 'Run an analysis to generate JSON, design tokens, and CSS variable exports.');
  return `
    <h4>Export ${badge('High')}</h4>
    <div class="export-box">
      <pre>${escapeHtml(exports.css || 'No CSS tokens yet.')}</pre>
      <div class="action-row">
        <button type="button" class="small-btn" data-action="copy-css">Copy CSS</button>
        <button type="button" class="small-btn" data-action="copy-summary">Copy summary</button>
        <button type="button" class="small-btn" data-action="download-json">Download JSON</button>
      </div>
    </div>
  `;
}

function renderEvidence(result) {
  const evidenceGroups = new Map();
  const groups = [
    ...(result?.evidence || []),
    ...((result?.blocked || []).map((entry) => ({ section: 'blocked', label: entry.step, source: 'browser restriction', confidence: 'Blocked', details: entry.reason }))),
  ];

  groups.forEach((item) => {
    const section = item.section || 'other';
    if (!evidenceGroups.has(section)) evidenceGroups.set(section, []);
    evidenceGroups.get(section).push(item);
  });

  if (!evidenceGroups.size) {
    return '<div class="empty-state"><p>No evidence captured yet.</p></div>';
  }

  return [...evidenceGroups.entries()].map(([section, items]) => `
    <details class="evidence-group" ${section === 'blocked' ? '' : 'open'}>
      <summary>
        <span>${escapeHtml(section.replace('-', ' '))}</span>
        <span class="card-label">${items.length}</span>
      </summary>
      <div class="evidence-body">
        ${items.map((item) => `
          <div class="evidence-item">
            <div style="display:flex;justify-content:space-between;gap:1rem;align-items:center;flex-wrap:wrap;">
              <strong>${escapeHtml(item.label || 'Evidence')}</strong>
              ${badge(item.confidence || 'Low')}
            </div>
            <div class="tiny-note" style="margin-top:0.35rem;">${escapeHtml(item.source || 'unknown source')}</div>
            <div class="pre-wrap" style="margin-top:0.45rem;color:var(--text-soft);">${escapeHtml(item.details || '')}</div>
          </div>
        `).join('')}
      </div>
    </details>
  `).join('');
}

function renderMeta(result) {
  if (!result) return 'No result yet.';
  const pagePart = result.page?.title || result.page?.url || 'Untitled result';
  return `${pagePart} · mode: ${result.mode}`;
}

function wireExportActions(root, exports, onToast) {
  root.querySelector('[data-action="copy-css"]')?.addEventListener('click', async () => {
    await copyText(exports.css || '');
    onToast({ title: 'Copied', body: 'CSS variables copied to the clipboard.' });
  });
  root.querySelector('[data-action="copy-summary"]')?.addEventListener('click', async () => {
    await copyText(exports.summary || '');
    onToast({ title: 'Copied', body: 'Summary copied to the clipboard.' });
  });
  root.querySelector('[data-action="download-json"]')?.addEventListener('click', () => {
    downloadTextFile(exports.filenames?.json || 'brand-identity.json', exports.json || '{}', 'application/json;charset=utf-8');
    onToast({ title: 'Downloaded', body: exports.filenames?.json || 'brand-identity.json downloaded.' });
  });
}

export function renderResult(result, exports, onToast) {
  const logoCard = document.getElementById('logoCard');
  const fontsCard = document.getElementById('fontsCard');
  const colorsCard = document.getElementById('colorsCard');
  const signalsCard = document.getElementById('signalsCard');
  const confidenceCard = document.getElementById('confidenceCard');
  const exportCard = document.getElementById('exportCard');
  const evidencePanel = document.getElementById('evidencePanel');
  const resultMeta = document.getElementById('resultMeta');

  logoCard.innerHTML = renderLogoCard(result);
  fontsCard.innerHTML = renderFontsCard(result);
  colorsCard.innerHTML = renderColorsCard(result);
  signalsCard.innerHTML = renderSignalsCard(result);
  confidenceCard.innerHTML = renderConfidenceCard(result);
  exportCard.innerHTML = renderExportCard(result, exports || {});
  evidencePanel.innerHTML = renderEvidence(result);
  resultMeta.textContent = renderMeta(result);
  wireExportActions(exportCard, exports || {}, onToast);
}

export function renderEmptyState() {
  document.getElementById('logoCard').innerHTML = emptyCard('Logo', 'Run an analysis to detect likely logo candidates.');
  document.getElementById('fontsCard').innerHTML = emptyCard('Fonts', 'Run an analysis to inspect heading, body, and UI fonts.');
  document.getElementById('colorsCard').innerHTML = emptyCard('Colors', 'Run an analysis to infer backgrounds, accent colors, and text colors.');
  document.getElementById('signalsCard').innerHTML = emptyCard('Brand Signals', 'Metadata such as favicon, theme-color, or schema.org logo will appear here.');
  document.getElementById('confidenceCard').innerHTML = emptyCard('Confidence / Limitations', 'Blocked steps and limitations are shown per result.');
  document.getElementById('exportCard').innerHTML = emptyCard('Export', 'Exports are generated after a result exists.');
  document.getElementById('evidencePanel').innerHTML = '<div class="empty-state"><p>No evidence captured yet.</p></div>';
  document.getElementById('resultMeta').textContent = 'No result yet.';
}

export function showToast({ title, body }) {
  const region = document.getElementById('toastRegion');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<strong>${escapeHtml(title)}</strong><div>${escapeHtml(body)}</div>`;
  region.appendChild(toast);
  window.setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    window.setTimeout(() => toast.remove(), 220);
  }, 2600);
}
