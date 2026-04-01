import { extractBrandSignalsFromDocument } from '../detectors/brand-signals.js';
import { summarizeColors } from '../detectors/color-detector.js';
import { summarizeFonts } from '../detectors/font-detector.js';
import { summarizeLogo } from '../detectors/logo-detector.js';
import { normalizeUrl, resolveRelativeUrl } from '../utils/dom.js';

async function fetchText(url) {
  const response = await fetch(url, {
    method: 'GET',
    mode: 'cors',
    credentials: 'omit',
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.text();
}

function extractInlineStyleHints(doc) {
  const samples = [];
  const styleNodes = Array.from(doc.querySelectorAll('[style]')).slice(0, 120);
  for (const node of styleNodes) {
    const style = node.getAttribute('style') || '';
    const bg = style.match(/background(?:-color)?\s*:\s*([^;]+)/i)?.[1];
    const fg = style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i)?.[1];
    if (bg) samples.push({ value: bg.trim(), role: 'surface-bg', source: 'inline style' });
    if (fg) samples.push({ value: fg.trim(), role: 'text', source: 'inline style' });
  }
  return samples;
}

function extractObviousHtmlLogoCandidates(doc, baseUrl) {
  return Array.from(doc.querySelectorAll('img, svg'))
    .slice(0, 80)
    .map((node) => {
      const hint = [
        node.getAttribute('alt'),
        node.getAttribute('title'),
        node.getAttribute('aria-label'),
        node.getAttribute('class'),
        node.getAttribute('id'),
      ]
        .filter(Boolean)
        .join(' ');

      const tag = node.tagName.toLowerCase();
      const inHeader = !!node.closest('header');
      const inHomeLink = !!node.closest('a[href="/"], a[href], a[rel="home"]');
      const semanticScore = /logo|brand|mark/i.test(hint) ? 0.22 : /header|nav/i.test(hint) ? 0.08 : 0;
      const isVector = tag === 'svg';
      return {
        source: 'parsed HTML',
        selector: tag,
        url: tag === 'img' ? resolveRelativeUrl(node.getAttribute('src'), baseUrl) : null,
        previewUrl: tag === 'img' ? resolveRelativeUrl(node.getAttribute('src'), baseUrl) : null,
        visible: true,
        inHomeLink,
        semanticScore: semanticScore + (inHeader ? 0.08 : 0),
        isVector,
        topLeftScore: inHeader ? 0.12 : 0,
        sizeScore: 0.06,
      };
    })
    .filter((candidate) => candidate.semanticScore > 0 || candidate.inHomeLink || candidate.isVector)
    .slice(0, 12);
}

function extractCssVariablesFromCss(text, source) {
  const matches = [...text.matchAll(/(--[a-z0-9-_]+)\s*:\s*([^;}{]+);/gi)];
  return matches.map((match) => ({
    name: match[1],
    value: match[2].trim(),
    source,
  }));
}

function extractFontHintsFromCss(text, source) {
  const samples = [];
  const fontFaceMatches = [...text.matchAll(/@font-face\s*\{([\s\S]*?)\}/gi)];
  fontFaceMatches.forEach((match) => {
    const family = match[1].match(/font-family\s*:\s*([^;]+)/i)?.[1]?.replaceAll(/['"]/g, '').trim();
    if (family) {
      samples.push({
        role: 'body',
        fontFamily: family,
        selector: '@font-face',
        count: 1,
        visible: false,
        source,
      });
    }
  });
  return samples;
}

async function fetchManifest(manifestUrl, blocked) {
  if (!manifestUrl) return [];
  try {
    const response = await fetch(manifestUrl, { mode: 'cors', credentials: 'omit' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const manifest = await response.json();
    return (manifest.icons || []).map((icon) => ({
      url: resolveRelativeUrl(icon.src, manifestUrl),
      sizes: icon.sizes || null,
      type: icon.type || null,
      source: 'web app manifest',
    }));
  } catch (error) {
    blocked.push({ step: 'manifest', reason: `Manifest fetch blocked or failed: ${error.message}` });
    return [];
  }
}

async function fetchReadableStylesheets(doc, baseUrl, blocked) {
  const links = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'))
    .map((link) => resolveRelativeUrl(link.getAttribute('href'), baseUrl))
    .filter(Boolean)
    .slice(0, 12);

  const cssVariables = [];
  const fontHints = [];
  const colorHints = [];

  for (const href of links) {
    try {
      const text = await fetchText(href);
      cssVariables.push(...extractCssVariablesFromCss(text, href));
      fontHints.push(...extractFontHintsFromCss(text, href));
      const colorMatches = [...text.matchAll(/(?:color|background(?:-color)?)\s*:\s*(#[0-9a-f]{3,8}|rgba?\([^)]*\))/gi)];
      colorMatches.slice(0, 50).forEach((match) => {
        colorHints.push({ value: match[1], role: 'surface-bg', source: href });
      });
    } catch (error) {
      blocked.push({ step: 'stylesheet', reason: `Stylesheet unreadable: ${href} (${error.message})` });
    }
  }

  return { cssVariables, fontHints, colorHints };
}

export async function analyzeUrlMode(rawUrl) {
  const url = normalizeUrl(rawUrl);
  const blocked = [];
  const warnings = [];
  const evidence = [];

  if (!url) {
    throw new Error('Enter a valid URL.');
  }

  let html;
  try {
    html = await fetchText(url);
  } catch (error) {
    return {
      mode: 'url',
      page: { url, title: '' },
      logo: { candidates: [], selected: null, confidence: 'Blocked', notes: ['HTML fetch failed.'] },
      fonts: { heading: null, body: null, ui: null, nav: null, mono: null, samples: [] },
      colors: { background: [], surface: [], text: [], accent: [], secondary: [], border: [], raw: [] },
      brandSignals: { themeColor: null, favicon: null, ogImage: null, manifestIcons: [], schemaLogo: null, cssVariables: [], icons: [] },
      evidence: [],
      blocked: [{ step: 'html-fetch', reason: `Browser could not read ${url}: ${error.message}. This is commonly caused by CORS.` }],
      warnings: ['URL mode only works when the target site explicitly allows browser access.'],
      exports: {},
    };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const brandSignals = extractBrandSignalsFromDocument(doc, url);
  evidence.push({ section: 'brand-signals', label: 'HTML metadata parsed', source: url, confidence: 'High', details: 'Title, favicon, theme-color, Open Graph image, schema.org logo, and manifest link were scanned from the fetched HTML.' });

  brandSignals.manifestIcons = await fetchManifest(brandSignals.manifestUrl, blocked);
  const stylesheetData = await fetchReadableStylesheets(doc, url, blocked);
  brandSignals.cssVariables = stylesheetData.cssVariables.slice(0, 80);

  if (brandSignals.cssVariables.length) {
    evidence.push({ section: 'brand-signals', label: 'Readable CSS variables', source: 'stylesheets', confidence: 'Medium', details: `Parsed ${brandSignals.cssVariables.length} custom properties from readable stylesheets.` });
  }

  const logoCandidates = extractObviousHtmlLogoCandidates(doc, url);
  if (brandSignals.schemaLogo?.url) {
    logoCandidates.unshift({
      source: 'schema.org logo',
      url: brandSignals.schemaLogo.url,
      previewUrl: brandSignals.schemaLogo.url,
      visible: true,
      inHomeLink: false,
      semanticScore: 0.24,
      isVector: /\.svg($|\?)/i.test(brandSignals.schemaLogo.url),
      topLeftScore: 0.04,
      sizeScore: 0.08,
    });
  }
  if (brandSignals.ogImage?.url) {
    logoCandidates.push({
      source: 'Open Graph image',
      url: brandSignals.ogImage.url,
      previewUrl: brandSignals.ogImage.url,
      visible: true,
      inHomeLink: false,
      semanticScore: 0.1,
      isVector: false,
      topLeftScore: 0.02,
      sizeScore: 0.04,
    });
  }

  const logo = summarizeLogo(logoCandidates, ['URL mode cannot inspect live layout or computed visibility.']);
  const fontSamples = [
    ...stylesheetData.fontHints,
    ...Array.from(doc.querySelectorAll('h1, h2, h3, p, a, button')).slice(0, 80).flatMap((node) => {
      const style = node.getAttribute('style') || '';
      const family = style.match(/font-family\s*:\s*([^;]+)/i)?.[1];
      if (!family) return [];
      return [{
        role: /h1|h2|h3/i.test(node.tagName) ? 'heading' : node.tagName === 'button' ? 'ui' : node.tagName === 'a' ? 'nav' : 'body',
        fontFamily: family,
        selector: node.tagName.toLowerCase(),
        count: 1,
        visible: true,
        source: 'inline style',
        text: node.textContent?.trim()?.slice(0, 40) || node.tagName,
      }];
    }),
  ];
  const fonts = summarizeFonts(fontSamples);

  const colorSamples = [
    ...extractInlineStyleHints(doc),
    ...stylesheetData.colorHints,
    ...brandSignals.cssVariables
      .filter((entry) => /color|brand|accent|primary|secondary|bg|surface|text|border/i.test(entry.name))
      .map((entry) => ({ value: entry.value, role: /accent|primary|brand/i.test(entry.name) ? 'button-bg' : /text/i.test(entry.name) ? 'text' : /border/i.test(entry.name) ? 'border' : 'surface-bg', source: `CSS variable ${entry.name}` })),
  ];

  const colors = summarizeColors(colorSamples, { themeColor: brandSignals.themeColor?.value || null });

  if (!fontSamples.length) warnings.push('No reliable font-family declarations were readable in URL mode.');
  if (!brandSignals.cssVariables.length) warnings.push('No CSS variables were readable. Cross-origin stylesheets are often blocked.');

  return {
    mode: 'url',
    page: { url, title: brandSignals.title || doc.title || '' },
    logo,
    fonts,
    colors,
    brandSignals,
    evidence,
    blocked,
    warnings,
    exports: {},
  };
}
