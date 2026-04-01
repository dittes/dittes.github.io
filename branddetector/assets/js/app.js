import { summarizeColors } from './detectors/color-detector.js';
import { summarizeFonts } from './detectors/font-detector.js';
import { summarizeLogo } from './detectors/logo-detector.js';
import { buildExports } from './utils/export.js';
import { copyText, downloadTextFile, qs } from './utils/dom.js';
import { analyzeUrlMode } from './modes/url-analysis.js';
import { initCurrentPageMode } from './modes/current-page.js';
import { initImageMode } from './modes/image-analysis.js';
import { setState, getState } from './state.js';
import { renderEmptyState, renderResult, showToast } from './ui.js';

function enhanceResult(result) {
  if (!result) return null;
  const next = structuredClone(result);

  if (next.logo && (!next.logo.selected && next.logo.candidates?.length)) {
    next.logo = summarizeLogo(next.logo.candidates, next.logo.notes || []);
  }
  if (next.fonts && !next.fonts.heading && Array.isArray(next.fonts.samples)) {
    next.fonts = summarizeFonts(next.fonts.samples);
  }
  if (next.colors && (!next.colors.accent || !next.colors.background)) {
    next.colors = summarizeColors(next.colors.raw || [], { themeColor: next.brandSignals?.themeColor?.value || null });
  }

  next.exports = buildExports(next);
  return next;
}

function applyResult(rawResult) {
  const result = enhanceResult(rawResult);
  setState({ result });
  renderResult(result, result.exports, showToast);
}

function setMode(mode) {
  setState({ mode });
  document.querySelectorAll('.tab').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.tab === mode);
    button.setAttribute('aria-selected', String(button.dataset.tab === mode));
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('is-active', panel.dataset.panel === mode);
  });
}

function bindTabs() {
  document.querySelectorAll('.tab').forEach((button) => {
    button.addEventListener('click', () => setMode(button.dataset.tab));
  });
}

function bindTopbarActions() {
  document.getElementById('copySummaryBtn').addEventListener('click', async () => {
    const result = getState().result;
    if (!result?.exports?.summary) {
      showToast({ title: 'No result', body: 'Run an analysis first.' });
      return;
    }
    await copyText(result.exports.summary);
    showToast({ title: 'Copied', body: 'Summary copied to the clipboard.' });
  });

  document.getElementById('copyCssBtn').addEventListener('click', async () => {
    const result = getState().result;
    if (!result?.exports?.css) {
      showToast({ title: 'No tokens', body: 'Run an analysis first.' });
      return;
    }
    await copyText(result.exports.css);
    showToast({ title: 'Copied', body: 'CSS variables copied to the clipboard.' });
  });

  document.getElementById('downloadJsonBtn').addEventListener('click', () => {
    const result = getState().result;
    if (!result?.exports?.json) {
      showToast({ title: 'No result', body: 'Run an analysis first.' });
      return;
    }
    downloadTextFile(result.exports.filenames.json, result.exports.json, 'application/json;charset=utf-8');
    showToast({ title: 'Downloaded', body: result.exports.filenames.json });
  });
}

function bindUrlMode() {
  const form = document.getElementById('urlForm');
  const input = document.getElementById('urlInput');
  const status = document.getElementById('urlModeStatus');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const url = input.value.trim();
    if (!url) {
      showToast({ title: 'Missing URL', body: 'Enter a website URL first.' });
      return;
    }
    status.textContent = 'Attempting direct browser fetch and metadata extraction…';
    try {
      const result = await analyzeUrlMode(url);
      applyResult(result);
      const blockedCount = result.blocked?.length || 0;
      status.textContent = blockedCount
        ? `Analysis completed with ${blockedCount} blocked step(s).`
        : 'Analysis completed. The browser could read the requested resources.';
      setMode('url');
    } catch (error) {
      status.textContent = `URL analysis failed: ${error.message}`;
      showToast({ title: 'URL analysis failed', body: error.message });
    }
  });
}

function bindMessageImport() {
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || data.type !== 'brand-identity-result-v1' || !data.payload) return;
    applyResult(data.payload);
    showToast({ title: 'Imported', body: 'Current-page analysis result received.' });
    if (window.location.hash.includes('receiver=1')) {
      history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
  });
}

function bootHashNotice() {
  if (window.location.hash.includes('receiver=1')) {
    showToast({ title: 'Receiver ready', body: 'This tab is waiting for a bookmarklet result.' });
  }
}

function init() {
  renderEmptyState();
  bindTabs();
  bindTopbarActions();
  bindUrlMode();
  bindMessageImport();
  initCurrentPageMode();
  initImageMode({ onResult: applyResult, onToast: showToast });
  setMode('current-page');
  bootHashNotice();

  if (window.location.hash.includes('receiver=1')) {
    setMode('current-page');
  }
}

init();
