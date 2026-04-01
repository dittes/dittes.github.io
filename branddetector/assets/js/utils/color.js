import { clamp } from './dom.js';

const NAMED = {
  transparent: { r: 0, g: 0, b: 0, a: 0 },
  black: { r: 0, g: 0, b: 0, a: 1 },
  white: { r: 255, g: 255, b: 255, a: 1 },
};

export function parseColor(input) {
  if (!input) return null;
  const value = String(input).trim().toLowerCase();
  if (NAMED[value]) return { ...NAMED[value] };

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

  const rgbMatch = value.match(/rgba?\(([^)]+)\)/);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(',').map((part) => part.trim());
    if (parts.length >= 3) {
      return {
        r: clamp(Number.parseFloat(parts[0]), 0, 255),
        g: clamp(Number.parseFloat(parts[1]), 0, 255),
        b: clamp(Number.parseFloat(parts[2]), 0, 255),
        a: parts[3] !== undefined ? clamp(Number.parseFloat(parts[3]), 0, 1) : 1,
      };
    }
  }

  return null;
}

export function rgbaToHex(color) {
  if (!color) return null;
  const toHex = (part) => Math.round(part).toString(16).padStart(2, '0');
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`.toUpperCase();
}

export function rgbToHsl({ r, g, b }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const lightness = (max + min) / 2;
  const diff = max - min;

  if (diff === 0) {
    return { h: 0, s: 0, l: lightness };
  }

  const saturation = lightness > 0.5 ? diff / (2 - max - min) : diff / (max + min);
  let hue;
  switch (max) {
    case rn:
      hue = (gn - bn) / diff + (gn < bn ? 6 : 0);
      break;
    case gn:
      hue = (bn - rn) / diff + 2;
      break;
    default:
      hue = (rn - gn) / diff + 4;
      break;
  }
  hue /= 6;
  return { h: hue * 360, s: saturation, l: lightness };
}

export function luminance({ r, g, b }) {
  const transform = (value) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * transform(r) + 0.7152 * transform(g) + 0.0722 * transform(b);
}

export function contrastRatio(colorA, colorB) {
  const l1 = luminance(colorA);
  const l2 = luminance(colorB);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function colorDistance(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

export function isTransparent(color) {
  return !color || color.a === 0;
}

export function isNearWhite(color) {
  if (!color) return false;
  return luminance(color) > 0.82 && rgbToHsl(color).s < 0.16;
}

export function isNearBlack(color) {
  if (!color) return false;
  return luminance(color) < 0.12 && rgbToHsl(color).s < 0.22;
}

export function classifyColorNature(color) {
  const hsl = rgbToHsl(color);
  const lum = luminance(color);
  if (hsl.s < 0.12) {
    if (lum > 0.8) return 'light-neutral';
    if (lum < 0.16) return 'dark-neutral';
    return 'neutral';
  }
  if (hsl.s > 0.45 && lum > 0.2 && lum < 0.8) return 'accent-like';
  return 'supporting';
}

export function blendAgainstWhite(color) {
  if (!color) return null;
  if (color.a === undefined || color.a >= 1) return color;
  return {
    r: color.r * color.a + 255 * (1 - color.a),
    g: color.g * color.a + 255 * (1 - color.a),
    b: color.b * color.a + 255 * (1 - color.a),
    a: 1,
  };
}

export function normalizeHex(input) {
  const color = parseColor(input);
  if (!color || color.a === 0) return null;
  return rgbaToHex(blendAgainstWhite(color));
}

export function groupSimilarColors(samples, threshold = 18) {
  const groups = [];
  for (const sample of samples) {
    const color = typeof sample === 'string' ? parseColor(sample) : parseColor(sample.value || sample.hex || sample.color);
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

export function sortColorsForUi(colors) {
  return [...colors].sort((a, b) => {
    const aLum = luminance(parseColor(a.hex || a.value || a));
    const bLum = luminance(parseColor(b.hex || b.value || b));
    return bLum - aLum;
  });
}

export function summarizeColor(color) {
  if (!color) return { hex: null, tone: 'unknown' };
  const parsed = typeof color === 'string' ? parseColor(color) : color;
  const hex = rgbaToHex(blendAgainstWhite(parsed));
  return { hex, tone: classifyColorNature(parsed) };
}

export function findMostContrastingColor(candidates, againstHex) {
  const against = parseColor(againstHex);
  if (!against) return null;
  let best = null;
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    const parsed = parseColor(candidate.hex || candidate.value || candidate);
    if (!parsed) continue;
    const ratio = contrastRatio(parsed, against);
    if (ratio > bestScore) {
      best = candidate;
      bestScore = ratio;
    }
  }
  return best;
}
