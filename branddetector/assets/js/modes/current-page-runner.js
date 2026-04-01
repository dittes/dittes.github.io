(async function () {
  if (window.__brandIdentityDetectorRunning) return;
  window.__brandIdentityDetectorRunning = true;

  const scriptUrl = new URL(document.currentScript.src);
  const receiverUrl = scriptUrl.searchParams.get('receiver') || '';
  const receiverTarget = receiverUrl.includes('#') ? receiverUrl : `${receiverUrl}#receiver=1`;
  let receiverWindow = null;
  let receiverOrigin = '*';

  try {
    receiverOrigin = new URL(receiverUrl).origin;
  } catch {
    receiverOrigin = '*';
  }

  try {
    receiverWindow = window.open(receiverTarget, '_blank');
  } catch {
    receiverWindow = null;
  }

  const blocked = [];
  const evidence = [];
  const warnings = [];

  const logoWords = /logo|brand|mark|wordmark|logotype/i;
  const navWords = /nav|menu|header/i;
  const buttonLikeSelector = 'button, [role="button"], input[type="button"], input[type="submit"], .btn, .button, [class*="cta" i], [class*="primary" i]';

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function parseColor(input) {
    if (!input) return null;
    const value = String(input).trim().toLowerCase();
    if (value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
    if (value.startsWith('#')) {
      const hex = value.slice(1);
      if (hex.length === 3) {
        return {
          r: parseInt(hex[0] + hex[0], 16),
          g: parseInt(hex[1] + hex[1], 16),
          b: parseInt(hex[2] + hex[2], 16),
          a: 1,
        };
      }
      if (hex.length === 6 || hex.length === 8) {
        return {
          r: parseInt(hex.slice(0, 2), 16),
          g: parseInt(hex.slice(2, 4), 16),
          b: parseInt(hex.slice(4, 6), 16),
          a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
        };
      }
    }
    const rgb = value.match(/rgba?\(([^)]+)\)/);
    if (rgb) {
      const [r, g, b, a] = rgb[1].split(',').map((part) => Number.parseFloat(part.trim()));
      return { r, g, b, a: Number.isFinite(a) ? a : 1 };
    }
    return null;
  }

  function blendAgainstWhite(color) {
    if (!color) return null;
    if (color.a === undefined || color.a >= 1) return color;
    return {
      r: color.r * color.a + 255 * (1 - color.a),
      g: color.g * color.a + 255 * (1 - color.a),
      b: color.b * color.a + 255 * (1 - color.a),
      a: 1,
    };
  }

  function rgbaToHex(color) {
    const c = blendAgainstWhite(color);
    if (!c) return null;
    const hex = (part) => Math.round(part).toString(16).padStart(2, '0');
    return `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`.toUpperCase();
  }

  function luminance(color) {
    if (!color) return 0;
    const t = (value) => {
      const v = value / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * t(color.r) + 0.7152 * t(color.g) + 0.0722 * t(color.b);
  }

  function rgbToHsl(color) {
    const rn = color.r / 255;
    const gn = color.g / 255;
    const bn = color.b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const diff = max - min;
    const l = (max + min) / 2;
    if (diff === 0) return { h: 0, s: 0, l };
    const s = l > 0.5 ? diff / (2 - max - min) : diff / (max + min);
    let h;
    switch (max) {
      case rn:
        h = (gn - bn) / diff + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / diff + 2;
        break;
      default:
        h = (rn - gn) / diff + 4;
    }
    h /= 6;
    return { h: h * 360, s, l };
  }

  function classifyNature(hex) {
    const color = parseColor(hex);
    if (!color) return 'unknown';
    const hsl = rgbToHsl(color);
    const lum = luminance(color);
    if (hsl.s < 0.12) {
      if (lum > 0.82) return 'light-neutral';
      if (lum < 0.14) return 'dark-neutral';
      return 'neutral';
    }
    if (hsl.s > 0.45 && lum > 0.18 && lum < 0.84) return 'accent-like';
    return 'supporting';
  }

  function colorDistance(a, b) {
    return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
  }

  function uniqueBy(items, keyFn) {
    const seen = new Set();
    return items.filter((item) => {
      const key = keyFn(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function roleFromElement(el) {
    const tag = el.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) return 'heading';
    if (tag === 'button' || el.matches(buttonLikeSelector)) return 'button';
    if (tag === 'nav' || el.closest('nav')) return 'nav';
    if (tag === 'code' || tag === 'pre' || tag === 'kbd') return 'mono';
    if (tag === 'a') return 'link';
    return 'body';
  }

  function buildSelector(el) {
    if (!el || !el.tagName) return '';
    const parts = [el.tagName.toLowerCase()];
    if (el.id) parts.push(`#${el.id}`);
    const classList = Array.from(el.classList || []).slice(0, 2);
    if (classList.length) parts.push(...classList.map((className) => `.${className}`));
    return parts.join('');
  }

  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return (
      rect.width > 6 &&
      rect.height > 6 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      Number.parseFloat(style.opacity || '1') > 0 &&
      rect.bottom >= 0 &&
      rect.right >= 0 &&
      rect.top <= window.innerHeight &&
      rect.left <= window.innerWidth
    );
  }

  function scoreTopLeft(rect) {
    const xScore = 1 - clamp(rect.left / Math.max(window.innerWidth, 1), 0, 1);
    const yScore = 1 - clamp(rect.top / Math.max(window.innerHeight, 1), 0, 1);
    return (xScore * 0.6 + yScore * 0.4) * 0.16;
  }

  function scoreSize(rect) {
    const area = rect.width * rect.height;
    const viewport = Math.max(window.innerWidth * window.innerHeight, 1);
    const normalized = area / viewport;
    return clamp(normalized * 4, 0, 0.12);
  }

  function scoreLogoCandidate(candidate) {
    let score = 0;
    const reasons = [];
    if (candidate.visible) {
      score += 0.16;
      reasons.push('visible');
    }
    if (candidate.inHomeLink) {
      score += 0.18;
      reasons.push('inside home link');
    }
    if (candidate.semanticScore) {
      score += Math.min(candidate.semanticScore, 0.24);
      reasons.push('semantic logo hints');
    }
    if (candidate.isVector) {
      score += 0.12;
      reasons.push('vector or inline SVG');
    }
    if (candidate.topLeftScore) {
      score += candidate.topLeftScore;
      reasons.push('top-left placement');
    }
    if (candidate.sizeScore) {
      score += candidate.sizeScore;
      reasons.push('reasonable size');
    }
    if (candidate.hiddenPenalty) score -= candidate.hiddenPenalty;
    if (candidate.repeatPenalty) score -= candidate.repeatPenalty;
    return { score: clamp(score, 0, 1), reasons };
  }

  function normalizeFontName(fontFamily) {
    if (!fontFamily) return '';
    return fontFamily.split(',')[0].replaceAll(/['"]/g, '').trim();
  }

  function normalizeFontStack(fontFamily) {
    return fontFamily
      .split(',')
      .map((part) => part.replaceAll(/['"]/g, '').trim())
      .filter(Boolean)
      .join(', ');
  }

  function scoreFontSample(sample) {
    let score = 0;
    if (sample.visible) score += 0.15;
    if (sample.role === 'heading') score += 0.24;
    if (sample.role === 'body') score += 0.18;
    if (sample.role === 'ui' || sample.role === 'button' || sample.role === 'nav') score += 0.2;
    score += Math.min((sample.count || 0) / 20, 0.2);
    score += Math.min((sample.fontSize || 0) / 80, 0.14);
    return clamp(score, 0, 1);
  }

  function confidenceFromScore(score) {
    if (score >= 0.74) return 'High';
    if (score >= 0.45) return 'Medium';
    if (score > 0) return 'Low';
    return 'Blocked';
  }

  function groupSimilarColors(samples, threshold) {
    const groups = [];
    for (const sample of samples) {
      const color = parseColor(sample.value || sample.hex || sample.color);
      if (!color || color.a === 0) continue;
      const normalized = blendAgainstWhite(color);
      const existing = groups.find((group) => colorDistance(group.color, normalized) <= threshold);
      if (existing) {
        existing.items.push(sample);
        existing.weight += sample.weight || 1;
      } else {
        groups.push({
          color: normalized,
          hex: rgbaToHex(normalized),
          items: [sample],
          weight: sample.weight || 1,
        });
      }
    }
    groups.sort((a, b) => b.weight - a.weight);
    return groups;
  }

  function scoreAccent(group) {
    const hsl = rgbToHsl(group.color);
    let score = 0;
    if (group.items.some((item) => item.role === 'button-bg')) score += 0.28;
    if (group.items.some((item) => item.role === 'link')) score += 0.16;
    if (group.items.some((item) => item.role === 'active-nav')) score += 0.12;
    if (group.items.some((item) => item.role === 'badge')) score += 0.1;
    if (group.items.length > 1) score += 0.12;
    score += Math.min(group.weight / 50, 0.16);
    if (classifyNature(group.hex) === 'accent-like') score += 0.16;
    if (hsl.s < 0.12) score -= 0.16;
    if (hsl.l > 0.92 || hsl.l < 0.07) score -= 0.12;
    return clamp(score, 0, 1);
  }

  function chooseFont(samples, roles) {
    const scoped = samples.filter((sample) => roles.includes(sample.role));
    if (!scoped.length) return null;
    const grouped = new Map();
    scoped.forEach((sample) => {
      const stack = normalizeFontStack(sample.fontFamily);
      if (!stack) return;
      const existing = grouped.get(stack) || {
        stack,
        family: normalizeFontName(stack),
        score: 0,
        examples: [],
        selectors: new Set(),
        fontSize: sample.fontSize,
        fontWeight: sample.fontWeight,
        lineHeight: sample.lineHeight,
        letterSpacing: sample.letterSpacing,
        textTransform: sample.textTransform,
      };
      existing.score += scoreFontSample(sample);
      if (sample.text) existing.examples.push(sample.text);
      if (sample.selector) existing.selectors.add(sample.selector);
      grouped.set(stack, existing);
    });
    const winner = [...grouped.values()].sort((a, b) => b.score - a.score)[0];
    if (!winner) return null;
    return {
      family: winner.family,
      stack: winner.stack,
      confidence: confidenceFromScore(Math.min(winner.score / 2, 1)),
      selectors: [...winner.selectors],
      preview: winner.examples[0] || winner.family,
      fontSize: winner.fontSize,
      fontWeight: winner.fontWeight,
      lineHeight: winner.lineHeight,
      letterSpacing: winner.letterSpacing,
      textTransform: winner.textTransform,
    };
  }

  function extractCssVariables() {
    const variables = [];
    const seen = new Set();
    for (const sheet of Array.from(document.styleSheets)) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch (error) {
        blocked.push({ step: 'stylesheet-read', reason: `Stylesheet rules blocked by browser security: ${sheet.href || 'inline stylesheet'}` });
        continue;
      }
      if (!rules) continue;
      for (const rule of Array.from(rules)) {
        if (!rule.style) continue;
        for (const propName of Array.from(rule.style)) {
          if (!propName.startsWith('--')) continue;
          const key = `${propName}:${rule.style.getPropertyValue(propName).trim()}`;
          if (seen.has(key)) continue;
          seen.add(key);
          variables.push({
            name: propName,
            value: rule.style.getPropertyValue(propName).trim(),
            source: sheet.href || 'inline stylesheet',
            selector: rule.selectorText || ':root',
          });
        }
      }
    }
    return variables.slice(0, 120);
  }

  async function extractManifestIcons() {
    const manifestLink = document.querySelector('link[rel="manifest"]')?.getAttribute('href');
    if (!manifestLink) return [];
    try {
      const manifestUrl = new URL(manifestLink, location.href).toString();
      const response = await fetch(manifestUrl, { credentials: 'omit' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const manifest = await response.json();
      return (manifest.icons || []).map((icon) => ({
        url: new URL(icon.src, manifestUrl).toString(),
        sizes: icon.sizes || null,
        type: icon.type || null,
        source: 'web app manifest',
      }));
    } catch (error) {
      blocked.push({ step: 'manifest', reason: `Manifest unreadable: ${error.message}` });
      return [];
    }
  }

  function extractBrandSignals(cssVariables, manifestIcons) {
    const iconLinks = Array.from(document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="mask-icon"]')).map((link) => ({
      rel: link.getAttribute('rel'),
      sizes: link.getAttribute('sizes') || null,
      type: link.getAttribute('type') || null,
      url: link.href,
      source: 'link rel icon',
    }));

    const ogImage = document.querySelector('meta[property="og:image"], meta[name="og:image"]')?.getAttribute('content');
    const themeColor = document.querySelector('meta[name="theme-color"]')?.getAttribute('content');
    const schemaScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    let schemaLogo = null;
    for (const script of schemaScripts) {
      try {
        const data = JSON.parse(script.textContent);
        const queue = Array.isArray(data) ? [...data] : [data];
        while (queue.length) {
          const node = queue.shift();
          if (!node || typeof node !== 'object') continue;
          const type = Array.isArray(node['@type']) ? node['@type'].join(',') : node['@type'];
          if (/organization|brand|corporation|website|webpage/i.test(type || '')) {
            const logo = node.logo;
            if (logo) {
              schemaLogo = typeof logo === 'string' ? { url: new URL(logo, location.href).toString(), source: 'schema.org logo' } : logo.url ? { url: new URL(logo.url, location.href).toString(), source: 'schema.org logo' } : null;
              if (schemaLogo) break;
            }
          }
          Object.values(node).forEach((value) => {
            if (Array.isArray(value)) value.forEach((item) => queue.push(item));
            else if (value && typeof value === 'object') queue.push(value);
          });
        }
      } catch {
        // ignore malformed JSON-LD
      }
      if (schemaLogo) break;
    }

    return {
      themeColor: themeColor ? { value: themeColor, source: 'meta theme-color', confidence: 'High' } : null,
      favicon: iconLinks[0] || null,
      icons: iconLinks,
      ogImage: ogImage ? { url: new URL(ogImage, location.href).toString(), source: 'Open Graph image', confidence: 'Medium' } : null,
      manifestIcons,
      schemaLogo,
      cssVariables,
      title: document.title,
    };
  }

  function collectLogoCandidates() {
    const nodes = Array.from(document.querySelectorAll('header img, header svg, nav img, nav svg, a img, a svg, img, svg')).slice(0, 150);
    const candidates = [];

    nodes.forEach((node) => {
      const rect = node.getBoundingClientRect();
      if (rect.width < 18 || rect.height < 18) return;
      const tag = node.tagName.toLowerCase();
      const hint = [
        node.getAttribute('alt'),
        node.getAttribute('title'),
        node.getAttribute('aria-label'),
        node.getAttribute('class'),
        node.getAttribute('id'),
      ]
        .filter(Boolean)
        .join(' ');
      const visible = isVisible(node);
      const inHomeLink = !!node.closest('a[href="/"], a[href="./"], a[aria-label*="home" i], a[rel="home"]');
      const inHeader = !!node.closest('header, nav');
      const semanticScore = logoWords.test(hint) ? 0.22 : navWords.test(hint) ? 0.08 : 0;
      const topLeftScore = scoreTopLeft(rect) + (inHeader ? 0.04 : 0);
      const sizeScore = scoreSize(rect);
      const isVector = tag === 'svg' || (/\.svg($|\?)/i.test(node.currentSrc || node.src || ''));
      const hiddenPenalty = visible ? 0 : 0.22;
      const repeatPenalty = rect.top > window.innerHeight * 0.55 ? 0.06 : 0;
      let previewUrl = null;
      if (tag === 'img') previewUrl = node.currentSrc || node.src || null;
      if (tag === 'svg') {
        try {
          previewUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(node.outerHTML)}`;
        } catch {
          previewUrl = null;
        }
      }
      const candidate = {
        selector: buildSelector(node),
        source: 'live DOM',
        visible,
        inHomeLink,
        semanticScore,
        topLeftScore,
        sizeScore,
        isVector,
        hiddenPenalty,
        repeatPenalty,
        url: previewUrl,
        previewUrl,
        width: rect.width,
        height: rect.height,
        x: rect.left,
        y: rect.top,
      };
      const scored = scoreLogoCandidate(candidate);
      candidates.push({ ...candidate, score: scored.score, confidence: confidenceFromScore(scored.score), reasons: scored.reasons });
    });

    return uniqueBy(candidates.sort((a, b) => b.score - a.score), (item) => `${item.previewUrl || item.selector}-${Math.round(item.x)}-${Math.round(item.y)}`).slice(0, 12);
  }

  function collectFontSamples() {
    const selector = 'h1, h2, h3, h4, h5, h6, p, li, a, button, nav a, code, pre, [role="button"], input[type="button"], input[type="submit"]';
    const samples = [];
    Array.from(document.querySelectorAll(selector)).slice(0, 220).forEach((el) => {
      if (!isVisible(el)) return;
      const style = window.getComputedStyle(el);
      const fontFamily = style.fontFamily;
      if (!fontFamily) return;
      const role = roleFromElement(el);
      samples.push({
        role: role === 'button' ? 'ui' : role,
        selector: buildSelector(el),
        text: (el.textContent || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 80),
        fontFamily,
        fontSize: Number.parseFloat(style.fontSize),
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
        letterSpacing: style.letterSpacing,
        textTransform: style.textTransform,
        count: 1,
        visible: true,
        source: 'computed style',
      });
    });

    if (document.fonts?.forEach) {
      document.fonts.forEach((fontFace) => {
        const family = fontFace.family?.replaceAll(/['"]/g, '').trim();
        if (!family) return;
        samples.push({
          role: 'body',
          selector: 'document.fonts',
          text: family,
          fontFamily: family,
          fontSize: 16,
          fontWeight: fontFace.weight || '400',
          lineHeight: 'normal',
          letterSpacing: 'normal',
          textTransform: 'none',
          count: 1,
          visible: false,
          source: 'document.fonts',
        });
      });
      evidence.push({ section: 'fonts', label: 'Loaded fonts inspected', source: 'document.fonts', confidence: 'Medium', details: `document.fonts reported ${document.fonts.size || 0} entries.` });
    }

    return samples;
  }

  function collectColorSamples(cssVariables) {
    const samples = [];

    const rootBg = window.getComputedStyle(document.body).backgroundColor || window.getComputedStyle(document.documentElement).backgroundColor;
    if (rootBg && parseColor(rootBg)?.a !== 0) {
      samples.push({ value: rootBg, role: 'page-bg', source: 'body background', weight: 32 });
    }

    const visibleElements = Array.from(document.querySelectorAll('body *')).filter(isVisible).slice(0, 240);
    visibleElements.forEach((el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const areaWeight = Math.max(1, (rect.width * rect.height) / 8000);
      const tag = el.tagName.toLowerCase();
      const role = roleFromElement(el);

      const bg = parseColor(style.backgroundColor);
      const text = parseColor(style.color);
      const border = parseColor(style.borderColor);
      if (bg && bg.a !== 0) {
        samples.push({ value: rgbaToHex(bg), role: role === 'button' ? 'button-bg' : role === 'nav' ? 'surface-bg' : areaWeight > 18 ? 'section-bg' : 'surface-bg', source: buildSelector(el), weight: areaWeight });
      }
      if (text && text.a !== 0) {
        samples.push({ value: rgbaToHex(text), role: role === 'link' ? 'link' : role === 'heading' ? 'heading-text' : 'text', source: buildSelector(el), weight: Math.max(1, areaWeight / 2) });
      }
      if (border && border.a !== 0 && tag !== 'svg') {
        samples.push({ value: rgbaToHex(border), role: 'border', source: buildSelector(el), weight: 1 });
      }
      if (tag === 'svg') {
        const fill = el.getAttribute('fill') || style.fill;
        const stroke = el.getAttribute('stroke') || style.stroke;
        if (fill && parseColor(fill)) samples.push({ value: rgbaToHex(parseColor(fill)), role: 'badge', source: `${buildSelector(el)} fill`, weight: 2 });
        if (stroke && parseColor(stroke)) samples.push({ value: rgbaToHex(parseColor(stroke)), role: 'border', source: `${buildSelector(el)} stroke`, weight: 1 });
      }
      if (el.matches('a[aria-current], nav .active, [class*="active" i]')) {
        const active = parseColor(style.color) || parseColor(style.backgroundColor);
        if (active) samples.push({ value: rgbaToHex(active), role: 'active-nav', source: buildSelector(el), weight: 4 });
      }
    });

    cssVariables
      .filter((entry) => /color|brand|accent|primary|secondary|bg|surface|text|border/i.test(entry.name))
      .slice(0, 40)
      .forEach((entry) => {
        samples.push({
          value: entry.value,
          role: /accent|primary|brand/i.test(entry.name) ? 'button-bg' : /text/i.test(entry.name) ? 'text' : /border/i.test(entry.name) ? 'border' : 'surface-bg',
          source: `CSS variable ${entry.name}`,
          weight: 5,
        });
      });

    return samples;
  }

  function summarizeColors(colorSamples, themeColor) {
    const groups = groupSimilarColors(colorSamples, 18);
    const byRole = (roles) => groups.filter((group) => group.items.some((item) => roles.includes(item.role)));
    const background = byRole(['page-bg', 'section-bg', 'surface-bg']).find((group) => classifyNature(group.hex) === 'light-neutral') || groups[0] || null;
    const text = byRole(['heading-text', 'text']).find((group) => classifyNature(group.hex) === 'dark-neutral') || groups.find((group) => classifyNature(group.hex) === 'dark-neutral') || null;
    const surface = byRole(['surface-bg']).filter((group) => group.hex !== background?.hex).slice(0, 2);
    let accentCandidates = groups
      .map((group) => ({ group, score: scoreAccent(group) }))
      .filter((entry) => ![background?.hex, text?.hex].includes(entry.group.hex))
      .sort((a, b) => b.score - a.score);
    if (themeColor) {
      const hex = rgbaToHex(parseColor(themeColor));
      if (hex && !accentCandidates.some((entry) => entry.group.hex === hex)) {
        accentCandidates.unshift({ group: { hex, color: parseColor(hex), items: [{ role: 'theme-color' }], weight: 10 }, score: 0.56 });
      }
    }
    const border = byRole(['border']).find((group) => group.hex !== background?.hex) || null;

    return {
      background: background ? [{ hex: background.hex, label: 'Background', confidence: 'High', source: 'visible page backgrounds' }] : [],
      surface: surface.map((group, index) => ({ hex: group.hex, label: index === 0 ? 'Surface' : `Surface ${index + 1}`, confidence: 'Medium', source: 'visible surfaces' })),
      text: text ? [{ hex: text.hex, label: 'Text', confidence: 'High', source: 'visible text' }] : [],
      accent: accentCandidates[0] ? [{ hex: accentCandidates[0].group.hex, label: 'Accent', confidence: confidenceFromScore(accentCandidates[0].score), source: 'repeated interactive color usage' }] : [],
      secondary: accentCandidates[1] ? [{ hex: accentCandidates[1].group.hex, label: 'Secondary accent', confidence: confidenceFromScore(accentCandidates[1].score), source: 'secondary interactive signal' }] : [],
      border: border ? [{ hex: border.hex, label: 'Border / muted', confidence: 'Medium', source: 'borders and dividers' }] : [],
      raw: groups.slice(0, 18).map((group) => ({ hex: group.hex, weight: group.weight, nature: classifyNature(group.hex), roles: [...new Set(group.items.map((item) => item.role))] })),
      notes: [],
    };
  }

  function summarizeLogo(candidates, brandSignals) {
    const enriched = [...candidates];
    if (brandSignals.schemaLogo?.url) {
      enriched.unshift({
        source: 'schema.org logo',
        previewUrl: brandSignals.schemaLogo.url,
        url: brandSignals.schemaLogo.url,
        visible: true,
        inHomeLink: false,
        semanticScore: 0.24,
        isVector: /\.svg($|\?)/i.test(brandSignals.schemaLogo.url),
        topLeftScore: 0.04,
        sizeScore: 0.08,
      });
    }
    if (brandSignals.ogImage?.url) {
      enriched.push({
        source: 'Open Graph image',
        previewUrl: brandSignals.ogImage.url,
        url: brandSignals.ogImage.url,
        visible: true,
        inHomeLink: false,
        semanticScore: 0.08,
        isVector: false,
        topLeftScore: 0.02,
        sizeScore: 0.04,
      });
    }
    const ranked = enriched
      .map((candidate) => {
        if (candidate.score !== undefined) return candidate;
        const scored = scoreLogoCandidate(candidate);
        return { ...candidate, score: scored.score, confidence: confidenceFromScore(scored.score), reasons: scored.reasons };
      })
      .sort((a, b) => b.score - a.score);

    return {
      candidates: ranked.slice(0, 3),
      selected: ranked[0] || null,
      confidence: ranked[0]?.confidence || 'Low',
      notes: ['Logo ranking uses visibility, top-left proximity, semantic hints, and whether the element sits inside a home link.'],
    };
  }

  const manifestIcons = await extractManifestIcons();
  const cssVariables = extractCssVariables();
  const brandSignals = extractBrandSignals(cssVariables, manifestIcons);
  const logoCandidates = collectLogoCandidates();
  const fontSamples = collectFontSamples();
  const colorSamples = collectColorSamples(cssVariables);

  evidence.push({ section: 'logos', label: 'Live DOM logo scan', source: 'current page', confidence: 'High', details: `Scanned ${logoCandidates.length} top logo candidates from live header, nav, image, and SVG elements.` });
  evidence.push({ section: 'colors', label: 'Computed style color sampling', source: 'current page', confidence: 'High', details: `Sampled ${colorSamples.length} color signals from visible elements, computed styles, and readable CSS variables.` });
  evidence.push({ section: 'fonts', label: 'Computed style font sampling', source: 'current page', confidence: 'High', details: `Sampled ${fontSamples.length} font instances from visible headings, body copy, links, buttons, and code-like elements.` });
  if (cssVariables.length) {
    evidence.push({ section: 'brand-signals', label: 'Readable CSS custom properties', source: 'current page', confidence: 'Medium', details: `Read ${cssVariables.length} CSS variables from accessible stylesheets.` });
  }

  const fonts = {
    heading: chooseFont(fontSamples, ['heading']),
    body: chooseFont(fontSamples, ['body']) || chooseFont(fontSamples, ['body', 'nav']),
    ui: chooseFont(fontSamples, ['ui', 'nav']),
    nav: chooseFont(fontSamples, ['nav']),
    mono: chooseFont(fontSamples.filter((sample) => /mono|code|courier|consolas|menlo/i.test(normalizeFontStack(sample.fontFamily))), ['mono', 'body']),
    samples: fontSamples.map((sample) => ({
      ...sample,
      confidence: confidenceFromScore(scoreFontSample(sample)),
      normalizedFamily: normalizeFontName(sample.fontFamily),
      normalizedStack: normalizeFontStack(sample.fontFamily),
    })),
  };

  const colors = summarizeColors(colorSamples, brandSignals.themeColor?.value || null);
  const logo = summarizeLogo(logoCandidates, brandSignals);

  if (!receiverWindow) warnings.push('Popup window could not be opened automatically. The bookmarklet will try a clipboard fallback.');
  if (!cssVariables.length) warnings.push('No readable CSS variables were found. Some stylesheets may be cross-origin restricted.');

  const result = {
    mode: 'current-page',
    page: {
      url: location.href,
      title: document.title,
    },
    logo,
    fonts,
    colors,
    brandSignals,
    evidence,
    blocked,
    warnings,
    exports: {},
  };

  function showFallback(json) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:24px;z-index:2147483647;background:rgba(17,24,39,0.92);color:#fff;padding:24px;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,0.4);display:flex;flex-direction:column;gap:12px;font:14px/1.5 system-ui,sans-serif;';
    overlay.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
        <strong style="font-size:16px;">Brand Identity Detector fallback</strong>
        <button type="button" id="__bid_close" style="border:0;background:#111827;color:#fff;padding:8px 12px;border-radius:10px;cursor:pointer;">Close</button>
      </div>
      <div>The result could not be posted back automatically. Copy this JSON and paste it into the app later if needed.</div>
      <textarea readonly style="width:100%;flex:1;min-height:200px;border-radius:12px;border:1px solid rgba(255,255,255,0.12);background:#0f172a;color:#fff;padding:12px;font:12px/1.4 ui-monospace, monospace;">${json.replace(/</g, '&lt;')}</textarea>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button type="button" id="__bid_copy" style="border:0;background:#2563eb;color:#fff;padding:10px 14px;border-radius:10px;cursor:pointer;">Copy JSON</button>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#__bid_close').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#__bid_copy').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(json);
        overlay.querySelector('#__bid_copy').textContent = 'Copied';
      } catch {
        const textarea = overlay.querySelector('textarea');
        textarea.focus();
        textarea.select();
      }
    });
  }

  const payload = { type: 'brand-identity-result-v1', payload: result };
  const payloadJson = JSON.stringify(result, null, 2);

  let sent = false;
  for (let i = 0; i < 12 && !sent; i += 1) {
    try {
      if (receiverWindow && !receiverWindow.closed) {
        receiverWindow.postMessage(payload, receiverOrigin === 'null' ? '*' : receiverOrigin);
        sent = true;
        break;
      }
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  if (!sent) {
    try {
      await navigator.clipboard.writeText(payloadJson);
      alert('Brand Identity Detector could not return results automatically. The JSON result was copied to your clipboard.');
    } catch {
      showFallback(payloadJson);
    }
  }

  window.__brandIdentityDetectorRunning = false;
})();
