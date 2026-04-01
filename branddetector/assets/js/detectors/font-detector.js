import { confidenceFromScore, scoreFontSample } from '../utils/score.js';

export function normalizeFontName(fontFamily = '') {
  if (!fontFamily) return '';
  const first = fontFamily.split(',')[0] || '';
  return first.replaceAll(/['"]/g, '').trim();
}

export function normalizeFontStack(fontFamily = '') {
  return fontFamily
    .split(',')
    .map((part) => part.replaceAll(/['"]/g, '').trim())
    .filter(Boolean)
    .join(', ');
}

function choosePrimary(samples, role) {
  const scoped = samples.filter((sample) => sample.role === role || (role === 'ui' && ['ui', 'button', 'nav'].includes(sample.role)));
  if (!scoped.length) return null;

  const grouped = new Map();
  for (const sample of scoped) {
    const stack = normalizeFontStack(sample.fontFamily);
    if (!stack) continue;
    const score = scoreFontSample(sample);
    const existing = grouped.get(stack) || {
      stack,
      family: normalizeFontName(stack),
      role,
      score: 0,
      count: 0,
      examples: [],
      fontSize: sample.fontSize || null,
      weight: sample.fontWeight || null,
      lineHeight: sample.lineHeight || null,
      letterSpacing: sample.letterSpacing || null,
      textTransform: sample.textTransform || null,
      selectors: new Set(),
    };
    existing.score += score;
    existing.count += sample.count || 1;
    existing.examples.push(sample.text || sample.selector || role);
    if (sample.selector) existing.selectors.add(sample.selector);
    grouped.set(stack, existing);
  }

  const ranked = [...grouped.values()].sort((a, b) => b.score - a.score || b.count - a.count);
  const winner = ranked[0];
  if (!winner) return null;
  return {
    family: winner.family,
    stack: winner.stack,
    role,
    confidence: confidenceFromScore(Math.min(winner.score / 2, 1)),
    selectors: [...winner.selectors],
    preview: winner.examples.find(Boolean) || role,
    fontSize: winner.fontSize,
    fontWeight: winner.weight,
    lineHeight: winner.lineHeight,
    letterSpacing: winner.letterSpacing,
    textTransform: winner.textTransform,
  };
}

export function summarizeFonts(samples = []) {
  const normalizedSamples = samples
    .map((sample) => ({
      ...sample,
      normalizedStack: normalizeFontStack(sample.fontFamily || sample.stack || ''),
      normalizedFamily: normalizeFontName(sample.fontFamily || sample.stack || ''),
      confidence: sample.confidence || confidenceFromScore(scoreFontSample(sample)),
    }))
    .filter((sample) => sample.normalizedStack);

  const fonts = {
    heading: choosePrimary(normalizedSamples, 'heading'),
    body: choosePrimary(normalizedSamples, 'body'),
    ui: choosePrimary(normalizedSamples, 'ui') || choosePrimary(normalizedSamples, 'button') || choosePrimary(normalizedSamples, 'nav'),
    nav: choosePrimary(normalizedSamples, 'nav'),
    mono: choosePrimary(normalizedSamples.filter((sample) => /mono|code|courier|consolas|menlo/i.test(sample.normalizedStack)), 'mono'),
    samples: normalizedSamples,
  };

  if (!fonts.body && normalizedSamples.length) {
    fonts.body = choosePrimary(normalizedSamples, normalizedSamples[0].role || 'body');
  }

  return fonts;
}
